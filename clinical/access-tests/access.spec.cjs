const { test, expect } = require("@playwright/test");
const backupFixture = require("./backup-fixture.json");
const { readFile } = require("node:fs/promises");
const userId = "11111111-1111-4111-8111-111111111111";
const factor = {
  id: "22222222-2222-4222-8222-222222222222",
  factor_type: "totp",
  status: "verified",
};
const secret = "SYNTHETICNOTASECRET";
const reserveFactor = {
  id: "44444444-4444-4444-8444-444444444444",
  factor_type: "totp",
  status: "verified",
  friendly_name: "MLREHAB reserva synthetic",
};

async function mockAuth(
  page,
  {
    enrolled = true,
    badPassword = false,
    badCode = false,
    access = "ok",
    revocation = "revoked",
    hasReserve = false,
    backupMode = "ok",
  } = {},
) {
  let verified = enrolled;
  let reserveVerified = hasReserve;
  let pendingReserve = false;
  let loggedOut = false;
  let accessCalls = 0;
  const calls = [];
  const user = () => ({
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic@example.invalid",
    factors: [
      ...(verified ? [factor] : []),
      ...(reserveVerified ? [reserveFactor] : []),
    ],
  });
  const session = (aal) => ({
    access_token:
      [
        { alg: "HS256", typ: "JWT" },
        { sub: userId, aal, exp: Math.floor(Date.now() / 1000) + 3600 },
      ]
        .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
        .join(".") + ".c3ludGhldGlj",
    refresh_token: "synthetic-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user: user(),
  });
  await page.route("https://synthetic.supabase.co/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push({
      path,
      method: request.method(),
      authorization: request.headers().authorization,
      postBody: request.postData(),
    });
    let body;
    let status = 200;
    if (path === "/rest/v1/rpc/clinical_backup_seed_test") {
      body = { patients: 2, already_present: false };
      if (backupMode === "refuse") {
        status = 400;
        body = { code: "22023", message: "Fixture only" };
      }
    } else if (path === "/rest/v1/rpc/clinical_backup_export_test") {
      body = backupFixture;
    } else if (path === "/rest/v1/rpc/clinical_access_check") {
      accessCalls++;
      body = { authorized: true };
      if (access === "denied") {
        status = 401;
        body = { code: "42501", message: "Acceso no autorizado" };
      }
      if (access === "false") body = { authorized: false };
      if (access === "unavailable") {
        status = 503;
        body = { message: "Unavailable" };
      }
      if (revocation === "preflight-error" && accessCalls === 2) {
        status = 503;
        body = { message: "Unavailable" };
      }
      if (loggedOut && revocation !== "still-valid") {
        status = 403;
        body = { code: "42501", message: "Acceso no autorizado" };
        if (revocation === "unavailable") {
          status = 503;
          body = { message: "Unavailable" };
        }
        if (revocation === "expired") {
          status = 401;
          body = { code: "PGRST303", message: "JWT expired" };
        }
      }
    } else if (path.endsWith("/token")) {
      body = badPassword
        ? { code: "invalid_credentials", msg: "Invalid login credentials" }
        : session("aal1");
      if (badPassword) status = 400;
    } else if (path.endsWith("/user")) body = user();
    else if (path.endsWith("/factors")) {
      pendingReserve =
        request.postDataJSON()?.friendlyName?.startsWith("MLREHAB reserva") ??
        request.postDataJSON()?.friendly_name?.startsWith("MLREHAB reserva") ??
        false;
      body = {
        id: pendingReserve ? reserveFactor.id : factor.id,
        type: "totp",
        totp: {
          qr_code:
            '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"></svg>',
          secret,
          uri: "otpauth://totp/synthetic",
        },
      };
    } else if (path.endsWith("/challenge"))
      body = {
        id: "synthetic-challenge",
        expires_at: Math.floor(Date.now() / 1000) + 300,
      };
    else if (path.endsWith("/verify")) {
      if (badCode) {
        body = { code: "mfa_verification_failed", msg: "Invalid code" };
        status = 422;
      } else {
        if (path.includes(reserveFactor.id)) reserveVerified = true;
        else verified = true;
        body = session("aal2");
      }
    } else if (path.endsWith("/logout")) {
      if (revocation === "logout-error") {
        status = 500;
        body = { message: "Logout failed" };
      } else {
        loggedOut = true;
        body = {};
      }
    } else throw new Error(`Unexpected endpoint ${path}`);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return calls;
}
async function login(page) {
  await page.goto("/");
  await page
    .getByLabel("Correo de tu cuenta de la aplicación")
    .fill("synthetic@example.invalid");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("synthetic-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("password errors leave the session closed and clear the password", async ({
  page,
}) => {
  await mockAuth(page, { badPassword: true });
  await login(page);
  await expect(page.getByRole("status")).toContainText("No se pudo entrar");
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveValue("");
  await expect(page.locator("#verify")).toBeHidden();
  await expect(page.locator("#complete")).toBeHidden();
});

