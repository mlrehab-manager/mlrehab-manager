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
    patientMode = "ok",
    agendaMode = "ok",
    catalogMode = "ok",
    dataMode = "test",
  } = {},
) {
  let backupCheck = null;
  let verified = enrolled;
  let reserveVerified = hasReserve;
  let pendingReserve = false;
  let loggedOut = false;
  let accessCalls = 0;
  const patients = structuredClone(
    dataMode === "clinical" ? [] : backupFixture.patients,
  ).map((p) => ({
    id: p.id,
    revision: p.revision,
    payload: JSON.parse(p.payload_json),
    archived_at: p.archived_at,
  }));
  const customExercises = [];
  const appointments = [],
    sessions = [];
  let agendaConflictGiven = false;
  let conflictGiven = false;
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
    if (path === "/rest/v1/rpc/clinical_backup_check_status") {
      body = { latest: backupCheck };
    } else if (path === "/rest/v1/rpc/clinical_backup_check_record") {
      const a = request.postDataJSON();
      body = backupCheck = {
        id: a.p_request_id,
        data_mode: dataMode,
        details: a.p_details,
        exported_at: "2026-11-20T12:00:00.000000Z",
        checked_at: "2026-11-22T12:00:00.000000Z",
      };
    } else if (path === "/rest/v1/rpc/clinical_exercise_list_test") {
      body = customExercises;
      if (catalogMode === "unavailable") {
        status = 503;
        body = { message: "Unavailable" };
      }
    } else if (path === "/rest/v1/rpc/clinical_exercise_create_test") {
      const a = request.postDataJSON();
      if (catalogMode === "unavailable" || catalogMode === "duplicate") {
        status = catalogMode === "duplicate" ? 409 : 503;
        body = {
          code: catalogMode === "duplicate" ? "23505" : "503",
          message: "Synthetic refusal",
        };
      } else {
        body = {
          id: `99999999-9999-4999-8999-${String(customExercises.length + 1).padStart(12, "0")}`,
          clinician_id: userId,
          name: a.p_name,
          category: a.p_category,
          regions: [...a.p_regions].sort(),
          created_at: "2026-11-18T12:00:00.000000Z",
          revision: 1,
          updated_at: "2026-11-18T12:00:00.000000Z",
          archived_at: null,
        };
        customExercises.push(body);
      }
    } else if (path === "/rest/v1/rpc/clinical_exercise_save_test") {
      const a = request.postDataJSON(),
        row = customExercises.find((e) => e.id === a.p_id);
      if (catalogMode === "conflict") {
        status = 409;
        body = { code: "40001", message: "Stale revision" };
      } else {
        Object.assign(row, {
          name: a.p_name,
          category: a.p_category,
          regions: [...a.p_regions].sort(),
          revision: row.revision + 1,
          archived_at: a.p_archived ? "2026-11-18T13:00:00.000000Z" : null,
        });
        body = row;
      }
    } else if (path === "/rest/v1/rpc/clinical_agenda_list_test") {
      const day = request.postDataJSON().p_day;
      body = {
        patients: patients
          .filter((p) => !p.archived_at)
          .map((p) => ({ id: p.id, name: p.payload.name })),
        appointments: appointments
          .filter((a) => a.local.slice(0, 10) === day)
          .map((a) => ({
            ...a,
            patient_name: patients.find((p) => p.id === a.patient_id).payload
              .name,
            patient_archived: false,
            session_id:
              sessions.find((s) => s.appointment_id === a.id)?.id ?? null,
          })),
      };
    } else if (path === "/rest/v1/rpc/clinical_appointment_save_test") {
      const a = request.postDataJSON();
      if (agendaMode === "overlap" && !agendaConflictGiven) {
        agendaConflictGiven = true;
        status = 409;
        body = { code: "23P01", message: "Overlap" };
      } else {
        const old = appointments.find((p) => p.id === a.p_id),
          start = new Date(a.p_start_local + "Z");
        start.setUTCHours(start.getUTCHours() - 1);
        body = {
          id: old?.id ?? "77777777-7777-4777-8777-777777777777",
          clinician_id: userId,
          patient_id: a.p_patient_id,
          starts_at: start.toISOString(),
          ends_at: new Date(+start + a.p_minutes * 60000).toISOString(),
          status: a.p_status,
          revision: (old?.revision ?? 0) + 1,
          local: a.p_start_local,
        };
        if (old) Object.assign(old, body);
        else appointments.push(body);
      }
    } else if (path === "/rest/v1/rpc/clinical_session_get_test") {
      body =
        sessions.find(
          (s) => s.appointment_id === request.postDataJSON().p_appointment_id,
        ) ?? null;
    } else if (path === "/rest/v1/rpc/clinical_session_save_test") {
      const a = request.postDataJSON();
      if (["conflict", "unavailable"].includes(agendaMode)) {
        status = agendaMode === "conflict" ? 409 : 503;
        body = {
          code: agendaMode === "conflict" ? "40001" : "503",
          message: "Synthetic refusal",
        };
      } else {
        const old = sessions.find((s) => s.id === a.p_id),
          appt = appointments.find((p) => p.id === a.p_appointment_id);
        body = {
          id: old?.id ?? "88888888-8888-4888-8888-888888888888",
          clinician_id: userId,
          patient_id: appt.patient_id,
          appointment_id: appt.id,
          evolution: a.p_evolution,
          passive: a.p_passive,
          exercise: a.p_exercise,
          revision: (old?.revision ?? 0) + 1,
        };
        if (old) Object.assign(old, body);
        else {
          sessions.push(body);
          appt.status = "completed";
          appt.revision++;
        }
      }
    } else if (path === "/rest/v1/rpc/clinical_patient_register") {
      const a = request.postDataJSON();
      let row = patients.find((p) => p.id === a.p_request_id);
      const repeated = Boolean(row);
      if (!row) {
        row = {
          id: a.p_request_id,
          revision: 1,
          archived_at: null,
          payload: {
            record_type: "clinical-patient-v1",
            ...a.p_identity,
            name: a.p_identity.given_name + " " + a.p_identity.family_name,
            reason: "",
            precautions: "",
            history: "",
            exam: "",
            diagnosis: "",
            goals: "",
          },
        };
        patients.push(row);
      }
      body = { id: row.id, revision: row.revision, already_present: repeated };
      if (patientMode === "lost-ack" && !conflictGiven) {
        conflictGiven = true;
        status = 503;
        body = { message: "Lost acknowledgment" };
      }
    } else if (path === "/rest/v1/rpc/clinical_patient_create_test") {
      const a = request.postDataJSON();
      let row = patients.find((p) => p.id === a.p_request_id);
      const repeated = Boolean(row);
      if (!row) {
        row = {
          id: a.p_request_id,
          revision: 1,
          archived_at: null,
          payload: {
            fixture: "patient-workflow-v1",
            testOnly: true,
            alias: a.p_alias,
            name: "FICTICIO · " + a.p_alias,
            history: "",
            exam: "",
            diagnosis: "",
            goals: "",
          },
        };
        patients.push(row);
      }
      body = { id: row.id, revision: row.revision, already_present: repeated };
      if (patientMode === "lost-ack" && !conflictGiven) {
        conflictGiven = true;
        status = 503;
        body = { message: "Lost acknowledgment" };
      }
    } else if (path === "/rest/v1/rpc/clinical_patient_archive_test") {
      const a = request.postDataJSON(),
        p = patients.find((p) => p.id === a.p_id);
      if (patientMode === "scheduled") {
        status = 400;
        body = { code: "23514", message: "Scheduled appointment" };
      } else {
        p.archived_at = "2026-11-21T12:00:00.000000Z";
        if (p.payload.record_type === "clinical-patient-v1")
          p.payload.name = p.payload.given_name + " " + p.payload.family_name;
        p.revision++;
        body = { id: p.id, revision: p.revision };
      }
    } else if (path === "/rest/v1/rpc/clinical_patient_list_test") {
      body = patients.map((p) => ({
        id: p.id,
        name: p.payload.name,
        birth_date: p.payload.birth_date,
        revision: p.revision,
        archived: p.archived_at !== null,
      }));
    } else if (path === "/rest/v1/rpc/clinical_patient_get") {
      body = patients.find((p) => p.id === request.postDataJSON().p_id);
    } else if (path === "/rest/v1/rpc/clinical_patient_save_fields_test") {
      const args = request.postDataJSON(),
        p = patients.find((p) => p.id === args.p_id);
      if (patientMode === "conflict" && !conflictGiven) {
        conflictGiven = true;
        p.revision++;
        p.payload.history = "Cambio ficticio desde otra pestaña";
        status = 409;
        body = { code: "40001", message: "Stale revision" };
      } else if (patientMode === "unavailable") {
        status = 503;
        body = { message: "Unavailable" };
      } else {
        Object.assign(p.payload, args.p_fields);
        if (args.p_fields.alias !== undefined)
          p.payload.name = "FICTICIO · " + args.p_fields.alias;
        p.revision++;
        body = { id: p.id, revision: p.revision };
      }
    } else if (path === "/rest/v1/rpc/clinical_backup_seed_test") {
      body = { patients: 2, already_present: false };
      if (backupMode === "refuse") {
        status = 400;
        body = { code: "22023", message: "Fixture only" };
      }
    } else if (path === "/rest/v1/rpc/clinical_backup_export_test") {
      body =
        dataMode === "clinical"
          ? require("./backup-clinical-model-fixture.json")
          : backupMode === "intake"
            ? require("./backup-intake-fixture.json")
            : backupMode === "workflow"
              ? require("./backup-patient-workflow-fixture.json")
              : backupMode === "revisions"
                ? require("./backup-exercise-revisions-fixture.json")
                : backupMode === "catalog"
                  ? require("./backup-catalog-fixture.json")
                  : backupMode === "agenda"
                    ? require("./backup-agenda-fixture.json")
                    : backupFixture;
      if (backupMode === "refuse") {
        status = 400;
        body = { code: "22023", message: "Complete export refused" };
      }
    } else if (path === "/rest/v1/rpc/clinical_access_check") {
      accessCalls++;
      body = { authorized: true, data_mode: dataMode };
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

async function navigate(page, view) {
  await page.locator(`[data-app-page="${view}"]`).first().click();
  await expect(page.locator(`[data-app-view="${view}"]`)).toBeVisible();
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
  await navigate(page, "access");
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
    await navigate(page, "access");
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
  await navigate(page, "access");
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
  await navigate(page, "access");
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
  await navigate(page, "access");
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
  await navigate(page, "access");
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
  await navigate(page, "backups");
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
  await navigate(page, "backups");
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
test("a refused complete export never downloads a partial backup", async ({
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
  ).toBe(true);
  expect(calls.some((c) => c.path.endsWith("/clinical_backup_seed_test"))).toBe(
    false,
  );
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
    await navigate(page, "backups");
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

async function openPatient(page, archived = false) {
  await navigate(page, "patients");
  await navigate(page, "patients");
  await page
    .getByRole("button", { name: "Cargar pacientes de prueba" })
    .click();
  await page
    .locator("#patient-list button")
    .filter({ hasText: archived ? "Archivado (solo lectura)" : "Activo" })
    .click();
  await expect(page.locator("#patient-editor")).toBeVisible();
}
test("private patient edits use revision-aware field patches, survive reopening and never persist in browser storage", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await openPatient(page);
  await page
    .getByLabel("Historia clínica ficticia")
    .fill("Historia ficticia para probar el guardado");
  await page.getByRole("button", { name: "Guardar ficha ficticia" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Ficha ficticia guardada en la base privada",
  );
  const save = calls.find((c) =>
    c.path.endsWith("/clinical_patient_save_fields_test"),
  );
  expect(JSON.parse(save.postBody)).toMatchObject({
    p_expected_revision: 2,
    p_fields: { history: "Historia ficticia para probar el guardado" },
  });
  expect(Object.keys(JSON.parse(save.postBody).p_fields)).toEqual(["history"]);
  await page.getByRole("button", { name: "Cargar versión guardada" }).click();
  await expect(page.getByLabel("Historia clínica ficticia")).toHaveValue(
    "Historia ficticia para probar el guardado",
  );
  await expect(page.locator("#patient-revision")).toHaveText("Versión 3");
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({});
  expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({});
});
test("archived fictitious patients are read-only", async ({ page }) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await openPatient(page, true);
  await expect(page.getByLabel("Historia clínica ficticia")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Guardar ficha ficticia" }),
  ).toBeDisabled();
  expect(
    calls.some((c) => c.path.endsWith("/clinical_patient_save_fields_test")),
  ).toBe(false);
});
test("stale edits retain the draft until the user explicitly loads the stored version", async ({
  page,
}) => {
  await mockAuth(page, { patientMode: "conflict" });
  await authorized(page);
  await openPatient(page);
  await page
    .getByLabel("Historia clínica ficticia")
    .fill("Mi borrador ficticio");
  await page.getByRole("button", { name: "Guardar ficha ficticia" }).click();
  await expect(page.getByRole("status")).toContainText("Tu texto sigue aquí");
  await expect(page.getByLabel("Historia clínica ficticia")).toHaveValue(
    "Mi borrador ficticio",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cargar versión guardada" }).click();
  await expect(page.getByLabel("Historia clínica ficticia")).toHaveValue(
    "Cambio ficticio desde otra pestaña",
  );
});
test("failed saves keep drafts, canceling navigation preserves them and backups exclude unsaved changes", async ({
  page,
}) => {
  const calls = await mockAuth(page, { patientMode: "unavailable" });
  await authorized(page);
  await openPatient(page);
  await page
    .getByLabel("Historia clínica ficticia")
    .fill("Borrador ficticio sin confirmar");
  await page.getByRole("button", { name: "Guardar ficha ficticia" }).click();
  await expect(page.getByRole("status")).toContainText(
    "No se ha podido confirmar el guardado",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await navigate(page, "patients");
  await page
    .getByRole("button", { name: "Cargar pacientes de prueba" })
    .click();
  await expect(page.getByLabel("Historia clínica ficticia")).toHaveValue(
    "Borrador ficticio sin confirmar",
  );
  await fillBackup(page);
  await page
    .getByRole("button", { name: "Crear copia cifrada de prueba" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Guarda o descarta los cambios",
  );
  expect(
    calls.some((c) => c.path.endsWith("/clinical_backup_export_test")),
  ).toBe(false);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#patient-editor")).toBeHidden();
  await expect(page.getByLabel("Historia clínica ficticia")).toHaveValue("");
});
test("a late patient response cannot reopen clinical content after logout", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const p = backupFixture.patients.find((p) => p.archived_at === null);
  await page.route("**/rest/v1/rpc/clinical_patient_get", async (route) => {
    await gate;
    await route
      .fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: p.id,
          revision: p.revision,
          payload: JSON.parse(p.payload_json),
          archived_at: null,
        }),
      })
      .catch(() => {});
  });
  await navigate(page, "patients");
  await page
    .getByRole("button", { name: "Cargar pacientes de prueba" })
    .click();
  const request = page.waitForRequest("**/rest/v1/rpc/clinical_patient_get");
  await page
    .locator("#patient-list button")
    .filter({ hasText: "Activo" })
    .click();
  await request;
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  release();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#patient-editor")).toBeHidden();
});

test("typing while a save is pending stays as a newer unsaved draft after confirmation", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  await openPatient(page);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/rest/v1/rpc/clinical_patient_save_fields_test",
    async (route) => {
      const args = route.request().postDataJSON();
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: args.p_id,
          revision: args.p_expected_revision + 1,
        }),
      });
    },
  );
  await page
    .getByLabel("Historia clínica ficticia")
    .fill("Texto ficticio enviado");
  const request = page.waitForRequest(
    "**/rest/v1/rpc/clinical_patient_save_fields_test",
  );
  await page.getByRole("button", { name: "Guardar ficha ficticia" }).click();
  await request;
  await page
    .getByLabel("Historia clínica ficticia")
    .fill("Texto ficticio escrito después");
  release();
  await expect(page.getByRole("status")).toContainText(
    "Hay cambios posteriores sin guardar",
  );
  await expect(page.getByLabel("Historia clínica ficticia")).toHaveValue(
    "Texto ficticio escrito después",
  );
});

