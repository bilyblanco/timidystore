
"use strict";

// =====================================
// TIMIDY STORE - SETTINGS
// =====================================

const SETTINGS_KEYS = {
  sales: "timidy-sales",
  inventory: "timidy-inventory",
  customers: "timidy-customers",
  expenses: "timidy-expenses",
  stockHistory: "timidy-stock-history",
  profile: "timidy-business-profile",
  theme: "timidy-theme"
};

const SETTINGS_BACKUP_VERSION = 1;

const settingsEl = id =>
  document.getElementById(id);

const DEFAULT_PROFILE = {
  name: "Timidy Store",
  owner: "Allan",
  phone: "",
  email: "",
  location: "",
  currency: "TZS"
};

// =====================================
// STORAGE HELPERS
// =====================================

function settingsLoadArray(key) {
  try {
    const data = JSON.parse(
      localStorage.getItem(key)
    );

    return Array.isArray(data)
      ? data
      : [];
  } catch {
    return [];
  }
}

function settingsLoadProfile() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(
        SETTINGS_KEYS.profile
      )
    );

    if (
      !stored ||
      typeof stored !== "object" ||
      Array.isArray(stored)
    ) {
      return { ...DEFAULT_PROFILE };
    }

    return {
      ...DEFAULT_PROFILE,
      ...stored,
      currency: "TZS"
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function settingsMessage(text, type = "success") {
  const message = settingsEl(
    "settingsMessage"
  );

  if (!message) return;

  message.textContent = text;
  message.hidden = false;

  message.className =
    `settings-message ${type}`;
}

// =====================================
// BUSINESS PROFILE
// =====================================

function loadBusinessProfile() {
  const profile = settingsLoadProfile();

  settingsEl("businessName").value =
    profile.name;

  settingsEl("businessOwner").value =
    profile.owner;

  settingsEl("businessPhone").value =
    profile.phone;

  settingsEl("businessEmail").value =
    profile.email;

  settingsEl("businessLocation").value =
    profile.location;

  settingsEl("businessCurrency").value =
    "TZS";
}

function saveBusinessProfile(event) {
  event.preventDefault();

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

    currency: "TZS"
  };

  if (!profile.name || !profile.owner) {
    settingsMessage(
      "Business name and owner are required.",
      "error"
    );
    return;
  }

  try {
    localStorage.setItem(
      SETTINGS_KEYS.profile,
      JSON.stringify(profile)
    );

    settingsMessage(
      "Business profile saved successfully."
    );
  } catch {
    settingsMessage(
      "Unable to save the business profile.",
      "error"
    );
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

  const toggle = settingsEl(
    "themeToggle"
  );

  if (toggle) {
    toggle.textContent = dark
      ? "☀️"
      : "🌙";
  }

  document.querySelectorAll(
    'input[name="settingsTheme"]'
  ).forEach(input => {
    input.checked =
      input.value === theme;
  });
}

function settingsSaveTheme(theme) {
  try {
    localStorage.setItem(
      SETTINGS_KEYS.theme,
      theme
    );

    settingsApplyTheme(theme);
  } catch {
    settingsMessage(
      "Unable to save the theme preference.",
      "error"
    );
  }
}

function initializeSettingsTheme() {
  const theme =
    localStorage.getItem(
      SETTINGS_KEYS.theme
    ) === "dark"
      ? "dark"
      : "light";

  settingsApplyTheme(theme);

  const toggle = settingsEl(
    "themeToggle"
  );

  if (toggle) {
    toggle.addEventListener(
      "click",
      () => {
        const next =
          document.body.classList.contains(
            "dark"
          )
            ? "light"
            : "dark";

        settingsSaveTheme(next);
      }
    );
  }

  document.querySelectorAll(
    'input[name="settingsTheme"]'
  ).forEach(input => {
    input.addEventListener(
      "change",
      () => {
        if (input.checked) {
          settingsSaveTheme(
            input.value
          );
        }
      }
    );
  });
}

// =====================================
// BACKUP
// =====================================

function createSettingsBackup() {
  const records = {};

  [
    "sales",
    "inventory",
    "customers",
    "expenses",
    "stockHistory"
  ].forEach(name => {
    records[name] = settingsLoadArray(
      SETTINGS_KEYS[name]
    );
  });

  return {
    application: "Timidy Store",
    version: SETTINGS_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),

    records,

    settings: {
      profile: settingsLoadProfile(),

      theme:
        localStorage.getItem(
          SETTINGS_KEYS.theme
        ) === "dark"
          ? "dark"
          : "light"
    }
  };
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

  const url = URL.createObjectURL(
    blob
  );

  const anchor = document.createElement(
    "a"
  );

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoke later so the download can start.
  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}

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

