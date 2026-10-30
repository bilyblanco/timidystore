
const SALES_KEY = "timidy-sales";
const EXPENSES_KEY = "timidy-expenses";

const el = id => document.getElementById(id);
const money = n => "TZS " + Number(n).toLocaleString("en-TZ");

let reportChart = null;
let currentReport = null;

function loadRecords(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function sum(items, key) {
  return items.reduce(
    (total, item) => total + Number(item[key] || 0), 0
  );
}

function calculate(sales, expenses) {
  const revenue = sum(sales, "amount");
  const productCosts = sum(sales, "cost");
  const transactionCosts = sum(sales, "expenses");
  const operatingCosts = sum(expenses, "amount");
  const gross = revenue - productCosts;
  const net = gross - transactionCosts - operatingCosts;

  return {
    revenue,
    productCosts,
    gross,
    transactionCosts,
    operatingCosts,
    net,
    margin: revenue ? (net / revenue) * 100 : 0
  };
}

function quarterMonths(year, quarter) {
  const firstMonth = (quarter - 1) * 3 + 1;

  return Array.from({ length: 3 }, (_, index) => {
    const month = firstMonth + index;
    const key = `${year}-${String(month).padStart(2, "0")}`;

    return {
      key,
      label: new Date(year, month - 1, 1)
        .toLocaleDateString("en-US", { month: "short" })
    };
  });
}

function createReport() {
  const year = Number(el("reportYear").value);
  const quarter = Number(el("reportQuarter").value);
  const months = quarterMonths(year, quarter);
  const keys = months.map(m => m.key);

  const sales = loadRecords(SALES_KEY).filter(s =>
    typeof s.date === "string" &&
    keys.includes(s.date.slice(0, 7))
  );

  const expenses = loadRecords(EXPENSES_KEY).filter(e =>
    typeof e.date === "string" &&
    keys.includes(e.date.slice(0, 7))
  );

  const monthly = months.map(month => {
    const monthSales = sales.filter(s =>
      s.date.startsWith(month.key)
    );
    const monthExpenses = expenses.filter(e =>
      e.date.startsWith(month.key)
    );

    return {
      label: month.label,
      ...calculate(monthSales, monthExpenses)
    };
  });

  return {
    year,
    quarter,
    months,
    sales,
    expenses,
    monthly,
    totals: calculate(sales, expenses)
  };
}

function addBreakdownRow(label, amount, options = {}) {
  const row = document.createElement("div");
  row.className = "report-breakdown-row";

  if (options.total) row.classList.add("total");

  const name = document.createElement("span");
  name.textContent = label;

  const value = document.createElement("strong");
  value.textContent = money(amount);

  if (options.negative) {
    value.classList.add("negative-value");
  }

  if (options.total && amount >= 0) {
    value.classList.add("positive-value");
  }

  row.append(name, value);
  el("financialBreakdown").appendChild(row);
}

function renderBreakdown(totals) {
  el("financialBreakdown").replaceChildren();

  addBreakdownRow("Total Revenue", totals.revenue);
  addBreakdownRow("Cost of Products Sold", -totals.productCosts, {
    negative: true
  });
  addBreakdownRow("Gross Profit", totals.gross);
  addBreakdownRow("Transaction Expenses", -totals.transactionCosts, {
    negative: true
  });
  addBreakdownRow("Operating Expenses", -totals.operatingCosts, {
    negative: true
  });
  addBreakdownRow("Net Profit", totals.net, {
    total: true,
    negative: totals.net < 0
  });
}

function renderSalesTypes(sales) {
  const table = el("salesTypeTable");
  table.replaceChildren();

  [
    { type: "middleman", label: "Middleman Sales" },
    { type: "stock", label: "Own Stock Sales" }
  ].forEach(group => {
    const records = sales.filter(s => s.type === group.type);

    const revenue = sum(records, "amount");
    const profit = records.reduce(
      (total, s) =>
        total + Number(s.amount || 0)
        - Number(s.cost || 0)
        - Number(s.expenses || 0),
      0
    );

    const row = table.insertRow();

    [
      group.label,
      records.length,
      money(revenue),
      money(profit)
    ].forEach(value => {
      row.insertCell().textContent = value;
    });
  });
}

function renderTransactions(report) {
  const table = el("reportTransactions");
  table.replaceChildren();

  const records = [
    ...report.sales.map(s => ({
      date: s.date,
      type: s.type === "middleman"
        ? "Middleman Sale" : "Own Stock Sale",
      description: s.productName,
      amount: s.amount
    })),
    ...report.expenses.map(e => ({
      date: e.date,
      type: "Operating Expense",
      description: e.title,
      amount: -e.amount
    }))
  ].sort((a, b) => b.date.localeCompare(a.date));

  if (!records.length) {
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.textContent = "No transactions in this quarter.";
    return;
  }

  records.forEach(record => {
    const row = table.insertRow();

    [
      record.date,
      record.type,
      record.description,
      money(record.amount)
    ].forEach(value => {
      row.insertCell().textContent = value;
    });
  });
}

function renderChart(report) {
  if (typeof Chart === "undefined") return;

  if (reportChart) reportChart.destroy();

  const dark = document.body.classList.contains("dark");

  reportChart = new Chart(el("reportChart"), {
    type: "bar",
    data: {
      labels: report.monthly.map(m => m.label),
      datasets: [
        {
          label: "Revenue",
          data: report.monthly.map(m => m.revenue),
          backgroundColor: "#4f7cff",
          borderRadius: 6
        },
        {
          label: "Net Profit",
          data: report.monthly.map(m => m.net),
          backgroundColor: "#16a34a",
          borderRadius: 6
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
          }
        },
        y: {
          ticks: {
            color: dark ? "#94a3b8" : "#64748b",
            callback: value =>
              Number(value).toLocaleString("en-TZ")
          }
        }
      }
    }
  });
}

