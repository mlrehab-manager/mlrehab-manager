const { test, expect } = require("@playwright/test");
async function nameForm(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "♙ Pacientes" }).click();
  await page.getByRole("button", { name: "Abrir ficha" }).click();
  await page
    .getByRole("button", { name: "Editar nombre", exact: true })
    .click();
}
test("close button and Escape preserve changed text when discard is cancelled", async ({
  page,
}) => {
  await nameForm(page);
  await page
    .getByLabel("Nombre", { exact: true })
    .fill("Nombre ficticio pendiente");
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Cerrar diálogo" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue(
    "Nombre ficticio pendiente",
  );
  page.once("dialog", (d) => d.dismiss());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await page.evaluate(() => data.patients[0].name)).toBe(
    "Paciente de ejemplo 01",
  );
});
test("saving or reverting form values does not trigger a discard prompt", async ({
  page,
}) => {
  await nameForm(page);
  const prompts = [];
  page.on("dialog", (d) => {
    prompts.push(d.type());
    d.dismiss();
  });
  const input = page.getByLabel("Nombre", { exact: true });
  await input.fill("Ficticio temporal");
  await input.fill("Paciente de ejemplo 01");
  await page.getByRole("button", { name: "Cerrar diálogo" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page
    .getByRole("button", { name: "Editar nombre", exact: true })
    .click();
  await page
    .getByLabel("Nombre", { exact: true })
    .fill("Nombre ficticio guardado");
  await page.getByRole("button", { name: "Guardar nombre" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await page.evaluate(() => data.patients[0].name)).toBe(
    "Nombre ficticio guardado",
  );
  // Selecting the patient from their own record is initial state, not a user edit.
  await page.getByRole("button", { name: "+ Programar cita" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(prompts).toEqual([]);
});
test("browser reload asks before losing a draft; an accepted reload leaves saved data intact", async ({
  page,
}) => {
  await nameForm(page);
  await page.getByLabel("Nombre", { exact: true }).fill("No guardado");
  const prompt = page.waitForEvent("dialog");
  const reloading = page.reload();
  const dialog = await prompt;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.accept();
  await reloading;
  expect(await page.evaluate(() => data.patients[0].name)).toBe(
    "Paciente de ejemplo 01",
  );
});
