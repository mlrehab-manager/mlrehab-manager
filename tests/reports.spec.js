const { test, expect } = require("@playwright/test");
async function openReport(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "♙ Pacientes" }).click();
  await page.getByRole("button", { name: "Abrir ficha" }).click();
  await page
    .getByRole("button", { name: "Preparar informe", exact: true })
    .click();
}
test("reports require selection and review; edits never change the clinical record", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openReport(page);
  const original = await page.evaluate(() => JSON.stringify(data));
  await expect(page.locator("input[name=reportSection]:checked")).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Continuar y editar" }).click();
  await expect(page.getByRole("alert")).toContainText("Selecciona al menos");
  await page.getByLabel("Objetivos terapéuticos", { exact: true }).check();
  await page.getByRole("button", { name: "Continuar y editar" }).click();
  const preview = page.locator("#reportPreview");
  await expect(preview).toContainText("Mejorar tolerancia");
  await expect(preview).not.toContainText("Dolor anterior");
  await expect(preview).not.toContainText("Sesión ficticia");
  const print = page.getByRole("button", { name: "Imprimir / Guardar PDF" });
  await expect(print).toBeDisabled();
  await page.getByLabel("He revisado el informe ficticio.").check();
  await expect(print).toBeEnabled();
  await page
    .getByLabel("Contenido del informe")
    .fill('<img src=x onerror="alert(1)"> Texto ficticio editado');
  await expect(print).toBeDisabled();
  await expect(preview.locator("img")).toHaveCount(0);
  await expect(preview).toContainText("<img src=x");
  expect(await page.evaluate(() => JSON.stringify(data))).toBe(original);
  // Close cancellation retains draft and Escape can explicitly discard it.
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Cerrar diálogo" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(await page.evaluate(() => reportDraft)).toBeNull();
  expect(errors).toEqual([]);
});
test("print output contains only reviewed report and excludes application and other clinical sections", async ({
  page,
}) => {
  await openReport(page);
  await page
    .getByLabel("Tratamiento previo (sin clasificar)", { exact: true })
    .check();
  await page.getByRole("button", { name: "Continuar y editar" }).click();
  await page.getByLabel("Título del informe").fill("Resumen ficticio");
  await page.getByLabel("He revisado el informe ficticio.").check();
  // Suppress the OS dialog so print media and document contents can be inspected.
  await page.evaluate(() => (window.print = () => {}));
  await page.getByRole("button", { name: "Imprimir / Guardar PDF" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#reportPrint")).toBeVisible();
  await expect(page.locator(".shell")).toBeHidden();
  await expect(page.getByRole("dialog")).toBeHidden();
  const report = page.locator("#reportPrint");
  await expect(report).toContainText("Resumen ficticio");
  await expect(report).toContainText("SIN VALIDEZ CLÍNICA");
  await expect(report).toContainText("Ejercicio terapéutico progresivo.");
  await expect(report).not.toContainText("Dolor anterior");
  const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#reportPrint")).toBeEmpty();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("blank date prevents printing and sessions require explicit inclusion", async ({
  page,
}) => {
  await openReport(page);
  await page
    .getByLabel("Evolución de todas las sesiones", { exact: true })
    .check();
  await page.getByRole("button", { name: "Continuar y editar" }).click();
  await expect(page.locator("#reportPreview")).toContainText(
    "Sesión ficticia de ejemplo.",
  );
  await page.getByLabel("Fecha del informe").fill("");
  await page.getByLabel("He revisado el informe ficticio.").check();
  await page.getByRole("button", { name: "Imprimir / Guardar PDF" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Completa título, fecha válida",
  );
  expect(
    await page.evaluate(() =>
      document.body.classList.contains("printing-report"),
    ),
  ).toBe(false);
});
