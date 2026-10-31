
"use strict";

// =====================================
// TIMIDY STORE — SUPABASE DASHBOARD
// =====================================

const db = window.timidySupabase;

if (!db) {
  throw new Error("Supabase is not configured.");
}

const field = id => document.getElementById(id);

let dashboardSales = [];
let dashboardExpenses = [];
let dashboardProducts = [];

let salesChart = null;
let dashboardLoading = false;
let dashboardLoaded = false;

// =====================================
// HELPERS
// =====================================

function money(value) {
  return "TZS " + Number(value || 0).toLocaleString(
    "en-TZ",
    { maximumFractionDigits: 2 }
  );
}

function sum(records, property) {
  return records.reduce(
    (total, record) =>
      total + Number(record[property] || 0),
    0
  );
}

function mapSale(row) {
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    status: row.status,
    voided: row.voided,
    productName: row.product_name,
    amount: Number(row.amount),
    cost: Number(row.cost),
    expenses: Number(row.expenses),
    profit: Number(row.profit)
  };
}

function mapExpense(row) {
  return {
    id: row.id,
    date: row.date,
    amount: Number(row.amount)
  };
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    quantity: Number(row.quantity),
    minimumStock: Number(row.minimum_stock)
  };
}

function showDashboardError(error) {
  console.error("Dashboard error:", error);

  let notice = field("dashboardLoadError");

  if (!notice) {
    notice = document.createElement("div");
    notice.id = "dashboardLoadError";
    notice.className = "sale-message error";
    notice.setAttribute("role", "alert");

    const main = document.querySelector("main");

    if (main) {
      main.prepend(notice);
    } else {
      document.body.prepend(notice);
    }
  }

  notice.textContent =
    "Unable to load dashboard data from Supabase. " +
    (error?.message || "Please refresh and try again.");
}

function clearDashboardError() {
  field("dashboardLoadError")?.remove();
}

// =====================================
// SALE STATUS
// =====================================

function isVoidedSale(sale) {
  return (
    sale.status === "voided" ||
    sale.voided === true
  );
}

function getActiveSales(sales) {
  return sales.filter(
    sale => !isVoidedSale(sale)
  );
}

// =====================================
// FINANCIAL CALCULATIONS
// =====================================

