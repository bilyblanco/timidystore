"use strict";

// ========================================
// TIMIDY STORE — INVENTORY MANAGEMENT
// ========================================
//
// Features:
// - Add product
// - Edit product details
// - Restock product
// - Adjust stock with reason
// - Archive / Restore
// - Explicit permanent deletion
// - Stock history with notes
// - Active / Archived / All filters
// - Search
// - Product Actions popup
// - Protected Supabase operations
// - Background refresh
//
// ========================================

const db = window.timidySupabase;

if (!db) {
  throw new Error("Supabase is not configured.");
}


// ========================================
// PRIVACY-SAFE TECHNICAL ERROR REPORTING
// ========================================
// Only fixed module/operation labels and a
// whitelisted PostgreSQL/HTTP error code.
// Never transmits messages or business values.

const INVENTORY_SAFE_OPERATIONS = new Set([
  "load", "history", "add", "edit", "restock",
  "adjust", "archive", "restore", "delete",
  "background_refresh"
]);

function reportInventoryError(operation, error) {
  if (!INVENTORY_SAFE_OPERATIONS.has(operation)) return;

  const rawCode = String(error?.code || "");
  const code = /^(?:[0-9A-Z]{5}|PGRST[0-9]{3}|HTTP_[45][0-9]{2})$/.test(rawCode)
    ? rawCode
    : "UNCLASSIFIED";

  // Fire-and-forget: logging cannot change inventory outcomes.
  try {
    void db.rpc("timidy_report_technical_error", {
      p_module: "inventory",
      p_operation: operation,
      p_code: code
    }).then(({ error: reportError }) => {
      if (reportError) {
        console.warn("Technical error reporting unavailable.");
      }
    }).catch(() => {
      console.warn("Technical error reporting unavailable.");
    });
  } catch (_) {
    // Reporting is never allowed to interrupt store operations.
  }
}

// ========================================
// ELEMENTS
// ========================================

const form = document.getElementById("productForm");
const table = document.getElementById("inventoryTable");
const search = document.getElementById("searchProduct");
const filterTabs = document.getElementById("inventoryFilterTabs");
const message = document.getElementById("inventoryMessage");

const INVENTORY_REFRESH_INTERVAL = 60 * 1000;

// ========================================
// STATE
// ========================================

let products = [];
let productById = new Map();

let busy = false;
let initialized = false;
let lastDataRefresh = 0;
let refreshPromise = null;
let searchTimer = null;

let selectedInventoryFilter = "active";

let historyModal = null;
let lastHistoryTrigger = null;
let historyRequestId = 0;

let productActionsModal = null;
let activeActionsProductId = null;
let lastActionsTrigger = null;

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

function formatMoney(amount) {
  return (
    "TZS " +
    Number(amount || 0).toLocaleString(
      "en-TZ",
      {
        maximumFractionDigits: 2
      }
    )
  );
}

function showMessage(text, type = "") {
  if (!message) return;

  message.textContent = text;
  message.className = "sale-message " + type;

  message.setAttribute(
    "role",
    type === "error" ? "alert" : "status"
  );
}

function showError(text, error) {
  console.error(text, error);

  showMessage(
    text + "\n" +
    (error?.message || "Please try again."),
    "error"
  );
}

function refreshIcons() {
  if (
    typeof lucide !== "undefined" &&
    typeof lucide.createIcons === "function"
  ) {
    lucide.createIcons();
  }
}

function setBusy(value) {
  busy = value;

  if (form) {
    form.querySelectorAll(
      "input, select, button"
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

  if (filterTabs) {
    filterTabs.querySelectorAll(
      "button"
    ).forEach(button => {
      button.disabled = value;
    });
  }

  if (productActionsModal) {
    productActionsModal.querySelectorAll(
      "button"
    ).forEach(button => {
      button.disabled = value;
    });
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
    ),

    isArchived:
      row.is_archived === true
  };
}

function mapMovement(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    type: row.type,

    quantity: Number(
      row.quantity || 0
    ),

    previousQuantity: Number(
      row.previous_quantity || 0
    ),

    newQuantity: Number(
      row.new_quantity || 0
    ),

    unitCost: Number(
      row.unit_cost || 0
    ),

    note: row.note || "",
    date: row.date
  };
}