test("existing MFA promotes assurance without fetching patients or storing a session", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await login(page);
  await expect(page.locator("#verify")).toBeVisible();
  await expect(page.locator("#enrollment")).toBeHidden();
  await expect(page.locator("#complete")).toBeHidden();
  await page
    .getByLabel("Código de 6 dígitos del autenticador", { exact: true })
    .fill("123456");
  await page.getByRole("button", { name: "Verificar segundo factor" }).click();
  await expect(page.locator("#complete")).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
  ).toEqual({ local: {}, session: {} });
  expect(
    calls.some((call) => call.path === "/rest/v1/rpc/clinical_access_check"),
  ).toBe(true);
  expect(
    calls
      .filter((call) => call.path.includes("/rest/"))
      .every((call) => call.path === "/rest/v1/rpc/clinical_access_check"),
  ).toBe(true);
  expect(calls.some((call) => call.path.endsWith("/factors"))).toBe(false);
  await page.reload();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#complete")).toBeHidden();
});

test("first enrollment shows a private image and erases the secret after verification", async ({
  page,
}) => {
  await mockAuth(page, { enrolled: false });
  await login(page);
  await page.getByRole("button", { name: "Preparar autenticador" }).click();
  await expect(page.locator("#setup")).toBeVisible();
  await expect(page.locator("#qr")).toHaveAttribute(
    "src",
    /^data:image\/svg\+xml/,
  );
  await expect(page.locator("#secret")).toHaveText(secret);
  await page
    .getByLabel("Código de 6 dígitos del autenticador", { exact: true })
    .fill("123456");
  await page.getByRole("button", { name: "Verificar segundo factor" }).click();
  await expect(page.locator("#complete")).toBeVisible();
  await expect(page.locator("#secret")).toHaveText("");
  expect(await page.locator("#qr").getAttribute("src")).toBeNull();
});

test("invalid MFA does not open the completed screen", async ({ page }) => {
  await mockAuth(page, { badCode: true });
  await login(page);
  await page
    .getByLabel("Código de 6 dígitos del autenticador", { exact: true })
    .fill("123456");
  await page.getByRole("button", { name: "Verificar segundo factor" }).click();
  await expect(page.getByRole("status")).toContainText("Código no verificado");
  await expect(page.locator("#complete")).toBeHidden();
  await expect(page.locator("#code")).toHaveValue("");
});

test("logout clears enrollment and reloads with no remembered session", async ({
  page,
}) => {
  const calls = await mockAuth(page, { enrolled: false });
  await login(page);
  await page.getByRole("button", { name: "Preparar autenticador" }).click();
  await expect(page.locator("#setup")).toBeVisible();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#secret")).toHaveText("");
  await expect(page.locator("#logout")).toBeHidden();
  expect(calls.some((call) => call.path.endsWith("/logout"))).toBe(true);
});

test("inactivity closes the session when returning from a sleeping iPad tab", async ({
  page,
}) => {
  await page.clock.install();
  const calls = await mockAuth(page);
  await login(page);
  await expect(page.locator("#verify")).toBeVisible();
  await page.clock.fastForward(5 * 60 * 1000 + 15000);
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#verify")).toBeHidden();
  expect(calls.some((call) => call.path.endsWith("/logout"))).toBe(true);
});

