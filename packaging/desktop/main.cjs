const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  ipcMain,
  nativeImage,
  powerSaveBlocker,
  session,
  shell,
} = require('electron');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  autoUpdater = null;
}

const DEFAULT_APP_URL =
  process.env.DAYRHYTHM_APP_URL ||
  'https://ais-pre-nldzeytdlkfysmfvrz4pkn-146281240493.europe-west2.run.app';
const GITHUB_REPO = 'DAYRHYTHM_GITHUB_OWNER/DAYRHYTHM_GITHUB_REPO';
const PARTITION = 'persist:dayrhythm';
const AUTO_UPDATE_INTERVAL_MS = 30 * 60 * 1000; // Every 30 minutes

let mainWindow = null;
let tray = null;
let isQuitting = false;
let powerSaveId = null;
let updateDownloaded = false;
let updateStatusLabel = 'التطبيق محدّث';

function getConfigPath() {
  return path.join(app.getPath('userData'), 'dayrhythm-config.json');
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      appUrl: typeof parsed.appUrl === 'string' && parsed.appUrl.trim() ? parsed.appUrl.trim() : DEFAULT_APP_URL,
      autoLaunch: typeof parsed.autoLaunch === 'boolean' ? parsed.autoLaunch : true,
    };
  } catch {
    return {
      appUrl: DEFAULT_APP_URL,
      autoLaunch: true,
    };
  }
}

function saveConfig(next) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch {
    // ignore disk write issues
  }
}

let currentConfig = { appUrl: DEFAULT_APP_URL, autoLaunch: true };

function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_APP_URL;
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function getCurrentOrigin() {
  try {
    return new URL(currentConfig.appUrl).origin;
  } catch {
    return new URL(DEFAULT_APP_URL).origin;
  }
}

function getCurrentHost() {
  try {
    return new URL(currentConfig.appUrl).hostname;
  } catch {
    return new URL(DEFAULT_APP_URL).hostname;
  }
}

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
      host === getCurrentHost().toLowerCase() ||
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

function probeUrlHealth(targetUrl) {
  return new Promise((resolve) => {
    try {
      const clean = normalizeUrl(targetUrl);
      const parsed = new URL(`${clean}/api/health`);
      const lib = parsed.protocol === 'http:' ? http : https;
      const req = lib.get(
        parsed,
        {
          timeout: 6000,
          headers: { 'User-Agent': 'DayRhythm-Desktop/1.0' },
        },
        (res) => {
          const code = res.statusCode || 0;
          res.resume();
          resolve({ ok: code >= 200 && code < 400, statusCode: code });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, statusCode: 0, error: 'timeout' });
      });
      req.on('error', (err) => {
        resolve({ ok: false, statusCode: 0, error: err.message });
      });
    } catch (err) {
      resolve({ ok: false, statusCode: 0, error: String(err) });
    }
  });
}

function showDesktopNotification(title, body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: getIconPath() }).show();
    }
  } catch {
    // ignore
  }
}

function applyAutoLaunchSetting(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      openAsHidden: true,
      args: ['--background'],
    });
  } catch {
    // ignore on unsupported environments
  }
}

function rebuildTrayMenu() {
  if (!tray) return;
  const template = [
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
      label: 'تحديث الصفحة',
      click: () => {
        if (mainWindow) void openAppOrRecovery(currentConfig.appUrl);
      },
    },
    {
      label: 'تغيير رابط السحابة',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          loadRecoveryPage(mainWindow, currentConfig.appUrl, 'تعديل رابط الخادم السحابي يدوياً');
        }
      },
    },
    { type: 'separator' },
    {
      label: updateDownloaded
        ? 'تثبيت التحديث الجديد الآن (إعادة تشغيل)'
        : `فحص التحديثات (${updateStatusLabel})`,
      click: () => {
        if (updateDownloaded && autoUpdater) {
          isQuitting = true;
          autoUpdater.quitAndInstall(false, true);
        } else {
          void triggerUpdateCheck(true);
        }
      },
    },
    {
      label: 'التشغيل التلقائي مع ويندوز (24/7 في الخلفية)',
      type: 'checkbox',
      checked: currentConfig.autoLaunch,
      click: (item) => {
        currentConfig = { ...currentConfig, autoLaunch: item.checked };
        saveConfig(currentConfig);
        applyAutoLaunchSetting(item.checked);
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
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
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
      const trusted = currentUrl.startsWith(getCurrentOrigin());
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
    tray.setToolTip('إيقاع اليوم | DayRhythm (يعمل في الخلفية)');
    rebuildTrayMenu();
    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    });
  } catch {
    // Tray optional
  }
}

