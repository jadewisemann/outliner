import { useEffect, useRef } from "react";
import type { Store } from "../store";
import { forgetShare, sharedText } from "./share";

/**
 * Launched from a phone's share sheet: file what was shared into the inbox,
 * once the workspace is actually loaded. Where it lands is the store's
 * decision, not this effect's — a capture has to go somewhere the user can
 * predict, and "the document that happened to be open" was not that.
 */
export function useShareCapture(ready: boolean, storeRef: { readonly current: Store }) {
  // One launch, one capture — even when the effect runs again, as it does
  // twice under StrictMode in development.
  const captured = useRef(false);

  useEffect(() => {
    if (!ready || captured.current) return;
    const shared = sharedText(window.location.search);
    if (!shared) return;
    captured.current = true;
    forgetShare();
    storeRef.current.docs.capture(shared);
  }, [ready]);
}
