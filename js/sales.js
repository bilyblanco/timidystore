
"use strict";

// =====================================
// TIMIDY STORE — SUPABASE SALES
// =====================================

const db = window.timidySupabase;

if (!db) {
  throw new Error("Supabase is not configured.");
}

const form = document.getElementById("saleForm");
const themeToggle = document.getElementById("themeToggle");
const middlemanTab = document.getElementById("middlemanTab");
const stockTab = document.getElementById("stockTab");
const stockSelect = document.getElementById("stockProduct");
const salesTable = document.getElementById("salesTable");
const message = document.getElementById("saleMessage");

let saleType = "middleman";
let products = [];
let sales = [];
let customers = [];
let busy = false;

let saleDetailsModal = null;
let lastDetailsTrigger = null;
let activeSaleId = null;

// =====================================
// HELPERS
// =====================================

function createId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function money(value) {
  return "TZS " + Number(value || 0).toLocaleString(
    "en-TZ",
    { maximumFractionDigits: 2 }
  );
}

function numberFrom(id) {
  return Number(document.getElementById(id).value);
}

function setMessage(text, type = "") {
  if (!message) return;

  message.textContent = text;
  message.className = "sale-message " + type;
}

function errorText(error) {
  return error?.message || "Please try again.";
}

function getLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value + "T00:00:00Z");

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function normalizeCustomerPhone(phone) {
  let value = String(phone || "").replace(/[^\d+]/g, "");

  if (value.startsWith("0") && value.length === 10) {
    value = "+255" + value.slice(1);
  } else if (value.startsWith("255")) {
    value = "+" + value;
  }

  return value;
}

function isVoided(sale) {
  return sale.status === "voided" || sale.voided === true;
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    quantity: Number(row.quantity),
    purchasePrice: Number(row.purchase_price)
  };
}

function mapSale(row) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    customerId: row.customer_id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity),
    amount: Number(row.amount),
    cost: Number(row.cost),
    expenses: Number(row.expenses),
    profit: Number(row.profit),
    date: row.date,
    customer: row.customer || "",
    customerPhone: row.customer_phone || "",
    customerEmail: row.customer_email || "",
    voided: row.voided,
    voidedAt: row.voided_at,
    voidReason: row.void_reason
  };
}

function setBusy(value) {
  busy = value;

  form.querySelectorAll(
    "input, select, button, textarea"
  ).forEach(element => {
    element.disabled = value;
  });

  middlemanTab.disabled = value;
  stockTab.disabled = value;

  salesTable.querySelectorAll("button").forEach(button => {
    button.disabled = value;
  });

  if (saleDetailsModal) {
    saleDetailsModal.querySelectorAll("button")
      .forEach(button => {
        button.disabled = value;
      });
  }
}

// =====================================
// LOAD DATA FROM SUPABASE
// =====================================

async function refreshData() {
  const [
    inventoryResult,
    salesResult,
    customersResult
  ] = await Promise.all([
    db
      .from("inventory")
      .select("id,name,quantity,purchase_price")
      .order("name", { ascending: true }),

    db
      .from("sales")
      .select(
        "id,type,status,customer_id,product_id," +
        "product_name,quantity,amount,cost,expenses," +
        "profit,date,customer,customer_phone," +
        "customer_email,voided,voided_at,void_reason"
      )
      .order("date", { ascending: false }),

    db
      .from("customers")
      .select("id,name,phone,email")
  ]);

  for (const result of [
    inventoryResult,
    salesResult,
    customersResult
  ]) {
    if (result.error) {
      throw result.error;
    }
  }

  products = (inventoryResult.data || []).map(mapProduct);
  sales = (salesResult.data || []).map(mapSale);
  customers = customersResult.data || [];

  renderStockOptions();
  renderSales();
  updateProfitPreview();
}

// =====================================
// CUSTOMER INTEGRATION
// =====================================

function getSaleCustomer(sale) {
  const customer = customers.find(
    item => item.id === sale.customerId
  );

  return {
    name:
      sale.customer ||
      customer?.name ||
      "Walk-in customer",

    phone:
      sale.customerPhone ||
      customer?.phone ||
      "",

    email:
      sale.customerEmail ||
      customer?.email ||
      ""
  };
}

// =====================================
// SALE TYPE
// =====================================

