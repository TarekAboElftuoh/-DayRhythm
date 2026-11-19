const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  nativeImage,
  powerSaveBlocker,
  session,
  shell,
} = require('electron');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { WebSocket, WebSocketServer } = require('ws');

let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch {
  autoUpdater = null;
}

const GITHUB_REPO = 'DAYRHYTHM_GITHUB_OWNER/DAYRHYTHM_GITHUB_REPO';
const PARTITION = 'persist:dayrhythm';
const PREFERRED_PORT = 41735;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // Every 30 minutes
const WS_PING_INTERVAL_MS = 25 * 1000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

let mainWindow = null;
let tray = null;
let localServer = null;
let localWss = null;
let localPort = PREFERRED_PORT;
let isQuitting = false;
let powerSaveId = null;

// Background WebSocket keep-alive state
let remoteWs = null;
let remoteWsReconnectTimer = null;
let remoteWsPingTimer = null;
let remoteWsBackoffMs = 3000;
let wsStatusLabel = 'متصل محلياً + Firestore لحظي';

// Auto-update state
let updateDownloaded = false;
let latestReleaseInfo = null; // { version, tag, downloadUrl }
let updateStatusLabel = `محدّث v${app.getVersion()}`;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'dayrhythm-config.json');
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      autoLaunch: typeof parsed.autoLaunch === 'boolean' ? parsed.autoLaunch : true,
      remoteSyncWsUrl: typeof parsed.remoteSyncWsUrl === 'string' ? parsed.remoteSyncWsUrl.trim() : '',
    };
  } catch {
    return {
      autoLaunch: true,
      remoteSyncWsUrl: '',
    };
  }
}

function saveConfig(next) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch {
    // ignore disk errors
  }
}

let currentConfig = { autoLaunch: true, remoteSyncWsUrl: '' };

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

function getIconPath() {
  return path.join(__dirname, 'build', 'icon.png');
}

function getEmbeddedDistDir() {
  const packaged = path.join(__dirname, 'app-dist');
  if (fs.existsSync(path.join(packaged, 'index.html'))) {
    return packaged;
  }
  const repoDist = path.resolve(__dirname, '..', '..', 'dist');
  if (fs.existsSync(path.join(repoDist, 'index.html'))) {
    return repoDist;
  }
  return packaged;
}

function getLocalOrigin() {
  return `http://localhost:${localPort}`;
}

function isAuthOrAppUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
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

function showDesktopNotification(title, body, onClick) {
  try {
    if (!Notification.isSupported()) return;
    const notif = new Notification({
      title,
      body,
      icon: getIconPath(),
    });
    if (onClick) notif.on('click', onClick);
    notif.show();
  } catch {
    // ignore notification errors
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
    // ignore on unsupported platforms
  }
}

