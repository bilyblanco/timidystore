
"use strict";

// =====================================
// TIMIDY STORE — SUPABASE SETTINGS
// =====================================

const settingsDb = window.timidySupabase;

if (!settingsDb) {
  throw new Error("Supabase is not configured.");
}

const settingsEl = id =>
  document.getElementById(id);

const SETTINGS_BACKUP_VERSION = 2;

const DEFAULT_PROFILE = {
  name: "Timidy Store",
  owner: "Allan",
  phone: "",
  email: "",
  location: "",
  currency: "TZS"
};

let currentProfile = {
  ...DEFAULT_PROFILE
};

let settingsBusy = false;

// =====================================
// MESSAGES
// =====================================

function settingsMessage(
  text,
  type = "success"
) {
  const message = settingsEl("settingsMessage");

  if (!message) return;

  message.textContent = text;
  message.hidden = false;
  message.className =
    `settings-message ${type}`;
}

function passwordMessage(
  text,
  isError = false
) {
  const message = settingsEl("passwordMessage");

  if (!message) return;

  message.textContent = text;
  message.style.color = isError
    ? "#dc2626"
    : "#16a34a";
}

// =====================================
// ADMIN AUTHORIZATION
// =====================================

async function requireSettingsAdmin() {
  const user =
    await window.TimidyAuth.getAuthorizedUser();

  if (!user) {
    window.location.replace("login.html");
    throw new Error("Administrator session expired.");
  }

  return user;
}

// =====================================
// BUSINESS PROFILE
// =====================================

function populateBusinessProfile(profile) {
  settingsEl("businessName").value =
    profile.name || "";

  settingsEl("businessOwner").value =
    profile.owner || "";

  settingsEl("businessPhone").value =
    profile.phone || "";

  settingsEl("businessEmail").value =
    profile.email || "";

  settingsEl("businessLocation").value =
    profile.location || "";

  settingsEl("businessCurrency").value = "TZS";
}

async function loadBusinessProfile() {
  const { data, error } = await settingsDb
    .from("business_profile")
    .select(
      "id,name,owner,phone,email,location,currency"
    )
    .eq("id", 1)
    .single();

  if (error) throw error;

  currentProfile = {
    ...DEFAULT_PROFILE,
    ...data,
    currency: "TZS"
  };

  populateBusinessProfile(currentProfile);
}

async function saveBusinessProfile(event) {
  event.preventDefault();

  if (settingsBusy) return;

  const profile = {
    name: settingsEl("businessName").value.trim(),
    owner: settingsEl("businessOwner").value.trim(),
    phone: settingsEl("businessPhone").value.trim(),
    email: settingsEl("businessEmail").value.trim(),
    location: settingsEl("businessLocation").value.trim(),
    currency: "TZS",
    updated_at: new Date().toISOString()
  };

  if (!profile.name || !profile.owner) {
    settingsMessage(
      "Business name and owner are required.",
      "error"
    );
    return;
  }

  settingsBusy = true;

  const button = settingsEl(
    "businessProfileForm"
  ).querySelector('[type="submit"]');

  button.disabled = true;

  try {
    await requireSettingsAdmin();

    const { data, error } = await settingsDb
      .from("business_profile")
      .update(profile)
      .eq("id", 1)
      .select(
        "id,name,owner,phone,email,location,currency"
      )
      .single();

    if (error) throw error;

    currentProfile = {
      ...DEFAULT_PROFILE,
      ...data
    };

    settingsMessage(
      "Business profile saved to Supabase successfully."
    );
  } catch (error) {
    settingsMessage(
      "Unable to save business profile: " +
      (error.message || "Unknown error"),
      "error"
    );
  } finally {
    settingsBusy = false;
    button.disabled = false;
  }
}

// =====================================
// APPEARANCE
// =====================================

function settingsApplyTheme(theme) {
  const dark = theme === "dark";

  document.documentElement.classList.toggle(
    "dark",
    dark
  );

  document.body.classList.toggle(
    "dark",
    dark
  );

  const toggle = settingsEl("themeToggle");

  if (toggle) {
    toggle.textContent = dark ? "☀️" : "🌙";
  }

  document.querySelectorAll(
    'input[name="settingsTheme"]'
  ).forEach(input => {
    input.checked = input.value === theme;
  });
}

