import { createClient } from "@supabase/supabase-js";

const $ = (id) => document.getElementById(id);
const message = (value) => {
  $("status").textContent = value;
};
let epoch = 0;
let factorId = null;
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
  $("enroll").hidden = false;
  $("login").reset();
  for (const id of ["enrollment", "verify", "complete", "logout"])
    $(id).hidden = true;
  $("login").hidden = false;
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
    document.querySelectorAll("form button, #enroll").forEach((el) => {
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
      document.querySelectorAll("form button, #enroll").forEach((el) => {
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
    if (verified.length) {
      // The initial single-clinician setup uses the first verified authenticator.
      factorId = verified[0].id;
      $("verify").hidden = false;
      message("Introduce el código de tu autenticador.");
    } else {
      $("enrollment").hidden = false;
      message("Falta configurar el segundo factor de la aplicación.");
    }
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
      const svg = data.totp.qr_code;
      if (
        !svg.startsWith("data:image/svg+xml;utf-8,") &&
        !svg.startsWith("<svg")
      )
        throw new Error("Invalid QR");
      factorId = data.id;
      $("qr").src = svg.startsWith("<svg")
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
        : svg;
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
      $("enrollment").hidden = true;
      $("verify").hidden = true;
      $("complete").hidden = false;
      message("Acceso de pruebas autorizado por el servidor.");
    });
  });
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
