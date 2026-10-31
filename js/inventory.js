
"use strict";

// ========================================
// TIMIDY STORE — SUPABASE INVENTORY
// Optimized loading, search and rendering
// ========================================

const db = window.timidySupabase;

if (!db) {
  throw new Error("Supabase is not configured.");
}

const form = document.getElementById("productForm");
const table = document.getElementById("inventoryTable");
const search = document.getElementById("searchProduct");

let products = [];
let productById = new Map();

let busy = false;
let initialized = false;
let lastDataRefresh = 0;
let refreshPromise = null;

const INVENTORY_REFRESH_INTERVAL = 60 * 1000;

// Search debounce timer
let searchTimer = null;

// History modal state
let historyModal = null;
let lastHistoryTrigger = null;
let historyRequestId = 0;

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

const formatMoney = amount =>
  "TZS " + Number(amount || 0).toLocaleString(
    "en-TZ",
    { maximumFractionDigits: 2 }
  );

function showError(message, error) {
  console.error(message, error);

  alert(
    `${message}\n` +
    (error?.message || "Please try again.")
  );
}

function setBusy(value) {
  busy = value;

  if (form) {
    const submit = form.querySelector(
      '[type="submit"]'
    );

    if (submit) {
      submit.disabled = value;
    }
  }

  if (table) {
    table.querySelectorAll("button").forEach(
      button => {
        button.disabled = value;
      }
    );
  }
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    purchasePrice: Number(
      row.purchase_price || 0
    ),
    sellingPrice: Number(
      row.selling_price || 0
    ),
    quantity: Number(
      row.quantity || 0
    ),
    minimumStock: Number(
      row.minimum_stock || 0
    )
  };
}

function mapMovement(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    type: row.type,
    quantity: Number(row.quantity || 0),
    previousQuantity: Number(
      row.previous_quantity || 0
    ),
    newQuantity: Number(
      row.new_quantity || 0
    ),
    unitCost: Number(
      row.unit_cost || 0
    ),
    note: row.note,
    date: row.date
  };
}

// ========================================
// SUPABASE DATA LOADING
// ========================================

// Keep a single in-flight inventory fetch.
// This avoids overlapping refresh requests.

