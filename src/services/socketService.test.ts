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
