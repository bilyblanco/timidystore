
"use strict";

// ========================================
// TIMIDY STORE — SUPABASE INVENTORY
// ========================================

const db = window.timidySupabase;

if (!db) {
  throw new Error("Supabase is not configured.");
}

let products = [];
let stockHistory = [];
let busy = false;

const form = document.getElementById("productForm");
const table = document.getElementById("inventoryTable");
const search = document.getElementById("searchProduct");

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

const formatMoney = amount =>
  "TZS " + Number(amount || 0).toLocaleString("en-TZ", {
    maximumFractionDigits: 2
  });

function showError(message, error) {
  console.error(message, error);
  alert(`${message}\n${error?.message || "Please try again."}`);
}

function setBusy(value) {
  busy = value;

  if (form) {
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = value;
  }

  if (table) {
    table.querySelectorAll("button").forEach(button => {
      button.disabled = value;
    });
  }
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    purchasePrice: Number(row.purchase_price),
    sellingPrice: Number(row.selling_price),
    quantity: Number(row.quantity),
    minimumStock: Number(row.minimum_stock)
  };
}

function mapMovement(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    type: row.type,
    quantity: Number(row.quantity),
    previousQuantity: Number(row.previous_quantity),
    newQuantity: Number(row.new_quantity),
    unitCost: Number(row.unit_cost),
    note: row.note,
    date: row.date
  };
}

// ----------------------------------------
// SUPABASE DATA LOADING
// ----------------------------------------

async function loadProducts() {
  const { data, error } = await db
    .from("inventory")
    .select(
      "id, name, category, purchase_price, selling_price, quantity, minimum_stock"
    )
    .order("name", { ascending: true });

  if (error) throw error;

  products = (data || []).map(mapProduct);
  renderProducts();
}

async function loadProductHistory(productId) {
  const { data, error } = await db
    .from("stock_history")
    .select(
      "id, product_id, product_name, type, quantity, previous_quantity, new_quantity, unit_cost, note, date"
    )
    .eq("product_id", productId)
    .order("date", { ascending: false });

  if (error) throw error;

  stockHistory = (data || []).map(mapMovement);
  return stockHistory;
}

// ----------------------------------------
// STOCK STATUS
// ----------------------------------------

