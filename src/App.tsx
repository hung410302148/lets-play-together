import { useEffect, useState, type FormEvent } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getBlob, ref, uploadBytes, deleteObject } from "firebase/storage";
import { db, storage, login, command, emulator } from "./firebase";
import type { Room, Mode, Photo } from "./types";
const labels: Record<Mode, string> = {
  lobby: "遊戲大廳",
  box: "聊聊箱",
  likely: "誰最棒",
  photo: "今日任務",
};
const icons: Record<Mode, string> = {
  lobby: "⌂",
  box: "▣",
  likely: "☞",
  photo: "◎",
};
type Run = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<boolean | void>;
export default function App() {
  const [uid, setUid] = useState(""),
    [code, setCode] = useState(() => {
      const saved = localStorage.getItem("party-room") || "";
      const linked = new URLSearchParams(location.search)
        .get("room")
        ?.toUpperCase();
      return linked && linked !== saved ? "" : saved;
    }),
    [room, setRoom] = useState<Room | null>(null),
    [name, setName] = useState(localStorage.getItem("party-name") || ""),
    [joinCode, setJoinCode] = useState(
      new URLSearchParams(location.search).get("room") || "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [synced, setSynced] = useState(false),
    [tab, setTab] = useState("game"),
    [notice, setNotice] = useState("");
  useEffect(() => {
    login()
      .then((u) => setUid(u.uid))
      .catch((e) =>
        setError("登入失敗。請確認本機 Firebase 已啟動。" + e.message),
      );
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (!uid || !code) return;
    setSynced(false);
    return onSnapshot(
      doc(db, "rooms", code, "views", uid),
      { includeMetadataChanges: true },
      (snap) => {
        setSynced(!snap.metadata.fromCache);
        if (snap.exists()) {
          setRoom(snap.data() as Room);
        } else if (!snap.metadata.fromCache) {
          setError("房間已關閉，或你已被移出。");
          setRoom(null);
          setCode("");
          localStorage.removeItem("party-room");
        }
      },
      (e) => {
        setError("無法同步：" + e.message);
        setSynced(false);
        if (e.code === "permission-denied") {
          setRoom(null);
          setCode("");
          localStorage.removeItem("party-room");
          setError("房間已到期、已關閉，或你已被主持人移出。");
        }
      },
    );
  }, [uid, code]);
  useEffect(() => {
    if (!uid || !code || !online) return;
    const beat = () => command("presence", { code }).catch(() => {});
    void beat();
    const timer = setInterval(beat, 45000);
    return () => clearInterval(timer);
  }, [uid, code, online]);
  async function run(a: string, p: Record<string, unknown> = {}) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await command(a, { ...p, code });
      if (a === "rename") localStorage.setItem("party-name", String(p.name));
      return true;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const safe: Run = async (a, p) => {
    try {
      return await run(a, p);
    } catch {
      return false;
    }
  };
  async function enter(create = false) {
    setBusy(true);
    setError("");
    try {
      const result = await command(create ? "create" : "join", {
        name,
        code: joinCode.trim().toUpperCase(),
      });
      localStorage.setItem("party-name", name);
      localStorage.setItem("party-room", result.code);
      setCode(result.code);
      history.replaceState(null, "", `?room=${result.code}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const host = room?.host === uid;
  async function share() {
    const joinUrl = new URL(import.meta.env.BASE_URL, location.origin);
    joinUrl.searchParams.set("room", code);
    const url = joinUrl.toString();
    try {
      if (navigator.share) await navigator.share({ title: "一起玩吧", url });
      else await navigator.clipboard.writeText(url);
      setNotice("房間網址已分享／複製");
    } catch {
      setNotice(`加入網址：${url}`);
    }
  }
  if (!code)
    return (
      <main className="landing">
        <div className="intro">
          <Brand />
          <p className="eyebrow">COME TOGETHER, PLAY TOGETHER.</p>
          <h1>
            打開手機，
            <br />
            <span>靠近彼此。</span>
          </h1>
          <p>
            人到齊了，好玩的就要開始了。
          </p>
          <div className="mini-cards">
            <span>▣ 聊聊箱</span>
            <span>☞ 誰最棒</span>
            <span>◎ 今日任務</span>
          </div>
        </div>
        <section className="entry">
          <p className="eyebrow">你的活動，從這裡開始</p>
          {joinCode && <h2>有人在等你加入</h2>}
          <label>
            大家怎麼叫你
            <input
              maxLength={16}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="輸入暱稱"
            />
          </label>
          <label>
            房間代碼
            <input
              autoCapitalize="characters"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="6 位房間碼"
            />
          </label>
          <button
            className="primary"
            disabled={busy || !uid || !name.trim() || joinCode.length !== 6}
            onClick={() => enter()}
          >
            加入活動 →
          </button>
          <div className="divider">或，成為這場活動的發起人</div>
          <button
            className="dark"
            disabled={busy || !uid || !name.trim()}
            onClick={() => enter(true)}
          >
            建立新房間
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <small>
            {emulator
              ? "本機測試模式 · Firebase Emulator"
              : "Firebase 安全即時同步"}{" "}
            · 不需註冊帳號
          </small>
        </section>
        <footer>一起玩吧 · 人到齊了，好玩的就要開始了</footer>
      </main>
    );
  return (
    <div className="app">
      <header>
        <Brand />
        <button className="room-code" onClick={share}>
          ROOM <b>{code}</b> ↗
        </button>
        <span
          className={
            online && synced ? "connection" : "connection disconnected"
          }
        >
          {online && synced ? "● 即時連線" : online ? "◌ 重新同步" : "● 離線"}
        </span>
      </header>
      <main className="content">
        {(!online || !synced) && (
          <p className="banner" role="status">
            {online
              ? "正在連線與同步，操作恢復後即可繼續。"
              : "連線中斷，已保留目前畫面。重新連線後再送出操作。"}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>關閉</button>
          </p>
        )}
        {notice && (
          <p className="banner" onClick={() => setNotice("")}>
            {notice}
          </p>
        )}
        {!room ? (
          <section className="panel">
            <h2>正在找到一起玩的夥伴…</h2>
            <button
              onClick={() => {
                setCode("");
                localStorage.removeItem("party-room");
              }}
            >
              返回入口
            </button>
          </section>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {host ? "HOST CONTROL · 主持人" : "GOOD COMPANY · 玩家"}
                </p>
                <h1>
                  {tab === "people"
                    ? "一起玩的夥伴"
                    : tab === "notices"
                      ? "房間動態"
                      : labels[room.mode]}
                </h1>
              </div>
              <span className="pill">
                {Object.keys(room.members).length} 人在房間
              </span>
            </div>
            <fieldset
              disabled={busy || !online || !synced}
              className="workspace"
            >
              {tab === "people" ? (
                <section className="panel">
                  <label>
                    修改我的暱稱
                    <input
                      value={name}
                      maxLength={16}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <button onClick={() => safe("rename", { name })}>
                    儲存暱稱
                  </button>
                  <div className="members">
                    {Object.entries(room.members).map(([id, m]) => (
                      <article key={id}>
                        <span className="avatar">{m.name.slice(0, 1)}</span>
                        <div>
                          <b>
                            {m.name}
                            {id === uid ? "（你）" : ""}
                          </b>
                          <small>
                            {id === room.host ? "主持人 · " : ""}
                            {Date.now() - m.seen < 90000
                              ? "最近在線"
                              : "暫時離線"}
                          </small>
                        </div>
                        {host && id !== uid && (
                          <>
                            <button
                              onClick={() => safe("transfer", { uid: id })}
                            >
                              移交
                            </button>
                            <button
                              className="danger"
                              onClick={() => {
                                if (confirm(`將 ${m.name} 移出房間？`))
                                  void safe("kick", { uid: id });
                              }}
                            >
                              移出
                            </button>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                  <button
                    onClick={async () => {
                      if (
                        host &&
                        !confirm(
                          "關閉房間後，所有玩家都會離開且無法再加入。確定關閉？",
                        )
                      )
                        return;
                      try {
                        await run("leave");
                        setCode("");
                        setRoom(null);
                        localStorage.removeItem("party-room");
                        history.replaceState(null, "", "/");
                      } catch {}
                    }}
                  >
                    {host ? "關閉房間" : "離開房間"}
                  </button>
                  <p className="hint">
                    {host
                      ? "關閉後會立即停止所有人的存取，並清理房間資料與圖片。"
                      : "離開後，其他玩家仍可繼續活動。"}
                  </p>
                </section>
              ) : tab === "notices" ? (
                <section className="panel">
                  {[...room.notifications].reverse().map((n) => (
                    <article key={n.id}>
                      <small>{new Date(n.at).toLocaleTimeString()}</small>
                      <p>{n.text}</p>
                    </article>
                  ))}
                  {!room.notifications.length && (
                    <p>活動才剛開始，還沒有動態。</p>
                  )}
                </section>
              ) : (
                <>
                  {host && room.mode !== "lobby" && (
                    <div className="host-strip">
                      <span>切換遊戲</span>
                      {(["box", "likely", "photo"] as Mode[]).map((m) => (
                        <button
                          key={m}
                          className={m === room.mode ? "selected" : ""}
                          onClick={() => safe("mode", { mode: m })}
                        >
                          {labels[m]}
                        </button>
                      ))}
                      <button onClick={() => safe("mode", { mode: "lobby" })}>
                        回大廳
                      </button>
                    </div>
                  )}
                  {room.mode === "lobby" ? (
                    <Lobby room={room} host={host} run={safe} />
                  ) : room.mode === "photo" ? (
                    <Photos
                      room={room}
                      uid={uid}
                      host={host}
                      code={code}
                      run={run}
                      setError={setError}
                    />
                  ) : (
                    <Questions room={room} uid={uid} host={host} run={safe} />
                  )}
                </>
              )}
            </fieldset>
          </>
        )}
      </main>
      <nav>
        <button
          className={tab === "game" ? "active" : ""}
          onClick={() => setTab("game")}
        >
          ◈<span>玩起來</span>
        </button>
        <button
          className={tab === "people" ? "active" : ""}
          onClick={() => setTab("people")}
        >
          ♧<span>房間成員</span>
        </button>
        <button
          className={tab === "notices" ? "active" : ""}
          onClick={() => setTab("notices")}
        >
          ◷<span>動態</span>
        </button>
      </nav>
      {busy && (
        <div className="toast" role="status">
          正在送出…
        </div>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span>Go</span>
      <b>一起玩吧</b>
    </div>
  );
}
function Lobby({ room, host, run }: { room: Room; host: boolean; run: Run }) {
  return (
    <>
      <section className="welcome">
        <p className="eyebrow">READY WHEN YOU ARE</p>
        <h2>人到齊了，好玩的就要開始了。</h2>
        <p>{host ? "選個遊戲，不暖身!" : "準備好了，主持人就會開始。"}</p>
        <span className="sun">✳</span>
      </section>
      <div className="game-grid">
        {(["box", "likely", "photo"] as Mode[]).map((m, i) => (
          <button
            className={`game-card card-${m}`}
            key={m}
            disabled={!host}
            onClick={() => run("mode", { mode: m })}
          >
            <span className="game-icon">{icons[m]}</span>
            <small>0{i + 1} / PLAY TOGETHER</small>
            <h2>{labels[m]}</h2>
            <p>
              {m === "box"
                ? "有些話，放進箱子比較好說。"
                : m === "likely"
                  ? "把有趣稱號，頒給最符合的那個人。"
                  : "完成一個小任務，帶回你的發現。"}
            </p>
            <b>{host ? "開始遊戲 ↗" : "等主持人開始"}</b>
          </button>
        ))}
      </div>
    </>
  );
}
function Questions({
  room,
  uid,
  host,
  run,
}: {
  room: Room;
  uid: string;
  host: boolean;
  run: Run;
}) {
  const mode = room.mode;
  const [text, setText] = useState(""),
    [anonymous, setAnonymous] = useState(true),
    [target, setTarget] = useState(""),
    [source, setSource] = useState(""),
    [filter, setFilter] = useState("approved");
  const q = room.questions.find((x) => x.id === room.current[mode]);
  const round = room.round;
  return (
    <>
      <section className="panel play-panel">
        <p className="eyebrow">
          {mode === "box" ? "SAY IT YOUR WAY" : "THE PEOPLE HAVE SPOKEN"}
        </p>
        <h2 className="question">{q?.text || "先收集一點，大家想聊的事。"}</h2>
        {q && (
          <>
            <p className="hint">
              {q.author}
              {q.target
                ? ` → ${room.members[q.target]?.name || "已離開玩家"}`
                : ""}
            </p>
            {mode === "box" ? (
              <>
                <div className="pass-row">
                  <span>
                    {q.passed ? "這題已 PASS，沒關係。" : "不想回答也沒關係。"}
                  </span>
                  <button
                    className="dark"
                    disabled={
                      !!q.passed || !!(q.target && q.target !== uid && !host)
                    }
                    onClick={() => run("pass", { id: q.id })}
                  >
                    PASS
                  </button>
                </div>
                <Discussion target={q.id} room={room} uid={uid} run={run} />
              </>
            ) : (
              round && (
                <>
                  {!round.locked ? (
                    <>
                      <div className="vote-grid">
                        {round.eligible.map((id) => (
                          <button
                            key={id}
                            disabled={
                              !room.members[id] || !round.eligible.includes(uid)
                            }
                            className={round.myVote === id ? "chosen" : ""}
                            onClick={() =>
                              run("vote", { round: round.id, target: id })
                            }
                          >
                            <span className="avatar">
                              {room.members[id]?.name.slice(0, 1) || "?"}
                            </span>
                            {room.members[id]?.name || "已離開"}
                            {round.myVote === id ? " ✓" : ""}
                          </button>
                        ))}
                      </div>
                      <p className="hint">
                        {round.myVote
                          ? "✓ 已投票，可在鎖票前修改。"
                          : "選一位最符合這題的夥伴。"}{" "}
                        {round.received} / {round.eligible.length} 人已投票
                      </p>
                      {!round.eligible.includes(uid) && (
                        <p className="banner">
                          你在本題開始後加入，下一題即可投票。
                        </p>
                      )}
                    </>
                  ) : (
                    round.result && (
                      <div className="results">
                        <p className="eyebrow">
                          一起揭曉 · {round.result.total} 票
                        </p>
                        <h2>
                          {round.result.winners.length > 1
                            ? "平手！默契有兩種以上。"
                            : round.result.winners.length
                              ? "這一題的最高票"
                              : "本輪無人投票"}
                        </h2>
                        {Object.entries(round.result.counts)
                          .sort((a, b) => b[1] - a[1])
                          .map(([id, n]) => (
                            <div className="result-row" key={id}>
                              <b>
                                {room.members[id]?.name || "已離開玩家"}{" "}
                                {round.result!.winners.includes(id) ? "♛" : ""}
                              </b>
                              <meter
                                min={0}
                                max={Math.max(1, round.result!.total)}
                                value={n}
                              />
                              <span>{n} 票</span>
                            </div>
                          ))}
                        <p>
                          唯一選擇（只收到一票）：
                          {round.result.unique
                            .map((id) => room.members[id]?.name || "已離開玩家")
                            .join("、") || "沒有"}
                        </p>
                        {round.votes && (
                          <details>
                            <summary>具名票單</summary>
                            {Object.entries(round.votes).map(([from, to]) => (
                              <p key={from}>
                                {room.members[from]?.name || "已離開"} →{" "}
                                {room.members[to]?.name || "已離開"}
                              </p>
                            ))}
                          </details>
                        )}
                      </div>
                    )
                  )}
                  {host && (
                    <button
                      className="primary"
                      disabled={round.locked}
                      onClick={() => run("lock")}
                    >
                      鎖票並同時公布
                    </button>
                  )}
                  <Discussion target={q.id} room={room} uid={uid} run={run} />
                </>
              )
            )}
          </>
        )}
        {host && (
          <div className="host-controls">
            {mode === "likely" && (
              <>
                <label>
                  抽題來源
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="">全部核准題目</option>
                    <option value="system">系統題庫</option>
                    <option value="player">玩家投稿</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={room.anonymous}
                    onChange={(e) =>
                      run("anonymous", { value: e.target.checked })
                    }
                  />
                  匿名投票（套用下一題；關閉則公布票單）
                </label>
              </>
            )}
            <button
              className="primary"
              onClick={() => run("draw", { mode, source })}
            >
              {q ? "完成本題，隨機下一題" : "隨機抽一題"}
            </button>
            {q && (
              <div className="actions">
                <button onClick={() => run("draw", { mode, source })}>
                  跳題／重抽
                </button>
                <button
                  onClick={() =>
                    run("moderate", { id: q.id, status: "played" })
                  }
                >
                  標記已玩
                </button>
              </div>
            )}
            <small>抽走的題目會標記已玩，不會自動重複出現。</small>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>把問題放進箱子</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              (await run("submit", { mode, text, anonymous, target })) !== false
            )
              setText("");
          }}
        >
          <label>
            {mode === "box" ? "關於我，或關於你" : "你想頒給誰一個什麼稱號？"}
            <textarea
              value={text}
              maxLength={300}
              required
              onChange={(e) => setText(e.target.value)}
              placeholder="不用很有梗，真心也很好。"
            />
          </label>
          {mode === "box" && (
            <label>
              想問誰
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">大家一起聊</option>
                {Object.entries(room.members).map(([id, m]) => (
                  <option key={id} value={id}>
                    {m.name}
                    {id === uid ? "（關於我）" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            匿名投稿
          </label>
          <button className="dark">加入可抽題庫</button>
        </form>
      </section>
      <section className="panel">
        <h2>{host ? "主持人題目管理" : "我的投稿與公開題目"}</h2>
        <div className="actions">
          {[
            ["approved", "可抽取"],
            ["hidden", "已隱藏"],
            ["played", "已玩"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={filter === v ? "selected" : ""}
              onClick={() => setFilter(v)}
            >
              {l}{" "}
              {
                room.questions.filter((q) => q.mode === mode && q.status === v)
                  .length
              }
            </button>
          ))}
        </div>
        <div className="queue">
          {room.questions
            .filter((q) => q.mode === mode && q.status === filter)
            .map((q) => (
              <article key={q.id}>
                <small>
                  {q.author} · {q.source === "system" ? "系統" : "玩家"}
                </small>
                <p>{q.text}</p>
                {host && (
                  <div className="actions">
                    <button
                      onClick={() =>
                        run("moderate", { id: q.id, status: "approved" })
                      }
                    >
                      核准／恢復
                    </button>
                    {q.status === "approved" && (
                      <button onClick={() => run("draw", { mode, id: q.id })}>
                        指定這題
                      </button>
                    )}
                    <button
                      onClick={() =>
                        run("moderate", { id: q.id, status: "hidden" })
                      }
                    >
                      隱藏
                    </button>
                    <button
                      onClick={() =>
                        run("moderate", { id: q.id, status: "played" })
                      }
                    >
                      已玩
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        if (confirm("確定刪除這個題目？"))
                          void run("moderate", { id: q.id, status: "deleted" });
                      }}
                    >
                      刪除
                    </button>
                  </div>
                )}
              </article>
            ))}
          {!room.questions.some(
            (q) => q.mode === mode && q.status === filter,
          ) && <p className="empty">箱子暫時空著，讓靈感慢慢來。</p>}
        </div>
      </section>
    </>
  );
}
function Reactions({
  target,
  room,
  uid,
  run,
}: {
  target: string;
  room: Room;
  uid: string;
  run: Run;
}) {
  const [open, setOpen] = useState(false);
  const entries = room.reactions[target] || {};
  const selected = entries[uid];
  return (
    <div className="reaction-wrap">
      <button
        aria-label="選擇表情反應"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ☺ ＋
      </button>
      {(open
        ? ["👍", "❤️", "😂", "😮", "😢", "😡"]
        : [...new Set(Object.values(entries))]
      ).map((emoji) => (
        <button
          key={emoji}
          aria-pressed={selected === emoji}
          className={selected === emoji ? "selected" : ""}
          onClick={() => {
            void run("react", {
              target,
              emoji: selected === emoji ? null : emoji,
            });
            setOpen(false);
          }}
        >
          {emoji}{" "}
          <small>
            {Object.values(entries).filter((e) => e === emoji).length || ""}
          </small>
        </button>
      ))}
    </div>
  );
}
function Discussion({
  target,
  room,
  uid,
  run,
}: {
  target: string;
  room: Room;
  uid: string;
  run: Run;
}) {
  const [value, setValue] = useState("");
  return (
    <section className="discussion">
      <Reactions target={target} room={room} uid={uid} run={run} />
      {room.comments
        .filter((c) => c.target === target)
        .map((c) => (
          <div className="comment" key={c.id}>
            <small>{c.name}</small>
            <p>{c.text}</p>
            <Reactions target={c.id} room={room} uid={uid} run={run} />
            {(c.uid === uid || room.host === uid) && (
              <button onClick={() => run("deleteComment", { id: c.id })}>
                刪除留言
              </button>
            )}
          </div>
        ))}
      <form
        className="comment-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if ((await run("comment", { target, text: value })) !== false)
            setValue("");
        }}
      >
        <input
          aria-label="留言"
          maxLength={240}
          value={value}
          required
          onChange={(e) => setValue(e.target.value)}
          placeholder="留言..."
        />
        <button>送出</button>
      </form>
    </section>
  );
}
async function compress(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("請選擇 10 MB 以內的 JPG、PNG 或 WebP");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 60000000) {
    bitmap.close();
    throw new Error("圖片像素過大，請先縮小圖片");
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("無法壓縮圖片"))),
      "image/jpeg",
      0.82,
    ),
  );
  if (blob.size > 2 * 1024 * 1024)
    throw new Error("壓縮後仍超過 2 MB，請換一張照片");
  return blob;
}
function PhotoRanking({ room }: { room: Room }) {
  const settled = room.missions.filter((m) => m.settled).map((m) => m.id);
  if (!settled.length) return null;
  const totals: Record<string, number> = {};
  for (const p of room.photos.filter(
    (p) => p.status === "approved" && settled.includes(p.mission),
  ))
    totals[p.owner] =
      (totals[p.owner] || 0) +
      (room.photoResults[p.mission]?.counts[p.id] || 0);
  const ranking = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return (
    <section className="results">
      <p className="eyebrow">MISSION HIGHLIGHTS</p>
      <h2>跨任務總排行</h2>
      {ranking.map(([id, total]) => (
        <div className="result-row" key={id}>
          <span>{ranking.findIndex(([, n]) => n === total) + 1}</span>
          <b>{room.members[id]?.name || "已離開玩家"}</b>
          <span>{total} 票</span>
        </div>
      ))}
      <small>加總已結算任務的核准作品票數；同票並列。</small>
    </section>
  );
}
function PhotoImage({ photo }: { photo: Photo }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      objectUrl = "";
    getBlob(ref(storage, photo.path))
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => setError("圖片載入失敗，請重新整理重試"));
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [photo.path]);
  return url ? (
    <img className="photo" src={url} alt={photo.caption} />
  ) : (
    <div className="photo-placeholder">{error || "照片載入中…"}</div>
  );
}
function Photos({
  room,
  uid,
  host,
  code,
  run,
  setError,
}: {
  room: Room;
  uid: string;
  host: boolean;
  code: string;
  run: Run;
  setError: (s: string) => void;
}) {
  const [text, setText] = useState(""),
    [privateTask, setPrivateTask] = useState(false),
    [assignments, setAssignments] = useState<Record<string, string>>({}),
    [deadline, setDeadline] = useState(() => {
      const d = new Date();
      d.setHours(20, 0, 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }),
    [uploading, setUploading] = useState("");
  const safe: Run = async (a, p) => {
    try {
      await run(a, p);
    } catch {}
  };
  async function upload(e: FormEvent<HTMLFormElement>, mission: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("photo") as File;
    setUploading(mission);
    let path = "";
    try {
      const blob = await compress(file);
      path = `rooms/${code}/${uid}/${mission}.jpg`;
      await uploadBytes(ref(storage, path), blob, {
        contentType: "image/jpeg",
        cacheControl: "private,max-age=0",
      });
      await run("photo", {
        mission,
        path,
        caption: String(data.get("caption") || "今天的作品"),
      });
      form.reset();
    } catch (e) {
      if (path) await deleteObject(ref(storage, path)).catch(() => {});
      setError((e as Error).message);
    } finally {
      setUploading("");
    }
  }
  return (
    <>
      {host && (
        <section className="panel">
          <p className="eyebrow">TODAY'S CHALLENGE</p>
          <h2>發出一個任務，看看大家帶回什麼。</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await run("mission", {
                  text,
                  private: privateTask,
                  assignments,
                  deadline: new Date(deadline).getTime(),
                });
                setText("");
              } catch {}
            }}
          >
            <label>
              任務內容
              <textarea
                required
                maxLength={300}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="拍下今天最像電影的一個瞬間"
              />
            </label>
            <label>
              投稿截止
              <input
                type="datetime-local"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={privateTask}
                onChange={(e) => setPrivateTask(e.target.checked)}
              />
              每人不同的私人任務
            </label>
            {privateTask &&
              Object.entries(room.members).map(([id, m]) => (
                <label key={id}>
                  {m.name} 的私人任務
                  <input
                    maxLength={300}
                    value={assignments[id] || ""}
                    onChange={(e) =>
                      setAssignments({ ...assignments, [id]: e.target.value })
                    }
                    placeholder="留白時使用上方任務"
                  />
                </label>
              ))}
            <button className="primary">發布今日任務</button>
          </form>
        </section>
      )}
      {!room.missions.length && (
        <section className="panel empty">
          <span className="game-icon">◎</span>
          <h2>今天，會留下什麼畫面？</h2>
          <p>等待主持人發布第一個任務。</p>
        </section>
      )}
      <PhotoRanking room={room} />
      {room.missions.map((m) => {
        const mine = room.photos.find(
          (p) => p.mission === m.id && p.owner === uid,
        );
        const photos = room.photos.filter((p) => p.mission === m.id);
        return (
          <section className="panel" key={m.id}>
            <div className="section-title">
              <span className="pill">
                {m.owner ? "私人任務" : "共同任務"} ·{" "}
                {m.settled
                  ? "已結算"
                  : m.revealed
                    ? "成果展"
                    : Date.now() > m.deadline
                      ? "已截止"
                      : "進行中"}
              </span>
              {mine && <span className="pill">✓ 已完成投稿</span>}
            </div>
            <h2>{m.text}</h2>
            {m.owner && (
              <p className="hint">
                任務對象：{room.members[m.owner]?.name || "已離開"}
              </p>
            )}
            <p className="hint">
              截止 {new Date(m.deadline).toLocaleString()} · {photos.length}{" "}
              件可見成果
            </p>
            <details>
              <summary>查看任務完成狀態</summary>
              <div className="actions">
                {room.photoProgress
                  ?.filter((p) => p.mission === m.id)
                  .map((p) => (
                    <span className="pill" key={p.owner}>
                      {room.members[p.owner]?.name || "已離開"} ·{" "}
                      {p.submitted ? "✓ 已投稿" : "待完成"}
                    </span>
                  ))}
              </div>
            </details>
            {(!m.owner || m.owner === uid) &&
              !mine &&
              !m.revealed &&
              Date.now() < m.deadline && (
                <form onSubmit={(e) => upload(e, m.id)}>
                  <label>
                    上傳任務成果
                    <input
                      name="photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      required
                    />
                  </label>
                  <label>
                    成果說明
                    <input
                      name="caption"
                      maxLength={120}
                      placeholder="為這個瞬間留一句話"
                    />
                  </label>
                  <small>
                    限 JPG／PNG／WebP，原檔 ≤10 MB；自動縮至 1600px、JPEG ≤2
                    MB，移除照片定位資訊。目前成果回覆先支援圖片。
                  </small>
                  <button className="dark" disabled={!!uploading}>
                    {uploading === m.id ? "正在壓縮與上傳…" : "提交任務成果"}
                  </button>
                </form>
              )}
            {host && (
              <div className="actions">
                <button
                  disabled={m.revealed}
                  onClick={() => safe("revealPhotos", { id: m.id })}
                >
                  截止並公開核准成果
                </button>
                {m.revealed && (
                  <button disabled={m.settled} onClick={() => safe("settle")}>
                    結算所有已公開任務
                  </button>
                )}
              </div>
            )}
            <div className="photo-grid">
              {photos.map((p) => (
                <article key={p.id}>
                  <PhotoImage photo={p} />
                  <h3>{p.caption}</h3>
                  <small>
                    {room.members[p.owner]?.name || "已離開玩家"} ·{" "}
                    {
                      {
                        pending: "待主持人審核",
                        approved: "已核准",
                        hidden: "已隱藏",
                      }[p.status]
                    }
                  </small>
                  {(host || uid === p.owner) && (
                    <div className="actions">
                      {host && (
                        <>
                          <button
                            onClick={() =>
                              safe("reviewPhoto", {
                                id: p.id,
                                status: "approved",
                              })
                            }
                          >
                            核准
                          </button>
                          <button
                            onClick={() =>
                              safe("reviewPhoto", {
                                id: p.id,
                                status: "hidden",
                              })
                            }
                          >
                            隱藏
                          </button>
                        </>
                      )}
                      <button
                        className="danger"
                        onClick={() => {
                          if (confirm("刪除成果及儲存圖片？"))
                            void safe("deletePhoto", { id: p.id });
                        }}
                      >
                        刪除成果
                      </button>
                    </div>
                  )}
                  {m.revealed && p.status === "approved" && (
                    <>
                      <button
                        disabled={m.settled}
                        className={
                          room.myPhotoVotes[`${m.id}:${uid}`] === p.id
                            ? "selected"
                            : ""
                        }
                        onClick={() => safe("photoVote", { id: p.id })}
                      >
                        {room.myPhotoVotes[`${m.id}:${uid}`] === p.id
                          ? "✓ 已投給這張"
                          : "投給這張"}{" "}
                        · {room.photoResults[m.id]?.counts[p.id] || 0} 票
                      </button>
                      <Discussion
                        target={p.id}
                        room={room}
                        uid={uid}
                        run={safe}
                      />
                    </>
                  )}
                </article>
              ))}
            </div>
            {m.settled && (
              <div className="results">
                <h2>任務成果排行</h2>
                {photos
                  .filter((p) => p.status === "approved")
                  .sort(
                    (a, b) =>
                      (room.photoResults[m.id]?.counts[b.id] || 0) -
                      (room.photoResults[m.id]?.counts[a.id] || 0),
                  )
                  .map((p) => (
                    <p key={p.id}>
                      {room.photoResults[m.id]?.winners.includes(p.id)
                        ? "♛ "
                        : ""}
                      {p.caption} — {room.photoResults[m.id]?.counts[p.id] || 0}{" "}
                      票
                    </p>
                  ))}
                <small>最高票相同時並列；每位玩家每個任務一票。</small>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