// =========================================================================
// 1. Embedded Local HTTP + WebSocket Server (ZERO 404 EVER, Works Offline!)
// =========================================================================
function startEmbeddedServer() {
  return new Promise((resolve) => {
    const distDir = getEmbeddedDistDir();
    const syncRooms = new Map();

    const broadcastRoom = (uid, rawMsg, senderWs) => {
      const room = syncRooms.get(uid);
      if (!room) return;
      for (const client of room) {
        if (client !== senderWs && client.readyState === WebSocket.OPEN) {
          try {
            client.send(rawMsg);
          } catch {
            // ignore
          }
        }
      }
    };

    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://localhost');
        const pathname = decodeURIComponent(reqUrl.pathname);

        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

        if (pathname === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              ok: true,
              mode: 'desktop_standalone',
              wsSyncRooms: syncRooms.size,
              version: app.getVersion(),
              serverTimeIso: new Date().toISOString(),
            })
          );
          return;
        }

        if (pathname === '/__dayrhythm_native/status') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              version: app.getVersion(),
              updateDownloaded,
              latestRelease: latestReleaseInfo,
              wsStatus: wsStatusLabel,
            })
          );
          return;
        }

        if (pathname === '/__dayrhythm_native/install-update' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
          triggerInstallOrDownloadUpdate();
          return;
        }

        // Prevent path traversal & serve embedded dist assets
        const safeRel = pathname.replace(/^\/+/, '').replace(/\.\./g, '');
        let filePath = path.join(distDir, safeRel || 'index.html');
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }

        if (!fs.existsSync(filePath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!doctype html><html dir="rtl" lang="ar"><body style="background:#000;color:#fff;font-family:sans-serif;padding:32px;text-align:center"><h2>جاري تجهيز ملفات إيقاع اليوم...</h2></body></html>');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        const headers = { 'Content-Type': mime };
        if (ext === '.html') {
          headers['Cache-Control'] = 'no-cache';
        }
        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Error');
      }
    });

    // Local WebSocket server on /ws/sync (keeps renderer WebSocket permanently connected)
    const wss = new WebSocketServer({ server, path: '/ws/sync' });
    wss.on('connection', (ws, req) => {
      let uid = 'local';
      try {
        const u = new URL(req.url || '/ws/sync', 'http://localhost');
        uid = u.searchParams.get('uid') || 'local';
      } catch {
        uid = 'local';
      }

      if (!syncRooms.has(uid)) syncRooms.set(uid, new Set());
      syncRooms.get(uid).add(ws);

      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.send(JSON.stringify({ type: 'connected', mode: 'desktop_tray_ws', ts: Date.now() }));

      ws.on('message', (data) => {
        const text = data.toString();
        if (text === 'ping') {
          try {
            ws.send('pong');
          } catch {
            // ignore
          }
          return;
        }
        broadcastRoom(uid, text, ws);
        if (remoteWs && remoteWs.readyState === WebSocket.OPEN) {
          try {
            remoteWs.send(text);
          } catch {
            // ignore
          }
        }
      });

      ws.on('close', () => {
        const room = syncRooms.get(uid);
        if (room) {
          room.delete(ws);
          if (room.size === 0) syncRooms.delete(uid);
        }
      });
    });

    // Heartbeat keep-alive for all local WebSocket clients
    const heartbeat = setInterval(() => {
      wss.clients.forEach((client) => {
        if (client.isAlive === false) {
          try {
            client.terminate();
          } catch {
            // ignore
          }
          return;
        }
        client.isAlive = false;
        try {
          client.ping();
        } catch {
          // ignore
        }
      });
    }, WS_PING_INTERVAL_MS);

    wss.on('close', () => clearInterval(heartbeat));

    localServer = server;
    localWss = wss;

    server.on('error', () => {
      // Fallback to random available localhost port if PREFERRED_PORT is occupied
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        localPort = typeof addr === 'object' && addr ? addr.port : PREFERRED_PORT;
        resolve(localPort);
      });
    });

    server.listen(PREFERRED_PORT, '127.0.0.1', () => {
      localPort = PREFERRED_PORT;
      resolve(localPort);
    });
  });
}

// =========================================================================
// 2. Persistent Background Remote WebSocket Bridge (Optional Cloud Relay)
// =========================================================================
function connectRemoteSyncWebSocket() {
  const wsUrl = currentConfig.remoteSyncWsUrl;
  if (!wsUrl || !/^wss?:\/\//i.test(wsUrl)) {
    wsStatusLabel = 'متصل محلياً + Firestore لحظي';
    rebuildTrayMenu();
    return;
  }

  if (remoteWsReconnectTimer) {
    clearTimeout(remoteWsReconnectTimer);
    remoteWsReconnectTimer = null;
  }

  try {
    remoteWs = new WebSocket(wsUrl);
  } catch {
    scheduleRemoteWsReconnect();
    return;
  }

  remoteWs.on('open', () => {
    remoteWsBackoffMs = 3000;
    wsStatusLabel = 'متصل بـ WebSocket 24/7 ✓';
    rebuildTrayMenu();

    if (remoteWsPingTimer) clearInterval(remoteWsPingTimer);
    remoteWsPingTimer = setInterval(() => {
      if (remoteWs && remoteWs.readyState === WebSocket.OPEN) {
        try {
          remoteWs.ping();
        } catch {
          // ignore
        }
      }
    }, WS_PING_INTERVAL_MS);
  });

  remoteWs.on('message', (data) => {
    const text = data.toString();
    if (localWss) {
      localWss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(text);
          } catch {
            // ignore
          }
        }
      });
    }
  });

  remoteWs.on('close', () => {
    if (remoteWsPingTimer) clearInterval(remoteWsPingTimer);
    wsStatusLabel = 'جاري إعادة ربط WebSocket...';
    rebuildTrayMenu();
    scheduleRemoteWsReconnect();
  });

  remoteWs.on('error', () => {
    try {
      remoteWs.close();
    } catch {
      // ignore
    }
  });
}

function scheduleRemoteWsReconnect() {
  if (isQuitting) return;
  if (remoteWsReconnectTimer) clearTimeout(remoteWsReconnectTimer);
  remoteWsReconnectTimer = setTimeout(() => {
    connectRemoteSyncWebSocket();
  }, remoteWsBackoffMs);
  remoteWsBackoffMs = Math.min(remoteWsBackoffMs * 2, 45000);
}

