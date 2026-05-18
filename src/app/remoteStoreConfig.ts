import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { BrowserRemoteStoreV2 } from "../sync/browserRemoteStoreV2";
import { FirebaseRemoteStoreV2 } from "../sync/firebaseRemoteStoreV2";
import type { RemoteStoreV2 } from "../sync/syncTypes";

export function createConfiguredRemoteStore(): RemoteStoreV2 | undefined {
  const searchParams = new URLSearchParams(window.location.search);
  const remoteMode = searchParams.get("remote");
  if (!shouldUseFirebaseRemote(searchParams)) {
    if (remoteMode === "browser") {
      return new BrowserRemoteStoreV2(searchParams.get("workspace") ?? "root");
    }
    return undefined;
  }

  const {
    VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_DATABASE_URL,
    VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_APP_ID,
    VITE_OUTLINER_USER_ID
  } = import.meta.env;
  const userId = searchParams.get("user") ?? VITE_OUTLINER_USER_ID;

  if (
    !VITE_FIREBASE_API_KEY ||
    !VITE_FIREBASE_AUTH_DOMAIN ||
    !VITE_FIREBASE_DATABASE_URL ||
    !VITE_FIREBASE_PROJECT_ID ||
    !VITE_FIREBASE_APP_ID ||
    !userId
  ) {
    return undefined;
  }

  const app = initializeApp({
    apiKey: VITE_FIREBASE_API_KEY,
    authDomain: VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: VITE_FIREBASE_DATABASE_URL,
    projectId: VITE_FIREBASE_PROJECT_ID,
    appId: VITE_FIREBASE_APP_ID
  });

  return new FirebaseRemoteStoreV2(getDatabase(app), userId);
}

export function shouldUseFirebaseRemote(searchParams: URLSearchParams): boolean {
  return searchParams.get("remote") === "firebase";
}