async function authorizeAgenda(page, options = {}) {
  const calls = await mockAuth(page, options);
  await login(page);
  await page.locator("#code").fill("123456");
  await page.locator("#verify button").click();
  await expect(page.locator("#complete")).toBeVisible();
  await navigate(page, "agenda");
  await page.locator("#agenda-date").fill("2026-11-20");
  await navigate(page, "agenda");
  await page.locator("#agenda-load").click();
  await expect(page.locator("#agenda-loaded-day")).toContainText("20/11/2026");
  return calls;
}
async function bookAppointment(page) {
  await navigate(page, "agenda");
  await page.locator("#agenda-new").click();
  await expect(page.locator("#agenda-editor")).toBeVisible();
  await navigate(page, "agenda");
  await page.locator("#appointment-start").fill("2026-11-20T09:00");
  await navigate(page, "agenda");
  await page.locator("#appointment-form button").click();
  await expect(page.getByRole("status")).toContainText(
    "Cita ficticia guardada",
  );
}
test("private agenda books, reopens, reschedules and cancels a fictional appointment on iPad", async ({
  page,
}) => {
  const calls = await authorizeAgenda(page);
  await bookAppointment(page);
  await expect(page.locator("#appointment-patient")).toBeDisabled();
  await expect(page.locator("#agenda-list")).toContainText("09:00–09:45");
  const args = JSON.parse(
    calls.find((c) => c.path.endsWith("clinical_appointment_save_test"))
      .postBody,
  );
  expect(args.p_start_local).toBe("2026-11-20T09:00");
  expect(args.p_expected_revision).toBeNull();
  await navigate(page, "agenda");
  await page.locator("#agenda-list button").click();
  await expect(page.locator("#appointment-start")).toHaveValue(
    "2026-11-20T09:00",
  );
  await navigate(page, "agenda");
  await page.locator("#appointment-start").fill("2026-11-20T11:30");
  await navigate(page, "agenda");
  await page.locator("#appointment-form button").click();
  await expect(page.locator("#agenda-list")).toContainText("11:30–12:15");
  await navigate(page, "agenda");
  await page.locator("#appointment-status").selectOption("cancelled");
  await navigate(page, "agenda");
  await page.locator("#appointment-form button").click();
  await expect(page.locator("#agenda-list")).toContainText("Cancelada");
  await expect(page.locator("#session-evolution")).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("an overlap refusal retains appointment values for correction", async ({
  page,
}) => {
  await authorizeAgenda(page, { agendaMode: "overlap" });
  await navigate(page, "agenda");
  await page.locator("#agenda-new").click();
  await navigate(page, "agenda");
  await page.locator("#appointment-form button").click();
  await expect(page.getByRole("status")).toContainText("solapa");
  await expect(page.locator("#appointment-start")).toHaveValue(
    "2026-11-20T09:00",
  );
  await navigate(page, "agenda");
  await page.locator("#appointment-start").fill("2026-11-20T10:00");
  await navigate(page, "agenda");
  await page.locator("#appointment-form button").click();
  await expect(page.locator("#agenda-list")).toContainText("10:00");
});
test("sessions persist evolution, passive treatment and exercise and complete the appointment", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await bookAppointment(page);
  await navigate(page, "agenda");
  await page.locator("#session-evolution").fill("Evolución ficticia de prueba");
  await navigate(page, "agenda");
  await page.locator("#session-passive").fill("Tratamiento pasivo de prueba");
  await navigate(page, "agenda");
  await page.locator("#session-exercise").fill("Isométricos ficticios");
  await navigate(page, "agenda");
  await page.locator("#session-form button[type=submit]").click();
  await expect(page.getByRole("status")).toContainText("queda realizada");
  await expect(page.locator("#appointment-start")).toBeDisabled();
  await expect(page.locator("#session-exercise")).toBeEnabled();
  await navigate(page, "agenda");
  await page.locator("#agenda-list button").click();
  await expect(page.locator("#session-passive")).toHaveValue(
    "Tratamiento pasivo de prueba",
  );
  await expect(page.locator("#session-exercise")).toHaveValue(
    "Isométricos ficticios",
  );
  await navigate(page, "agenda");
  await page.locator("#session-evolution").fill("Evolución ficticia revisada");
  await navigate(page, "agenda");
  await page.locator("#session-form button[type=submit]").click();
  await expect(page.locator("#session-state")).toContainText("versión 2");
});
for (const agendaMode of ["conflict", "unavailable"])
  test(`session ${agendaMode} preserves drafts and blocks a misleading backup`, async ({
    page,
  }) => {
    const calls = await authorizeAgenda(page, { agendaMode });
    await bookAppointment(page);
    await page
      .locator("#session-evolution")
      .fill("Borrador ficticio que conservar");
    await navigate(page, "agenda");
    await page.locator("#session-form button[type=submit]").click();
    await expect(page.getByRole("status")).toContainText(
      agendaMode === "conflict" ? "ha cambiado" : "borrador",
    );
    await expect(page.locator("#session-evolution")).toHaveValue(
      "Borrador ficticio que conservar",
    );
    await navigate(page, "backups");
    await page.locator("#backup-phrase").fill("Frase sintetica suficiente");
    await navigate(page, "backups");
    await page.locator("#backup-confirm").fill("Frase sintetica suficiente");
    await navigate(page, "backups");
    await page.locator("#backup-export button").click();
    await expect(page.getByRole("status")).toContainText("Guarda o descarta");
    expect(
      calls.some((c) => c.path.endsWith("clinical_backup_export_test")),
    ).toBe(false);
  });
test("pending session response cannot restore private text after automatic logout", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await bookAppointment(page);
  await page
    .locator("#session-evolution")
    .fill("Texto ficticio sensible de prueba");
  let finish;
  const held = new Promise((resolve) => (finish = resolve));
  let requested;
  const started = new Promise((resolve) => (requested = resolve));
  await page.route("**/rpc/clinical_session_save_test", async (route) => {
    requested();
    await held;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "synthetic",
        appointment_id: "77777777-7777-4777-8777-777777777777",
        revision: 1,
      }),
    });
  });
  await navigate(page, "agenda");
  await page.locator("#session-form button[type=submit]").click();
  await started;
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now + 6 * 60 * 1000;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  finish();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#agenda-editor")).toBeHidden();
  await expect(page.locator("#session-evolution")).toHaveValue("");
});
test("changing agenda day asks before discarding session drafts", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await bookAppointment(page);
  await navigate(page, "agenda");
  await page.locator("#session-evolution").fill("Borrador ficticio");
  page.once("dialog", (dialog) => dialog.dismiss());
  await navigate(page, "agenda");
  await page.locator("#agenda-next").click();
  await expect(page.locator("#agenda-date")).toHaveValue("2026-11-20");
  await expect(page.locator("#session-evolution")).toHaveValue(
    "Borrador ficticio",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await navigate(page, "agenda");
  await page.locator("#agenda-next").click();
  await expect(page.locator("#agenda-loaded-day")).toContainText("21/11/2026");
  await expect(page.locator("#agenda-editor")).toBeHidden();
});

