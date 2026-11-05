package app.attendwise.data.remote

import android.content.Context
import android.net.Uri
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.TimeUnit

/** Public project settings. The publishable key is meant to ship in apps; row level security protects the data. */
object SupabaseConfig {
    const val URL = "https://jlueyxbqknnmcoesgnmg.supabase.co"
    const val KEY = "sb_publishable_Dynr916H7nm1M3YcjPfRMg_HP5OQuET"
    const val SCHEMA = "v2"
    const val REDIRECT = "in.ac.iitg.attendwise://auth-callback"
}

class ApiException(val code: Int, message: String) : IOException(message)

@Serializable
data class Session(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_at") val expiresAt: Long = 0,
    @SerialName("expires_in") val expiresIn: Long = 3600,
    val user: SessionUser,
)

@Serializable
data class SessionUser(
    val id: String,
    val email: String? = null,
    @SerialName("user_metadata") val metadata: JsonObject? = null,
) {
    val displayName: String?
        get() = metadata?.let { m ->
            (m["full_name"] ?: m["name"])?.jsonPrimitive?.content
        }
}

/** What a sign-up returned: a session, or a request to confirm the email first. */
sealed interface SignUpResult {
    data class SignedIn(val session: Session) : SignUpResult
    data object ConfirmEmail : SignUpResult
}

/**
 * A small client for Supabase Auth and the REST API. Persists the session in
 * app-private storage and refreshes the access token before it expires.
 */
