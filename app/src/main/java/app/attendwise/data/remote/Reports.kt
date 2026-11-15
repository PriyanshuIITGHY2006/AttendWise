package app.attendwise.data.remote

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException
import java.util.UUID

class ReportFile(val name: String, val bytes: ByteArray)

class ReportDraft(
    val kind: String,
    val area: String?,
    val message: String,
    val device: JsonObject?,
    val version: String,
    val name: String,
    val email: String,
    val files: List<ReportFile>,
)

const val REPORT_BUCKET = "report-files"

/**
 * Sends a report: screenshots first, then the report, then one row per screenshot.
 * Returns a message for the person if something went wrong, or null when everything was sent.
 */
suspend fun SupabaseClient.sendReport(draft: ReportDraft, onProgress: (done: Int, total: Int) -> Unit): String? {
    val uid = userId ?: return "You are signed out. Sign in and try again."
    val reportId = UUID.randomUUID().toString()
    val total = draft.files.size + 1
    var done = 0
    val uploaded = mutableListOf<JsonObject>()
    try {
        draft.files.forEachIndexed { i, f ->
            val path = "$uid/$reportId/${i + 1}.jpg"
            upload(REPORT_BUCKET, path, f.bytes, "image/jpeg")
            uploaded += buildJsonObject {
                put("report_id", reportId)
                put("path", path)
                put("name", f.name)
                put("mime", "image/jpeg")
                put("size_bytes", f.bytes.size)
            }
            done += 1
            onProgress(done, total)
        }
        insert("reports", listOf(buildJsonObject {
            put("id", reportId)
            put("kind", draft.kind)
            put("area", draft.area)
            put("message", draft.message.trim())
            put("platform", "android")
            put("app_version", draft.version)
            if (draft.device != null) put("device", draft.device)
            put("reporter_name", draft.name.ifBlank { null })
            put("reporter_email", draft.email.ifBlank { null })
        }))
        if (uploaded.isNotEmpty()) insert("report_files", uploaded)
        onProgress(total, total)
        return null
    } catch (e: ApiException) {
        return if (e.message?.contains("Too many") == true) "You have sent a lot of reports today. Please try again tomorrow."
        else "It did not send (${e.message}). Your text is kept, try again."
    } catch (e: IOException) {
        return "No connection. Your text is kept, try again when you are online."
    }
}
