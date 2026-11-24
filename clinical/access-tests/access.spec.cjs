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
  await owner(page).route("https://synthetic.supabase.co/**", async (route) => {
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
    } else if (
      [
        "/rest/v1/rpc/clinical_agenda_list_test",
        "/rest/v1/rpc/clinical_agenda_week",
      ].includes(path)
    ) {
      const day = request.postDataJSON().p_day;
      const week = path.endsWith("clinical_agenda_week");
      const date = new Date(day + "T12:00:00Z");
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      const start = date.toISOString().slice(0, 10);
      date.setUTCDate(date.getUTCDate() + 4);
      const end = date.toISOString().slice(0, 10);
      date.setUTCDate(date.getUTCDate() + 3);
      const next = date.toISOString().slice(0, 10);
      body = {
        ...(week ? { week_start: start, week_end: end } : {}),
        patients: patients
          .filter((p) => !p.archived_at)
          .map((p) => ({ id: p.id, name: p.payload.name })),
        appointments: appointments
          .filter((a) =>
            week
              ? a.local.slice(0, 10) >= start && a.local.slice(0, 10) < next
              : a.local.slice(0, 10) === day,
          )
          .map((a) => ({
            ...a,
            patient_name: patients.find((p) => p.id === a.patient_id).payload
              .name,
            patient_archived: false,
            session_id:
              sessions.find((s) => s.appointment_id === a.id)?.id ?? null,
          })),
      };
    } else if (path === "/rest/v1/rpc/clinical_appointment_save_typed") {
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
          id:
            old?.id ??
            `77777777-7777-4777-8777-${String(777777777777 + appointments.length)}`,
          clinician_id: userId,
          patient_id: a.p_patient_id,
          starts_at: start.toISOString(),
          ends_at: new Date(+start + a.p_minutes * 60000).toISOString(),
          status: a.p_status,
          revision: (old?.revision ?? 0) + 1,
          local: a.p_start_local,
          ...(a.p_visit_type && a.p_visit_type !== "unclassified"
            ? { visit_type: a.p_visit_type }
            : {}),
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

const owners = new WeakMap();
const owner = (page) => owners.get(page) || page;
async function navigate(page, view) {
  if (
    owners.has(page) &&
    !page.isClosed() &&
    ((view === "patients" && new URL(page.url()).hash === "#ficha") ||
      (view === "agenda" && new URL(page.url()).hash === "#cita"))
  ) {
    await page.bringToFront();
    return page;
  }
  page = owner(page);
  await page.locator(`[data-app-page="${view}"]`).first().click();
  await expect(page.locator(`[data-app-view="${view}"]`)).toBeVisible();
  return page;
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
  page = await navigate(page, "access");
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
    page = await navigate(page, "access");
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
  page = await navigate(page, "access");
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
  page = await navigate(page, "access");
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
  page = await navigate(page, "access");
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
  page = await navigate(page, "access");
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
  page = await navigate(page, "backups");
  await page
    .getByLabel("Frase para cifrar esta copia", { exact: true })
    .fill(backupPhrase);
  await page.getByLabel("Repite la frase de la copia").fill(confirm);
  return page;
}
test("database snapshot downloads encrypted and can be checked locally without uploading the phrase or file", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  page = await fillBackup(page);
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
  page = await navigate(page, "backups");
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
  page = await fillBackup(page, "Otra-frase-sintetica-diferente");
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
  page = await fillBackup(page);
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
    page = await navigate(page, "backups");
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

async function openPatient(page, archived = false, hint = null) {
  page = await navigate(owner(page), "patients");
  await page.locator("#patient-load").click();
  let row = page
    .locator("#patient-list button")
    .filter({ hasText: archived ? "Archivado (solo lectura)" : "Activo" });
  if (hint) row = row.filter({ hasText: hint });
  const opening = page.waitForEvent("popup");
  await row.first().click();
  const child = await opening;
  owners.set(child, page);
  await expect(child.locator("#patient-editor")).toBeVisible();
  return child;
}
async function returnPatientToDirectory(page, button = "#patient-back") {
  const parent = owner(page);
  const closing = page.waitForEvent("close");
  await page
    .locator(button)
    .click()
    .catch((error) => {
      if (!page.isClosed()) throw error;
    });
  await closing;
  return parent;
}

test("private patient edits use revision-aware field patches, survive reopening and never persist in browser storage", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  page = await openPatient(page);
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
  page = await openPatient(page, true);
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
  page = await openPatient(page);
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
  page = await openPatient(page);
  await page
    .getByLabel("Historia clínica ficticia")
    .fill("Borrador ficticio sin confirmar");
  await page.getByRole("button", { name: "Guardar ficha ficticia" }).click();
  await expect(page.getByRole("status")).toContainText(
    "No se ha podido confirmar el guardado",
  );
  await page.locator("#patient-back").click();
  await expect(page.locator("#patient-leave-dialog")).toBeVisible();
  await page.locator("#patient-leave-continue").click();
  await expect(page.getByLabel("Historia clínica ficticia")).toHaveValue(
    "Borrador ficticio sin confirmar",
  );
  const child = page;
  page = await fillBackup(page);
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
  await expect(child.locator("#patient-editor")).toBeHidden();
  await expect(child.getByLabel("Historia clínica ficticia")).toHaveValue("");
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
  await owner(page).route(
    "**/rest/v1/rpc/clinical_patient_get",
    async (route) => {
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
    },
  );
  page = await navigate(page, "patients");
  await page
    .getByRole("button", { name: "Cargar pacientes de prueba" })
    .click();
  const request = owner(page).waitForRequest(
    "**/rest/v1/rpc/clinical_patient_get",
  );
  const opening = page.waitForEvent("popup");
  await page
    .locator("#patient-list button")
    .filter({ hasText: "Activo" })
    .click();
  const child = await opening;
  await request;
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  release();
  await expect(page.locator("#login")).toBeVisible();
  await expect(child.locator("#patient-editor")).toBeHidden();
  await expect(child.locator("#patient-history")).toHaveValue("");
});

test("typing while a save is pending stays as a newer unsaved draft after confirmation", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  page = await openPatient(page);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await owner(page).route(
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
  const request = owner(page).waitForRequest(
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
  page = await navigate(page, "agenda");
  await page.locator("#agenda-date").fill("2026-11-20");
  page = await navigate(page, "agenda");
  await page.locator("#agenda-load").click();
  await expect(page.locator("#agenda-loaded-day")).toContainText("20/11/2026");
  return calls;
}
async function bookAppointment(page) {
  page = await navigate(page, "agenda");
  await page.locator("#agenda-new").click();
  await page.locator("#appointment-patient").selectOption({ index: 1 });
  await expect(page.locator("#agenda-editor")).toBeVisible();
  page = await navigate(page, "agenda");
  await page.locator("#appointment-start").fill("2026-11-20T09:00");
  page = await navigate(page, "agenda");
  await page.locator("#appointment-form button").click();
  await expect(page.getByRole("status")).toContainText(
    "Cita ficticia guardada",
  );
}
async function openAgendaTab(
  page,
  selector = "#agenda-calendar .agenda-event",
  index = 0,
) {
  page = owner(page);
  await page.bringToFront();
  const opening = page.waitForEvent("popup");
  const button =
    typeof selector === "string" ? page.locator(selector).nth(index) : selector;
  await button.click();
  const child = await opening;
  owners.set(child, page);
  await expect(child.locator("#agenda-editor")).toBeVisible();
  return child;
}
test("private agenda books, reopens, reschedules and cancels a fictional appointment on iPad", async ({
  page,
}) => {
  const calls = await authorizeAgenda(page);
  await bookAppointment(page);
  await expect(page.locator("#appointment-patient")).toBeDisabled();
  await expect(page.locator("#agenda-list")).toContainText("09:00–09:45");
  const args = JSON.parse(
    calls.find((c) => c.path.endsWith("clinical_appointment_save_typed"))
      .postBody,
  );
  expect(args.p_start_local).toBe("2026-11-20T09:00");
  expect(args.p_expected_revision).toBeNull();
  page = await navigate(page, "agenda");
  page = await openAgendaTab(page);
  await expect(page.locator("#appointment-start")).toHaveValue(
    "2026-11-20T09:00",
  );
  page = await navigate(page, "agenda");
  await page.locator("#appointment-start").fill("2026-11-20T11:30");
  page = await navigate(page, "agenda");
  await page.locator("#appointment-form button").click();
  await expect(page.locator("#agenda-list")).toContainText("11:30–12:15");
  page = await navigate(page, "agenda");
  await page.locator("#appointment-status").selectOption("cancelled");
  page = await navigate(page, "agenda");
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
  page = await navigate(page, "agenda");
  await page.locator("#agenda-new").click();
  await page.locator("#appointment-patient").selectOption({ index: 1 });
  page = await navigate(page, "agenda");
  await page.locator("#appointment-form button").click();
  await expect(page.getByRole("status")).toContainText("solapa");
  await expect(page.locator("#appointment-start")).toHaveValue(
    "2026-11-20T09:00",
  );
  page = await navigate(page, "agenda");
  await page.locator("#appointment-start").fill("2026-11-20T10:00");
  page = await navigate(page, "agenda");
  await page.locator("#appointment-form button").click();
  await expect(page.locator("#agenda-list")).toContainText("10:00");
});
test("sessions persist evolution, passive treatment and exercise and complete the appointment", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await bookAppointment(page);
  page = await navigate(page, "agenda");
  await page.locator("#session-evolution").fill("Evolución ficticia de prueba");
  page = await navigate(page, "agenda");
  await page.locator("#session-passive").fill("Tratamiento pasivo de prueba");
  page = await navigate(page, "agenda");
  await page.locator("#session-exercise").fill("Isométricos ficticios");
  page = await navigate(page, "agenda");
  await page.locator("#session-form button[type=submit]").click();
  await expect(page.getByRole("status")).toContainText("queda realizada");
  await expect(page.locator("#appointment-start")).toBeDisabled();
  await expect(page.locator("#session-exercise")).toBeEnabled();
  page = await navigate(page, "agenda");
  page = await openAgendaTab(page);
  await expect(page.locator("#session-passive")).toHaveValue(
    "Tratamiento pasivo de prueba",
  );
  await expect(page.locator("#session-exercise")).toHaveValue(
    "Isométricos ficticios",
  );
  page = await navigate(page, "agenda");
  await page.locator("#session-evolution").fill("Evolución ficticia revisada");
  page = await navigate(page, "agenda");
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
    page = await navigate(page, "agenda");
    await page.locator("#session-form button[type=submit]").click();
    await expect(page.getByRole("status")).toContainText(
      agendaMode === "conflict" ? "ha cambiado" : "borrador",
    );
    await expect(page.locator("#session-evolution")).toHaveValue(
      "Borrador ficticio que conservar",
    );
    page = await navigate(page, "backups");
    await page.locator("#backup-phrase").fill("Frase sintetica suficiente");
    page = await navigate(page, "backups");
    await page.locator("#backup-confirm").fill("Frase sintetica suficiente");
    page = await navigate(page, "backups");
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
  await owner(page).route(
    "**/rpc/clinical_session_save_test",
    async (route) => {
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
    },
  );
  page = await navigate(page, "agenda");
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
test("changing agenda week asks before discarding session drafts", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await bookAppointment(page);
  page = await navigate(page, "agenda");
  await page.locator("#session-evolution").fill("Borrador ficticio");
  page.once("dialog", (dialog) => dialog.dismiss());
  page = await navigate(page, "agenda");
  await page.locator("#agenda-next").click();
  await expect(page.locator("#agenda-date")).toHaveValue("2026-11-20");
  await expect(page.locator("#session-evolution")).toHaveValue(
    "Borrador ficticio",
  );
  page.once("dialog", (dialog) => dialog.accept());
  page = await navigate(page, "agenda");
  await page.locator("#agenda-next").click();
  await expect(page.locator("#agenda-loaded-day")).toContainText("27/11/2026");
  await expect(page.locator("#agenda-editor")).toBeHidden();
});

test("version-2 encrypted files include agenda and sessions and are checked locally", async ({
  page,
}) => {
  const calls = await mockAuth(page, { backupMode: "agenda" });
  await authorized(page);
  page = await fillBackup(page);
  const downloaded = page.waitForEvent("download");
  page = await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  const file = await downloaded,
    encrypted = await readFile(await file.path(), "utf8");
  const { decryptBackup } = await import("../backups/crypto.mjs");
  const snapshot = await decryptBackup(encrypted, backupPhrase);
  expect(snapshot.version).toBe(2);
  expect(snapshot.sessions).toHaveLength(1);
  const before = calls.length;
  page = await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "agenda.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  page = await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  page = await navigate(page, "backups");
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
  page = await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
}
test("private exercise catalogue combines name, region and modality filters without network calls", async ({
  page,
}) => {
  const calls = await authorizeAgenda(page);
  await bookAppointment(page);
  page = await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
  await expect(page.locator("#exercise-catalog-state")).toContainText(
    "0 ejercicios propios cargados",
  );
  const before = calls.length;
  await expect(page.locator("#exercise-count")).toContainText("130 ejercicios");
  page = await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("extension");
  page = await navigate(page, "agenda");
  await page.locator("#exercise-region").selectOption("knee");
  page = await navigate(page, "agenda");
  await page.locator("#exercise-category").selectOption("concentric");
  await expect(page.locator("#exercise-results button")).toHaveCount(1);
  await expect(page.locator("#exercise-results")).toContainText(
    "Extensión de rodilla con énfasis concéntrico",
  );
  page = await navigate(page, "agenda");
  await page.locator("#exercise-category").selectOption("isometric");
  await expect(page.locator("#exercise-results")).toContainText(
    "Extensión isométrica de rodilla en máquina",
  );
  page = await navigate(page, "agenda");
  await page.locator("#exercise-category").selectOption("dynamic-all");
  await expect(page.locator("#exercise-results")).toContainText("Concéntricos");
  page = await navigate(page, "agenda");
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
  page = await navigate(page, "agenda");
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
  page = await navigate(page, "agenda");
  await page.locator("#exercise-region").selectOption("shoulder");
  await expect(page.locator("#exercise-results button")).toHaveCount(0);
  page = await navigate(page, "agenda");
  await page.locator("#session-form button[type=submit]").click();
  await expect(page.locator("#status")).toContainText("queda realizada");
  page = await navigate(page, "agenda");
  page = await openAgendaTab(page);
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
  page = await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("sentadilla española");
  await page
    .getByRole("button", {
      name: "Añadir Sentadilla española isométrica",
      exact: true,
    })
    .click();
  page.once("dialog", (dialog) => dialog.dismiss());
  page = await navigate(page, "agenda");
  await page.locator("#agenda-next").click();
  await expect(page.locator("#session-exercise")).toHaveValue(
    "- Sentadilla española isométrica",
  );
  page = await fillBackup(page);
  page = await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  await expect(page.locator("#status")).toContainText("Guarda o descarta");
});
test("the exercise picker respects cancellation and the session text size limit", async ({
  page,
}) => {
  await openExercisePicker(page);
  page = await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("sentadilla española");
  page = await navigate(page, "agenda");
  await page.locator("#session-exercise").fill("x".repeat(3990));
  await page
    .getByRole("button", {
      name: "Añadir Sentadilla española isométrica",
      exact: true,
    })
    .click();
  await expect(page.locator("#status")).toContainText("límite");
  await expect(page.locator("#session-exercise")).toHaveValue("x".repeat(3990));
  page = await navigate(page, "agenda");
  await page.locator("#session-exercise").fill("");
  page = await navigate(page, "agenda");
  await page.locator("#appointment-status").selectOption("cancelled");
  page = await navigate(page, "agenda");
  await page.locator("#appointment-form button[type=submit]").click();
  await expect(page.locator("#exercise-search")).toBeDisabled();
  await expect(page.locator("#exercise-results button").first()).toBeDisabled();
});
test("automatic logout clears exercise searches and selected session names", async ({
  page,
}) => {
  await openExercisePicker(page);
  page = await navigate(page, "agenda");
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
  page = await navigate(page, "exercises");
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-name").fill(name);
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-category").selectOption("eccentric");
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-regions input[value=knee]").check();
}
test("a personal exercise is classified, reloaded and reusable after a fresh login", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await fillOwnExercise(page);
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-form button[type=submit]").click();
  await expect(page.locator("#status")).toContainText(
    "Ejercicio propio guardado",
  );
  await expect(page.locator("#custom-exercise-name")).toHaveValue("");
  await page.reload();
  await authorized(page);
  page = await navigate(page, "exercises");
  await page.locator("#exercise-catalog-load").click();
  await expect(page.locator("#exercise-catalog-state")).toContainText(
    "1 ejercicios propios cargados",
  );
  await expect(page.locator("#exercise-own-list")).toContainText(
    "Ejercicio propio ficticio de rodilla",
  );
  page = await navigate(page, "agenda");
  await page.locator("#agenda-date").fill("2026-11-20");
  page = await navigate(page, "agenda");
  await page.locator("#agenda-new").click();
  await page.locator("#appointment-patient").selectOption({ index: 1 });
  await expect(page.locator("#appointment-start")).toHaveValue(
    "2026-11-20T09:00",
  );
  page = await navigate(page, "agenda");
  await page.locator("#appointment-form button[type=submit]").click();
  await expect(page.locator("#session-form")).toBeVisible();
  page = await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
  page = await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("ejercicio propio ficticio");
  page = await navigate(page, "agenda");
  await page.locator("#exercise-region").selectOption("knee");
  page = await navigate(page, "agenda");
  await page.locator("#exercise-category").selectOption("eccentric");
  await page
    .getByRole("button", {
      name: "Añadir Ejercicio propio ficticio de rodilla",
      exact: true,
    })
    .click();
  page = await navigate(page, "agenda");
  await page.locator("#session-form button[type=submit]").click();
  await expect(page.locator("#status")).toContainText("queda realizada");
  page = await navigate(page, "agenda");
  page = await openAgendaTab(page);
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
    page = await navigate(page, "exercises");
    await page.locator("#custom-exercise-form button[type=submit]").click();
    await expect(page.locator("#status")).toContainText(
      catalogMode === "duplicate" ? "Ya existe" : "No se pudo confirmar",
    );
    await expect(page.locator("#custom-exercise-name")).toHaveValue(
      "Ejercicio propio ficticio de rodilla",
    );
    page = await fillBackup(page);
    page = await navigate(page, "backups");
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
  await owner(page).route(
    "**/rpc/clinical_exercise_create_test",
    async (route) => {
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
    },
  );
  page = await navigate(page, "exercises");
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
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-form button[type=submit]").click();
  await expect(page.locator("#status")).toContainText(
    "ya está en el catálogo inicial",
  );
  expect(
    calls.some((c) => c.path.endsWith("clinical_exercise_create_test")),
  ).toBe(false);
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-name").fill("");
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-category").selectOption("other");
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-regions input[value=knee]").uncheck();
  page = await navigate(page, "agenda");
  await page.locator("#agenda-date").fill("2026-11-20");
  page = await navigate(page, "agenda");
  await page.locator("#agenda-new").click();
  await page.locator("#appointment-patient").selectOption({ index: 1 });
  page = await navigate(page, "agenda");
  await page.locator("#appointment-form button[type=submit]").click();
  await expect(page.locator("#session-form")).toBeVisible();
  page = await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
  await expect(page.locator("#status")).toContainText("catálogo");
  page = await navigate(page, "agenda");
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
  page = await fillBackup(page);
  const downloaded = page.waitForEvent("download");
  page = await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  const file = await downloaded,
    encrypted = await readFile(await file.path(), "utf8");
  const { decryptBackup } = await import("../backups/crypto.mjs");
  const snapshot = await decryptBackup(encrypted, backupPhrase);
  expect(snapshot.version).toBe(3);
  expect(snapshot.custom_exercises).toHaveLength(1);
  const before = calls.length;
  page = await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "catalogo.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  page = await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  page = await navigate(page, "backups");
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
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-submit").click();
  await expect(page.locator("#status")).toContainText("guardado");
  await bookAppointment(page);
  page = await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
  page = await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("ficticio original");
  await page
    .getByRole("button", {
      name: "Añadir Ejercicio ficticio original",
      exact: true,
    })
    .click();
  page = await navigate(page, "agenda");
  await page.locator("#session-form button[type=submit]").click();
  await expect(page.locator("#status")).toContainText("queda realizada");
  page = await navigate(page, "exercises");
  await page
    .getByRole("button", {
      name: "Editar Ejercicio ficticio original",
      exact: true,
    })
    .click();
  await page
    .locator("#custom-exercise-name")
    .fill("Ejercicio ficticio revisado");
  page = await navigate(page, "exercises");
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
  page = await navigate(page, "agenda");
  page = await openAgendaTab(page);
  await expect(page.locator("#session-exercise")).toHaveValue(
    "- Ejercicio ficticio original",
  );
  page = await navigate(page, "agenda");
  await page.locator("#exercise-picker summary").click();
  page = await navigate(page, "agenda");
  await page.locator("#exercise-search").fill("ficticio revisado");
  await expect(page.locator("#exercise-results button")).toHaveCount(0);
});
test("stale personal exercise edits retain the draft and require explicitly loading the stored version", async ({
  page,
}) => {
  await mockAuth(page, { catalogMode: "conflict" });
  await authorized(page);
  await fillOwnExercise(page, "Ejercicio ficticio de conflicto");
  page = await navigate(page, "exercises");
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
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-submit").click();
  await expect(page.locator("#status")).toContainText("ha cambiado");
  await expect(page.locator("#custom-exercise-name")).toHaveValue(
    "Borrador ficticio revisado",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-cancel").click();
  await expect(page.locator("#custom-exercise-name")).toHaveValue(
    "Borrador ficticio revisado",
  );
  page.once("dialog", (dialog) => dialog.accept());
  page = await navigate(page, "exercises");
  await page.locator("#custom-exercise-cancel").click();
  await expect(page.locator("#custom-exercise-name")).toHaveValue("");
});

test("version-4 encrypted backups include exercise history and retain local verification", async ({
  page,
}) => {
  const calls = await mockAuth(page, { backupMode: "revisions" });
  await authorized(page);
  page = await fillBackup(page);
  const downloaded = page.waitForEvent("download");
  page = await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  const file = await downloaded,
    encrypted = await readFile(await file.path(), "utf8"),
    { decryptBackup } = await import("../backups/crypto.mjs");
  const snapshot = await decryptBackup(encrypted, backupPhrase);
  expect(snapshot.version).toBe(4);
  expect(snapshot.exercise_versions).toHaveLength(2);
  expect(snapshot.custom_exercises[0].archived_at).not.toBeNull();
  const before = calls.length;
  page = await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "historial.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  page = await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  page = await navigate(page, "backups");
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
  page = await navigate(owner(page), "patients");
  await page.locator("#patient-new").click();
  await page.locator("#patient-create-alias").fill(alias);
  const response = page.waitForResponse(
    "**/rest/v1/rpc/clinical_patient_create_test",
  );
  await page.locator("#patient-create-form button[type=submit]").click();
  await response;
  await expect(page.locator("#patient-create-fields")).toBeEnabled();
  if (await page.locator("#patient-create-form").isVisible()) return page;
  return openPatient(page, false, alias);
}

test("new fictional patients can be created, renamed, searched and archived with retained history", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  page = await newPatient(page);
  await expect(page.locator("#patient-name")).toHaveText(
    "FICTICIO · Caso tres",
  );
  page = await navigate(page, "patients");
  await page.locator("#patient-alias").fill("Caso de rodilla");
  page = await navigate(page, "patients");
  await page.locator("#patient-history").fill("Historia ficticia nueva");
  page = await navigate(page, "patients");
  await page.locator("#patient-form button[type=submit]").click();
  await expect(page.getByRole("status")).toContainText("guardada");
  page = await navigate(page, "patients");
  page = await returnPatientToDirectory(page);
  await page.locator("#patient-search").fill("RODILLA");
  await expect(owner(page).locator("#patient-list button")).toHaveCount(1);
  await expect(owner(page).locator("#patient-count")).toContainText("3 fichas");
  page = await openPatient(page, false, "RODILLA");
  page.once("dialog", (d) => d.accept());
  page = await navigate(page, "patients");
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
  page = await newPatient(page, "Caso con conexión inestable");
  await expect(page.getByRole("status")).toContainText(
    "No se ha podido confirmar",
  );
  await expect(page.locator("#patient-create-alias")).toHaveValue(
    "Caso con conexión inestable",
  );
  page = await navigate(page, "patients");
  await page.locator("#patient-create-form button[type=submit]").click();
  page = await openPatient(page, false, "Caso con conexión inestable");
  await expect(page.locator("#patient-name")).toHaveText(
    "FICTICIO · Caso con conexión inestable",
  );
  await expect(owner(page).locator("#patient-count")).toContainText("3 fichas");
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
  page = await openPatient(page);
  page.once("dialog", (d) => d.accept());
  page = await navigate(page, "patients");
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
  page = await navigate(page, "patients");
  await page.locator("#patient-new").click();
  page = await navigate(page, "patients");
  await page.locator("#patient-create-alias").fill("Alta ficticia pendiente");
  page = await fillBackup(page);
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
  page = await fillBackup(page);
  const downloaded = page.waitForEvent("download");
  page = await navigate(page, "backups");
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
  page = await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "tres-fichas.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  page = await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  page = await navigate(page, "backups");
  await page.locator("#backup-inspect button").click();
  await expect(page.locator("#status")).toContainText("Archivo verificado");
});

test("optional intake fields save separately, reopen, stay read-only when archived and clear at logout", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  page = await openPatient(page);
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
  page = await navigate(page, "patients");
  await page.locator("#patient-refresh").click();
  await expect(page.locator("#patient-reason")).toHaveValue(
    "Motivo ficticio separado",
  );
  await expect(page.locator("#patient-precautions")).toHaveValue(
    "Antecedente ficticio separado",
  );
  await expect(page.locator("#patient-history")).toHaveValue(priorHistory);
  page = await navigate(page, "patients");
  page = await returnPatientToDirectory(page);
  await page.locator("#patient-load").click();
  page = await openPatient(page, true);
  await expect(page.locator("#patient-reason")).toBeDisabled();
  await expect(page.locator("#patient-precautions")).toBeDisabled();
  await owner(page).getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.locator("#patient-reason")).toHaveValue("");
  await expect(page.locator("#patient-precautions")).toHaveValue("");
});
for (const mode of ["conflict", "unavailable"])
  test(`intake ${mode} preserves its draft and blocks incomplete backups`, async ({
    page,
  }) => {
    const calls = await mockAuth(page, { patientMode: mode });
    await authorized(page);
    page = await openPatient(page);
    page = await navigate(page, "patients");
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
    page = await fillBackup(page);
    page = await navigate(page, "backups");
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
  page = await fillBackup(page);
  const waiting = page.waitForEvent("download");
  page = await navigate(page, "backups");
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
  page = await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "anamnesis.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  page = await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  page = await navigate(page, "backups");
  await page.locator("#backup-inspect button").click();
  await expect(page.getByRole("status")).toContainText("Archivo verificado");
});
async function createClinicalPatient(page, birth = "1990-01-02") {
  page = await navigate(owner(page), "patients");
  await page.locator("#patient-new").click();
  for (const [field, value] of Object.entries({
    given_name: "Persona",
    family_name: "Sintética",
    birth_date: birth,
    phone: "",
    email: "synthetic@example.invalid",
  }))
    await page.locator("#patient-create-" + field).fill(value);
  const response = page.waitForResponse(
    "**/rest/v1/rpc/clinical_patient_register",
  );
  await page.locator("#patient-create-form button[type=submit]").click();
  await response;
  await expect(page.locator("#patient-create-fields")).toBeEnabled();
  if (await page.locator("#patient-create-form").isVisible()) return page;
  return openPatient(page, false, birth);
}

test("verified clinical mode registers identities, supports namesakes and includes clinical records in agenda", async ({
  page,
}) => {
  const calls = await mockAuth(page, { dataMode: "clinical" });
  await authorized(page);
  await expect(page.locator("#patient-prepare")).toBeHidden();
  page = await createClinicalPatient(page);
  await expect(page.locator("#patient-name")).toHaveText("Persona Sintética");
  await page
    .locator("#patient-history")
    .fill("Historia sintética del circuito clínico");
  page = await navigate(page, "patients");
  await page.locator("#patient-family_name").fill("Sintética revisada");
  page = await navigate(page, "patients");
  await page.locator("#patient-form button[type=submit]").click();
  await expect(page.locator("#patient-name")).toHaveText(
    "Persona Sintética revisada",
  );
  page = await createClinicalPatient(page, "2000-01-02");
  await expect(owner(page).locator("#patient-list button")).toHaveCount(2);
  await expect(owner(page).locator("#patient-list")).toContainText(
    "1990-01-02",
  );
  await expect(owner(page).locator("#patient-list")).toContainText(
    "2000-01-02",
  );
  page = await navigate(page, "agenda");
  await page.locator("#agenda-load").click();
  await expect(page.locator("#appointment-patient option")).toHaveCount(3);
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
  page = await createClinicalPatient(page);
  await expect(page.getByRole("status")).toContainText(
    "No se ha podido confirmar",
  );
  page = await navigate(page, "patients");
  await page.locator("#patient-create-form button[type=submit]").click();
  page = await openPatient(page, false, "1990-01-02");
  await expect(page.locator("#patient-name")).toHaveText("Persona Sintética");
  await expect(owner(page).locator("#patient-list button")).toHaveCount(1);
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
  page = await fillBackup(page);
  const waiting = page.waitForEvent("download");
  page = await navigate(page, "backups");
  await page.locator("#backup-export button").click();
  const file = await waiting,
    encrypted = await readFile(await file.path(), "utf8"),
    { decryptBackup } = await import("../backups/crypto.mjs");
  const snap = await decryptBackup(encrypted, backupPhrase);
  expect(snap.version).toBe(6);
  expect(snap.data_mode).toBe("clinical");
  expect(snap.test_only).toBeUndefined();
  expect(JSON.parse(snap.patients[0].payload_json).testOnly).toBeUndefined();
  page = await navigate(page, "backups");
  await page.locator("#backup-file").setInputFiles({
    name: "clinical.mlrehab",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(encrypted),
  });
  page = await navigate(page, "backups");
  await page.locator("#restore-phrase").fill(backupPhrase);
  page = await navigate(page, "backups");
  await page.locator("#backup-inspect button").click();
  await expect(page.getByRole("status")).toContainText("Archivo verificado");
});
test("suspended access clears identities and clinical drafts and returns to login", async ({
  page,
}) => {
  await mockAuth(page, { dataMode: "clinical" });
  await authorized(page);
  page = await createClinicalPatient(page);
  page = await navigate(page, "patients");
  await page.locator("#patient-history").fill("Borrador clínico sintético");
  await owner(page).route(
    "**/rest/v1/rpc/clinical_patient_save_fields_test",
    (r) =>
      r.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ code: "42501", message: "Suspended" }),
      }),
  );
  page = await navigate(page, "patients");
  await page.locator("#patient-form button[type=submit]").click();
  await expect(owner(page).locator("#login")).toBeVisible();
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
  page = await openPatient(page);
  const original = await page.locator("#patient-name").textContent();
  page = await navigate(page, "patients");
  await page.locator("#patient-given_name").fill("Persona");
  page = await navigate(page, "patients");
  await page.locator("#patient-family_name").fill("Sintética");
  page = await navigate(page, "patients");
  await page.locator("#patient-form button[type=submit]").click();
  await expect(page.getByRole("status")).toContainText("guardada");
  page = await navigate(page, "patients");
  await page.locator("#patient-refresh").click();
  await expect(page.locator("#patient-given_name")).toHaveValue("Persona");
  await expect(page.locator("#patient-name")).toHaveText(original);
  expect(calls.some((c) => c.path.endsWith("/clinical_patient_register"))).toBe(
    false,
  );
  await expect(page.locator("#patient-create-identity")).toBeHidden();
});

