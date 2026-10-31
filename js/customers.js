
"use strict";

// ========================================
// TIMIDY STORE — SUPABASE CUSTOMERS
// Optimized loading, search and rendering
// ========================================

const db = window.timidySupabase;

if (!db) {
  throw new Error("Supabase is not configured.");
}

// ========================================
// STATE
// ========================================

let customers = [];
let sales = [];

let customerById = new Map();
let purchasesByCustomer = new Map();
let customerStats = new Map();

let editingId = null;
let busy = false;
let initialized = false;
let lastDataRefresh = 0;
let refreshPromise = null;

const CUSTOMERS_REFRESH_INTERVAL = 60 * 1000;

let searchTimer = null;

const form = document.getElementById("customerForm");
const table = document.getElementById("customersTable");
const search = document.getElementById("searchCustomer");
const message = document.getElementById("customerMessage");

const field = id => document.getElementById(id);

const money = value =>
  "TZS " + Number(value || 0).toLocaleString(
    "en-TZ",
    { maximumFractionDigits: 2 }
  );

// ========================================
// UTILITIES
// ========================================

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    `${Date.now()}-` +
    Math.random().toString(36).slice(2)
  );
}

function normalizePhone(phone) {
  let value = String(phone || "")
    .replace(/[^\d+]/g, "");

  if (
    value.startsWith("0") &&
    value.length === 10
  ) {
    value = "+255" + value.slice(1);
  } else if (value.startsWith("255")) {
    value = "+" + value;
  }

  return value;
}

function mapCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || "",
    email: row.email || "",
    notes: row.notes || "",
    marketingConsent: Boolean(
      row.marketing_consent
    ),
    consentUpdatedAt:
      row.consent_updated_at,
    createdAt: row.created_at
  };
}

function mapSale(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    productName: row.product_name || "",
    type: row.type,
    amount: Number(row.amount || 0),
    date: row.date,
    status: row.status,
    voided: Boolean(row.voided)
  };
}

function isActiveSale(sale) {
  return (
    sale.status !== "voided" &&
    !sale.voided
  );
}

function setMessage(text, type = "") {
  if (!message) return;

  message.textContent = text;
  message.className =
    "sale-message " + type;
}

function setBusy(value) {
  busy = value;

  if (form) {
    form.querySelectorAll(
      "input, textarea, select, button"
    ).forEach(element => {
      element.disabled = value;
    });
  }

  if (table) {
    table.querySelectorAll(
      "button"
    ).forEach(button => {
      button.disabled = value;
    });
  }

  const cancel = field("cancelEdit");

  if (cancel) {
    cancel.disabled = value;
  }
}

// ========================================
// DUPLICATE CUSTOMER CHECK
// ========================================

function findExisting(
  phone,
  email,
  excludeId = null
) {
  return customers.find(customer => {
    if (customer.id === excludeId) {
      return false;
    }

    const phoneMatches =
      phone &&
      normalizePhone(customer.phone) === phone;

    const emailMatches =
      email &&
      customer.email.toLowerCase() === email;

    return phoneMatches || emailMatches;
  });
}

// ========================================
// BUILD CUSTOMER PURCHASE INDEX
// ========================================

// Group active sales once rather than
// scanning every sale for every customer.

function buildCustomerIndexes() {
  customerById = new Map(
    customers.map(customer => [
      customer.id,
      customer
    ])
  );

  purchasesByCustomer = new Map();
  customerStats = new Map();

  for (const customer of customers) {
    purchasesByCustomer.set(
      customer.id,
      []
    );

    customerStats.set(
      customer.id,
      {
        purchases: 0,
        spent: 0
      }
    );
  }

  for (const sale of sales) {
    if (!isActiveSale(sale)) {
      continue;
    }

    const purchases =
      purchasesByCustomer.get(
        sale.customerId
      );

    if (!purchases) {
      continue;
    }

    purchases.push(sale);

    const stats = customerStats.get(
      sale.customerId
    );

    stats.purchases++;
    stats.spent += sale.amount;
  }
}

// ========================================
// SUPABASE DATA LOADING
// ========================================