test("version-2 encrypted files include agenda and sessions and are checked locally", async ({
  page,
}) => {
  const calls = await mockAuth(page, { backupMode: "agenda" });
  await authorized(page);
  await fillBackup(page);
  const downloaded = page.waitForEvent("download");
  await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  const file = await downloaded,
    encrypted = await readFile(await file.path(), "utf8");
  const { decryptBackup } = await import("../backups/crypto.mjs");
  const snapshot = await decryptBackup(encrypted, backupPhrase);
  expect(snapshot.version).toBe(2);
  expect(snapshot.sessions).toHaveLength(1);
  const before = calls.length;
  await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "agenda.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  await navigate(page, "backups");
  await page.locator("#backup-inspect button").click();
  await expect(page.getByRole("status")).toContainText(
    "Incluye 1 citas y 1 sesiones",
  );
  expect(
    calls
      .slice(before)
      .every(
        (c) =>
          c.path.endsWith("clinical_access_check") || c.path.endsWith("/user"),
      ),
  ).toBe(true);
});

async function openExercisePicker(page) {
  await authorizeAgenda(page);
  await bookAppointment(page);
  await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
}
test("private exercise catalogue combines name, region and modality filters without network calls", async ({
  page,
}) => {
  const calls = await authorizeAgenda(page);
  await bookAppointment(page);
  await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
  await expect(page.locator("#exercise-catalog-state")).toContainText(
    "0 ejercicios propios cargados",
  );
  const before = calls.length;
  await expect(page.locator("#exercise-count")).toContainText("130 ejercicios");
  await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("extension");
  await navigate(page, "agenda");
  await page.locator("#exercise-region").selectOption("knee");
  await navigate(page, "agenda");
  await page.locator("#exercise-category").selectOption("concentric");
  await expect(page.locator("#exercise-results button")).toHaveCount(1);
  await expect(page.locator("#exercise-results")).toContainText(
    "Extensión de rodilla con énfasis concéntrico",
  );
  await navigate(page, "agenda");
  await page.locator("#exercise-category").selectOption("isometric");
  await expect(page.locator("#exercise-results")).toContainText(
    "Extensión isométrica de rodilla en máquina",
  );
  await navigate(page, "agenda");
  await page.locator("#exercise-category").selectOption("dynamic-all");
  await expect(page.locator("#exercise-results")).toContainText("Concéntricos");
  await navigate(page, "agenda");
  await page.locator("#exercise-category").selectOption("plyometric");
  await expect(page.locator("#exercise-results button")).toHaveCount(0);
  await expect(page.locator("#exercise-count")).toContainText(
    "No hay coincidencias",
  );
  await page.locator("#exercise-search").press("Enter");
  expect(calls).toHaveLength(before);
});
test("adding exercise names preserves manual notes, avoids duplicates and persists on reopening the session", async ({
  page,
}) => {
  await openExercisePicker(page);
  await page
    .locator("#session-exercise")
    .fill("Nota ficticia manual para esta sesión");
  await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("sentadilla española");
  const button = page.getByRole("button", {
    name: "Añadir Sentadilla española isométrica",
    exact: true,
  });
  await button.click();
  await button.click();
  await expect(page.locator("#session-exercise")).toHaveValue(
    "Nota ficticia manual para esta sesión\n- Sentadilla española isométrica",
  );
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await navigate(page, "agenda");
  await page.locator("#exercise-region").selectOption("shoulder");
  await expect(page.locator("#exercise-results button")).toHaveCount(0);
  await navigate(page, "agenda");
  await page.locator("#session-form button[type=submit]").click();
  await expect(page.locator("#status")).toContainText("queda realizada");
  await navigate(page, "agenda");
  await page.locator("#agenda-list button").click();
  await expect(page.locator("#session-exercise")).toHaveValue(
    "Nota ficticia manual para esta sesión\n- Sentadilla española isométrica",
  );
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
});
test("selecting a catalogue exercise is an unsaved session draft and blocks backup until saved", async ({
  page,
}) => {
  await openExercisePicker(page);
  await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("sentadilla española");
  await page
    .getByRole("button", {
      name: "Añadir Sentadilla española isométrica",
      exact: true,
    })
    .click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await navigate(page, "agenda");
  await page.locator("#agenda-next").click();
  await expect(page.locator("#session-exercise")).toHaveValue(
    "- Sentadilla española isométrica",
  );
  await fillBackup(page);
  await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  await expect(page.locator("#status")).toContainText("Guarda o descarta");
});
test("the exercise picker respects cancellation and the session text size limit", async ({
  page,
}) => {
  await openExercisePicker(page);
  await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("sentadilla española");
  await navigate(page, "agenda");
  await page.locator("#session-exercise").fill("x".repeat(3990));
  await page
    .getByRole("button", {
      name: "Añadir Sentadilla española isométrica",
      exact: true,
    })
    .click();
  await expect(page.locator("#status")).toContainText("límite");
  await expect(page.locator("#session-exercise")).toHaveValue("x".repeat(3990));
  await navigate(page, "agenda");
  await page.locator("#session-exercise").fill("");
  await navigate(page, "agenda");
  await page.locator("#appointment-status").selectOption("cancelled");
  await navigate(page, "agenda");
  await page.locator("#appointment-form button[type=submit]").click();
  await expect(page.locator("#exercise-search")).toBeDisabled();
  await expect(page.locator("#exercise-results button").first()).toBeDisabled();
});
test("automatic logout clears exercise searches and selected session names", async ({
  page,
}) => {
  await openExercisePicker(page);
  await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("sentadilla española");
  await page
    .getByRole("button", {
      name: "Añadir Sentadilla española isométrica",
      exact: true,
    })
    .click();
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now + 6 * 60 * 1000;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#session-exercise")).toHaveValue("");
  await expect(page.locator("#exercise-search")).toHaveValue("");
  await expect(page.locator("#exercise-picker")).not.toHaveAttribute("open");
});