test("app navigation preserves patient-tab drafts, shows unknown totals and fits iPad and phone", async ({
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
  const child = await openPatient(page);
  await child
    .locator("#patient-history")
    .fill("Borrador ficticio que debe seguir aquí");
  page = await navigate(page, "home");
  await expect(page.locator("#home-patients")).toHaveText("2");
  for (const size of [
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      buttons: [...document.querySelectorAll(".app-navigation button")].map(
        (b) => ({
          width: b.getBoundingClientRect().width,
          height: b.getBoundingClientRect().height,
        }),
      ),
    }));
    expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.buttons.every((b) => b.width >= 44 && b.height >= 48)).toBe(
      true,
    );
    page = await navigate(page, "backups");
    await expect(page.locator("#backup-phrase")).toBeVisible();
    await child.bringToFront();
    await expect(child.locator("#patient-history")).toHaveValue(
      "Borrador ficticio que debe seguir aquí",
    );
  }
  for (const tab of [page, child])
    expect(
      await tab.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
      })),
    ).toEqual({ local: {}, session: {} });
});

async function inspectCurrentFile(page) {
  const { encryptBackup } = await import("../backups/crypto.mjs");
  const fixture = require("./backup-patient-workflow-fixture.json");
  const encrypted = await encryptBackup(fixture, backupPhrase);
  page = await navigate(page, "backups");
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
  page = await navigate(page, "backups");
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
  page = await navigate(page, "backups");
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
  await owner(page).route(
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
  page = await navigate(page, "backups");
  const { encryptBackup } = await import("../backups/crypto.mjs");
  const encrypted = await encryptBackup(
    require("./backup-patient-workflow-fixture.json"),
    backupPhrase,
  );
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await owner(page).route(
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
  const requested = owner(page).waitForRequest(
    "**/rest/v1/rpc/clinical_access_check",
  );
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

test("weekly calendar has five weekdays, omits 14:00 and directly books the tapped day and hour", async ({
  page,
}) => {
  const calls = await authorizeAgenda(page);
  await expect(
    page.locator("#agenda-calendar thead th[data-date]"),
  ).toHaveCount(5);
  expect(
    await page
      .locator("#agenda-calendar thead th[data-date]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label").split(" ")[0]),
      ),
  ).toEqual(["lunes", "martes", "miércoles", "jueves", "viernes"]);
  await expect(page.locator("#agenda-calendar tbody tr")).toHaveCount(11);
  await expect(page.locator('#agenda-calendar [data-hour="14"]')).toHaveCount(
    0,
  );
  const slot = page.locator(
    '[data-slot-date="2026-11-18"][data-slot-hour="11"]',
  );
  await slot.click();
  await expect(page.locator("#appointment-start")).toHaveValue(
    "2026-11-18T11:00",
  );
  await expect(page.locator("#appointment-patient")).toHaveValue("");
  await page.locator("#appointment-form button").click();
  expect(
    calls.some((c) => c.path.endsWith("/clinical_appointment_save_typed")),
  ).toBe(false);
  await page.locator("#appointment-patient").selectOption({ index: 1 });
  await page.locator("#appointment-form button").click();
  await expect(page.locator("#status")).toContainText("Cita ficticia guardada");
  const saved = JSON.parse(
    calls.find((c) => c.path.endsWith("/clinical_appointment_save_typed"))
      .postBody,
  );
  expect(saved.p_start_local).toBe("2026-11-18T11:00");
  const cell = page.locator(
    '#agenda-calendar td[data-date="2026-11-18"][data-hour="11"]',
  );
  await expect(cell.locator(".agenda-event")).toContainText("11:00–11:45");
  await expect(cell.locator(".agenda-slot-add")).toHaveCount(0);
  const child = await openAgendaTab(page, cell.locator(".agenda-event"));
  await expect(child.locator("#session-form")).toBeVisible();
  await page.locator("#agenda-next").click();
  await expect(page.locator("#agenda-loaded-day")).toContainText(
    "23/11/2026 al 27/11/2026",
  );
  await expect(page.locator("#agenda-calendar .agenda-event")).toHaveCount(0);
  await page.locator("#agenda-prev").click();
  await expect(page.locator("#agenda-calendar .agenda-event")).toHaveCount(1);
  page = await navigate(page, "home");
  await expect(page.locator("#home-appointments")).toHaveText("1");
  expect(calls.some((c) => c.path.endsWith("/clinical_agenda_list_test"))).toBe(
    false,
  );
});

test("long and half-hour appointments occupy every overlapping slot and cancellation frees them", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await page
    .locator('[data-slot-date="2026-11-20"][data-slot-hour="9"]')
    .click();
  await page.locator("#appointment-patient").selectOption({ index: 1 });
  await page.locator("#appointment-start").fill("2026-11-20T09:30");
  await page.locator("#appointment-minutes").fill("90");
  await page.locator("#appointment-form button").click();
  for (const hour of ["9", "10"]) {
    const cell = page.locator(
      `#agenda-calendar td[data-date="2026-11-20"][data-hour="${hour}"]`,
    );
    await expect(cell.locator(".agenda-event")).toHaveCount(1);
    await expect(cell.locator(".agenda-slot-add")).toHaveCount(0);
  }
  await expect(
    page.locator('[data-slot-date="2026-11-20"][data-slot-hour="11"]'),
  ).toBeVisible();
  const child = await openAgendaTab(page);
  await child.locator("#appointment-status").selectOption("cancelled");
  await child.locator("#appointment-form button").click();
  await expect(
    page.locator('[data-slot-date="2026-11-20"][data-slot-hour="9"]'),
  ).toBeVisible();
  await expect(
    page.locator("#agenda-calendar .agenda-event.is-cancelled"),
  ).toHaveCount(0);
});

