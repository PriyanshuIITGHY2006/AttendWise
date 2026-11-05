package app.attendwise.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.YearMonth

/** A Monday-first month grid. [cell] gets null for padding days outside the month. */
@Composable
fun MonthGrid(month: YearMonth, modifier: Modifier = Modifier, cell: @Composable (LocalDate?, Modifier) -> Unit) {
    val first = month.atDay(1)
    val lead = first.dayOfWeek.value - 1
    val days = month.lengthOfMonth()
    val cells = List(lead) { null } + (1..days).map { month.atDay(it) }
    val rows = cells.chunked(7)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth()) {
            listOf("M", "T", "W", "T", "F", "S", "S").forEach {
                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    Text(it, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        rows.forEach { week ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                (0 until 7).forEach { i -> cell(week.getOrNull(i), Modifier.weight(1f)) }
            }
        }
    }
}
