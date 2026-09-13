import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const config = {
  apiKey: "AIzaSyA7oG32u_unKJG5VOYHgC0tvNyxn7O92LI",
  projectId: "lets-play-together-ffbc8",
  appId: "1:63726391317:web:bbdbea5bcf78dcf7ad3e1c",
  storageBucket: "lets-play-together-ffbc8.firebasestorage.app",
};
const apps = [];

async function client(label) {
  const app = initializeApp(config, `${label}-${Date.now()}-${Math.random()}`);
  apps.push(app);
  const uid = (await signInAnonymously(getAuth(app))).user.uid;
  const db = getFirestore(app);
  const call = httpsCallable(getFunctions(app, "asia-east1"), "command");
  return {
    uid,
    db,
    run: async (action, payload = {}) =>
      (
        await call({
          action,
          payload,
          requestId: crypto.randomUUID(),
        })
      ).data,
  };
}

try {
  const host = await client("production-host");
  const guest = await client("production-guest");
  await assert.rejects(
    host.run("create", { name: "公開測試" }),
    /無法建立房間/,
  );
  const { code } = await host.run("create", { name: "*公開測試*" });
  await guest.run("join", { code, name: "訪客" });
  const hostView = (
    await getDoc(doc(host.db, "rooms", code, "views", host.uid))
  ).data();
  assert.equal(Object.keys(hostView.members).length, 2);
  await host.run("leave", { code });
  await assert.rejects(
    getDoc(doc(guest.db, "rooms", code, "views", guest.uid)),
    /Missing or insufficient permissions/,
  );
  console.log(`PASS production auth, functions, Firestore rules and room lifecycle (${code})`);
} finally {
  await Promise.all(apps.map((app) => deleteApp(app)));
}
