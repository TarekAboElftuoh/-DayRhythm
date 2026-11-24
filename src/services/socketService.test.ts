import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveSocketServerUrl,
  isSocketConnected,
  subscribeSocketConnectStatus,
  disconnectSocketClient,
} from './socketService';
import { setSavedCloudApiUrl, clearSavedCloudApiUrl } from './apiClient';

describe('socketService', () => {
  beforeEach(() => {
    clearSavedCloudApiUrl();
    disconnectSocketClient();
  });

  afterEach(() => {
    clearSavedCloudApiUrl();
    disconnectSocketClient();
  });

  it('resolves default localhost socket url when no saved url exists', () => {
    const url = resolveSocketServerUrl();
    expect(url).toBe('http://localhost:3000');
  });

  it('rejects virtual adapter IPs like 172.30 and 169.254 and falls back to default', () => {
    setSavedCloudApiUrl('http://172.30.198.85:3000');
    expect(resolveSocketServerUrl()).toBe('http://localhost:3000');

    setSavedCloudApiUrl('http://169.254.83.107:3000');
    expect(resolveSocketServerUrl()).toBe('http://localhost:3000');
  });

  it('resolves real LAN IP for mobile clients even when saved is empty or localhost', () => {
    const mobileUa = 'Mozilla/5.0 (Linux; Android 14; Mobile)';

    // Mobile with no saved URL
    expect(resolveSocketServerUrl(mobileUa)).toBe('http://192.168.100.2:3000');

    // Mobile with mistakenly saved localhost
    setSavedCloudApiUrl('http://localhost:3000');
    expect(resolveSocketServerUrl(mobileUa)).toBe('http://192.168.100.2:3000');
  });

  it('resolves custom saved LAN IP when set in apiClient', () => {
    setSavedCloudApiUrl('http://192.168.1.100:3000');
    const url = resolveSocketServerUrl();
    expect(url).toBe('http://192.168.1.100:3000');
  });

  it('reports initial connection status as false', () => {
    expect(isSocketConnected()).toBe(false);
  });

  it('notifies status subscribers immediately upon subscription', () => {
    let receivedStatus: boolean | null = null;
    const unsubscribe = subscribeSocketConnectStatus((status) => {
      receivedStatus = status;
    });

    expect(receivedStatus).toBe(false);
    unsubscribe();
  });
});