// ========================================
// LOAD PRODUCTS
// ========================================

async function loadProducts() {
  if (refreshPromise) {
    return refreshPromise;
  }

  const request = (async () => {
    const { data, error } = await db
      .from("inventory")
      .select(
        "id,name,category,purchase_price," +
        "selling_price,quantity,minimum_stock," +
        "is_archived"
      )
      .order(
        "name",
        { ascending: true }
      );

    if (error) {
      throw error;
    }

    products = (data || []).map(mapProduct);

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
    .order(
      "date",
      { ascending: false }
    );

  if (error) {
    throw error;
  }

  return (data || []).map(mapMovement);
}

// ========================================
// PRODUCT STATUS
// ========================================

function getStatus(product) {
  if (product.isArchived) {
    return {
      label: "Archived",
      className: "inventory-archived-tag"
    };
  }

  if (product.quantity === 0) {
    return {
      label: "Out of Stock",
      className: "tag middleman"
    };
  }

  if (
    product.quantity <=
    product.minimumStock
  ) {
    return {
      label: "Low Stock",
      className: "tag middleman"
    };
  }

  return {
    label: "In Stock",
    className: "tag stock"
  };
}

// ========================================
// SUMMARY CARDS
// ========================================

function updateSummary() {
  let totalProducts = 0;
  let totalUnits = 0;
  let inventoryValue = 0;
  let lowStockCount = 0;

  for (const product of products) {
    if (product.isArchived) {
      continue;
    }

    totalProducts++;

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
    totalProducts,
    totalUnits,
    inventoryValue:
      formatMoney(inventoryValue),
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

function makeActionsButton(product) {
  const button =
    document.createElement("button");

  button.type = "button";
  button.className =
    "inventory-action-trigger";

  button.dataset.action = "actions";
  button.dataset.productId = product.id;

  button.disabled = busy;

  button.setAttribute(
    "aria-label",
    `Open actions for ${product.name}`
  );

  const icon = document.createElement("i");
  icon.setAttribute(
    "data-lucide",
    "settings-2"
  );
  icon.setAttribute(
    "aria-hidden",
    "true"
  );

  const label =
    document.createElement("span");

  label.textContent = "Actions";

  const arrow =
    document.createElement("i");

  arrow.setAttribute(
    "data-lucide",
    "chevron-right"
  );

  arrow.setAttribute(
    "aria-hidden",
    "true"
  );

  button.append(
    icon,
    label,
    arrow
  );

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
    // Filter archived / active products.
    if (
      selectedInventoryFilter === "active" &&
      product.isArchived
    ) {
      continue;
    }

    if (
      selectedInventoryFilter === "archived" &&
      !product.isArchived
    ) {
      continue;
    }

    // Search product name and category.
    if (
      term &&
      !product.name
        .toLowerCase()
        .includes(term) &&
      !String(product.category || "")
        .toLowerCase()
        .includes(term)
    ) {
      continue;
    }

    matches++;

    const row =
      document.createElement("tr");

    if (product.isArchived) {
      row.classList.add(
        "inventory-archived-row"
      );
    }

    const values = [
      product.name,
      product.category,
      formatMoney(product.purchasePrice),
      formatMoney(product.sellingPrice),
      product.quantity
    ];

    values.forEach(value => {
      const cell =
        document.createElement("td");

      cell.textContent = value ?? "";

      row.appendChild(cell);
    });

    // Status column.
    const status = getStatus(product);

    const statusCell =
      document.createElement("td");

    const badge =
      document.createElement("span");

    badge.className = status.className;
    badge.textContent = status.label;

    statusCell.appendChild(badge);
    row.appendChild(statusCell);

    // Single Actions button.
    const actionsCell =
      document.createElement("td");

    actionsCell.className =
      "inventory-actions";

    actionsCell.appendChild(
      makeActionsButton(product)
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

    if (
      selectedInventoryFilter === "archived"
    ) {
      cell.textContent =
        "No archived products found.";
    } else if (
      selectedInventoryFilter === "active"
    ) {
      cell.textContent =
        "No active products found.";
    } else {
      cell.textContent =
        "No products found.";
    }

    cell.style.textAlign = "center";
    cell.style.padding = "24px";

    row.appendChild(cell);
    fragment.appendChild(row);
  }

  table.replaceChildren(fragment);

  updateSummary();
  refreshIcons();
}

// ========================================
// INVENTORY TABLE CLICK HANDLER
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

      if (
        button.dataset.action === "actions"
      ) {
        openProductActions(productId);
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
    .value.trim();

  const sellingPriceInput = document
    .getElementById("sellingPrice")
    .value.trim();

  const quantityInput = document
    .getElementById("quantity")
    .value.trim();

  const minimumStockInput = document
    .getElementById("minimumStock")
    .value.trim();

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
    !purchasePriceInput ||
    !sellingPriceInput ||
    !quantityInput ||
    !minimumStockInput ||
    !Number.isFinite(purchasePrice) ||
    purchasePrice < 0 ||
    !Number.isFinite(sellingPrice) ||
    sellingPrice < 0 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    !Number.isInteger(minimumStock) ||
    minimumStock < 0
  ) {
    showMessage(
      "Please enter valid product details.",
      "error"
    );
    return;
  }

  const duplicate = products.some(
    product =>
      product.name.trim().toLowerCase() ===
      name.toLowerCase()
  );

  if (duplicate) {
    showMessage(
      "This product already exists.\n" +
      "Use Restock or Restore instead.",
      "error"
    );
    return;
  }

  setBusy(true);

  let committed = false;

  try {
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

    if (error) {
      throw error;
    }

    committed = true;

    form.reset();

    document.getElementById(
      "minimumStock"
    ).value = 3;

    await loadProducts();

    showMessage(
      "Product added successfully!",
      "success"
    );
  } catch (error) {
    reportInventoryError("add", error);
    showError(
      committed
        ? "Product added, but refresh failed. Reload the page."
        : "Unable to confirm product addition. Check inventory before retrying.",
      error
    );
  } finally {
    setBusy(false);
  }
}

// ========================================
// EDIT PRODUCT
// ========================================
//
// Editing never deletes a product.
// All four fields must remain valid.
//
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
    showMessage(
      "Please enter valid product details.",
      "error"
    );
    return;
  }

  const duplicate = products.some(
    item =>
      item.id !== product.id &&
      item.name.trim().toLowerCase() ===
        name.toLowerCase()
  );

  if (duplicate) {
    showMessage(
      "Another product already uses that name.",
      "error"
    );
    return;
  }

  setBusy(true);

  let committed = false;

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

    if (error) {
      throw error;
    }

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

    showMessage(
      "Product updated successfully!",
      "success"
    );
  } catch (error) {
    reportInventoryError("edit", error);
    showError(
      committed
        ? "Product updated, but refresh failed. Reload the page."
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

  if (product.isArchived) {
    showMessage(
      "Restore this product before restocking.",
      "error"
    );
    return;
  }

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
    showMessage(
      "Enter a valid quantity and purchase cost.",
      "error"
    );
    return;
  }

  setBusy(true);

  let committed = false;

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

    if (error) {
      throw error;
    }

    if (
      !Array.isArray(data) ||
      data.length !== 1
    ) {
      throw new Error(
        "Restock result was not confirmed."
      );
    }

    committed = true;

    await loadProducts();

    showMessage(
      `Added ${addedQuantity} units successfully!\n` +
      `New stock: ${data[0].new_quantity} units\n` +
      `Average cost: ${formatMoney(data[0].average_cost)}`,
      "success"
    );
  } catch (error) {
    reportInventoryError("restock", error);
    showError(
      committed
        ? "Restock saved, but refresh failed. Reload before trying again."
        : "Unable to confirm restock. Check inventory before retrying.",
      error
    );
  } finally {
    setBusy(false);
  }
}

