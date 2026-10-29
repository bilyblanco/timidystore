
const INVENTORY_KEY = "timidy-inventory";
const SALES_KEY = "timidy-sales";

const form = document.getElementById("saleForm");
const themeToggle = document.getElementById("themeToggle");
const middlemanTab = document.getElementById("middlemanTab");
const stockTab = document.getElementById("stockTab");
const stockSelect = document.getElementById("stockProduct");
const salesTable = document.getElementById("salesTable");
const message = document.getElementById("saleMessage");

let saleType = "middleman";

function loadArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const CUSTOMERS_KEY = "timidy-customers";

function normalizeCustomerPhone(phone) {
  let value = phone.replace(/[^\d+]/g, "");

  if (value.startsWith("0") && value.length === 10) {
    value = "+255" + value.slice(1);
  } else if (value.startsWith("255")) {
    value = "+" + value;
  }

  return value;
}

function prepareSaleCustomer() {
  const name = document.getElementById(
    "customerName"
  ).value.trim();

  const phone = normalizeCustomerPhone(
    document.getElementById("customerPhone").value.trim()
  );

  const email = document.getElementById(
    "customerEmail"
  ).value.trim().toLowerCase();

  const consent = document.getElementById(
    "customerMarketingConsent"
  ).checked;

  if (!name && !phone && !email) {
    return { customerId: null, customers: null };
  }

  if (!name || (!phone && !email)) {
    throw new Error(
      "Enter a customer name and phone or email, " +
      "or leave all customer details empty."
    );
  }

  const customers = loadArray(CUSTOMERS_KEY);

  const phoneMatch = phone
    ? customers.find(c =>
        normalizeCustomerPhone(c.phone || "") === phone
      )
    : null;

  const emailMatch = email
    ? customers.find(c =>
        (c.email || "").toLowerCase() === email
      )
    : null;

  if (
    phoneMatch && emailMatch &&
    phoneMatch.id !== emailMatch.id
  ) {
    throw new Error(
      "Phone and email belong to different customers. " +
      "Check the customer directory."
    );
  }

  const existing = phoneMatch || emailMatch;

  if (existing) {
    // Do not overwrite an existing customer's details
    // or marketing permission during a sale.
    return {
      customerId: existing.id,
      customers: null
    };
  }

  const customer = {
    id: crypto.randomUUID(),
    name,
    phone,
    email,
    notes: "",
    marketingConsent: consent,
    consentUpdatedAt: consent
      ? new Date().toISOString() : null,
    createdAt: new Date().toISOString()
  };

  customers.push(customer);

  return {
    customerId: customer.id,
    customers
  };
}

let products = loadArray(INVENTORY_KEY);
let sales = loadArray(SALES_KEY);

function money(value) {
  return "TZS " + Number(value).toLocaleString("en-TZ");
}

function numberFrom(id) {
  return Number(document.getElementById(id).value);
}

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = "sale-message " + type;
}

function changeSaleType(type) {
  saleType = type;

  middlemanTab.classList.toggle(
    "active", type === "middleman"
  );
  stockTab.classList.toggle(
    "active", type === "stock"
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

function renderStockOptions() {
  products = loadArray(INVENTORY_KEY);
  stockSelect.replaceChildren();

  const placeholder = new Option(
    "Select available stock", ""
  );
  stockSelect.add(placeholder);

  products.filter(p => p.quantity > 0).forEach(p => {
    stockSelect.add(new Option(
      `${p.name} (${p.quantity} available)`,
      p.id
    ));
  });
}

function calculateProfit() {
  const amount = numberFrom("saleAmount");
  const expenses = numberFrom("saleExpenses");

  let cost = 0;

  if (saleType === "middleman") {
    cost = numberFrom("supplierCost");
  } else {
    const product = products.find(
      p => p.id === stockSelect.value
    );

    const quantity = numberFrom("stockQuantity");

    if (!product) return 0;

    cost = product.purchasePrice * quantity;
  }

  return amount - cost - expenses;
}

function updateProfitPreview() {
  const profit = calculateProfit();
  const preview = document.getElementById("profitPreview");

  preview.textContent = money(profit);
  preview.classList.toggle("negative", profit < 0);
}

function renderSales() {
  salesTable.replaceChildren();

  let revenue = 0;
  let middlemanProfit = 0;
  let stockProfit = 0;

  sales.forEach(sale => {
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
    (a, b) => b.date.localeCompare(a.date)
  );

  if (sorted.length === 0) {
    const row = salesTable.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.textContent = "No sales recorded yet.";
    return;
  }

  sorted.forEach(sale => {
    const row = salesTable.insertRow();

    [
      sale.date,
      sale.productName,
      sale.type === "middleman"
        ? "Middleman" : "Own Stock",
      money(sale.amount),
      money(sale.profit)
    ].forEach(value => {
      row.insertCell().textContent = value;
    });
  });
}

form.addEventListener("submit", event => {
  event.preventDefault();

  products = loadArray(INVENTORY_KEY);
  sales = loadArray(SALES_KEY);

  const amount = numberFrom("saleAmount");
  const expenses = numberFrom("saleExpenses");
  const date = document.getElementById("saleDate").value;

  if (
    !Number.isSafeInteger(amount) || amount < 0 ||
    !Number.isSafeInteger(expenses) || expenses < 0 ||
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
    productName = document.getElementById(
      "middlemanProduct"
    ).value.trim();

    cost = numberFrom("supplierCost");

    if (
      !productName ||
      !Number.isSafeInteger(cost) || cost < 0
    ) {
      setMessage("Enter valid supplier details.", "error");
      return;
    }
  } else {
    product = products.find(
      p => p.id === stockSelect.value
    );

    quantity = numberFrom("stockQuantity");

    if (
      !product ||
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
    productId = product.id;
    cost = product.purchasePrice * quantity;
  }

  
    let customerResult;

    try {
    customerResult = prepareSaleCustomer();
    } catch (error) {
    setMessage(error.message, "error");
    return;
    }


  const sale = {
    id: crypto.randomUUID(),
    type: saleType,
    customerId: customerResult.customerId,
    productId,
    productName,
    quantity,
    amount,
    cost,
    expenses,
    profit: amount - cost - expenses,
    date,
    customer: document.getElementById(
      "customerName"
    ).value.trim()
  };


// Browser-only prototype: save all affected records.
// Supabase will later handle this atomically.
try {
  const changes = [];

  if (product) {
    product.quantity -= quantity;
    changes.push([
      INVENTORY_KEY,
      JSON.stringify(products)
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

  // Keep previous values in case a write fails.
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
} catch {
  setMessage(
    "Saving failed. Check existing records before retrying.",
    "error"
  );
  return;
}

  form.reset();
  document.getElementById("saleExpenses").value = 0;
  document.getElementById("saleDate").value =
    new Date().toLocaleDateString("en-CA");

  renderStockOptions();
  renderSales();
  updateProfitPreview();

  setMessage("Sale recorded successfully!", "success");
});

middlemanTab.addEventListener("click", () =>
  changeSaleType("middleman")
);

stockTab.addEventListener("click", () =>
  changeSaleType("stock")
);

form.addEventListener("input", updateProfitPreview);
form.addEventListener("change", updateProfitPreview);

function applyTheme(theme) {
  const dark = theme === "dark";
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

// Initialize page
document.getElementById("saleDate").value =
  new Date().toLocaleDateString("en-CA");

renderStockOptions();
changeSaleType("middleman");
renderSales();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