async function fillOwnExercise(
  page,
  name = "Ejercicio propio ficticio de rodilla",
) {
  await navigate(page, "exercises");
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-name").fill(name);
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-category").selectOption("eccentric");
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-regions input[value=knee]").check();
}
test("a personal exercise is classified, reloaded and reusable after a fresh login", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await fillOwnExercise(page);
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-form button[type=submit]").click();
  await expect(page.locator("#status")).toContainText(
    "Ejercicio propio guardado",
  );
  await expect(page.locator("#custom-exercise-name")).toHaveValue("");
  await page.reload();
  await authorized(page);
  await navigate(page, "exercises");
  await page.locator("#exercise-catalog-load").click();
  await expect(page.locator("#exercise-catalog-state")).toContainText(
    "1 ejercicios propios cargados",
  );
  await expect(page.locator("#exercise-own-list")).toContainText(
    "Ejercicio propio ficticio de rodilla",
  );
  await navigate(page, "agenda");
  await page.locator("#agenda-date").fill("2026-11-20");
  await navigate(page, "agenda");
  await page.locator("#agenda-new").click();
  await expect(page.locator("#appointment-start")).toHaveValue(
    "2026-11-20T09:00",
  );
  await navigate(page, "agenda");
  await page.locator("#appointment-form button[type=submit]").click();
  await expect(page.locator("#session-form")).toBeVisible();
  await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
  await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("ejercicio propio ficticio");
  await navigate(page, "agenda");
  await page.locator("#exercise-region").selectOption("knee");
  await navigate(page, "agenda");
  await page.locator("#exercise-category").selectOption("eccentric");
  await page
    .getByRole("button", {
      name: "Añadir Ejercicio propio ficticio de rodilla",
      exact: true,
    })
    .click();
  await navigate(page, "agenda");
  await page.locator("#session-form button[type=submit]").click();
  await expect(page.locator("#status")).toContainText("queda realizada");
  await navigate(page, "agenda");
  await page.locator("#agenda-list button").click();
  await expect(page.locator("#session-exercise")).toHaveValue(
    "- Ejercicio propio ficticio de rodilla",
  );
});
for (const catalogMode of ["unavailable", "duplicate"])
  test(`catalogue ${catalogMode} retains the creation draft and blocks backups`, async ({
    page,
  }) => {
    await mockAuth(page, { catalogMode });
    await authorized(page);
    await fillOwnExercise(page);
    await navigate(page, "exercises");
    await page.locator("#custom-exercise-form button[type=submit]").click();
    await expect(page.locator("#status")).toContainText(
      catalogMode === "duplicate" ? "Ya existe" : "No se pudo confirmar",
    );
    await expect(page.locator("#custom-exercise-name")).toHaveValue(
      "Ejercicio propio ficticio de rodilla",
    );
    await fillBackup(page);
    await navigate(page, "backups");
    await page.locator("#backup-export button").click();
    await expect(page.locator("#status")).toContainText("Guarda o descarta");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#logout").click();
    await expect(page.locator("#custom-exercise-name")).toHaveValue(
      "Ejercicio propio ficticio de rodilla",
    );
  });
