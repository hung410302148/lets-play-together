import { randomInt, randomUUID } from "node:crypto";
export const seeds = [
  "誰最會讓冷場重新熱起來？",
  "誰是大家心中的最佳旅伴？",
  "誰最會記得每個人的小習慣？",
  "誰最有行動力，把想法變成真的？",
  "誰最會照顧身邊的人？",
  "誰最能把平凡的一天變有趣？",
  "誰是最值得信賴的導航員？",
  "誰最會找到好吃好玩的地方？",
  "誰最有可能完成一個瘋狂夢想？",
  "誰最適合當團隊的氣氛擔當？",
  "誰最會發現別人沒注意到的細節？",
  "誰最能在關鍵時刻保持冷靜？",
];
const id = () => randomUUID();
const fail = (message) => {
  throw new Error(message);
};
const text = (v, n = 300) =>
  typeof v === "string" && v.trim().length && v.trim().length <= n
    ? v.trim()
    : fail("文字不可空白或過長");
const canHost = (name) => {
  const value = typeof name === "string" ? name.trim() : "";
  return /^\*[^*]+\*$/.test(value);
};
export function makeRoom(uid, name, now = Date.now()) {
  if (!canHost(name)) fail("無法建立房間");
  return {
    host: uid,
    createdAt: now,
    expiresAt: now + 7 * 86400000,
    mode: "lobby",
    members: { [uid]: { name: text(name, 16), seen: now } },
    banned: [],
    questions: seeds.map((t) => ({
      id: id(),
      text: t,
      mode: "likely",
      status: "approved",
      author: "系統題庫",
      source: "system",
      target: "",
    })),
    current: { box: null, likely: null },
    rounds: {},
    missions: [],
    photos: [],
    comments: [],
    reactions: {},
    photoVotes: {},
    notifications: [],
    anonymous: true,
  };
}
export function act(s, uid, a, p = {}, now = Date.now()) {
  if (s.expiresAt < now) fail("房間已到期");
  if (s.banned.includes(uid)) fail("你已被主持人移出房間");
  // Migrate questions submitted by earlier versions into the new direct-to-pool flow.
  for (const question of s.questions || [])
    if (question.status === "pending") question.status = "approved";
  if (a === "join") {
    if (Object.keys(s.members).length >= 40 && !s.members[uid])
      fail("房間已滿");
    s.members[uid] = { name: text(p.name, 16), seen: now };
    return;
  }
  if (!s.members[uid]) fail("請先加入房間");
  const host = () => {
    if (s.host !== uid) fail("只有主持人可以操作");
  };
  const q = () => s.questions.find((x) => x.id === p.id) || fail("找不到題目");
  const notify = (t) => {
    s.notifications.push({ id: id(), text: t, at: now });
    s.notifications = s.notifications.slice(-15);
  };
  const visiblePhoto = (x) =>
    x.status === "approved" &&
    s.missions.find((m) => m.id === x.mission)?.revealed;
  switch (a) {
    case "presence":
      s.members[uid].seen = now;
      break;
    case "rename":
      if (uid === s.host && !canHost(p.name)) fail("無法更新暱稱");
      s.members[uid].name = text(p.name, 16);
      break;
    case "leave":
      if (uid === s.host) {
        s.closed = true;
        s.expiresAt = now;
        s.members = {};
      } else delete s.members[uid];
      break;
    case "transfer":
      host();
      if (!s.members[p.uid]) fail("玩家不存在");
      if (!canHost(s.members[p.uid].name)) fail("無法移交主持人");
      s.host = p.uid;
      notify("主持人已移交");
      break;
    case "kick":
      host();
      if (p.uid === uid) fail("不能移除自己");
      s.banned.push(p.uid);
      delete s.members[p.uid];
      notify("主持人已更新成員");
      break;
    case "mode":
      host();
      if (!["lobby", "box", "likely", "photo"].includes(p.mode))
        fail("無效模式");
      s.mode = p.mode;
      notify(
        `主持人切換到 ${{ lobby: "大廳", box: "聊聊箱", likely: "誰最棒", photo: "今日任務" }[p.mode]}`,
      );
      break;
    case "anonymous":
      host();
      s.anonymous = !!p.value;
      break;
    case "submit":
      if (!["box", "likely"].includes(p.mode)) fail("無效模式");
      if (s.questions.length >= 250) fail("題庫已滿");
      if (p.target && !s.members[p.target]) fail("對象不存在");
      s.questions.push({
        id: id(),
        text: text(p.text),
        mode: p.mode,
        status: "approved",
        owner: uid,
        author: p.anonymous ? "匿名" : s.members[uid].name,
        target: p.target || "",
        source: "player",
      });
      break;
    case "moderate":
      host();
      if (!["approved", "hidden", "played", "deleted"].includes(p.status))
        fail("無效狀態");
      {
        const item = q();
        item.status = p.status;
        if (p.status !== "approved" && s.current[item.mode] === item.id)
          s.current[item.mode] = null;
        if (p.status === "deleted") {
          s.questions = s.questions.filter((q) => q.id !== item.id);
          const removed = s.comments
            .filter((c) => c.target === item.id)
            .map((c) => c.id);
          s.comments = s.comments.filter((c) => c.target !== item.id);
          for (const key of [item.id, ...removed]) delete s.reactions[key];
        }
      }
      break;
    case "draw":
      host();
      {
        const mode = p.mode;
        if (!["box", "likely"].includes(mode)) fail("無效模式");
        const old = s.questions.find((x) => x.id === s.current[mode]);
        if (old) old.status = "played";
        const candidates = s.questions.filter(
          (x) =>
            x.mode === mode &&
            x.status === "approved" &&
            (!p.source || x.source === p.source),
        );
        const next = p.id
          ? candidates.find((x) => x.id === p.id)
          : candidates[randomInt(Math.max(1, candidates.length))];
        s.current[mode] = next?.id || null;
        if (next && mode === "likely") {
          const rid = id();
          s.rounds[rid] = {
            id: rid,
            question: next.id,
            locked: false,
            anonymous: s.anonymous,
            votes: {},
            electorate: Object.keys(s.members),
          };
          s.round = rid;
        }
        notify(next ? "新題目來了" : "題庫已抽完，歡迎投稿");
      }
      break;
    case "pass":
      {
        const item = q();
        if (item.mode !== "box" || s.current.box !== item.id)
          fail("這不是目前題目");
        if (item.target && item.target !== uid && s.host !== uid)
          fail("只有回答者能 PASS");
        item.passed = true;
        item.status = "played";
      }
      break;
    case "vote":
      {
        const r = s.rounds[p.round];
        if (!r || r.id !== s.round || r.locked) fail("投票已關閉");
        if (
          !r.electorate.includes(uid) ||
          !r.electorate.includes(p.target) ||
          !s.members[p.target]
        )
          fail("不在本輪名單");
        r.votes[uid] = p.target;
      }
      break;
    case "lock":
      host();
      {
        const r = s.rounds[s.round];
        if (!r) fail("尚未開始");
        r.locked = true;
        notify("投票結果公布了");
      }
      break;
    case "mission":
      host();
      {
        const deadline = Number(p.deadline);
        if (
          !Number.isFinite(deadline) ||
          deadline <= now ||
          deadline > s.expiresAt
        )
          fail("截止時間須在現在之後、房間到期之前");
        if (
          s.missions.reduce((n, m) => n + (m.owner ? 1 : 40), 0) +
            (p.private ? Object.keys(s.members).length : 40) >
          200
        )
          fail("本房間任務已滿，請另開新房間");
        const title = text(p.text);
        if (p.private) {
          for (const member of Object.keys(s.members))
            s.missions.push({
              id: id(),
              text: text(p.assignments?.[member] || title),
              owner: member,
              deadline,
              revealed: false,
              settled: false,
            });
        } else
          s.missions.push({
            id: id(),
            text: title,
            owner: null,
            deadline,
            revealed: false,
            settled: false,
          });
        notify("新的今日任務已發布");
      }
      break;
    case "photo":
      {
        const m = s.missions.find((x) => x.id === p.mission);
        if (
          !m ||
          m.deadline <= now ||
          m.revealed ||
          (m.owner && m.owner !== uid)
        )
          fail("任務已截止或無權投稿");
        const path = `rooms/${p.code}/${uid}/${m.id}.jpg`;
        if (p.path !== path) fail("圖片路徑錯誤");
        const existing = s.photos.find(
          (x) => x.mission === m.id && x.owner === uid,
        );
        if (existing) fail("請先刪除舊作品");
        s.photos.push({
          id: id(),
          mission: m.id,
          owner: uid,
          path,
          caption: text(p.caption || "今天的作品", 120),
          status: "pending",
        });
      }
      break;
    case "reviewPhoto":
      host();
      {
        const photo = s.photos.find((x) => x.id === p.id) || fail("找不到作品");
        if (!["approved", "hidden"].includes(p.status)) fail("無效狀態");
        photo.status = p.status;
      }
      break;
    case "deletePhoto":
      {
        const photo = s.photos.find((x) => x.id === p.id) || fail("找不到作品");
        if (photo.owner !== uid) host();
        s.photos = s.photos.filter((x) => x.id !== p.id);
      }
      break;
    case "revealPhotos":
      host();
      {
        const m = s.missions.find((x) => x.id === p.id) || fail("找不到任務");
        m.deadline = Math.min(now, m.deadline);
        m.revealed = true;
        notify("晚間作品展開放了");
      }
      break;
    case "settle":
      host();
      s.missions.forEach((m) => {
        if (m.revealed) m.settled = true;
      });
      notify("今日任務已結算");
      break;
    case "photoVote":
      {
        const photo = s.photos.find((x) => x.id === p.id);
        if (
          !photo ||
          !visiblePhoto(photo) ||
          s.missions.find((x) => x.id === photo.mission).settled
        )
          fail("目前不能投票");
        s.photoVotes[`${photo.mission}:${uid}`] = photo.id;
      }
      break;
    case "comment":
      {
        if (s.comments.length >= 500) fail("留言已滿");
        if (!canDiscuss(s, uid, p.target)) fail("內容尚未公開");
        s.comments.push({
          id: id(),
          target: p.target,
          uid,
          name: s.members[uid].name,
          text: text(p.text, 240),
          at: now,
        });
      }
      break;
    case "deleteComment":
      {
        const c = s.comments.find((x) => x.id === p.id) || fail("留言不存在");
        if (c.uid !== uid) host();
        s.comments = s.comments.filter((x) => x.id !== p.id);
      }
      break;
    case "react":
      if (!["👍", "❤️", "😂", "😮", "😢", "😡", null].includes(p.emoji))
        fail("無效表情");
      if (
        !canDiscuss(s, uid, p.target) &&
        !s.comments.some(
          (c) => c.id === p.target && canDiscuss(s, uid, c.target),
        )
      )
        fail("內容尚未公開");
      s.reactions[p.target] ??= {};
      if (p.emoji) s.reactions[p.target][uid] = p.emoji;
      else delete s.reactions[p.target][uid];
      break;
    default:
      fail("不支援的操作");
  }
}
function canDiscuss(s, uid, target) {
  return (
    s.questions.some(
      (q) => q.id === target && ["approved", "played"].includes(q.status),
    ) ||
    s.photos.some(
      (p) =>
        p.id === target &&
        p.status === "approved" &&
        s.missions.find((m) => m.id === p.mission)?.revealed,
    )
  );
}
export function tally(votes, members) {
  const counts = {};
  Object.values(votes).forEach((uid) => (counts[uid] = (counts[uid] || 0) + 1));
  const max = Math.max(0, ...Object.values(counts));
  return {
    counts,
    winners: Object.keys(counts).filter((k) => counts[k] === max),
    unique: Object.keys(counts).filter((k) => counts[k] === 1),
    total: Object.values(votes).length,
    names: Object.fromEntries(
      Object.entries(members).map(([u, m]) => [u, m.name]),
    ),
  };
}
export function project(s, uid = null) {
  const isHost = uid === s.host;
  const questions = s.questions
    .filter(
      (q) =>
        q.status !== "deleted" &&
        (isHost ||
          q.owner === uid ||
          ["approved", "played"].includes(q.status)),
    )
    .map(({ owner, ...q }) => q);
  const missions = s.missions.filter(
    (m) => isHost || !m.owner || m.owner === uid || m.revealed,
  );
  const photos = s.photos.filter(
    (p) =>
      isHost ||
      p.owner === uid ||
      (p.status === "approved" &&
        s.missions.find((m) => m.id === p.mission)?.revealed),
  );
  const targetIds = new Set([
    ...questions
      .filter((q) => ["approved", "played"].includes(q.status))
      .map((q) => q.id),
    ...photos
      .filter(
        (p) =>
          p.status === "approved" &&
          s.missions.find((m) => m.id === p.mission)?.revealed,
      )
      .map((p) => p.id),
  ]);
  const comments = s.comments.filter((c) => targetIds.has(c.target));
  comments.forEach((c) => targetIds.add(c.id));
  const r = s.rounds[s.round];
  return {
    host: s.host,
    expiresAt: s.expiresAt,
    mode: s.mode,
    members: s.members,
    current: s.current,
    questions,
    missions,
    photos,
    photoProgress: missions.flatMap((m) =>
      (m.owner ? [m.owner] : Object.keys(s.members)).map((owner) => ({
        mission: m.id,
        owner,
        submitted: s.photos.some(
          (p) => p.mission === m.id && p.owner === owner,
        ),
      })),
    ),
    comments,
    reactions: Object.fromEntries(
      Object.entries(s.reactions).filter(([key]) => targetIds.has(key)),
    ),
    notifications: s.notifications,
    anonymous: s.anonymous,
    round: r
      ? {
          id: r.id,
          question: r.question,
          locked: r.locked,
          eligible: r.electorate,
          received: Object.keys(r.votes).length,
          myVote: r.votes[uid] || null,
          result: r.locked ? tally(r.votes, s.members) : null,
          votes: r.locked && !r.anonymous ? r.votes : null,
        }
      : null,
    photoResults: Object.fromEntries(
      s.missions
        .filter((m) => m.revealed)
        .map((m) => [
          m.id,
          tally(
            Object.fromEntries(
              Object.entries(s.photoVotes).filter(
                ([key, value]) =>
                  key.startsWith(m.id + ":") &&
                  s.photos.some(
                    (p) => p.id === value && p.status === "approved",
                  ),
              ),
            ),
            {},
          ),
        ]),
    ),
    myPhotoVotes: uid
      ? Object.fromEntries(
          Object.entries(s.photoVotes).filter(([key]) =>
            key.endsWith(":" + uid),
          ),
        )
      : {},
  };
}