// ========================================
// ADJUST STOCK
// ========================================

async function adjustStock(productId) {
  if (busy) return;

  const product =
    productById.get(productId);

  if (!product) return;

  if (product.isArchived) {
    showMessage(
      "Restore this product before adjusting stock.",
      "error"
    );
    return;
  }

  const quantityInput = prompt(
    `Correct physical quantity for "${product.name}":\n\n` +
    `Current recorded stock: ${product.quantity}\n` +
    "Enter the actual quantity now:",
    String(product.quantity)
  );

  if (quantityInput === null) return;

  const newQuantity =
    Number(quantityInput);

  if (
    quantityInput.trim() === "" ||
    !Number.isInteger(newQuantity) ||
    newQuantity < 0 ||
    newQuantity > 2147483647
  ) {
    showMessage(
      "Enter a valid whole-number stock quantity.",
      "error"
    );
    return;
  }

  if (
    newQuantity === product.quantity
  ) {
    showMessage(
      "Stock quantity has not changed.",
      "error"
    );
    return;
  }

  const reasonInput = prompt(
    "Reason for stock adjustment:\n" +
    "e.g. Damaged, missing, counting error, correction"
  );

  if (reasonInput === null) return;

  const reason =
    reasonInput.trim();

  if (
    !reason ||
    reason.length > 1000
  ) {
    showMessage(
      "A reason of 1–1000 characters is required.",
      "error"
    );
    return;
  }

  const difference =
    newQuantity - product.quantity;

  const confirmed = confirm(
    `Adjust stock for "${product.name}"?\n\n` +
    `Current: ${product.quantity}\n` +
    `Corrected: ${newQuantity}\n` +
    `Change: ${difference > 0 ? "+" : ""}${difference}\n\n` +
    `Reason: ${reason}\n\n` +
    "This change will be recorded in stock history."
  );

  if (!confirmed) return;

  setBusy(true);

  let committed = false;

  try {
    const { error } = await db.rpc(
      "timidy_adjust_stock",
      {
        p_product_id: productId,
        p_new_quantity: newQuantity,
        p_reason: reason,
        p_history_id: createId()
      }
    );

    if (error) {
      throw error;
    }

    committed = true;

    await loadProducts();

    showMessage(
      `Stock adjusted successfully!\n` +
      `New quantity: ${newQuantity}\n` +
      `Reason: ${reason}`,
      "success"
    );
  } catch (error) {
    reportInventoryError("adjust", error);
    showError(
      committed
        ? "Adjustment saved, but refresh failed. Reload the page."
        : "Unable to confirm stock adjustment. Check history before retrying.",
      error
    );
  } finally {
    setBusy(false);
  }
}