function renderReport() {
  currentReport = createReport();
  const t = currentReport.totals;

  el("reportRevenue").textContent = money(t.revenue);
  el("reportGross").textContent = money(t.gross);
  el("reportNet").textContent = money(t.net);
  el("reportMargin").textContent =
    t.margin.toFixed(1) + "%";

  renderBreakdown(t);
  renderSalesTypes(currentReport.sales);
  renderTransactions(currentReport);
  renderChart(currentReport);

  el("reportMessage").textContent =
    `Showing Q${currentReport.quarter} ${currentReport.year}`;
}

function downloadPDF() {
  if (!window.jspdf?.jsPDF) {
    alert("PDF library did not load. Check your connection.");
    return;
  }

  const report = currentReport;
  const t = report.totals;
  const pdf = new window.jspdf.jsPDF();

  let y = 20;

  pdf.setFontSize(20);
  pdf.text("TIMIDY STORE", 15, y);

  y += 10;
  pdf.setFontSize(12);
  pdf.text(
    `Quarterly Financial Report - Q${report.quarter} ${report.year}`,
    15, y
  );

  y += 12;
  pdf.setFontSize(10);

  const lines = [
    ["Revenue", t.revenue],
    ["Cost of Products Sold", t.productCosts],
    ["Gross Profit", t.gross],
    ["Transaction Expenses", t.transactionCosts],
    ["Operating Expenses", t.operatingCosts],
    ["Net Profit", t.net]
  ];

  lines.forEach(([label, amount]) => {
    pdf.text(label, 15, y);
    pdf.text(money(amount), 195, y, { align: "right" });
    y += 9;
  });

  y += 6;
  pdf.text(`Net Profit Margin: ${t.margin.toFixed(1)}%`, 15, y);

  y += 12;
  pdf.setFontSize(12);
  pdf.text("Monthly Performance", 15, y);
  y += 9;

  pdf.setFontSize(10);
  report.monthly.forEach(month => {
    pdf.text(
      `${month.label}: Revenue ${money(month.revenue)} | ` +
      `Net Profit ${money(month.net)}`,
      15, y
    );
    y += 8;
  });

  y += 8;
  pdf.setFontSize(12);
  pdf.text("Sales Summary", 15, y);
  y += 9;

  pdf.setFontSize(10);
  pdf.text(
    `Middleman Sales: ${
      report.sales.filter(s => s.type === "middleman").length
    }`,
    15, y
  );
  y += 8;
  pdf.text(
    `Own Stock Sales: ${
      report.sales.filter(s => s.type === "stock").length
    }`,
    15, y
  );

  pdf.setFontSize(9);
  pdf.setTextColor(110);
  pdf.text(
    "Generated from browser-based prototype records.",
    15, 280
  );

  pdf.save(
    `Timidy-Store-Q${report.quarter}-${report.year}.pdf`
  );
}

