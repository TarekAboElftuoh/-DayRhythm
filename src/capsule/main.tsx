import { createRoot } from 'react-dom/client';
import '@fontsource/cairo/arabic-600.css';
import '@fontsource/cairo/arabic-700.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '../index.css';
import { DesktopCapsule } from './DesktopCapsule';

createRoot(document.getElementById('capsule-root')!).render(<DesktopCapsule />);