function getStatus(product) {
  if (product.quantity === 0) {
    return {
      label: "Out of Stock",
      className: "middleman"
    };
  }

  if (product.quantity <= product.minimumStock) {
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

// ----------------------------------------
// INVENTORY SUMMARY
// ----------------------------------------

function updateSummary() {
  const totalUnits = products.reduce(
    (sum, product) => sum + product.quantity,
    0
  );

  const inventoryValue = products.reduce(
    (sum, product) =>
      sum + product.quantity * product.purchasePrice,
    0
  );

  const alerts = products.filter(
    product => product.quantity <= product.minimumStock
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

// ----------------------------------------
// INVENTORY TABLE
// ----------------------------------------

function makeActionButton(label, className, onClick) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = `inventory-action-btn ${className}`;
  button.textContent = label;
  button.disabled = busy;
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
    product.name.toLowerCase().includes(term)
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

// ----------------------------------------
// ADD PRODUCT
// ----------------------------------------

async function addProduct(event) {
  event.preventDefault();

  if (busy) return;

  const name = document
    .getElementById("productName").value.trim();

  const category = document
    .getElementById("category").value.trim();

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
    alert("This product already exists.\nUse Restock instead.");
    return;
  }

  setBusy(true);

  try {
    const { error } = await db.rpc("timidy_add_product", {
      p_id: createId(),
      p_name: name,
      p_category: category,
      p_purchase_price: purchasePrice,
      p_selling_price: sellingPrice,
      p_quantity: quantity,
      p_minimum_stock: minimumStock,
      p_history_id: createId()
    });

    if (error) throw error;

    form.reset();

    document.getElementById("minimumStock").value = 3;

    await loadProducts();

    alert("Product added successfully!");
  } catch (error) {
    showError("Unable to add product.", error);
  } finally {
    setBusy(false);
  }
}

// ----------------------------------------
// EDIT PRODUCT
// ----------------------------------------

async function openEditProduct(productId) {
  if (busy) return;

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

  setBusy(true);

  try {
    const { data, error } = await db
      .from("inventory")
      .update({
        name,
        category,
        selling_price: sellingPrice,
        minimum_stock: minimumStock
      })
      .eq("id", productId)
      .select("id");

    if (error) throw error;

    if (!data || data.length !== 1) {
      throw new Error("Product update was not confirmed.");
    }

    await loadProducts();

    alert("Product updated successfully!");
  } catch (error) {
    showError("Unable to save changes.", error);
  } finally {
    setBusy(false);
  }
}

// ----------------------------------------
// RESTOCK PRODUCT
// ----------------------------------------

async function openRestockProduct(productId) {
  if (busy) return;

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

  setBusy(true);

  try {
    const { data, error } = await db.rpc(
      "timidy_restock_product",
      {
        p_product_id: productId,
        p_added_quantity: addedQuantity,
        p_new_unit_cost: newUnitCost,
        p_history_id: createId()
      }
    );

    if (error) throw error;

    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error("Restock result was not confirmed.");
    }

    const result = data[0];

    await loadProducts();

    alert(
      `Added ${addedQuantity} units successfully!\n` +
      `New stock: ${result.new_quantity} units\n` +
      `Average cost: ${formatMoney(result.average_cost)}`
    );
  } catch (error) {
    showError("Unable to save restock.", error);
  } finally {
    setBusy(false);
  }
}

// ----------------------------------------
// STOCK HISTORY MODAL
// ----------------------------------------

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

async function showProductHistory(productId) {
  if (busy) return;

  const product = products.find(
    item => item.id === productId
  );

  if (!product) return;

  const modal = createHistoryModal();

  modal.querySelector(
    "#stockHistoryProduct"
  ).textContent = product.name;

  const rows = modal.querySelector(
    "#stockHistoryRows"
  );

  rows.replaceChildren();

  const loadingRow = rows.insertRow();
  const loadingCell = loadingRow.insertCell();
  loadingCell.colSpan = 5;
  loadingCell.textContent = "Loading stock history...";
  loadingCell.className = "stock-history-empty";

  lastHistoryTrigger = document.activeElement;

  modal.hidden = false;
  document.body.classList.add("stock-history-open");

  modal.querySelector(
    ".stock-history-close"
  ).focus();

  try {
    const movements = await loadProductHistory(productId);

    // The user may have closed the modal while data loaded.
    if (modal.hidden) return;

    rows.replaceChildren();

    if (movements.length === 0) {
      const row = rows.insertRow();
      const cell = row.insertCell();

      cell.colSpan = 5;
      cell.textContent =
        "No stock history recorded for this product.";
      cell.className = "stock-history-empty";

      return;
    }

    movements.forEach(movement => {
      const row = rows.insertRow();

      const date = new Date(
        movement.date
      ).toLocaleString("en-TZ");

      const quantity = movement.quantity;

      const change =
        quantity > 0
          ? `+${quantity}`
          : String(quantity);

      row.insertCell().textContent = date;
      row.insertCell().textContent = movement.type;

      const changeCell = row.insertCell();
      changeCell.textContent = change;
      changeCell.className =
        quantity < 0
          ? "stock-change-negative"
          : "stock-change-positive";

      row.insertCell().textContent = movement.newQuantity;
      row.insertCell().textContent =
        formatMoney(movement.unitCost);
    });
  } catch (error) {
    console.error("Unable to load stock history:", error);

    rows.replaceChildren();

    const row = rows.insertRow();
    const cell = row.insertCell();

    cell.colSpan = 5;
    cell.textContent = "Unable to load stock history.";
    cell.className = "stock-history-empty";
  }
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

// ----------------------------------------
// INITIALIZATION
// ----------------------------------------

if (form) {
  form.addEventListener("submit", addProduct);
}

if (search) {
  search.addEventListener("input", renderProducts);
}

async function initializeInventory() {
  setBusy(true);

  try {
    const user = await window.TimidyAuth.getAuthorizedUser();

    if (!user) {
      window.location.replace("login.html");
      return;
    }

    await loadProducts();
  } catch (error) {
    showError("Unable to load inventory.", error);
  } finally {
    setBusy(false);
  }
}

initializeInventory();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
