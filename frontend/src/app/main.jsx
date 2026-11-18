// Entry point of the /app/ page (issue #159).
// Mounts the StudyBoard React app into the empty #root div of app/index.html.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// StrictMode adds extra checks during npm run dev; it changes nothing in the built app.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);