function changeSaleType(type) {
  if (busy) return;

  saleType = type;

  middlemanTab.classList.toggle(
    "active",
    type === "middleman"
  );

  stockTab.classList.toggle(
    "active",
    type === "stock"
  );

  document.getElementById("middlemanFields")
    .classList.toggle("hidden", type !== "middleman");

  document.getElementById("stockFields")
    .classList.toggle("hidden", type !== "stock");

  document.getElementById("middlemanProduct").required =
    type === "middleman";

  document.getElementById("supplierCost").required =
    type === "middleman";

  stockSelect.required = type === "stock";

  document.getElementById("stockQuantity").required =
    type === "stock";

  setMessage("");
  updateProfitPreview();
}

// =====================================
// INVENTORY OPTIONS
// =====================================

function renderStockOptions() {
  const selectedProduct = stockSelect.value;

  stockSelect.replaceChildren();

  stockSelect.add(
    new Option("Select available stock", "")
  );

  products
    .filter(product => product.quantity > 0)
    .forEach(product => {
      stockSelect.add(
        new Option(
          `${product.name} (${product.quantity} available)`,
          product.id
        )
      );
    });

  const stillAvailable = [...stockSelect.options]
    .some(option => option.value === selectedProduct);

  if (stillAvailable) {
    stockSelect.value = selectedProduct;
  }
}

// =====================================
// PROFIT PREVIEW
// =====================================

function calculateProfit() {
  const amount = numberFrom("saleAmount");
  const expenses = numberFrom("saleExpenses");

  let cost = 0;

  if (saleType === "middleman") {
    cost = numberFrom("supplierCost");
  } else {
    const product = products.find(
      item => item.id === stockSelect.value
    );

    if (!product) return 0;

    cost =
      product.purchasePrice *
      numberFrom("stockQuantity");
  }

  return amount - cost - expenses;
}

function updateProfitPreview() {
  const profit = calculateProfit();

  const preview = document.getElementById(
    "profitPreview"
  );

  preview.textContent = money(profit);
  preview.classList.toggle("negative", profit < 0);
}

// =====================================
// SALES HISTORY
// =====================================

function renderSales() {
  salesTable.replaceChildren();

  let revenue = 0;
  let middlemanProfit = 0;
  let stockProfit = 0;

  sales.forEach(sale => {
    if (isVoided(sale)) return;

    revenue += sale.amount;

    if (sale.type === "middleman") {
      middlemanProfit += sale.profit;
    } else {
      stockProfit += sale.profit;
    }
  });

  document.getElementById("totalSales").textContent =
    money(revenue);

  document.getElementById("middlemanProfit").textContent =
    money(middlemanProfit);

  document.getElementById("stockProfit").textContent =
    money(stockProfit);

  document.getElementById("totalProfit").textContent =
    money(middlemanProfit + stockProfit);

  const sorted = [...sales].sort(
    (a, b) =>
      String(b.date).localeCompare(String(a.date))
  );

  if (sorted.length === 0) {
    const row = salesTable.insertRow();
    const cell = row.insertCell();

    cell.colSpan = 6;
    cell.textContent = "No sales recorded yet.";
    cell.style.textAlign = "center";
    cell.style.padding = "24px";

    return;
  }

  sorted.forEach(sale => {
    const row = salesTable.insertRow();

    if (isVoided(sale)) {
      row.classList.add("sale-voided-row");
    }

    [
      sale.date,
      sale.productName,
      sale.type === "middleman"
        ? "Middleman"
        : "Own Stock",
      money(sale.amount),
      money(sale.profit)
    ].forEach(value => {
      row.insertCell().textContent = value;
    });

    const actionsCell = row.insertCell();

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "sale-view-btn";
    viewButton.textContent = "View";

    viewButton.addEventListener("click", () => {
      showSaleDetails(sale.id);
    });

    actionsCell.appendChild(viewButton);

    if (isVoided(sale)) {
      const badge = document.createElement("span");

      badge.className = "sale-voided-badge";
      badge.textContent = "Voided";

      actionsCell.appendChild(badge);
    }
  });
}

// =====================================
// RECORD NEW SALE
// =====================================