function settingsSaveTheme(theme) {
  localStorage.setItem(
    "timidy-theme",
    theme
  );

  settingsApplyTheme(theme);
}

function initializeSettingsTheme() {
  const theme =
    localStorage.getItem("timidy-theme") === "dark"
      ? "dark"
      : "light";

  settingsApplyTheme(theme);

  settingsEl("themeToggle")?.addEventListener(
    "click",
    () => {
      const next =
        document.body.classList.contains("dark")
          ? "light"
          : "dark";

      settingsSaveTheme(next);
    }
  );

  document.querySelectorAll(
    'input[name="settingsTheme"]'
  ).forEach(input => {
    input.addEventListener("change", () => {
      if (input.checked) {
        settingsSaveTheme(input.value);
      }
    });
  });
}

// =====================================
// DATABASE PAGINATION
// =====================================

async function fetchAllSettingsRows(
  table,
  columns = "*"
) {
  const pageSize = 500;
  const result = [];

  let start = 0;

  while (true) {
    const { data, error } = await settingsDb
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(
        start,
        start + pageSize - 1
      );

    if (error) throw error;

    const rows = data || [];

    result.push(...rows);

    if (rows.length < pageSize) break;

    start += pageSize;
  }

  return result;
}

// =====================================
// SYSTEM INFORMATION
// =====================================

async function updateSettingsSystemInfo() {
  try {
    await requireSettingsAdmin();

    const [
      salesResult,
      inventoryResult,
      customersResult,
      expensesResult,
      historyResult,
      voidedResult
    ] = await Promise.all([
      settingsDb
        .from("sales")
        .select("*", {
          count: "exact",
          head: true
        }),

      settingsDb
        .from("inventory")
        .select("*", {
          count: "exact",
          head: true
        }),

      settingsDb
        .from("customers")
        .select("*", {
          count: "exact",
          head: true
        }),

      settingsDb
        .from("expenses")
        .select("*", {
          count: "exact",
          head: true
        }),

      settingsDb
        .from("stock_history")
        .select("*", {
          count: "exact",
          head: true
        }),

      settingsDb
        .from("sales")
        .select("*", {
          count: "exact",
          head: true
        })
        .eq("status", "voided")
    ]);

    const results = [
      salesResult,
      inventoryResult,
      customersResult,
      expensesResult,
      historyResult,
      voidedResult
    ];

    const failed = results.find(
      result => result.error
    );

    if (failed) throw failed.error;

    const ids = [
      "settingsSalesCount",
      "settingsInventoryCount",
      "settingsCustomersCount",
      "settingsExpensesCount",
      "settingsHistoryCount",
      "settingsVoidedCount"
    ];

    results.forEach((result, index) => {
      settingsEl(ids[index]).textContent =
        Number(result.count || 0)
          .toLocaleString("en-TZ");
    });
  } catch (error) {
    console.error(error);

    settingsMessage(
      "Unable to load system information: " +
      (error.message || "Unknown error"),
      "error"
    );
  }
}

// =====================================
// BACKUP DOWNLOAD
// =====================================

function settingsDateStamp() {
  const date = new Date();

  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}

function downloadSettingsJSON(data, filename) {
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}