async function refreshCustomers() {
  if (refreshPromise) {
    return refreshPromise;
  }

  const request = (async () => {
    // Load customers and sales concurrently.
    const [
      customersResult,
      salesResult
    ] = await Promise.all([
      db
        .from("customers")
        .select(
          "id,name,phone,email,notes," +
          "marketing_consent,consent_updated_at," +
          "created_at"
        )
        .order("name", {
          ascending: true
        }),

      db
        .from("sales")
        .select(
          "id,customer_id,product_name,type," +
          "amount,date,status,voided"
        )
        .order("date", {
          ascending: false
        })
    ]);

    if (customersResult.error) {
      throw customersResult.error;
    }

    if (salesResult.error) {
      throw salesResult.error;
    }

    // Commit both datasets together.
    customers = (
      customersResult.data || []
    ).map(mapCustomer);

    sales = (
      salesResult.data || []
    ).map(mapSale);

    buildCustomerIndexes();

    lastDataRefresh = Date.now();
    initialized = true;

    updateCustomerSummary();
    renderCustomers();
    refreshOpenHistory();
  })();

  refreshPromise = request;

  try {
    return await request;
  } finally {
    if (refreshPromise === request) {
      refreshPromise = null;
    }
  }
}

// ========================================
// CUSTOMER SUMMARY
// ========================================

function updateCustomerSummary() {
  let activeCount = 0;
  let marketingCount = 0;
  let totalSpending = 0;

  for (const customer of customers) {
    if (customer.marketingConsent) {
      marketingCount++;
    }

    const stats = customerStats.get(
      customer.id
    );

    if (stats?.purchases > 0) {
      activeCount++;
      totalSpending += stats.spent;
    }
  }

  const summary = {
    totalCustomers: customers.length,
    activeCustomers: activeCount,
    marketingCustomers: marketingCount,
    customerSpending: money(
      totalSpending
    )
  };

  Object.entries(summary).forEach(
    ([id, value]) => {
      const element = field(id);

      if (element) {
        element.textContent = value;
      }
    }
  );
}

// ========================================
// RESET FORM
// ========================================

function resetForm() {
  editingId = null;

  if (form) {
    form.reset();
  }

  field("formTitle").textContent =
    "Add New Customer";

  field("saveCustomerLabel").textContent =
    "Save Customer";

  field("cancelEdit").classList.add(
    "hidden"
  );
}

// ========================================
// CUSTOMER TABLE
// ========================================

function createActionButton(
  label,
  action,
  customerId
) {
  const button = document.createElement(
    "button"
  );

  button.type = "button";
  button.className = "table-action";
  button.textContent = label;

  button.dataset.action = action;
  button.dataset.customerId =
    customerId;

  button.disabled = busy;

  return button;
}

function renderCustomers() {
  if (!table) return;

  const term = search
    ? search.value.trim().toLowerCase()
    : "";

  const fragment =
    document.createDocumentFragment();

  let matchedCount = 0;

  for (const customer of customers) {
    const matches =
      !term ||
      customer.name.toLowerCase().includes(term) ||
      customer.phone.toLowerCase().includes(term) ||
      customer.email.toLowerCase().includes(term);

    if (!matches) {
      continue;
    }

    matchedCount++;

    const stats =
      customerStats.get(customer.id) || {
        purchases: 0,
        spent: 0
      };

    const row =
      document.createElement("tr");

    [
      customer.name,
      customer.phone || "—",
      customer.email || "—",
      stats.purchases,
      money(stats.spent)
    ].forEach(value => {
      const cell =
        document.createElement("td");

      cell.textContent = value;

      row.appendChild(cell);
    });

    // Marketing consent
    const consentCell =
      document.createElement("td");

    const consent =
      document.createElement("span");

    consent.className =
      "customer-status " +
      (
        customer.marketingConsent
          ? "allowed"
          : "not-allowed"
      );

    consent.textContent =
      customer.marketingConsent
        ? "Opted in"
        : "Not opted in";

    consentCell.appendChild(consent);
    row.appendChild(consentCell);

    // Actions
    const actionsCell =
      document.createElement("td");

    const actions =
      document.createElement("div");

    actions.className =
      "customer-actions";

    actions.append(
      createActionButton(
        "Edit",
        "edit",
        customer.id
      ),
      createActionButton(
        "History",
        "history",
        customer.id
      )
    );

    actionsCell.appendChild(actions);
    row.appendChild(actionsCell);

    fragment.appendChild(row);
  }

  if (matchedCount === 0) {
    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 7;
    cell.textContent =
      "No customers found.";

    row.appendChild(cell);
    fragment.appendChild(row);
  }

  // One DOM update.
  table.replaceChildren(fragment);
}