function downloadSettingsBackup() {
  try {
    const backup = createSettingsBackup();

    downloadSettingsJSON(
      backup,
      `Timidy-Store-Backup-${settingsDateStamp()}.json`
    );

    settingsMessage(
      "Backup download started. Keep the file somewhere safe."
    );
  } catch {
    settingsMessage(
      "Unable to generate the backup.",
      "error"
    );
  }
}

// =====================================
// RESTORE VALIDATION
// =====================================

function validateSettingsBackup(data) {
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(
      "Invalid backup file format."
    );
  }

  if (
    data.application !== "Timidy Store" ||
    data.version !== SETTINGS_BACKUP_VERSION
  ) {
    throw new Error(
      "This is not a supported Timidy Store backup."
    );
  }

  if (
    !data.records ||
    typeof data.records !== "object" ||
    Array.isArray(data.records)
  ) {
    throw new Error(
      "Backup records are missing."
    );
  }

  const recordNames = [
    "sales",
    "inventory",
    "customers",
    "expenses",
    "stockHistory"
  ];

  recordNames.forEach(name => {
    if (!Array.isArray(data.records[name])) {
      throw new Error(
        `Invalid or missing ${name} records.`
      );
    }

    if (
      !data.records[name].every(
        item =>
          item !== null &&
          typeof item === "object" &&
          !Array.isArray(item)
      )
    ) {
      throw new Error(
        `Invalid entries in ${name} records.`
      );
    }
  });

  if (
    !data.settings ||
    typeof data.settings !== "object" ||
    Array.isArray(data.settings)
  ) {
    throw new Error(
      "Backup settings are missing."
    );
  }

  if (
    !data.settings.profile ||
    typeof data.settings.profile !== "object" ||
    Array.isArray(data.settings.profile)
  ) {
    throw new Error(
      "Business profile is missing."
    );
  }

  if (
    !["light", "dark"].includes(
      data.settings.theme
    )
  ) {
    throw new Error(
      "Invalid theme preference in backup."
    );
  }

  if (
    data.settings.profile.currency !== "TZS"
  ) {
    throw new Error(
      "This backup uses an unsupported currency."
    );
  }

  return true;
}

// =====================================
// RESTORE
// =====================================

