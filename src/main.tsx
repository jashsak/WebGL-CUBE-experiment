import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import MaskPage from './MaskPage.tsx'

const isMaskPage = window.location.pathname.includes('/mask') || window.location.search.includes('page=mask') || window.location.hash.includes('mask');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isMaskPage ? <MaskPage /> : <App />}
  </React.StrictMode>,
)
