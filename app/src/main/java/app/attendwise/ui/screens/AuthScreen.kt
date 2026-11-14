package app.attendwise.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.attendwise.R
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.runtime.remember
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import app.attendwise.domain.time.DayPeriod
import app.attendwise.domain.time.greeting
import app.attendwise.ui.components.DayScene
import java.time.LocalTime
import app.attendwise.ui.AppViewModel
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.LoaderScene
import app.attendwise.ui.components.Ring
import app.attendwise.ui.theme.LocalStatusColors

private const val SITE = "https://priyanshudebnath.me/AttendWise/"

/** Sign in: a scene for the time of day, one big Google button, and email tucked away until it is needed. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthScreen(vm: AppViewModel, onGoogle: () -> Unit) {
    val busy by vm.authBusy.collectAsState()
    var emailOpen by rememberSaveable { mutableStateOf(false) }
    var creating by rememberSaveable { mutableStateOf(false) }
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    val period = remember { DayPeriod.of(LocalTime.now()) }
    val uri = LocalUriHandler.current
    val colors = MaterialTheme.colorScheme
    val buttonShape = RoundedCornerShape(20.dp)

    BoxWithConstraints(Modifier.fillMaxSize().systemBarsPadding().imePadding()) {
        val screenHeight = maxHeight
        Column(Modifier.heightIn(min = screenHeight).verticalScroll(rememberScrollState()).padding(horizontal = 24.dp)) {
            Box(Modifier.weight(1f).fillMaxWidth().heightIn(min = 300.dp)) {
                Row(Modifier.align(Alignment.TopStart).padding(top = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(40.dp).clip(RoundedCornerShape(13.dp)).background(Color.White), contentAlignment = Alignment.Center) {
                        Image(painterResource(R.drawable.ic_brand_mark), null, Modifier.size(32.dp))
                    }
                    Spacer(Modifier.width(10.dp))
                    Text("AttendWise", style = MaterialTheme.typography.headlineSmall)
                }
                Text(
                    "Website", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = colors.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.TopEnd).padding(top = 22.dp).clip(RoundedCornerShape(50))
                        .background(colors.surfaceContainer.copy(alpha = 0.55f)).clickable { uri.openUri(SITE) }.padding(horizontal = 12.dp, vertical = 6.dp),
                )
                DayScene(period, Modifier.align(Alignment.BottomEnd).offset(x = 14.dp, y = 10.dp).size(300.dp, 222.dp))
            }

            Text(greeting(period, null), color = colors.onSurfaceVariant, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            Text("Know which classes you can skip.", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 2.dp))
            Text(
                "Attendance, timetable and safe skips in one place. Works offline, with widgets on your home screen.",
                color = colors.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp),
            )

            Row(
                Modifier.fillMaxWidth().padding(top = 20.dp).height(58.dp)
                    .alpha(if (busy) 0.55f else 1f)
                    .shadow(6.dp, buttonShape)
                    .clip(buttonShape).background(colors.surfaceContainer).border(1.dp, colors.outlineVariant, buttonShape)
                    .clickable(enabled = !busy, onClick = onGoogle),
                horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
            ) {
                Image(painterResource(R.drawable.ic_google), null, Modifier.size(22.dp))
                Spacer(Modifier.width(12.dp))
                Text("Continue with Google", fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
            }

            if (!emailOpen) {
                TextButton(onClick = { emailOpen = true }, modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 4.dp)) {
                    Text("Use email instead", fontWeight = FontWeight.SemiBold)
                }
            } else {
                Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    HorizontalDivider(Modifier.weight(1f))
                    Text("  or with email  ", color = colors.onSurfaceVariant, fontSize = 13.sp)
                    HorizontalDivider(Modifier.weight(1f))
                }
                val modes = listOf(false to "Sign in", true to "Create account")
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    modes.forEachIndexed { i, (isNew, label) ->
                        SegmentedButton(
                            selected = creating == isNew, onClick = { creating = isNew },
                            shape = SegmentedButtonDefaults.itemShape(i, modes.size), icon = {},
                        ) { Text(label, maxLines = 1, softWrap = false) }
                    }
                }
                Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (creating) {
                        OutlinedTextField(name, { name = it }, label = { Text("Your name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    }
                    OutlinedTextField(
                        email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    )
                    OutlinedTextField(
                        password, { password = it }, label = { Text("Password") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        supportingText = { if (creating) Text("At least 6 characters") },
                    )
                    Button(
                        onClick = { if (creating) vm.signUp(email, password, name) else vm.signIn(email, password) },
                        enabled = !busy && email.contains('@') && password.length >= 6,
                        modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(16.dp),
                    ) {
                        if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = colors.onPrimary)
                        else Text(if (creating) "Create account" else "Sign in", fontWeight = FontWeight.SemiBold)
                    }
                    if (!creating) {
                        TextButton(
                            onClick = { vm.resetPassword(email) }, enabled = email.contains('@') && !busy,
                            modifier = Modifier.align(Alignment.CenterHorizontally),
                        ) { Text("Forgot password?") }
                    }
                }
            }

            val link = TextLinkStyles(SpanStyle(color = colors.primary, textDecoration = TextDecoration.Underline))
            Text(
                buildAnnotatedString {
                    append("By continuing you agree to the ")
                    withLink(LinkAnnotation.Url(SITE + "terms.html", link)) { append("terms") }
                    append(" and the ")
                    withLink(LinkAnnotation.Url(SITE + "privacy.html", link)) { append("privacy policy") }
                    append(".")
                },
                fontSize = 12.sp, color = colors.onSurfaceVariant, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 16.dp),
            )
        }
    }
}

@Composable
fun LoadingScreen(text: String, onRetry: (() -> Unit)? = null, onContinue: (() -> Unit)? = null) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (onRetry == null) LoaderScene()
        Spacer(Modifier.height(16.dp))
        Text(text, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        if (onRetry != null) {
            Spacer(Modifier.height(16.dp))
            Button(onClick = onRetry) { Text("Try again") }
        }
        if (onContinue != null) TextButton(onClick = onContinue) { Text("Continue offline") }
    }
}
