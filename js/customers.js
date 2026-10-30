
const CUSTOMERS_KEY = "timidy-customers";
const SALES_KEY = "timidy-sales";

function loadRecords(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

let customers = loadRecords(CUSTOMERS_KEY);
let editingId = null;

const form = document.getElementById("customerForm");
const table = document.getElementById("customersTable");
const search = document.getElementById("searchCustomer");
const message = document.getElementById("customerMessage");

const field = id => document.getElementById(id);

const money = value =>
  "TZS " + Number(value).toLocaleString("en-TZ");

function normalizePhone(phone) {
  let value = phone.replace(/[^\d+]/g, "");

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
      (phone && normalizePhone(customer.phone || "") === phone) ||
      (email && customer.email?.toLowerCase() === email)
    )
  );
}

function saveCustomers() {
  localStorage.setItem(
    CUSTOMERS_KEY, JSON.stringify(customers)
  );
}

function customerSales(id) {
  return loadRecords(SALES_KEY).filter(
    sale => sale.customerId === id
  );
}

function resetForm() {
  editingId = null;
  form.reset();
  field("formTitle").textContent = "Add New Customer";
  field("saveCustomerLabel").textContent = "Save Customer";
  field("cancelEdit").classList.add("hidden");
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = "sale-message " + type;
}

function renderCustomers() {
  customers = loadRecords(CUSTOMERS_KEY);
  table.replaceChildren();

  const term = search.value.trim().toLowerCase();
  const sales = loadRecords(SALES_KEY);

  const matched = customers.filter(customer =>
    [customer.name, customer.phone, customer.email]
      .some(value => (value || "").toLowerCase().includes(term))
  );

  const linkedSales = sales.filter(sale =>
    customers.some(customer => customer.id === sale.customerId)
  );

  field("totalCustomers").textContent = customers.length;

  field("activeCustomers").textContent =
    new Set(linkedSales.map(s => s.customerId)).size;

  field("marketingCustomers").textContent =
    customers.filter(c => c.marketingConsent).length;

  field("customerSpending").textContent = money(
    linkedSales.reduce((sum, sale) => sum + sale.amount, 0)
  );

  if (matched.length === 0) {
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.textContent = "No customers found.";
    return;
  }

  matched.forEach(customer => {
    const purchases = sales.filter(
      sale => sale.customerId === customer.id
    );

    const spent = purchases.reduce(
      (sum, sale) => sum + sale.amount, 0
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
    editBtn.className = "table-action";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () =>
      editCustomer(customer.id)
    );

    const historyBtn = document.createElement("button");
    historyBtn.className = "table-action";
    historyBtn.textContent = "History";
    historyBtn.addEventListener("click", () =>
      showHistory(customer.id)
    );

    actions.append(editBtn, historyBtn);
    actionsCell.appendChild(actions);
  });
}

function editCustomer(id) {
  const customer = customers.find(c => c.id === id);
  if (!customer) return;

  editingId = id;

  field("customerName").value = customer.name;
  field("customerPhone").value = customer.phone || "";
  field("customerEmail").value = customer.email || "";
  field("customerNotes").value = customer.notes || "";
  field("marketingConsent").checked =
    Boolean(customer.marketingConsent);

  field("formTitle").textContent = "Edit Customer";
  field("saveCustomerLabel").textContent = "Update Customer";
  field("cancelEdit").classList.remove("hidden");

  form.scrollIntoView({ behavior: "smooth" });
}

function showHistory(id) {
  const customer = customers.find(c => c.id === id);
  if (!customer) return;

  field("historyTitle").textContent =
    customer.name + " — Purchase History";

  const historyTable = field("historyTable");
  historyTable.replaceChildren();

  const purchases = customerSales(id).sort(
    (a, b) => b.date.localeCompare(a.date)
  );

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
  field("historyPanel").scrollIntoView({ behavior: "smooth" });
}

form.addEventListener("submit", event => {
  event.preventDefault();

  customers = loadRecords(CUSTOMERS_KEY);

  const name = field("customerName").value.trim();
  const phone = normalizePhone(
    field("customerPhone").value.trim()
  );
  const email = field("customerEmail").value
    .trim().toLowerCase();

  if (!name || (!phone && !email)) {
    setMessage(
      "Enter a name and at least a phone number or email.",
      "error"
    );
    return;
  }

  const existing = findExisting(phone, email, editingId);

  if (existing) {
    setMessage(
      "This phone or email already belongs to " +
      existing.name + ".",
      "error"
    );
    return;
  }

  const old = customers.find(c => c.id === editingId);

  const customer = {
    id: editingId || crypto.randomUUID(),
    name,
    phone,
    email,
    notes: field("customerNotes").value.trim(),
    marketingConsent: field("marketingConsent").checked,
    consentUpdatedAt: new Date().toISOString(),
    createdAt: old?.createdAt || new Date().toISOString()
  };

  if (editingId) {
    customers = customers.map(c =>
      c.id === editingId ? customer : c
    );
  } else {
    customers.push(customer);
  }

  try {
    saveCustomers();
  } catch {
    setMessage("Unable to save customer.", "error");
    return;
  }

  resetForm();
  renderCustomers();
  setMessage("Customer saved successfully!", "success");
});

field("cancelEdit").addEventListener("click", resetForm);

field("closeHistory").addEventListener("click", () => {
  field("historyPanel").classList.add("hidden");
});

search.addEventListener("input", renderCustomers);

// Theme switching
const themeToggle = field("themeToggle");

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.body.classList.toggle("dark", dark);
  themeToggle.textContent = dark ? "☀️" : "🌙";
}

applyTheme(
  localStorage.getItem("timidy-theme") === "dark"
    ? "dark" : "light"
);

themeToggle.addEventListener("click", () => {
  const next = document.body.classList.contains("dark")
    ? "light" : "dark";

  localStorage.setItem("timidy-theme", next);
  applyTheme(next);
});

renderCustomers();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
