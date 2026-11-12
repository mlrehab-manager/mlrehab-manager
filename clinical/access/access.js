import { createClient } from "@supabase/supabase-js";

const $ = (id) => document.getElementById(id);
const message = (value) => {
  $("status").textContent = value;
};
let epoch = 0;
let factorId = null;
let reserveId = null;
let active = false;
let busy = false;
let lastActivity = Date.now();
const idleMs = 5 * 60 * 1000;

function clearSetup() {
  $("qr").removeAttribute("src");
  $("secret").textContent = "";
  $("code").value = "";
  $("setup").hidden = true;
}
function reset() {
  epoch++;
  active = false;
  factorId = null;
  clearSetup();
  clearReserve();
  $("enroll").hidden = false;
  $("login").reset();
  for (const id of [
    "enrollment",
    "verify",
    "complete",
    "reserve",
    "closed",
    "logout",
  ])
    $(id).hidden = true;
  $("login").hidden = false;
}

function clearReserve() {
  reserveId = null;
  $("reserve-qr").removeAttribute("src");
  $("reserve-secret").textContent = "";
  $("reserve-code").value = "";
}
function qrSource(svg) {
  if (svg.startsWith("<svg"))
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  if (svg.startsWith("data:image/svg+xml;utf-8,")) return svg;
  throw new Error("Invalid QR");
}

