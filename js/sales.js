
"use strict";

const INVENTORY_KEY = "timidy-inventory";
const SALES_KEY = "timidy-sales";
const CUSTOMERS_KEY = "timidy-customers";
const HISTORY_KEY = "timidy-stock-history";

const form = document.getElementById("saleForm");
const themeToggle = document.getElementById("themeToggle");
const middlemanTab = document.getElementById("middlemanTab");
const stockTab = document.getElementById("stockTab");
const stockSelect = document.getElementById("stockProduct");
const salesTable = document.getElementById("salesTable");
const message = document.getElementById("saleMessage");

let saleType = "middleman";
let products = loadArray(INVENTORY_KEY);
let sales = loadArray(SALES_KEY);

let saleDetailsModal = null;
let lastDetailsTrigger = null;
let activeSaleId = null;

// =====================================
// HELPERS
// =====================================

function loadArray(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
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

function getLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

function saveChanges(changes) {
  const previous = changes.map(([key]) => [
    key,
    localStorage.getItem(key)
  ]);

  try {
    for (const [key, value] of changes) {
      localStorage.setItem(key, value);
    }
  } catch (error) {
    for (const [key, value] of previous) {
      try {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }
      } catch {
        // Browser storage may remain inconsistent.
      }
    }

    throw error;
  }
}

// =====================================
// CUSTOMER INTEGRATION
// =====================================

function prepareSaleCustomer() {
  const name = document
    .getElementById("customerName")
    .value.trim();

  const phone = normalizeCustomerPhone(
    document.getElementById("customerPhone").value.trim()
  );

  const email = document
    .getElementById("customerEmail")
    .value.trim()
    .toLowerCase();

  const consent = document
    .getElementById("customerMarketingConsent")
    .checked;

  if (!name && !phone && !email) {
    return {
      customerId: null,
      customers: null
    };
  }

  if (!name || (!phone && !email)) {
    throw new Error(
      "Enter a customer name and phone or email, " +
      "or leave all customer details empty."
    );
  }

  const customers = loadArray(CUSTOMERS_KEY);

  const phoneMatch = phone
    ? customers.find(customer =>
        normalizeCustomerPhone(customer.phone) === phone
      )
    : null;

  const emailMatch = email
    ? customers.find(customer =>
        String(customer.email || "").toLowerCase() === email
      )
    : null;

  if (
    phoneMatch &&
    emailMatch &&
    phoneMatch.id !== emailMatch.id
  ) {
    throw new Error(
      "Phone and email belong to different customers."
    );
  }

  const existing = phoneMatch || emailMatch;

  if (existing) {
    return {
      customerId: existing.id,
      customers: null
    };
  }

  const customer = {
    id: createId(),
    name,
    phone,
    email,
    notes: "",
    marketingConsent: consent,
    consentUpdatedAt: consent
      ? new Date().toISOString()
      : null,
    createdAt: new Date().toISOString()
  };

  customers.push(customer);

  return {
    customerId: customer.id,
    customers
  };
}

function getSaleCustomer(sale) {
  const customers = loadArray(CUSTOMERS_KEY);

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
  products = loadArray(INVENTORY_KEY);

  const selectedProduct = stockSelect.value;

  stockSelect.replaceChildren();
  stockSelect.add(new Option("Select available stock", ""));

  products
    .filter(product => Number(product.quantity) > 0)
    .forEach(product => {
      stockSelect.add(
        new Option(
          `${product.name} (${product.quantity} available)`,
          product.id
        )
      );
    });

  if (
    [...stockSelect.options].some(
      option => option.value === selectedProduct
    )
  ) {
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
      Number(product.purchasePrice) *
      numberFrom("stockQuantity");
  }

  return amount - cost - expenses;
}

function updateProfitPreview() {
  const profit = calculateProfit();
  const preview = document.getElementById("profitPreview");

  preview.textContent = money(profit);
  preview.classList.toggle("negative", profit < 0);
}

// =====================================
// SALES HISTORY
// =====================================

