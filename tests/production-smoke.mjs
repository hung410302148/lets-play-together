import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getStorage,
  ref,
  uploadBytes,
  getBytes,
} from "firebase/storage";
import { createRequire } from "node:module";

const sharp = createRequire(
  new URL("../functions/package.json", import.meta.url),
)("sharp");

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
  const storage = getStorage(app);
  const call = httpsCallable(getFunctions(app, "asia-east1"), "command");
  return {
    uid,
    db,
    storage,
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
  await host.run("mission", {
    code,
    text: "正式環境圖片測試",
    private: false,
    deadline: Date.now() + 60000,
  });
  const mission = (
    await getDoc(doc(host.db, "rooms", code, "views", host.uid))
  ).data().missions[0];
  const path = `rooms/${code}/${guest.uid}/${mission.id}.jpg`;
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#e97550" },
  })
    .jpeg()
    .toBuffer();
  await uploadBytes(ref(guest.storage, path), jpeg, {
    contentType: "image/jpeg",
  });
  await guest.run("photo", {
    code,
    mission: mission.id,
    path,
    caption: "正式測試",
  });
  const photo = (
    await getDoc(doc(host.db, "rooms", code, "views", host.uid))
  ).data().photos[0];
  await host.run("reviewPhoto", { code, id: photo.id, status: "approved" });
  await host.run("revealPhotos", { code, id: mission.id });
  assert.equal((await getBytes(ref(guest.storage, path))).byteLength, jpeg.length);
  await host.run("leave", { code });
  await assert.rejects(
    getDoc(doc(guest.db, "rooms", code, "views", guest.uid)),
    /Missing or insufficient permissions/,
  );
  console.log(
    `PASS production auth, functions, Firestore/Storage rules and room lifecycle (${code})`,
  );
} finally {
  await Promise.all(apps.map((app) => deleteApp(app)));
}
