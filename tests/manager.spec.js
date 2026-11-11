const { test, expect } = require("@playwright/test");
const { validateData } = require("../assets/storage");
test("validates legacy backups and rejects invalid references and injected IDs", () => {
  const p = { id: "P001", name: "Ficticio" };
  expect(validateData({ patients: [p], appointments: [] }).nextPatient).toBe(2);
  for (const patch of [
    { patients: [{ ...p, id: "P001');alert(1)//" }], appointments: [] },
    {
      patients: [p],
      appointments: [
        { id: "A001", patientId: "P999", date: "2026-11-11", hour: 9 },
      ],
    },
    {
      patients: [{ ...p, notes: [{ date: "2026-02-30", text: "x" }] }],
      appointments: [],
    },
  ])
    expect(() => validateData(patch)).toThrow();
});
test("patient, clinical record, sessions, appointments, drag and backup round trip", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "♙ Pacientes" }).click();
  await page.getByRole("button", { name: "+ Nuevo paciente" }).click();
  await page
    .getByLabel("Nombre ficticio", { exact: true })
    .fill("Paciente ficticio iPad");
  await page.getByRole("button", { name: "Crear ficha" }).click();
  await expect(
    page.getByRole("heading", { name: "Paciente ficticio iPad" }),
  ).toBeVisible();
  await page
    .locator(".card")
    .filter({
      has: page.getByRole("heading", { name: "Anamnesis", exact: true }),
    })
    .getByRole("button", { name: "Editar" })
    .click();
  await page
    .getByLabel("Anamnesis", { exact: true })
    .fill("Historia ficticia revisada");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.getByRole("button", { name: "+ Añadir sesión" }).click();
  await page.getByLabel("Evolución / tratamiento").fill("Sesión ficticia");
  await page.getByRole("button", { name: "Guardar sesión" }).click();
  await page.getByRole("button", { name: "+ Programar cita" }).click();
  await page.getByLabel("Fecha", { exact: true }).fill("2026-11-12");
  await page.getByRole("button", { name: "Guardar cita" }).click();
  await page.getByRole("button", { name: "▦ Agenda" }).click();
  const target = page.locator('.slot[data-hour="10"]');
  await page.locator(".event").dragTo(target);
  await expect(target).toContainText("Paciente ficticio iPad");
  await page.reload();
  await page.getByRole("button", { name: "⇩ Copias de prueba" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia JSON" }).click();
  const download = await downloadPromise;
  await download.saveAs("test-results/roundtrip.json");
  await page.getByRole("button", { name: "Restablecer demo" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles("test-results/roundtrip.json");
  await page
    .getByLabel("Entiendo que se sustituirán los datos actuales.")
    .check();
  await page
    .getByRole("button", { name: "Sustituir datos e importar" })
    .click();
  await page.getByRole("button", { name: "♙ Pacientes" }).click();
  await page.getByRole("button", { name: "Abrir ficha" }).last().click();
  await expect(page.getByText("Historia ficticia revisada")).toBeVisible();
  await expect(
    page.getByText("Sesión ficticia", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("corrupt local data is preserved and failed writes keep the form open", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("mlrehab-demo-v1", '{"broken":true}'),
  );
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("original se conserva");
  await page.getByRole("button", { name: "⇩ Copias de prueba" }).click();
  await expect(
    page.getByRole("button", { name: "Descargar original para recuperación" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("mlrehab-demo-v1")),
  ).toBe('{"broken":true}');
});
test("storage quota failures do not report success or create a patient", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("QuotaExceededError");
    };
  });
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "♙ Pacientes" }).click();
  await page.getByRole("button", { name: "+ Nuevo paciente" }).click();
  await page
    .getByLabel("Nombre ficticio", { exact: true })
    .fill("No persistido");
  await page.getByRole("button", { name: "Crear ficha" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("No se guardaron");
  expect(await page.evaluate(() => data.patients.length)).toBe(1);
});
test("iPad long press moves an appointment and week stays inside the viewport", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "▦ Agenda" }).click();
  await page.getByLabel("Elegir fecha").fill("2026-11-10");
  const event = page.locator(".event"),
    target = page.locator('.slot[data-hour="11"]');
  const box = await event.boundingBox(),
    end = await target.boundingBox();
  const start = { identifier: 1, clientX: box.x + 20, clientY: box.y + 10 };
  await event.dispatchEvent("touchstart", { touches: [start] });
  await page.waitForTimeout(500);
  await event.dispatchEvent("touchmove", {
    touches: [{ ...start, clientX: end.x + 30, clientY: end.y + 15 }],
  });
  await event.dispatchEvent("touchend", {
    touches: [],
    changedTouches: [start],
  });
  await expect(target).toContainText("Paciente de ejemplo 01");
  await page.getByRole("button", { name: "Semana", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1180, height: 820 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
