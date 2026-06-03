import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './energy-bar.css'
import './compact-viewport.css'
import './my-goals.css'
import './crm.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