// =========================================================================
// 3. Periodic GitHub Releases Auto-Update Service (Setup + Portable)
// =========================================================================
function isVersionNewer(remoteTag, localVersion) {
  const r = String(remoteTag || '').replace(/^v/i, '').split('.').map((x) => parseInt(x.replace(/\D/g, ''), 10) || 0);
  const l = String(localVersion || '').replace(/^v/i, '').split('.').map((x) => parseInt(x.replace(/\D/g, ''), 10) || 0);
  const len = Math.max(r.length, l.length);
  for (let i = 0; i < len; i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

function fetchLatestGithubRelease() {
  return new Promise((resolve) => {
    if (!GITHUB_REPO || GITHUB_REPO.includes('DAYRHYTHM_GITHUB')) {
      resolve(null);
      return;
    }
    const req = https.get(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        timeout: 8000,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `DayRhythm-Desktop/${app.getVersion()}`,
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            const tag = String(json.tag_name || '').trim();
            const assets = Array.isArray(json.assets) ? json.assets : [];
            const setupAsset = assets.find((a) => String(a.name || '').toLowerCase().includes('setup.exe'));
            const anyExe = assets.find((a) => String(a.name || '').toLowerCase().endsWith('.exe'));
            const chosen = setupAsset || anyExe;
            resolve({
              tag,
              version: tag.replace(/^v/i, ''),
              downloadUrl: chosen ? chosen.browser_download_url : json.html_url,
              htmlUrl: json.html_url,
            });
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

function injectInAppUpdateBanner(tagLabel) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const safeTag = String(tagLabel || '').replace(/['"\\<>]/g, '');
  const js = `
    (() => {
      const existing = document.getElementById('dayrhythm-native-update-bar');
      if (existing) existing.remove();
      const bar = document.createElement('div');
      bar.id = 'dayrhythm-native-update-bar';
      bar.dir = 'rtl';
      bar.style.cssText = 'position:fixed;bottom:18px;left:18px;z-index:2147483647;background:#06281e;color:#ecfdf5;border:1px solid #10b981;border-radius:16px;padding:12px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 16px 40px rgba(0,0,0,0.65);font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;';
      bar.innerHTML = '<span>🚀 يتوفر تحديث جديد لإيقاع اليوم (<b>${safeTag}</b>)</span>'
        + '<button id="dr-upd-install-btn" style="background:#10b981;color:#022c22;border:none;border-radius:10px;padding:7px 14px;font-weight:700;cursor:pointer;">تثبيت الآن</button>'
        + '<button id="dr-upd-close-btn" style="background:transparent;color:#a7f3d0;border:none;cursor:pointer;font-size:16px;padding:0 4px;">×</button>';
      document.body.appendChild(bar);
      document.getElementById('dr-upd-install-btn')?.addEventListener('click', () => {
        fetch('/__dayrhythm_native/install-update', { method: 'POST' }).catch(() => {});
      });
      document.getElementById('dr-upd-close-btn')?.addEventListener('click', () => bar.remove());
    })();
  `;
  mainWindow.webContents.executeJavaScript(js).catch(() => {});
}

function triggerInstallOrDownloadUpdate() {
  if (updateDownloaded && autoUpdater) {
    isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
    return;
  }
  if (latestReleaseInfo && latestReleaseInfo.downloadUrl) {
    shell.openExternal(latestReleaseInfo.downloadUrl).catch(() => {});
    return;
  }
  if (!GITHUB_REPO.includes('DAYRHYTHM_GITHUB')) {
    shell.openExternal(`https://github.com/${GITHUB_REPO}/releases/latest`).catch(() => {});
  }
}

function setupBackgroundAutoUpdater() {
  if (autoUpdater && app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      updateStatusLabel = 'جاري فحص التحديثات...';
      rebuildTrayMenu();
    });

    autoUpdater.on('update-available', (info) => {
      latestReleaseInfo = {
        tag: `v${info.version}`,
        version: info.version,
        downloadUrl: `https://github.com/${GITHUB_REPO}/releases/latest`,
      };
      updateStatusLabel = `جاري تنزيل v${info.version}...`;
      rebuildTrayMenu();
      showDesktopNotification(
        'يتوفر تحديث جديد لإيقاع اليوم',
        `جاري تنزيل الإصدار v${info.version} تلقائياً في الخلفية.`
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
      injectInAppUpdateBanner(`v${info.version}`);
      showDesktopNotification(
        'التحديث جاهز للتثبيت ✓',
        `اضغط هنا لتثبيت الإصدار v${info.version} وإعادة تشغيل إيقاع اليوم تلقائياً.`,
        () => triggerInstallOrDownloadUpdate()
      );
    });

    autoUpdater.on('error', () => {
      // Fallback to lightweight GitHub API check below
    });
  }

  void runPeriodicUpdateCheck(false);
  setInterval(() => {
    void runPeriodicUpdateCheck(false);
  }, UPDATE_CHECK_INTERVAL_MS);
}

async function runPeriodicUpdateCheck(notifyIfUpToDate) {
  let handledByElectronUpdater = false;
  if (autoUpdater && app.isPackaged) {
    try {
      const res = await autoUpdater.checkForUpdates();
      handledByElectronUpdater = true;
      if (notifyIfUpToDate && (!res || !res.updateInfo || !isVersionNewer(res.updateInfo.version, app.getVersion()))) {
        showDesktopNotification('إيقاع اليوم محدّث ✓', `أنت تستخدم أحدث إصدار (v${app.getVersion()}).`);
      }
    } catch {
      handledByElectronUpdater = false;
    }
  }

  if (!handledByElectronUpdater) {
    const rel = await fetchLatestGithubRelease();
    if (rel && isVersionNewer(rel.version, app.getVersion())) {
      latestReleaseInfo = rel;
      updateStatusLabel = `تحديث متاح ${rel.tag}`;
      rebuildTrayMenu();
      injectInAppUpdateBanner(rel.tag);
      showDesktopNotification(
        `يتوفر إصدار جديد (${rel.tag})`,
        'اضغط هنا لتنزيل وتثبيت التحديث الجديد مباشرة من GitHub Releases.',
        () => triggerInstallOrDownloadUpdate()
      );
    } else if (notifyIfUpToDate) {
      showDesktopNotification('إيقاع اليوم محدّث ✓', `أنت تستخدم أحدث إصدار (v${app.getVersion()}).`);
    }
  }
}

// =========================================================================
// 4. Windows System Tray Icon (24/7 Background Operation)
// =========================================================================
function rebuildTrayMenu() {
  if (!tray) return;
  const template = [
    {
      label: 'إيقاع اليوم | DayRhythm',
      enabled: false,
    },
    {
      label: `المزامنة: ${wsStatusLabel}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'فتح النافذة',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: 'تحديث الواجهة',
      click: () => {
        if (mainWindow) mainWindow.reload();
      },
    },
    { type: 'separator' },
    {
      label: updateDownloaded
        ? '🚀 تثبيت التحديث الآن (إعادة تشغيل)'
        : latestReleaseInfo && isVersionNewer(latestReleaseInfo.version, app.getVersion())
          ? `⬇️ تنزيل التحديث (${latestReleaseInfo.tag})`
          : `فحص التحديثات (${updateStatusLabel})`,
      click: () => {
        if (updateDownloaded || (latestReleaseInfo && isVersionNewer(latestReleaseInfo.version, app.getVersion()))) {
          triggerInstallOrDownloadUpdate();
        } else {
          void runPeriodicUpdateCheck(true);
        }
      },
    },
    {
      label: 'التشغيل تلقائياً مع ويندوز (24/7 في الخلفية)',
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
  tray.setToolTip(`إيقاع اليوم | ${wsStatusLabel}`);
}

function createTray() {
  try {
    const icon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
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

function setupPermissions() {
  const ses = session.fromPartition(PARTITION);
  const allowed = new Set([
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
      const trusted = currentUrl.startsWith(getLocalOrigin());
      callback(trusted && allowed.has(permission));
    } catch {
      callback(false);
    }
  });
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

  // Clean Chrome User-Agent so Google Sign-In works seamlessly
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

  mainWindow.webContents.on('did-finish-load', () => {
    if (updateDownloaded && latestReleaseInfo) {
      injectInAppUpdateBanner(latestReleaseInfo.tag);
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

  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.loadURL(getLocalOrigin());
}

app.setAppUserModelId('app.dayrhythm.desktop');

app.whenReady().then(async () => {
  currentConfig = loadConfig();
  applyAutoLaunchSetting(currentConfig.autoLaunch);

  // Prevent Windows from suspending WebSocket & timers when minimized to Tray
  powerSaveId = powerSaveBlocker.start('prevent-app-suspension');

  await startEmbeddedServer();
  setupPermissions();
  createTray();
  connectRemoteSyncWebSocket();

  const startHidden = process.argv.includes('--background');
  createWindow(startHidden);
  setupBackgroundAutoUpdater();

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
  if (remoteWsReconnectTimer) clearTimeout(remoteWsReconnectTimer);
  if (remoteWsPingTimer) clearInterval(remoteWsPingTimer);
  try {
    if (remoteWs) remoteWs.close();
    if (localWss) localWss.close();
    if (localServer) localServer.close();
  } catch {
    // ignore
  }
  if (powerSaveId !== null && powerSaveBlocker.isStarted(powerSaveId)) {
    powerSaveBlocker.stop(powerSaveId);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