function calculateTotals(sales, expenses) {
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

  const grossProfit =
    revenue - costOfGoods;

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
  const totals = calculateTotals(
    sales,
    expenses
  );

  const revenueCard = field("dashboardRevenue");
  const grossProfitCard = field("dashboardGrossProfit");
  const netProfitCard = field("dashboardNetProfit");
  const expensesCard = field("dashboardExpenses");

  if (revenueCard) {
    revenueCard.textContent = money(
      totals.revenue
    );
  }

  if (grossProfitCard) {
    grossProfitCard.textContent = money(
      totals.grossProfit
    );
  }

  if (netProfitCard) {
    netProfitCard.textContent = money(
      totals.netProfit
    );
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

  const recent = getActiveSales(sales)
    .slice()
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
    cell.textContent =
      "No active sales recorded yet.";

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
  const container = field(
    "dashboardStockAlerts"
  );

  if (!container) return;

  container.replaceChildren();

  const alerts = products.filter(product => {
    const quantity = Number(product.quantity);
    const minimumStock = Number(
      product.minimumStock
    );

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
      product.quantity === 0
        ? "Out of stock — restocking required"
        : `${product.quantity} remaining — low stock`;

    info.append(name, description);

    const badge = document.createElement("span");
    badge.className = "stock-alert-badge";

    badge.textContent =
      product.quantity === 0
        ? "Out of Stock"
        : "Low Stock";

    item.append(info, badge);
    container.appendChild(item);
  });
}

// =====================================
// MONTHLY CHART DATA
// =====================================

function buildMonthlyData(sales, expenses, months) {
  const now = new Date();
  const result = [];

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

    const monthSales = activeSales.filter(
      sale =>
        typeof sale.date === "string" &&
        sale.date.startsWith(key)
    );

    const monthExpenses = expenses.filter(
      expense =>
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

  if (
    !canvas ||
    typeof Chart === "undefined"
  ) {
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

  const dark = document.body.classList.contains(
    "dark"
  );

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
          backgroundColor:
            "rgba(79,124,255,0.12)",

          tension: 0.35,
          fill: true
        },

        {
          label: "Net Profit",

          data: data.map(
            item => item.netProfit
          ),

          borderColor: "#16a34a",
          backgroundColor:
            "rgba(22,163,74,0.08)",

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
              Number(value).toLocaleString(
                "en-TZ"
              )
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
// RENDER DASHBOARD
// =====================================

function renderDashboard() {
  updateDashboardCards(
    dashboardSales,
    dashboardExpenses
  );

  renderRecentTransactions(
    dashboardSales
  );

  renderStockAlerts(
    dashboardProducts
  );

  renderChart(
    dashboardSales,
    dashboardExpenses
  );
}

// =====================================
// LOAD ALL ROWS FROM SUPABASE
// =====================================

// Supabase queries commonly return up to
// 1,000 rows by default. Read in pages so
// older transactions aren't silently omitted.
//
// For a much larger store, we'll eventually
// move dashboard aggregation to SQL.

async function fetchAllRows(
  table,
  columns,
  orderColumn = "id"
) {
  const pageSize = 500;
  const allRows = [];

  let start = 0;

  while (true) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order(orderColumn, {
        ascending: true
      })
      .range(
        start,
        start + pageSize - 1
      );

    if (error) {
      throw error;
    }

    const rows = data || [];

    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    start += pageSize;
  }

  return allRows;
}

// =====================================
// REFRESH FROM SUPABASE
// =====================================

async function refreshDashboard() {
  if (dashboardLoading) return;

  dashboardLoading = true;

  try {
    const user =
      await window.TimidyAuth.getAuthorizedUser();

    if (!user) {
      window.location.replace(
        "login.html"
      );
      return;
    }

    const [
      salesRows,
      expenseRows,
      productRows
    ] = await Promise.all([
      fetchAllRows(
        "sales",
        "id,date,type,status,voided," +
        "product_name,amount,cost,expenses,profit"
      ),

      fetchAllRows(
        "expenses",
        "id,date,amount"
      ),

      fetchAllRows(
        "inventory",
        "id,name,quantity,minimum_stock"
      )
    ]);

    dashboardSales = salesRows.map(
      mapSale
    );

    dashboardExpenses = expenseRows.map(
      mapExpense
    );

    dashboardProducts = productRows.map(
      mapProduct
    );

    dashboardLoaded = true;

    clearDashboardError();
    renderDashboard();
  } catch (error) {
    showDashboardError(error);

    // Do not replace existing figures with
    // misleading zeros when loading fails.
    if (!dashboardLoaded) {
      [
        "dashboardRevenue",
        "dashboardGrossProfit",
        "dashboardNetProfit",
        "dashboardExpenses"
      ].forEach(id => {
        const element = field(id);

        if (element) {
          element.textContent = "Unavailable";
        }
      });
    }
  } finally {
    dashboardLoading = false;
  }
}

window.addEventListener(
  "timidy-theme-change",
  () => {
    if (dashboardLoaded) {
      renderChart(
        dashboardSales,
        dashboardExpenses
      );
    }
  }
);

// =====================================
// CHART PERIOD
// =====================================

const chartPeriod = field("chartPeriod");

if (chartPeriod) {
  chartPeriod.addEventListener(
    "change",
    () => {
      if (dashboardLoaded) {
        renderChart(
          dashboardSales,
          dashboardExpenses
        );
      }
    }
  );
}

// =====================================
// PAGE REFRESH EVENTS
// =====================================

window.addEventListener(
  "pageshow",
  () => {
    refreshDashboard();
  }
);

// Refresh when returning to the browser
// tab after using another module.

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      !document.hidden &&
      dashboardLoaded
    ) {
      refreshDashboard();
    }
  }
);

// =====================================
// ANIMATED DASHBOARD GREETING
// =====================================

function animateDashboardGreeting() {
  const greeting = field("greetingText");

  if (!greeting) return;

  const fullText =
    greeting.dataset.text ||
    "Welcome back, Allan!";

  if (
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
  ) {
    greeting.textContent = fullText;

    greeting.classList.add(
      "typing-complete"
    );

    return;
  }

  let index = 0;

  greeting.textContent = "";

  function typeNextCharacter() {
    if (index < fullText.length) {
      greeting.textContent +=
        fullText.charAt(index);

      index++;

      setTimeout(
        typeNextCharacter,
        75
      );
    } else {
      greeting.classList.add(
        "typing-complete"
      );
    }
  }

  typeNextCharacter();
}

// =====================================
// INITIALIZATION
// =====================================

refreshDashboard();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    animateDashboardGreeting
  );
} else {
  animateDashboardGreeting();
}
