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
test("expanded catalogue has unique names and every category can be filtered", async ({
  page,
}) => {
  await catalogue(page);
  const seed = await page.evaluate(() => ({
    total: BUILTIN_EXERCISES.length,
    unique: new Set(INITIAL_EXERCISES.map(exerciseNameKey)).size,
    counts: Object.fromEntries(
      EXERCISE_CATEGORY_IDS.map((c) => [
        c,
        BUILTIN_EXERCISES.filter((e) => e.category === c).length,
      ]),
    ),
  }));
  expect(seed.total).toBe(112);
  expect(seed.unique).toBe(112);
  for (const [category, count] of Object.entries(seed.counts)) {
    expect(count).toBeGreaterThan(0);
    await page.getByLabel("Modalidad", { exact: true }).selectOption(category);
    await expect(page.locator("#exerciseList .listrow")).toHaveCount(count);
  }
  await page
    .getByLabel("Modalidad", { exact: true })
    .selectOption("dynamic-all");
  await expect(page.locator("#exerciseList .listrow")).toHaveCount(
    seed.counts.dynamic + seed.counts.concentric + seed.counts.eccentric,
  );
  await page.getByLabel("Buscar por nombre").fill("excEntrica de muneca");
  await expect(page.locator("#exerciseList .listrow > span")).toHaveText(
    "Extensión excéntrica de muñeca con carga",
  );
});
test("changing filters retains selections and manual category survives backup round trip", async ({
  page,
}) => {
  await treatment(page);
  const filter = page.getByLabel("Filtrar por modalidad");
  await filter.selectOption("isometric");
  await page
    .getByLabel("Sentadilla isométrica en pared", { exact: true })
    .check();
  await filter.selectOption("eccentric");
  await page
    .getByLabel("Extensión excéntrica de muñeca con carga", { exact: true })
    .check();
  await filter.selectOption("plyometric");
  await page
    .getByLabel("Saltos bipodales sobre línea", { exact: true })
    .check();
  await page
    .getByLabel("Nuevo ejercicio manual", { exact: true })
    .fill("Rebote ficticio manual");
  await page
    .getByLabel("Modalidad del nuevo ejercicio")
    .selectOption("plyometric");
  await page.getByRole("button", { name: "Añadir al borrador" }).click();
  await expect(
    page.getByLabel("Rebote ficticio manual", { exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Guardar tratamiento", exact: true })
    .click();
  const saved = await page.evaluate(() => ({
    names: data.patients[0].therapeuticExercises,
    classification: data.exerciseClassifications,
  }));
  expect(saved.names).toEqual(
    expect.arrayContaining([
      "Sentadilla isométrica en pared",
      "Extensión excéntrica de muñeca con carga",
      "Saltos bipodales sobre línea",
      "Rebote ficticio manual",
    ]),
  );
  expect(saved.classification).toEqual([
    { name: "Rebote ficticio manual", category: "plyometric" },
  ]);
  await page.getByRole("button", { name: "⇩ Copias de prueba" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia JSON" }).click();
  await (await download).saveAs("test-results/categories.json");
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Restablecer demo" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles("test-results/categories.json");
  await expect(
    page.getByRole("row", {
      name: "Clasificaciones personalizadas 0 1",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Entiendo que se sustituirán los datos actuales.")
    .check();
  await page
    .getByRole("button", { name: "Sustituir datos e importar" })
    .click();
  await page.reload();
  expect(
    await page.evaluate(() => exerciseCategory("Rebote ficticio manual")),
  ).toBe("plyometric");
  expect(
    await page.evaluate(() => data.patients[0].therapeuticExercises),
  ).toEqual(saved.names);
});
test("user can choose and later change the category of a manual exercise", async ({
  page,
}) => {
  await catalogue(page);
  await page.getByRole("button", { name: "+ Añadir ejercicio" }).click();
  await page
    .getByLabel("Nombre del ejercicio", { exact: true })
    .fill("Ejercicio ficticio propio");
  await page.getByLabel("Modalidad del ejercicio").selectOption("isometric");
  await page.getByRole("button", { name: "Guardar ejercicio" }).click();
  await page.getByLabel("Buscar por nombre").fill("Ejercicio ficticio propio");
  await page
    .locator("#exerciseList")
    .getByRole("button", { name: "Clasificar", exact: true })
    .click();
  await expect(page.getByLabel("Modalidad del ejercicio")).toHaveValue(
    "isometric",
  );
  await page.getByLabel("Modalidad del ejercicio").selectOption("eccentric");
  await page.getByRole("button", { name: "Guardar clasificación" }).click();
  await page.reload();
  expect(
    await page.evaluate(() => exerciseCategory("Ejercicio ficticio propio")),
  ).toBe("eccentric");
  expect(await page.evaluate(() => data.exerciseCatalog)).toEqual([
    "Ejercicio ficticio propio",
  ]);
});
test("modality filters alone do not count as unsaved treatment edits", async ({
  page,
}) => {
  await treatment(page);
  const prompts = [];
  page.on("dialog", (d) => {
    prompts.push(d.message());
    d.accept();
  });
  await page.getByLabel("Filtrar por modalidad").selectOption("concentric");
  await page.getByLabel("Buscar ejercicio", { exact: true }).fill("talones");
  await page.getByRole("button", { name: "Cerrar diálogo" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(prompts).toEqual([]);
});
test("legacy catalogues keep their names and invalid or duplicate classifications are rejected", () => {
  const old = {
    patients: [
      {
        id: "P001",
        name: "Ficticio",
        therapeuticExercises: ["Ejercicio propio antiguo"],
      },
    ],
    appointments: [],
    exerciseCatalog: ["Ejercicio propio antiguo"],
  };
  const migrated = validateData(old);
  expect(migrated.exerciseClassifications).toEqual([]);
  expect(migrated.patients[0].therapeuticExercises).toEqual(
    old.patients[0].therapeuticExercises,
  );
  for (const exerciseClassifications of [
    null,
    {},
    [{ name: "X", category: "diagnosis" }],
    [{ name: 42, category: "isometric" }],
    [
      { name: "Rotación", category: "isometric" },
      { name: "rotacion", category: "eccentric" },
    ],
  ])
    expect(() => validateData({ ...old, exerciseClassifications })).toThrow();
});
test("a failed classification save preserves the previous catalogue and patient selections", async ({
  page,
}) => {
  await catalogue(page);
  await page.getByLabel("Buscar por nombre").fill("Plancha frontal");
  await page
    .locator("#exerciseList")
    .getByRole("button", { name: "Clasificar", exact: true })
    .click();
  const original = await page.evaluate(() => JSON.stringify(data));
  await page.getByLabel("Modalidad del ejercicio").selectOption("plyometric");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("QuotaExceededError");
    };
  });
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Guardar clasificación" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(data))).toBe(original);
  expect(await page.evaluate(() => exerciseCategory("Plancha frontal"))).toBe(
    "isometric",
  );
});