for (const access of ["denied", "false", "unavailable"]) {
  test(`MFA success alone cannot show authorization when the server is ${access}`, async ({
    page,
  }) => {
    await mockAuth(page, { access });
    await login(page);
    await page
      .getByLabel("Código de 6 dígitos del autenticador", { exact: true })
      .fill("123456");
    await page
      .getByRole("button", { name: "Verificar segundo factor" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "El servidor no ha confirmado el acceso",
    );
    await expect(page.locator("#complete")).toBeHidden();
    await expect(page.locator("#logout")).toBeVisible();
  });
}

async function authorized(page) {
  await login(page);
  await page
    .getByLabel("Código de 6 dígitos del autenticador", { exact: true })
    .fill("123456");
  await page.getByRole("button", { name: "Verificar segundo factor" }).click();
  await expect(page.locator("#complete")).toBeVisible();
}

test("secure logout test reuses the same token before and after logout without persisting it", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await page.getByRole("button", { name: "Probar cierre seguro" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Cierre seguro verificado",
  );
  await expect(page.locator("#complete")).toBeHidden();
  await expect(page.locator("#login")).toBeHidden();
  await expect(page.locator("#logout")).toBeHidden();
  const probes = calls.filter(
    (call) => call.path === "/rest/v1/rpc/clinical_access_check",
  );
  expect(probes).toHaveLength(3);
  expect(probes[1].authorization).toBeTruthy();
  expect(probes[2].authorization).toBe(probes[1].authorization);
  const logoutIndex = calls.findIndex((call) => call.path.endsWith("/logout"));
  expect(calls.indexOf(probes[1])).toBeLessThan(logoutIndex);
  expect(calls.indexOf(probes[2])).toBeGreaterThan(logoutIndex);
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
  ).toEqual({ local: {}, session: {} });
  await page.getByRole("button", { name: "Volver al acceso" }).click();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#closed")).toBeHidden();
});

for (const revocation of [
  "still-valid",
  "unavailable",
  "expired",
  "logout-error",
  "preflight-error",
]) {
  test(`secure logout cannot pass when the result is ${revocation}`, async ({
    page,
  }) => {
    await mockAuth(page, { revocation });
    await authorized(page);
    await page.getByRole("button", { name: "Probar cierre seguro" }).click();
    await expect(page.getByRole("status")).toContainText(
      revocation === "still-valid"
        ? "La prueba ha fallado"
        : "No se pudo verificar el cierre",
    );
    await expect(page.getByRole("status")).not.toContainText(
      "Cierre seguro verificado",
    );
    await expect(page.locator("#complete")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Volver al acceso" }),
    ).toBeVisible();
  });
}

test("a verified user adds a reserve authenticator without deleting the principal", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await page
    .getByRole("button", { name: "Añadir autenticador de reserva" })
    .click();
  await expect(page.locator("#reserve")).toBeVisible();
  await expect(page.locator("#reserve-secret")).toHaveText(secret);
  await page
    .getByLabel("Código de 6 dígitos del dispositivo de reserva")
    .fill("123456");
  await page
    .getByRole("button", { name: "Verificar autenticador de reserva" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Autenticador de reserva verificado",
  );
  await expect(page.locator("#factor-count")).toHaveText(
    "2 autenticadores verificados.",
  );
  await expect(page.locator("#add-reserve")).toBeHidden();
  await expect(page.locator("#reserve-secret")).toHaveText("");
  expect(await page.locator("#reserve-qr").getAttribute("src")).toBeNull();
  expect(calls.some((c) => c.method === "DELETE")).toBe(false);
});

test("the reserve device can be selected for login without using the principal factor", async ({
  page,
}) => {
  const calls = await mockAuth(page, { hasReserve: true });
  await login(page);
  await page
    .getByLabel("Autenticador que vas a utilizar")
    .selectOption(reserveFactor.id);
  await page
    .getByLabel("Código de 6 dígitos del autenticador", { exact: true })
    .fill("123456");
  await page.getByRole("button", { name: "Verificar segundo factor" }).click();
  await expect(page.locator("#complete")).toBeVisible();
  expect(
    calls.some((c) => c.path.endsWith(`/factors/${reserveFactor.id}/verify`)),
  ).toBe(true);
  expect(
    calls.some((c) => c.path.endsWith(`/factors/${factor.id}/verify`)),
  ).toBe(false);
  await expect(page.locator("#add-reserve")).toBeHidden();
});

