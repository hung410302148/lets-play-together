import test from "node:test";
import assert from "node:assert/strict";
import { makeRoom, act, project, tally } from "../functions/engine.mjs";
const setup = () => {
  const s = makeRoom("host", "*主持人*");
  act(s, "alice", "join", { name: "小艾" });
  act(s, "bob", "join", { name: "小柏" });
  return s;
};
test("only a starred nickname can become or remain host", () => {
  assert.throws(() => makeRoom("host", "主持人"), /無法建立房間/);
  const s = setup();
  assert.throws(
    () => act(s, "host", "transfer", { uid: "bob" }),
    /無法移交主持人/,
  );
  assert.throws(
    () => act(s, "host", "rename", { name: "主持人" }),
    /無法更新暱稱/,
  );
  act(s, "bob", "rename", { name: "*小柏*" });
  act(s, "host", "transfer", { uid: "bob" });
  assert.equal(s.host, "bob");
});
test("host-only controls and kicked user cannot rejoin", () => {
  const s = setup();
  assert.throws(() => act(s, "alice", "mode", { mode: "likely" }), /主持人/);
  act(s, "host", "kick", { uid: "alice" });
  assert.throws(() => act(s, "alice", "join", { name: "回來了" }), /移出/);
  assert.throws(() => act(s, "stranger", "presence"), /加入/);
});
test("host leaving closes the room without transferring", () => {
  const s = setup();
  const now = Date.now();
  act(s, "host", "leave", {}, now);
  assert.equal(s.closed, true);
  assert.equal(s.expiresAt, now);
  assert.deepEqual(s.members, {});
  assert.throws(
    () => act(s, "alice", "join", { name: "回來" }, now + 1),
    /到期/,
  );
});
test("anonymous submissions are immediately drawable and strip owner identity", () => {
  const s = setup();
  s.questions.push({
    id: "legacy",
    mode: "box",
    text: "舊投稿",
    status: "pending",
  });
  act(s, "host", "presence");
  assert.equal(s.questions.find((q) => q.id === "legacy").status, "approved");
  act(s, "alice", "submit", { mode: "box", text: "關於明天", anonymous: true });
  const visible = project(s, "bob").questions.find((q) => q.text === "關於明天");
  assert.equal(visible.status, "approved");
  assert.equal(visible.author, "匿名");
  assert.equal(visible.owner, undefined);
});
test("draw never repeats played questions and PASS persists", () => {
  const s = setup();
  act(s, "alice", "submit", {
    mode: "box",
    text: "你今天好嗎",
    anonymous: true,
    target: "alice",
  });
  const q = s.questions.at(-1);
  act(s, "host", "moderate", { id: q.id, status: "approved" });
  act(s, "host", "draw", { mode: "box" });
  assert.throws(() => act(s, "bob", "pass", { id: q.id }), /回答者/);
  act(s, "alice", "pass", { id: q.id });
  assert.equal(project(s, "bob").questions.at(-1).passed, true);
  act(s, "host", "draw", { mode: "box" });
  assert.equal(s.current.box, null);
  assert.equal(q.passed, true);
});
test("votes private before lock, immutable afterward, old rounds rejected", () => {
  const s = setup();
  act(s, "host", "draw", { mode: "likely" });
  const id = s.round;
  act(s, "alice", "vote", { round: id, target: "bob" });
  act(s, "bob", "vote", { round: id, target: "alice" });
  assert.equal(project(s, "host").round.result, null);
  assert.equal(project(s, "host").round.votes, null);
  assert.equal(project(s, "bob").round.myVote, "alice");
  act(s, "host", "lock");
  assert.equal(project(s, "alice").round.result.winners.length, 2);
  assert.equal(project(s, "alice").round.votes, null);
  assert.throws(
    () => act(s, "alice", "vote", { round: id, target: "host" }),
    /關閉/,
  );
  act(s, "host", "draw", { mode: "likely" });
  assert.throws(
    () => act(s, "alice", "vote", { round: id, target: "host" }),
    /關閉/,
  );
});
test("late joiner waits for next round; named setting captured per round", () => {
  const s = setup();
  act(s, "host", "anonymous", { value: false });
  act(s, "host", "draw", { mode: "likely" });
  act(s, "late", "join", { name: "遲到" });
  assert.throws(
    () => act(s, "late", "vote", { round: s.round, target: "host" }),
    /名單/,
  );
  act(s, "alice", "vote", { round: s.round, target: "bob" });
  act(s, "host", "anonymous", { value: true });
  act(s, "host", "lock");
  assert.deepEqual(project(s, "bob").round.votes, { alice: "bob" });
});
test("private mission, deadline, moderation, photo vote and settlement", () => {
  const s = setup();
  const now = Date.now();
  act(
    s,
    "host",
    "mission",
    {
      text: "秘密任務",
      private: true,
      assignments: { alice: "拍紅色", bob: "拍天空" },
      deadline: now + 60000,
    },
    now,
  );
  const a = s.missions.find((m) => m.owner === "alice");
  assert.equal(
    project(s, "bob").missions.some((m) => m.id === a.id),
    false,
  );
  assert.throws(
    () => act(s, "bob", "photo", { mission: a.id, path: "no" }, now),
    /無權/,
  );
  act(
    s,
    "alice",
    "photo",
    { mission: a.id, path: `rooms/ABCDEF/alice/${a.id}.jpg`, code: "ABCDEF" },
    now,
  );
  const photo = s.photos[0];
  assert.equal(project(s, "bob").photos.length, 0);
  assert.throws(() => act(s, "bob", "photoVote", { id: photo.id }), /不能/);
  act(s, "host", "reviewPhoto", { id: photo.id, status: "approved" });
  act(s, "host", "revealPhotos", { id: a.id }, now + 1);
  assert.equal(project(s, "bob").photos.length, 1);
  assert.throws(
    () => act(s, "alice", "photo", { mission: a.id }, now + 2),
    /截止/,
  );
  act(s, "bob", "photoVote", { id: photo.id });
  act(s, "host", "settle");
  assert.throws(() => act(s, "alice", "photoVote", { id: photo.id }), /不能/);
  assert.equal(project(s, "bob").photoResults[a.id].counts[photo.id], 1);
});
test("reactions toggle and shared comments cannot reach private work", () => {
  const s = setup();
  const q = s.questions[0];
  act(s, "alice", "comment", { target: q.id, text: "真的" });
  const c = s.comments[0];
  act(s, "bob", "react", { target: c.id, emoji: "😂" });
  act(s, "bob", "react", { target: c.id, emoji: "❤️" });
  assert.deepEqual(s.reactions[c.id], { bob: "❤️" });
  act(s, "bob", "react", { target: c.id, emoji: null });
  assert.deepEqual(s.reactions[c.id], {});
  assert.throws(() => act(s, "bob", "deleteComment", { id: c.id }), /主持人/);
  assert.throws(
    () => act(s, "alice", "comment", { target: "private", text: "猜到路徑" }),
    /公開/,
  );
});
test("zero votes, ties and unique selections are explicit", () => {
  assert.deepEqual(tally({}, {}).winners, []);
  const r = tally({ a: "x", b: "x", c: "y" }, {});
  assert.deepEqual(r.winners, ["x"]);
  assert.deepEqual(r.unique, ["y"]);
  assert.equal(r.total, 3);
});
