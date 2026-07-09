import { useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { MicrosoftButton } from "../ui/MicrosoftButton"
import { GoogleButton } from "../ui/GoogleButton"

export function OAuthButtons({ onError }: { onError: (message: string) => void }) {
  const { signInWithMicrosoft, signInWithGoogle } = useAuth()
  const [pendingProvider, setPendingProvider] = useState<"microsoft" | "google" | null>(null)

  async function handle(provider: "microsoft" | "google") {
    setPendingProvider(provider)
    onError("")
    const { error } = provider === "microsoft" ? await signInWithMicrosoft() : await signInWithGoogle()
    if (error) {
      onError(error)
      setPendingProvider(null)
    }
    // on success the browser redirects away, so no need to reset pendingProvider
  }

  return (
    <div className="space-y-2.5">
      <MicrosoftButton onClick={() => handle("microsoft")} disabled={pendingProvider !== null} />
      <GoogleButton onClick={() => handle("google")} disabled={pendingProvider !== null} />
    </div>
  )
}