async function recordSale(event) {
  event.preventDefault();

  if (busy) return;

  const amountText = document
    .getElementById("saleAmount")
    .value.trim();

  const expensesText = document
    .getElementById("saleExpenses")
    .value.trim();

  const amount = Number(amountText);
  const expenses = Number(expensesText);
  const date = document.getElementById("saleDate").value;

  if (
    !amountText ||
    !expensesText ||
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(expenses) ||
    expenses < 0 ||
    !validDate(date)
  ) {
    setMessage(
      "Please enter valid sale details.",
      "error"
    );
    return;
  }

  let productId = null;
  let productName = "";
  let quantity = 1;
  let supplierCost = 0;

  if (saleType === "middleman") {
    productName = document
      .getElementById("middlemanProduct")
      .value.trim();

    const costText = document
      .getElementById("supplierCost")
      .value.trim();

    supplierCost = Number(costText);

    if (
      !productName ||
      !costText ||
      !Number.isSafeInteger(supplierCost) ||
      supplierCost < 0
    ) {
      setMessage(
        "Enter valid supplier details.",
        "error"
      );
      return;
    }
  } else {
    productId = stockSelect.value;

    const product = products.find(
      item => item.id === productId
    );

    const quantityText = document
      .getElementById("stockQuantity")
      .value.trim();

    quantity = Number(quantityText);

    if (
      !product ||
      !quantityText ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > product.quantity
    ) {
      setMessage(
        "Not enough stock available for this sale.",
        "error"
      );
      return;
    }

    productName = product.name;
  }

  // Customer details are matched or created
  // inside the PostgreSQL transaction.

  const customerName = document
    .getElementById("customerName")
    .value.trim();

  const customerPhone = normalizeCustomerPhone(
    document.getElementById("customerPhone").value.trim()
  );

  const customerEmail = document
    .getElementById("customerEmail")
    .value.trim()
    .toLowerCase();

  const consent = document
    .getElementById("customerMarketingConsent")
    .checked;

  if (
    (customerName || customerPhone || customerEmail) &&
    (!customerName || (!customerPhone && !customerEmail))
  ) {
    setMessage(
      "Enter a customer name and phone/email, " +
      "or leave all customer details empty.",
      "error"
    );
    return;
  }

  const saleId = createId();

  setBusy(true);
  setMessage("Recording sale...");

  try {
    const { error } = await db.rpc(
      "timidy_record_sale",
      {
        p_sale_id: saleId,
        p_type: saleType,
        p_product_id: productId,
        p_product_name: productName,
        p_quantity: quantity,
        p_amount: amount,
        p_supplier_cost:
          saleType === "middleman"
            ? supplierCost
            : null,
        p_expenses: expenses,
        p_date: date,
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_customer_email: customerEmail,
        p_marketing_consent: consent,
        p_new_customer_id: createId(),
        p_history_id: createId()
      }
    );

    if (error) {
      throw error;
    }

    // The sale has been committed.
    // Reset the form before refreshing so that
    // a refresh failure does not encourage
    // accidental duplicate submissions.

    form.reset();

    document.getElementById("saleExpenses").value = 0;
    document.getElementById("saleDate").value =
      getLocalDate();

    try {
      await refreshData();

      setMessage(
        "Sale recorded successfully!",
        "success"
      );
    } catch (refreshError) {
      console.error(
        "Sale saved, but refresh failed:",
        refreshError
      );

      setMessage(
        "Sale saved in Supabase, but refreshing failed. " +
        "Reload before recording another sale.",
        "error"
      );
    }
  } catch (error) {
    console.error("Unable to record sale:", error);

    setMessage(
      "Sale not confirmed: " +
      errorText(error) +
      " Check Supabase records before retrying.",
      "error"
    );
  } finally {
    setBusy(false);
  }
}

// =====================================
// SALE DETAILS MODAL
// =====================================

