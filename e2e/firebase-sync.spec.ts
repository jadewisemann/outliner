import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = loadFirebaseEnv();

test.describe("Firebase sync smoke", () => {
  test.skip(!env, "Firebase env is not configured");

  test("syncs edits between two pages through Firebase startup pull", async ({ context }) => {
    if (!env) {
      return;
    }
    await clearFirebaseUser(env);
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await resetBrowserState(pageA);
    await pageA.goto(`/?remote=firebase&user=${encodeURIComponent(env.userId)}`);
    await pageB.goto(`/?remote=firebase&user=${encodeURIComponent(env.userId)}`);

    await expect(pageA.getByText("Synced")).toBeVisible();
    await expect(pageB.getByText("Synced")).toBeVisible();

    await pastePlainText(pageA, "Firebase A\nFirebase B");

    await expect(outlineText(pageA, "Firebase A")).toBeVisible();
    await pageB.reload();
    await expect(outlineText(pageB, "Firebase A")).toBeVisible();
    await expect(outlineText(pageB, "Firebase B")).toBeVisible();

    await focusRow(pageB, "Firebase B");
    await pageB.keyboard.press("End");
    await pageB.keyboard.type(" synced");

    await expect(outlineText(pageB, "Firebase B synced")).toBeVisible();
    await pageA.reload();
    await expect(outlineText(pageA, "Firebase B synced")).toBeVisible();
  });
});

type FirebaseEnv = {
  databaseUrl: string;
  userId: string;
};

function loadFirebaseEnv(): FirebaseEnv | undefined {
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(process.env)) {
    if (value) {
      values.set(key, value);
    }
  }
  try {
    const envText = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) {
        values.set(match[1], match[2].replace(/^["']|["']$/g, ""));
      }
    }
  } catch {
    // The smoke test is skipped when local Firebase env is absent.
  }
  const databaseUrl = values.get("VITE_FIREBASE_DATABASE_URL");
  const userId = values.get("VITE_OUTLINER_USER_ID") ?? "test-user";
  return databaseUrl ? { databaseUrl, userId } : undefined;
}

async function clearFirebaseUser({ databaseUrl, userId }: FirebaseEnv): Promise<void> {
  const response = await fetch(`${databaseUrl.replace(/\/$/, "")}/users/${encodeURIComponent(userId)}.json`, {
    method: "DELETE"
  });
  if (!response.ok) {
    throw new Error(`Unable to clear Firebase test user: ${response.status}`);
  }
}

async function resetBrowserState(page: Page) {
  await page.goto("/?remote=none");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("local-first-outliner");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
}

async function pastePlainText(page: Page, text: string) {
  const textbox = page.getByRole("textbox", { name: "Outline node text" });
  await textbox.focus();
  await textbox.evaluate((element, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true
      })
    );
  }, text);
}

async function focusRow(page: Page, text: string) {
  await outlineText(page, text).click();
  const textbox = page.getByRole("textbox", { name: "Outline node text" });
  await expect(textbox).toContainText(text);
  await expect(textbox).toBeFocused();
}

function outlineText(page: Page, text: string) {
  return page.getByRole("tree", { name: "Outline" }).getByText(text, { exact: true });
}
