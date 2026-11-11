const { test, expect } = require("@playwright/test");
async function openBackups(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "⇩ Copias de prueba" }).click();
}
async function choose(page, content, name = "copia-ficticia.json") {
  await page.locator("input[type=file]").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
}
test("preview is read-only until explicitly approved; current backup can be downloaded", async ({
  page,
}) => {
  await openBackups(page);
  const original = await page.evaluate(() => JSON.stringify(data));
  const backup = JSON.stringify({ patients: [], appointments: [] });
  await choose(page, backup, "<img src=x onerror=alert(1)>.json");
  await expect(
    page.getByRole("heading", { name: "Revisar copia antes de importar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: "Pacientes 1 0", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: "Citas 1 0", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: "Sesiones 1 0", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#modalBody img")).toHaveCount(0);
  const apply = page.getByRole("button", {
    name: "Sustituir datos e importar",
  });
  await expect(apply).toBeDisabled();
  expect(await page.evaluate(() => JSON.stringify(data))).toBe(original);
  expect(await page.evaluate(() => localStorage.getItem(KEY))).toBeNull();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar copia actual antes de importar" })
    .click();
  await (await download).saveAs("test-results/before-import.json");
  const fs = require("node:fs");
  expect(
    JSON.parse(fs.readFileSync("test-results/before-import.json", "utf8")),
  ).toEqual(JSON.parse(original));
  await page.getByRole("button", { name: "Cancelar importación" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await page.evaluate(() => pendingImport)).toBeNull();
  // Selecting the identical file again still opens a new preview.
  await choose(page, backup, "<img src=x onerror=alert(1)>.json");
  await page
    .getByLabel("Entiendo que se sustituirán los datos actuales.")
    .check();
  await apply.click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await page.evaluate(() => data.patients.length)).toBe(0);
  await page.reload();
  expect(await page.evaluate(() => data.patients.length)).toBe(0);
});
test("invalid or oversized files leave existing data intact without a preview", async ({
  page,
}) => {
  await openBackups(page);
  const original = await page.evaluate(() => JSON.stringify(data));
  const messages = [];
  page.on("dialog", (d) => {
    messages.push(d.message());
    d.accept();
  });
  await choose(
    page,
    JSON.stringify({ patients: [{ id: "bad" }], appointments: [] }),
  );
  await expect.poll(() => messages.length).toBe(1);
  await choose(page, " ".repeat(5 * 1024 * 1024 + 1));
  await expect.poll(() => messages.length).toBe(2);
  expect(messages[1]).toContain("5 MB");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await page.evaluate(() => JSON.stringify(data))).toBe(original);
});
test("failed write preserves the current data and keeps the import preview open", async ({
  page,
}) => {
  await openBackups(page);
  const original = await page.evaluate(() => JSON.stringify(data));
  await choose(page, JSON.stringify({ patients: [], appointments: [] }));
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("QuotaExceededError");
    };
  });
  page.on("dialog", (d) => d.accept());
  await page
    .getByLabel("Entiendo que se sustituirán los datos actuales.")
    .check();
  await page
    .getByRole("button", { name: "Sustituir datos e importar" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("No se guardaron");
  expect(await page.evaluate(() => JSON.stringify(data))).toBe(original);
});
