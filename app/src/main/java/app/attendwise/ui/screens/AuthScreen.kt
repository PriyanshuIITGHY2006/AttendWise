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
import app.attendwise.ui.AppViewModel
import app.attendwise.ui.components.AppIcon
import app.attendwise.ui.components.Ring
import app.attendwise.ui.theme.LocalStatusColors

@Composable
fun AuthScreen(vm: AppViewModel, onGoogle: () -> Unit) {
    val busy by vm.authBusy.collectAsState()
    var creating by rememberSaveable { mutableStateOf(false) }
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    val c = LocalStatusColors.current

    Column(
        Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = RoundedCornerShape(13.dp), color = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp)) {
                Box(contentAlignment = Alignment.Center) { AppIcon(R.drawable.ic_check, null, tint = MaterialTheme.colorScheme.onPrimary) }
            }
            Spacer(Modifier.size(10.dp))
            Text("AttendWise", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
            Ring(85.0, MaterialTheme.colorScheme.primary, 200.dp, 20.dp, thresholdPercent = 75) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("85%", fontSize = 44.sp, fontWeight = FontWeight.Bold)
                    Text("7 safe skips", color = c.safeFg, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Text("Know exactly how many classes you can skip.", style = MaterialTheme.typography.headlineMedium)
        Text(
            "Attendance, timetable and safe skips in one place. Works offline, with widgets on your home screen.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        OutlinedButton(onClick = onGoogle, enabled = !busy, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(16.dp)) {
            Text("Continue with Google", fontWeight = FontWeight.SemiBold)
        }
        Text("or with email", modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
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
            if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
            else Text(if (creating) "Create account" else "Sign in", fontWeight = FontWeight.SemiBold)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { creating = !creating }) { Text(if (creating) "I have an account" else "Create an account") }
            if (!creating) TextButton(onClick = { vm.resetPassword(email) }, enabled = email.contains('@') && !busy) { Text("Forgot password?") }
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
        if (onRetry == null) CircularProgressIndicator()
        Spacer(Modifier.height(16.dp))
        Text(text, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        if (onRetry != null) {
            Spacer(Modifier.height(16.dp))
            Button(onClick = onRetry) { Text("Try again") }
        }
        if (onContinue != null) TextButton(onClick = onContinue) { Text("Continue offline") }
    }
}