// ========================================
// ARCHIVE / RESTORE
// ========================================

async function setProductArchived(
  productId,
  shouldArchive
) {
  if (busy) return;

  const product =
    productById.get(productId);

  if (!product) return;

  const action =
    shouldArchive ? "Archive" : "Restore";

  const confirmed = confirm(
    `${action} "${product.name}"?\n\n` +
    (
      shouldArchive
        ? "The product will disappear from active inventory and cannot be sold or restocked until restored.\n\nIts sales and stock history will be preserved."
        : "The product will return to active inventory and become available for stock operations."
    )
  );

  if (!confirmed) return;

  setBusy(true);

  let committed = false;

  try {
    const { error } = await db.rpc(
      "timidy_set_product_archived",
      {
        p_product_id: productId,
        p_is_archived: shouldArchive
      }
    );

    if (error) {
      throw error;
    }

    committed = true;

    await loadProducts();

    showMessage(
      shouldArchive
        ? `"${product.name}" archived successfully!`
        : `"${product.name}" restored successfully!`,
      "success"
    );
  } catch (error) {
    reportInventoryError(shouldArchive ? "archive" : "restore", error);
    showError(
      committed
        ? `${action} succeeded, but refresh failed. Reload the page.`
        : `Unable to ${action.toLowerCase()} product.`,
      error
    );
  } finally {
    setBusy(false);
  }
}

