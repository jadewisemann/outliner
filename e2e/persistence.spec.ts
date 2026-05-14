import { expect, test, type Page } from "@playwright/test";

test("restores an outline and collapsed state after reload", async ({ page }) => {
  await openFreshPage(page);
  await pastePlainText(page, "A\n  B\nC");

  await page.getByRole("button", { name: "Collapse node" }).first().click();
  await expect(outlineText(page, "B")).toBeHidden();
  await waitForStoredSnapshot(page, (snapshot) =>
    Object.values(snapshot.document.nodes).some((node) => node.text === "A" && node.collapsed)
  );

  await page.reload();

  await expect(outlineText(page, "A")).toBeVisible();
  await expect(outlineText(page, "B")).toBeHidden();
  await expect(outlineText(page, "C")).toBeVisible();
});

test("restores zoom state after reload", async ({ page }) => {
  await openFreshPage(page);
  await pastePlainText(page, "A\n  B\nC");

  await page.locator(".outline-row", { hasText: "A" }).getByRole("button", { name: "Zoom into node" }).click();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("A");
  await expect(outlineText(page, "B")).toBeVisible();
  await expect(outlineText(page, "C")).toBeHidden();
  await waitForStoredSnapshot(page, (snapshot) => snapshot.document.nodes[snapshot.view.zoomNodeId]?.text === "A");

  await page.reload();

  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("A");
  await expect(outlineText(page, "B")).toBeVisible();
  await expect(outlineText(page, "C")).toBeHidden();
});

test("undoes an outline edit with a keyboard shortcut", async ({ page }) => {
  await openFreshPage(page);
  await waitForStoredSnapshot(page, (snapshot) =>
    Object.values(snapshot.document.nodes).some((node) => node.text === "")
  );
  await pastePlainText(page, "A\nB");
  await expect(outlineText(page, "A")).toBeVisible();
  await expect(outlineText(page, "B")).toBeVisible();
  await waitForStoredSnapshot(page, (snapshot) =>
    Object.values(snapshot.document.nodes).some((node) => node.text === "A") &&
    Object.values(snapshot.document.nodes).some((node) => node.text === "B")
  );

  await page.locator("body").click({ position: { x: 10, y: 10 } });
  await page.keyboard.press("ControlOrMeta+Z");
  await page.keyboard.press("ControlOrMeta+Z");
  await waitForStoredSnapshot(page, (snapshot) =>
    !Object.values(snapshot.document.nodes).some((node) => node.text === "A") &&
    !Object.values(snapshot.document.nodes).some((node) => node.text === "B")
  );
  await page.reload();
  await expect(outlineText(page, "A")).toBeHidden();
  await expect(outlineText(page, "B")).toBeHidden();
});

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

function outlineText(page: Page, text: string) {
  return page.getByRole("tree", { name: "Outline" }).getByText(text, { exact: true });
}

async function openFreshPage(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("local-first-outliner");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  });
  await page.reload();
}

type StoredSnapshot = {
  document: { nodes: Record<string, { text: string; collapsed: boolean }> };
  view: { zoomNodeId: string };
};

async function waitForStoredSnapshot(page: Page, predicate: (snapshot: StoredSnapshot) => boolean) {
  await page.waitForFunction(
    async (predicateText) => {
      const check = new Function("snapshot", `return (${predicateText})(snapshot);`) as (
        snapshot: StoredSnapshot
      ) => boolean;
      const snapshot = await new Promise<unknown>((resolve, reject) => {
        const openRequest = indexedDB.open("local-first-outliner", 1);
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const db = openRequest.result;
          const tx = db.transaction("snapshots", "readonly");
          const getRequest = tx.objectStore("snapshots").get("outliner:workspace_root");
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => resolve(getRequest.result);
        };
      });
      return Boolean(snapshot && check(snapshot as StoredSnapshot));
    },
    predicate.toString()
  );
}