test("stored appointments at 14:00 or on weekends stay reachable without adding those grid rows or columns", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await page
    .locator('[data-slot-date="2026-11-18"][data-slot-hour="9"]')
    .click();
  await page.locator("#appointment-patient").selectOption({ index: 1 });
  await page.locator("#appointment-start").fill("2026-11-18T14:00");
  await page.locator("#appointment-form button").click();
  await expect(page.locator("#agenda-outside-note")).toContainText(
    "1 citas guardadas fuera",
  );
  await expect(page.locator("#agenda-calendar .agenda-event")).toHaveCount(0);
  await page.locator("#agenda-saved-list summary").click();
  const early = await openAgendaTab(page, "#agenda-list button");
  await expect(early.locator("#appointment-start")).toHaveValue(
    "2026-11-18T14:00",
  );
  await returnPatientToDirectory(early, "#agenda-close");
  await page.locator("#agenda-new").click();
  await page.locator("#appointment-patient").selectOption({ index: 1 });
  await page.locator("#appointment-start").fill("2026-11-21T10:00");
  await page.locator("#appointment-form button").click();
  await expect(page.locator("#agenda-list button")).toHaveCount(2);
  await expect(
    page.locator("#agenda-calendar thead th[data-date]"),
  ).toHaveCount(5);
  await expect(
    page.locator('#agenda-calendar [data-date="2026-11-21"]'),
  ).toHaveCount(0);
  const weekend = await openAgendaTab(
    page,
    page.locator("#agenda-list button").filter({ hasText: "21/11/2026" }),
  );
  await expect(weekend.locator("#appointment-start")).toHaveValue(
    "2026-11-21T10:00",
  );
});

