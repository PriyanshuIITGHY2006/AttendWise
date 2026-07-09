import { useEffect, useState } from "react"

const FLAG_KEY = "attendwise_just_signed_in"

export function WelcomeSplash() {
  const [visible, setVisible] = useState(() => sessionStorage.getItem(FLAG_KEY) === "1")
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (!visible) return
    sessionStorage.removeItem(FLAG_KEY)
    const fadeTimer = setTimeout(() => setFading(true), 1900)
    const hideTimer = setTimeout(() => setVisible(false), 2500)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(hideTimer)
    }
  }, [visible])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950 px-6 text-center transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <p className="text-base text-neutral-400">Hey there, fellow IITian!</p>
      <h1 className="mt-3 max-w-md text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        This is <span className="text-indigo-400">AttendWise</span>, your bunkmate.
      </h1>
      <p className="mt-3 text-neutral-400">Bunk but wisely.</p>
    </div>
  )
}
