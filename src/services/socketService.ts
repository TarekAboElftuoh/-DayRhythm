import { io, Socket } from 'socket.io-client';
import { getSavedCloudApiUrl } from './apiClient';

export interface SocketClientCallbacks {
  onSettingsUpdate?: (settings: unknown) => void;
  onAlarmSignal?: (signal: unknown) => void;
  onBattery?: (battery: unknown) => void;
  onSyncEvent?: (event: unknown) => void;
  onConnectStatus?: (connected: boolean) => void;
}

let activeSocket: Socket | null = null;
let currentJoinedUid = '';
let currentClientId = '';
let currentServerUrl = '';
let registeredCallbacks: SocketClientCallbacks = {};

type ConnectStatusListener = (connected: boolean) => void;
const connectStatusListeners = new Set<ConnectStatusListener>();

export function subscribeSocketConnectStatus(listener: ConnectStatusListener): () => void {
  connectStatusListeners.add(listener);
  listener(isSocketConnected());
  return () => {
    connectStatusListeners.delete(listener);
  };
}

export function resolveSocketServerUrl(): string {
  // 1. Explicitly saved cloud or LAN IP address (e.g. http://192.168.1.15:3000)
  const saved = getSavedCloudApiUrl();
  if (saved && saved.startsWith('http')) {
    return saved;
  }

  // 2. Direct browser navigation on local or remote host
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, origin } = window.location;
    const isVirtual =
      hostname.endsWith('.web.app') ||
      hostname.endsWith('.firebaseapp.com') ||
      hostname === 'appassets.androidplatform.net';
    if (!isVirtual && (protocol === 'http:' || protocol === 'https:')) {
      return origin;
    }
  }

  // 3. Fallback for Windows desktop or local environment
  return 'http://localhost:3000';
}

export function getActiveSocket(): Socket | null {
  return activeSocket;
}

export function isSocketConnected(): boolean {
  return Boolean(activeSocket && activeSocket.connected);
}

export function initSocketClient(
  uid: string,
  clientId: string,
  callbacks: SocketClientCallbacks = {}
): Socket {
  registeredCallbacks = { ...callbacks };
  currentJoinedUid = uid;
  currentClientId = clientId;

  const serverUrl = resolveSocketServerUrl();

  // If already connected to the same server URL, ensure room membership and return
  if (activeSocket && currentServerUrl === serverUrl) {
    if (activeSocket.connected) {
      activeSocket.emit('join', { uid, clientId });
    }
    return activeSocket;
  }

  // If connecting to a different URL or first time:
  if (activeSocket) {
    activeSocket.removeAllListeners();
    activeSocket.disconnect();
    activeSocket = null;
  }

  currentServerUrl = serverUrl;
  console.info(`[Socket.io] Connecting to real-time hub at ${serverUrl}...`);

  const socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.info(`[Socket.io] Connected successfully! Joining user_${currentJoinedUid}...`);
    socket.emit('join', { uid: currentJoinedUid, clientId: currentClientId });
    registeredCallbacks.onConnectStatus?.(true);
    connectStatusListeners.forEach((l) => l(true));
  });

  socket.on('disconnect', (reason) => {
    console.warn(`[Socket.io] Disconnected: ${reason}`);
    registeredCallbacks.onConnectStatus?.(false);
    connectStatusListeners.forEach((l) => l(false));
  });

  socket.on('connect_error', (err) => {
    console.debug(`[Socket.io] Connection error to ${serverUrl}:`, err.message);
  });

  socket.on('settings_update', (data: { uid?: string; clientId?: string; settings?: unknown }) => {
    if (!data?.settings) return;
    if (data.clientId && data.clientId === currentClientId) return;
    console.info('[Socket.io] Instant settings_update received from peer:', data.clientId);
    registeredCallbacks.onSettingsUpdate?.(data.settings);
  });

  socket.on('alarm_signal', (data: { uid?: string; clientId?: string; signal?: unknown }) => {
    if (!data?.signal) return;
    if (data.clientId && data.clientId === currentClientId) return;
    console.info('[Socket.io] Instant alarm_signal received from peer:', data.clientId);
    registeredCallbacks.onAlarmSignal?.(data.signal);
  });

  socket.on('battery', (data: { uid?: string; clientId?: string; battery?: unknown }) => {
    if (!data?.battery) return;
    if (data.clientId && data.clientId === currentClientId) return;
    registeredCallbacks.onBattery?.(data.battery);
  });

  socket.on('sync_event', (data: { uid?: string; clientId?: string; event?: unknown }) => {
    if (!data?.event) return;
    if (data.clientId && data.clientId === currentClientId) return;
    registeredCallbacks.onSyncEvent?.(data.event);
  });

  // Automatically wake up and reconnect when phone screen turns on or app comes to foreground
  if (typeof window !== 'undefined') {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' || document.hasFocus()) {
        if (activeSocket && !activeSocket.connected) {
          console.info('[Socket.io] App foregrounded, reconnecting socket...');
          activeSocket.connect();
        }
      }
    };

    window.removeEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
  }

  activeSocket = socket;
  return socket;
}

export function emitSocketSettings(uid: string, clientId: string, settings: unknown): void {
  if (!uid || !settings) return;
  if (!activeSocket) {
    initSocketClient(uid, clientId);
  }
  if (activeSocket?.connected) {
    activeSocket.emit('settings_update', {
      uid,
      clientId,
      settings,
      timestampMs: Date.now(),
    });
  } else if (activeSocket) {
    activeSocket.once('connect', () => {
      activeSocket?.emit('settings_update', {
        uid,
        clientId,
        settings,
        timestampMs: Date.now(),
      });
    });
  }
}

export function emitSocketAlarmSignal(uid: string, clientId: string, signal: unknown): void {
  if (!uid || !signal) return;
  if (activeSocket?.connected) {
    activeSocket.emit('alarm_signal', {
      uid,
      clientId,
      signal,
      timestampMs: Date.now(),
    });
  }
}

export function emitSocketBattery(uid: string, clientId: string, battery: unknown): void {
  if (!uid || !battery) return;
  if (activeSocket?.connected) {
    activeSocket.emit('battery', {
      uid,
      clientId,
      battery,
    });
  }
}

export function emitSocketSyncEvent(uid: string, clientId: string, event: unknown): void {
  if (!uid || !event) return;
  if (activeSocket?.connected) {
    activeSocket.emit('sync_event', {
      uid,
      clientId,
      event,
      timestampMs: Date.now(),
    });
  }
}

export function disconnectSocketClient(): void {
  if (activeSocket) {
    activeSocket.removeAllListeners();
    activeSocket.disconnect();
    activeSocket = null;
    currentServerUrl = '';
    connectStatusListeners.forEach((l) => l(false));
  }
}

export function reconnectSocket(): void {
  disconnectSocketClient();
  if (currentJoinedUid) {
    initSocketClient(currentJoinedUid, currentClientId, registeredCallbacks);
  }
}
