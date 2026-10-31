
"use strict";

// =====================================
// TIMIDY STORE — SUPABASE SETTINGS
// Optimized Settings Module
// =====================================

const settingsDb = window.timidySupabase;

if (!settingsDb) {
  throw new Error("Supabase is not configured.");
}

const settingsEl = id =>
  document.getElementById(id);

const SETTINGS_BACKUP_VERSION = 2;
const SETTINGS_REFRESH_INTERVAL = 60 * 1000;

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
let passwordBusy = false;
let settingsInitialized = false;

let lastSystemInfoRefresh = 0;
let systemInfoPromise = null;
let profileLoadPromise = null;

// =====================================
// HELPERS
// =====================================

function settingsErrorText(error) {
  return error?.message || "Unknown error";
}

function settingsMessage(
  text,
  type = "success"
) {
  const message = settingsEl(
    "settingsMessage"
  );

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
  const message = settingsEl(
    "passwordMessage"
  );

  if (!message) return;

  message.textContent = text;

  message.style.color = isError
    ? "#dc2626"
    : "#16a34a";
}

function setSettingsBusy(value) {
  settingsBusy = value;

  const profileButton = settingsEl(
    "businessProfileForm"
  )?.querySelector('[type="submit"]');

  const backupButton = settingsEl(
    "backupData"
  );

  if (profileButton) {
    profileButton.disabled = value;
  }

  if (backupButton) {
    backupButton.disabled = value;
  }
}

// =====================================
// ADMIN AUTHORIZATION
// =====================================

