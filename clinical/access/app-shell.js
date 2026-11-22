import { isClinicalMode } from "./data-mode.js";

const $ = (id) => document.getElementById(id);
const titles = {
  home: "Inicio",
  agenda: "Agenda",
  patients: "Pacientes",
  exercises: "Ejercicios",
  backups: "Copias",
  access: "Acceso y seguridad",
};

// Navigation only changes visibility. Drafts stay mounted until saved or discarded.
// No route, browser storage, automatic data request or patient name is needed.
export function installAppShell({ isAuthorized }) {
  let currentPage = "home";
  let wasOpen = false;
  const recovery = document.body.dataset.recovery === "true";
  function selectPage(page, focus = false) {
    if (!Object.hasOwn(titles, page)) return;
    currentPage = page;
    for (const view of document.querySelectorAll("[data-app-view]"))
      view.hidden = view.dataset.appView !== page;
    for (const button of document.querySelectorAll("[data-app-page]")) {
      if (button.dataset.appPage === page)
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    $("workspace-title").textContent = titles[page];
    document.title = isAuthorized()
      ? `${titles[page]} · MLREHAB${recovery ? " · Recuperación" : ""}`
      : `MLREHAB Manager${recovery ? " · Recuperación" : " · Consulta"}`;
    if (focus) {
      $("workspace-title").focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }
  function updateSummary() {
    const count = $("patient-count").textContent.match(/^(\d+)/u);
    $("home-patients").textContent = count ? count[1] : "Sin cargar";
    const loaded = $("agenda-loaded-day").textContent.trim();
    $("home-appointments").textContent = loaded
      ? ($("agenda-list").dataset.weekdayCount ??
        String($("agenda-list").children.length))
      : "Sin cargar";
    $("home-agenda-day").textContent =
      loaded || "Abre la agenda y elige una semana.";
  }
  function updateLayout() {
    const open = isAuthorized();
    document.body.classList.toggle("is-authorized", open);
    const statusParent = $(open ? "app-feedback" : "auth-feedback");
    const logoutParent = $(open ? "app-logout" : "auth-logout");
    if ($("status").parentElement !== statusParent)
      statusParent.append($("status"));
    if ($("logout").parentElement !== logoutParent)
      logoutParent.append($("logout"));
    if (wasOpen !== open) selectPage("home");
    wasOpen = open;
    $("app-mode").textContent = isClinicalMode()
      ? "Consulta privada"
      : "Datos ficticios";
    $("app-recovery-label").hidden = !recovery;
    updateSummary();
  }
  for (const button of document.querySelectorAll("[data-app-page]"))
    button.addEventListener("click", () => {
      if (isAuthorized()) selectPage(button.dataset.appPage, true);
    });
  new MutationObserver(updateLayout).observe($("complete"), {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  const summaryObserver = new MutationObserver(updateSummary);
  for (const id of ["patient-count", "agenda-loaded-day", "agenda-list"])
    summaryObserver.observe($(id), { childList: true, subtree: true });
  document.addEventListener("mlrehab:mode", () => {
    updateLayout();
    selectPage(currentPage);
  });
  selectPage("home");
  updateLayout();
}
