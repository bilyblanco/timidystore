
"use strict";

const STORAGE_KEY = "timidy-inventory";
const HISTORY_KEY = "timidy-stock-history";

// --------------------------------
// STORAGE
// --------------------------------

function loadArray(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

let products = loadArray(STORAGE_KEY);
let stockHistory = loadArray(HISTORY_KEY);

const form = document.getElementById("productForm");
const table = document.getElementById("inventoryTable");
const search = document.getElementById("searchProduct");
const themeToggle = document.getElementById("themeToggle");

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const formatMoney = amount =>
  "TZS " + Number(amount).toLocaleString("en-TZ", {
    maximumFractionDigits: 2
  });

function saveProducts() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(products)
  );
}

function saveHistory() {
  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(stockHistory)
  );
}

// --------------------------------
// STOCK STATUS
// --------------------------------

function getStatus(product) {
  if (Number(product.quantity) === 0) {
    return {
      label: "Out of Stock",
      className: "middleman"
    };
  }

  if (
    Number(product.quantity) <=
    Number(product.minimumStock)
  ) {
    return {
      label: "Low Stock",
      className: "middleman"
    };
  }

  return {
    label: "In Stock",
    className: "stock"
  };
}

// --------------------------------
// INVENTORY SUMMARY
// --------------------------------

function updateSummary() {
  const totalUnits = products.reduce(
    (sum, product) =>
      sum + Number(product.quantity || 0),
    0
  );

  const inventoryValue = products.reduce(
    (sum, product) =>
      sum +
      Number(product.quantity || 0) *
      Number(product.purchasePrice || 0),
    0
  );

  const alerts = products.filter(
    product =>
      Number(product.quantity) <=
      Number(product.minimumStock)
  ).length;

  const summary = {
    totalProducts: products.length,
    totalUnits,
    inventoryValue: formatMoney(inventoryValue),
    lowStockCount: alerts
  };

  Object.entries(summary).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
}

// --------------------------------
// INVENTORY TABLE
// --------------------------------

function makeActionButton(label, className, onClick) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = `inventory-action-btn ${className}`;
  button.textContent = label;
  button.addEventListener("click", onClick);

  return button;
}

function renderProducts() {
  if (!table) return;

  table.replaceChildren();

  const term = search
    ? search.value.trim().toLowerCase()
    : "";

  const filtered = products.filter(product =>
    String(product.name || "")
      .toLowerCase()
      .includes(term)
  );

  if (filtered.length === 0) {
    const row = table.insertRow();
    const cell = row.insertCell();

    cell.colSpan = 7;
    cell.textContent = "No products found.";
    cell.style.textAlign = "center";
    cell.style.padding = "24px";

    updateSummary();
    return;
  }

  filtered.forEach(product => {
    const status = getStatus(product);
    const row = table.insertRow();

    [
      product.name,
      product.category,
      formatMoney(product.purchasePrice),
      formatMoney(product.sellingPrice),
      product.quantity
    ].forEach(value => {
      row.insertCell().textContent = value;
    });

    const statusCell = row.insertCell();
    const badge = document.createElement("span");

    badge.className = `tag ${status.className}`;
    badge.textContent = status.label;

    statusCell.appendChild(badge);

    const actionsCell = row.insertCell();
    actionsCell.className = "inventory-actions";

    actionsCell.append(
      makeActionButton(
        "Edit",
        "edit-btn",
        () => openEditProduct(product.id)
      ),
      makeActionButton(
        "Restock",
        "restock-btn",
        () => openRestockProduct(product.id)
      ),
      makeActionButton(
        "History",
        "history-btn",
        () => showProductHistory(product.id)
      )
    );
  });

  updateSummary();
}

// --------------------------------
// STOCK MOVEMENTS
// --------------------------------

function recordStockMovement({
  product,
  type,
  quantity,
  previousQuantity,
  newQuantity,
  unitCost,
  note
}) {
  stockHistory.unshift({
    id: createId(),
    productId: product.id,
    productName: product.name,
    type,
    quantity,
    previousQuantity,
    newQuantity,
    unitCost,
    note,
    date: new Date().toISOString()
  });

  saveHistory();
}

// --------------------------------
// ADD PRODUCT
// --------------------------------