function renderSales() {
  sales = loadArray(SALES_KEY);
  salesTable.replaceChildren();

  let revenue = 0;
  let middlemanProfit = 0;
  let stockProfit = 0;

  sales.forEach(sale => {
    if (isVoided(sale)) return;

    revenue += Number(sale.amount) || 0;

    if (sale.type === "middleman") {
      middlemanProfit += Number(sale.profit) || 0;
    } else {
      stockProfit += Number(sale.profit) || 0;
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

function recordSale(event) {
  event.preventDefault();

  products = loadArray(INVENTORY_KEY);
  sales = loadArray(SALES_KEY);

  const amount = numberFrom("saleAmount");
  const expenses = numberFrom("saleExpenses");
  const date = document.getElementById("saleDate").value;

  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !Number.isSafeInteger(expenses) ||
    expenses < 0 ||
    !date
  ) {
    setMessage("Please enter valid sale details.", "error");
    return;
  }

  let productName;
  let cost;
  let productId = null;
  let quantity = 1;
  let product = null;

  if (saleType === "middleman") {
    productName = document
      .getElementById("middlemanProduct")
      .value.trim();

    cost = numberFrom("supplierCost");

    if (
      !productName ||
      !Number.isSafeInteger(cost) ||
      cost < 0
    ) {
      setMessage("Enter valid supplier details.", "error");
      return;
    }
  } else {
    product = products.find(
      item => item.id === stockSelect.value
    );

    quantity = numberFrom("stockQuantity");

    if (
      !product ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > Number(product.quantity)
    ) {
      setMessage(
        "Not enough stock available for this sale.",
        "error"
      );
      return;
    }

    productName = product.name;
    productId = product.id;
    cost = Number(product.purchasePrice) * quantity;
  }

  let customerResult;

  try {
    customerResult = prepareSaleCustomer();
  } catch (error) {
    setMessage(error.message, "error");
    return;
  }

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

  const sale = {
    id: createId(),
    type: saleType,
    status: "active",
    customerId: customerResult.customerId,
    productId,
    productName,
    quantity,
    amount,
    cost,
    expenses,
    profit: amount - cost - expenses,
    date,
    customer: customerName,
    customerPhone,
    customerEmail
  };

  const changes = [];

  if (product) {
    const previousQuantity = Number(product.quantity);
    const newQuantity = previousQuantity - quantity;

    product.quantity = newQuantity;

    changes.push([
      INVENTORY_KEY,
      JSON.stringify(products)
    ]);

    const history = loadArray(HISTORY_KEY);

    history.unshift({
      id: createId(),
      productId: product.id,
      productName: product.name,
      type: "Sale",
      quantity: -quantity,
      previousQuantity,
      newQuantity,
      unitCost: Number(product.purchasePrice),
      note: `Own-stock sale (${sale.id})`,
      saleId: sale.id,
      date: new Date().toISOString()
    });

    changes.push([
      HISTORY_KEY,
      JSON.stringify(history)
    ]);
  }

  sales.push(sale);

  changes.push([
    SALES_KEY,
    JSON.stringify(sales)
  ]);

  if (customerResult.customers) {
    changes.push([
      CUSTOMERS_KEY,
      JSON.stringify(customerResult.customers)
    ]);
  }

  try {
    saveChanges(changes);
  } catch {
    products = loadArray(INVENTORY_KEY);
    sales = loadArray(SALES_KEY);

    setMessage(
      "Saving failed. Check existing records before retrying.",
      "error"
    );
    return;
  }

  form.reset();

  document.getElementById("saleExpenses").value = 0;
  document.getElementById("saleDate").value = getLocalDate();

  renderStockOptions();
  renderSales();
  updateProfitPreview();

  setMessage("Sale recorded successfully!", "success");
}

// =====================================
// SALE DETAILS MODAL
// =====================================

function createSaleDetailsModal() {
  if (saleDetailsModal) return saleDetailsModal;

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

function addDetailRow(container, label, value, className = "") {
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
  const sale = loadArray(SALES_KEY).find(
    item => item.id === saleId
  );

  if (!sale) {
    alert("Sale not found.");
    return;
  }

  activeSaleId = sale.id;

  const customer = getSaleCustomer(sale);
  const modal = createSaleDetailsModal();
  const content = modal.querySelector("#saleDetailsContent");

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

  addDetailRow(content, "Quantity", sale.quantity ?? 1);
  addDetailRow(content, "Customer", customer.name);

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

  addDetailRow(content, "Selling Amount", money(sale.amount));

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
    Number(sale.profit) < 0
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
  document.body.classList.add("sale-details-open");

  modal.querySelector(".sale-details-close").focus();
}

function closeSaleDetails() {
  if (!saleDetailsModal || saleDetailsModal.hidden) return;

  saleDetailsModal.hidden = true;
  activeSaleId = null;

  document.body.classList.remove("sale-details-open");

  if (lastDetailsTrigger?.focus) {
    lastDetailsTrigger.focus();
  }
}

document.addEventListener("keydown", event => {
  if (
    event.key === "Escape" &&
    saleDetailsModal &&
    !saleDetailsModal.hidden
  ) {
    closeSaleDetails();
  }
});

// =====================================
// VOID SALE
// =====================================

function voidSale(saleId) {
  const currentSales = loadArray(SALES_KEY);
  const sale = currentSales.find(
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
    "This will exclude the transaction from sales totals.\n" +
    "For own-stock sales, the quantity will be restored.\n\n" +
    "Continue?"
  );

  if (!confirmed) return;

  const reasonInput = prompt(
    "Reason for voiding this sale:"
  );

  if (reasonInput === null) return;

  const reason = reasonInput.trim();

  if (!reason) {
    alert("A reason is required to void a sale.");
    return;
  }

  const changes = [];
  const voidedAt = new Date().toISOString();

  if (sale.type === "stock") {
    const currentProducts = loadArray(INVENTORY_KEY);

    const product = currentProducts.find(
      item => item.id === sale.productId
    );

    if (!product) {
      alert(
        "Cannot void this stock sale because its " +
        "inventory product no longer exists."
      );
      return;
    }

    const quantity = Number(sale.quantity);

    if (
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      !Number.isSafeInteger(Number(product.quantity)) ||
      Number(product.quantity) < 0
    ) {
      alert(
        "Invalid stock quantity. " +
        "The sale was not voided."
      );
      return;
    }

    const previousQuantity = Number(product.quantity);
    const newQuantity = previousQuantity + quantity;

    if (!Number.isSafeInteger(newQuantity)) {
      alert("Stock quantity is too large.");
      return;
    }

    product.quantity = newQuantity;

    changes.push([
      INVENTORY_KEY,
      JSON.stringify(currentProducts)
    ]);

    const history = loadArray(HISTORY_KEY);

    history.unshift({
      id: createId(),
      productId: product.id,
      productName: product.name,
      type: "Sale Voided",
      quantity,
      previousQuantity,
      newQuantity,
      unitCost: Number(product.purchasePrice),
      note: `Reversal of sale ${sale.id}: ${reason}`,
      saleId: sale.id,
      date: voidedAt
    });

    changes.push([
      HISTORY_KEY,
      JSON.stringify(history)
    ]);
  }

  sale.status = "voided";
  sale.voided = true;
  sale.voidedAt = voidedAt;
  sale.voidReason = reason;

  changes.push([
    SALES_KEY,
    JSON.stringify(currentSales)
  ]);

  try {
    saveChanges(changes);
  } catch {
    alert(
      "Unable to void sale. " +
      "Check your records before trying again."
    );
    return;
  }

  closeSaleDetails();

  products = loadArray(INVENTORY_KEY);
  sales = loadArray(SALES_KEY);

  renderStockOptions();
  renderSales();
  updateProfitPreview();

  setMessage(
    "Sale voided successfully. Inventory restored where applicable.",
    "success"
  );
}

// =====================================
// PDF RECEIPT GENERATOR
// =====================================

function loadReceiptLogo() {
  return new Promise(resolve => {
    const image = new Image();

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");

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
  const sale = loadArray(SALES_KEY).find(
    item => item.id === saleId
  );

  if (!sale) {
    alert("Sale not found.");
    return;
  }

  if (isVoided(sale)) {
    alert("Cannot generate a receipt for a voided sale.");
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

    const pageWidth = pdf.internal.pageSize.getWidth();
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
    pdf.text("RECEIPT DETAILS", margin, y);

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
    pdf.text("PURCHASE DETAILS", margin, y);

    y += 10;

    drawField("Product", sale.productName);
    drawField("Quantity", sale.quantity ?? 1);

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
    pdf.text("TOTAL PAID", margin + 6, y + 13);

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

    // Recheck status before saving.
    const latestSale = loadArray(SALES_KEY).find(
      item => item.id === saleId
    );

    if (!latestSale || isVoided(latestSale)) {
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
    console.error("Receipt generation failed:", error);
    alert("Unable to generate receipt.");
  }
}

// =====================================
// THEME
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
    themeToggle.textContent = dark ? "☀️" : "🌙";
  }
}

// =====================================
// INITIALIZATION
// =====================================

form.addEventListener("submit", recordSale);

middlemanTab.addEventListener("click", () => {
  changeSaleType("middleman");
});

stockTab.addEventListener("click", () => {
  changeSaleType("stock");
});

form.addEventListener("input", updateProfitPreview);
form.addEventListener("change", updateProfitPreview);

applyTheme(
  localStorage.getItem("timidy-theme") === "dark"
    ? "dark"
    : "light"
);

themeToggle.addEventListener("click", () => {
  const next = document.body.classList.contains("dark")
    ? "light"
    : "dark";

  localStorage.setItem("timidy-theme", next);
  applyTheme(next);
});

document.getElementById("saleDate").value = getLocalDate();

renderStockOptions();
changeSaleType("middleman");
renderSales();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}

