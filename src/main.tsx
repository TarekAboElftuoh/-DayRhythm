import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { completePermanentLinkIfReturning } from './services/googleOfflineAccess';
import { applyFreshAccessToken } from './services/googleCalendarAuth';
// Fonts ship inside the app (work offline and don't block the first paint on a slow network).
import '@fontsource/cairo/arabic-400.css';
import '@fontsource/cairo/latin-400.css';
import '@fontsource/cairo/arabic-500.css';
import '@fontsource/cairo/latin-500.css';
import '@fontsource/cairo/arabic-600.css';
import '@fontsource/cairo/latin-600.css';
import '@fontsource/cairo/arabic-700.css';
import '@fontsource/cairo/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './index.css';

async function boot() {
  // Finish the "permanent Google link" redirect (if we're coming back from Google) before the app reads tokens.
  const linkResult = await completePermanentLinkIfReturning().catch(() => null);
  if (linkResult?.ok && linkResult.token && linkResult.uid) {
    applyFreshAccessToken(linkResult.uid, linkResult.token.accessToken, linkResult.token.expiresInSec);
  }
  if (linkResult) {
    (window as Window & { __dayRhythmPermanentLinkResult?: unknown }).__dayRhythmPermanentLinkResult = linkResult;
  }

  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

void boot();
