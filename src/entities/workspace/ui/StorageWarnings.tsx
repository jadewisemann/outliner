import { hasContent } from "@/entities/outline";
import type { Store } from "../model/store";

/** The two ways the notes on this device can be at risk, said where they cannot be missed. */
export function StorageWarnings({ store }: { store: Store }) {
  return (
    <>
      {store.saveFailed ? (
        <p className="save-warning" role="alert">
          이 기기에 저장하지 못하고 있습니다. 저장 공간이 가득 찼을 수 있습니다 — 백업을 내려받아 두세요.
        </p>
      ) : null}
      {/*
        Local-first means the only copy is here, and `best-effort` storage
        means the browser may delete it — under storage pressure, or after
        iOS Safari counts enough unopened days. Saying nothing would be
        claiming a guarantee the browser never gave. The three conditions are
        the loss itself: refused, no second copy, and something to lose.
      */}
      {store.storage.grade === "best-effort" && store.sync.status === "off" && hasContent(store.workspace) ? (
        <p className="save-warning" role="alert">
          이 브라우저가 저장을 보장하지 않습니다 — 저장 공간이 부족해지면 노트가 지워질 수 있습니다. 기기 간
          동기화를 켜거나 백업을 내려받아 두세요.
        </p>
      ) : null}
    </>
  );
}
