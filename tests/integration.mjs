import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  getBytes,
  deleteObject,
} from "firebase/storage";
import { createRequire } from "node:module";
const sharp = createRequire(
  new URL("../functions/package.json", import.meta.url),
)("sharp");
const apps = [];
async function client(name) {
  const app = initializeApp(
    {
      apiKey: "demo-key",
      projectId: "demo-party",
      storageBucket: "demo-party.appspot.com",
    },
    name + Date.now(),
  );
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:19099", {
    disableWarnings: true,
  });
  const uid = (await signInAnonymously(auth)).user.uid;
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 18080);
  const fn = getFunctions(app, "asia-east1");
  connectFunctionsEmulator(fn, "127.0.0.1", 15001);
  const storage = getStorage(app);
  connectStorageEmulator(storage, "127.0.0.1", 19199);
  return {
    uid,
    db,
    storage,
    call: async (action, payload = {}) =>
      (
        await httpsCallable(
          fn,
          "command",
        )({ action, payload, requestId: crypto.randomUUID() })
      ).data,
    view: async (code) =>
      (await getDoc(doc(db, "rooms", code, "views", uid))).data(),
  };
}
try {
  const h = await client("host"),
    a = await client("alice"),
    b = await client("bob");
  await assert.rejects(
    h.call("create", { name: "主持" }),
    /無法建立房間/,
  );
  const { code } = await h.call("create", { name: "*主持*" });
  await a.call("join", { code, name: "小艾" });
  await b.call("join", { code, name: "小柏" });
  console.log("PASS anonymous auth + create + join", code);
  await assert.rejects(a.call("mode", { code, mode: "likely" }));
  await assert.rejects(getDoc(doc(a.db, "internal", code)));
  await assert.rejects(getDoc(doc(a.db, "rooms", code, "views", h.uid)));
  await assert.rejects(setDoc(doc(a.db, "rooms", code), { host: a.uid }));
  console.log(
    "PASS security: no elevation / internal reads / other views / direct writes",
  );
  await a.call("submit", {
    code,
    mode: "box",
    text: "今天最值得記住的事情？",
    anonymous: true,
    target: a.uid,
  });
  let hostView = await h.view(code);
  const q = hostView.questions.find((q) => q.mode === "box");
  assert.equal(
    (await b.view(code)).questions.some((x) => x.id === q.id),
    true,
  );
  await h.call("draw", { code, mode: "box" });
  await a.call("pass", { code, id: q.id });
  assert.equal(
    (await b.view(code)).questions.find((x) => x.id === q.id).passed,
    true,
  );
  await a.call("comment", { code, target: q.id, text: "我想聽故事" });
  const c = (await b.view(code)).comments[0];
  await b.call("react", { code, target: c.id, emoji: "❤️" });
  assert.equal((await a.view(code)).reactions[c.id][b.uid], "❤️");
  console.log(
    "PASS direct-to-pool questions + persistent PASS + shared comments and reactions",
  );
  await h.call("mode", { code, mode: "likely" });
  await h.call("draw", { code, mode: "likely" });
  const round = (await a.view(code)).round.id;
  await Promise.all([
    a.call("vote", { code, round, target: b.uid }),
    b.call("vote", { code, round, target: a.uid }),
  ]);
  assert.equal((await h.view(code)).round.result, null);
  await h.call("lock", { code });
  assert.equal((await b.view(code)).round.result.winners.length, 2);
  await assert.rejects(a.call("vote", { code, round, target: h.uid }));
  console.log("PASS concurrent voting + private ballot + lock/tie");
  await h.call("mission", {
    code,
    text: "拍下紅色",
    private: true,
    assignments: { [a.uid]: "小艾秘密任務" },
    deadline: Date.now() + 60000,
  });
  const mission = (await a.view(code)).missions.find((m) => m.owner === a.uid);
  assert.equal(
    (await b.view(code)).missions.some((m) => m.id === mission.id),
    false,
  );
  const path = `rooms/${code}/${a.uid}/${mission.id}.jpg`;
  await assert.rejects(
    uploadBytes(ref(b.storage, path), new Uint8Array([255, 216, 255, 217]), {
      contentType: "image/jpeg",
    }),
  );
  await assert.rejects(
    uploadBytes(ref(a.storage, path), new Uint8Array([1, 2]), {
      contentType: "text/plain",
    }),
  );
  await assert.rejects(
    uploadBytes(ref(a.storage, path), new Uint8Array(2 * 1024 * 1024 + 1), {
      contentType: "image/jpeg",
    }),
  );
  await uploadBytes(
    ref(a.storage, path),
    new Uint8Array([255, 216, 255, 217]),
    { contentType: "image/jpeg" },
  );
  await assert.rejects(
    a.call("photo", { code, mission: mission.id, path, caption: "偽裝JPEG" }),
  );
  await deleteObject(ref(a.storage, path));
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#ef6a45" },
  })
    .jpeg()
    .toBuffer();
  await uploadBytes(ref(a.storage, path), jpeg, { contentType: "image/jpeg" });
  await a.call("photo", {
    code,
    mission: mission.id,
    path,
    caption: "測試照片",
  });
  await assert.rejects(getBytes(ref(b.storage, path)));
  let photo = (await h.view(code)).photos[0];
  await h.call("reviewPhoto", { code, id: photo.id, status: "approved" });
  await h.call("revealPhotos", { code, id: mission.id });
  assert.equal((await getBytes(ref(b.storage, path))).byteLength, jpeg.length);
  await b.call("photoVote", { code, id: photo.id });
  await h.call("settle", { code });
  await assert.rejects(a.call("photoVote", { code, id: photo.id }));
  await a.call("deletePhoto", { code, id: photo.id });
  await assert.rejects(getBytes(ref(a.storage, path)));
  console.log(
    "PASS private missions + Storage permissions + reveal + voting + deletion",
  );
  await h.call("kick", { code, uid: b.uid });
  await assert.rejects(b.call("join", { code, name: "回來" }));
  await assert.rejects(b.view(code));
  console.log("PASS kicked user loses read/write access");
  await h.call("leave", { code });
  await assert.rejects(a.view(code));
  await assert.rejects(a.call("join", { code, name: "重新加入" }));
  console.log(
    "PASS host closes room without transfer; remaining players lose access",
  );
  console.log("ALL INTEGRATION CHECKS PASSED");
} finally {
  await Promise.all(apps.map(deleteApp));
}