function downloadExcel() {
  if (typeof XLSX === "undefined") {
    alert("Excel library did not load. Check your connection.");
    return;
  }

  const report = currentReport;
  const t = report.totals;
  const workbook = XLSX.utils.book_new();

  const summary = [
    ["Timidy Store - Quarterly Report"],
    ["Year", report.year],
    ["Quarter", `Q${report.quarter}`],
    [],
    ["Metric", "TZS"],
    ["Revenue", t.revenue],
    ["Cost of Products Sold", t.productCosts],
    ["Gross Profit", t.gross],
    ["Transaction Expenses", t.transactionCosts],
    ["Operating Expenses", t.operatingCosts],
    ["Net Profit", t.net],
    ["Net Profit Margin (%)", t.margin]
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet["!cols"] = [{ wch: 30 }, { wch: 20 }];

  XLSX.utils.book_append_sheet(
    workbook, summarySheet, "Summary"
  );

  const monthlySheet = XLSX.utils.json_to_sheet(
    report.monthly.map(m => ({
      Month: m.label,
      Revenue: m.revenue,
      "Product Costs": m.productCosts,
      "Gross Profit": m.gross,
      "Transaction Expenses": m.transactionCosts,
      "Operating Expenses": m.operatingCosts,
      "Net Profit": m.net
    }))
  );

  XLSX.utils.book_append_sheet(
    workbook, monthlySheet, "Monthly"
  );

  const salesSheet = XLSX.utils.json_to_sheet(
    report.sales.map(s => ({
      Date: s.date,
      Product: s.productName,
      Type: s.type,
      Quantity: s.quantity,
      Revenue: s.amount,
      "Product Cost": s.cost,
      "Transaction Expenses": s.expenses,
      Profit: s.profit
    }))
  );

  XLSX.utils.book_append_sheet(
    workbook, salesSheet, "Sales"
  );

  const expensesSheet = XLSX.utils.json_to_sheet(
    report.expenses.map(e => ({
      Date: e.date,
      Description: e.title,
      Category: e.category,
      Amount: e.amount,
      Notes: e.notes
    }))
  );

  XLSX.utils.book_append_sheet(
    workbook, expensesSheet, "Expenses"
  );

  XLSX.writeFile(
    workbook,
    `Timidy-Store-Q${report.quarter}-${report.year}.xlsx`
  );
}

// Populate reporting years from available data.
function initializeYears() {
  const now = new Date();
  const years = new Set([now.getFullYear()]);

  [
    ...loadRecords(SALES_KEY),
    ...loadRecords(EXPENSES_KEY)
  ].forEach(record => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(record.date || "")) {
      years.add(Number(record.date.slice(0, 4)));
    }
  });

  [...years].sort((a, b) => b - a).forEach(year => {
    el("reportYear").add(new Option(year, year));
  });

  el("reportYear").value = String(now.getFullYear());
  el("reportQuarter").value =
    String(Math.floor(now.getMonth() / 3) + 1);
}

// Theme
const themeToggle = el("themeToggle");

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
  renderReport();
});

el("reportYear").addEventListener("change", renderReport);
el("reportQuarter").addEventListener("change", renderReport);

el("downloadPDF").addEventListener("click", downloadPDF);
el("downloadExcel").addEventListener("click", downloadExcel);

initializeYears();
renderReport();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
