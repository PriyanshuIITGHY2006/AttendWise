package app.attendwise.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request

/** A newer build on GitHub Releases. */
data class Update(val build: Int, val pageUrl: String)

/** The app is sideloaded, so it checks GitHub Releases for newer builds itself. */
object UpdateChecker {
    private const val RELEASES = "https://api.github.com/repos/PriyanshuIITGHY2006/AttendWise/releases?per_page=5"
    private val http = OkHttpClient()

    suspend fun check(currentBuild: Long): Update? = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(RELEASES).header("Accept", "application/vnd.github+json").build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return@withContext null
            val releases = Json.parseToJsonElement(response.body.string()) as JsonArray
            releases.mapNotNull { r ->
                val o = r.jsonObject
                val tag = o["tag_name"]?.jsonPrimitive?.content ?: return@mapNotNull null
                val build = Regex("""v2-build-(\d+)""").find(tag)?.groupValues?.get(1)?.toIntOrNull() ?: return@mapNotNull null
                Update(build, o["html_url"]?.jsonPrimitive?.content ?: return@mapNotNull null)
            }.maxByOrNull { it.build }?.takeIf { it.build > currentBuild }
        }
    }
}