async function loadProducts() {
  if (refreshPromise) {
    return refreshPromise;
  }

  const request = (async () => {
    const { data, error } = await db
      .from("inventory")
      .select(
        "id,name,category,purchase_price," +
        "selling_price,quantity,minimum_stock"
      )
      .order("name", {
        ascending: true
      });

    if (error) {
      throw error;
    }

    const nextProducts = (
      data || []
    ).map(mapProduct);

    // Update state only after success.
    products = nextProducts;

    productById = new Map(
      products.map(product => [
        product.id,
        product
      ])
    );

    lastDataRefresh = Date.now();
    initialized = true;

    renderProducts();
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

async function loadProductHistory(productId) {
  const { data, error } = await db
    .from("stock_history")
    .select(
      "id,product_id,product_name,type," +
      "quantity,previous_quantity,new_quantity," +
      "unit_cost,note,date"
    )
    .eq("product_id", productId)
    .order("date", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  return (data || []).map(mapMovement);
}

// ========================================
// STOCK STATUS
// ========================================

function getStatus(product) {
  if (product.quantity === 0) {
    return {
      label: "Out of Stock",
      className: "middleman"
    };
  }

  if (
    product.quantity <=
    product.minimumStock
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

// ========================================
// INVENTORY SUMMARY
// ========================================

// Calculate all summary values in one pass.

function updateSummary() {
  let totalUnits = 0;
  let inventoryValue = 0;
  let lowStockCount = 0;

  for (const product of products) {
    totalUnits += product.quantity;

    inventoryValue +=
      product.quantity *
      product.purchasePrice;

    if (
      product.quantity <=
      product.minimumStock
    ) {
      lowStockCount++;
    }
  }

  const summary = {
    totalProducts: products.length,
    totalUnits,
    inventoryValue: formatMoney(
      inventoryValue
    ),
    lowStockCount
  };

  Object.entries(summary).forEach(
    ([id, value]) => {
      const element =
        document.getElementById(id);

      if (element) {
        element.textContent = value;
      }
    }
  );
}

// ========================================
// INVENTORY TABLE
// ========================================

// Buttons use data attributes instead of
// creating three listeners per product.

function makeActionButton(
  label,
  className,
  action,
  productId
) {
  const button =
    document.createElement("button");

  button.type = "button";

  button.className =
    `inventory-action-btn ${className}`;

  button.textContent = label;
  button.dataset.action = action;
  button.dataset.productId = productId;
  button.disabled = busy;

  return button;
}

function renderProducts() {
  if (!table) return;

  const term = search
    ? search.value.trim().toLowerCase()
    : "";

  const fragment =
    document.createDocumentFragment();

  let matches = 0;

  for (const product of products) {
    if (
      term &&
      !product.name.toLowerCase().includes(
        term
      )
    ) {
      continue;
    }

    matches++;

    const status = getStatus(product);

    const row =
      document.createElement("tr");

    [
      product.name,
      product.category,
      formatMoney(product.purchasePrice),
      formatMoney(product.sellingPrice),
      product.quantity
    ].forEach(value => {
      const cell =
        document.createElement("td");

      cell.textContent = value ?? "";

      row.appendChild(cell);
    });

    // Stock status
    const statusCell =
      document.createElement("td");

    const badge =
      document.createElement("span");

    badge.className =
      `tag ${status.className}`;

    badge.textContent = status.label;

    statusCell.appendChild(badge);
    row.appendChild(statusCell);

    // Action buttons
    const actionsCell =
      document.createElement("td");

    actionsCell.className =
      "inventory-actions";

    actionsCell.append(
      makeActionButton(
        "Edit",
        "edit-btn",
        "edit",
        product.id
      ),
      makeActionButton(
        "Restock",
        "restock-btn",
        "restock",
        product.id
      ),
      makeActionButton(
        "History",
        "history-btn",
        "history",
        product.id
      )
    );

    row.appendChild(actionsCell);
    fragment.appendChild(row);
  }

  if (matches === 0) {
    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 7;
    cell.textContent = "No products found.";
    cell.style.textAlign = "center";
    cell.style.padding = "24px";

    row.appendChild(cell);
    fragment.appendChild(row);
  }

  // One table update instead of
  // inserting each row individually.
  table.replaceChildren(fragment);

  // Summary always covers ALL products,
  // not just filtered search results.
  updateSummary();
}

// ========================================
// DELEGATED TABLE ACTIONS
// ========================================

if (table) {
  table.addEventListener(
    "click",
    event => {
      if (busy) return;

      const button = event.target.closest(
        "button[data-action][data-product-id]"
      );

      if (
        !button ||
        !table.contains(button)
      ) {
        return;
      }

      const productId =
        button.dataset.productId;

      switch (button.dataset.action) {
        case "edit":
          openEditProduct(productId);
          break;

        case "restock":
          openRestockProduct(productId);
          break;

        case "history":
          showProductHistory(productId);
          break;
      }
    }
  );
}

// ========================================
// ADD PRODUCT
// ========================================

async function addProduct(event) {
  event.preventDefault();

  if (busy) return;

  const name = document
    .getElementById("productName")
    .value.trim();

  const category = document
    .getElementById("category")
    .value.trim();

  const purchasePriceInput = document
    .getElementById("purchasePrice")
    .value;

  const sellingPriceInput = document
    .getElementById("sellingPrice")
    .value;

  const quantityInput = document
    .getElementById("quantity")
    .value;

  const minimumStockInput = document
    .getElementById("minimumStock")
    .value;

  const purchasePrice =
    Number(purchasePriceInput);

  const sellingPrice =
    Number(sellingPriceInput);

  const quantity =
    Number(quantityInput);

  const minimumStock =
    Number(minimumStockInput);

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
    alert(
      "Please enter valid product details."
    );

    return;
  }

  const normalizedName =
    name.toLowerCase();

  const duplicate = products.some(
    product =>
      product.name.trim().toLowerCase() ===
      normalizedName
  );

  if (duplicate) {
    alert(
      "This product already exists.\n" +
      "Use Restock instead."
    );

    return;
  }

  setBusy(true);

  let committed = false;

  try {
    // Keep the existing atomic RPC.
    const { error } = await db.rpc(
      "timidy_add_product",
      {
        p_id: createId(),
        p_name: name,
        p_category: category,
        p_purchase_price: purchasePrice,
        p_selling_price: sellingPrice,
        p_quantity: quantity,
        p_minimum_stock: minimumStock,
        p_history_id: createId()
      }
    );

    if (error) throw error;

    committed = true;

    form.reset();

    document.getElementById(
      "minimumStock"
    ).value = 3;

    await loadProducts();

    alert(
      "Product added successfully!"
    );
  } catch (error) {
    if (committed) {
      showError(
        "Product was added, but inventory " +
        "refresh failed. Reload the page " +
        "before trying again.",
        error
      );
    } else {
      showError(
        "Unable to confirm product addition. " +
        "Check inventory before retrying.",
        error
      );
    }
  } finally {
    setBusy(false);
  }
}

// ========================================
// EDIT PRODUCT
// ========================================

async function openEditProduct(productId) {
  if (busy) return;

  const product =
    productById.get(productId);

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

  const sellingPrice =
    Number(priceInput);

  const minimumStock =
    Number(minimumInput);

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
    alert(
      "Please enter valid product details."
    );

    return;
  }

  const normalizedName =
    name.toLowerCase();

  const duplicate = products.some(
    item =>
      item.id !== product.id &&
      item.name.trim().toLowerCase() ===
        normalizedName
  );

  if (duplicate) {
    alert(
      "Another product already uses that name."
    );

    return;
  }

  setBusy(true);

  let committed = false;

  try {
    // Keep the existing permitted update.
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

    if (
      !data ||
      data.length !== 1
    ) {
      throw new Error(
        "Product update was not confirmed."
      );
    }

    committed = true;

    await loadProducts();

    alert(
      "Product updated successfully!"
    );
  } catch (error) {
    showError(
      committed
        ? "Product updated, but refresh failed. " +
          "Reload the page."
        : "Unable to confirm product changes.",
      error
    );
  } finally {
    setBusy(false);
  }
}

// ========================================
// RESTOCK PRODUCT
// ========================================

async function openRestockProduct(productId) {
  if (busy) return;

  const product =
    productById.get(productId);

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

  const addedQuantity =
    Number(quantityInput);

  const newUnitCost =
    Number(costInput);

  if (
    quantityInput.trim() === "" ||
    costInput.trim() === "" ||
    !Number.isInteger(addedQuantity) ||
    addedQuantity <= 0 ||
    !Number.isFinite(newUnitCost) ||
    newUnitCost < 0
  ) {
    alert(
      "Enter a valid quantity and purchase cost."
    );

    return;
  }

  setBusy(true);

  let committed = false;
  let result = null;

  try {
    // Keep the existing atomic RPC.
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

    if (
      !Array.isArray(data) ||
      data.length !== 1
    ) {
      throw new Error(
        "Restock result was not confirmed."
      );
    }

    result = data[0];
    committed = true;

    await loadProducts();

    alert(
      `Added ${addedQuantity} units successfully!\n` +
      `New stock: ${result.new_quantity} units\n` +
      `Average cost: ${formatMoney(result.average_cost)}`
    );
  } catch (error) {
    showError(
      committed
        ? "Restock saved, but refresh failed. " +
          "Reload the page before restocking again."
        : "Unable to confirm restock. " +
          "Check inventory before retrying.",
      error
    );
  } finally {
    setBusy(false);
  }
}

// ========================================
// STOCK HISTORY MODAL
// ========================================

function createHistoryModal() {
  if (historyModal) {
    return historyModal;
  }

  const modal =
    document.createElement("div");

  modal.className =
    "stock-history-overlay";

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
          <h2 id="stockHistoryTitle">
            Stock History
          </h2>
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
  ).addEventListener(
    "click",
    closeHistoryModal
  );

  modal.addEventListener(
    "click",
    event => {
      if (event.target === modal) {
        closeHistoryModal();
      }
    }
  );

  historyModal = modal;

  return modal;
}

function showHistoryMessage(rows, text) {
  rows.replaceChildren();

  const row = rows.insertRow();
  const cell = row.insertCell();

  cell.colSpan = 5;
  cell.textContent = text;
  cell.className =
    "stock-history-empty";
}

async function showProductHistory(productId) {
  if (busy) return;

  const product =
    productById.get(productId);

  if (!product) return;

  const modal =
    createHistoryModal();

  const requestId =
    ++historyRequestId;

  modal.querySelector(
    "#stockHistoryProduct"
  ).textContent = product.name;

  const rows = modal.querySelector(
    "#stockHistoryRows"
  );

  showHistoryMessage(
    rows,
    "Loading stock history..."
  );

  lastHistoryTrigger =
    document.activeElement;

  modal.hidden = false;

  document.body.classList.add(
    "stock-history-open"
  );

  modal.querySelector(
    ".stock-history-close"
  ).focus();

  try {
    const movements =
      await loadProductHistory(productId);

    // Ignore outdated requests if the
    // modal was closed or another product
    // was selected during loading.
    if (
      modal.hidden ||
      requestId !== historyRequestId
    ) {
      return;
    }

    if (movements.length === 0) {
      showHistoryMessage(
        rows,
        "No stock history recorded for this product."
      );

      return;
    }

    const fragment =
      document.createDocumentFragment();

    movements.forEach(movement => {
      const row =
        document.createElement("tr");

      const date = new Date(
        movement.date
      ).toLocaleString("en-TZ");

      const quantity =
        movement.quantity;

      const change =
        quantity > 0
          ? `+${quantity}`
          : String(quantity);

      const dateCell =
        document.createElement("td");

      dateCell.textContent = date;

      const typeCell =
        document.createElement("td");

      typeCell.textContent =
        movement.type || "";

      const changeCell =
        document.createElement("td");

      changeCell.textContent = change;

      changeCell.className =
        quantity < 0
          ? "stock-change-negative"
          : "stock-change-positive";

      const balanceCell =
        document.createElement("td");

      balanceCell.textContent =
        movement.newQuantity;

      const costCell =
        document.createElement("td");

      costCell.textContent =
        formatMoney(movement.unitCost);

      row.append(
        dateCell,
        typeCell,
        changeCell,
        balanceCell,
        costCell
      );

      fragment.appendChild(row);
    });

    rows.replaceChildren(fragment);
  } catch (error) {
    if (
      modal.hidden ||
      requestId !== historyRequestId
    ) {
      return;
    }

    console.error(
      "Unable to load stock history:",
      error
    );

    showHistoryMessage(
      rows,
      "Unable to load stock history."
    );
  }
}

function closeHistoryModal() {
  if (
    !historyModal ||
    historyModal.hidden
  ) {
    return;
  }

  // Invalidate any outstanding history
  // request for the closed modal.
  historyRequestId++;

  historyModal.hidden = true;

  document.body.classList.remove(
    "stock-history-open"
  );

  if (
    lastHistoryTrigger &&
    typeof lastHistoryTrigger.focus ===
      "function"
  ) {
    lastHistoryTrigger.focus();
  }
}

document.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Escape" &&
      historyModal &&
      !historyModal.hidden
    ) {
      closeHistoryModal();
    }
  }
);

// ========================================
// SEARCH — DEBOUNCED
// ========================================

if (search) {
  search.addEventListener(
    "input",
    () => {
      clearTimeout(searchTimer);

      searchTimer = setTimeout(
        renderProducts,
        150
      );
    }
  );
}

// ========================================
// FORM EVENTS
// ========================================

if (form) {
  form.addEventListener(
    "submit",
    addProduct
  );
}

// ========================================
// INITIALIZATION
// ========================================

async function initializeInventory() {
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

    await loadProducts();
  } catch (error) {
    showError(
      "Unable to load inventory.",
      error
    );
  } finally {
    setBusy(false);
  }
}

initializeInventory();

// ========================================
// REFRESH WHEN RETURNING TO TAB
// ========================================

// Don't reload on every quick tab switch.
// Refresh when the data is over 60 seconds
// old, keeping inventory reasonably fresh.

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

    const age =
      Date.now() - lastDataRefresh;

    if (
      age < INVENTORY_REFRESH_INTERVAL
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

      await loadProducts();
    } catch (error) {
      console.error(
        "Inventory background refresh failed:",
        error
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