test("catalogue draft and late creation responses are cleared on automatic logout", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  await fillOwnExercise(page, "Nombre ficticio temporal");
  let finish, started;
  const held = new Promise((resolve) => (finish = resolve)),
    requested = new Promise((resolve) => (started = resolve));
  await page.route("**/rpc/clinical_exercise_create_test", async (route) => {
    started();
    await held;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "synthetic",
        name: "Nombre ficticio temporal",
        category: "eccentric",
        regions: ["knee"],
      }),
    });
  });
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-form button[type=submit]").click();
  await requested;
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now + 6 * 60 * 1000;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  finish();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#custom-exercise-name")).toHaveValue("");
  await expect(page.locator("#exercise-own-list")).toBeEmpty();
});
test("built-in names are reused and a failed personal catalogue load keeps the built-in picker usable", async ({
  page,
}) => {
  const calls = await mockAuth(page, { catalogMode: "unavailable" });
  await authorized(page);
  await fillOwnExercise(page, "Sentadilla española isométrica");
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-form button[type=submit]").click();
  await expect(page.locator("#status")).toContainText(
    "ya está en el catálogo inicial",
  );
  expect(
    calls.some((c) => c.path.endsWith("clinical_exercise_create_test")),
  ).toBe(false);
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-name").fill("");
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-category").selectOption("other");
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-regions input[value=knee]").uncheck();
  await navigate(page, "agenda");
  await page.locator("#agenda-date").fill("2026-11-20");
  await navigate(page, "agenda");
  await page.locator("#agenda-new").click();
  await navigate(page, "agenda");
  await page.locator("#appointment-form button[type=submit]").click();
  await expect(page.locator("#session-form")).toBeVisible();
  await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
  await expect(page.locator("#status")).toContainText("catálogo");
  await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("sentadilla española");
  await page
    .getByRole("button", {
      name: "Añadir Sentadilla española isométrica",
      exact: true,
    })
    .click();
  await expect(page.locator("#session-exercise")).toHaveValue(
    "- Sentadilla española isométrica",
  );
});
test("version-3 encrypted files include personal exercise names and still verify locally", async ({
  page,
}) => {
  const calls = await mockAuth(page, { backupMode: "catalog" });
  await authorized(page);
  await fillBackup(page);
  const downloaded = page.waitForEvent("download");
  await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  const file = await downloaded,
    encrypted = await readFile(await file.path(), "utf8");
  const { decryptBackup } = await import("../backups/crypto.mjs");
  const snapshot = await decryptBackup(encrypted, backupPhrase);
  expect(snapshot.version).toBe(3);
  expect(snapshot.custom_exercises).toHaveLength(1);
  const before = calls.length;
  await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "catalogo.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  await navigate(page, "backups");
  await page.locator("#backup-inspect button").click();
  await expect(page.locator("#status")).toContainText(
    "Incluye 1 ejercicios propios",
  );
  expect(
    calls
      .slice(before)
      .every(
        (c) =>
          c.path.endsWith("clinical_access_check") || c.path.endsWith("/user"),
      ),
  ).toBe(true);
});

