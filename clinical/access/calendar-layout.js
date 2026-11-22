const $ = (id) => document.getElementById(id);
let scheduled = false;
export function fitCalendar() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if ($("complete").hidden || $("agenda-panel").hidden) return;
    // The keyboard should not resize the week while a clinician is writing notes.
    if (
      !$("agenda-editor").hidden &&
      $("agenda-editor").contains(document.activeElement)
    )
      return;
    const calendar = $("agenda-week"),
      table = $("agenda-calendar");
    if (!table) return;
    const height = window.visualViewport?.height ?? window.innerHeight;
    const top = calendar.getBoundingClientRect().top + window.scrollY;
    const navigation = document.querySelector(".app-navigation");
    const bottom =
      getComputedStyle(navigation).position === "fixed"
        ? navigation.getBoundingClientRect().height
        : 0;
    const header = table.tHead.getBoundingClientRect().height || 36;
    const row = Math.max(
      44,
      Math.floor((height - top - bottom - 12 - header) / 11),
    );
    calendar.style.setProperty("--agenda-row-height", `${row}px`);
    calendar.style.setProperty("--agenda-header-height", `${header}px`);
    calendar.style.setProperty(
      "--agenda-fit-height",
      `${header + row * 11 + 2}px`,
    );
  });
}
export function installCalendarLayout() {
  const observer = new ResizeObserver(fitCalendar);
  for (const id of [
    "agenda-toolbar",
    "agenda-meta",
    "app-feedback",
    "environment-notice",
  ])
    observer.observe($(id));
  observer.observe(document.querySelector(".workspace-header"));
  window.addEventListener("resize", fitCalendar);
  window.visualViewport?.addEventListener("resize", fitCalendar);
  document.addEventListener("mlrehab:view", fitCalendar);
  new MutationObserver(fitCalendar).observe($("agenda-week"), {
    childList: true,
  });
}
