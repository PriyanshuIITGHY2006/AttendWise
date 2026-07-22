import { useEffect } from "react"
import { Capacitor } from "@capacitor/core"
import { PushNotifications, type Token } from "@capacitor/push-notifications"
import { supabase } from "../../lib/supabase"

const NATIVE = () => Capacitor.isNativePlatform()

/**
 * Registers this device for FCM push and stores its token against the user, so
 * the server (the attendance-push Edge Function) can reach them while the app is
 * closed. No-ops off native or when push permission is denied. Returns a cleanup
 * that removes the listeners.
 */
export async function registerPush(userId: string): Promise<() => void> {
  if (!NATIVE()) return () => {}

  const perm = await PushNotifications.checkPermissions()
  let status = perm.receive
  if (status === "prompt" || status === "prompt-with-rationale") {
    status = (await PushNotifications.requestPermissions()).receive
  }
  if (status !== "granted") return () => {}

  const regHandle = await PushNotifications.addListener("registration", async (token: Token) => {
    await supabase.from("device_tokens").upsert(
      {
        user_id: userId,
        token: token.value,
        platform: Capacitor.getPlatform(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,token" },
    )
  })

  const errHandle = await PushNotifications.addListener("registrationError", (err) => {
    console.error("push registration error", err)
  })

  // Kicks off registration; the "registration" listener above receives the token.
  await PushNotifications.register()

  return () => {
    regHandle.remove()
    errHandle.remove()
  }
}

/** Hook wrapper: registers for push once a user id is available. */
export function usePushRegistration(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    let cleanup: (() => void) | undefined
    registerPush(userId).then((fn) => {
      cleanup = fn
    })
    return () => cleanup?.()
  }, [userId])
}
