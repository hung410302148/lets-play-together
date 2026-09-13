import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { randomInt } from "node:crypto";
import sharp from "sharp";
import { makeRoom, act, project } from "./engine.mjs";
initializeApp();
const db = getFirestore();
export const command = onCall(
  { region: "asia-east1", maxInstances: 10 },
  async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "請重新登入");
  const { action, payload = {}, requestId } = request.data || {};
  if (typeof requestId !== "string" || requestId.length > 80)
    throw new HttpsError("invalid-argument", "缺少請求識別");
  let code = String(payload.code || "").toUpperCase();
  if (action === "create")
    code = Array.from(
      { length: 6 },
      () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(31)],
    ).join("");
  if (!/^[A-Z2-9]{6}$/.test(code))
    throw new HttpsError("invalid-argument", "請輸入六位房間碼");
  let removedPath = null;
  let closedByHost = false;
  if (action === "photo") {
    const expected = `rooms/${code}/${uid}/${payload.mission}.jpg`;
    if (payload.path !== expected)
      throw new HttpsError("invalid-argument", "圖片路徑錯誤");
    try {
      const file = getStorage().bucket().file(expected);
      const [meta] = await file.getMetadata();
      if (
        Number(meta.size) > 2 * 1024 * 1024 ||
        meta.contentType !== "image/jpeg"
      )
        throw new Error("圖片大小或格式錯誤");
      const [bytes] = await file.download();
      const image = sharp(bytes, {
        limitInputPixels: 2560000,
        failOn: "warning",
      });
      const info = await image.metadata();
      if (info.format !== "jpeg" || info.width > 1600 || info.height > 1600)
        throw new Error("請使用 1600px 以內的 JPEG");
      await image.raw().toBuffer();
    } catch (e) {
      throw new HttpsError(
        "failed-precondition",
        `請先上傳有效圖片：${e.message}`,
      );
    }
  }
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`internal/${code}`);
      const snap = await tx.get(ref);
      let s;
      if (action === "create") {
        if (snap.exists) throw new Error("房間碼碰撞，請重試");
        s = makeRoom(uid, payload.name);
      } else {
        if (!snap.exists) throw new Error("找不到房間");
        s = snap.data();
        if (s.requests?.includes(`${uid}:${requestId}`)) return;
        if (action === "deletePhoto") {
          removedPath = s.photos.find((p) => p.id === payload.id)?.path || null;
        }
        act(s, uid, action, { ...payload, code });
        closedByHost = action === "leave" && !!s.closed;
      }
      s.requests = [...(s.requests || []), `${uid}:${requestId}`].slice(-100);
      if (Buffer.byteLength(JSON.stringify(s), "utf8") > 800000)
        throw new Error("房間內容已滿，請刪除部分題目或留言");
      tx.set(ref, s);
      tx.set(db.doc(`rooms/${code}`), {
        host: s.host,
        members: Object.keys(s.members),
        expiresAt: s.expiresAt,
      });
      for (const player of Object.keys(s.members))
        tx.set(db.doc(`rooms/${code}/views/${player}`), project(s, player));
      if (action === "kick" || action === "leave")
        tx.delete(
          db.doc(
            `rooms/${code}/views/${action === "kick" ? payload.uid : uid}`,
          ),
        );
      for (const m of s.missions)
        for (const member of m.owner ? [m.owner] : Object.keys(s.members)) {
          const photo = s.photos.find(
            (p) => p.mission === m.id && p.owner === member,
          );
          tx.set(db.doc(`rooms/${code}/access/${member}_${m.id}`), {
            owner: member,
            deadline: m.deadline,
            visible: !!(m.revealed && photo?.status === "approved"),
            submitted: !!photo,
          });
        }
    });
    if (removedPath)
      await getStorage()
        .bucket()
        .file(removedPath)
        .delete({ ignoreNotFound: true });
    if (closedByHost) {
      try {
        await Promise.all([
          getStorage()
            .bucket()
            .deleteFiles({ prefix: `rooms/${code}/` }),
          db.recursiveDelete(db.doc(`rooms/${code}`)),
        ]);
        await db.doc(`internal/${code}`).delete();
      } catch (cleanupError) {
        // The expired internal record remains so the daily cleanup retries safely.
        console.error("Closed room cleanup pending", code, cleanupError);
      }
    }
    return { code };
  } catch (e) {
    console.error("Command failed", action, e.message);
    throw new HttpsError(
      "failed-precondition",
      e.message || "操作失敗，請再試一次",
    );
  }
  },
);
// Seven-day rooms have a daily server-side cleanup, including all image objects and private views.
export const cleanup = onSchedule(
  { schedule: "every 24 hours", region: "asia-east1" },
  async () => {
  const expired = await db
    .collection("internal")
    .where("expiresAt", "<", Date.now())
    .get();
  for (const room of expired.docs) {
    await getStorage()
      .bucket()
      .deleteFiles({ prefix: `rooms/${room.id}/` });
    await db.recursiveDelete(db.doc(`rooms/${room.id}`));
    await room.ref.delete();
  }
  },
);
