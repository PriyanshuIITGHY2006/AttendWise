import { useEffect, useState } from "react"

export function WelcomeSplash({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1700)
    const doneTimer = setTimeout(onDone, 2200)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [onDone])

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
