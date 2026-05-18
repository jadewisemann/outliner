import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { BrowserRemoteStore } from "../sync/browserRemoteStore";
import { FirebaseRemoteStore } from "../sync/firebaseRemoteStore";
import type { RemoteStore } from "../sync/syncTypes";

export function createConfiguredRemoteStore(): RemoteStore | undefined {
  const searchParams = new URLSearchParams(window.location.search);
  const remoteMode = searchParams.get("remote");
  if (remoteMode === "none") {
    return undefined;
  }
  if (searchParams.get("remote") === "browser") {
    return new BrowserRemoteStore(searchParams.get("workspace") ?? "root");
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

  return new FirebaseRemoteStore(getDatabase(app), userId);
}
