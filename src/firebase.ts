import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";
const env = import.meta.env;
export const emulator = env.VITE_USE_EMULATORS !== "false";
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || "demo-key",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "demo-party",
  appId: env.VITE_FIREBASE_APP_ID || "demo-app",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "demo-party.appspot.com",
});
export const auth = getAuth(app),
  db = getFirestore(app),
  storage = getStorage(app),
  functions = getFunctions(app);
if (emulator) {
  const host = location.hostname;
  connectAuthEmulator(auth, `http://${host}:19099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 18080);
  connectFunctionsEmulator(functions, host, 15001);
  connectStorageEmulator(storage, host, 19199);
}
let loginPromise: ReturnType<typeof authenticate> | undefined;
async function authenticate() {
  await auth.authStateReady();
  return auth.currentUser || (await signInAnonymously(auth)).user;
}
export function login() {
  return (loginPromise ??= authenticate().catch((e) => {
    loginPromise = undefined;
    throw e;
  }));
}
export async function command(
  action: string,
  payload: Record<string, unknown> = {},
) {
  if (!navigator.onLine) throw new Error("目前離線，重新連線後再送出");
  return (
    await httpsCallable(
      functions,
      "command",
    )({ action, payload, requestId: crypto.randomUUID() })
  ).data as { code: string };
}