// ========================================
// DELEGATED TABLE EVENTS
// ========================================

if (table) {
  table.addEventListener(
    "click",
    event => {
      if (busy) return;

      const button = event.target.closest(
        "button[data-action][data-customer-id]"
      );

      if (
        !button ||
        !table.contains(button)
      ) {
        return;
      }

      const id =
        button.dataset.customerId;

      if (button.dataset.action === "edit") {
        editCustomer(id);
      } else if (
        button.dataset.action === "history"
      ) {
        showHistory(id);
      }
    }
  );
}

// ========================================
// EDIT CUSTOMER
// ========================================

function editCustomer(id) {
  if (busy) return;

  const customer =
    customerById.get(id);

  if (!customer) return;

  editingId = id;

  field("customerName").value =
    customer.name;

  field("customerPhone").value =
    customer.phone;

  field("customerEmail").value =
    customer.email;

  field("customerNotes").value =
    customer.notes;

  field("marketingConsent").checked =
    customer.marketingConsent;

  field("formTitle").textContent =
    "Edit Customer";

  field("saveCustomerLabel").textContent =
    "Update Customer";

  field("cancelEdit").classList.remove(
    "hidden"
  );

  form.scrollIntoView({
    behavior: "smooth"
  });
}

// ========================================
// PURCHASE HISTORY
// ========================================

let openHistoryCustomerId = null;

function renderHistory(id) {
  const customer =
    customerById.get(id);

  if (!customer) {
    return;
  }

  field("historyTitle").textContent =
    customer.name + " — Purchase History";

  const historyTable =
    field("historyTable");

  const fragment =
    document.createDocumentFragment();

  // Already grouped by customer.
  // Sales retain the database date order.
  const purchases =
    purchasesByCustomer.get(id) || [];

  if (purchases.length === 0) {
    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 4;

    cell.textContent =
      "No purchases recorded yet.";

    row.appendChild(cell);
    fragment.appendChild(row);
  } else {
    for (const sale of purchases) {
      const row =
        document.createElement("tr");

      [
        sale.date,
        sale.productName,
        sale.type === "middleman"
          ? "Middleman"
          : "Own Stock",
        money(sale.amount)
      ].forEach(value => {
        const cell =
          document.createElement("td");

        cell.textContent = value ?? "";

        row.appendChild(cell);
      });

      fragment.appendChild(row);
    }
  }

  historyTable.replaceChildren(
    fragment
  );
}

function showHistory(id) {
  if (!customerById.has(id)) {
    return;
  }

  openHistoryCustomerId = id;

  renderHistory(id);

  field("historyPanel").classList.remove(
    "hidden"
  );

  field("historyPanel").scrollIntoView({
    behavior: "smooth"
  });
}

function refreshOpenHistory() {
  if (!openHistoryCustomerId) {
    return;
  }

  if (
    !customerById.has(openHistoryCustomerId)
  ) {
    openHistoryCustomerId = null;

    field("historyPanel").classList.add(
      "hidden"
    );

    return;
  }

  renderHistory(openHistoryCustomerId);
}

// ========================================
// SAVE CUSTOMER TO SUPABASE
// ========================================