test("slot changes respect unsaved sessions, keyboard activation and iPad/phone layout", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await bookAppointment(page);
  await page
    .locator("#session-evolution")
    .fill("Borrador ficticio que conservar");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .locator('[data-slot-date="2026-11-16"][data-slot-hour="8"]')
    .click();
  await expect(page.locator("#session-evolution")).toHaveValue(
    "Borrador ficticio que conservar",
  );
  page.once("dialog", (dialog) => dialog.accept());
  const slot = page.locator(
    '[data-slot-date="2026-11-16"][data-slot-hour="8"]',
  );
  await slot.focus();
  await slot.press("Enter");
  await expect(page.locator("#appointment-start")).toHaveValue(
    "2026-11-16T08:00",
  );
  await expect(page.locator("#appointment-patient")).toBeFocused();
  await expect(page.locator("#session-evolution")).toHaveValue("");
  for (const size of [
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.locator("#agenda-calendar thead th[data-date]"),
    ).toHaveCount(5);
    const height = await slot.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBeGreaterThanOrEqual(40);
  }
});

test("a failed week refresh preserves the loaded dates and appointments and a late reply cannot repopulate after logout", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await bookAppointment(page);
  await owner(page).route(
    "**/rpc/clinical_agenda_week",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"message":"Synthetic unavailable"}',
      }),
    { times: 1 },
  );
  await page.locator("#agenda-next").click();
  await expect(page.locator("#status")).toContainText(
    "No se pudo cargar la agenda",
  );
  await expect(page.locator("#agenda-date")).toHaveValue("2026-11-20");
  await expect(page.locator("#agenda-calendar .agenda-event")).toHaveCount(1);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let started;
  const requested = new Promise((resolve) => {
    started = resolve;
  });
  await owner(page).route(
    "**/rpc/clinical_agenda_week",
    async (route) => {
      started();
      await held;
      await route.fallback();
    },
    { times: 1 },
  );
  await page.locator("#agenda-load").click();
  await requested;
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now + 6 * 60 * 1000;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  release();
  await expect(page.locator("#login")).toBeVisible();
  await expect(page.locator("#agenda-calendar .agenda-event")).toHaveCount(0);
  await expect(page.locator("#agenda-week")).not.toContainText("FICTICIO");
  await expect(page.locator("#session-evolution")).toHaveValue("");
});

