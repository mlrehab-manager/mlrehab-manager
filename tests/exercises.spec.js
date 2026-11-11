const { test, expect } = require("@playwright/test");
const { validateData } = require("../assets/storage");
async function openPatient(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "♙ Pacientes" }).click();
  await page.getByRole("button", { name: "Abrir ficha" }).click();
}
test("legacy backups preserve treatment and validate new exercise fields", () => {
  const old = {
    patients: [{ id: "P001", name: "Ficticio", treatment: "Texto previo" }],
    appointments: [],
  };
  const migrated = validateData(old);
  expect(migrated.patients[0].treatment).toBe("Texto previo");
  expect(migrated.patients[0].therapeuticExercises).toEqual([]);
  expect(migrated.exerciseCatalog).toEqual([]);
  for (const exerciseCatalog of [null, [42], [""], ["x".repeat(151)]])
    expect(() => validateData({ ...old, exerciseCatalog })).toThrow();
  expect(() =>
    validateData({
      ...old,
      patients: [{ ...old.patients[0], therapeuticExercises: { name: "x" } }],
    }),
  ).toThrow();
});
test("treatment, manual exercise, reports and backup round trip retain both subtypes", async ({
  page,
}) => {
  await openPatient(page);
  await expect(
    page.getByText("Ejercicio terapéutico progresivo.", { exact: true }),
  ).toBeHidden();
  await page
    .getByText("Tratamiento previo (sin clasificar)", { exact: true })
    .click();
  await expect(
    page.getByText("Ejercicio terapéutico progresivo.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar tratamiento", exact: true })
    .click();
  await page
    .getByLabel("1. Tratamiento pasivo", { exact: true })
    .fill("Tratamiento pasivo ficticio");
  await page.getByLabel("Buscar ejercicio", { exact: true }).fill("puente");
  await page.getByLabel("Puente de glúteos", { exact: true }).check();
  await page.getByLabel("Buscar ejercicio", { exact: true }).fill("rotacion");
  await page.getByLabel("Rotación cervical", { exact: true }).check();
  await page
    .getByLabel("Nuevo ejercicio manual", { exact: true })
    .fill("Ejercicio manual ficticio");
  await page.getByRole("button", { name: "Añadir al borrador" }).click();
  await page
    .getByRole("button", { name: "Guardar tratamiento", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByText("Tratamiento pasivo ficticio", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preparar informe", exact: true })
    .click();
  await page.getByLabel("Tratamiento pasivo", { exact: true }).check();
  await page.getByLabel("Ejercicio terapéutico", { exact: true }).check();
  await page.getByRole("button", { name: "Continuar y editar" }).click();
  await expect(page.locator("#reportPreview")).toContainText(
    "Tratamiento pasivo ficticio",
  );
  await expect(page.locator("#reportPreview")).toContainText(
    "Puente de glúteos",
  );
  await expect(page.locator("#reportPreview")).toContainText(
    "Ejercicio manual ficticio",
  );
  await expect(page.locator("#reportPreview")).not.toContainText(
    "Ejercicio terapéutico progresivo.",
  );
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cerrar diálogo" }).click();
  await page.getByRole("button", { name: "⇩ Copias de prueba" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia JSON" }).click();
  await (await download).saveAs("test-results/exercise-backup.json");
  await page.getByRole("button", { name: "Restablecer demo" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles("test-results/exercise-backup.json");
  await expect(
    page.getByRole("row", { name: "Ejercicios añadidos 0 1", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Entiendo que se sustituirán los datos actuales.")
    .check();
  await page
    .getByRole("button", { name: "Sustituir datos e importar" })
    .click();
  await page.reload();
  const restored = await page.evaluate(() => data);
  expect(restored.exerciseCatalog).toEqual(["Ejercicio manual ficticio"]);
  expect(restored.patients[0].therapeuticExercises).toEqual(
    expect.arrayContaining([
      "Puente de glúteos",
      "Rotación cervical",
      "Ejercicio manual ficticio",
    ]),
  );
  expect(restored.patients[0].passiveTreatment).toBe(
    "Tratamiento pasivo ficticio",
  );
  expect(restored.patients[0].treatment).toBe(
    "Ejercicio terapéutico progresivo.",
  );
});
test("catalog allows only names, rejects duplicates and escapes typed HTML", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "◇ Ejercicios" }).click();
  expect(await page.evaluate(() => INITIAL_EXERCISES.length)).toBeGreaterThan(
    50,
  );
  await page.getByRole("button", { name: "+ Añadir ejercicio" }).click();
  await page
    .getByLabel("Nombre del ejercicio", { exact: true })
    .fill("  puente DE gluteos ");
  await page.getByRole("button", { name: "Guardar ejercicio" }).click();
  await expect(page.getByRole("alert")).toContainText("ya existe");
  const name = "Ejercicio <img src=x onerror=alert(1)>";
  await page.getByLabel("Nombre del ejercicio", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Guardar ejercicio" }).click();
  await page.reload();
  await page.getByRole("button", { name: "◇ Ejercicios" }).click();
  await page.getByLabel("Buscar por nombre").fill("onerror");
  await expect(page.locator("#exerciseList")).toHaveText(name);
  await expect(page.locator("#exerciseList img")).toHaveCount(0);
  expect(await page.evaluate(() => data.exerciseCatalog)).toEqual([name]);
});
test("cancelling a treatment draft or a failed save never leaks staged exercise names", async ({
  page,
}) => {
  await openPatient(page);
  const original = await page.evaluate(() => JSON.stringify(data));
  await page
    .getByRole("button", { name: "Editar tratamiento", exact: true })
    .click();
  // Search is a transient filter and does not count as a clinical edit.
  const prompts = [];
  page.on("dialog", (d) => {
    prompts.push(d.message());
    d.accept();
  });
  await page.getByLabel("Buscar ejercicio", { exact: true }).fill("sentadilla");
  await page.getByRole("button", { name: "Cerrar diálogo" }).click();
  expect(prompts).toEqual([]);
  await page
    .getByRole("button", { name: "Editar tratamiento", exact: true })
    .click();
  await page
    .getByLabel("Nuevo ejercicio manual", { exact: true })
    .fill("Borrador ficticio");
  await page.getByRole("button", { name: "Añadir al borrador" }).click();
  await page.getByRole("button", { name: "Cerrar diálogo" }).click();
  expect(prompts.length).toBe(1);
  expect(await page.evaluate(() => JSON.stringify(data))).toBe(original);
  await page
    .getByRole("button", { name: "Editar tratamiento", exact: true })
    .click();
  await page
    .getByLabel("Nuevo ejercicio manual", { exact: true })
    .fill("No guardado");
  await page.getByRole("button", { name: "Añadir al borrador" }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("QuotaExceededError");
    };
  });
  await page
    .getByRole("button", { name: "Guardar tratamiento", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(data))).toBe(original);
});
