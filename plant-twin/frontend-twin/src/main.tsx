import { createRoot } from 'react-dom/client';
import App from './App';
import { clearLegacyStorage } from './storage/settings';
import { initTheme } from './ui/Header';
import './styles.css';

clearLegacyStorage();
initTheme();
createRoot(document.getElementById('root')!).render(
  <App />,
);
