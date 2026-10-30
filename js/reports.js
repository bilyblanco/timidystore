
"use strict";

// =====================================
// TIMIDY STORE - REPORTS
// Void-aware quarterly reporting
// =====================================

const SALES_KEY = "timidy-sales";
const EXPENSES_KEY = "timidy-expenses";

const el = id => document.getElementById(id);

const money = value =>
  "TZS " + Number(value || 0).toLocaleString("en-TZ");

let reportChart = null;
let currentReport = null;

// =====================================
// STORAGE
// =====================================

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
    (total, item) =>
      total + Number(item[key] || 0),
    0
  );
}

// =====================================
// SALE STATUS
// =====================================

// Existing sales without a status are active.
// Newer voided sales have status="voided"
// and/or voided=true.

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

function getVoidedSales(sales) {
  return sales.filter(isVoidedSale);
}

// =====================================
// FINANCIAL CALCULATIONS
// =====================================

function calculate(sales, expenses) {
  // Always exclude voided sales.
  const activeSales = getActiveSales(sales);

  const revenue = sum(activeSales, "amount");

  const productCosts = sum(
    activeSales,
    "cost"
  );

  const transactionCosts = sum(
    activeSales,
    "expenses"
  );

  const operatingCosts = sum(
    expenses,
    "amount"
  );

  const gross = revenue - productCosts;

  const net =
    gross -
    transactionCosts -
    operatingCosts;

  return {
    revenue,
    productCosts,
    gross,
    transactionCosts,
    operatingCosts,
    net,
    margin: revenue
      ? (net / revenue) * 100
      : 0
  };
}

// =====================================
// QUARTER HELPERS
// =====================================

function quarterMonths(year, quarter) {
  const firstMonth = (quarter - 1) * 3 + 1;

  return Array.from(
    { length: 3 },
    (_, index) => {
      const month = firstMonth + index;

      const key =
        `${year}-${String(month).padStart(2, "0")}`;

      return {
        key,
        label: new Date(
          year,
          month - 1,
          1
        ).toLocaleDateString("en-US", {
          month: "short"
        })
      };
    }
  );
}

// =====================================
// CREATE QUARTERLY REPORT
// =====================================

function createReport() {
  const year = Number(
    el("reportYear").value
  );

  const quarter = Number(
    el("reportQuarter").value
  );

  const months = quarterMonths(
    year,
    quarter
  );

  const keys = months.map(
    month => month.key
  );

  const allQuarterSales = loadRecords(
    SALES_KEY
  ).filter(sale =>
    typeof sale.date === "string" &&
    keys.includes(sale.date.slice(0, 7))
  );

  // Active sales drive every financial total.
  const sales = getActiveSales(
    allQuarterSales
  );

  // Retain cancellations separately for audit.
  const voidedSales = getVoidedSales(
    allQuarterSales
  );

  const expenses = loadRecords(
    EXPENSES_KEY
  ).filter(expense =>
    typeof expense.date === "string" &&
    keys.includes(expense.date.slice(0, 7))
  );

  const monthly = months.map(month => {
    const monthSales = sales.filter(
      sale => sale.date.startsWith(month.key)
    );

    const monthExpenses = expenses.filter(
      expense =>
        expense.date.startsWith(month.key)
    );

    return {
      label: month.label,
      ...calculate(
        monthSales,
        monthExpenses
      )
    };
  });

  return {
    year,
    quarter,
    months,
    sales,
    voidedSales,
    expenses,
    monthly,
    totals: calculate(sales, expenses)
  };
}

// =====================================
// FINANCIAL BREAKDOWN
// =====================================

function addBreakdownRow(
  label,
  amount,
  options = {}
) {
  const row = document.createElement("div");
  row.className = "report-breakdown-row";

  if (options.total) {
    row.classList.add("total");
  }

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

  addBreakdownRow(
    "Total Revenue",
    totals.revenue
  );

  addBreakdownRow(
    "Cost of Products Sold",
    -totals.productCosts,
    { negative: true }
  );

  addBreakdownRow(
    "Gross Profit",
    totals.gross
  );

  addBreakdownRow(
    "Transaction Expenses",
    -totals.transactionCosts,
    { negative: true }
  );

  addBreakdownRow(
    "Operating Expenses",
    -totals.operatingCosts,
    { negative: true }
  );

  addBreakdownRow(
    "Net Profit",
    totals.net,
    {
      total: true,
      negative: totals.net < 0
    }
  );
}

