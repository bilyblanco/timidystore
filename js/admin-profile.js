
document.addEventListener("DOMContentLoaded", () => {
  const avatarButtons = document.querySelectorAll(
    ".admin-avatar-button"
  );

  const connections = document.querySelectorAll(
    ".admin-connection"
  );

  const preview = document.getElementById("profilePreview");
  const closeButton = preview?.querySelector(
    ".profile-preview-close"
  );

  let lastFocusedButton = null;

  // Update connection indicator
  function updateConnection() {
    const online = navigator.onLine;

    connections.forEach(connection => {
      connection.classList.toggle("is-offline", !online);

      const label = connection.querySelector(
        ".connection-label"
      );

      if (label) {
        label.textContent = online ? "Online" : "Offline";
      }
    });

    avatarButtons.forEach(button => {
      button.classList.toggle("is-offline", !online);
    });
  }

  updateConnection();

  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);

  // Open enlarged profile picture
  function openPreview(button) {
    if (!preview) return;

    lastFocusedButton = button;
    preview.hidden = false;
    preview.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    closeButton?.focus();
  }

  // Close enlarged profile picture
  function closePreview() {
    if (!preview || preview.hidden) return;

    preview.hidden = true;
    preview.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    lastFocusedButton?.focus();
  }

  avatarButtons.forEach(button => {
    button.addEventListener("click", () => {
      openPreview(button);
    });
  });

  closeButton?.addEventListener("click", closePreview);

  preview?.addEventListener("click", event => {
    if (event.target === preview) {
      closePreview();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closePreview();
    }
  });
});