function setupAutoUpdater() {
  if (!autoUpdater || !app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    updateStatusLabel = 'جاري الفحص...';
    rebuildTrayMenu();
  });

  autoUpdater.on('update-available', (info) => {
    updateStatusLabel = `جاري تنزيل v${info.version}...`;
    rebuildTrayMenu();
    showDesktopNotification(
      'يتوفر تحديث جديد لإيقاع اليوم',
      `جاري تنزيل الإصدار ${info.version} تلقائياً في الخلفية.`
    );
  });

  autoUpdater.on('update-not-available', () => {
    updateStatusLabel = `محدّث v${app.getVersion()}`;
    rebuildTrayMenu();
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    updateStatusLabel = `جاهز للتثبيت v${info.version}`;
    rebuildTrayMenu();
    showDesktopNotification(
      'التحديث جاهز للتثبيت ✓',
      `تم تنزيل الإصدار ${info.version}. اضغط من أيقونة شريط المهام للتثبيت فوراً أو سيُثبّت عند إعادة التشغيل.`
    );
  });

  autoUpdater.on('error', () => {
    updateStatusLabel = `v${app.getVersion()}`;
    rebuildTrayMenu();
  });

  void triggerUpdateCheck(false);
  setInterval(() => {
    void triggerUpdateCheck(false);
  }, AUTO_UPDATE_INTERVAL_MS);
}