test("the first failed weekly load keeps the calendar and date aligned without claiming availability", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  page = await navigate(page, "agenda");
  const original = await page.locator("#agenda-date").inputValue();
  const headings = await page
    .locator("#agenda-calendar thead th[data-date]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.date));
  await owner(page).route(
    "**/rpc/clinical_agenda_week",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"message":"Synthetic unavailable"}',
      }),
    { times: 1 },
  );
  await page.locator("#agenda-date").fill("2027-02-10");
  await expect(page.locator("#status")).toContainText(
    "No se pudo cargar la agenda",
  );
  await expect(page.locator("#agenda-date")).toHaveValue(original);
  expect(
    await page
      .locator("#agenda-calendar thead th[data-date]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.date)),
  ).toEqual(headings);
  await expect(page.locator("#agenda-view-state")).toContainText(
    "Semana sin cargar",
  );
  await expect(page.locator("#agenda-loaded-day")).toHaveText("");
});

test("tapping a stale empty slot refreshes the occupied slot without preparing a duplicate or opening an asynchronous popup", async ({
  page,
}) => {
  const calls = await authorizeAgenda(page);
  const patient = backupFixture.patients.find((p) => !p.archived_at),
    name = JSON.parse(patient.payload_json).name;
  await owner(page).route(
    "**/rpc/clinical_agenda_week",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          week_start: "2026-11-16",
          week_end: "2026-11-20",
          patients: [{ id: patient.id, name }],
          appointments: [
            {
              id: "77777777-7777-4777-8777-777777777777",
              clinician_id: userId,
              patient_id: patient.id,
              starts_at: "2026-11-18T10:00:00.000000Z",
              ends_at: "2026-11-18T10:45:00.000000Z",
              status: "scheduled",
              revision: 1,
              patient_name: name,
              patient_archived: false,
              session_id: null,
            },
          ],
        }),
      }),
    { times: 1 },
  );
  await page
    .locator('[data-slot-date="2026-11-18"][data-slot-hour="11"]')
    .click();
  await expect(page.locator("#status")).toContainText(
    "Ese hueco ya tiene una cita",
  );
  await expect(page.locator("#agenda-editor")).toBeHidden();
  await expect(page.locator("#agenda-calendar .agenda-event")).toHaveCount(1);
  await expect(page.locator("#session-form")).toBeHidden();
  expect(
    calls.some((c) => c.path.endsWith("/clinical_appointment_save_typed")),
  ).toBe(false);
});

test("the entire compact week fits iPad portrait and landscape without vertical calendar scrolling", async ({
  page,
}) => {
  await authorizeAgenda(page);
  for (const size of [
    { width: 1180, height: 820 },
    { width: 1024, height: 768 },
    { width: 1024, height: 700 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () =>
        page
          .locator("#agenda-week")
          .evaluate(
            (el) =>
              el.scrollHeight <= el.clientHeight + 2 &&
              el.getBoundingClientRect().bottom <=
                (visualViewport?.height ?? innerHeight) + 1,
          ),
      )
      .toBe(true);
    const last = page.locator('#agenda-calendar tr[data-hour="19"]');
    expect(
      (await last.boundingBox()).y + (await last.boundingBox()).height,
    ).toBeLessThanOrEqual(size.height + 1);
    await expect(page.locator('#agenda-calendar [data-hour="14"]')).toHaveCount(
      0,
    );
  }
});

test("visit colours follow the stored type and survive reopening and a fresh login", async ({
  page,
}) => {
  const calls = await authorizeAgenda(page);
  const colours = [];
  for (const [hour, type, label] of [
    [8, "first_visit", "Primera visita"],
    [9, "follow_up", "Seguimiento"],
    [10, "gym", "Gimnasio"],
  ]) {
    await page
      .locator(`[data-slot-date="2026-11-18"][data-slot-hour="${hour}"]`)
      .click();
    await page.locator("#appointment-patient").selectOption({ index: 1 });
    await page.locator("#appointment-visit-type").selectOption(type);
    await page.locator("#appointment-form button").click();
    await expect(page.locator("#status")).toContainText(
      "Cita ficticia guardada",
    );
    const card = page.locator(
      `#agenda-calendar td[data-date="2026-11-18"][data-hour="${hour}"] .agenda-event`,
    );
    await expect(card).toHaveClass(new RegExp(`type-${type}`));
    await expect(card).toHaveAttribute("aria-label", new RegExp(label));
    colours.push(
      await card.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    const child = await openAgendaTab(page, card);
    await expect(child.locator("#appointment-visit-type")).toHaveValue(type);
    await returnPatientToDirectory(child, "#agenda-close");
    await expect(page.locator("#agenda-editor")).toBeHidden();
    await expect
      .poll(() =>
        page
          .locator('#agenda-calendar tr[data-hour="19"]')
          .evaluate(
            (el) => el.getBoundingClientRect().bottom <= innerHeight + 1,
          ),
      )
      .toBe(true);
  }
  expect(new Set(colours).size).toBe(3);
  expect(
    calls
      .filter((c) => c.path.endsWith("/clinical_appointment_save_typed"))
      .map((c) => JSON.parse(c.postBody).p_visit_type),
  ).toEqual(["first_visit", "follow_up", "gym"]);
  await page.reload();
  await authorized(page);
  page = await navigate(page, "agenda");
  await page.locator("#agenda-date").fill("2026-11-18");
  await page.locator("#agenda-load").click();
  for (const type of ["first_visit", "follow_up", "gym"])
    await expect(page.locator(`#agenda-calendar .type-${type}`)).toHaveCount(1);
});

test("several appointments within an hour remain selectable in the compact grid", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await page
    .locator('[data-slot-date="2026-11-18"][data-slot-hour="9"]')
    .click();
  await page.locator("#appointment-patient").selectOption({ index: 1 });
  await page.locator("#appointment-minutes").fill("30");
  await page.locator("#appointment-form button").click();
  await page.locator("#agenda-new").click();
  await page.locator("#appointment-patient").selectOption({ index: 1 });
  await page.locator("#appointment-start").fill("2026-11-18T09:30");
  await page.locator("#appointment-minutes").fill("30");
  await page.locator("#appointment-visit-type").selectOption("gym");
  await page.locator("#appointment-form button").click();
  const group = page.locator(
    '#agenda-calendar td[data-date="2026-11-18"][data-hour="9"] .agenda-event-group',
  );
  await expect(group).toContainText("2 citas");
  await group.click();
  await expect(page.locator("#agenda-group-picker")).toBeVisible();
  await expect(page.locator("#agenda-group-list button")).toHaveCount(2);
  const child = await openAgendaTab(
    page,
    page.locator("#agenda-group-list button").filter({ hasText: /· 09:30–/ }),
  );
  await expect(page.locator("#agenda-group-picker")).not.toBeVisible();
  await expect(child.locator("#appointment-visit-type")).toHaveValue("gym");
  await expect(child.locator("#appointment-start")).toHaveValue(
    "2026-11-18T09:30",
  );
});

test("patient page saves before closing, reopens saved fields and avoids redundant writes", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  const parent = page;
  page = await openPatient(page);
  await expect(parent.locator("#patient-directory")).toBeVisible();
  await expect(parent.locator("#patient-editor")).toBeHidden();
  await expect(page.locator("#workspace-title")).toHaveText(
    "Ficha del paciente",
  );
  await expect(page.locator("#patient-name")).toBeFocused();
  await expect(page).toHaveTitle("Ficha del paciente · MLREHAB");
  expect(new URL(page.url()).hash).toBe("#ficha");
  await page.locator("#patient-history").fill("Historia ficticia terminada");
  await page.locator("#patient-exam").fill("Exploración ficticia terminada");
  page = await returnPatientToDirectory(page, "#patient-finish");
  await expect(page.locator("#patient-directory")).toBeVisible();
  const writes = () =>
    calls.filter((c) => c.path.endsWith("/clinical_patient_save_fields_test"));
  expect(JSON.parse(writes()[0].postBody).p_fields).toEqual({
    history: "Historia ficticia terminada",
    exam: "Exploración ficticia terminada",
  });
  page = await openPatient(page);
  await expect(page.locator("#patient-history")).toHaveValue(
    "Historia ficticia terminada",
  );
  await expect(page.locator("#patient-exam")).toHaveValue(
    "Exploración ficticia terminada",
  );
  page = await returnPatientToDirectory(page, "#patient-finish");
  expect(writes()).toHaveLength(1);
});

