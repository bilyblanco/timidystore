
"use strict";

// =====================================
// TIMIDY STORE - DASHBOARD
// Void-aware financial calculations
// =====================================

const SALES_KEY = "timidy-sales";
const INVENTORY_KEY = "timidy-inventory";
const EXPENSES_KEY = "timidy-expenses";

const field = id => document.getElementById(id);

// =====================================
// STORAGE HELPERS
// =====================================

function loadRecords(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function money(value) {
  return "TZS " + Number(value || 0).toLocaleString("en-TZ");
}

function sum(records, property) {
  return records.reduce(
    (total, record) => total + Number(record[property] || 0),
    0
  );
}

// =====================================
// SALE STATUS
// =====================================

// Older sales may not have a status field.
// Treat them as active unless explicitly voided.

function isVoidedSale(sale) {
  return (
    sale.status === "voided" ||
    sale.voided === true
  );
}

function getActiveSales(sales) {
  return sales.filter(sale => !isVoidedSale(sale));
}

// =====================================
// FINANCIAL CALCULATIONS
// =====================================

function calculateTotals(sales, expenses) {
  // Defensive filtering ensures voided sales
  // never affect financial calculations.
  const activeSales = getActiveSales(sales);

  const revenue = sum(activeSales, "amount");
  const costOfGoods = sum(activeSales, "cost");

  const transactionExpenses = sum(
    activeSales,
    "expenses"
  );

  const operatingExpenses = sum(
    expenses,
    "amount"
  );

  const grossProfit = revenue - costOfGoods;

  const netProfit =
    revenue -
    costOfGoods -
    transactionExpenses -
    operatingExpenses;

  return {
    revenue,
    grossProfit,
    transactionExpenses,
    operatingExpenses,
    netProfit
  };
}

// =====================================
// DASHBOARD CARDS
// =====================================

function updateDashboardCards(sales, expenses) {
  const totals = calculateTotals(sales, expenses);

  const revenueCard = field("dashboardRevenue");
  const grossProfitCard = field("dashboardGrossProfit");
  const netProfitCard = field("dashboardNetProfit");
  const expensesCard = field("dashboardExpenses");

  if (revenueCard) {
    revenueCard.textContent = money(totals.revenue);
  }

  if (grossProfitCard) {
    grossProfitCard.textContent = money(totals.grossProfit);
  }

  if (netProfitCard) {
    netProfitCard.textContent = money(totals.netProfit);
  }

  if (expensesCard) {
    expensesCard.textContent = money(
      totals.operatingExpenses
    );
  }
}

// =====================================
// RECENT TRANSACTIONS
// =====================================

function renderRecentTransactions(sales) {
  const table = field("recentTransactions");

  if (!table) return;

  table.replaceChildren();

  // Voided transactions remain stored in
  // Sales History but are not shown here.
  const recent = getActiveSales(sales)
    .sort((a, b) =>
      String(b.date || "").localeCompare(
        String(a.date || "")
      )
    )
    .slice(0, 5);

  if (recent.length === 0) {
    const row = table.insertRow();
    const cell = row.insertCell();

    cell.colSpan = 5;
    cell.textContent = "No active sales recorded yet.";
    return;
  }

  recent.forEach(sale => {
    const row = table.insertRow();

    [
      sale.date || "—",
      sale.productName || "Unknown product",
      sale.type === "middleman"
        ? "Middleman"
        : "Own Stock",
      money(sale.amount),
      money(sale.profit)
    ].forEach(value => {
      row.insertCell().textContent = value;
    });
  });
}

// =====================================
// STOCK ALERTS
// =====================================

function renderStockAlerts(products) {
  const container = field("dashboardStockAlerts");

  if (!container) return;

  container.replaceChildren();

  const alerts = products.filter(product => {
    const quantity = Number(product.quantity);
    const minimumStock = Number(product.minimumStock);

    return (
      Number.isFinite(quantity) &&
      Number.isFinite(minimumStock) &&
      quantity <= minimumStock
    );
  });

  if (alerts.length === 0) {
    const empty = document.createElement("p");

    empty.className = "no-alerts";
    empty.textContent =
      "All registered products have sufficient stock.";

    container.appendChild(empty);
    return;
  }

  alerts.forEach(product => {
    const item = document.createElement("div");
    item.className = "stock-alert-item";

    const info = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = product.name;

    const description = document.createElement("p");

    description.textContent =
      Number(product.quantity) === 0
        ? "Out of stock — restocking required"
        : `${product.quantity} remaining — low stock`;

    info.append(name, description);

    const badge = document.createElement("span");
    badge.className = "stock-alert-badge";

    badge.textContent =
      Number(product.quantity) === 0
        ? "Out of Stock"
        : "Low Stock";

    item.append(info, badge);
    container.appendChild(item);
  });
}

// =====================================
// MONTHLY CHART DATA
// =====================================

let salesChart = null;

function buildMonthlyData(sales, expenses, months) {
  const now = new Date();
  const result = [];

  // Filter once before processing monthly data.
  const activeSales = getActiveSales(sales);

  for (
    let offset = months - 1;
    offset >= 0;
    offset--
  ) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth() - offset,
      1
    );

    const year = date.getFullYear();

    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    const key = `${year}-${month}`;

    const monthSales = activeSales.filter(sale =>
      typeof sale.date === "string" &&
      sale.date.startsWith(key)
    );

    const monthExpenses = expenses.filter(expense =>
      typeof expense.date === "string" &&
      expense.date.startsWith(key)
    );

    const totals = calculateTotals(
      monthSales,
      monthExpenses
    );

    result.push({
      label: date.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit"
      }),
      revenue: totals.revenue,
      netProfit: totals.netProfit
    });
  }

  return result;
}