function addProduct(event) {
  event.preventDefault();

  const name = document
    .getElementById("productName")
    .value.trim();

  const category = document
    .getElementById("category")
    .value;

  const purchasePriceInput = document
    .getElementById("purchasePrice").value;

  const sellingPriceInput = document
    .getElementById("sellingPrice").value;

  const quantityInput = document
    .getElementById("quantity").value;

  const minimumStockInput = document
    .getElementById("minimumStock").value;

  const purchasePrice = Number(purchasePriceInput);
  const sellingPrice = Number(sellingPriceInput);
  const quantity = Number(quantityInput);
  const minimumStock = Number(minimumStockInput);

  if (
    !name ||
    !category ||
    purchasePriceInput.trim() === "" ||
    sellingPriceInput.trim() === "" ||
    quantityInput.trim() === "" ||
    minimumStockInput.trim() === "" ||
    !Number.isFinite(purchasePrice) ||
    purchasePrice < 0 ||
    !Number.isFinite(sellingPrice) ||
    sellingPrice < 0 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    !Number.isInteger(minimumStock) ||
    minimumStock < 0
  ) {
    alert("Please enter valid product details.");
    return;
  }

  const duplicate = products.some(
    product =>
      product.name.trim().toLowerCase() ===
      name.toLowerCase()
  );

  if (duplicate) {
    alert(
      "This product already exists.\n" +
      "Use Restock instead."
    );
    return;
  }

  const product = {
    id: createId(),
    name,
    category,
    purchasePrice,
    sellingPrice,
    quantity,
    minimumStock
  };

  products.push(product);

  const previousHistory = [...stockHistory];

  try {
    saveProducts();

    recordStockMovement({
      product,
      type: "Initial Stock",
      quantity,
      previousQuantity: 0,
      newQuantity: quantity,
      unitCost: purchasePrice,
      note: "Product created"
    });
  } catch {
    products.pop();
    stockHistory = previousHistory;

    try {
      saveProducts();
      saveHistory();
    } catch {}

    alert("Unable to save product.");
    return;
  }

  renderProducts();
  form.reset();

  document.getElementById(
    "minimumStock"
  ).value = 3;
}

// --------------------------------
// EDIT PRODUCT
// --------------------------------

function openEditProduct(productId) {
  const product = products.find(
    item => item.id === productId
  );

  if (!product) return;

  const nameInput = prompt(
    "Product name:",
    product.name
  );

  if (nameInput === null) return;

  const categoryInput = prompt(
    "Category:",
    product.category
  );

  if (categoryInput === null) return;

  const priceInput = prompt(
    "Selling price (TZS):",
    product.sellingPrice
  );

  if (priceInput === null) return;

  const minimumInput = prompt(
    "Minimum stock level:",
    product.minimumStock
  );

  if (minimumInput === null) return;

  const name = nameInput.trim();
  const category = categoryInput.trim();
  const sellingPrice = Number(priceInput);
  const minimumStock = Number(minimumInput);

  if (
    !name ||
    !category ||
    priceInput.trim() === "" ||
    minimumInput.trim() === "" ||
    !Number.isFinite(sellingPrice) ||
    sellingPrice < 0 ||
    !Number.isInteger(minimumStock) ||
    minimumStock < 0
  ) {
    alert("Please enter valid product details.");
    return;
  }

  const duplicate = products.some(
    item =>
      item.id !== product.id &&
      item.name.trim().toLowerCase() ===
      name.toLowerCase()
  );

  if (duplicate) {
    alert("Another product already uses that name.");
    return;
  }

  const previous = { ...product };

  product.name = name;
  product.category = category;
  product.sellingPrice = sellingPrice;
  product.minimumStock = minimumStock;

  try {
    saveProducts();
  } catch {
    Object.assign(product, previous);
    alert("Unable to save changes.");
    return;
  }

  renderProducts();
  alert("Product updated successfully!");
}

// --------------------------------
// RESTOCK PRODUCT
// --------------------------------

function openRestockProduct(productId) {
  const product = products.find(
    item => item.id === productId
  );

  if (!product) return;

  const quantityInput = prompt(
    `How many units of "${product.name}" are you adding?`
  );

  if (quantityInput === null) return;

  const costInput = prompt(
    "Purchase cost per new unit (TZS):",
    product.purchasePrice
  );

  if (costInput === null) return;

  const addedQuantity = Number(quantityInput);
  const newUnitCost = Number(costInput);

  if (
    quantityInput.trim() === "" ||
    costInput.trim() === "" ||
    !Number.isInteger(addedQuantity) ||
    addedQuantity <= 0 ||
    !Number.isFinite(newUnitCost) ||
    newUnitCost < 0
  ) {
    alert("Enter a valid quantity and purchase cost.");
    return;
  }

  const oldQuantity = Number(product.quantity);
  const oldCost = Number(product.purchasePrice);

  const newQuantity = oldQuantity + addedQuantity;

  const totalValue =
    oldQuantity * oldCost +
    addedQuantity * newUnitCost;

  const averageCost = totalValue / newQuantity;

  const previous = { ...product };
  const previousHistory = [...stockHistory];

  product.quantity = newQuantity;
  product.purchasePrice = averageCost;

  try {
    saveProducts();

    recordStockMovement({
      product,
      type: "Restock",
      quantity: addedQuantity,
      previousQuantity: oldQuantity,
      newQuantity,
      unitCost: newUnitCost,
      note: "Additional stock purchased"
    });
  } catch {
    Object.assign(product, previous);
    stockHistory = previousHistory;

    try {
      saveProducts();
      saveHistory();
    } catch {}

    alert("Unable to save restock.");
    return;
  }

  renderProducts();

  alert(
    `Added ${addedQuantity} units successfully!\n` +
    `New stock: ${newQuantity} units\n` +
    `Average cost: ${formatMoney(averageCost)}`
  );
}