test("patient page close offers continue, save and discard while retaining the stored version", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  page = await openPatient(page);
  await page.locator("#patient-history").fill("Borrador ficticio conservado");
  await page.locator("#patient-back").click();
  await expect(page.locator("#patient-leave-dialog")).toBeVisible();
  await page.locator("#patient-leave-continue").click();
  await expect(page.locator("#patient-history")).toHaveValue(
    "Borrador ficticio conservado",
  );
  await page.locator("#patient-back").click();
  page = await returnPatientToDirectory(page, "#patient-leave-save");
  page = await openPatient(page);
  await expect(page.locator("#patient-history")).toHaveValue(
    "Borrador ficticio conservado",
  );
  await page
    .locator("#patient-history")
    .fill("Borrador ficticio para descartar");
  await page.locator("#patient-back").click();
  page = await returnPatientToDirectory(page, "#patient-leave-discard");
  page = await openPatient(page);
  await expect(page.locator("#patient-history")).toHaveValue(
    "Borrador ficticio conservado",
  );
});

for (const mode of ["conflict", "unavailable"])
  test(`patient page finish ${mode} retains the tab and its draft`, async ({
    page,
  }) => {
    await mockAuth(page, { patientMode: mode });
    await authorized(page);
    page = await openPatient(page);
    await page
      .locator("#patient-history")
      .fill("Borrador ficticio sin confirmar");
    await page.locator("#patient-finish").click();
    await expect(page.locator("#status")).toContainText("Tu texto sigue aquí");
    expect(page.isClosed()).toBe(false);
    await expect(page.locator("#patient-history")).toHaveValue(
      "Borrador ficticio sin confirmar",
    );
    await expect(page.locator("#patient-save-status")).toContainText(
      "sin guardar",
    );
  });

test("patient page finish waits for confirmation and keeps edits typed during the request", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  page = await openPatient(page);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await owner(page).route(
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
  await page.locator("#patient-history").fill("Texto ficticio enviado");
  const sending = owner(page).waitForRequest(
    "**/rest/v1/rpc/clinical_patient_save_fields_test",
  );
  await page.locator("#patient-finish").click();
  await sending;
  await expect(page.locator("#patient-save-status")).toContainText("Guardando");
  await page.locator("#patient-history").fill("Texto ficticio posterior");
  release();
  await expect(page.locator("#status")).toContainText("cambios posteriores");
  await expect(page.locator("#patient-history")).toHaveValue(
    "Texto ficticio posterior",
  );
  expect(page.isClosed()).toBe(false);
  page = await returnPatientToDirectory(page, "#patient-finish");
  await expect(page.locator("#patient-directory")).toBeVisible();
});

test("patient page archived records close safely and browser tabs fit iPad and phone", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  page = await openPatient(page, true);
  await expect(page.locator("#patient-finish")).toBeHidden();
  page = await returnPatientToDirectory(page);
  page = await openPatient(page);
  for (const viewport of [
    { width: 1180, height: 820 },
    { width: 820, height: 1180 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const g = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      detail: document.getElementById("patient-editor").getBoundingClientRect()
        .width,
      panel: document.getElementById("patients-panel").getBoundingClientRect()
        .width,
    }));
    expect(g.width).toBeLessThanOrEqual(g.viewport);
    expect(g.detail).toBeGreaterThan(g.panel * 0.9);
    await page.locator("#patient-goals").scrollIntoViewIfNeeded();
    await expect(page.locator("#patient-finish")).toBeInViewport();
  }
});

test("patient page inactivity locks the browser tab and clears its return dialog and draft", async ({
  page,
}) => {
  await page.clock.install();
  await mockAuth(page);
  await authorized(page);
  const parent = page;
  page = await openPatient(page);
  await page.locator("#patient-history").fill("Borrador ficticio privado");
  await page.locator("#patient-back").click();
  await expect(page.locator("#patient-leave-dialog")).toBeVisible();
  await parent.clock.fastForward(5 * 60 * 1000 + 15000);
  await expect(parent.locator("#login")).toBeVisible();
  await expect(page.locator("#patient-leave-dialog")).toBeHidden();
  await expect(page.locator("#patient-name")).toHaveText("");
  await expect(page.locator("#patient-history")).toHaveValue("");
  await expect(page.locator("#patient-save-status")).toHaveText("");
});

test("browser patient tab keeps the directory open and saves before closing", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  page = await navigate(page, "patients");
  await page.locator("#patient-load").click();
  const opening = page.waitForEvent("popup");
  await page
    .locator("#patient-list button")
    .filter({ hasText: "Activo" })
    .click();
  const child = await opening;
  await expect(child.locator("#patient-editor")).toBeVisible();
  await expect(page.locator("#patient-directory")).toBeVisible();
  await expect(page.locator("#patient-editor")).toBeHidden();
  expect(new URL(child.url()).hash).toBe("#ficha");
  await child
    .locator("#patient-history")
    .fill("Historia ficticia de la pestaña");
  owners.set(child, page);
  await returnPatientToDirectory(child, "#patient-finish");
  const reopening = page.waitForEvent("popup");
  await page
    .locator("#patient-list button")
    .filter({ hasText: "Activo" })
    .click();
  const reopened = await reopening;
  await expect(reopened.locator("#patient-history")).toHaveValue(
    "Historia ficticia de la pestaña",
  );
});

test("browser patient tabs all clear when the main session is closed", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  const first = await openPatient(page),
    second = await openPatient(page, true);
  await first
    .locator("#patient-history")
    .fill("Borrador ficticio en otra pestaña");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.locator("#login")).toBeVisible();
  for (const child of [first, second]) {
    await expect(child.locator("#patient-editor")).toBeHidden();
    await expect(child.locator("#patient-name")).toHaveText("");
    await expect(child.locator("#patient-history")).toHaveValue("");
  }
});

test("browser patient tab locks if its main tab closes and the parent warns about drafts", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  const child = await openPatient(page);
  await child
    .locator("#patient-history")
    .fill("Borrador ficticio que activa el aviso");
  const dialog = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const warning = await dialog;
  expect(warning.type()).toBe("beforeunload");
  await warning.dismiss();
  expect(page.isClosed()).toBe(false);
  await expect(child.locator("#patient-history")).toHaveValue(
    "Borrador ficticio que activa el aviso",
  );
  await page.close();
  await expect(child.locator("#patient-editor")).toBeHidden({ timeout: 10000 });
  await expect(child.locator("#patient-history")).toHaveValue("");
  await expect(
    child.getByRole("link", { name: "Abrir MLREHAB" }),
  ).toBeVisible();
});