class SupabaseClient(context: Context) {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }
    private val prefs = context.getSharedPreferences("auth", Context.MODE_PRIVATE)
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val refreshLock = Mutex()
    private val jsonType = "application/json".toMediaType()

    private val _session = MutableStateFlow(loadSession())
    val session: StateFlow<Session?> = _session

    val userId: String? get() = _session.value?.user?.id

    // Auth -------------------------------------------------------------------

    suspend fun signInWithPassword(email: String, password: String): Session {
        val body = buildJsonObject { put("email", email.trim()); put("password", password) }
        return saveSession(authPost("token?grant_type=password", body))
    }

    suspend fun signUp(email: String, password: String, name: String?): SignUpResult {
        val body = buildJsonObject {
            put("email", email.trim())
            put("password", password)
            if (!name.isNullOrBlank()) put("data", buildJsonObject { put("full_name", name.trim()) })
        }
        val result = authPost("signup", body)
        return if (result.containsKey("access_token")) SignUpResult.SignedIn(saveSession(result)) else SignUpResult.ConfirmEmail
    }

    suspend fun sendPasswordReset(email: String) {
        authPost("recover", buildJsonObject { put("email", email.trim()) })
    }

    /** Starts Google sign-in: returns the URL to open in a browser tab. The verifier is kept for [completeOAuth]. */
    fun googleSignInUrl(): Uri {
        val verifier = randomUrlSafe(48)
        prefs.edit().putString("pkce_verifier", verifier).apply()
        val challenge = base64Url(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        return Uri.parse("${SupabaseConfig.URL}/auth/v1/authorize").buildUpon()
            .appendQueryParameter("provider", "google")
            .appendQueryParameter("redirect_to", SupabaseConfig.REDIRECT)
            .appendQueryParameter("code_challenge", challenge)
            .appendQueryParameter("code_challenge_method", "s256")
            .build()
    }

    /** Finishes Google sign-in from the redirect deep link. */
    suspend fun completeOAuth(callback: Uri): Session {
        callback.getQueryParameter("error_description")?.let { throw ApiException(400, it) }
        val code = callback.getQueryParameter("code") ?: throw ApiException(400, "Sign-in was cancelled")
        val verifier = prefs.getString("pkce_verifier", null) ?: throw ApiException(400, "Sign-in expired, try again")
        val body = buildJsonObject { put("auth_code", code); put("code_verifier", verifier) }
        val session = saveSession(authPost("token?grant_type=pkce", body))
        prefs.edit().remove("pkce_verifier").apply()
        return session
    }

    suspend fun signOut() {
        val token = _session.value?.accessToken
        clearSession()
        if (token != null) {
            runCatching {
                withContext(Dispatchers.IO) {
                    http.newCall(
                        Request.Builder().url("${SupabaseConfig.URL}/auth/v1/logout")
                            .header("apikey", SupabaseConfig.KEY)
                            .header("Authorization", "Bearer $token")
                            .post(ByteArray(0).toRequestBody(null))
                            .build(),
                    ).execute().close()
                }
            }
        }
    }

    // REST -------------------------------------------------------------------

    /** GET rows from a v2 table. [params] are PostgREST query parameters. */
    suspend fun select(table: String, params: Map<String, String>): JsonArray {
        val url = restUrl(table) { b -> params.forEach { (k, v) -> b.addQueryParameter(k, v) } }
        val text = authorized { token ->
            Request.Builder().url(url)
                .header("Accept-Profile", SupabaseConfig.SCHEMA)
                .bearer(token)
                .get()
                .build()
        }
        return json.parseToJsonElement(text) as JsonArray
    }

    /** Insert-or-update rows, resolving conflicts on [onConflict]. */
    suspend fun upsert(table: String, rows: List<JsonObject>, onConflict: String) {
        if (rows.isEmpty()) return
        val url = restUrl(table) { it.addQueryParameter("on_conflict", onConflict) }
        val payload = JsonArray(rows).toString().toRequestBody(jsonType)
        authorized { token ->
            Request.Builder().url(url)
                .header("Content-Profile", SupabaseConfig.SCHEMA)
                .header("Prefer", "resolution=merge-duplicates,return=minimal")
                .bearer(token)
                .post(payload)
                .build()
        }
    }

    // Internals --------------------------------------------------------------

    private fun restUrl(table: String, extra: (HttpUrl.Builder) -> Unit): HttpUrl =
        "${SupabaseConfig.URL}/rest/v1/$table".toHttpUrl().newBuilder().also(extra).build()

    private fun Request.Builder.bearer(token: String?): Request.Builder {
        header("apikey", SupabaseConfig.KEY)
        if (token != null) header("Authorization", "Bearer $token")
        return this
    }

    /** Runs a request with a fresh access token, retrying once after a refresh on 401. */
    private suspend fun authorized(build: (String?) -> Request): String {
        val token = validAccessToken()
        try {
            return execute(build(token))
        } catch (e: ApiException) {
            if (e.code != 401 || _session.value == null) throw e
            val refreshed = refresh(force = true)
            return execute(build(refreshed))
        }
    }

    private suspend fun validAccessToken(): String? {
        val s = _session.value ?: return null
        val now = System.currentTimeMillis() / 1000
        return if (s.expiresAt - now > 60) s.accessToken else refresh(force = false)
    }

    private suspend fun refresh(force: Boolean): String? = refreshLock.withLock {
        val s = _session.value ?: return null
        val now = System.currentTimeMillis() / 1000
        if (!force && s.expiresAt - now > 60) return s.accessToken
        try {
            val result = authPost("token?grant_type=refresh_token", buildJsonObject { put("refresh_token", s.refreshToken) })
            saveSession(result).accessToken
        } catch (e: ApiException) {
            // A rejected refresh token means the session is gone for good.
            if (e.code in 400..499) clearSession()
            throw e
        }
    }

    private suspend fun authPost(path: String, body: JsonObject): JsonObject {
        val request = Request.Builder().url("${SupabaseConfig.URL}/auth/v1/$path")
            .header("apikey", SupabaseConfig.KEY)
            .post(body.toString().toRequestBody(jsonType))
            .build()
        val text = execute(request)
        return if (text.isBlank()) JsonObject(emptyMap()) else json.parseToJsonElement(text).jsonObject
    }

    private suspend fun execute(request: Request): String = withContext(Dispatchers.IO) {
        http.newCall(request).execute().use { response ->
            val text = response.body.string()
            if (!response.isSuccessful) throw ApiException(response.code, errorMessage(text, response.code))
            text
        }
    }

    private fun errorMessage(text: String, code: Int): String {
        val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()
        val msg = listOf("msg", "message", "error_description", "error")
            .firstNotNullOfOrNull { k -> obj?.get(k)?.let { e: JsonElement -> runCatching { e.jsonPrimitive.content }.getOrNull() } }
        return msg ?: "Request failed ($code)"
    }

    private fun saveSession(obj: JsonObject): Session {
        var s = json.decodeFromJsonElement(Session.serializer(), obj)
        if (s.expiresAt == 0L) s = s.copy(expiresAt = System.currentTimeMillis() / 1000 + s.expiresIn)
        prefs.edit().putString("session", json.encodeToString(Session.serializer(), s)).apply()
        _session.value = s
        return s
    }

    private fun clearSession() {
        prefs.edit().remove("session").apply()
        _session.value = null
    }

    private fun loadSession(): Session? =
        prefs.getString("session", null)?.let { runCatching { json.decodeFromString(Session.serializer(), it) }.getOrNull() }

    private fun randomUrlSafe(bytes: Int): String = base64Url(ByteArray(bytes).also { SecureRandom().nextBytes(it) })

    private fun base64Url(data: ByteArray): String =
        Base64.encodeToString(data, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}
