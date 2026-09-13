import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:15174");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await (
    await page.request.get("http://127.0.0.1:15174/manifest.webmanifest")
  ).json();
  expect(manifest.icons.some((icon) => icon.sizes === "192x192")).toBeTruthy();
  expect(manifest.icons.some((icon) => icon.sizes === "512x512")).toBeTruthy();
  await expect(page.getByRole("button", { name: "建立新房間" })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("靠近彼此。")).toBeVisible();
  const keys = await page.evaluate(async () => {
    const cache = await caches.open("party-shell-v1");
    return (await cache.keys()).map((r) => r.url);
  });
  expect(
    keys.every((url) => !url.includes("firestore") && !url.includes("/rooms/")),
  ).toBeTruthy();
  console.log(
    "PASS production manifest, service worker activation, cached offline shell, no private API/image cache",
  );
} finally {
  await browser.close();
}