function createSaleDetailsModal() {
  if (saleDetailsModal) {
    return saleDetailsModal;
  }

  const modal = document.createElement("div");

  modal.className = "sale-details-overlay";
  modal.hidden = true;

  modal.innerHTML = `
    <div
      class="sale-details-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="saleDetailsTitle"
      tabindex="-1"
    >
      <div class="sale-details-header">
        <div>
          <h2 id="saleDetailsTitle">Sale Details</h2>
          <p>Transaction information</p>
        </div>

        <button
          type="button"
          class="sale-details-close"
          aria-label="Close sale details"
        >&times;</button>
      </div>

      <div class="sale-details-body">
        <div id="saleDetailsContent"></div>

        <button
          type="button"
          id="downloadReceiptBtn"
          class="receipt-download-btn"
        >
          Download PDF Receipt
        </button>

        <button
          type="button"
          id="voidSaleBtn"
          class="sale-void-btn"
        >
          Void Sale
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector(".sale-details-close")
    .addEventListener("click", closeSaleDetails);

  modal.addEventListener("click", event => {
    if (event.target === modal) {
      closeSaleDetails();
    }
  });

  modal.querySelector("#downloadReceiptBtn")
    .addEventListener("click", () => {
      if (activeSaleId) {
        downloadSaleReceipt(activeSaleId);
      }
    });

  modal.querySelector("#voidSaleBtn")
    .addEventListener("click", () => {
      if (activeSaleId) {
        voidSale(activeSaleId);
      }
    });

  saleDetailsModal = modal;

  return modal;
}

function addDetailRow(
  container,
  label,
  value,
  className = ""
) {
  const row = document.createElement("div");
  row.className = "sale-detail-row";

  const labelElement = document.createElement("span");
  labelElement.className = "sale-detail-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("strong");
  valueElement.className =
    "sale-detail-value " + className;

  valueElement.textContent = String(value ?? "—");

  row.append(labelElement, valueElement);
  container.appendChild(row);
}

function showSaleDetails(saleId) {
  const sale = sales.find(
    item => item.id === saleId
  );

  if (!sale) {
    alert("Sale not found.");
    return;
  }

  activeSaleId = sale.id;

  const customer = getSaleCustomer(sale);
  const modal = createSaleDetailsModal();

  const content = modal.querySelector(
    "#saleDetailsContent"
  );

  content.replaceChildren();

  addDetailRow(content, "Transaction ID", sale.id);
  addDetailRow(content, "Sale Date", sale.date);
  addDetailRow(content, "Product", sale.productName);

  addDetailRow(
    content,
    "Sale Type",
    sale.type === "middleman"
      ? "Middleman Sale"
      : "Own Stock Sale"
  );

  addDetailRow(
    content,
    "Quantity",
    sale.quantity ?? 1
  );

  addDetailRow(
    content,
    "Customer",
    customer.name
  );

  addDetailRow(
    content,
    "Phone",
    customer.phone || "Not provided"
  );

  addDetailRow(
    content,
    "Email",
    customer.email || "Not provided"
  );

  addDetailRow(
    content,
    "Status",
    isVoided(sale) ? "VOIDED" : "Active",
    isVoided(sale)
      ? "sale-profit-negative"
      : "sale-profit-positive"
  );

  if (isVoided(sale)) {
    addDetailRow(
      content,
      "Voided At",
      sale.voidedAt || "Not recorded"
    );

    addDetailRow(
      content,
      "Void Reason",
      sale.voidReason || "Not recorded"
    );
  }

  const divider = document.createElement("hr");
  divider.className = "sale-details-divider";

  content.appendChild(divider);

  addDetailRow(
    content,
    "Selling Amount",
    money(sale.amount)
  );

  addDetailRow(
    content,
    sale.type === "middleman"
      ? "Supplier Cost"
      : "Inventory Cost",
    money(sale.cost)
  );

  addDetailRow(
    content,
    "Transaction Expenses",
    money(sale.expenses)
  );

  addDetailRow(
    content,
    "Transaction Profit",
    money(sale.profit),
    sale.profit < 0
      ? "sale-profit-negative"
      : "sale-profit-positive"
  );

  const receiptButton = modal.querySelector(
    "#downloadReceiptBtn"
  );

  const voidButton = modal.querySelector(
    "#voidSaleBtn"
  );

  receiptButton.hidden = isVoided(sale);
  voidButton.hidden = isVoided(sale);

  lastDetailsTrigger = document.activeElement;

  modal.hidden = false;

  document.body.classList.add(
    "sale-details-open"
  );

  modal.querySelector(
    ".sale-details-close"
  ).focus();
}

function closeSaleDetails() {
  if (
    !saleDetailsModal ||
    saleDetailsModal.hidden
  ) {
    return;
  }

  saleDetailsModal.hidden = true;
  activeSaleId = null;

  document.body.classList.remove(
    "sale-details-open"
  );

  if (lastDetailsTrigger?.focus) {
    lastDetailsTrigger.focus();
  }
}

document.addEventListener("keydown", event => {
  if (
    event.key === "Escape" &&
    saleDetailsModal &&
    !saleDetailsModal.hidden &&
    !busy
  ) {
    closeSaleDetails();
  }
});

// =====================================
// VOID SALE
// =====================================

async function voidSale(saleId) {
  if (busy) return;

  const sale = sales.find(
    item => item.id === saleId
  );

  if (!sale) {
    alert("Sale not found.");
    return;
  }

  if (isVoided(sale)) {
    alert("This sale has already been voided.");
    return;
  }

  const confirmed = confirm(
    "VOID THIS SALE?\n\n" +
    `Product: ${sale.productName}\n` +
    `Amount: ${money(sale.amount)}\n\n` +
    "This excludes the transaction from sales totals.\n" +
    "For own-stock sales, inventory will be restored.\n\n" +
    "Continue?"
  );

  if (!confirmed) return;

  const reasonInput = prompt(
    "Reason for voiding this sale:"
  );

  if (reasonInput === null) return;

  const reason = reasonInput.trim();

  if (!reason || reason.length > 1000) {
    alert(
      "A reason of 1–1000 characters is required."
    );
    return;
  }

  setBusy(true);

  try {
    const { error } = await db.rpc(
      "timidy_void_sale",
      {
        p_sale_id: saleId,
        p_reason: reason,
        p_history_id: createId()
      }
    );

    if (error) {
      throw error;
    }

    closeSaleDetails();

    try {
      await refreshData();

      setMessage(
        "Sale voided successfully. " +
        "Inventory restored where applicable.",
        "success"
      );
    } catch (refreshError) {
      console.error(
        "Void saved, but refresh failed:",
        refreshError
      );

      setMessage(
        "Sale voided in Supabase, but refreshing failed. " +
        "Reload the page.",
        "error"
      );
    }
  } catch (error) {
    console.error(
      "Unable to void sale:",
      error
    );

    alert(
      "Void not confirmed: " +
      errorText(error) +
      "\nCheck Supabase before retrying."
    );
  } finally {
    setBusy(false);
  }
}

// =====================================
// PDF RECEIPT GENERATOR
// =====================================

function loadReceiptLogo() {
  return new Promise(resolve => {
    const image = new Image();

    image.onload = () => {
      try {
        const canvas = document.createElement(
          "canvas"
        );

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext("2d");

        context.drawImage(image, 0, 0);

        resolve({
          data: canvas.toDataURL("image/png"),
          width: image.naturalWidth,
          height: image.naturalHeight
        });
      } catch {
        resolve(null);
      }
    };

    image.onerror = () => resolve(null);

    image.src = "images/company-logo.png";
  });
}

function pdfSafeText(value) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "-");
}

async function downloadSaleReceipt(saleId) {
  const sale = sales.find(
    item => item.id === saleId
  );

  if (!sale) {
    alert("Sale not found.");
    return;
  }

  if (isVoided(sale)) {
    alert(
      "Cannot generate a receipt for a voided sale."
    );
    return;
  }

  if (
    typeof window.jspdf === "undefined" ||
    typeof window.jspdf.jsPDF !== "function"
  ) {
    alert(
      "PDF library is unavailable. " +
      "Check your internet connection and refresh."
    );
    return;
  }

  const customer = getSaleCustomer(sale);
  const logo = await loadReceiptLogo();

  try {
    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a5"
    });

    const pageWidth =
      pdf.internal.pageSize.getWidth();

    const margin = 14;
    const right = pageWidth - margin;

    pdf.setFillColor(22, 32, 52);
    pdf.rect(0, 0, pageWidth, 45, "F");

    if (logo) {
      const ratio = Math.min(
        23 / logo.width,
        23 / logo.height
      );

      pdf.addImage(
        logo.data,
        "PNG",
        margin,
        9,
        logo.width * ratio,
        logo.height * ratio
      );
    }

    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);

    pdf.text(
      "TIMIDY STORE",
      right,
      18,
      { align: "right" }
    );

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);

    pdf.text(
      "SALES RECEIPT",
      right,
      27,
      { align: "right" }
    );

    let y = 58;

    pdf.setTextColor(35, 45, 65);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);

    pdf.text(
      "RECEIPT DETAILS",
      margin,
      y
    );

    y += 9;

    function drawField(label, value) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(105, 115, 130);

      pdf.text(label, margin, y);

      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(35, 45, 65);

      const lines = pdf.splitTextToSize(
        pdfSafeText(value),
        pageWidth - margin * 2 - 42
      );

      pdf.text(lines, right, y, {
        align: "right"
      });

      y += Math.max(8, lines.length * 5);
    }

    drawField("Receipt No.", sale.id);
    drawField("Date", sale.date);
    drawField("Customer", customer.name);

    if (customer.phone) {
      drawField("Phone", customer.phone);
    }

    if (customer.email) {
      drawField("Email", customer.email);
    }

    y += 3;

    pdf.setDrawColor(220, 225, 232);
    pdf.line(margin, y, right, y);

    y += 11;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(35, 45, 65);

    pdf.text(
      "PURCHASE DETAILS",
      margin,
      y
    );

    y += 10;

    drawField(
      "Product",
      sale.productName
    );

    drawField(
      "Quantity",
      sale.quantity ?? 1
    );

    drawField(
      "Sale Type",
      sale.type === "middleman"
        ? "Middleman Sale"
        : "Own Stock Sale"
    );

    y += 5;

    pdf.setFillColor(237, 242, 249);

    pdf.roundedRect(
      margin,
      y,
      pageWidth - margin * 2,
      22,
      3,
      3,
      "F"
    );

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(35, 45, 65);

    pdf.text(
      "TOTAL PAID",
      margin + 6,
      y + 13
    );

    pdf.setFontSize(12);

    pdf.text(
      money(sale.amount),
      right - 6,
      y + 13,
      { align: "right" }
    );

    y += 34;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 110, 125);

    pdf.text(
      "Thank you for shopping with Timidy Store!",
      pageWidth / 2,
      y,
      { align: "center" }
    );

    pdf.setFontSize(8);

    pdf.text(
      "We appreciate your business.",
      pageWidth / 2,
      y + 7,
      { align: "center" }
    );

    const fileId = String(sale.id)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 36);

    // Verify the sale is still active
    // before saving the PDF.

    const {
      data: latestSale,
      error: statusError
    } = await db
      .from("sales")
      .select("status,voided")
      .eq("id", saleId)
      .maybeSingle();

    if (
      statusError ||
      !latestSale ||
      isVoided(latestSale)
    ) {
      alert(
        "Receipt cancelled because the sale " +
        "is no longer active."
      );
      return;
    }

    pdf.save(
      `Timidy-Receipt-${fileId || "Sale"}.pdf`
    );
  } catch (error) {
    console.error(
      "Receipt generation failed:",
      error
    );

    alert("Unable to generate receipt.");
  }
}

// =====================================
// LIGHT / DARK MODE
// =====================================

function applyTheme(theme) {
  const dark = theme === "dark";

  document.documentElement.classList.toggle(
    "dark",
    dark
  );

  document.body.classList.toggle(
    "dark",
    dark
  );

  if (themeToggle) {
    themeToggle.textContent =
      dark ? "☀️" : "🌙";
  }
}

// =====================================
// INITIALIZATION
// =====================================

form.addEventListener(
  "submit",
  recordSale
);

middlemanTab.addEventListener("click", () => {
  changeSaleType("middleman");
});

stockTab.addEventListener("click", () => {
  changeSaleType("stock");
});

form.addEventListener(
  "input",
  updateProfitPreview
);

form.addEventListener(
  "change",
  updateProfitPreview
);

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

    localStorage.setItem(
      "timidy-theme",
      next
    );

    applyTheme(next);
  });
}

document.getElementById("saleDate").value =
  getLocalDate();

changeSaleType("middleman");

async function initializeSales() {
  setBusy(true);

  try {
    const user =
      await window.TimidyAuth.getAuthorizedUser();

    if (!user) {
      window.location.replace("login.html");
      return;
    }

    await refreshData();
  } catch (error) {
    console.error(
      "Unable to load sales:",
      error
    );

    setMessage(
      "Unable to load sales: " +
      errorText(error),
      "error"
    );
  } finally {
    setBusy(false);
  }
}

initializeSales();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}