async function triggerUpdateCheck(notifyIfUpToDate) {
  if (autoUpdater && app.isPackaged) {
    try {
      const res = await autoUpdater.checkForUpdates();
      if (notifyIfUpToDate && (!res || !res.updateInfo || res.updateInfo.version === app.getVersion())) {
        showDesktopNotification('إيقاع اليوم محدّث', `أنت تستخدم أحدث إصدار (${app.getVersion()}).`);
      }
      return;
    } catch {
      // Fallback to GitHub Releases page if portable build
    }
  }
  if (notifyIfUpToDate && !GITHUB_REPO.includes('DAYRHYTHM_GITHUB')) {
    shell.openExternal(`https://github.com/${GITHUB_REPO}/releases/latest`).catch(() => {});
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadRecoveryPage(win, failedUrl, reasonText) {
  const safeUrl = escapeHtml(failedUrl);
  const safeReason = escapeHtml(reasonText);
  const releasesUrl = GITHUB_REPO.includes('DAYRHYTHM_GITHUB')
    ? ''
    : `https://github.com/${GITHUB_REPO}/releases/latest`;

  const html = `<!doctype html>
  <html lang="ar" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <title>إيقاع اليوم | إعداد رابط السحابة</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000000;
          color: #f4f4f5;
          font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif;
          padding: 24px;
        }
        .card {
          width: 100%;
          max-width: 520px;
          background: #0b0b0d;
          border: 1px solid #27272a;
          border-radius: 22px;
          padding: 28px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
        }
        .badge {
          display: inline-block;
          background: rgba(16, 185, 129, 0.14);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.35);
          border-radius: 10px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 12px;
        }
        h1 { font-size: 20px; margin: 0 0 8px; }
        p { font-size: 13.5px; color: #a1a1aa; line-height: 1.75; margin: 0 0 14px; }
        .reason {
          background: rgba(244, 63, 94, 0.1);
          border: 1px solid rgba(244, 63, 94, 0.3);
          color: #fda4af;
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 12.5px;
          margin-bottom: 16px;
          word-break: break-word;
        }
        label { display: block; font-size: 12.5px; color: #d4d4d8; margin-bottom: 6px; font-weight: 600; }
        input {
          width: 100%;
          direction: ltr;
          text-align: left;
          background: #141417;
          border: 1px solid #3f3f46;
          color: #ffffff;
          border-radius: 12px;
          padding: 11px 14px;
          font-size: 13px;
          outline: none;
          margin-bottom: 14px;
        }
        input:focus { border-color: #10b981; }
        .row { display: flex; gap: 10px; flex-wrap: wrap; }
        button {
          flex: 1;
          min-width: 140px;
          border: none;
          border-radius: 12px;
          padding: 11px 16px;
          font-weight: 700;
          font-size: 13.5px;
          cursor: pointer;
        }
        .primary { background: #10b981; color: #022c22; }
        .secondary { background: #18181b; color: #e4e4e7; border: 1px solid #3f3f46; }
        .hint {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid #27272a;
          font-size: 12px;
          color: #a1a1aa;
          line-height: 1.7;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">إيقاع اليوم · يعمل 24/7 في الخلفية + تحديث تلقائي</div>
        <h1>تعذر الوصول إلى رابط التطبيق السحابي</h1>
        <p>الرابط الحالي غير منشور بعد أو عاد بخطأ 404. انشر التطبيق في AI Studio عبر زر <b>Deploy / Share</b> ثم الصق الرابط الدائم هنا مرة واحدة فقط وسيُحفظ تلقائياً.</p>
        <div class="reason">${safeReason}</div>
        <label for="urlInput">رابط السحابة الدائم (Cloud Run / Shared URL):</label>
        <input id="urlInput" type="url" value="${safeUrl}" placeholder="https://your-app.run.app" />
        <div class="row">
          <button class="primary" onclick="saveAndOpen()">حفظ والاتصال الآن</button>
          <button class="secondary" onclick="retryNow()">إعادة المحاولة</button>
          ${releasesUrl ? `<button class="secondary" onclick="openUpdates()">فحص التحديثات</button>` : ''}
        </div>
        <div class="hint">
          • يظل التطبيق شغالاً في خلفية ويندوز (شريط المهام) لمزامنة الموبايل والتنبيهات.<br />
          • يفحص التطبيق التحديثات الجديدة تلقائياً كل 30 دقيقة من GitHub Releases.
        </div>
      </div>
      <script>
        function saveAndOpen() {
          const val = document.getElementById('urlInput').value.trim();
          if (!val) return;
          window.location.href = 'dayrhythm-config://save?url=' + encodeURIComponent(val);
        }
        function retryNow() {
          window.location.href = 'dayrhythm-config://retry';
        }
        function openUpdates() {
          window.location.href = 'dayrhythm-config://updates';
        }
      </script>
    </body>
  </html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function openAppOrRecovery(targetUrl) {
  if (!mainWindow) return;
  const cleanUrl = normalizeUrl(targetUrl);
  const probe = await probeUrlHealth(cleanUrl);
  if (probe.ok) {
    mainWindow.loadURL(cleanUrl);
    return;
  }
  const reason =
    probe.statusCode === 404
      ? `الرابط أعاد خطأ 404 (Page not found): ${cleanUrl} — تأكد من نشر التطبيق أولاً عبر Deploy/Share ثم ضع الرابط المنشور.`
      : `تعذر الاتصال بـ ${cleanUrl} (${probe.statusCode || probe.error || 'لا يوجد استجابة'})`;
  loadRecoveryPage(mainWindow, cleanUrl, reason);
}

function createWindow(startHidden) {
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

  const cleanUa = mainWindow.webContents
    .getUserAgent()
    .replace(/\sElectron\/[^\s]+/g, '')
    .replace(/\sDayRhythm\/[^\s]+/g, '');
  mainWindow.webContents.setUserAgent(cleanUa);

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) {
      mainWindow.show();
    }
  });

  // Intercept internal config actions from recovery screen
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('dayrhythm-config://')) {
      event.preventDefault();
      try {
        const parsed = new URL(url);
        if (parsed.hostname === 'save') {
          const newUrl = normalizeUrl(parsed.searchParams.get('url') || '');
          currentConfig = { ...currentConfig, appUrl: newUrl };
          saveConfig(currentConfig);
          void openAppOrRecovery(newUrl);
        } else if (parsed.hostname === 'retry') {
          void openAppOrRecovery(currentConfig.appUrl);
        } else if (parsed.hostname === 'updates') {
          void triggerUpdateCheck(true);
        }
      } catch {
        // ignore
      }
    }
  });

  // Intercept 404/5xx HTTP responses on main frame so user never sees raw Google 404
  mainWindow.webContents.on('did-navigate', async (_event, url, httpResponseCode) => {
    if (url.startsWith(getCurrentOrigin()) && httpResponseCode >= 400) {
      loadRecoveryPage(
        mainWindow,
        currentConfig.appUrl,
        `الخادم أعاد خطأ HTTP ${httpResponseCode} على الرابط: ${url}`
      );
    }
  });

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

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, desc, validatedURL) => {
    if (errorCode === -3) return;
    if (validatedURL && validatedURL.startsWith(getCurrentOrigin())) {
      loadRecoveryPage(mainWindow, currentConfig.appUrl, `فشل التحميل (${errorCode}): ${desc}`);
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  void openAppOrRecovery(currentConfig.appUrl);
}

app.setAppUserModelId('app.dayrhythm.desktop');

app.whenReady().then(() => {
  currentConfig = loadConfig();
  applyAutoLaunchSetting(currentConfig.autoLaunch);

  // Prevent Windows from suspending background timers/WebSockets while in tray
  powerSaveId = powerSaveBlocker.start('prevent-app-suspension');

  setupPermissions();
  createTray();
  const startHidden = process.argv.includes('--background');
  createWindow(startHidden);
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(false);
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (powerSaveId !== null && powerSaveBlocker.isStarted(powerSaveId)) {
    powerSaveBlocker.stop(powerSaveId);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('ping', () => 'pong');