async function requireSettingsAdmin() {
  const user =
    await window.TimidyAuth.getAuthorizedUser();

  if (!user) {
    window.location.replace(
      "login.html"
    );

    throw new Error(
      "Administrator session expired."
    );
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

  // Timidy Store operates in TZS.
  settingsEl("businessCurrency").value =
    "TZS";
}

// Deduplicate overlapping profile reads.

async function loadBusinessProfile() {
  if (profileLoadPromise) {
    return profileLoadPromise;
  }

  const request = (async () => {
    const { data, error } =
      await settingsDb
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

    populateBusinessProfile(
      currentProfile
    );
  })();

  profileLoadPromise = request;

  try {
    return await request;
  } finally {
    if (profileLoadPromise === request) {
      profileLoadPromise = null;
    }
  }
}

// =====================================
// SAVE BUSINESS PROFILE
// =====================================

async function saveBusinessProfile(event) {
  event.preventDefault();

  if (settingsBusy) return;

  const profile = {
    name: settingsEl(
      "businessName"
    ).value.trim(),

    owner: settingsEl(
      "businessOwner"
    ).value.trim(),

    phone: settingsEl(
      "businessPhone"
    ).value.trim(),

    email: settingsEl(
      "businessEmail"
    ).value.trim(),

    location: settingsEl(
      "businessLocation"
    ).value.trim(),

    currency: "TZS",

    updated_at:
      new Date().toISOString()
  };

  if (!profile.name || !profile.owner) {
    settingsMessage(
      "Business name and owner are required.",
      "error"
    );

    return;
  }

  setSettingsBusy(true);

  let committed = false;

  try {
    await requireSettingsAdmin();

    const { data, error } =
      await settingsDb
        .from("business_profile")
        .update(profile)
        .eq("id", 1)
        .select(
          "id,name,owner,phone,email,location,currency"
        )
        .single();

    if (error) throw error;

    committed = true;

    currentProfile = {
      ...DEFAULT_PROFILE,
      ...data,
      currency: "TZS"
    };

    settingsMessage(
      "Business profile saved to Supabase successfully."
    );
  } catch (error) {
    console.error(
      "Unable to save business profile:",
      error
    );

    settingsMessage(
      committed
        ? "Business profile was saved, " +
          "but the page could not finish updating."
        : "Unable to confirm business profile save: " +
          settingsErrorText(error),
      "error"
    );
  } finally {
    setSettingsBusy(false);
  }
}

// =====================================
// DATABASE PAGINATION
// =====================================

// Preserved for complete JSON backups.

async function fetchAllSettingsRows(
  table,
  columns = "*"
) {
  const pageSize = 500;
  const result = [];

  let start = 0;

  while (true) {
    const { data, error } =
      await settingsDb
        .from(table)
        .select(columns)
        .order("id", {
          ascending: true
        })
        .range(
          start,
          start + pageSize - 1
        );

    if (error) {
      throw error;
    }

    const rows = data || [];

    result.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    start += pageSize;
  }

  return result;
}

// =====================================
// SYSTEM INFORMATION
// =====================================

// Count-only queries avoid downloading
// entire tables.
//
// A successful result is cached for
// 60 seconds when revisiting the tab.

async function updateSettingsSystemInfo(
  force = false
) {
  if (systemInfoPromise) {
    return systemInfoPromise;
  }

  if (
    !force &&
    settingsInitialized &&
    Date.now() - lastSystemInfoRefresh <
      SETTINGS_REFRESH_INTERVAL
  ) {
    return;
  }

  const request = (async () => {
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

    if (failed) {
      throw failed.error;
    }

    const ids = [
      "settingsSalesCount",
      "settingsInventoryCount",
      "settingsCustomersCount",
      "settingsExpensesCount",
      "settingsHistoryCount",
      "settingsVoidedCount"
    ];

    results.forEach(
      (result, index) => {
        const target = settingsEl(
          ids[index]
        );

        if (target) {
          target.textContent =
            Number(result.count || 0)
              .toLocaleString("en-TZ");
        }
      }
    );

    lastSystemInfoRefresh = Date.now();
  })();

  systemInfoPromise = request;

  try {
    return await request;
  } catch (error) {
    console.error(
      "Unable to load system information:",
      error
    );

    settingsMessage(
      "Unable to load system information: " +
      settingsErrorText(error),
      "error"
    );

    // Propagate to initialization,
    // but avoid unhandled errors in
    // tab-visibility listeners.
    throw error;
  } finally {
    if (systemInfoPromise === request) {
      systemInfoPromise = null;
    }
  }
}

// =====================================
// BACKUP HELPERS
// =====================================

function settingsDateStamp() {
  const date = new Date();

  return (
    date.getFullYear() +
    "-" +
    String(
      date.getMonth() + 1
    ).padStart(2, "0") +
    "-" +
    String(
      date.getDate()
    ).padStart(2, "0")
  );
}

function downloadSettingsJSON(
  data,
  filename
) {
  const blob = new Blob(
    [
      JSON.stringify(
        data,
        null,
        2
      )
    ],
    {
      type: "application/json"
    }
  );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

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

// =====================================
// BACKUP DOWNLOAD
// =====================================

// Keeps the existing backup structure
// and full pagination.

async function downloadSettingsBackup() {
  if (settingsBusy) return;

  setSettingsBusy(true);

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
      fetchAllSettingsRows(
        "sales"
      ),

      fetchAllSettingsRows(
        "inventory"
      ),

      fetchAllSettingsRows(
        "customers"
      ),

      fetchAllSettingsRows(
        "expenses"
      ),

      fetchAllSettingsRows(
        "stock_history"
      ),

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
      exportedAt:
        new Date().toISOString(),

      records: {
        sales,
        inventory,
        customers,
        expenses,
        stockHistory
      },

      settings: {
        profile: profileResult.data
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
    console.error(
      "Unable to generate backup:",
      error
    );

    settingsMessage(
      "Unable to generate backup: " +
      settingsErrorText(error),
      "error"
    );
  } finally {
    setSettingsBusy(false);
  }
}

// =====================================
// PASSWORD CHANGE
// =====================================

async function changeAdminPassword(event) {
  event.preventDefault();

  if (passwordBusy || settingsBusy) {
    return;
  }

  const form = settingsEl(
    "changePasswordForm"
  );

  const button = settingsEl(
    "changePasswordButton"
  );

  const currentPassword =
    settingsEl(
      "currentPassword"
    ).value;

  const newPassword =
    settingsEl(
      "newPassword"
    ).value;

  const confirmPassword =
    settingsEl(
      "confirmPassword"
    ).value;

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

  passwordBusy = true;
  button.disabled = true;

  try {
    const user =
      await requireSettingsAdmin();

    if (!user.email) {
      throw new Error(
        "No email address is linked to this account."
      );
    }

    // Verify the current password.
    const { error: verifyError } =
      await settingsDb.auth
        .signInWithPassword({
          email: user.email,
          password: currentPassword
        });

    if (verifyError) {
      throw new Error(
        "Current password is incorrect."
      );
    }

    // Update the authenticated account.
    const { error: updateError } =
      await settingsDb.auth
        .updateUser({
          password: newPassword
        });

    if (updateError) {
      throw updateError;
    }

    // Clear cached authorization after
    // changing authentication credentials.
    window.TimidyAuth
      .clearAuthorizationCache?.();

    form.reset();

    passwordMessage(
      "Password changed successfully."
    );

    settingsMessage(
      "Your administrator password has been updated."
    );
  } catch (error) {
    console.error(
      "Unable to change password:",
      error
    );

    passwordMessage(
      settingsErrorText(error),
      true
    );
  } finally {
    passwordBusy = false;
    button.disabled = false;
  }
}

// =====================================
// LOGOUT
// =====================================

async function logoutSettingsAdmin() {
  if (settingsBusy || passwordBusy) {
    return;
  }

  const button = settingsEl(
    "settingsLogout"
  );

  button.disabled = true;

  try {
    // Use the shared auth module so
    // authorization cache is cleared.
    await window.TimidyAuth.logout();
  } catch (error) {
    console.error(
      "Unable to log out:",
      error
    );

    settingsMessage(
      "Unable to log out: " +
      settingsErrorText(error),
      "error"
    );

    button.disabled = false;
  }
}

// =====================================
// INITIALIZATION
// =====================================

async function initializeSettings() {
  const profileForm = settingsEl(
    "businessProfileForm"
  );

  const backupButton = settingsEl(
    "backupData"
  );

  const passwordForm = settingsEl(
    "changePasswordForm"
  );

  const logoutButton = settingsEl(
    "settingsLogout"
  );

  if (profileForm) {
    profileForm.addEventListener(
      "submit",
      saveBusinessProfile
    );
  }

  if (backupButton) {
    backupButton.addEventListener(
      "click",
      downloadSettingsBackup
    );
  }

  if (passwordForm) {
    passwordForm.addEventListener(
      "submit",
      changeAdminPassword
    );
  }

  if (logoutButton) {
    logoutButton.addEventListener(
      "click",
      logoutSettingsAdmin
    );
  }

  try {
    await requireSettingsAdmin();

    // Profile and count requests can
    // run concurrently.
    await Promise.all([
      loadBusinessProfile(),
      updateSettingsSystemInfo()
    ]);

    settingsInitialized = true;
  } catch (error) {
    console.error(
      "Unable to initialize Settings:",
      error
    );

    settingsMessage(
      "Unable to initialize Settings: " +
      settingsErrorText(error),
      "error"
    );
  }

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}

// =====================================
// REFRESH ON BROWSER RESTORE
// =====================================

window.addEventListener(
  "pageshow",
  event => {
    if (
      !event.persisted ||
      !settingsInitialized ||
      settingsBusy ||
      passwordBusy
    ) {
      return;
    }

    updateSettingsSystemInfo()
      .catch(() => {});
  }
);

// =====================================
// REFRESH ON TAB RETURN
// =====================================

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      document.hidden ||
      !settingsInitialized ||
      settingsBusy ||
      passwordBusy
    ) {
      return;
    }

    updateSettingsSystemInfo()
      .catch(() => {});
  }
);

// =====================================
// START
// =====================================

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeSettings,
    { once: true }
  );
} else {
  initializeSettings();
}

