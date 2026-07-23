import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted Inter (variable woff2, bundled + service-worker cached) instead of
// the render-blocking Google Fonts CDN -- one same-origin file, no third-party
// DNS/TLS handshake on the launch critical path.
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
