
"use strict";

// ========================================
// TIMIDY STORE — SUPABASE CUSTOMERS
// ========================================

const db = window.timidySupabase;

if (!db) {
  throw new Error("Supabase is not configured.");
}

let customers = [];
let sales = [];
let editingId = null;
let busy = false;

const form = document.getElementById("customerForm");
const table = document.getElementById("customersTable");
const search = document.getElementById("searchCustomer");
const message = document.getElementById("customerMessage");

const field = id => document.getElementById(id);

const money = value =>
  "TZS " + Number(value || 0).toLocaleString("en-TZ", {
    maximumFractionDigits: 2
  });

// ----------------------------------------
// UTILITIES
// ----------------------------------------

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizePhone(phone) {
  let value = String(phone || "").replace(/[^\d+]/g, "");

  if (value.startsWith("0") && value.length === 10) {
    value = "+255" + value.slice(1);
  } else if (value.startsWith("255")) {
    value = "+" + value;
  }

  return value;
}

function findExisting(phone, email, excludeId = null) {
  return customers.find(customer =>
    customer.id !== excludeId && (
      (phone && normalizePhone(customer.phone) === phone) ||
      (email && customer.email.toLowerCase() === email)
    )
  );
}

function mapCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || "",
    email: row.email || "",
    notes: row.notes || "",
    marketingConsent: Boolean(row.marketing_consent),
    consentUpdatedAt: row.consent_updated_at,
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

function activeSales() {
  return sales.filter(
    sale => sale.status !== "voided" && !sale.voided
  );
}

function setMessage(text, type = "") {
  if (!message) return;

  message.textContent = text;
  message.className = "sale-message " + type;
}

function setBusy(value) {
  busy = value;

  if (form) {
    form.querySelectorAll("input, textarea, select, button")
      .forEach(element => {
        element.disabled = value;
      });
  }

  if (table) {
    table.querySelectorAll("button").forEach(button => {
      button.disabled = value;
    });
  }
}

// ----------------------------------------
// SUPABASE DATA LOADING
// ----------------------------------------

async function loadCustomers() {
  const { data, error } = await db
    .from("customers")
    .select(
      "id, name, phone, email, notes, marketing_consent, consent_updated_at, created_at"
    )
    .order("name", { ascending: true });

  if (error) throw error;

  customers = (data || []).map(mapCustomer);
}

async function loadSales() {
  const { data, error } = await db
    .from("sales")
    .select(
      "id, customer_id, product_name, type, amount, date, status, voided"
    )
    .order("date", { ascending: false });

  if (error) throw error;

  sales = (data || []).map(mapSale);
}

async function refreshCustomers() {
  await Promise.all([
    loadCustomers(),
    loadSales()
  ]);

  renderCustomers();
}

// ----------------------------------------
// FORM
// ----------------------------------------

function resetForm() {
  editingId = null;

  if (form) form.reset();

  field("formTitle").textContent = "Add New Customer";
  field("saveCustomerLabel").textContent = "Save Customer";
  field("cancelEdit").classList.add("hidden");
}

// ----------------------------------------
// CUSTOMER TABLE AND SUMMARY
// ----------------------------------------

function renderCustomers() {
  if (!table) return;

  table.replaceChildren();

  const term = search
    ? search.value.trim().toLowerCase()
    : "";

  const validSales = activeSales();

  const matched = customers.filter(customer =>
    [customer.name, customer.phone, customer.email]
      .some(value =>
        String(value || "").toLowerCase().includes(term)
      )
  );

  const customerIds = new Set(
    customers.map(customer => customer.id)
  );

  const linkedSales = validSales.filter(
    sale => customerIds.has(sale.customerId)
  );

  field("totalCustomers").textContent = customers.length;

  field("activeCustomers").textContent =
    new Set(linkedSales.map(sale => sale.customerId)).size;

  field("marketingCustomers").textContent =
    customers.filter(customer => customer.marketingConsent).length;

  field("customerSpending").textContent = money(
    linkedSales.reduce(
      (sum, sale) => sum + sale.amount,
      0
    )
  );

  if (matched.length === 0) {
    const row = table.insertRow();
    const cell = row.insertCell();

    cell.colSpan = 7;
    cell.textContent = "No customers found.";
    return;
  }

  matched.forEach(customer => {
    const purchases = validSales.filter(
      sale => sale.customerId === customer.id
    );

    const spent = purchases.reduce(
      (sum, sale) => sum + sale.amount,
      0
    );

    const row = table.insertRow();

    [
      customer.name,
      customer.phone || "—",
      customer.email || "—",
      purchases.length,
      money(spent)
    ].forEach(value => {
      row.insertCell().textContent = value;
    });

    const consentCell = row.insertCell();
    const consent = document.createElement("span");

    consent.className = "customer-status " +
      (customer.marketingConsent ? "allowed" : "not-allowed");

    consent.textContent =
      customer.marketingConsent ? "Opted in" : "Not opted in";

    consentCell.appendChild(consent);

    const actionsCell = row.insertCell();
    const actions = document.createElement("div");

    actions.className = "customer-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "table-action";
    editBtn.textContent = "Edit";
    editBtn.disabled = busy;

    editBtn.addEventListener("click", () =>
      editCustomer(customer.id)
    );

    const historyBtn = document.createElement("button");
    historyBtn.type = "button";
    historyBtn.className = "table-action";
    historyBtn.textContent = "History";
    historyBtn.disabled = busy;

    historyBtn.addEventListener("click", () =>
      showHistory(customer.id)
    );

    actions.append(editBtn, historyBtn);
    actionsCell.appendChild(actions);
  });
}

