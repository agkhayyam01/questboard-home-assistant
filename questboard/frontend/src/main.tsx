import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import FridayBunnyPrototype from './FridayBunnyPrototype.tsx'

const isFridayPrototypeRoute = () => {
  const path = window.location.pathname.toLowerCase()
  if (path.includes('/prototype/friday-bunny')) return true
  const search = new URLSearchParams(window.location.search)
  return search.get('prototype') === 'friday-bunny'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isFridayPrototypeRoute() ? <FridayBunnyPrototype /> : <App />}
  </StrictMode>,
)