// =====================================
// SALES CHART
// =====================================

function renderChart(sales, expenses) {
  const canvas = field("salesChart");

  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  const periodSelect = field("chartPeriod");

  const selectedMonths = Number(
    periodSelect?.value || 6
  );

  const months =
    Number.isSafeInteger(selectedMonths) &&
    selectedMonths > 0
      ? selectedMonths
      : 6;

  const data = buildMonthlyData(
    sales,
    expenses,
    months
  );

  if (salesChart) {
    salesChart.destroy();
  }

  const dark = document.body.classList.contains("dark");

  salesChart = new Chart(canvas, {
    type: "line",

    data: {
      labels: data.map(item => item.label),

      datasets: [
        {
          label: "Revenue",

          data: data.map(
            item => item.revenue
          ),

          borderColor: "#4f7cff",
          backgroundColor: "rgba(79,124,255,0.12)",

          tension: 0.35,
          fill: true
        },
        {
          label: "Net Profit",

          data: data.map(
            item => item.netProfit
          ),

          borderColor: "#16a34a",
          backgroundColor: "rgba(22,163,74,0.08)",

          tension: 0.35,
          fill: true
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        legend: {
          labels: {
            color: dark
              ? "#e2e8f0"
              : "#334155"
          }
        },

        tooltip: {
          callbacks: {
            label: context =>
              `${context.dataset.label}: ${
                money(context.parsed.y)
              }`
          }
        }
      },

      scales: {
        x: {
          ticks: {
            color: dark
              ? "#94a3b8"
              : "#64748b"
          },

          grid: {
            display: false
          }
        },

        y: {
          ticks: {
            color: dark
              ? "#94a3b8"
              : "#64748b",

            callback: value =>
              Number(value).toLocaleString("en-TZ")
          },

          grid: {
            color: dark
              ? "rgba(148,163,184,0.12)"
              : "rgba(148,163,184,0.18)"
          }
        }
      }
    }
  });
}

// =====================================
// REFRESH DASHBOARD
// =====================================

function refreshDashboard() {
  const sales = loadRecords(SALES_KEY);
  const expenses = loadRecords(EXPENSES_KEY);
  const products = loadRecords(INVENTORY_KEY);

  updateDashboardCards(sales, expenses);

  renderRecentTransactions(sales);

  renderStockAlerts(products);

  renderChart(sales, expenses);
}

// =====================================
// THEME SWITCHING
// =====================================

const themeToggle = field("themeToggle");

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
    themeToggle.textContent = dark
      ? "☀️"
      : "🌙";
  }
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
    refreshDashboard();
  });
}

// =====================================
// CHART PERIOD
// =====================================

const chartPeriod = field("chartPeriod");

if (chartPeriod) {
  chartPeriod.addEventListener(
    "change",
    refreshDashboard
  );
}

// =====================================
// PAGE REFRESH EVENTS
// =====================================

// Refresh when returning to the Dashboard.
window.addEventListener(
  "pageshow",
  refreshDashboard
);

// Refresh if localStorage changes in
// another browser tab.
window.addEventListener("storage", event => {
  if (
    event.key === SALES_KEY ||
    event.key === INVENTORY_KEY ||
    event.key === EXPENSES_KEY
  ) {
    refreshDashboard();
  }
});

// =====================================
// INITIAL RENDER
// =====================================

refreshDashboard();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}

// =====================================
// ANIMATED DASHBOARD GREETING
// =====================================

function animateDashboardGreeting() {
  const greeting = field("greetingText");

  if (!greeting) return;

  const fullText =
    greeting.dataset.text ||
    "Welcome back, Allan!";

  // Respect reduced-motion preferences.
  if (
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
  ) {
    greeting.textContent = fullText;
    greeting.classList.add("typing-complete");
    return;
  }

  let index = 0;

  greeting.textContent = "";

  function typeNextCharacter() {
    if (index < fullText.length) {
      greeting.textContent += fullText.charAt(index);
      index++;

      setTimeout(
        typeNextCharacter,
        75
      );
    } else {
      greeting.classList.add("typing-complete");
    }
  }

  typeNextCharacter();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    animateDashboardGreeting
  );
} else {
  animateDashboardGreeting();
}