// ----------------------------------------
// EDIT CUSTOMER
// ----------------------------------------

function editCustomer(id) {
  if (busy) return;

  const customer = customers.find(
    item => item.id === id
  );

  if (!customer) return;

  editingId = id;

  field("customerName").value = customer.name;
  field("customerPhone").value = customer.phone;
  field("customerEmail").value = customer.email;
  field("customerNotes").value = customer.notes;

  field("marketingConsent").checked =
    customer.marketingConsent;

  field("formTitle").textContent = "Edit Customer";
  field("saveCustomerLabel").textContent = "Update Customer";
  field("cancelEdit").classList.remove("hidden");

  form.scrollIntoView({ behavior: "smooth" });
}

// ----------------------------------------
// PURCHASE HISTORY
// ----------------------------------------

function showHistory(id) {
  const customer = customers.find(
    item => item.id === id
  );

  if (!customer) return;

  field("historyTitle").textContent =
    customer.name + " — Purchase History";

  const historyTable = field("historyTable");
  historyTable.replaceChildren();

  const purchases = activeSales()
    .filter(sale => sale.customerId === id)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (purchases.length === 0) {
    const row = historyTable.insertRow();
    const cell = row.insertCell();

    cell.colSpan = 4;
    cell.textContent = "No purchases recorded yet.";
  }

  purchases.forEach(sale => {
    const row = historyTable.insertRow();

    [
      sale.date,
      sale.productName,
      sale.type === "middleman" ? "Middleman" : "Own Stock",
      money(sale.amount)
    ].forEach(value => {
      row.insertCell().textContent = value;
    });
  });

  field("historyPanel").classList.remove("hidden");

  field("historyPanel").scrollIntoView({
    behavior: "smooth"
  });
}

// ----------------------------------------
// SAVE CUSTOMER TO SUPABASE
// ----------------------------------------

async function saveCustomer(event) {
  event.preventDefault();

  if (busy) return;

  const name = field("customerName").value.trim();

  const phone = normalizePhone(
    field("customerPhone").value.trim()
  );

  const email = field("customerEmail")
    .value.trim().toLowerCase();

  const notes = field("customerNotes").value.trim();

  const marketingConsent =
    field("marketingConsent").checked;

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

  const old = customers.find(
    customer => customer.id === editingId
  );

  const now = new Date().toISOString();

  const payload = {
    name,
    phone,
    email,
    notes,
    marketing_consent: marketingConsent,
    consent_updated_at:
      !old || old.marketingConsent !== marketingConsent
        ? now
        : old.consentUpdatedAt
  };

  setBusy(true);
  setMessage("Saving customer...");

  try {
    if (editingId) {
      const { data, error } = await db
        .from("customers")
        .update(payload)
        .eq("id", editingId)
        .select("id");

      if (error) throw error;

      if (!data || data.length !== 1) {
        throw new Error("Customer update was not confirmed.");
      }
    } else {
      const { error } = await db
        .from("customers")
        .insert({
          id: createId(),
          ...payload,
          created_at: now
        });

      if (error) throw error;
    }

    await refreshCustomers();

    resetForm();

    setMessage(
      "Customer saved successfully!",
      "success"
    );
  } catch (error) {
    console.error("Unable to save customer:", error);

    setMessage(
      "Unable to save customer: " +
      (error.message || "Please try again."),
      "error"
    );
  } finally {
    setBusy(false);
  }
}

// ----------------------------------------
// EVENT LISTENERS
// ----------------------------------------

if (form) {
  form.addEventListener("submit", saveCustomer);
}

const cancelEdit = field("cancelEdit");

if (cancelEdit) {
  cancelEdit.addEventListener("click", resetForm);
}

const closeHistory = field("closeHistory");

if (closeHistory) {
  closeHistory.addEventListener("click", () => {
    field("historyPanel").classList.add("hidden");
  });
}

if (search) {
  search.addEventListener("input", renderCustomers);
}

// ----------------------------------------
// INITIALIZATION
// ----------------------------------------

async function initializeCustomers() {
  setBusy(true);

  try {
    const user =
      await window.TimidyAuth.getAuthorizedUser();

    if (!user) {
      window.location.replace("login.html");
      return;
    }

    await refreshCustomers();
  } catch (error) {
    console.error("Unable to load customers:", error);

    setMessage(
      "Unable to load customers: " +
      (error.message || "Please try again."),
      "error"
    );
  } finally {
    setBusy(false);
  }
}

initializeCustomers();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