// ========================================
// PERMANENT DELETE
// ========================================

async function deleteProduct(productId) {
  if (busy) return;

  const product =
    productById.get(productId);

  if (!product) return;

  const confirmed = confirm(
    `PERMANENTLY DELETE "${product.name}"?\n\n` +
    "This cannot be undone.\n\n" +
    "The product and its non-sale stock history " +
    "will be removed.\n\n" +
    "Products linked to sales cannot be deleted. " +
    "Use Archive for those products.\n\n" +
    "Continue?"
  );

  if (!confirmed) return;

  const typedName = prompt(
    "To confirm permanent deletion, type the product name exactly:",
    ""
  );

  if (typedName === null) return;

  if (
    typedName.trim() !== product.name
  ) {
    showMessage(
      "Deletion cancelled: product name did not match.",
      "error"
    );
    return;
  }

  setBusy(true);

  let committed = false;

  try {
    const { error } = await db.rpc(
      "timidy_delete_product",
      {
        p_product_id: productId
      }
    );

    if (error) {
      throw error;
    }

    committed = true;

    await loadProducts();

    showMessage(
      `"${product.name}" deleted permanently.`,
      "success"
    );
  } catch (error) {
    reportInventoryError("delete", error);
    showError(
      committed
        ? "Product deleted, but refresh failed. Reload the page."
        : "Unable to delete product. If it has sales history, archive it instead.",
      error
    );
  } finally {
    setBusy(false);
  }
}

// ========================================
// PRODUCT ACTIONS MODAL
// ========================================