test("personal exercises can be revised and archived without altering saved session text", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await fillOwnExercise(page, "Ejercicio ficticio original");
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-submit").click();
  await expect(page.locator("#status")).toContainText("guardado");
  await bookAppointment(page);
  await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
  await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("ficticio original");
  await page
    .getByRole("button", {
      name: "Añadir Ejercicio ficticio original",
      exact: true,
    })
    .click();
  await navigate(page, "agenda");
  await page.locator("#session-form button[type=submit]").click();
  await expect(page.locator("#status")).toContainText("queda realizada");
  await navigate(page, "exercises");
  await page
    .getByRole("button", {
      name: "Editar Ejercicio ficticio original",
      exact: true,
    })
    .click();
  await page
    .locator("#custom-exercise-name")
    .fill("Ejercicio ficticio revisado");
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-submit").click();
  await expect(page.locator("#exercise-own-list")).toContainText(
    "Ejercicio ficticio revisado",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", {
      name: "Archivar Ejercicio ficticio revisado",
      exact: true,
    })
    .click();
  await expect(page.locator("#status")).toContainText("Ejercicio archivado");
  await expect(page.locator("#exercise-own-list")).not.toContainText(
    "Ejercicio ficticio revisado",
  );
  await page.locator("#exercise-show-archived").check();
  await expect(page.locator("#exercise-own-list")).toContainText("Archivado");
  await navigate(page, "agenda");
  await page.locator("#agenda-list button").click();
  await expect(page.locator("#session-exercise")).toHaveValue(
    "- Ejercicio ficticio original",
  );
  await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
  await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("ficticio revisado");
  await expect(page.locator("#exercise-results button")).toHaveCount(0);
});
test("stale personal exercise edits retain the draft and require explicitly loading the stored version", async ({
  page,
}) => {
  await mockAuth(page, { catalogMode: "conflict" });
  await authorized(page);
  await fillOwnExercise(page, "Ejercicio ficticio de conflicto");
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-submit").click();
  await expect(page.locator("#status")).toContainText("guardado");
  await page
    .getByRole("button", {
      name: "Editar Ejercicio ficticio de conflicto",
      exact: true,
    })
    .click();
  await page
    .locator("#custom-exercise-name")
    .fill("Borrador ficticio revisado");
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-submit").click();
  await expect(page.locator("#status")).toContainText("ha cambiado");
  await expect(page.locator("#custom-exercise-name")).toHaveValue(
    "Borrador ficticio revisado",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-cancel").click();
  await expect(page.locator("#custom-exercise-name")).toHaveValue(
    "Borrador ficticio revisado",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await navigate(page, "exercises");
  await page.locator("#custom-exercise-cancel").click();
  await expect(page.locator("#custom-exercise-name")).toHaveValue("");
});

test("version-4 encrypted backups include exercise history and retain local verification", async ({
  page,
}) => {
  const calls = await mockAuth(page, { backupMode: "revisions" });
  await authorized(page);
  await fillBackup(page);
  const downloaded = page.waitForEvent("download");
  await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  const file = await downloaded,
    encrypted = await readFile(await file.path(), "utf8"),
    { decryptBackup } = await import("../backups/crypto.mjs");
  const snapshot = await decryptBackup(encrypted, backupPhrase);
  expect(snapshot.version).toBe(4);
  expect(snapshot.exercise_versions).toHaveLength(2);
  expect(snapshot.custom_exercises[0].archived_at).not.toBeNull();
  const before = calls.length;
  await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "historial.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  await navigate(page, "backups");
  await page.locator("#backup-inspect button").click();
  await expect(page.locator("#status")).toContainText("Archivo verificado");
  expect(
    calls
      .slice(before)
      .every(
        (c) =>
          c.path.endsWith("clinical_access_check") || c.path.endsWith("/user"),
      ),
  ).toBe(true);
});

async function newPatient(page, alias = "Caso tres") {
  await navigate(page, "patients");
  await navigate(page, "patients");
  await page.locator("#patient-new").click();
  await navigate(page, "patients");
  await page.locator("#patient-create-alias").fill(alias);
  await navigate(page, "patients");
  await page.locator("#patient-create-form button[type=submit]").click();
}
test("new fictional patients can be created, renamed, searched and archived with retained history", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await newPatient(page);
  await expect(page.locator("#patient-name")).toHaveText(
    "FICTICIO · Caso tres",
  );
  await navigate(page, "patients");
  await page.locator("#patient-alias").fill("Caso de rodilla");
  await navigate(page, "patients");
  await page.locator("#patient-history").fill("Historia ficticia nueva");
  await navigate(page, "patients");
  await page.locator("#patient-form button[type=submit]").click();
  await expect(page.getByRole("status")).toContainText("guardada");
  await navigate(page, "patients");
  await page.locator("#patient-search").fill("RODILLA");
  await expect(page.locator("#patient-list button")).toHaveCount(1);
  await expect(page.locator("#patient-count")).toContainText("3 fichas");
  page.once("dialog", (d) => d.accept());
  await navigate(page, "patients");
  await page.locator("#patient-archive").click();
  await expect(page.getByRole("status")).toContainText("archivada");
  await expect(page.locator("#patient-history")).toBeDisabled();
  await expect(page.locator("#patient-history")).toHaveValue(
    "Historia ficticia nueva",
  );
  await expect(page.locator("#patient-archive")).toBeHidden();
  expect(calls.some((c) => c.path.endsWith("/clinical_backup_seed_test"))).toBe(
    false,
  );
});
test("retrying an uncertain patient creation reuses its request ID and does not duplicate the patient", async ({
  page,
}) => {
  const calls = await mockAuth(page, { patientMode: "lost-ack" });
  await authorized(page);
  await newPatient(page, "Caso con conexión inestable");
  await expect(page.getByRole("status")).toContainText(
    "No se ha podido confirmar",
  );
  await expect(page.locator("#patient-create-alias")).toHaveValue(
    "Caso con conexión inestable",
  );
  await navigate(page, "patients");
  await page.locator("#patient-create-form button[type=submit]").click();
  await expect(page.locator("#patient-name")).toHaveText(
    "FICTICIO · Caso con conexión inestable",
  );
  await expect(page.locator("#patient-count")).toContainText("3 fichas");
  const ids = calls
    .filter((c) => c.path.endsWith("/clinical_patient_create_test"))
    .map((c) => JSON.parse(c.postBody).p_request_id);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});
test("a scheduled appointment prevents archiving without clearing the patient", async ({
  page,
}) => {
  await mockAuth(page, { patientMode: "scheduled" });
  await authorized(page);
  await openPatient(page);
  page.once("dialog", (d) => d.accept());
  await navigate(page, "patients");
  await page.locator("#patient-archive").click();
  await expect(page.getByRole("status")).toContainText("citas programadas");
  await expect(page.locator("#patient-history")).toBeEnabled();
  await expect(page.locator("#patient-archive")).toBeVisible();
});
test("new patient drafts block incomplete backups and are cleared after logout", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await navigate(page, "patients");
  await page.locator("#patient-new").click();
  await navigate(page, "patients");
  await page.locator("#patient-create-alias").fill("Alta ficticia pendiente");
  await fillBackup(page);
  await page
    .getByRole("button", { name: "Crear copia cifrada de prueba" })
    .click();
  await expect(page.getByRole("status")).toContainText("Guarda o descarta");
  expect(
    calls.some((c) => c.path.endsWith("/clinical_backup_export_test")),
  ).toBe(false);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.locator("#patient-create-form")).toBeHidden();
  await expect(page.locator("#patient-create-alias")).toHaveValue("");
});
test("version-5 downloads and locally verifies a complete copy with three fictional patients", async ({
  page,
}) => {
  const calls = await mockAuth(page, { backupMode: "workflow" });
  await authorized(page);
  await fillBackup(page);
  const downloaded = page.waitForEvent("download");
  await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  const file = await downloaded,
    encrypted = await readFile(await file.path(), "utf8"),
    { decryptBackup } = await import("../backups/crypto.mjs");
  const snapshot = await decryptBackup(encrypted, backupPhrase);
  expect(snapshot.version).toBe(5);
  expect(snapshot.patients).toHaveLength(3);
  expect(calls.some((c) => c.path.endsWith("/clinical_backup_seed_test"))).toBe(
    false,
  );
  await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "tres-fichas.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  await navigate(page, "backups");
  await page.locator("#backup-inspect button").click();
  await expect(page.locator("#status")).toContainText("Archivo verificado");
});

