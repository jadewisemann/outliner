/**
 * The bridge to the native shell (`src-tauri/`), when there is one.
 *
 * The same static build runs in a browser tab, as an installed PWA, and inside
 * the Tauri shell on desktop and Android. Only the last has anything here: the
 * shell sets `withGlobalTauri`, which puts `window.__TAURI__` on the page. That
 * global is the whole dependency — there is no `@tauri-apps/api` package, so a
 * browser build carries no native code and the runtime dependency list stays
 * what DESIGN.md principle 12 says it is.
 *
 * The shell moves bytes and opens windows. It never decides anything about the
 * notes: merging and validation stay in this code, the same code a browser
 * runs (DESIGN.md principle 20).
 */

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type TauriGlobal = { core?: { invoke?: Invoke } };

function tauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null) as TauriGlobal | null;
}

/** True inside the native shell, false in any browser. */
export function isNative(): boolean {
  return typeof tauri()?.core?.invoke === "function";
}

/** Calls a command registered in `src-tauri/src/lib.rs`. Throws outside the shell. */
export function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = tauri()?.core?.invoke;
  if (!invoke) return Promise.reject(new Error("not running in the native shell"));
  return invoke<T>(command, args);
}

export type NativeInfo = {
  /** Android (or iOS). The folder backend needs a real filesystem path, which a phone does not hand out. */
  mobile: boolean;
  /** The platform name from Rust's `std::env::consts::OS`. */
  os: string;
};

let info: Promise<NativeInfo | null> | null = null;

/** What the shell is running on; null in a browser. Asked once. */
export function nativeInfo(): Promise<NativeInfo | null> {
  if (!isNative()) return Promise.resolve(null);
  info ??= invokeNative<NativeInfo>("native_info").catch(() => null);
  return info;
}

/**
 * Wiring that only the shell needs, run once at start-up.
 *
 * Links: rendered links use `target="_blank"`, which a webview answers by doing
 * nothing (desktop) or by navigating the app away (Android). Either loses the
 * link, so inside the shell a click on an outside link goes to the system
 * browser instead.
 */
export function installNativeShell(): void {
  if (!isNative()) return;
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.href;
      if (!/^(https?:|mailto:)/i.test(href)) return;
      // A link back into the app itself is navigation, not an outside page.
      if (href.startsWith(location.origin)) return;
      event.preventDefault();
      void invokeNative("open_external", { url: href }).catch(() => {
        /* nothing sensible to fall back to inside a webview */
      });
    },
    true
  );
}
