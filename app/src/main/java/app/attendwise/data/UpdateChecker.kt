package app.attendwise.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** A newer build on GitHub Releases, with the APK that fits this install. */
data class Update(val build: Int, val apkUrl: String, val sizeBytes: Long)

/**
 * The app is sideloaded, so it updates itself: it finds a newer build on GitHub
 * Releases, downloads the matching APK into its own storage and hands it to the
 * system installer, which installs it over the running app.
 */
object UpdateChecker {
    private const val RELEASES = "https://api.github.com/repos/PriyanshuIITGHY2006/AttendWise/releases?per_page=10"
    private val http = OkHttpClient.Builder().readTimeout(60, TimeUnit.SECONDS).build()

    /** Test builds update from the test APK, the real app from the signed one. */
    private fun assetPattern(context: Context) =
        if (context.packageName.endsWith(".debug")) Regex("""AttendWise-test-\d+\.apk""") else Regex("""AttendWise-\d+\.apk""")

    suspend fun check(context: Context, currentBuild: Long): Update? = withContext(Dispatchers.IO) {
        val pattern = assetPattern(context)
        val request = Request.Builder().url(RELEASES).header("Accept", "application/vnd.github+json").build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("GitHub answered ${response.code}")
            val releases = Json.parseToJsonElement(response.body.string()) as JsonArray
            releases.mapNotNull { r ->
                val o = r.jsonObject
                val tag = o["tag_name"]?.jsonPrimitive?.content ?: return@mapNotNull null
                val build = Regex("""v2-build-(\d+)""").find(tag)?.groupValues?.get(1)?.toIntOrNull() ?: return@mapNotNull null
                val asset = (o["assets"] as? JsonArray)?.map { it.jsonObject }
                    ?.firstOrNull { pattern.matches(it["name"]?.jsonPrimitive?.content ?: "") } ?: return@mapNotNull null
                Update(
                    build,
                    asset["browser_download_url"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                    asset["size"]?.jsonPrimitive?.longOrNull ?: 0L,
                )
            }.maxByOrNull { it.build }?.takeIf { it.build > currentBuild }
        }
    }

    /** Downloads the APK, reporting progress from 0 to 1. */
    suspend fun download(context: Context, update: Update, onProgress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val dir = File(context.cacheDir, "updates").apply { deleteRecursively(); mkdirs() }
        val part = File(dir, "update.part")
        val apk = File(dir, "AttendWise-${update.build}.apk")
        http.newCall(Request.Builder().url(update.apkUrl).build()).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Download failed (${response.code})")
            val total = response.body.contentLength().takeIf { it > 0 } ?: update.sizeBytes
            response.body.byteStream().use { input ->
                part.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    var done = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        if (total > 0) onProgress((done.toFloat() / total).coerceIn(0f, 1f))
                    }
                }
            }
        }
        if (!part.renameTo(apk)) throw IOException("Couldn't save the update")
        apk
    }

    /** True when Android still needs the user to allow installs from this app. */
    fun needsInstallPermission(context: Context): Boolean =
        Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()

    fun openInstallPermission(context: Context) {
        context.startActivity(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    /** Opens the system install prompt for a downloaded APK. */
    fun install(context: Context, apk: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", apk)
        context.startActivity(
            Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
