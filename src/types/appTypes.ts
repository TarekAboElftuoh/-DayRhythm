import type { UserSettingsPayload } from '../services/cloudStateService';
import type { DeletedWorkspaceSnapshot, WorkspaceSyncSignal } from './dayrhythm';

/** Payload persisted into the Google Tasks cloud sync vault. */
export type TasksVaultPayload = UserSettingsPayload;

export const VAULT_LIST_TITLE = '[DayRhythm Sync Vault]';
export const SYNC_TASK_TITLE = 'sync_state';
export const DEVICE_ID_STORAGE_KEY = 'dayrhythm_device_id';

/** Broadcasts a local action to the other signed-in devices. */
export interface EmitCrossDeviceSync {
  (
    scope: WorkspaceSyncSignal['scope'],
    action: string,
    undoSnapshotPayload?: DeletedWorkspaceSnapshot,
    extraPayload?: Record<string, unknown>
  ): void;
}

export interface NativeBatteryReading {
  levelPct: number;
  charging: boolean;
  deviceLabel: string;
  chargeTimeRemainingMin: number;
  chargeLimitPct?: number;
  updatedAtMs?: number;
}