function createProductActionsModal() {
  if (productActionsModal) {
    return productActionsModal;
  }

  const overlay =
    document.createElement("div");

  overlay.className =
    "product-actions-overlay";

  overlay.hidden = true;

  overlay.innerHTML = `
    <div
      class="product-actions-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="productActionsTitle"
      tabindex="-1"
    >
      <div class="product-actions-header">
        <div>
          <h2 id="productActionsTitle">
            Product Actions
          </h2>

          <p id="productActionsName"></p>
        </div>

        <button
          type="button"
          class="product-actions-close"
          aria-label="Close product actions"
        >&times;</button>
      </div>

      <div
        id="productActionsGrid"
        class="product-actions-grid"
      ></div>

      <p
        id="productActionsHint"
        class="product-actions-hint"
      ></p>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close button.
  overlay.querySelector(
    ".product-actions-close"
  ).addEventListener(
    "click",
    closeProductActions
  );

  // Clicking outside dialog closes it.
  overlay.addEventListener(
    "click",
    event => {
      if (
        event.target === overlay &&
        !busy
      ) {
        closeProductActions();
      }
    }
  );

  // Action selection.
  overlay.querySelector(
    "#productActionsGrid"
  ).addEventListener(
    "click",
    event => {
      const button = event.target.closest(
        "button[data-product-action]"
      );

      if (
        !button ||
        !activeActionsProductId ||
        busy
      ) {
        return;
      }

      const productId =
        activeActionsProductId;

      const action =
        button.dataset.productAction;

      closeProductActions();

      switch (action) {
        case "edit":
          openEditProduct(productId);
          break;

        case "restock":
          openRestockProduct(productId);
          break;

        case "adjust":
          adjustStock(productId);
          break;

        case "history":
          showProductHistory(productId);
          break;

        case "archive":
          setProductArchived(
            productId,
            true
          );
          break;

        case "restore":
          setProductArchived(
            productId,
            false
          );
          break;

        case "delete":
          deleteProduct(productId);
          break;
      }
    }
  );

  // Keep keyboard focus in dialog.
  overlay.addEventListener(
    "keydown",
    event => {
      if (
        event.key !== "Tab" ||
        overlay.hidden
      ) {
        return;
      }

      const focusable = Array.from(
        overlay.querySelectorAll(
          "button:not(:disabled)"
        )
      );

      if (!focusable.length) return;

      const first = focusable[0];
      const last =
        focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    }
  );

  productActionsModal = overlay;

  return overlay;
}

function makeProductActionCard({
  action,
  title,
  description,
  icon,
  variant = ""
}) {
  const button =
    document.createElement("button");

  button.type = "button";

  button.className =
    `product-action-card ${variant}`.trim();

  button.dataset.productAction = action;

  const iconElement =
    document.createElement("i");

  iconElement.setAttribute(
    "data-lucide",
    icon
  );

  iconElement.setAttribute(
    "aria-hidden",
    "true"
  );

  const content =
    document.createElement("span");

  const heading =
    document.createElement("strong");

  heading.textContent = title;

  const detail =
    document.createElement("small");

  detail.textContent = description;

  content.append(
    heading,
    detail
  );

  button.append(
    iconElement,
    content
  );

  return button;
}

function openProductActions(productId) {
  if (busy) return;

  const product =
    productById.get(productId);

  if (!product) {
    showMessage(
      "Product not found. Refresh inventory.",
      "error"
    );
    return;
  }

  const modal =
    createProductActionsModal();

  activeActionsProductId = productId;
  lastActionsTrigger =
    document.activeElement;

  modal.querySelector(
    "#productActionsName"
  ).textContent =
    `${product.name} · ` +
    `${product.quantity} units · ` +
    (
      product.isArchived
        ? "Archived"
        : "Active"
    );

  const grid =
    modal.querySelector(
      "#productActionsGrid"
    );

  const actions = [
    {
      action: "edit",
      title: "Edit",
      description:
        "Update product details",
      icon: "pencil"
    }
  ];

  // Archived products cannot be
  // restocked or adjusted.
  if (!product.isArchived) {
    actions.push(
      {
        action: "restock",
        title: "Restock",
        description:
          "Add purchased stock",
        icon: "package-plus"
      },
      {
        action: "adjust",
        title: "Adjust Stock",
        description:
          "Correct stock quantity",
        icon: "sliders-horizontal"
      }
    );
  }

  actions.push({
    action: "history",
    title: "Stock History",
    description:
      "View all stock movements",
    icon: "history"
  });

  if (product.isArchived) {
    actions.push({
      action: "restore",
      title: "Restore",
      description:
        "Return to active stock",
      icon: "archive-restore",
      variant: "restore"
    });
  } else {
    actions.push({
      action: "archive",
      title: "Archive",
      description:
        "Hide from active sales",
      icon: "archive"
    });
  }

  actions.push({
    action: "delete",
    title: "Delete",
    description:
      "Permanently remove unsold product",
    icon: "trash-2",
    variant: "danger"
  });

  const fragment =
    document.createDocumentFragment();

  actions.forEach(action => {
    fragment.appendChild(
      makeProductActionCard(action)
    );
  });

  grid.replaceChildren(fragment);

  modal.querySelector(
    "#productActionsHint"
  ).textContent =
    product.isArchived
      ? "Restore this product before restocking, adjusting, or selling it."
      : "Archiving preserves history. Permanent deletion is restricted for products with sales.";

  modal.hidden = false;

  document.body.classList.add(
    "product-actions-open"
  );

  refreshIcons();

  modal.querySelector(
    ".product-actions-close"
  ).focus();
}

function closeProductActions() {
  if (
    !productActionsModal ||
    productActionsModal.hidden
  ) {
    return;
  }

  productActionsModal.hidden = true;
  activeActionsProductId = null;

  document.body.classList.remove(
    "product-actions-open"
  );

  if (
    lastActionsTrigger &&
    lastActionsTrigger.isConnected &&
    typeof lastActionsTrigger.focus ===
      "function"
  ) {
    lastActionsTrigger.focus();
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
              <th>Activity / Reason</th>
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

  const rows =
    modal.querySelector(
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

      const timestamp =
        new Date(movement.date);

      const date =
        Number.isNaN(timestamp.getTime())
          ? String(movement.date || "")
          : timestamp.toLocaleString("en-TZ");

      const quantity =
        movement.quantity;

      const change =
        quantity > 0
          ? `+${quantity}`
          : String(quantity);

      // Date.
      const dateCell =
        document.createElement("td");

      dateCell.textContent = date;

      // Activity and reason.
      const typeCell =
        document.createElement("td");

      const activity =
        document.createElement("strong");

      activity.textContent =
        movement.type || "";

      typeCell.appendChild(activity);

      if (movement.note) {
        const note =
          document.createElement("span");

        note.className =
          "stock-history-note";

        note.textContent =
          movement.note;

        typeCell.appendChild(note);
      }

      // Quantity change.
      const changeCell =
        document.createElement("td");

      changeCell.textContent = change;

      changeCell.className =
        quantity < 0
          ? "stock-change-negative"
          : "stock-change-positive";

      // New balance.
      const balanceCell =
        document.createElement("td");

      balanceCell.textContent =
        movement.newQuantity;

      // Unit cost.
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
    reportInventoryError("history", error);
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

  historyRequestId++;

  historyModal.hidden = true;

  document.body.classList.remove(
    "stock-history-open"
  );

  if (
    lastHistoryTrigger &&
    lastHistoryTrigger.isConnected &&
    typeof lastHistoryTrigger.focus ===
      "function"
  ) {
    lastHistoryTrigger.focus();
  }
}

// ========================================
// ESCAPE KEY
// ========================================

document.addEventListener(
  "keydown",
  event => {
    if (event.key !== "Escape") {
      return;
    }

    if (
      productActionsModal &&
      !productActionsModal.hidden &&
      !busy
    ) {
      event.preventDefault();
      closeProductActions();
      return;
    }

    if (
      historyModal &&
      !historyModal.hidden
    ) {
      event.preventDefault();
      closeHistoryModal();
    }
  }
);

// ========================================
// SEARCH
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
// ACTIVE / ARCHIVED / ALL FILTERS
// ========================================

if (filterTabs) {
  filterTabs.addEventListener(
    "click",
    event => {
      if (busy) return;

      const button = event.target.closest(
        "button[data-filter]"
      );

      if (
        !button ||
        !filterTabs.contains(button)
      ) {
        return;
      }

      const nextFilter =
        button.dataset.filter;

      if (
        ![
          "active",
          "archived",
          "all"
        ].includes(nextFilter)
      ) {
        return;
      }

      selectedInventoryFilter =
        nextFilter;

      filterTabs.querySelectorAll(
        "button[data-filter]"
      ).forEach(tab => {
        const active =
          tab.dataset.filter ===
          selectedInventoryFilter;

        tab.classList.toggle(
          "active",
          active
        );

        tab.setAttribute(
          "aria-pressed",
          String(active)
        );
      });

      renderProducts();
    }
  );
}

// ========================================
// ADD PRODUCT FORM
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
      await window.TimidyAuth
        .getAuthorizedUser();

    if (!user) {
      window.location.replace(
        "login.html"
      );
      return;
    }

    await loadProducts();
  } catch (error) {
    reportInventoryError("load", error);
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
// BACKGROUND REFRESH
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
        await window.TimidyAuth
          .getAuthorizedUser();

      if (!user) {
        window.location.replace(
          "login.html"
        );
        return;
      }

      await loadProducts();
    } catch (error) {
    reportInventoryError("background_refresh", error);
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
// INITIAL ICONS
// ========================================

refreshIcons();