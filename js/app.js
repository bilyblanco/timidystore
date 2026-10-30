
const SALES_KEY = "timidy-sales";
const INVENTORY_KEY = "timidy-inventory";
const EXPENSES_KEY = "timidy-expenses";

const field = id => document.getElementById(id);

function loadRecords(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function money(value) {
  return "TZS " + Number(value).toLocaleString("en-TZ");
}

function sum(records, property) {
  return records.reduce(
    (total, record) => total + Number(record[property] || 0),
    0
  );
}

function calculateTotals(sales, expenses) {
  const revenue = sum(sales, "amount");
  const costOfGoods = sum(sales, "cost");
  const transactionExpenses = sum(sales, "expenses");
  const operatingExpenses = sum(expenses, "amount");

  return {
    revenue,
    grossProfit: revenue - costOfGoods,
    operatingExpenses,
    netProfit:
      revenue -
      costOfGoods -
      transactionExpenses -
      operatingExpenses
  };
}

function updateDashboardCards(sales, expenses) {
  const totals = calculateTotals(sales, expenses);

  field("dashboardRevenue").textContent =
    money(totals.revenue);

  field("dashboardGrossProfit").textContent =
    money(totals.grossProfit);

  field("dashboardNetProfit").textContent =
    money(totals.netProfit);

  field("dashboardExpenses").textContent =
    money(totals.operatingExpenses);
}

function renderRecentTransactions(sales) {
  const table = field("recentTransactions");
  table.replaceChildren();

  const recent = [...sales]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  if (recent.length === 0) {
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.textContent = "No sales recorded yet.";
    return;
  }

  recent.forEach(sale => {
    const row = table.insertRow();

    [
      sale.date,
      sale.productName,
      sale.type === "middleman" ? "Middleman" : "Own Stock",
      money(sale.amount),
      money(sale.profit)
    ].forEach(value => {
      row.insertCell().textContent = value;
    });
  });
}

function renderStockAlerts(products) {
  const container = field("dashboardStockAlerts");
  container.replaceChildren();

  const alerts = products.filter(product =>
    product.quantity <= product.minimumStock
  );

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
    description.textContent = product.quantity === 0
      ? "Out of stock — restocking required"
      : `${product.quantity} remaining — low stock`;

    info.append(name, description);

    const badge = document.createElement("span");
    badge.className = "stock-alert-badge";
    badge.textContent = product.quantity === 0
      ? "Out of Stock" : "Low Stock";

    item.append(info, badge);
    container.appendChild(item);
  });
}

let salesChart = null;

function buildMonthlyData(sales, expenses, months) {
  const now = new Date();
  const result = [];

  for (let offset = months - 1; offset >= 0; offset--) {
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

    const monthSales = sales.filter(
      sale => typeof sale.date === "string" &&
        sale.date.startsWith(key)
    );

    const monthExpenses = expenses.filter(
      expense => typeof expense.date === "string" &&
        expense.date.startsWith(key)
    );

    const totals = calculateTotals(
      monthSales, monthExpenses
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

function renderChart(sales, expenses) {
  const canvas = field("salesChart");
  if (!canvas || typeof Chart === "undefined") return;

  const months = Number(field("chartPeriod").value);
  const data = buildMonthlyData(sales, expenses, months);

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
          data: data.map(item => item.revenue),
          borderColor: "#4f7cff",
          backgroundColor: "rgba(79,124,255,0.12)",
          tension: 0.35,
          fill: true
        },
        {
          label: "Net Profit",
          data: data.map(item => item.netProfit),
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
            color: dark ? "#e2e8f0" : "#334155"
          }
        },
        tooltip: {
          callbacks: {
            label: context =>
              `${context.dataset.label}: ${money(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: dark ? "#94a3b8" : "#64748b"
          },
          grid: {
            display: false
          }
        },
        y: {
          ticks: {
            color: dark ? "#94a3b8" : "#64748b",
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

function refreshDashboard() {
  const sales = loadRecords(SALES_KEY);
  const expenses = loadRecords(EXPENSES_KEY);
  const products = loadRecords(INVENTORY_KEY);

  updateDashboardCards(sales, expenses);
  renderRecentTransactions(sales);
  renderStockAlerts(products);
  renderChart(sales, expenses);
}

// Theme switching
const themeToggle = field("themeToggle");

function applyTheme(theme) {
  const dark = theme === "dark";

  document.documentElement.classList.toggle("dark", dark);
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
  refreshDashboard();
});

field("chartPeriod").addEventListener(
  "change", refreshDashboard
);

window.addEventListener("pageshow", refreshDashboard);

refreshDashboard();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}


function animateDashboardGreeting() {
  const greeting = document.getElementById("greetingText");

  if (!greeting) return;

  const fullText = greeting.dataset.text || "Welcome back, Allan!";

  // Accessibility: show the complete text without animation.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
      setTimeout(typeNextCharacter, 75);
    } else {
      greeting.classList.add("typing-complete");
    }
  }

  typeNextCharacter();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", animateDashboardGreeting);
} else {
  animateDashboardGreeting();
}