test("reserve enrollment requires a fresh server authorization", async ({
  page,
}) => {
  const calls = await mockAuth(page, { revocation: "preflight-error" });
  await authorized(page);
  await page
    .getByRole("button", { name: "Añadir autenticador de reserva" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "El servidor no ha autorizado",
  );
  await expect(page.locator("#reserve")).toBeHidden();
  expect(calls.some((c) => c.path.endsWith("/factors"))).toBe(false);
});

test("leaving an unfinished reserve setup clears its QR and secret", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  await page
    .getByRole("button", { name: "Añadir autenticador de reserva" })
    .click();
  await expect(page.locator("#reserve")).toBeVisible();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#reserve")).toBeHidden();
  await expect(page.locator("#reserve-secret")).toHaveText("");
  expect(await page.locator("#reserve-qr").getAttribute("src")).toBeNull();
});

const backupPhrase = "Frase-sintetica-de-copia-para-la-interfaz";
async function fillBackup(page, confirm = backupPhrase) {
  await page
    .getByLabel("Frase para cifrar esta copia", { exact: true })
    .fill(backupPhrase);
  await page.getByLabel("Repite la frase de la copia").fill(confirm);
}
test("database snapshot downloads encrypted and can be checked locally without uploading the phrase or file", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await fillBackup(page);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Crear copia cifrada de prueba" })
    .click();
  const download = await downloadPromise;
  const encrypted = await readFile(await download.path(), "utf8");
  const { decryptBackup } = await import("../backups/crypto.mjs");
  expect(await decryptBackup(encrypted, backupPhrase)).toEqual(backupFixture);
  expect(encrypted).not.toContain("FICTICIO");
  expect(encrypted).not.toContain(backupPhrase);
  await expect(page.locator("#backup-phrase")).toHaveValue("");
  await expect(page.locator("#backup-confirm")).toHaveValue("");
  const before = calls.length;
  await page.getByLabel("Archivo cifrado de prueba").setInputFiles({
    name: "ensayo.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  await page.getByLabel("Frase para abrir la copia").fill(backupPhrase);
  await page.getByRole("button", { name: "Comprobar archivo" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Archivo verificado: 2 pacientes ficticios, 4 versiones y 5 eventos",
  );
  expect(
    calls
      .slice(before)
      .every(
        (c) =>
          c.path.endsWith("/clinical_access_check") || c.path.endsWith("/user"),
      ),
  ).toBe(true);
  expect(calls.every((c) => !c.postBody?.includes(backupPhrase))).toBe(true);
});
test("mismatched encryption phrases never request a fixture or export", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await fillBackup(page, "Otra-frase-sintetica-diferente");
  await page
    .getByRole("button", { name: "Crear copia cifrada de prueba" })
    .click();
  await expect(page.getByRole("status")).toContainText("repítela exactamente");
  expect(calls.some((c) => c.path.includes("clinical_backup_"))).toBe(false);
});
test("a refused test fixture never downloads a partial backup", async ({
  page,
}) => {
  const calls = await mockAuth(page, { backupMode: "refuse" });
  await authorized(page);
  await fillBackup(page);
  const downloads = [];
  page.on("download", (d) => downloads.push(d));
  await page
    .getByRole("button", { name: "Crear copia cifrada de prueba" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "No se pudo preparar la copia completa",
  );
  expect(downloads).toHaveLength(0);
  expect(
    calls.some((c) => c.path.endsWith("/clinical_backup_export_test")),
  ).toBe(false);
});
test("wrong phrases and incomplete encrypted snapshots fail local verification", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  const { encryptBackup } = await import("../backups/crypto.mjs");
  for (const [snapshot, phrase] of [
    [backupFixture, "Otra-frase-sintetica-incorrecta"],
    [{ ...backupFixture, patient_versions: [] }, backupPhrase],
  ]) {
    const encrypted = await encryptBackup(snapshot, backupPhrase);
    await page.getByLabel("Archivo cifrado de prueba").setInputFiles({
      name: "ensayo.mlrehab",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(encrypted),
    });
    await page.getByLabel("Frase para abrir la copia").fill(phrase);
    await page.getByRole("button", { name: "Comprobar archivo" }).click();
    await expect(page.getByRole("status")).toContainText(
      "No se pudo verificar el archivo",
    );
    await expect(page.locator("#restore-phrase")).toHaveValue("");
  }
});