function restoreSettingsBackup(data) {
  validateSettingsBackup(data);

  const confirmed = confirm(
    "Restore this Timidy Store backup?\n\n" +
    "Your current sales, inventory, customers, " +
    "expenses, stock history, and settings " +
    "will be replaced.\n\n" +
    "A safety backup will be downloaded first.\n\n" +
    "Continue?"
  );

  if (!confirmed) return;

  // Capture current data before any changes.
  const safetyBackup = createSettingsBackup();

  downloadSettingsJSON(
    safetyBackup,
    `Timidy-Store-Before-Restore-${settingsDateStamp()}.json`
  );

  // Prepare all values before writing.
  const changes = {
    [SETTINGS_KEYS.sales]:
      JSON.stringify(data.records.sales),

    [SETTINGS_KEYS.inventory]:
      JSON.stringify(data.records.inventory),

    [SETTINGS_KEYS.customers]:
      JSON.stringify(data.records.customers),

    [SETTINGS_KEYS.expenses]:
      JSON.stringify(data.records.expenses),

    [SETTINGS_KEYS.stockHistory]:
      JSON.stringify(data.records.stockHistory),

    [SETTINGS_KEYS.profile]:
      JSON.stringify({
        ...DEFAULT_PROFILE,
        ...data.settings.profile,
        currency: "TZS"
      }),

    [SETTINGS_KEYS.theme]:
      data.settings.theme
  };

  // Keep exact previous values for rollback.
  const previous = {};

  Object.keys(changes).forEach(key => {
    previous[key] =
      localStorage.getItem(key);
  });

  const written = [];

  try {
    Object.entries(changes).forEach(
      ([key, value]) => {
        localStorage.setItem(
          key,
          value
        );

        written.push(key);
      }
    );
  } catch (error) {
    // Best-effort rollback if a write fails.
    written.reverse().forEach(key => {
      try {
        if (previous[key] === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(
            key,
            previous[key]
          );
        }
      } catch {
        // Browser storage may be unavailable.
      }
    });

    throw new Error(
      "Restore failed. Previous records were preserved where possible."
    );
  }

  loadBusinessProfile();

  settingsApplyTheme(
    data.settings.theme
  );

  updateSettingsSystemInfo();

  settingsMessage(
    "Backup restored successfully. " +
    "Your store records have been updated."
  );
}

// =====================================
// FILE IMPORT
// =====================================

async function handleSettingsRestore(event) {
  const input = event.target;

  const file = input.files?.[0];

  if (!file) return;

  try {
    if (file.size > 25 * 1024 * 1024) {
      throw new Error(
        "Backup file is too large (maximum 25 MB)."
      );
    }

    const text = await file.text();

    const data = JSON.parse(text);

    restoreSettingsBackup(data);
  } catch (error) {
    settingsMessage(
      error.message ||
      "Unable to restore the backup.",
      "error"
    );
  } finally {
    input.value = "";
  }
}

// =====================================
// SYSTEM INFORMATION
// =====================================

function updateSettingsSystemInfo() {
  const sales = settingsLoadArray(
    SETTINGS_KEYS.sales
  );

  const inventory = settingsLoadArray(
    SETTINGS_KEYS.inventory
  );

  const customers = settingsLoadArray(
    SETTINGS_KEYS.customers
  );

  const expenses = settingsLoadArray(
    SETTINGS_KEYS.expenses
  );

  const history = settingsLoadArray(
    SETTINGS_KEYS.stockHistory
  );

  const voided = sales.filter(
    sale =>
      sale.status === "voided" ||
      sale.voided === true
  );

  settingsEl(
    "settingsSalesCount"
  ).textContent = sales.length;

  settingsEl(
    "settingsInventoryCount"
  ).textContent = inventory.length;

  settingsEl(
    "settingsCustomersCount"
  ).textContent = customers.length;

  settingsEl(
    "settingsExpensesCount"
  ).textContent = expenses.length;

  settingsEl(
    "settingsHistoryCount"
  ).textContent = history.length;

  settingsEl(
    "settingsVoidedCount"
  ).textContent = voided.length;
}

// =====================================
// INITIALIZATION
// =====================================

function initializeSettings() {
  loadBusinessProfile();

  initializeSettingsTheme();

  updateSettingsSystemInfo();

  settingsEl(
    "businessProfileForm"
  ).addEventListener(
    "submit",
    saveBusinessProfile
  );

  settingsEl(
    "backupData"
  ).addEventListener(
    "click",
    downloadSettingsBackup
  );

  settingsEl(
    "restoreFile"
  ).addEventListener(
    "change",
    handleSettingsRestore
  );

  window.addEventListener(
    "pageshow",
    updateSettingsSystemInfo
  );

  window.addEventListener(
    "storage",
    updateSettingsSystemInfo
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