// --------------------------------
// STOCK HISTORY MODAL
// --------------------------------

let historyModal = null;
let lastHistoryTrigger = null;

function createHistoryModal() {
  if (historyModal) return historyModal;

  const modal = document.createElement("div");
  modal.className = "stock-history-overlay";
  modal.hidden = true;

  modal.innerHTML = `
    <div
      class="stock-history-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stockHistoryTitle"
      tabindex="-1"
    >
      <div class="stock-history-header">
        <div>
          <h2 id="stockHistoryTitle">Stock History</h2>
          <p id="stockHistoryProduct"></p>
        </div>

        <button
          type="button"
          class="stock-history-close"
          aria-label="Close stock history"
        >&times;</button>
      </div>

      <div class="stock-history-table-wrap">
        <table class="stock-history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Activity</th>
              <th>Change</th>
              <th>Balance</th>
              <th>Unit Cost</th>
            </tr>
          </thead>
          <tbody id="stockHistoryRows"></tbody>
        </table>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector(
    ".stock-history-close"
  ).addEventListener("click", closeHistoryModal);

  modal.addEventListener("click", event => {
    if (event.target === modal) {
      closeHistoryModal();
    }
  });

  historyModal = modal;
  return modal;
}

function showProductHistory(productId) {
  const product = products.find(
    item => item.id === productId
  );

  if (!product) return;

  // Reload to include sales made on another page.
  stockHistory = loadArray(HISTORY_KEY);

  const movements = stockHistory
    .filter(item => item.productId === productId)
    .sort(
      (a, b) =>
        new Date(b.date) - new Date(a.date)
    );

  const modal = createHistoryModal();

  modal.querySelector(
    "#stockHistoryProduct"
  ).textContent = product.name;

  const rows = modal.querySelector(
    "#stockHistoryRows"
  );

  rows.replaceChildren();

  if (movements.length === 0) {
    const row = rows.insertRow();
    const cell = row.insertCell();

    cell.colSpan = 5;
    cell.textContent =
      "No stock history recorded for this product.";
    cell.className = "stock-history-empty";
  } else {
    movements.forEach(movement => {
      const row = rows.insertRow();

      const date = new Date(
        movement.date
      ).toLocaleString("en-TZ");

      const quantity = Number(movement.quantity);

      const change =
        quantity > 0
          ? `+${quantity}`
          : String(quantity);

      const dateCell = row.insertCell();
      dateCell.textContent = date;

      const typeCell = row.insertCell();
      typeCell.textContent = movement.type;

      const changeCell = row.insertCell();
      changeCell.textContent = change;
      changeCell.className =
        quantity < 0
          ? "stock-change-negative"
          : "stock-change-positive";

      const balanceCell = row.insertCell();
      balanceCell.textContent =
        movement.newQuantity;

      const costCell = row.insertCell();
      costCell.textContent =
        formatMoney(movement.unitCost);
    });
  }

  lastHistoryTrigger = document.activeElement;

  modal.hidden = false;
  document.body.classList.add(
    "stock-history-open"
  );

  modal.querySelector(
    ".stock-history-close"
  ).focus();
}

function closeHistoryModal() {
  if (!historyModal || historyModal.hidden) return;

  historyModal.hidden = true;

  document.body.classList.remove(
    "stock-history-open"
  );

  if (
    lastHistoryTrigger &&
    typeof lastHistoryTrigger.focus === "function"
  ) {
    lastHistoryTrigger.focus();
  }
}

document.addEventListener("keydown", event => {
  if (
    event.key === "Escape" &&
    historyModal &&
    !historyModal.hidden
  ) {
    closeHistoryModal();
  }
});

// --------------------------------
// THEME
// --------------------------------

function applyTheme(theme) {
  const isDark = theme === "dark";

  document.documentElement.classList.toggle(
    "dark",
    isDark
  );

  document.body.classList.toggle(
    "dark",
    isDark
  );

  if (themeToggle) {
    themeToggle.textContent =
      isDark ? "☀️" : "🌙";
  }
}

// --------------------------------
// INITIALIZATION
// --------------------------------

if (form) {
  form.addEventListener("submit", addProduct);
}

if (search) {
  search.addEventListener("input", renderProducts);
}

applyTheme(
  localStorage.getItem("timidy-theme") === "dark"
    ? "dark"
    : "light"
);

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const next =
      document.body.classList.contains("dark")
        ? "light"
        : "dark";

    localStorage.setItem("timidy-theme", next);
    applyTheme(next);
  });
}

renderProducts();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}