async function downloadSettingsBackup() {
  if (settingsBusy) return;

  settingsBusy = true;

  const button = settingsEl("backupData");
  button.disabled = true;

  try {
    await requireSettingsAdmin();

    settingsMessage(
      "Preparing Supabase backup..."
    );

    const [
      sales,
      inventory,
      customers,
      expenses,
      stockHistory,
      profileResult
    ] = await Promise.all([
      fetchAllSettingsRows("sales"),
      fetchAllSettingsRows("inventory"),
      fetchAllSettingsRows("customers"),
      fetchAllSettingsRows("expenses"),
      fetchAllSettingsRows("stock_history"),

      settingsDb
        .from("business_profile")
        .select(
          "name,owner,phone,email,location,currency"
        )
        .eq("id", 1)
        .single()
    ]);

    if (profileResult.error) {
      throw profileResult.error;
    }

    const backup = {
      application: "Timidy Store",
      version: SETTINGS_BACKUP_VERSION,
      source: "supabase",
      exportedAt: new Date().toISOString(),

      records: {
        sales,
        inventory,
        customers,
        expenses,
        stockHistory
      },

      settings: {
        profile: profileResult.data,
        theme:
          localStorage.getItem("timidy-theme") === "dark"
            ? "dark"
            : "light"
      }
    };

    downloadSettingsJSON(
      backup,
      `Timidy-Store-Backup-${settingsDateStamp()}.json`
    );

    settingsMessage(
      "Supabase backup downloaded successfully. " +
      "Keep it somewhere secure."
    );
  } catch (error) {
    settingsMessage(
      "Unable to generate backup: " +
      (error.message || "Unknown error"),
      "error"
    );
  } finally {
    settingsBusy = false;
    button.disabled = false;
  }
}

// =====================================
// PASSWORD CHANGE
// =====================================

async function changeAdminPassword(event) {
  event.preventDefault();

  const form = settingsEl(
    "changePasswordForm"
  );

  const button = settingsEl(
    "changePasswordButton"
  );

  const currentPassword =
    settingsEl("currentPassword").value;

  const newPassword =
    settingsEl("newPassword").value;

  const confirmPassword =
    settingsEl("confirmPassword").value;

  if (newPassword.length < 12) {
    passwordMessage(
      "Use a password with at least 12 characters.",
      true
    );
    return;
  }

  if (newPassword !== confirmPassword) {
    passwordMessage(
      "New passwords do not match.",
      true
    );
    return;
  }

  if (newPassword === currentPassword) {
    passwordMessage(
      "Choose a different password.",
      true
    );
    return;
  }

  button.disabled = true;

  try {
    const user = await requireSettingsAdmin();

    if (!user.email) {
      throw new Error(
        "No email address is linked to this account."
      );
    }

    // Verify the existing password using
    // Supabase Auth before changing it.
    const { error: verifyError } =
      await settingsDb.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      });

    if (verifyError) {
      throw new Error(
        "Current password is incorrect."
      );
    }

    const { error: updateError } =
      await settingsDb.auth.updateUser({
        password: newPassword
      });

    if (updateError) throw updateError;

    form.reset();

    passwordMessage(
      "Password changed successfully."
    );

    settingsMessage(
      "Your administrator password has been updated."
    );
  } catch (error) {
    passwordMessage(
      error.message ||
      "Unable to change password.",
      true
    );
  } finally {
    button.disabled = false;
  }
}

// =====================================
// LOGOUT
// =====================================

async function logoutSettingsAdmin() {
  const button = settingsEl(
    "settingsLogout"
  );

  button.disabled = true;

  try {
    const { error } =
      await settingsDb.auth.signOut();

    if (error) throw error;

    window.location.replace("login.html");
  } catch (error) {
    settingsMessage(
      "Unable to log out: " +
      (error.message || "Unknown error"),
      "error"
    );

    button.disabled = false;
  }
}

// =====================================
// INITIALIZATION
// =====================================

async function initializeSettings() {
  initializeSettingsTheme();

  settingsEl("businessProfileForm")
    .addEventListener(
      "submit",
      saveBusinessProfile
    );

  settingsEl("backupData")
    .addEventListener(
      "click",
      downloadSettingsBackup
    );

  settingsEl("changePasswordForm")
    .addEventListener(
      "submit",
      changeAdminPassword
    );

  settingsEl("settingsLogout")
    .addEventListener(
      "click",
      logoutSettingsAdmin
    );

  try {
    await requireSettingsAdmin();

    await Promise.all([
      loadBusinessProfile(),
      updateSettingsSystemInfo()
    ]);
  } catch (error) {
    console.error(error);

    settingsMessage(
      "Unable to initialize Settings: " +
      (error.message || "Unknown error"),
      "error"
    );
  }

  window.addEventListener(
    "pageshow",
    () => {
      updateSettingsSystemInfo();
    }
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        updateSettingsSystemInfo();
      }
    }
  );

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeSettings
  );
} else {
  initializeSettings();
}

