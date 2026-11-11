const { test, expect } = require("@playwright/test");
const userId = "11111111-1111-4111-8111-111111111111";
const factor = {
  id: "22222222-2222-4222-8222-222222222222",
  factor_type: "totp",
  status: "verified",
};
const secret = "SYNTHETICNOTASECRET";

async function mockAuth(
  page,
  { enrolled = true, badPassword = false, badCode = false, access = "ok" } = {},
) {
  let verified = enrolled;
  const calls = [];
  const user = () => ({
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic@example.invalid",
    factors: verified ? [factor] : [],
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
    calls.push({ path, method: request.method() });
    let body;
    let status = 200;
    if (path === "/rest/v1/rpc/clinical_access_check") {
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
    } else if (path.endsWith("/token")) {
      body = badPassword
        ? { code: "invalid_credentials", msg: "Invalid login credentials" }
        : session("aal1");
      if (badPassword) status = 400;
    } else if (path.endsWith("/user")) body = user();
    else if (path.endsWith("/factors")) {
      body = {
        id: factor.id,
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
        verified = true;
        body = session("aal2");
      }
    } else if (path.endsWith("/logout")) body = {};
    else throw new Error(`Unexpected endpoint ${path}`);
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
  await page.getByLabel("Código de 6 dígitos").fill("123456");
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
  await page.getByLabel("Código de 6 dígitos").fill("123456");
  await page.getByRole("button", { name: "Verificar segundo factor" }).click();
  await expect(page.locator("#complete")).toBeVisible();
  await expect(page.locator("#secret")).toHaveText("");
  expect(await page.locator("#qr").getAttribute("src")).toBeNull();
});

test("invalid MFA does not open the completed screen", async ({ page }) => {
  await mockAuth(page, { badCode: true });
  await login(page);
  await page.getByLabel("Código de 6 dígitos").fill("123456");
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
    await page.getByLabel("Código de 6 dígitos").fill("123456");
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
