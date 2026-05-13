import type { SyncStatus } from "../sync/syncTypes";

const labels: Record<SyncStatus, string> = {
  "local-only": "Saved locally",
  offline: "Offline",
  syncing: "Syncing",
  synced: "Synced",
  error: "Sync error"
};

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  return (
    <span className={`sync-badge sync-badge-${status}`} aria-label={`Sync status: ${labels[status]}`}>
      {labels[status]}
    </span>
  );
}
