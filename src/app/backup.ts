import type { StoredSnapshot } from "../domain/outlineTypes";
import type { SnapshotHistoryEntry } from "../persistence/localPersistence";
import { normalizePreferences, type PreferenceSettings } from "./preferences";

export type ManualBackup = {
  schemaVersion: 1;
  exportedAt: number;
  snapshot: StoredSnapshot;
  preferences: PreferenceSettings;
  history: SnapshotHistoryEntry[];
};

export function createManualBackup(
  snapshot: StoredSnapshot,
  preferences: PreferenceSettings,
  history: SnapshotHistoryEntry[],
  exportedAt: number
): ManualBackup {
  return {
    schemaVersion: 1,
    exportedAt,
    snapshot,
    preferences: normalizePreferences(preferences),
    history
  };
}

export function serializeManualBackup(backup: ManualBackup): string {
  return JSON.stringify(backup, null, 2);
}