test("optional intake fields save separately, reopen, stay read-only when archived and clear at logout", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await openPatient(page);
  const priorHistory = await page.locator("#patient-history").inputValue();
  await page
    .getByLabel("Motivo de consulta ficticio", { exact: true })
    .fill("Motivo ficticio separado");
  await page
    .getByLabel("Antecedentes y precauciones ficticios", { exact: true })
    .fill("Antecedente ficticio separado");
  await page.getByRole("button", { name: "Guardar ficha ficticia" }).click();
  await expect(page.getByRole("status")).toContainText("guardada");
  const saved = calls
    .filter((c) => c.path.endsWith("/clinical_patient_save_fields_test"))
    .at(-1);
  expect(JSON.parse(saved.postBody).p_fields).toEqual({
    reason: "Motivo ficticio separado",
    precautions: "Antecedente ficticio separado",
  });
  await navigate(page, "patients");
  await page.locator("#patient-refresh").click();
  await expect(page.locator("#patient-reason")).toHaveValue(
    "Motivo ficticio separado",
  );
  await expect(page.locator("#patient-precautions")).toHaveValue(
    "Antecedente ficticio separado",
  );
  await expect(page.locator("#patient-history")).toHaveValue(priorHistory);
  await navigate(page, "patients");
  await page.locator("#patient-load").click();
  await page
    .locator("#patient-list button")
    .filter({ hasText: "Archivado" })
    .click();
  await expect(page.locator("#patient-reason")).toBeDisabled();
  await expect(page.locator("#patient-precautions")).toBeDisabled();
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.locator("#patient-reason")).toHaveValue("");
  await expect(page.locator("#patient-precautions")).toHaveValue("");
});
for (const mode of ["conflict", "unavailable"])
  test(`intake ${mode} preserves its draft and blocks incomplete backups`, async ({
    page,
  }) => {
    const calls = await mockAuth(page, { patientMode: mode });
    await authorized(page);
    await openPatient(page);
    await navigate(page, "patients");
    await page.locator("#patient-reason").fill("Motivo ficticio pendiente");
    await page
      .locator("#patient-precautions")
      .fill("Precaución ficticia pendiente");
    await page.getByRole("button", { name: "Guardar ficha ficticia" }).click();
    await expect(page.getByRole("status")).toContainText(
      mode === "conflict"
        ? "La ficha ha cambiado"
        : "No se ha podido confirmar",
    );
    await expect(page.locator("#patient-reason")).toHaveValue(
      "Motivo ficticio pendiente",
    );
    await expect(page.locator("#patient-precautions")).toHaveValue(
      "Precaución ficticia pendiente",
    );
    await fillBackup(page);
    await navigate(page, "backups");
    await page.locator("#backup-export button").click();
    await expect(page.getByRole("status")).toContainText("Guarda o descarta");
    expect(
      calls.some((c) => c.path.endsWith("/clinical_backup_export_test")),
    ).toBe(false);
  });
test("v5 encrypted copies preserve optional intake fields and accept older records without them", async ({
  page,
}) => {
  await mockAuth(page, { backupMode: "intake" });
  await authorized(page);
  await fillBackup(page);
  const waiting = page.waitForEvent("download");
  await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  const file = await waiting,
    encrypted = await readFile(await file.path(), "utf8"),
    { decryptBackup } = await import("../backups/crypto.mjs");
  const s = await decryptBackup(encrypted, backupPhrase);
  expect(s.version).toBe(5);
  const payloads = s.patients.map((p) => JSON.parse(p.payload_json));
  expect(
    payloads.some(
      (p) =>
        p.reason === "Motivo ficticio en copia" &&
        p.precautions === "Precaución ficticia en copia",
    ),
  ).toBe(true);
  expect(payloads.some((p) => p.reason === undefined)).toBe(true);
  await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "anamnesis.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  await navigate(page, "backups");
  await page.locator("#backup-inspect button").click();
  await expect(page.getByRole("status")).toContainText("Archivo verificado");
});
async function createClinicalPatient(page, birth = "1990-01-02") {
  await navigate(page, "patients");
  await navigate(page, "patients");
  await page.locator("#patient-new").click();
  for (const [field, value] of Object.entries({
    given_name: "Persona",
    family_name: "Sintética",
    birth_date: birth,
    phone: "",
    email: "synthetic@example.invalid",
  }))
    await page.locator("#patient-create-" + field).fill(value);
  await navigate(page, "patients");
  await page.locator("#patient-create-form button[type=submit]").click();
}
test("verified clinical mode registers identities, supports namesakes and includes clinical records in agenda", async ({
  page,
}) => {
  const calls = await mockAuth(page, { dataMode: "clinical" });
  await authorized(page);
  await expect(page.locator("#patient-prepare")).toBeHidden();
  await createClinicalPatient(page);
  await expect(page.locator("#patient-name")).toHaveText("Persona Sintética");
  await page
    .locator("#patient-history")
    .fill("Historia sintética del circuito clínico");
  await navigate(page, "patients");
  await page.locator("#patient-family_name").fill("Sintética revisada");
  await navigate(page, "patients");
  await page.locator("#patient-form button[type=submit]").click();
  await expect(page.locator("#patient-name")).toHaveText(
    "Persona Sintética revisada",
  );
  await createClinicalPatient(page, "2000-01-02");
  await expect(page.locator("#patient-list button")).toHaveCount(2);
  await expect(page.locator("#patient-list")).toContainText("1990-01-02");
  await expect(page.locator("#patient-list")).toContainText("2000-01-02");
  await navigate(page, "agenda");
  await page.locator("#agenda-load").click();
  await expect(page.locator("#appointment-patient option")).toHaveCount(2);
  expect(
    calls.some((c) => c.path.endsWith("/clinical_patient_create_test")),
  ).toBe(false);
  expect(
    calls.filter((c) => c.path.endsWith("/clinical_patient_register")),
  ).toHaveLength(2);
});
test("uncertain clinical registration retries the same request without duplicating the chart", async ({
  page,
}) => {
  const calls = await mockAuth(page, {
    dataMode: "clinical",
    patientMode: "lost-ack",
  });
  await authorized(page);
  await createClinicalPatient(page);
  await expect(page.getByRole("status")).toContainText(
    "No se ha podido confirmar",
  );
  await navigate(page, "patients");
  await page.locator("#patient-create-form button[type=submit]").click();
  await expect(page.locator("#patient-name")).toHaveText("Persona Sintética");
  await expect(page.locator("#patient-list button")).toHaveCount(1);
  const ids = calls
    .filter((c) => c.path.endsWith("/clinical_patient_register"))
    .map((c) => JSON.parse(c.postBody).p_request_id);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});
test("clinical v6 files download encrypted and are verified locally without fixture markers", async ({
  page,
}) => {
  await mockAuth(page, { dataMode: "clinical" });
  await authorized(page);
  await fillBackup(page);
  const waiting = page.waitForEvent("download");
  await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  const file = await waiting,
    encrypted = await readFile(await file.path(), "utf8"),
    { decryptBackup } = await import("../backups/crypto.mjs");
  const snap = await decryptBackup(encrypted, backupPhrase);
  expect(snap.version).toBe(6);
  expect(snap.data_mode).toBe("clinical");
  expect(snap.test_only).toBeUndefined();
  expect(JSON.parse(snap.patients[0].payload_json).testOnly).toBeUndefined();
  await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "clinical.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  await navigate(page, "backups");
  await page.locator("#backup-inspect button").click();
  await expect(page.getByRole("status")).toContainText("Archivo verificado");
});
test("suspended access clears identities and clinical drafts and returns to login", async ({
  page,
}) => {
  await mockAuth(page, { dataMode: "clinical" });
  await authorized(page);
  await createClinicalPatient(page);
  await navigate(page, "patients");
  await page.locator("#patient-history").fill("Borrador clínico sintético");
  await page.route("**/rest/v1/rpc/clinical_patient_save_fields_test", (r) =>
    r.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "42501", message: "Suspended" }),
    }),
  );
  await navigate(page, "patients");
  await page.locator("#patient-form button[type=submit]").click();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#complete")).toBeHidden();
  await expect(page.locator("#patient-given_name")).toHaveValue("");
  await expect(page.locator("#patient-history")).toHaveValue("");
  await expect(page.locator("#patient-list button")).toHaveCount(0);
});
test("test mode can rehearse identity fields without becoming clinical or changing the fictitious alias", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await openPatient(page);
  const original = await page.locator("#patient-name").textContent();
  await navigate(page, "patients");
  await page.locator("#patient-given_name").fill("Persona");
  await navigate(page, "patients");
  await page.locator("#patient-family_name").fill("Sintética");
  await navigate(page, "patients");
  await page.locator("#patient-form button[type=submit]").click();
  await expect(page.getByRole("status")).toContainText("guardada");
  await navigate(page, "patients");
  await page.locator("#patient-refresh").click();
  await expect(page.locator("#patient-given_name")).toHaveValue("Persona");
  await expect(page.locator("#patient-name")).toHaveText(original);
  expect(calls.some((c) => c.path.endsWith("/clinical_patient_register"))).toBe(
    false,
  );
  await expect(page.locator("#patient-create-identity")).toBeHidden();
});

