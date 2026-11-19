const { app, BrowserWindow, Menu, Tray, nativeImage, session, shell } = require('electron');
const path = require('path');

const APP_URL =
  process.env.DAYRHYTHM_APP_URL ||
  'https://ais-pre-nldzeytdlkfysmfvrz4pkn-146281240493.europe-west2.run.app';
const APP_ORIGIN = new URL(APP_URL).origin;
const APP_HOST = new URL(APP_URL).hostname;
const PARTITION = 'persist:dayrhythm';

let mainWindow = null;
let tray = null;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function isAuthOrAppUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return (
      host === APP_HOST.toLowerCase() ||
      host === 'accounts.google.com' ||
      host.endsWith('.google.com') ||
      host.endsWith('.googleapis.com') ||
      host.endsWith('.firebaseapp.com') ||
      host.endsWith('.web.app') ||
      host.endsWith('.gstatic.com')
    );
  } catch {
    return false;
  }
}

function getIconPath() {
  return path.join(__dirname, 'build', 'icon.png');
}

function setupPermissions() {
  const ses = session.fromPartition(PARTITION);
  const allowedPermissions = new Set([
    'notifications',
    'geolocation',
    'media',
    'audioCapture',
    'clipboard-read',
    'clipboard-sanitized-write',
  ]);

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    try {
      const currentUrl = webContents.getURL();
      const trusted = currentUrl.startsWith(APP_ORIGIN);
      callback(trusted && allowedPermissions.has(permission));
    } catch {
      callback(false);
    }
  });
}

function createTray() {
  try {
    const icon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('إيقاع اليوم | DayRhythm');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'فتح إيقاع اليوم',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: 'تحديث التطبيق',
        click: () => {
          if (mainWindow) mainWindow.reload();
        },
      },
      { type: 'separator' },
      {
        label: 'خروج نهائي',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    });
  } catch {
    // Tray icon optional on headless/unusual desktop environments
  }
}

function loadOfflineFallback(win) {
  const html = `<!doctype html>
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <title>إيقاع اليوم | غير متصل</title>
      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
          color: #f4f4f5;
          font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
          text-align: center;
          padding: 24px;
        }
        .card {
          max-width: 400px;
          background: #111113;
          border: 1px solid #27272a;
          border-radius: 20px;
          padding: 28px;
        }
        h1 { font-size: 20px; margin: 0 0 10px; }
        p { font-size: 14px; color: #a1a1aa; line-height: 1.7; margin: 0 0 20px; }
        button {
          background: #10b981;
          color: #000;
          border: none;
          border-radius: 12px;
          padding: 12px 22px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>تعذر الاتصال بالسحابة</h1>
        <p>تأكد من اتصالك بالإنترنت للمزامنة اللحظية بين الكمبيوتر وموبايل OnePlus 12R، ثم أعد المحاولة.</p>
        <button onclick="window.location.href='${APP_URL}'">إعادة المحاولة</button>
      </div>
    </body>
  </html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 700,
    title: 'إيقاع اليوم | DayRhythm',
    backgroundColor: '#000000',
    icon: getIconPath(),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  // Use a standard Chrome user-agent so Google Sign-In works seamlessly
  const cleanUa = mainWindow.webContents
    .getUserAgent()
    .replace(/\sElectron\/[^\s]+/g, '')
    .replace(/\sDayRhythm\/[^\s]+/g, '');
  mainWindow.webContents.setUserAgent(cleanUa);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle Google OAuth popups in-app while routing unrelated external URLs to default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAuthOrAppUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 680,
          backgroundColor: '#09090b',
          autoHideMenuBar: true,
          webPreferences: {
            partition: PARTITION,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _desc, validatedURL) => {
    // Ignore aborted navigations (-3)
    if (errorCode === -3) return;
    if (validatedURL && validatedURL.startsWith(APP_ORIGIN)) {
      loadOfflineFallback(mainWindow);
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.loadURL(APP_URL);
}

app.setAppUserModelId('app.dayrhythm.desktop');

app.whenReady().then(() => {
  setupPermissions();
  createTray();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