test("browser patient popup blocking leaves the directory intact with a clear instruction", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  page = await navigate(page, "patients");
  await page.locator("#patient-load").click();
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page
    .locator("#patient-list button")
    .filter({ hasText: "Activo" })
    .click();
  await expect(page.locator("#status")).toContainText(
    "bloqueado la pestaña nueva",
  );
  await expect(page.locator("#patient-directory")).toBeVisible();
  await expect(page.locator("#patient-editor")).toBeHidden();
  expect(calls.some((c) => c.path.endsWith("/clinical_patient_get"))).toBe(
    false,
  );
});

test("browser patient direct URL does not borrow access or disclose records without an opener", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await page.goto("/#ficha");
  await expect(page.locator("#status")).toContainText(
    "Abre la ficha desde la lista",
  );
  await expect(page.locator("#patient-editor")).toBeHidden();
  await expect(page.locator("#login")).toBeHidden();
  expect(calls).toHaveLength(0);
});

test("browser patient port rejects other records and unrelated APIs and never transfers credentials", async ({
  page,
}) => {
  await page.context().addInitScript(() => {
    window.addEventListener("message", (event) => {
      if (
        event.data?.type !== "channel" ||
        event.data?.protocol !== "mlrehab-patient-v1" ||
        event.ports.length !== 1
      )
        return;
      window.testPatientPort = event.ports[0];
      window.testPatientMessages = [];
      window.testPatientPort.addEventListener("message", (e) =>
        window.testPatientMessages.push(e.data),
      );
    });
  });
  const calls = await mockAuth(page);
  await authorized(page);
  const child = await openPatient(page);
  const other = backupFixture.patients.find((p) => p.archived_at !== null).id;
  await child.evaluate((other) => {
    for (const [id, name, args] of [
      ["probe-backup", "clinical_backup_export_test", {}],
      ["probe-record", "clinical_patient_get", { p_id: other }],
    ])
      window.testPatientPort.postMessage({
        protocol: "mlrehab-patient-v1",
        type: "rpc",
        id,
        name,
        args,
      });
  }, other);
  await expect
    .poll(() =>
      child.evaluate(
        () =>
          window.testPatientMessages.filter(
            (m) => m.type === "result" && m.id.startsWith("probe-"),
          ).length,
      ),
    )
    .toBe(2);
  const messages = await child.evaluate(() => window.testPatientMessages);
  const replies = messages.filter(
    (m) => m.type === "result" && m.id.startsWith("probe-"),
  );
  expect(replies.every((m) => m.result.error.code === "42501")).toBe(true);
  expect(
    calls.some((c) => c.path.endsWith("/clinical_backup_export_test")),
  ).toBe(false);
  expect(
    calls.some(
      (c) =>
        c.path.endsWith("/clinical_patient_get") &&
        JSON.parse(c.postBody).p_id === other,
    ),
  ).toBe(false);
  const bearer = calls.find((c) =>
    c.path.endsWith("/clinical_access_check"),
  ).authorization;
  expect(JSON.stringify(messages)).not.toContain(
    bearer.replace(/^Bearer /, ""),
  );
  expect(JSON.stringify(messages)).not.toContain("synthetic-refresh");
  for (const tab of [page, child])
    expect(
      await tab.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
      })),
    ).toEqual({ local: {}, session: {} });
  expect(new URL(child.url()).search).toBe("");
  expect(new URL(child.url()).hash).toBe("#ficha");
  expect(child.url()).not.toContain(other);
  await expect(child).toHaveTitle("Ficha del paciente · MLREHAB");
});

test("browser patient write remains pending for backups even if the child closes", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  const child = await openPatient(page);
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
  await child
    .locator("#patient-history")
    .fill("Texto ficticio pendiente de confirmación");
  const saving = page.waitForRequest(
    "**/rest/v1/rpc/clinical_patient_save_fields_test",
  );
  await child.getByRole("button", { name: "Guardar ficha ficticia" }).click();
  await saving;
  await child.close();
  page = await fillBackup(page);
  await page.locator("#backup-export button").click();
  await expect(page.locator("#status")).toContainText("Guarda o descarta");
  expect(
    calls.some((c) => c.path.endsWith("/clinical_backup_export_test")),
  ).toBe(false);
  release();
});

test("browser patient activity keeps the main idle timer current without changing server authorization", async ({
  page,
}) => {
  await page.clock.install();
  await mockAuth(page);
  await authorized(page);
  const child = await openPatient(page);
  await page.clock.fastForward(4 * 60 * 1000);
  const reading = page.waitForResponse("**/rest/v1/rpc/clinical_patient_get");
  await child.locator("#patient-refresh").click();
  await reading;
  await page.clock.fastForward(2 * 60 * 1000);
  await expect(page.locator("#complete")).toBeVisible();
  await expect(child.locator("#patient-editor")).toBeVisible();
});

test("browser patient initial load can retry without losing the main tab", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  page = await navigate(page, "patients");
  await page.locator("#patient-load").click();
  let first = true;
  await page.route("**/rest/v1/rpc/clinical_patient_get", async (route) => {
    if (!first) {
      await route.fallback();
      return;
    }
    first = false;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Synthetic temporary failure" }),
    });
  });
  const opening = page.waitForEvent("popup");
  await page
    .locator("#patient-list button")
    .filter({ hasText: "Activo" })
    .click();
  const child = await opening;
  await expect(child.locator("#patient-tab-retry")).toBeVisible();
  await expect(child.locator("#patient-editor")).toBeHidden();
  await child.locator("#patient-tab-retry").click();
  await expect(child.locator("#patient-editor")).toBeVisible();
  await expect(page.locator("#patient-directory")).toBeVisible();
});

test("browser patient same-origin windows not opened by the patient list cannot attach to the session", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  const before = calls.length,
    opening = page.waitForEvent("popup");
  await page.evaluate(() =>
    window.open(location.pathname + "#ficha", "_blank"),
  );
  const child = await opening;
  await expect(child.locator("#status")).toContainText(
    "Abre la ficha desde la lista",
    { timeout: 20000 },
  );
  await expect(child.locator("#patient-editor")).toBeHidden();
  expect(
    calls.slice(before).some((c) => c.path.endsWith("/clinical_patient_get")),
  ).toBe(false);
});

test("browser patient tabs preserve independent drafts and save only their bound patient", async ({
  page,
}) => {
  const calls = await mockAuth(page);
  await authorized(page);
  const first = await openPatient(page),
    second = await newPatient(page, "Caso independiente");
  await first.locator("#patient-history").fill("Historia ficticia A");
  await second.locator("#patient-history").fill("Historia ficticia B");
  await first.getByRole("button", { name: "Guardar ficha ficticia" }).click();
  await expect(first.locator("#patient-save-status")).toHaveText(
    "Sin cambios pendientes",
  );
  await expect(second.locator("#patient-history")).toHaveValue(
    "Historia ficticia B",
  );
  await second.getByRole("button", { name: "Guardar ficha ficticia" }).click();
  await expect(second.locator("#patient-save-status")).toHaveText(
    "Sin cambios pendientes",
  );
  await first.locator("#patient-refresh").click();
  await expect(first.locator("#patient-history")).toHaveValue(
    "Historia ficticia A",
  );
  await second.locator("#patient-refresh").click();
  await expect(second.locator("#patient-history")).toHaveValue(
    "Historia ficticia B",
  );
  const writes = calls
    .filter((c) => c.path.endsWith("/clinical_patient_save_fields_test"))
    .map((c) => JSON.parse(c.postBody));
  expect(writes).toHaveLength(2);
  expect(writes[0].p_id).not.toBe(writes[1].p_id);
  expect(writes.map((w) => w.p_fields.history)).toEqual([
    "Historia ficticia A",
    "Historia ficticia B",
  ]);
});

test("browser patient pagehide clears the document before browser history can retain it", async ({
  page,
}) => {
  await mockAuth(page);
  await authorized(page);
  const child = await openPatient(page);
  await child
    .locator("#patient-history")
    .fill("Borrador ficticio antes de navegar");
  await child.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  await expect(child.locator("#patient-editor")).toBeHidden();
  await expect(child.locator("#patient-history")).toHaveValue("");
  await expect(child.locator("#patient-name")).toHaveText("");
  await expect(child.locator("#status")).toContainText("cerrado o actualizado");
});

test("calendar browser tab saves treatment before closing and keeps the main week visible", async ({
  page,
}) => {
  const calls = await authorizeAgenda(page);
  await bookAppointment(page);
  await page.locator("#agenda-close").click();
  const child = await openAgendaTab(page);
  expect(new URL(child.url()).hash).toBe("#cita");
  await expect(child).toHaveTitle("Cita y tratamiento · MLREHAB");
  await expect(page.locator("#agenda-calendar")).toBeVisible();
  await expect(page.locator("#agenda-editor")).toBeHidden();
  await expect(child.locator("#agenda-week")).toBeHidden();
  await child
    .locator("#session-evolution")
    .fill("Evolución ficticia desde la agenda");
  await child.locator("#session-passive").fill("Tratamiento pasivo ficticio");
  await child.locator("#session-exercise").fill("Ejercicio de prueba");
  await returnPatientToDirectory(child, "#agenda-finish");
  await expect(page.locator("#agenda-calendar .agenda-event")).toContainText(
    "✓",
  );
  const reopened = await openAgendaTab(page);
  await expect(reopened.locator("#session-evolution")).toHaveValue(
    "Evolución ficticia desde la agenda",
  );
  await expect(reopened.locator("#session-passive")).toHaveValue(
    "Tratamiento pasivo ficticio",
  );
  await expect(reopened.locator("#session-exercise")).toHaveValue(
    "Ejercicio de prueba",
  );
  const writes = calls.filter((c) =>
    c.path.endsWith("/clinical_session_save_test"),
  );
  expect(writes).toHaveLength(1);
  await returnPatientToDirectory(reopened, "#agenda-finish");
  expect(
    calls.filter((c) => c.path.endsWith("/clinical_session_save_test")),
  ).toHaveLength(1);
});

