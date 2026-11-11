const { test, expect } = require("@playwright/test");
const { validateData } = require("../assets/storage");
async function catalogue(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "◇ Ejercicios" }).click();
}
async function treatment(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "♙ Pacientes" }).click();
  await page.getByRole("button", { name: "Abrir ficha" }).click();
  await page
    .getByRole("button", { name: "Editar tratamiento", exact: true })
    .click();
}
test("region, modality and text filters combine; multi-region exercises appear in both zones", async ({
  page,
}) => {
  await catalogue(page);
  const invalid = await page.evaluate(() =>
    BUILTIN_EXERCISES.filter(
      (e) =>
        !e.regions?.length ||
        e.regions.some((id) => !EXERCISE_REGION_IDS.includes(id)),
    ).map((e) => e.name),
  );
  expect(invalid).toEqual([]);
  await page
    .getByLabel("Zona corporal", { exact: true })
    .selectOption("shoulder");
  await page.getByLabel("Modalidad", { exact: true }).selectOption("isometric");
  await page.getByLabel("Buscar por nombre").fill("rotacion");
  await expect(page.locator("#exerciseList .listrow")).toHaveCount(2);
  await page.getByLabel("Buscar por nombre").fill("");
  await page
    .getByLabel("Modalidad", { exact: true })
    .selectOption("dynamic-all");
  for (const zone of ["hip", "knee"]) {
    await page.getByLabel("Zona corporal", { exact: true }).selectOption(zone);
    await page.getByLabel("Buscar por nombre").fill("sentadilla");
    await expect(
      page
        .locator("#exerciseList .exercise-name > span")
        .getByText("Sentadilla", { exact: true }),
    ).toBeVisible();
  }
  await page
    .getByLabel("Zona corporal", { exact: true })
    .selectOption("cervical");
  await page
    .getByLabel("Modalidad", { exact: true })
    .selectOption("plyometric");
  await expect(page.locator("#exerciseList")).toContainText(
    "No se encontraron ejercicios.",
  );
});
test("hidden treatment choices and manual zones survive saving and a backup round trip", async ({
  page,
}) => {
  await treatment(page);
  const region = page.getByLabel("Filtrar por zona corporal");
  await region.selectOption("knee");
  await page.getByLabel("Sentadilla", { exact: true }).check();
  await region.selectOption("wrist-hand");
  await page.getByLabel("Abducción de dedos", { exact: true }).check();
  await page
    .getByLabel("Nuevo ejercicio manual", { exact: true })
    .fill("Ejercicio ficticio de dos zonas");
  await page
    .getByLabel("Modalidad del nuevo ejercicio")
    .selectOption("isometric");
  await page
    .getByText("Asignar zonas al nuevo ejercicio (opcional)", { exact: true })
    .click();
  await page.getByLabel("Cadera", { exact: true }).check();
  await page.getByLabel("Rodilla", { exact: true }).check();
  await page.getByRole("button", { name: "Añadir al borrador" }).click();
  await page
    .getByRole("button", { name: "Guardar tratamiento", exact: true })
    .click();
  const saved = await page.evaluate(() => ({
    names: data.patients[0].therapeuticExercises,
    zones: data.exerciseRegions,
  }));
  expect(saved.names).toEqual(
    expect.arrayContaining([
      "Sentadilla",
      "Abducción de dedos",
      "Ejercicio ficticio de dos zonas",
    ]),
  );
  expect(saved.zones).toEqual([
    { name: "Ejercicio ficticio de dos zonas", regions: ["hip", "knee"] },
  ]);
  await page.getByRole("button", { name: "⇩ Copias de prueba" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia JSON" }).click();
  await (await download).saveAs("test-results/regions.json");
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Restablecer demo" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles("test-results/regions.json");
  await expect(
    page.getByRole("row", { name: "Zonas personalizadas 0 1", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Entiendo que se sustituirán los datos actuales.")
    .check();
  await page
    .getByRole("button", { name: "Sustituir datos e importar" })
    .click();
  await page.reload();
  expect(await page.evaluate(() => data.exerciseRegions)).toEqual(saved.zones);
  expect(
    await page.evaluate(() => data.patients[0].therapeuticExercises),
  ).toEqual(saved.names);
});
test("editing or clearing builtin zones persists without renaming an exercise", async ({
  page,
}) => {
  await catalogue(page);
  await page.getByLabel("Buscar por nombre").fill("Plancha frontal");
  await page
    .locator("#exerciseList")
    .getByRole("button", { name: "Clasificar", exact: true })
    .click();
  await expect(
    page.getByLabel("Tronco / columna dorsal y lumbar", { exact: true }),
  ).toBeChecked();
  await page
    .getByLabel("Tronco / columna dorsal y lumbar", { exact: true })
    .uncheck();
  await page.getByLabel("Hombro / escápula", { exact: true }).check();
  await page.getByRole("button", { name: "Guardar clasificación" }).click();
  await page.reload();
  expect(await page.evaluate(() => exerciseRegions("Plancha frontal"))).toEqual(
    ["shoulder"],
  );
  await page.getByRole("button", { name: "◇ Ejercicios" }).click();
  await page.getByLabel("Buscar por nombre").fill("Plancha frontal");
  await page
    .locator("#exerciseList")
    .getByRole("button", { name: "Clasificar", exact: true })
    .click();
  await page.getByLabel("Hombro / escápula", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Guardar clasificación" }).click();
  await page.reload();
  expect(await page.evaluate(() => exerciseRegions("Plancha frontal"))).toEqual(
    [],
  );
  await page.getByRole("button", { name: "◇ Ejercicios" }).click();
  await page
    .getByLabel("Zona corporal", { exact: true })
    .selectOption("unassigned");
  await expect(page.locator("#exerciseList .exercise-name > span")).toHaveText(
    "Plancha frontal",
  );
});
test("filters alone are transient and a failed zone save preserves the original state", async ({
  page,
}) => {
  await treatment(page);
  const prompts = [];
  page.on("dialog", (d) => {
    prompts.push(d.message());
    d.accept();
  });
  await page.getByLabel("Filtrar por zona corporal").selectOption("hip");
  await page.getByRole("button", { name: "Cerrar diálogo" }).click();
  expect(prompts).toEqual([]);
  await page.getByRole("button", { name: "◇ Ejercicios" }).click();
  await page.getByLabel("Buscar por nombre").fill("Sentadilla");
  await page
    .locator("#exerciseList .listrow")
    .filter({ has: page.getByText("Sentadilla", { exact: true }) })
    .getByRole("button", { name: "Clasificar", exact: true })
    .click();
  const original = await page.evaluate(() => JSON.stringify(data));
  await page.getByLabel("Cuello / cervical", { exact: true }).check();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Guardar clasificación" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(data))).toBe(original);
});
test("legacy copies retain names; malformed zones cannot enter storage", () => {
  const old = {
    patients: [
      {
        id: "P001",
        name: "Ficticio",
        therapeuticExercises: ["Nombre antiguo"],
      },
    ],
    appointments: [],
    exerciseCatalog: ["Nombre antiguo"],
  };
  expect(validateData(old).exerciseRegions).toEqual([]);
  expect(validateData(old).patients[0].therapeuticExercises).toEqual([
    "Nombre antiguo",
  ]);
  for (const exerciseRegions of [
    null,
    {},
    [{ name: "X", regions: "hip" }],
    [{ name: "X", regions: ["invalid"] }],
    [{ name: "X", regions: [42] }],
    [
      { name: "Rotación", regions: ["hip"] },
      { name: "rotacion", regions: ["knee"] },
    ],
  ])
    expect(() => validateData({ ...old, exerciseRegions })).toThrow();
  expect(
    validateData({
      ...old,
      exerciseRegions: [{ name: "X", regions: ["hip", "hip"] }],
    }).exerciseRegions,
  ).toEqual([{ name: "X", regions: ["hip"] }]);
});
