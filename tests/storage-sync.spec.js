const { test, expect } = require("@playwright/test");
async function newPatient(page, name) {
  await page.getByRole("button", { name: "♙ Pacientes" }).click();
  await page.getByRole("button", { name: "+ Nuevo paciente" }).click();
  await page.getByLabel("Nombre ficticio", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Crear ficha" }).click();
}
test("two tabs preserve the newer saved patient and keep stale form open", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "♙ Pacientes" }).click();
  await other.getByRole("button", { name: "+ Nuevo paciente" }).click();
  await other
    .getByLabel("Nombre ficticio", { exact: true })
    .fill("Borrador en pestaña B");
  await newPatient(page, "Guardado en pestaña A");
  await expect(other.locator("#storageConflict")).toBeVisible();
  await expect(
    other.getByLabel("Nombre ficticio", { exact: true }),
  ).toHaveValue("Borrador en pestaña B");
  other.on("dialog", (d) => d.accept());
  await other.getByRole("button", { name: "Crear ficha" }).click();
  await expect(other.getByRole("dialog")).toBeVisible();
  await expect(other.getByRole("status")).toContainText("No se guardaron");
  expect(
    await other.evaluate(() =>
      JSON.parse(localStorage.getItem(KEY)).patients.map((p) => p.name),
    ),
  ).toContain("Guardado en pestaña A");
  expect(
    await other.evaluate(() =>
      JSON.parse(localStorage.getItem(KEY)).patients.map((p) => p.name),
    ),
  ).not.toContain("Borrador en pestaña B");
  await other.getByRole("button", { name: "Cerrar diálogo" }).click();
  const downloadPromise = other.waitForEvent("download");
  await other
    .getByRole("button", { name: "Descargar copia de esta pestaña" })
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "MLREHAB_DEMO_copia.json",
  );
  await other.getByRole("button", { name: "Cargar versión guardada" }).click();
  await expect(other.locator("#storageConflict")).toBeHidden();
  await other.getByRole("button", { name: "♙ Pacientes" }).click();
  await expect(
    other.getByText("Guardado en pestaña A", { exact: true }),
  ).toBeVisible();
  await newPatient(other, "Nuevo tras recargar");
  expect(
    await other.evaluate(
      () => JSON.parse(localStorage.getItem(KEY)).patients.length,
    ),
  ).toBe(3);
});
test("pre-write comparison catches changes without a storage event and blocks reset/import", async ({
  page,
}) => {
  await page.goto("/");
  const newer = await page.evaluate(() => {
    const newer = structuredClone(data);
    newer.patients[0].name = "Cambio externo ficticio";
    localStorage.setItem(KEY, JSON.stringify(newer));
    return localStorage.getItem(KEY);
  });
  page.on("dialog", (d) => d.accept());
  await newPatient(page, "No sobrescribir");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar diálogo" }).click();
  await page.getByRole("button", { name: "⇩ Copias de prueba" }).click();
  await page.getByRole("button", { name: "Restablecer demo" }).click();
  expect(await page.evaluate(() => localStorage.getItem(KEY))).toBe(newer);
  const backup = await page.evaluate(() => JSON.stringify(sample));
  await page.locator("input[type=file]").setInputFiles({
    name: "copia.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await page
    .getByLabel("Entiendo que se sustituirán los datos actuales.")
    .check();
  await page
    .getByRole("button", { name: "Sustituir datos e importar" })
    .click();
  await expect(page.getByRole("status")).toContainText("No se guardaron");
  expect(await page.evaluate(() => localStorage.getItem(KEY))).toBe(newer);
});
test("clearing storage in another tab also warns and requires explicit reload", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await newPatient(page, "Ficticio guardado");
  const other = await context.newPage();
  await other.goto("/");
  await page.evaluate(() => localStorage.clear());
  await expect(other.locator("#storageConflict")).toBeVisible();
  other.once("dialog", (d) => d.dismiss());
  await other.getByRole("button", { name: "Cargar versión guardada" }).click();
  await expect(other.locator("#storageConflict")).toBeVisible();
  expect(await other.evaluate(() => data.patients.length)).toBe(2);
});
