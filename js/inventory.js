
const STORAGE_KEY = "timidy-inventory";

let products = [];

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  products = Array.isArray(saved) ? saved : [];
} catch {
  products = [];
}

const form = document.getElementById("productForm");
const table = document.getElementById("inventoryTable");
const search = document.getElementById("searchProduct");
const themeToggle = document.getElementById("themeToggle");

const formatMoney = amount =>
  "TZS " + Number(amount).toLocaleString("en-TZ");

function saveProducts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

function getStatus(product) {
  if (product.quantity === 0) {
    return { label: "Out of Stock", className: "middleman" };
  }

  if (product.quantity <= product.minimumStock) {
    return { label: "Low Stock", className: "middleman" };
  }

  return { label: "In Stock", className: "stock" };
}

function updateSummary() {
  const totalUnits = products.reduce(
    (sum, product) => sum + product.quantity, 0
  );

  const value = products.reduce(
    (sum, product) =>
      sum + product.quantity * product.purchasePrice, 0
  );

  const alerts = products.filter(
    product => product.quantity <= product.minimumStock
  ).length;

  document.getElementById("totalProducts").textContent =
    products.length;

  document.getElementById("totalUnits").textContent =
    totalUnits;

  document.getElementById("inventoryValue").textContent =
    formatMoney(value);

  document.getElementById("lowStockCount").textContent =
    alerts;
}

function renderProducts() {
  table.innerHTML = "";

  const term = search.value.trim().toLowerCase();

  const filtered = products.filter(product =>
    product.name.toLowerCase().includes(term)
  );

  if (filtered.length === 0) {
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.textContent = "No products found.";
  }

  filtered.forEach(product => {
    const status = getStatus(product);
    const row = table.insertRow();

    const values = [
      product.name,
      product.category,
      formatMoney(product.purchasePrice),
      formatMoney(product.sellingPrice),
      product.quantity
    ];

    values.forEach(value => {
      const cell = row.insertCell();
      cell.textContent = value;
    });

    const statusCell = row.insertCell();
    const badge = document.createElement("span");
    badge.className = "tag " + status.className;
    badge.textContent = status.label;
    statusCell.appendChild(badge);
  });

  updateSummary();
}

form.addEventListener("submit", event => {
  event.preventDefault();

  const product = {
    id: crypto.randomUUID(),
    name: document.getElementById("productName").value.trim(),
    category: document.getElementById("category").value,
    purchasePrice: Number(
      document.getElementById("purchasePrice").value
    ),
    sellingPrice: Number(
      document.getElementById("sellingPrice").value
    ),
    quantity: Number(document.getElementById("quantity").value),
    minimumStock: Number(
      document.getElementById("minimumStock").value
    )
  };

  if (!product.name || product.quantity < 1) return;

  products.push(product);
  saveProducts();
  renderProducts();

  form.reset();
  document.getElementById("minimumStock").value = 3;
});

search.addEventListener("input", renderProducts);

// Theme switching
function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "☀️" : "🌙";
}

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

renderProducts();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
