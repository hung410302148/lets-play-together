import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
try {
  const host = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    guest = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const h = await host.newPage(),
    g = await guest.newPage();
  for (const p of [h, g]) p.on("pageerror", (e) => errors.push(e.message));
  await mkdir("evidence", { recursive: true });
  await h.goto("http://127.0.0.1:15173");
  await expect(h.getByRole("button", { name: "建立新房間" })).toBeVisible();
  await h.screenshot({ path: "evidence/desktop-entry.png", fullPage: true });
  await h.getByLabel("大家怎麼叫你").fill("*小夜*");
  await h.getByRole("button", { name: "建立新房間" }).click();
  await expect(
    h.getByRole("heading", { name: "人到齊了，好玩的就要開始了。" }),
  ).toBeVisible({ timeout: 30000 });
  const code = new URL(h.url()).searchParams.get("room");
  await g.goto(`http://127.0.0.1:15173/?room=${code}`);
  await g.getByLabel("大家怎麼叫你").fill("小晴");
  await g.getByRole("button", { name: "加入活動" }).click();
  await expect(g.getByText("2 人在房間")).toBeVisible({ timeout: 30000 });
  await g.screenshot({ path: "evidence/mobile-lobby.png", fullPage: true });
  await h.getByRole("button", { name: /01 \/ PLAY TOGETHER/ }).click();
  await expect(
    g.getByRole("heading", { name: "聊聊箱", exact: true }),
  ).toBeVisible();
  await g.getByLabel("關於我，或關於你").fill("今天有什麼小事讓你笑了？");
  await g.getByRole("button", { name: "加入可抽題庫" }).click();
  await expect(h.getByText("今天有什麼小事讓你笑了？")).toBeVisible();
  await h.getByRole("button", { name: "隨機抽一題", exact: true }).click();
  await expect(
    g.getByRole("button", { name: "PASS", exact: true }),
  ).toBeEnabled();
  await g.getByRole("button", { name: "PASS", exact: true }).click();
  await expect(h.getByText("這題已 PASS，沒關係。")).toBeVisible();
  await expect(
    g.getByRole("button", { name: "PASS", exact: true }),
  ).toBeVisible();
  await g.getByRole("textbox", { name: "留言", exact: true }).fill("今晚真好");
  await g.getByRole("button", { name: "送出", exact: true }).click();
  await expect(h.getByText("今晚真好")).toBeVisible();
  await g.screenshot({
    path: "evidence/mobile-question-box.png",
    fullPage: true,
  });
  await h.getByRole("button", { name: "誰最棒", exact: true }).click();
  await expect(
    g.getByRole("heading", { name: "誰最棒", exact: true }),
  ).toBeVisible();
  await h.getByRole("button", { name: "隨機抽一題", exact: true }).click();
  await g.getByRole("button", { name: "小 小晴", exact: true }).click();
  await h.getByRole("button", { name: "小 小晴", exact: true }).click();
  await h.getByRole("button", { name: "鎖票並同時公布" }).click();
  await expect(g.getByText("這一題的最高票")).toBeVisible();
  await g.screenshot({
    path: "evidence/mobile-vote-result.png",
    fullPage: true,
  });
  await guest.setOffline(true);
  await expect(
    g.getByText("連線中斷，已保留目前畫面。", { exact: false }),
  ).toBeVisible();
  await guest.setOffline(false);
  await expect(g.getByText("● 即時連線")).toBeVisible({ timeout: 30000 });
  await g.reload();
  await expect(
    g.getByRole("heading", { name: "誰最棒", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await h.getByRole("button", { name: "今日任務", exact: true }).click();
  await h.getByLabel("任務內容").fill("拍一個讓你心情變好的顏色");
  await h.getByRole("button", { name: "發布今日任務" }).click();
  await expect(g.getByText("拍一個讓你心情變好的顏色")).toBeVisible();
  await g.getByLabel("上傳任務成果").setInputFiles("evidence/mobile-lobby.png");
  await g.getByLabel("成果說明").fill("今天的奶油色");
  await g.getByRole("button", { name: "提交任務成果" }).click();
  await expect(h.getByRole("heading", { name: "今天的奶油色" })).toBeVisible({
    timeout: 30000,
  });
  await h.getByRole("button", { name: "核准", exact: true }).click();
  await h.getByRole("button", { name: "截止並公開核准成果" }).click();
  await expect(g.getByRole("button", { name: /投給這張/ })).toBeEnabled();
  await g.getByRole("button", { name: /投給這張/ }).click();
  await h.getByRole("button", { name: "結算所有已公開任務" }).click();
  await expect(g.getByRole("heading", { name: "任務成果排行" })).toBeVisible();
  await g.screenshot({
    path: "evidence/mobile-photo-result.png",
    fullPage: true,
  });
  await h.screenshot({
    path: "evidence/desktop-photo-host.png",
    fullPage: true,
  });
  for (const p of [h, g])
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  expect(errors).toEqual([]);
  console.log(
    "PASS two isolated browsers: join, synchronized modes, direct-to-pool question, persistent PASS, comments, vote reveal, offline/reconnect, reload session, image compression/upload, host approval, task results, mobile overflow.",
  );
  console.log("Browser room:", code);
} finally {
  await browser.close();
}
