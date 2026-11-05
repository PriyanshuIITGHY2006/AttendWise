package app.attendwise.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidgetManager
import app.attendwise.domain.model.Course
import app.attendwise.graph
import app.attendwise.ui.theme.AttendWiseTheme
import kotlinx.coroutines.launch

/** Lets the student pick which course a "Course ring" widget shows. */
class CourseRingConfigActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val widgetId = appWidgetIdFrom(intent)
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        setContent {
            AttendWiseTheme {
                var courses by remember { mutableStateOf<List<Course>>(emptyList()) }
                val scope = rememberCoroutineScope()
                LaunchedEffect(Unit) { courses = graph.repo.snapshot().activeCourses }
                Surface(modifier = Modifier.fillMaxSize()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Show which course?", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 12.dp))
                        if (courses.isEmpty()) Text("Add courses in AttendWise first.")
                        LazyColumn {
                            items(courses, key = { it.id }) { course ->
                                Text(
                                    "${course.code}  ${course.name}",
                                    style = MaterialTheme.typography.bodyLarge,
                                    modifier = Modifier.fillMaxWidth().clickable {
                                        scope.launch {
                                            save(this@CourseRingConfigActivity, widgetId, course.id)
                                            runCatching {
                                                val glanceId = GlanceAppWidgetManager(this@CourseRingConfigActivity).getGlanceIdBy(widgetId)
                                                CourseRingWidget().update(this@CourseRingConfigActivity, glanceId)
                                            }
                                            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
                                            finish()
                                        }
                                    }.padding(vertical = 16.dp),
                                )
                                HorizontalDivider()
                            }
                        }
                    }
                }
            }
        }
    }

    companion object {
        private fun prefs(context: Context) = context.getSharedPreferences("ring_widgets", Context.MODE_PRIVATE)

        fun save(context: Context, widgetId: Int, courseId: String) =
            prefs(context).edit().putString(widgetId.toString(), courseId).apply()

        fun courseFor(context: Context, widgetId: Int): String? = prefs(context).getString(widgetId.toString(), null)
    }
}
