import { createContext, useContext } from "react"

// True once it's safe for page content to animate into view -- false while
// the welcome splash is still covering the screen, so cards don't finish
// their entrance transition before anyone can see it.
const RevealContext = createContext(true)

export const RevealProvider = RevealContext.Provider

export function useReveal() {
  return useContext(RevealContext)
}
