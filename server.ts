import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PORT, corsMiddleware } from './server/config';
import { attachWebSocketServer, syncRooms } from './server/socketHandler';
import { registerGeminiRoutes } from './server/geminiRoutes';
import { registerCalendarRoutes } from './server/calendarRoutes';

export type {
  CalendarActionProposal,
  TaskActionProposal,
  MedicationActionProposal,
  CreativeActivityActionProposal,
  MemoryActionProposal,
} from './server/config';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(corsMiddleware);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      wsSyncRooms: syncRooms.size,
      serverTimeIso: new Date().toISOString(),
    });
  });

  registerCalendarRoutes(app);
  const chatBridge = registerGeminiRoutes(app);

  const httpServer = http.createServer(app);

  // Real-Time Cross-Device Sync + Ultra-Low-Latency Gemini Chat WebSocket Hub (/ws/sync)
  // Disable perMessageDeflate + enable TCP_NODELAY so chat token deltas flush immediately with zero buffering delay
  attachWebSocketServer(httpServer, chatBridge);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    if (process.env.DISABLE_HMR === 'true') {
      const NO_HMR_VITE_CLIENT = `
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]').forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
}
export class ErrorOverlay extends HTMLElement {}
`.trim();

      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(NO_HMR_VITE_CLIENT);
      });
    }

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`DayRhythm server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DayRhythm server:', err);
  process.exit(1);
});