async function saveCustomer(event) {
  event.preventDefault();

  if (busy) return;

  const name = field(
    "customerName"
  ).value.trim();

  const phone = normalizePhone(
    field("customerPhone").value.trim()
  );

  const email = field(
    "customerEmail"
  ).value.trim().toLowerCase();

  const notes = field(
    "customerNotes"
  ).value.trim();

  const marketingConsent = field(
    "marketingConsent"
  ).checked;

  if (!name || (!phone && !email)) {
    setMessage(
      "Enter a name and at least a phone number or email.",
      "error"
    );

    return;
  }

  const existing = findExisting(
    phone,
    email,
    editingId
  );

  if (existing) {
    setMessage(
      "This phone or email already belongs to " +
      existing.name + ".",
      "error"
    );

    return;
  }

  const old = editingId
    ? customerById.get(editingId)
    : null;

  const now =
    new Date().toISOString();

  const payload = {
    name,
    phone,
    email,
    notes,
    marketing_consent:
      marketingConsent,

    consent_updated_at:
      !old ||
      old.marketingConsent !==
        marketingConsent
        ? now
        : old.consentUpdatedAt
  };

  setBusy(true);
  setMessage("Saving customer...");

  let committed = false;

  try {
    if (editingId) {
      const { data, error } = await db
        .from("customers")
        .update(payload)
        .eq("id", editingId)
        .select("id");

      if (error) {
        throw error;
      }

      if (
        !data ||
        data.length !== 1
      ) {
        throw new Error(
          "Customer update was not confirmed."
        );
      }
    } else {
      const { error } = await db
        .from("customers")
        .insert({
          id: createId(),
          ...payload,
          created_at: now
        });

      if (error) {
        throw error;
      }
    }

    committed = true;

    // Reset the form immediately after
    // the write succeeds, even if the
    // subsequent refresh fails.
    resetForm();

    await refreshCustomers();

    setMessage(
      "Customer saved successfully!",
      "success"
    );
  } catch (error) {
    console.error(
      "Unable to save customer:",
      error
    );

    if (committed) {
      setMessage(
        "Customer saved in Supabase, but " +
        "refreshing failed. Reload the page " +
        "before saving another customer.",
        "error"
      );
    } else {
      setMessage(
        "Customer save not confirmed: " +
        (error?.message || "Please try again.") +
        " Check Supabase records before retrying.",
        "error"
      );
    }
  } finally {
    setBusy(false);
  }
}

// ========================================
// EVENT LISTENERS
// ========================================

if (form) {
  form.addEventListener(
    "submit",
    saveCustomer
  );
}

const cancelEdit =
  field("cancelEdit");

if (cancelEdit) {
  cancelEdit.addEventListener(
    "click",
    resetForm
  );
}

const closeHistory =
  field("closeHistory");

if (closeHistory) {
  closeHistory.addEventListener(
    "click",
    () => {
      openHistoryCustomerId = null;

      field("historyPanel").classList.add(
        "hidden"
      );
    }
  );
}

// Debounce search to avoid repeatedly
// rebuilding the table while typing.
if (search) {
  search.addEventListener(
    "input",
    () => {
      clearTimeout(searchTimer);

      searchTimer = setTimeout(
        renderCustomers,
        150
      );
    }
  );
}

// ========================================
// INITIALIZATION
// ========================================

async function initializeCustomers() {
  setBusy(true);

  try {
    const user =
      await window.TimidyAuth.getAuthorizedUser();

    if (!user) {
      window.location.replace(
        "login.html"
      );

      return;
    }

    await refreshCustomers();
  } catch (error) {
    console.error(
      "Unable to load customers:",
      error
    );

    setMessage(
      "Unable to load customers: " +
      (error?.message || "Please try again."),
      "error"
    );
  } finally {
    setBusy(false);
  }
}

initializeCustomers();

// ========================================
// REFRESH WHEN RETURNING TO TAB
// ========================================

document.addEventListener(
  "visibilitychange",
  async () => {
    if (
      document.hidden ||
      !initialized ||
      busy
    ) {
      return;
    }

    if (
      Date.now() - lastDataRefresh <
      CUSTOMERS_REFRESH_INTERVAL
    ) {
      return;
    }

    setBusy(true);

    try {
      const user =
        await window.TimidyAuth.getAuthorizedUser();

      if (!user) {
        window.location.replace(
          "login.html"
        );

        return;
      }

      await refreshCustomers();
    } catch (error) {
      console.error(
        "Customers background refresh failed:",
        error
      );

      setMessage(
        "Unable to refresh customers. " +
        "Reload the page before saving changes.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }
);

// ========================================
// ICONS
// ========================================

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
