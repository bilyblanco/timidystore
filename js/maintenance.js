"use strict";

// ===========================================
// TIMIDY STORE — DEVELOPER MAINTENANCE
// ===========================================
//
// Separate from Allan's administrator pages.
// Uses server-side maintenance authorization.
// Never queries business tables.
//
// ===========================================

(() => {
  const db = window.timidySupabase;

  const el = id =>
    document.getElementById(id);

  const loadingScreen =
    el("loadingScreen");

  const app =
    el("maintenanceApp");

  const message =
    el("maintenanceMessage");

  const refreshButton =
    el("refreshButton");

  const logoutButton =
    el("logoutButton");

  const passwordForm =
    el("passwordForm");

  let authorized = false;
  let busy = false;

  const settingIds = {
    diagnostic_mode: "diagnosticMode",
    verbose_client_logging: "verboseLogging",
    maintenance_banner: "maintenanceBanner"
  };

  // =========================================
  // MESSAGES
  // =========================================

  function showMessage(text, isError = false) {
    message.textContent = text;

    message.classList.toggle(
      "error",
      isError
    );
  }

  function setStatus(id, value, good) {
    const element = el(id);

    element.textContent = value;

    element.classList.toggle(
      "good",
      good === true
    );

    element.classList.toggle(
      "bad",
      good === false
    );
  }

  function setBusy(value) {
    busy = value;

    refreshButton.disabled = value;

    document.querySelectorAll(
      "[data-setting]"
    ).forEach(input => {
      input.disabled = value;
    });
  }

  function redirectToLogin() {
    window.location.replace(
      "maintenance-login.html"
    );
  }

  // =========================================
  // AUTHORIZATION
  // =========================================

  async function requireMaintenanceUser() {
    if (!db) {
      throw new Error(
        "Supabase configuration is missing."
      );
    }

    const {
      data: userData,
      error: userError
    } = await db.auth.getUser();

    if (userError) {
      throw userError;
    }

    const user = userData?.user;

    if (!user) {
      throw new Error(
        "Your session has expired."
      );
    }

    const {
      data: permitted,
      error: roleError
    } = await db.rpc(
      "is_store_maintainer"
    );

    if (roleError) {
      throw roleError;
    }

    if (permitted !== true) {
      throw new Error(
        "This account has no maintenance permission."
      );
    }

    return user;
  }

  // =========================================
  // DIAGNOSTICS
  // =========================================

  async function runDiagnostics() {
    if (!authorized || busy) return;

    setBusy(true);

    setStatus(
      "databaseStatus",
      "Checking...",
      null
    );

    setStatus(
      "authStatus",
      "Checking...",
      null
    );

    setStatus(
      "roleStatus",
      "Checking...",
      null
    );

    try {
      const user =
        await requireMaintenanceUser();

      setStatus(
        "authStatus",
        "Authenticated",
        true
      );

      setStatus(
        "roleStatus",
        "Maintenance",
        true
      );

      const {
        data,
        error
      } = await db.rpc(
        "timidy_maintenance_diagnostics"
      );

      if (error) {
        throw error;
      }

      if (
        !data ||
        data.database !== "connected" ||
        data.role !== "maintenance"
      ) {
        throw new Error(
          "Unexpected diagnostics response."
        );
      }

      setStatus(
        "databaseStatus",
        "Connected",
        true
      );

      el("accountEmail").textContent =
        user.email || "Maintenance account";

      const time = new Date(
        data.server_time
      ).toLocaleString("en-TZ");

      showMessage(
        `Diagnostics successful.\n` +
        `Database server time: ${time}`
      );
    } catch (error) {
      console.error(
        "Maintenance diagnostics failed:",
        error
      );

      setStatus(
        "databaseStatus",
        "Check Failed",
        false
      );

      showMessage(
        error.message ||
        "Diagnostics failed.",
        true
      );
    } finally {
      setBusy(false);
    }
  }

  // =========================================
  // LOAD TECHNICAL SETTINGS
  // =========================================

  async function loadSettings() {
    const {
      data,
      error
    } = await db.rpc(
      "timidy_maintenance_get_settings"
    );

    if (error) {
      throw error;
    }

    for (const [
      key,
      id
    ] of Object.entries(settingIds)) {
      const input = el(id);

      if (!input) continue;

      input.checked =
        data?.[key] === true;
    }
  }

  // =========================================
  // SAVE TECHNICAL SETTING
  // =========================================

  async function saveSetting(event) {
    if (!authorized || busy) return;

    const input = event.currentTarget;

    const key =
      input.dataset.setting;

    if (
      !Object.prototype.hasOwnProperty.call(
        settingIds,
        key
      )
    ) {
      return;
    }

    const previousValue =
      !input.checked;

    setBusy(true);

    try {
      await requireMaintenanceUser();

      const {
        error
      } = await db.rpc(
        "timidy_maintenance_set_setting",
        {
          p_key: key,
          p_enabled: input.checked
        }
      );

      if (error) {
        throw error;
      }

      showMessage(
        "Technical setting saved successfully."
      );

      await loadSettings();
      await loadEvents();
    } catch (error) {
      input.checked = previousValue;

      showMessage(
        "Unable to confirm setting update: " +
        (error.message || "Unknown error"),
        true
      );

      // Re-read authoritative database state
      // in case the write succeeded but the
      // response was interrupted.
      try {
        await loadSettings();
      } catch (refreshError) {
        console.error(
          "Unable to refresh settings:",
          refreshError
        );
      }
    } finally {
      setBusy(false);
    }
  }

  // =========================================
  // LOAD SANITIZED TECHNICAL EVENTS
  // =========================================

  async function loadEvents() {
    const {
      data,
      error
    } = await db.rpc(
      "timidy_maintenance_get_events"
    );

    if (error) {
      throw error;
    }

    const list = el("eventList");

    list.replaceChildren();

    if (!data || data.length === 0) {
      const item =
        document.createElement("li");

      item.textContent =
        "No technical activity recorded yet.";

      list.appendChild(item);
      return;
    }

    const fragment =
      document.createDocumentFragment();

    for (const event of data) {
      const item =
        document.createElement("li");

      const description =
        document.createElement("span");

      description.textContent =
        event.event_type;

      const timestamp =
        document.createElement("time");

      timestamp.textContent =
        new Date(
          event.event_time
        ).toLocaleString("en-TZ");

      timestamp.dateTime =
        event.event_time;

      item.append(
        description,
        timestamp
      );

      fragment.appendChild(item);
    }

    list.appendChild(fragment);
  }

  // =========================================
  // CHANGE DEVELOPER PASSWORD
  // =========================================

  async function changePassword(event) {
    event.preventDefault();

    if (!authorized || busy) return;

    const password =
      el("newPassword").value;

    const confirmation =
      el("confirmPassword").value;

    if (password.length < 12) {
      showMessage(
        "Password must contain at least 12 characters.",
        true
      );
      return;
    }

    if (password !== confirmation) {
      showMessage(
        "Passwords do not match.",
        true
      );
      return;
    }

    setBusy(true);

    const submitButton =
      passwordForm.querySelector(
        '[type="submit"]'
      );

    submitButton.disabled = true;

    try {
      await requireMaintenanceUser();

      const {
        error
      } = await db.auth.updateUser({
        password
      });

      if (error) {
        throw error;
      }

      passwordForm.reset();

      showMessage(
        "Developer password updated successfully."
      );
    } catch (error) {
      showMessage(
        "Unable to change password: " +
        (error.message || "Unknown error"),
        true
      );
    } finally {
      setBusy(false);
      submitButton.disabled = false;
    }
  }

  // =========================================
  // SIGN OUT
  // =========================================

  async function signOut() {
    logoutButton.disabled = true;

    try {
      await db.auth.signOut();
      redirectToLogin();
    } catch (error) {
      showMessage(
        "Unable to sign out: " +
        (error.message || "Unknown error"),
        true
      );

      logoutButton.disabled = false;
    }
  }



  // =========================================
  // BACKEND STRUCTURE CHECKER
  // =========================================
  const structureButton = el("structureButton");

  function renderStructureGroup(id, items) {
    const list = el(id);
    list.replaceChildren();
    let passed = 0;
    for (const item of items) {
      const row = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = String(item.name || "");
      const state = document.createElement("strong");
      const found = item.exists === true;
      state.textContent = found ? "FOUND" : "MISSING";
      state.style.color = found ? "#86efac" : "#fca5a5";
      row.append(name, state);
      list.appendChild(row);
      if (found) passed++;
    }
    return passed;
  }

  async function checkStructure() {
    if (!authorized || busy) return;
    structureButton.disabled = true;
    el("structureSummary").textContent = "Checking...";
    try {
      await requireMaintenanceUser();
      const { data, error } = await db.rpc(
        "timidy_maintenance_check_structure"
      );
      if (error) throw error;
      if (!Array.isArray(data?.tables) ||
          !Array.isArray(data?.columns) ||
          !Array.isArray(data?.functions)) {
        throw new Error("Invalid structure result.");
      }
      const passed =
        renderStructureGroup("tableChecks", data.tables) +
        renderStructureGroup("columnChecks", data.columns) +
        renderStructureGroup("functionChecks", data.functions);
      const total = data.tables.length + data.columns.length +
        data.functions.length;
      el("structureSummary").textContent =
        `${passed} of ${total} checks passed`;
      el("structureCheckedAt").textContent =
        "Checked: " + new Date(data.checked_at).toLocaleString("en-TZ");
    } catch (_) {
      el("structureSummary").textContent =
        "Structure check unavailable. Verify the checker RPC.";
    } finally {
      structureButton.disabled = false;
    }
  }
  structureButton.addEventListener("click", checkStructure);

  // =========================================
  // PRIVACY-SAFE TECHNICAL ERROR CENTER
  // =========================================
  const loadErrorsButton = el("loadErrorsButton");
  const copyErrorsButton = el("copyErrorsButton");
  const errorCenterStatus = el("errorCenterStatus");
  const technicalErrorRows = el("technicalErrorRows");
  let safeErrorEvents = [];

  function renderTechnicalErrors(events) {
    technicalErrorRows.replaceChildren();
    if (!events.length) {
      const row = technicalErrorRows.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 4;
      cell.textContent = "No technical errors recorded.";
      return;
    }
    for (const item of events) {
      const row = technicalErrorRows.insertRow();
      for (const value of [
        new Date(item.time).toLocaleString("en-TZ"),
        item.module,
        item.operation,
        item.code
      ]) {
        const cell = row.insertCell();
        cell.textContent = String(value ?? "");
      }
    }
  }

  async function loadTechnicalErrors() {
    if (!authorized) return;
    loadErrorsButton.disabled = true;
    errorCenterStatus.textContent = "Loading technical errors...";
    try {
      await requireMaintenanceUser();
      const { data, error } = await db.rpc(
        "timidy_maintenance_get_errors"
      );
      if (error) throw error;
      if (!Array.isArray(data)) {
        throw new Error("Unexpected error report format.");
      }
      // Strictly keep known, non-sensitive fields.
      safeErrorEvents = data.map(item => ({
        module: String(item.module || ""),
        operation: String(item.operation || ""),
        code: String(item.code || ""),
        time: String(item.time || "")
      }));
      renderTechnicalErrors(safeErrorEvents);
      errorCenterStatus.textContent =
        `${safeErrorEvents.length} recent technical event(s).`;
    } catch (error) {
      errorCenterStatus.textContent =
        "Unable to load error diagnostics. Check the SQL migration and authorization.";
      console.warn("Technical error center unavailable.");
    } finally {
      loadErrorsButton.disabled = false;
    }
  }

  async function copyTechnicalReport() {
    if (!authorized) return;
    const lines = [
      "TIMIDY STORE — TECHNICAL ERROR REPORT",
      "Generated: " + new Date().toISOString(),
      "Includes only sanitized error codes; no business data.",
      "",
      ...safeErrorEvents.map(item =>
        [item.time, item.module, item.operation, item.code].join(" | ")
      )
    ];
    const report = lines.join("\n");
    try {
      await navigator.clipboard.writeText(report);
      errorCenterStatus.textContent = "Diagnostic report copied.";
    } catch (_) {
      // Clipboard may be unavailable outside secure contexts.
      errorCenterStatus.textContent =
        "Clipboard unavailable. Open Live Server on localhost or HTTPS.";
    }
  }

  loadErrorsButton.addEventListener("click", loadTechnicalErrors);
  copyErrorsButton.addEventListener("click", copyTechnicalReport);

  // =========================================
  // INITIALIZATION
  // =========================================

  async function initialize() {
    if (!db) {
      loadingScreen.textContent =
        "Supabase is not configured.";
      return;
    }

    try {
      const user =
        await requireMaintenanceUser();

      authorized = true;

      el("accountEmail").textContent =
        user.email || "Maintenance account";

      app.hidden = false;
      loadingScreen.hidden = true;

      await Promise.all([
        loadSettings(),
        loadEvents()
      ]);

      await runDiagnostics();
      await loadTechnicalErrors();
    } catch (error) {
      console.error(
        "Maintenance initialization failed:",
        error
      );

      if (!authorized) {
        redirectToLogin();
        return;
      }

      showMessage(
        "Unable to initialize maintenance tools: " +
        (error.message || "Unknown error"),
        true
      );
    }
  }

  // =========================================
  // EVENTS
  // =========================================

  refreshButton.addEventListener(
    "click",
    runDiagnostics
  );

  logoutButton.addEventListener(
    "click",
    signOut
  );

  passwordForm.addEventListener(
    "submit",
    changePassword
  );

  document.querySelectorAll(
    "[data-setting]"
  ).forEach(input => {
    input.addEventListener(
      "change",
      saveSetting
    );
  });

  initialize();
})();