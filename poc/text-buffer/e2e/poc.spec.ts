import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("keeps unsupported Markdown byte-for-byte until an edit changes it", async ({ page }) => {
  const before = await page.evaluate(() => window.textBufferPoc.getText());
  expect(before).toContain("> 이 인용문은 OutlineIndex 항목이 아니지만 저장할 때 보존됩니다.");
  expect(before).toContain('const raw = "- 목록처럼 보여도 코드 펜스 안에서는 원문입니다";');

  await page.locator(".cm-line", { hasText: "한글 조합 입력을 확인합니다" }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" 완료");

  const after = await page.evaluate(() => window.textBufferPoc.getText());
  expect(after.replace(" 완료", "")).toBe(before);
});

test("runs outline commands as text transactions", async ({ page }) => {
  await page.evaluate(() => window.textBufferPoc.load(20));
  const line = page.locator(".cm-line", { hasText: "성능 측정 항목 2" });
  await line.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("새 항목");
  await page.keyboard.press("Shift+Tab");

  const text = await page.evaluate(() => window.textBufferPoc.getText());
  expect(text).toContain("- 새 항목");
});

test("keeps a 10,000-line document virtualized and measures synchronous input", async ({ page }) => {
  const report = await page.evaluate(() => window.textBufferPoc.benchmark(10000));

  expect(report.rows).toBe(10000);
  expect(report.domLines).toBeLessThan(100);
  expect(report.inputMs.median).toBeLessThan(8.4);
  expect(report.subtreeMoveMs).not.toBeNull();
});

test("records the composition event sequence for manual Korean IME verification", async ({ page }) => {
  await page.locator(".cm-content").dispatchEvent("compositionstart", { data: "ㅎ" });
  await page.locator(".cm-content").dispatchEvent("compositionupdate", { data: "한" });
  await page.locator(".cm-content").dispatchEvent("compositionend", { data: "한글" });

  const events = await page.evaluate(() => window.textBufferPoc.compositionEvents().map((event) => event.type));
  expect(events).toEqual(["compositionstart", "compositionupdate", "compositionend"]);
});
