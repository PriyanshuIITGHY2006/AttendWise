package app.attendwise.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private const val LONG_EDGE = 1600
private const val THUMB_EDGE = 320
private const val MAX_BYTES = 5 * 1024 * 1024

/** A screenshot ready to send: shrunk to at most 1600 px on its long side and saved as JPEG. */
class PickedImage(val bytes: ByteArray, val thumb: ImageBitmap)

suspend fun prepareReportImage(context: Context, uri: Uri): PickedImage? = withContext(Dispatchers.IO) {
    try {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return@withContext null
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= LONG_EDGE) sample *= 2
        val decoded = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return@withContext null
        val scale = min(1f, LONG_EDGE.toFloat() / max(decoded.width, decoded.height))
        val image = if (scale < 1f) {
            Bitmap.createScaledBitmap(decoded, (decoded.width * scale).roundToInt().coerceAtLeast(1), (decoded.height * scale).roundToInt().coerceAtLeast(1), true)
        } else decoded
        val out = ByteArrayOutputStream()
        image.compress(Bitmap.CompressFormat.JPEG, 85, out)
        val bytes = out.toByteArray()
        if (bytes.size > MAX_BYTES) return@withContext null
        val ts = min(1f, THUMB_EDGE.toFloat() / max(image.width, image.height))
        val thumb = Bitmap.createScaledBitmap(image, (image.width * ts).roundToInt().coerceAtLeast(1), (image.height * ts).roundToInt().coerceAtLeast(1), true)
        PickedImage(bytes, thumb.asImageBitmap())
    } catch (e: Exception) {
        null
    } catch (e: OutOfMemoryError) {
        null
    }
}
