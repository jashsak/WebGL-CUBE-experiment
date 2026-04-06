import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import MaskPage from './MaskPage.tsx'
import BunnyPage from './BunnyPage.tsx'

// Support path (/bunny), query (?page=bunny), hash (#bunny), and SPA redirect (?p=/bunny)
const loc = window.location;
const redirectPath = new URLSearchParams(loc.search).get('p') || '';
const isMaskPage = loc.pathname.includes('/mask') || loc.search.includes('page=mask') || loc.hash.includes('mask') || redirectPath.includes('/mask');
const isBunnyPage = loc.pathname.includes('/bunny') || loc.search.includes('page=bunny') || loc.hash.includes('bunny') || redirectPath.includes('/bunny');

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
