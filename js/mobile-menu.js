
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("mobileMenuToggle");
  const menu = document.getElementById("mobileNavigation");

  if (!toggle || !menu) return;

  function closeMenu() {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute(
      "aria-label", "Open navigation menu"
    );
  }

  toggle.addEventListener("click", event => {
    event.stopPropagation();

    const opening = menu.hidden;
    menu.hidden = !opening;

    toggle.setAttribute(
      "aria-expanded", String(opening)
    );

    toggle.setAttribute(
      "aria-label",
      opening ? "Close navigation menu" : "Open navigation menu"
    );
  });

  document.addEventListener("click", event => {
    if (!menu.contains(event.target) &&
        !toggle.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  menu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMenu);
  });
});