test("app navigation preserves drafts, shows unknown totals honestly and fits iPad and phone", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await expect(page.locator('[data-app-view="home"]')).toBeVisible();
  await expect(page.locator("#home-patients")).toHaveText("Sin cargar");
  await expect(page.locator("#home-appointments")).toHaveText("Sin cargar");
  expect(
    calls.filter((c) => c.path.startsWith("/rest/v1/rpc/")).map((c) => c.path),
  ).toEqual(["/rest/v1/rpc/clinical_access_check"]);
  await openPatient(page);
  await page
    .locator("#patient-history")
    .fill("Borrador ficticio que debe seguir aquí");
  await navigate(page, "home");
  await expect(page.locator("#home-patients")).toHaveText("2");
  await navigate(page, "patients");
  await expect(page.locator("#patient-history")).toHaveValue(
    "Borrador ficticio que debe seguir aquí",
  );
  await expect(page.locator("#workspace-title")).toBeFocused();
  for (const size of [
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    const geometry = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
      buttons: [...document.querySelectorAll(".app-navigation button")].map(
        (b) => ({
          width: b.getBoundingClientRect().width,
          height: b.getBoundingClientRect().height,
        }),
      ),
    }));
    expect(geometry.page).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.buttons.every((b) => b.width >= 44 && b.height >= 48)).toBe(
      true,
    );
    await navigate(page, "backups");
    await expect(page.locator("#backup-phrase")).toBeVisible();
    await navigate(page, "patients");
    await expect(page.locator("#patient-history")).toHaveValue(
      "Borrador ficticio que debe seguir aquí",
    );
  }
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
  ).toEqual({ local: {}, session: {} });
});

async function inspectCurrentFile(page) {
  const { encryptBackup } = await import("../backups/crypto.mjs");
  const fixture = require("./backup-patient-workflow-fixture.json");
  const encrypted = await encryptBackup(fixture, backupPhrase);
  await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "ensayo.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  await page.locator("#restore-phrase").fill(backupPhrase);
  await page.locator("#backup-inspect button").click();
  await expect(page.locator("#status")).toContainText("Archivo verificado");
  await expect(page.locator("#backup-custody")).toBeVisible();
  return encrypted;
}

test("backup custody records only metadata on explicit submit, retains pending steps and can be read after login", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  await navigate(page, "backups");
  await page.locator("#backup-status-load").click();
  await expect(page.locator("#backup-last-check")).toContainText("Aún no hay");
  const encrypted = await inspectCurrentFile(page);
  expect(
    calls.some((c) => c.path.endsWith("/clinical_backup_check_record")),
  ).toBe(false);
  await page.locator("#backup-location").selectOption("icloud_drive");
  await page.locator("#backup-custody button").click();
  await expect(page.locator("#backup-last-check")).toContainText(
    "Copia independiente: pendiente",
  );
  await expect(page.locator("#backup-last-check")).toContainText(
    "Frase recuperable por separado: pendiente",
  );
  await expect(page.locator("#backup-custody")).toBeHidden();
  const record = JSON.parse(
    calls.find((c) => c.path.endsWith("/clinical_backup_check_record"))
      .postBody,
  );
  const { createHash } = require("node:crypto");
  expect(record.p_details.encrypted_sha256).toBe(
    createHash("sha256").update(encrypted).digest("hex"),
  );
  expect(Object.keys(record.p_details).sort()).toEqual(
    [
      "version",
      "export_event_id",
      "encrypted_sha256",
      "location",
      "independent_copy",
      "phrase_separate",
      "verified_elsewhere",
    ].sort(),
  );
  expect(
    calls.every(
      (c) =>
        !c.postBody?.includes(backupPhrase) &&
        !c.postBody?.includes("ciphertext"),
    ),
  ).toBe(true);
  await page.reload();
  await authorized(page);
  await navigate(page, "backups");
  await expect(page.locator("#backup-last-check")).toContainText(
    "Todavía no has consultado",
  );
  await page.locator("#backup-status-load").click();
  await expect(page.locator("#backup-last-check")).toContainText(
    "iCloud Drive",
  );
  await expect(page.locator("#backup-last-check")).toContainText(
    "Copia independiente: pendiente",
  );
  await expect(page.locator("#backup-custody")).toBeHidden();
});

test("failed custody acknowledgement keeps the local check and reuses its request id; logout clears it", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  let failedId;
  await page.route(
    "**/rest/v1/rpc/clinical_backup_check_record",
    async (route) => {
      failedId = route.request().postDataJSON().p_request_id;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"message":"Synthetic unavailable"}',
      });
    },
    { times: 1 },
  );
  await authorized(page);
  await inspectCurrentFile(page);
  await page.locator("#backup-phrase-separate").check();
  await page.locator("#backup-custody button").click();
  await expect(page.locator("#status")).toContainText(
    "No se pudo confirmar el registro",
  );
  await expect(page.locator("#backup-custody")).toBeVisible();
  await expect(page.locator("#backup-phrase-separate")).toBeChecked();
  await page.locator("#backup-custody button").click();
  await expect(page.locator("#status")).toContainText(
    "Comprobación registrada",
  );
  expect(
    JSON.parse(
      calls.find((c) => c.path.endsWith("/clinical_backup_check_record"))
        .postBody,
    ).p_request_id,
  ).toBe(failedId);
  await inspectCurrentFile(page);
  await page.locator("#logout").click();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#backup-checked-file")).toHaveText("");
  await expect(page.locator("#backup-custody")).toBeHidden();
  await expect(page.locator("#restore-phrase")).toHaveValue("");
});

test("changing the selected backup cancels an older verification and preserves the new file", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  await navigate(page, "backups");
  const { encryptBackup } = await import("../backups/crypto.mjs");
  const encrypted = await encryptBackup(
    require("./backup-patient-workflow-fixture.json"),
    backupPhrase,
  );
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/rest/v1/rpc/clinical_access_check",
    async (route) => {
      await gate;
      await route.fallback();
    },
    { times: 1 },
  );
  await page.locator("#backup-file").setInputFiles({
    name: "primera.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  await page.locator("#restore-phrase").fill(backupPhrase);
  const requested = page.waitForRequest("**/rest/v1/rpc/clinical_access_check");
  await page.locator("#backup-inspect button").click();
  await requested;
  await page.locator("#backup-file").setInputFiles({
    name: "segunda.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("archivo sintético incompleto"),
  });
  release();
  await expect(page.locator("#backup-inspect button")).toBeEnabled();
  await expect(page.locator("#status")).toHaveText(
    "Archivo seleccionado. Introduce su frase y compruébalo.",
  );
  await expect(page.locator("#backup-custody")).toBeHidden();
  expect(
    await page.locator("#backup-file").evaluate((el) => el.files[0]?.name),
  ).toBe("segunda.mlrehab");
  await page.locator("#restore-phrase").fill(backupPhrase);
  await page.locator("#backup-inspect button").click();
  await expect(page.locator("#status")).toContainText(
    "No se pudo verificar el archivo",
  );
  await expect(page.locator("#backup-custody")).toBeHidden();
});
