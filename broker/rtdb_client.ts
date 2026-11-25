import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, onValue, set, update, serverTimestamp, onDisconnect } from 'firebase/database';
import firebaseConfig from '../firebase-applet-config.json';

export interface SpircWireEvent {
  sequenceNumber: number;
  senderDeviceId: string;
  senderEpochMs: number;
  action: 'TRIGGER' | 'DISMISS' | 'SNOOZE' | 'HYDRATE_CUP' | 'MEDICATION_TAKEN' | 'HEARTBEAT';
  targetAlertId: string;
  payload?: Record<string, unknown>;
}

export class DayRhythmBrokerClient {
  private db;
  private clusterId: string;
  private deviceId: string;
  private deviceType: 'desktop_windows' | 'mobile_android';
  private onEventCallback?: (event: SpircWireEvent) => void;

  constructor(userId: string, deviceId: string, deviceType: 'desktop_windows' | 'mobile_android') {
    const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    // Connect to RTDB instance
    this.db = getDatabase(app);
    this.clusterId = `cluster_${userId}`;
    this.deviceId = deviceId;
    this.deviceType = deviceType;
  }

  public connect(onEvent: (event: SpircWireEvent) => void) {
    this.onEventCallback = onEvent;

    // 1. Presence tracking with auto-disconnect
    const presenceRef = ref(this.db, `presence/${this.clusterId}/${this.deviceId}`);
    void set(presenceRef, {
      device_type: this.deviceType,
      online: true,
      last_seen_epoch_ms: Date.now()
    });
    void onDisconnect(presenceRef).set({
      device_type: this.deviceType,
      online: false,
      last_seen_epoch_ms: serverTimestamp()
    });

    // 2. High-speed Live Event Stream (<50ms via persistent WebSocket)
    const clusterEventsRef = ref(this.db, `clusters/${this.clusterId}/live_event`);
    onValue(clusterEventsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // Drop self-reflected frames
      if (data.senderDeviceId === this.deviceId) return;

      if (this.onEventCallback) {
        this.onEventCallback(data as SpircWireEvent);
      }
    });
  }

  public async broadcastAction(
    action: SpircWireEvent['action'],
    targetAlertId: string,
    sequenceNumber: number,
    payload?: Record<string, unknown>
  ): Promise<void> {
    const event: SpircWireEvent = {
      sequenceNumber,
      senderDeviceId: this.deviceId,
      senderEpochMs: Date.now(),
      action,
      targetAlertId,
      ...(payload ? { payload } : {})
    };

    const liveEventRef = ref(this.db, `clusters/${this.clusterId}/live_event`);
    await set(liveEventRef, event);
  }
}