if (location.origin !== ACCESS_ORIGIN || window.self !== window.top) {
  message(
    "Acceso bloqueado: abre la dirección de pruebas autorizada en una ventana propia.",
  );
} else {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  reset();
  message("Introduce la cuenta que has creado para la aplicación.");

  async function run(operation) {
    if (busy) return;
    busy = true;
    const current = epoch;
    document
      .querySelectorAll(
        "form button, select, #enroll, #test-revoke, #add-reserve",
      )
      .forEach((el) => {
        el.disabled = true;
      });
    try {
      await operation(() => current === epoch);
    } catch {
      if (current === epoch)
        message(
          "No se pudo completar la operación. Comprueba la conexión y vuelve a intentarlo.",
        );
    } finally {
      busy = false;
      document
        .querySelectorAll(
          "form button, select, #enroll, #test-revoke, #add-reserve",
        )
        .forEach((el) => {
          el.disabled = false;
        });
    }
  }

  async function exit(reason) {
    reset();
    // Stay locked during sign-out, including requests already in flight.
    $("login").hidden = true;
    message(reason);
    client.auth.stopAutoRefresh();
    // Reload discards memory even if the network refuses server-side sign-out.
    // Server revocation / recovery must still be verified before clinical use.
    await Promise.race([
      client.auth.signOut({ scope: "local" }).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
    location.reload();
  }

  async function showMfa(isCurrent) {
    const { data, error } = await client.auth.mfa.listFactors();
    if (!isCurrent()) return;
    if (error) throw error;
    const verified = data.totp.filter((factor) => factor.status === "verified");
    renderFactors(verified);
    if (verified.length) {
      factorId = verified[0].id;
      $("verify").hidden = false;
      message("Introduce el código de tu autenticador.");
    } else {
      $("enrollment").hidden = false;
      message("Falta configurar el segundo factor de la aplicación.");
    }
  }

  function renderFactors(factors) {
    $("factor-select").replaceChildren();
    for (const [index, factor] of factors.entries()) {
      const option = document.createElement("option");
      option.value = factor.id;
      option.textContent = factor.friendly_name?.startsWith("MLREHAB reserva")
        ? "Autenticador de reserva"
        : factor.friendly_name || `Autenticador ${index + 1}`;
      $("factor-select").append(option);
    }
    $("factor-label").hidden = $("factor-select").hidden = factors.length < 2;
    $("factor-count").textContent =
      `${factors.length} autenticador${factors.length === 1 ? "" : "es"} verificado${factors.length === 1 ? "" : "s"}.`;
    $("add-reserve").hidden = factors.length >= 2;
  }
  $("factor-select").addEventListener("change", () => {
    factorId = $("factor-select").value;
    $("code").value = "";
  });
  async function updateFactors(isCurrent) {
    const { data, error } = await client.auth.mfa.listFactors();
    if (!isCurrent()) return;
    if (error) throw error;
    renderFactors(data.totp.filter((f) => f.status === "verified"));
  }

  $("login").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async (isCurrent) => {
      const email = $("email").value.trim();
      const password = $("password").value;
      $("password").value = "";
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (!isCurrent()) return;
      if (error) {
        message(
          "No se pudo entrar. Revisa el correo y la contraseña o inténtalo más tarde.",
        );
        return;
      }
      active = true;
      lastActivity = Date.now();
      $("email").value = "";
      $("login").hidden = true;
      $("logout").hidden = false;
      await showMfa(isCurrent);
    });
  });

  $("enroll").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (!active || factorId) return;
      // Only discard incomplete enrollments, never a verified second factor.
      const { data: factors, error: listError } =
        await client.auth.mfa.listFactors();
      if (!isCurrent()) return;
      if (listError) throw listError;
      if (factors.totp.some((factor) => factor.status === "verified")) {
        await showMfa(isCurrent);
        return;
      }
      for (const factor of factors.all.filter(
        (f) => f.factor_type === "totp" && f.status === "unverified",
      )) {
        const { error } = await client.auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (!isCurrent()) return;
        if (error) throw error;
      }
      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "MLREHAB",
      });
      if (!isCurrent()) return;
      if (error) throw error;
      // Treat SVG as an image, never as HTML or an external image URL.
      const svg = qrSource(data.totp.qr_code);
      factorId = data.id;
      $("qr").src = svg;
      $("secret").textContent = data.totp.secret;
      $("setup").hidden = false;
      $("enroll").hidden = true;
      $("verify").hidden = false;
      message(
        "Añade la clave al autenticador y confirma un código para terminar.",
      );
    }),
  );

  $("verify").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async (isCurrent) => {
      if (!active || !factorId) return;
      const code = $("code").value;
      $("code").value = "";
      if (!/^[0-9]{6}$/.test(code)) {
        message("Introduce los 6 dígitos del autenticador.");
        return;
      }
      const { error } = await client.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (!isCurrent()) return;
      if (error) {
        message(
          "Código no verificado. Comprueba la hora del dispositivo y prueba un código nuevo.",
        );
        return;
      }
      const { data, error: assuranceError } =
        await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!isCurrent()) return;
      if (assuranceError || data.currentLevel !== "aal2")
        throw new Error("MFA not verified");
      clearSetup();
      const { data: access, error: accessError } = await client.rpc(
        "clinical_access_check",
      );
      if (!isCurrent()) return;
      if (accessError || access?.authorized !== true) {
        message(
          "El servidor no ha confirmado el acceso. Sal y vuelve a entrar; si continúa, revisaremos la configuración.",
        );
        return;
      }
      await updateFactors(isCurrent);
      if (!isCurrent()) return;
      $("enrollment").hidden = true;
      $("verify").hidden = true;
      $("complete").hidden = false;
      message("Acceso de pruebas autorizado por el servidor.");
    });
  });
  $("add-reserve").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (!active || $("complete").hidden || reserveId) return;
      const { data: access, error: accessError } = await client.rpc(
        "clinical_access_check",
      );
      if (!isCurrent()) return;
      if (accessError || access?.authorized !== true) {
        message(
          "El servidor no ha autorizado la configuración de reserva. Sal y vuelve a entrar.",
        );
        return;
      }
      const { data: factors, error: listError } =
        await client.auth.mfa.listFactors();
      if (!isCurrent()) return;
      if (listError) throw listError;
      const verified = factors.totp.filter((f) => f.status === "verified");
      renderFactors(verified);
      if (verified.length !== 1) {
        message(
          "Ya hay varios autenticadores o falta el principal. Revisa el acceso antes de añadir otro.",
        );
        return;
      }
      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `MLREHAB reserva ${crypto.randomUUID().slice(0, 6)}`,
      });
      if (!isCurrent()) return;
      if (error) throw error;
      const src = qrSource(data.totp.qr_code);
      reserveId = data.id;
      $("reserve-qr").src = src;
      $("reserve-secret").textContent = data.totp.secret;
      $("complete").hidden = true;
      $("reserve").hidden = false;
      message(
        "Añade este autenticador en tu segundo dispositivo y confirma su código.",
      );
    }),
  );
  $("verify-reserve").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async (isCurrent) => {
      if (!active || !reserveId) return;
      const code = $("reserve-code").value;
      $("reserve-code").value = "";
      if (!/^[0-9]{6}$/.test(code)) return;
      const { error } = await client.auth.mfa.challengeAndVerify({
        factorId: reserveId,
        code,
      });
      if (!isCurrent()) return;
      if (error) {
        message(
          "Código de reserva no verificado. Prueba un código nuevo de tu segundo dispositivo.",
        );
        return;
      }
      clearReserve();
      $("reserve").hidden = true;
      const { data: access, error: accessError } = await client.rpc(
        "clinical_access_check",
      );
      if (!isCurrent()) return;
      if (accessError || access?.authorized !== true) {
        message(
          "El autenticador se ha verificado, pero falta confirmar el permiso del servidor. Sal y vuelve a entrar.",
        );
        return;
      }
      await updateFactors(isCurrent);
      if (!isCurrent()) return;
      $("complete").hidden = false;
      message(
        "Autenticador de reserva verificado. En el próximo acceso podrás elegirlo.",
      );
    });
  });

  async function probeAccess(token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/clinical_access_check`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          signal: controller.signal,
        },
      );
      return { status: response.status, body: await response.json() };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  $("test-revoke").addEventListener("click", () =>
    run(async (isCurrent) => {
      if (!active || $("complete").hidden) return;
      const { data, error } = await client.auth.getSession();
      if (!isCurrent()) return;
      let token = data?.session?.access_token;
      if (error || !token) {
        message(
          "La sesión ha terminado. Sal y vuelve a entrar para hacer la prueba.",
        );
        return;
      }
      // Lock before sign-out so its SIGNED_OUT event cannot reopen a login form mid-test.
      active = false;
      client.auth.stopAutoRefresh();
      for (const id of ["complete", "login", "logout"]) $(id).hidden = true;
      $("closed").hidden = false;
      $("restart").hidden = true;
      message("Comprobando acceso y cerrando esta sesión…");
      let timeout;
      try {
        // Use exactly the same token before and after logout. Never store or display it.
        const before = await probeAccess(token);
        const logout = await Promise.race([
          client.auth.signOut({ scope: "local" }),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Timeout")), 10000);
          }),
        ]);
        if (!isCurrent()) return;
        if (
          before?.status !== 200 ||
          before.body?.authorized !== true ||
          logout.error
        ) {
          message(
            "No se pudo verificar el cierre. Comprueba la conexión y vuelve a entrar para repetir la prueba.",
          );
          return;
        }
        const after = await probeAccess(token);
        if (!isCurrent()) return;
        if (
          [401, 403].includes(after?.status) &&
          after.body?.code === "42501"
        ) {
          message(
            "Cierre seguro verificado: la sesión anterior ya no permite acceder.",
          );
        } else if (after?.status === 200 && after.body?.authorized === true) {
          message(
            "La sesión anterior sigue autorizada. La prueba ha fallado; el uso clínico sigue bloqueado.",
          );
        } else {
          message(
            "No se pudo verificar el cierre. Comprueba la conexión y vuelve a entrar para repetir la prueba.",
          );
        }
      } catch {
        if (isCurrent())
          message(
            "No se pudo verificar el cierre. Comprueba la conexión y vuelve a entrar para repetir la prueba.",
          );
      } finally {
        token = null;
        clearTimeout(timeout);
        clearSetup();
        if (isCurrent()) $("restart").hidden = false;
      }
    }),
  );
  $("restart").addEventListener("click", () => location.reload());
  $("logout").addEventListener("click", () => exit("Cerrando sesión…"));
  client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && active) {
      reset();
      message("La sesión ha terminado. Vuelve a entrar.");
    }
  });
  function checkIdle() {
    if (active && Date.now() - lastActivity >= idleMs)
      exit("Sesión cerrada por inactividad.");
  }
  for (const event of ["pointerdown", "keydown"])
    document.addEventListener(
      event,
      () => {
        checkIdle();
        lastActivity = Date.now();
      },
      { passive: true },
    );
  document.addEventListener("visibilitychange", checkIdle);
  setInterval(checkIdle, 15000);
}
