import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { useWorkspace } from './store/workspace.js';
import { useEditor } from './store/editor.js';
import './app.css';

useEditor.getState().setStatus('Baking sprites…');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Restore a stored workspace handle if any; never requests permission.
void useWorkspace.getState().init();
