
"use strict";

// =====================================
// TIMIDY STORE — ADMIN PROFILE
// Private Supabase Storage Avatars
// =====================================

document.addEventListener("DOMContentLoaded", () => {
  const db = window.timidySupabase;

  const BUCKET = "admin-avatars";
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

  const DEFAULT_AVATAR =
    "images/admin-profile.jpg";

  const avatarButtons =
    document.querySelectorAll(
      ".admin-avatar-button"
    );

  const connections =
    document.querySelectorAll(
      ".admin-connection"
    );

  const preview =
    document.getElementById(
      "profilePreview"
    );

  const previewContent =
    preview?.querySelector(
      ".profile-preview-content"
    );

  const previewImage =
    preview?.querySelector(
      ".profile-preview-image"
    );

  const closeButton =
    preview?.querySelector(
      ".profile-preview-close"
    );

  let lastFocusedButton = null;
  let uploadBusy = false;
  let currentUserId = null;
  let avatarObjectUrl = null;
  let avatarRequestId = 0;

  // =====================================
  // CONNECTION STATUS
  // =====================================

  function updateConnection() {
    const online = navigator.onLine;

    connections.forEach(connection => {
      connection.classList.toggle(
        "is-offline",
        !online
      );

      const label =
        connection.querySelector(
          ".connection-label"
        );

      if (label) {
        label.textContent = online
          ? "Online"
          : "Offline";
      }
    });

    avatarButtons.forEach(button => {
      button.classList.toggle(
        "is-offline",
        !online
      );
    });
  }

  updateConnection();

  window.addEventListener(
    "online",
    updateConnection
  );

  window.addEventListener(
    "offline",
    updateConnection
  );

  // =====================================
  // UPDATE ALL PROFILE IMAGES
  // =====================================

  function updateAvatarImages(src) {
    const images =
      document.querySelectorAll(
        ".admin-avatar, .profile-preview-image"
      );

    images.forEach(image => {
      image.src = src;
    });
  }

  function revokePreviousObjectUrl() {
    if (avatarObjectUrl) {
      URL.revokeObjectURL(
        avatarObjectUrl
      );

      avatarObjectUrl = null;
    }
  }

  function showAvatarBlob(blob) {
    const url =
      URL.createObjectURL(blob);

    updateAvatarImages(url);

    revokePreviousObjectUrl();

    avatarObjectUrl = url;
  }

  // =====================================
  // PREVIEW CONTROLS
  // =====================================

  let changeButton = null;
  let fileInput = null;
  let uploadStatus = null;

  if (previewContent && previewImage) {
    // Create controls inside the
    // enlarged preview only.

    const controls =
      document.createElement("div");

    controls.className =
      "profile-photo-controls";

    changeButton =
      document.createElement("button");

    changeButton.type = "button";
    changeButton.className =
      "profile-change-photo";

    changeButton.textContent =
      "Change Photo";

    changeButton.disabled = true;

    fileInput =
      document.createElement("input");

    fileInput.type = "file";

    fileInput.accept =
      "image/jpeg,image/png,image/webp";

    fileInput.hidden = true;

    fileInput.setAttribute(
      "aria-label",
      "Choose a new administrator profile photo"
    );

    uploadStatus =
      document.createElement("p");

    uploadStatus.className =
      "profile-upload-status";

    uploadStatus.setAttribute(
      "role",
      "status"
    );

    uploadStatus.setAttribute(
      "aria-live",
      "polite"
    );

    controls.appendChild(
      changeButton
    );

    controls.appendChild(
      fileInput
    );

    controls.appendChild(
      uploadStatus
    );

    previewContent.appendChild(
      controls
    );
  }

  function setUploadStatus(
    text,
    isError = false
  ) {
    if (!uploadStatus) return;

    uploadStatus.textContent = text;

    uploadStatus.classList.toggle(
      "is-error",
      isError
    );
  }

  function setUploadBusy(value) {
    uploadBusy = value;

    if (changeButton) {
      changeButton.disabled =
        value || !currentUserId;

      changeButton.textContent = value
        ? "Uploading..."
        : "Change Photo";
    }
  }

  // =====================================
  // OPEN PROFILE PREVIEW
  // =====================================

  function openPreview(button) {
    if (!preview) return;

    lastFocusedButton = button;

    preview.hidden = false;

    preview.setAttribute(
      "aria-hidden",
      "false"
    );

    document.body.style.overflow =
      "hidden";

    setUploadStatus("");

    closeButton?.focus();
  }

  // =====================================
  // CLOSE PROFILE PREVIEW
  // =====================================

  function closePreview() {
    if (
      !preview ||
      preview.hidden ||
      uploadBusy
    ) {
      return;
    }

    preview.hidden = true;

    preview.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.style.overflow = "";

    lastFocusedButton?.focus();
  }

  avatarButtons.forEach(button => {
    button.addEventListener(
      "click",
      () => openPreview(button)
    );
  });

  closeButton?.addEventListener(
    "click",
    closePreview
  );

  preview?.addEventListener(
    "click",
    event => {
      if (event.target === preview) {
        closePreview();
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (event.key === "Escape") {
        closePreview();
      }
    }
  );

  // =====================================
  // STORAGE PATH
  // =====================================

  function avatarPath(userId) {
    return `${userId}/profile`;
  }

  // =====================================
  // LOAD SAVED AVATAR
  // =====================================

  async function loadSavedAvatar() {
    if (!db) {
      console.error(
        "Supabase client is unavailable."
      );

      return;
    }

    const requestId =
      ++avatarRequestId;

    try {
      const user =
        await window.TimidyAuth
          .getAuthorizedUser();

      if (!user) return;

      currentUserId = user.id;

      if (changeButton) {
        changeButton.disabled =
          uploadBusy;
      }

      const { data, error } =
        await db.storage
          .from(BUCKET)
          .download(
            avatarPath(user.id)
          );

      if (requestId !== avatarRequestId) {
        return;
      }

      if (error) {
        // No uploaded avatar yet:
        // keep the existing local photo.
        console.info(
          "Using default profile picture."
        );

        return;
      }

      if (data) {
        showAvatarBlob(data);
      }
    } catch (error) {
      console.error(
        "Unable to load profile photo:",
        error
      );
    }
  }

  // =====================================
  // VALIDATE SELECTED IMAGE
  // =====================================

  function validatePhoto(file) {
    if (!file) {
      throw new Error(
        "Please select an image."
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error(
        "Choose a JPG, PNG, or WebP image."
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        "The photo must be 5 MB or smaller."
      );
    }

    if (file.size === 0) {
      throw new Error(
        "The selected image is empty."
      );
    }
  }

  // =====================================
  // UPLOAD NEW PHOTO
  // =====================================

  async function uploadProfilePhoto(file) {
    if (uploadBusy) return;

    try {
      validatePhoto(file);
    } catch (error) {
      setUploadStatus(
        error.message,
        true
      );

      return;
    }

    setUploadBusy(true);

    setUploadStatus(
      "Uploading your new photo..."
    );

    try {
      if (!db) {
        throw new Error(
          "Supabase is not configured."
        );
      }

      const user =
        await window.TimidyAuth
          .getAuthorizedUser();

      if (!user) {
        throw new Error(
          "Administrator session expired."
        );
      }

      currentUserId = user.id;

      // Fixed path means a new upload
      // replaces the previous photo.
      const path =
        avatarPath(user.id);

      const { error } =
        await db.storage
          .from(BUCKET)
          .upload(
            path,
            file,
            {
              upsert: true,
              contentType: file.type,
              cacheControl: "60"
            }
          );

      if (error) {
        throw error;
      }

      // Invalidate an older avatar read
      // so it cannot overwrite this upload.
      ++avatarRequestId;

      // Show the newly selected photo
      // immediately after the server
      // confirms the upload.
      showAvatarBlob(file);

      setUploadStatus(
        "Profile photo updated successfully."
      );
    } catch (error) {
      console.error(
        "Profile photo upload failed:",
        error
      );

      setUploadStatus(
        "Unable to update photo: " +
        (error.message || "Unknown error"),
        true
      );
    } finally {
      setUploadBusy(false);
    }
  }

  // =====================================
  // CHANGE PHOTO BUTTON
  // =====================================

  changeButton?.addEventListener(
    "click",
    () => {
      if (
        uploadBusy ||
        !currentUserId
      ) {
        return;
      }

      fileInput?.click();
    }
  );

  fileInput?.addEventListener(
    "change",
    async () => {
      const file =
        fileInput.files?.[0];

      // Allow selecting the same file
      // again after a failed upload.
      fileInput.value = "";

      if (!file) return;

      await uploadProfilePhoto(file);
    }
  );

  // =====================================
  // INITIALIZE
  // =====================================

  loadSavedAvatar();

  window.addEventListener(
    "pagehide",
    revokePreviousObjectUrl,
    { once: true }
  );
});