// =====================================
// SALES TYPE SUMMARY
// =====================================

function renderSalesTypes(sales) {
  const table = el("salesTypeTable");
  table.replaceChildren();

  [
    {
      type: "middleman",
      label: "Middleman Sales"
    },
    {
      type: "stock",
      label: "Own Stock Sales"
    }
  ].forEach(group => {
    const records = getActiveSales(
      sales.filter(
        sale => sale.type === group.type
      )
    );

    const revenue = sum(
      records,
      "amount"
    );

    const profit = records.reduce(
      (total, sale) =>
        total +
        Number(sale.amount || 0) -
        Number(sale.cost || 0) -
        Number(sale.expenses || 0),
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

// =====================================
// TRANSACTION HISTORY
// =====================================

function renderTransactions(report) {
  const table = el("reportTransactions");
  table.replaceChildren();

  const records = [
    ...report.sales.map(sale => ({
      date: sale.date,
      type:
        sale.type === "middleman"
          ? "Middleman Sale"
          : "Own Stock Sale",
      description: sale.productName,
      amount: sale.amount
    })),

    ...report.expenses.map(expense => ({
      date: expense.date,
      type: "Operating Expense",
      description: expense.title,
      amount: -Number(expense.amount || 0)
    }))
  ].sort(
    (a, b) =>
      String(b.date || "").localeCompare(
        String(a.date || "")
      )
  );

  if (!records.length) {
    const row = table.insertRow();
    const cell = row.insertCell();

    cell.colSpan = 4;
    cell.textContent =
      "No active transactions in this quarter.";
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

// =====================================
// QUARTERLY CHART
// =====================================

function renderChart(report) {
  if (typeof Chart === "undefined") {
    return;
  }

  const canvas = el("reportChart");

  if (!canvas) return;

  if (reportChart) {
    reportChart.destroy();
  }

  const dark = document.body.classList.contains(
    "dark"
  );

  reportChart = new Chart(canvas, {
    type: "bar",

    data: {
      labels: report.monthly.map(
        month => month.label
      ),

      datasets: [
        {
          label: "Revenue",

          data: report.monthly.map(
            month => month.revenue
          ),

          backgroundColor: "#4f7cff",
          borderRadius: 6
        },
        {
          label: "Net Profit",

          data: report.monthly.map(
            month => month.net
          ),

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
          }
        }
      }
    }
  });
}

// =====================================
// RENDER REPORT
// =====================================

function renderReport() {
  currentReport = createReport();

  const totals = currentReport.totals;

  el("reportRevenue").textContent =
    money(totals.revenue);

  el("reportGross").textContent =
    money(totals.gross);

  el("reportNet").textContent =
    money(totals.net);

  el("reportMargin").textContent =
    totals.margin.toFixed(1) + "%";

  renderBreakdown(totals);

  renderSalesTypes(
    currentReport.sales
  );

  renderTransactions(
    currentReport
  );

  renderChart(
    currentReport
  );

  const voidedCount =
    currentReport.voidedSales.length;

  el("reportMessage").textContent =
    `Showing Q${currentReport.quarter} ` +
    `${currentReport.year}` +
    (
      voidedCount
        ? ` — ${voidedCount} voided sale(s) excluded`
        : ""
    );
}

// =====================================
// PDF EXPORT
// =====================================

function downloadPDF() {
  if (!window.jspdf?.jsPDF) {
    alert(
      "PDF library did not load. " +
      "Check your connection."
    );
    return;
  }

  // Regenerate from current records before export.
  const report = createReport();
  currentReport = report;

  const totals = report.totals;

  const pdf = new window.jspdf.jsPDF();

  let y = 20;

  pdf.setFontSize(20);
  pdf.text("TIMIDY STORE", 15, y);

  y += 10;

  pdf.setFontSize(12);

  pdf.text(
    `Quarterly Financial Report - ` +
    `Q${report.quarter} ${report.year}`,
    15,
    y
  );

  y += 12;
  pdf.setFontSize(10);

  const lines = [
    ["Revenue", totals.revenue],
    ["Cost of Products Sold", totals.productCosts],
    ["Gross Profit", totals.gross],
    ["Transaction Expenses", totals.transactionCosts],
    ["Operating Expenses", totals.operatingCosts],
    ["Net Profit", totals.net]
  ];

  lines.forEach(([label, amount]) => {
    pdf.text(label, 15, y);

    pdf.text(
      money(amount),
      195,
      y,
      { align: "right" }
    );

    y += 9;
  });

  y += 6;

  pdf.text(
    `Net Profit Margin: ${
      totals.margin.toFixed(1)
    }%`,
    15,
    y
  );

  y += 12;

  pdf.setFontSize(12);
  pdf.text("Monthly Performance", 15, y);

  y += 9;
  pdf.setFontSize(10);

  report.monthly.forEach(month => {
    pdf.text(
      `${month.label}: ` +
      `Revenue ${money(month.revenue)} | ` +
      `Net Profit ${money(month.net)}`,
      15,
      y
    );

    y += 8;
  });

  y += 8;

  pdf.setFontSize(12);
  pdf.text("Sales Summary", 15, y);

  y += 9;
  pdf.setFontSize(10);

  const middlemanCount = report.sales.filter(
    sale => sale.type === "middleman"
  ).length;

  const stockCount = report.sales.filter(
    sale => sale.type === "stock"
  ).length;

  pdf.text(
    `Middleman Sales: ${middlemanCount}`,
    15,
    y
  );

  y += 8;

  pdf.text(
    `Own Stock Sales: ${stockCount}`,
    15,
    y
  );

  y += 8;

  pdf.text(
    `Voided Sales Excluded: ${
      report.voidedSales.length
    }`,
    15,
    y
  );

  pdf.setFontSize(9);
  pdf.setTextColor(110);

  pdf.text(
    "Generated from browser-based prototype records.",
    15,
    280
  );

  pdf.save(
    `Timidy-Store-Q${report.quarter}-${report.year}.pdf`
  );
}

// =====================================
// EXCEL EXPORT
// =====================================

function downloadExcel() {
  if (typeof XLSX === "undefined") {
    alert(
      "Excel library did not load. " +
      "Check your connection."
    );
    return;
  }

  // Always export the latest stored records.
  const report = createReport();
  currentReport = report;

  const totals = report.totals;

  const workbook = XLSX.utils.book_new();

  // -------- SUMMARY --------

  const summary = [
    ["Timidy Store - Quarterly Report"],
    ["Year", report.year],
    ["Quarter", `Q${report.quarter}`],
    [],
    ["Metric", "TZS"],
    ["Revenue", totals.revenue],
    ["Cost of Products Sold", totals.productCosts],
    ["Gross Profit", totals.gross],
    [
      "Transaction Expenses",
      totals.transactionCosts
    ],
    [
      "Operating Expenses",
      totals.operatingCosts
    ],
    ["Net Profit", totals.net],
    [
      "Net Profit Margin (%)",
      totals.margin
    ],
    [],
    [
      "Voided Sales Excluded",
      report.voidedSales.length
    ]
  ];

  const summarySheet =
    XLSX.utils.aoa_to_sheet(summary);

  summarySheet["!cols"] = [
    { wch: 30 },
    { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    summarySheet,
    "Summary"
  );

  // -------- MONTHLY --------

  const monthlySheet =
    XLSX.utils.json_to_sheet(
      report.monthly.map(month => ({
        Month: month.label,
        Revenue: month.revenue,
        "Product Costs": month.productCosts,
        "Gross Profit": month.gross,
        "Transaction Expenses":
          month.transactionCosts,
        "Operating Expenses":
          month.operatingCosts,
        "Net Profit": month.net
      }))
    );

  XLSX.utils.book_append_sheet(
    workbook,
    monthlySheet,
    "Monthly"
  );

  // -------- ACTIVE SALES --------

  const salesSheet =
    XLSX.utils.json_to_sheet(
      report.sales.map(sale => ({
        Date: sale.date,
        Product: sale.productName,
        Type: sale.type,
        Quantity: sale.quantity,
        Revenue: sale.amount,
        "Product Cost": sale.cost,
        "Transaction Expenses": sale.expenses,
        Profit: sale.profit,
        Status: "Active"
      }))
    );

  XLSX.utils.book_append_sheet(
    workbook,
    salesSheet,
    "Sales"
  );

  // -------- OPERATING EXPENSES --------

  const expensesSheet =
    XLSX.utils.json_to_sheet(
      report.expenses.map(expense => ({
        Date: expense.date,
        Description: expense.title,
        Category: expense.category,
        Amount: expense.amount,
        Notes: expense.notes
      }))
    );

  XLSX.utils.book_append_sheet(
    workbook,
    expensesSheet,
    "Expenses"
  );

  // -------- VOIDED SALES AUDIT --------

  const voidedSheet =
    XLSX.utils.json_to_sheet(
      report.voidedSales.map(sale => ({
        "Sale ID": sale.id,
        "Original Date": sale.date,
        Product: sale.productName,
        Type: sale.type,
        Quantity: sale.quantity,
        "Original Revenue": sale.amount,
        "Original Product Cost": sale.cost,
        "Original Transaction Expenses":
          sale.expenses,
        "Original Profit": sale.profit,
        Status: "Voided",
        "Voided At": sale.voidedAt || "",
        "Void Reason": sale.voidReason || ""
      }))
    );

  XLSX.utils.book_append_sheet(
    workbook,
    voidedSheet,
    "Voided Sales"
  );

  XLSX.writeFile(
    workbook,
    `Timidy-Store-Q${report.quarter}-${report.year}.xlsx`
  );
}

// =====================================
// REPORT YEAR OPTIONS
// =====================================

function initializeYears() {
  const now = new Date();

  const years = new Set([
    now.getFullYear()
  ]);

  [
    ...loadRecords(SALES_KEY),
    ...loadRecords(EXPENSES_KEY)
  ].forEach(record => {
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(
        record.date || ""
      )
    ) {
      years.add(
        Number(record.date.slice(0, 4))
      );
    }
  });

  const yearSelect = el("reportYear");

  yearSelect.replaceChildren();

  [...years]
    .sort((a, b) => b - a)
    .forEach(year => {
      yearSelect.add(
        new Option(year, year)
      );
    });

  yearSelect.value = String(
    now.getFullYear()
  );

  el("reportQuarter").value = String(
    Math.floor(now.getMonth() / 3) + 1
  );
}

// =====================================
// THEME
// =====================================

const themeToggle = el("themeToggle");

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
  themeToggle.addEventListener(
    "click",
    () => {
      const next =
        document.body.classList.contains("dark")
          ? "light"
          : "dark";

      localStorage.setItem(
        "timidy-theme",
        next
      );

      applyTheme(next);
      renderReport();
    }
  );
}

// =====================================
// EVENTS
// =====================================

el("reportYear").addEventListener(
  "change",
  renderReport
);

el("reportQuarter").addEventListener(
  "change",
  renderReport
);

el("downloadPDF").addEventListener(
  "click",
  downloadPDF
);

el("downloadExcel").addEventListener(
  "click",
  downloadExcel
);

// Refresh when returning from Sales page.
window.addEventListener(
  "pageshow",
  renderReport
);

// Refresh when data changes in another tab.
window.addEventListener("storage", event => {
  if (
    event.key === SALES_KEY ||
    event.key === EXPENSES_KEY
  ) {
    renderReport();
  }
});

// =====================================
// INITIALIZATION
// =====================================

initializeYears();
renderReport();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