for (const agendaMode of ["conflict", "unavailable"])
  test(`calendar browser tab ${agendaMode} keeps the treatment draft and blocks backups`, async ({
    page,
  }) => {
    const calls = await authorizeAgenda(page, { agendaMode });
    await bookAppointment(page);
    await page.locator("#agenda-close").click();
    const child = await openAgendaTab(page);
    await child
      .locator("#session-evolution")
      .fill("Texto ficticio que conservar");
    await child.locator("#agenda-finish").click();
    await expect(child.locator("#status")).toContainText(
      agendaMode === "conflict" ? "ha cambiado" : "borrador",
    );
    expect(child.isClosed()).toBe(false);
    await expect(child.locator("#session-evolution")).toHaveValue(
      "Texto ficticio que conservar",
    );
    await fillBackup(page);
    await page.locator("#backup-export button").click();
    await expect(page.locator("#status")).toContainText("Guarda o descarta");
    expect(
      calls.some((c) => c.path.endsWith("/clinical_backup_export_test")),
    ).toBe(false);
  });

test("calendar browser tab saves a reschedule and treatment together without discarding text", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await bookAppointment(page);
  await page.locator("#agenda-close").click();
  const child = await openAgendaTab(page);
  await child.locator("#appointment-start").fill("2026-11-25T11:00");
  await child
    .locator("#session-evolution")
    .fill("Evolución ficticia tras cambiar de semana");
  await returnPatientToDirectory(child, "#agenda-finish");
  await expect(page.locator("#agenda-calendar .agenda-event")).toHaveCount(0);
  await page.locator("#agenda-next").click();
  const reopened = await openAgendaTab(page);
  await expect(reopened.locator("#appointment-start")).toHaveValue(
    "2026-11-25T11:00",
  );
  await expect(reopened.locator("#session-evolution")).toHaveValue(
    "Evolución ficticia tras cambiar de semana",
  );
});

test("calendar browser tab clears treatment on logout", async ({ page }) => {
  await authorizeAgenda(page);
  await bookAppointment(page);
  await page.locator("#agenda-close").click();
  const child = await openAgendaTab(page);
  await child.locator("#session-passive").fill("Texto ficticio pendiente");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await expect(page.locator("#login")).toBeVisible();
  await expect(child.locator("#agenda-editor")).toBeHidden();
  await expect(child.locator("#session-passive")).toHaveValue("");
});

test("calendar browser tab limits its port to one appointment and never receives the other appointments or credentials", async ({
  page,
}) => {
  await page.context().addInitScript(() => {
    window.addEventListener("message", (event) => {
      if (
        event.data?.type !== "channel" ||
        event.data?.protocol !== "mlrehab-patient-v1" ||
        event.ports.length !== 1
      )
        return;
      window.testAgendaPort = event.ports[0];
      window.testAgendaMessages = [];
      window.testAgendaPort.addEventListener("message", (e) =>
        window.testAgendaMessages.push(e.data),
      );
    });
  });
  const calls = await authorizeAgenda(page);
  await bookAppointment(page);
  await page.locator("#agenda-new").click();
  await page.locator("#appointment-patient").selectOption({ index: 1 });
  await page.locator("#appointment-start").fill("2026-11-20T11:00");
  await page.locator("#appointment-form button").click();
  await expect(page.locator("#agenda-calendar .agenda-event")).toHaveCount(2);
  const child = await openAgendaTab(page);
  const context = await child.evaluate(() =>
    window.testAgendaMessages.find((m) => m.type === "context"),
  );
  const other = "77777777-7777-4777-8777-777777777778";
  await child.evaluate(
    ({ context, other }) => {
      for (const [id, name, args] of [
        ["backup", "clinical_backup_export_test", {}],
        ["week", "clinical_agenda_week", { p_day: "2027-01-01" }],
        [
          "other-read",
          "clinical_session_get_test",
          { p_appointment_id: other },
        ],
        [
          "other-write",
          "clinical_appointment_save_typed",
          { p_id: other, p_patient_id: context.patientId },
        ],
        [
          "other-session",
          "clinical_session_save_test",
          { p_id: other, p_appointment_id: context.appointmentId },
        ],
        [
          "patient-write",
          "clinical_patient_save_fields_test",
          { p_id: context.patientId },
        ],
        [
          "exercise-write",
          "clinical_exercise_create_test",
          { p_name: "Nombre de prueba" },
        ],
      ])
        window.testAgendaPort.postMessage({
          protocol: "mlrehab-patient-v1",
          type: "rpc",
          id: "probe-" + id,
          name,
          args,
        });
    },
    { context, other },
  );
  await expect
    .poll(() =>
      child.evaluate(
        () =>
          window.testAgendaMessages.filter((m) => m.id?.startsWith("probe-"))
            .length,
      ),
    )
    .toBe(7);
  const messages = await child.evaluate(() => window.testAgendaMessages);
  expect(
    messages
      .filter((m) => m.id?.startsWith("probe-"))
      .every((m) => m.result.error.code === "42501"),
  ).toBe(true);
  const week = messages.find((m) => m.result?.data?.appointments)?.result.data;
  expect(week.appointments.map((a) => a.id)).toEqual([context.appointmentId]);
  expect(week.patients.map((p) => p.id)).toEqual([context.patientId]);
  const token = calls
    .find((c) => c.path.endsWith("/clinical_access_check"))
    .authorization.replace(/^Bearer /, "");
  expect(JSON.stringify(messages)).not.toContain(token);
  expect(JSON.stringify(messages)).not.toContain("synthetic-refresh");
  expect(JSON.stringify(messages)).not.toContain(other);
  expect(
    calls.some((c) => c.path.endsWith("/clinical_backup_export_test")),
  ).toBe(false);
  await child.locator("#exercise-picker summary").click();
  await expect
    .poll(
      () =>
        calls.filter((c) => c.path.endsWith("/clinical_exercise_list_test"))
          .length,
    )
    .toBe(1);
  await expect(child.locator("#exercise-results button").first()).toBeEnabled();
  for (const tab of [page, child])
    expect(
      await tab.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
      })),
    ).toEqual({ local: {}, session: {} });
});

test("calendar browser tab keeps text typed during save and closes only after the next confirmed save", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await bookAppointment(page);
  const child = await openAgendaTab(page);
  let release, requested;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    requested = resolve;
  });
  await page.route(
    "**/rpc/clinical_session_save_test",
    async (route) => {
      requested();
      await held;
      await route.fallback();
    },
    { times: 1 },
  );
  await child.locator("#session-evolution").fill("Primera versión ficticia");
  await child.locator("#agenda-finish").click();
  await started;
  await child.locator("#session-evolution").fill("Texto ficticio posterior");
  release();
  await expect(child.locator("#status")).toContainText("texto posterior");
  await expect(child.locator("#session-evolution")).toHaveValue(
    "Texto ficticio posterior",
  );
  expect(child.isClosed()).toBe(false);
  await returnPatientToDirectory(child, "#agenda-finish");
  const reopened = await openAgendaTab(page);
  await expect(reopened.locator("#session-evolution")).toHaveValue(
    "Texto ficticio posterior",
  );
  await expect(reopened.locator("#session-state")).toContainText("versión 2");
});

test("calendar browser tab pending session still blocks backups if the treatment tab is closed", async ({
  page,
}) => {
  const calls = await authorizeAgenda(page);
  await bookAppointment(page);
  const child = await openAgendaTab(page);
  let release, requested;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    requested = resolve;
  });
  await page.route(
    "**/rpc/clinical_session_save_test",
    async (route) => {
      requested();
      await held;
      await route.fallback();
    },
    { times: 1 },
  );
  await child.locator("#session-evolution").fill("Sesión ficticia pendiente");
  await child.locator("#agenda-finish").click();
  await started;
  await child.close();
  await fillBackup(page);
  await page.locator("#backup-export button").click();
  await expect(page.locator("#status")).toContainText("Guarda o descarta");
  expect(
    calls.some((c) => c.path.endsWith("/clinical_backup_export_test")),
  ).toBe(false);
  release();
});

test("calendar browser tab popup blocking keeps the week and never opens a treatment editor below it", async ({
  page,
}) => {
  const calls = await authorizeAgenda(page);
  await bookAppointment(page);
  const before = calls.length;
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.locator("#agenda-calendar .agenda-event").first().click();
  await expect(page.locator("#status")).toContainText(
    "bloqueado la pestaña nueva",
  );
  await expect(page.locator("#agenda-calendar")).toBeVisible();
  await expect(page.locator("#agenda-editor")).toBeHidden();
  expect(
    calls
      .slice(before)
      .some((c) => c.path.endsWith("/clinical_session_get_test")),
  ).toBe(false);
});

test("calendar browser tab clears treatment before its page can remain in browser history", async ({
  page,
}) => {
  await authorizeAgenda(page);
  await bookAppointment(page);
  const child = await openAgendaTab(page);
  await child.locator("#session-exercise").fill("Ejercicio ficticio privado");
  await child.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  await expect(child.locator("#agenda-editor")).toBeHidden();
  await expect(child.locator("#session-exercise")).toHaveValue("");
  await expect(child.locator("#appointment-patient option")).toHaveCount(0);
});
