const systemColorScheme = window.matchMedia(
  "(prefers-color-scheme: dark)"
);

function applySystemColorScheme() {
  const isDark = systemColorScheme.matches;

  document.documentElement.classList.toggle(
    "dark",
    isDark
  );

  if (document.body) {
    document.body.classList.toggle("dark", isDark);
  }
}

applySystemColorScheme();

document.addEventListener(
  "DOMContentLoaded",
  applySystemColorScheme,
  { once: true }
);

systemColorScheme.addEventListener(
  "change",
  () => {
    applySystemColorScheme();
    window.dispatchEvent(
      new Event("timidy-theme-change")
    );
  }
);
