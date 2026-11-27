import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import PWABadge from './PWABadge';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PWABadge />
  </StrictMode>
);