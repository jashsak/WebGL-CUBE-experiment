import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import MaskPage from './MaskPage.tsx'
import BunnyPage from './BunnyPage.tsx'

const isMaskPage = window.location.pathname.includes('/mask') || window.location.search.includes('page=mask') || window.location.hash.includes('mask');
const isBunnyPage = window.location.pathname.includes('/bunny') || window.location.search.includes('page=bunny') || window.location.hash.includes('bunny');

function getPage() {
  if (isBunnyPage) return <BunnyPage />;
  if (isMaskPage) return <MaskPage />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {getPage()}
  </React.StrictMode>,
)
