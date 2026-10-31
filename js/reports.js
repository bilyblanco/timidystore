
"use strict";

// =====================================
// TIMIDY STORE — SUPABASE REPORTS
// Quarterly financial reporting
// Styled PDF and Excel exports
// Optimized data refresh and chart updates
// =====================================

const db = window.timidySupabase;

if (!db) {
  throw new Error("Supabase is not configured.");
}

const el = id => document.getElementById(id);

const money = value =>
  "TZS " + Number(value || 0).toLocaleString(
    "en-TZ",
    { maximumFractionDigits: 2 }
  );

let reportChart = null;
let currentReport = null;

let allSales = [];
let allExpenses = [];

let loading = false;
let initialized = false;
let lastDataRefresh = 0;

const REPORT_REFRESH_INTERVAL = 60 * 1000;

// =====================================
// HELPERS
// =====================================

function sum(items, key) {
  return items.reduce(
    (total, item) =>
      total + Number(item[key] || 0),
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
    quantity: Number(row.quantity || 0),
    amount: Number(row.amount || 0),
    cost: Number(row.cost || 0),
    expenses: Number(row.expenses || 0),
    profit: Number(row.profit || 0),
    voidedAt: row.voided_at,
    voidReason: row.void_reason
  };
}

function mapExpense(row) {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    category: row.category,
    amount: Number(row.amount || 0),
    notes: row.notes
  };
}

function showError(error) {
  console.error("Reports error:", error);

  const message = el("reportMessage");

  if (message) {
    message.textContent =
      "Unable to load report data: " +
      (error?.message || "Unknown error.");

    message.setAttribute("role", "alert");
  }
}

// =====================================
// FETCH ALL DATABASE ROWS
// =====================================

async function fetchAllRows(table, columns) {
  const pageSize = 500;
  const result = [];

  let start = 0;

  while (true) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1);

    if (error) {
      throw error;
    }

    const rows = data || [];

    result.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    start += pageSize;
  }

  return result;
}

// =====================================
// LOAD REPORT DATA
// =====================================

async function loadReportData() {
  const user =
    await window.TimidyAuth.getAuthorizedUser();

  if (!user) {
    window.location.replace("login.html");
    throw new Error("Admin session expired.");
  }

  const [salesRows, expenseRows] =
    await Promise.all([
      fetchAllRows(
        "sales",
        "id,date,type,status,voided," +
        "product_name,quantity,amount,cost," +
        "expenses,profit,voided_at,void_reason"
      ),

      fetchAllRows(
        "expenses",
        "id,date,title,category,amount,notes"
      )
    ]);

  // Only update state after both requests
  // complete successfully.
  allSales = salesRows.map(mapSale);
  allExpenses = expenseRows.map(mapExpense);

  lastDataRefresh = Date.now();
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

function getVoidedSales(sales) {
  return sales.filter(isVoidedSale);
}

// =====================================
// FINANCIAL CALCULATIONS
// =====================================

function calculate(sales, expenses) {
  const activeSales = getActiveSales(sales);

  const revenue = sum(activeSales, "amount");
  const productCosts = sum(activeSales, "cost");

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
  const year = Number(el("reportYear").value);
  const quarter = Number(el("reportQuarter").value);

  const months = quarterMonths(year, quarter);

  const keys = new Set(
    months.map(month => month.key)
  );

  const allQuarterSales = allSales.filter(
    sale =>
      typeof sale.date === "string" &&
      keys.has(sale.date.slice(0, 7))
  );

  const sales = getActiveSales(allQuarterSales);

  const voidedSales = getVoidedSales(
    allQuarterSales
  );

  const expenses = allExpenses.filter(
    expense =>
      typeof expense.date === "string" &&
      keys.has(expense.date.slice(0, 7))
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
      ...calculate(monthSales, monthExpenses)
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

    const revenue = sum(records, "amount");

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

  const fragment =
    document.createDocumentFragment();

  if (!records.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 4;
    cell.textContent =
      "No active transactions in this quarter.";

    row.appendChild(cell);
    fragment.appendChild(row);
  } else {
    for (const record of records) {
      const row = document.createElement("tr");

      [
        record.date,
        record.type,
        record.description || "—",
        money(record.amount)
      ].forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });

      fragment.appendChild(row);
    }
  }

  table.replaceChildren(fragment);
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

  const dark = document.body.classList.contains(
    "dark"
  );

  const legendColor = dark
    ? "#e2e8f0"
    : "#334155";

  const tickColor = dark
    ? "#94a3b8"
    : "#64748b";

  const labels = report.monthly.map(
    month => month.label
  );

  const revenue = report.monthly.map(
    month => month.revenue
  );

  const net = report.monthly.map(
    month => month.net
  );

  // Update existing chart instead of
  // destroying and recreating it.
  if (reportChart) {
    reportChart.data.labels = labels;

    reportChart.data.datasets[0].data =
      revenue;

    reportChart.data.datasets[1].data =
      net;

    reportChart.options.plugins.legend.labels.color =
      legendColor;

    reportChart.options.scales.x.ticks.color =
      tickColor;

    reportChart.options.scales.y.ticks.color =
      tickColor;

    reportChart.update("none");
    return;
  }

  reportChart = new Chart(canvas, {
    type: "bar",

    data: {
      labels,

      datasets: [
        {
          label: "Revenue",
          data: revenue,
          backgroundColor: "#4f7cff",
          borderRadius: 6
        },
        {
          label: "Net Profit",
          data: net,
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
            color: legendColor
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
            color: tickColor
          }
        },

        y: {
          ticks: {
            color: tickColor,

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
  if (!initialized) return;

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
  renderSalesTypes(currentReport.sales);
  renderTransactions(currentReport);
  renderChart(currentReport);

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
// REFRESH REPORT DATA
// =====================================

async function refreshReports(force = false) {
  if (loading) return;

  if (
    !force &&
    initialized &&
    Date.now() - lastDataRefresh <
      REPORT_REFRESH_INTERVAL
  ) {
    return;
  }

  loading = true;

  try {
    await loadReportData();

    if (!initialized) {
      initializeYears();
      initialized = true;
    } else {
      initializeYears(true);
    }

    renderReport();
  } catch (error) {
    showError(error);
  } finally {
    loading = false;
  }
}

// =====================================
// PDF EXPORT — STYLED
// =====================================

async function downloadPDF() {
  if (!window.jspdf?.jsPDF) {
    alert(
      "PDF library did not load. " +
      "Check your connection."
    );
    return;
  }

  if (loading) return;

  loading = true;

  try {
    // Always fetch fresh data for export.
    await loadReportData();

    const report = createReport();
    currentReport = report;

    const totals = report.totals;
    const pdf = new window.jspdf.jsPDF();

    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();

    const NAVY = [30, 41, 59];
    const MUTED = [100, 116, 139];
    const BLUE = [48, 91, 190];
    const GREEN = [22, 134, 83];
    const RED = [190, 53, 53];

    const LEFT = 16;
    const RIGHT = W - 16;

    let y = 20;

    function write(value, x, yy, options = {}) {
      pdf.text(String(value), x, yy, options);
    }

    function rule(yy) {
      pdf.setDrawColor(222, 228, 235);
      pdf.line(LEFT, yy, RIGHT, yy);
    }

    function ensureSpace(height) {
      if (y + height > H - 25) {
        pdf.addPage();
        y = 22;
      }
    }

    function section(title) {
      ensureSpace(25);
      y += 9;

      pdf.setTextColor(...NAVY);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);

      write(title.toUpperCase(), LEFT + 1, y);

      y += 5;
      rule(y);
      y += 8;
    }

    function metric(label, value, emphasis = false) {
      ensureSpace(emphasis ? 20 : 14);

      if (emphasis) {
        pdf.setFillColor(
          ...(value < 0
            ? [253, 242, 242]
            : [237, 247, 241])
        );

        pdf.roundedRect(
          LEFT,
          y - 6,
          W - 32,
          13,
          2,
          2,
          "F"
        );
      }

      pdf.setFont(
        "helvetica",
        emphasis ? "bold" : "normal"
      );

      pdf.setFontSize(emphasis ? 11 : 10);
      pdf.setTextColor(...NAVY);

      write(label, LEFT + 4, y + 2);

      pdf.setTextColor(
        ...(emphasis
          ? (value < 0 ? RED : GREEN)
          : NAVY)
      );

      write(
        money(value),
        RIGHT - 4,
        y + 2,
        { align: "right" }
      );

      y += emphasis ? 17 : 12;
    }

    // HEADER

    pdf.setTextColor(...NAVY);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);

    write(
      "TIMIDY STORE",
      W / 2,
      y,
      { align: "center" }
    );

    y += 9;

    pdf.setFontSize(12);

    write(
      "QUARTERLY FINANCIAL REPORT",
      W / 2,
      y,
      { align: "center" }
    );

    y += 8;

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...MUTED);
    pdf.setFontSize(10);

    write(
      `Q${report.quarter} ${report.year}`,
      W / 2,
      y,
      { align: "center" }
    );

    y += 6;
    rule(y);

    // FINANCIAL BREAKDOWN

    section("Financial Breakdown");

    metric("Revenue", totals.revenue);
    metric(
      "Cost of Products Sold",
      totals.productCosts
    );
    metric("Gross Profit", totals.gross);
    metric(
      "Transaction Expenses",
      totals.transactionCosts
    );
    metric(
      "Operating Expenses",
      totals.operatingCosts
    );
    metric("NET PROFIT", totals.net, true);

    ensureSpace(12);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...BLUE);

    write(
      `Net Profit Margin: ${
        totals.margin.toFixed(1)
      }%`,
      LEFT + 4,
      y
    );

    y += 2;

    // MONTHLY PERFORMANCE

    section("Monthly Performance");
    ensureSpace(15);

    pdf.setFillColor(...NAVY);

    pdf.roundedRect(
      LEFT,
      y - 6,
      W - 32,
      11,
      1.5,
      1.5,
      "F"
    );

    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);

    write("MONTH", LEFT + 4, y + 1);

    write(
      "REVENUE",
      123,
      y + 1,
      { align: "right" }
    );

    write(
      "NET PROFIT",
      RIGHT - 4,
      y + 1,
      { align: "right" }
    );

    y += 13;

    report.monthly.forEach((month, index) => {
      ensureSpace(14);

      if (index % 2 === 0) {
        pdf.setFillColor(247, 249, 252);

        pdf.rect(
          LEFT,
          y - 6,
          W - 32,
          11,
          "F"
        );
      }

      pdf.setTextColor(...NAVY);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);

      write(month.label, LEFT + 4, y + 1);

      write(
        money(month.revenue),
        123,
        y + 1,
        { align: "right" }
      );

      write(
        money(month.net),
        RIGHT - 4,
        y + 1,
        { align: "right" }
      );

      y += 12;
    });

    // SALES SUMMARY

    section("Sales Summary");

    const middlemanCount =
      report.sales.filter(
        sale => sale.type === "middleman"
      ).length;

    const stockCount =
      report.sales.filter(
        sale => sale.type === "stock"
      ).length;

    [
      ["Middleman Sales", middlemanCount],
      ["Own Stock Sales", stockCount],
      [
        "Voided Sales Excluded",
        report.voidedSales.length
      ]
    ].forEach(([label, value]) => {
      ensureSpace(12);

      pdf.setTextColor(...NAVY);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");

      write(label, LEFT + 4, y);

      pdf.setFont("helvetica", "bold");

      write(
        String(value),
        RIGHT - 4,
        y,
        { align: "right" }
      );

      y += 10;
    });

    // FOOTER ON EVERY PAGE

    const pages =
      pdf.internal.getNumberOfPages();

    for (let page = 1; page <= pages; page++) {
      pdf.setPage(page);

      rule(H - 24);

      pdf.setTextColor(...MUTED);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);

      write(
        "Generated from Timidy Store Supabase records.",
        W / 2,
        H - 16,
        { align: "center" }
      );

      write(
        `Timidy Store | Page ${page} of ${pages}`,
        W / 2,
        H - 10,
        { align: "center" }
      );
    }

    pdf.save(
      `Timidy-Store-Q${report.quarter}-${report.year}.pdf`
    );

    renderReport();

  } catch (error) {
    console.error(error);

    alert(
      "Could not generate PDF: " +
      (error?.message || "Unknown error")
    );
  } finally {
    loading = false;
  }
}

// =====================================
// EXCEL EXPORT — STYLED
// =====================================

async function downloadExcel() {
  if (!window.ExcelJS) {
    alert(
      "ExcelJS library did not load. " +
      "Check your connection."
    );
    return;
  }

  if (loading) return;

  loading = true;

  try {
    // Always fetch fresh data for export.
    await loadReportData();

    const report = createReport();
    currentReport = report;

    const totals = report.totals;

    const workbook = new window.ExcelJS.Workbook();

    workbook.creator = "Timidy Store";
    workbook.subject =
      `Quarterly Financial Report Q${report.quarter} ${report.year}`;

    const NAVY = "FF1E293B";
    const BLUE = "FF305BBE";
    const LIGHT = "FFEFF4FC";
    const GREEN = "FF168653";
    const RED = "FFBE3535";
    const WHITE = "FFFFFFFF";

    const CURRENCY =
      '"TZS" #,##0.00;[Red]("TZS" #,##0.00)';

    const INTEGER = "#,##0";
    const PERCENT_NUMBER = '0.0"%"';

    // Creates a consistently styled worksheet.
    function makeSheet(
      name,
      headers,
      widths,
      rows,
      moneyCols = [],
      integerCols = []
    ) {
      const ws = workbook.addWorksheet(name, {
        views: [
          { state: "frozen", ySplit: 4 }
        ]
      });

      ws.columns = widths.map(width => ({
        width
      }));

      // MAIN TITLE

      ws.mergeCells(1, 1, 1, headers.length);

      const title = ws.getCell(1, 1);

      title.value =
        `TIMIDY STORE | ${name.toUpperCase()}`;

      title.font = {
        name: "Calibri",
        size: 16,
        bold: true,
        color: { argb: WHITE }
      };

      title.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: NAVY }
      };

      title.alignment = {
        vertical: "middle",
        horizontal: "left",
        indent: 1
      };

      ws.getRow(1).height = 34;

      // SUBTITLE

      ws.mergeCells(2, 1, 2, headers.length);

      const subtitle = ws.getCell(2, 1);

      subtitle.value =
        `Quarterly Financial Report - Q${report.quarter} ${report.year}`;

      subtitle.font = {
        name: "Calibri",
        size: 11,
        color: { argb: BLUE }
      };

      subtitle.alignment = {
        vertical: "middle",
        indent: 1
      };

      ws.getRow(2).height = 24;

      // COLUMN HEADERS

      const heading = ws.getRow(4);

      heading.values = headers;
      heading.height = 27;

      heading.eachCell(cell => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: BLUE }
        };

        cell.font = {
          name: "Calibri",
          bold: true,
          color: { argb: WHITE }
        };

        cell.alignment = {
          vertical: "middle",
          wrapText: true
        };

        cell.border = {
          bottom: {
            style: "thin",
            color: { argb: NAVY }
          }
        };
      });

      // DATA ROWS

      rows.forEach((values, index) => {
        const row = ws.addRow(values);

        row.height = 23;

        row.eachCell(
          { includeEmpty: true },
          (cell, col) => {
            cell.font = {
              name: "Calibri",
              size: 11,
              color: { argb: NAVY }
            };

            cell.alignment = {
              vertical: "middle",
              wrapText: true
            };

            if (index % 2 === 0) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: LIGHT }
              };
            }

            if (
              moneyCols.includes(col) &&
              typeof cell.value === "number"
            ) {
              cell.numFmt = CURRENCY;
            }

            if (
              integerCols.includes(col) &&
              typeof cell.value === "number"
            ) {
              cell.numFmt = INTEGER;
            }
          }
        );
      });

      // FILTERS

      if (rows.length > 0) {
        ws.autoFilter = {
          from: {
            row: 4,
            column: 1
          },
          to: {
            row: 4 + rows.length,
            column: headers.length
          }
        };
      }

      // PRINT SETTINGS

      ws.pageSetup = {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
      };

      return ws;
    }

    // =================================
    // SUMMARY WORKSHEET
    // =================================

    const summaryRows = [
      ["Revenue", totals.revenue],
      [
        "Cost of Products Sold",
        totals.productCosts
      ],
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
      [
        "Voided Sales Excluded",
        report.voidedSales.length
      ]
    ];

    const summary = makeSheet(
      "Summary",
      ["Metric", "Value"],
      [36, 28],
      summaryRows,
      [2]
    );

    // Data begins at row 5.
    // Net Profit is row 10.
    // Margin is row 11.
    // Voided count is row 12.

    summary.getCell(11, 2).numFmt =
      PERCENT_NUMBER;

    summary.getCell(12, 2).numFmt =
      INTEGER;

    const profitRow = summary.getRow(10);

    const profitColor =
      totals.net < 0 ? RED : GREEN;

    profitRow.eachCell(cell => {
      cell.font = {
        name: "Calibri",
        bold: true,
        color: { argb: WHITE },
        size: 12
      };

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: profitColor }
      };
    });

    summary.getCell(10, 2).numFmt =
      CURRENCY;

    // =================================
    // MONTHLY WORKSHEET
    // =================================

    makeSheet(
      "Monthly",
      [
        "Month",
        "Revenue",
        "Product Costs",
        "Gross Profit",
        "Transaction Expenses",
        "Operating Expenses",
        "Net Profit"
      ],
      [16, 23, 23, 23, 27, 27, 23],
      report.monthly.map(month => [
        month.label,
        month.revenue,
        month.productCosts,
        month.gross,
        month.transactionCosts,
        month.operatingCosts,
        month.net
      ]),
      [2, 3, 4, 5, 6, 7]
    );

    // =================================
    // ACTIVE SALES WORKSHEET
    // =================================

    makeSheet(
      "Sales",
      [
        "Date",
        "Product",
        "Type",
        "Quantity",
        "Revenue",
        "Product Cost",
        "Transaction Expenses",
        "Profit",
        "Status"
      ],
      [
        18, 32, 20, 14, 23,
        23, 27, 23, 16
      ],
      report.sales.map(sale => [
        sale.date,
        sale.productName,
        sale.type,
        sale.quantity,
        sale.amount,
        sale.cost,
        sale.expenses,
        sale.profit,
        "Active"
      ]),
      [5, 6, 7, 8],
      [4]
    );

    // =================================
    // EXPENSES WORKSHEET
    // =================================

    makeSheet(
      "Expenses",
      [
        "Date",
        "Description",
        "Category",
        "Amount",
        "Notes"
      ],
      [18, 34, 24, 24, 45],
      report.expenses.map(expense => [
        expense.date,
        expense.title,
        expense.category,
        expense.amount,
        expense.notes
      ]),
      [4]
    );

    // =================================
    // VOIDED SALES AUDIT WORKSHEET
    // =================================

    makeSheet(
      "Voided Sales",
      [
        "Sale ID",
        "Original Date",
        "Product",
        "Type",
        "Quantity",
        "Original Revenue",
        "Original Product Cost",
        "Original Transaction Expenses",
        "Original Profit",
        "Status",
        "Voided At",
        "Void Reason"
      ],
      [
        42, 18, 32, 20, 14, 24,
        27, 32, 24, 16, 25, 42
      ],
      report.voidedSales.map(sale => [
        sale.id,
        sale.date,
        sale.productName,
        sale.type,
        sale.quantity,
        sale.amount,
        sale.cost,
        sale.expenses,
        sale.profit,
        "Voided",
        sale.voidedAt || "",
        sale.voidReason || ""
      ]),
      [6, 7, 8, 9],
      [5]
    );

    // =================================
    // DOWNLOAD XLSX
    // =================================

    const buffer =
      await workbook.xlsx.writeBuffer();

    const blob = new Blob([buffer], {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download =
      `Timidy-Store-Q${report.quarter}-${report.year}.xlsx`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10000);

    renderReport();

  } catch (error) {
    console.error(error);

    alert(
      "Could not generate Excel report: " +
      (error?.message || "Unknown error")
    );
  } finally {
    loading = false;
  }
}

// =====================================
// REPORT YEAR OPTIONS
// =====================================

function initializeYears(
  preserveSelection = false
) {
  const now = new Date();

  const yearSelect = el("reportYear");
  const quarterSelect = el("reportQuarter");

  const previousYear = yearSelect.value;
  const previousQuarter = quarterSelect.value;

  const years = new Set([
    now.getFullYear()
  ]);

  [
    ...allSales,
    ...allExpenses
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

  yearSelect.replaceChildren();

  [...years]
    .sort((a, b) => b - a)
    .forEach(year => {
      yearSelect.add(
        new Option(year, year)
      );
    });

  const selectedYear =
    preserveSelection &&
    years.has(Number(previousYear))
      ? Number(previousYear)
      : now.getFullYear();

  yearSelect.value = String(selectedYear);

  const currentQuarter =
    Math.floor(now.getMonth() / 3) + 1;

  quarterSelect.value =
    preserveSelection &&
    [1, 2, 3, 4].includes(
      Number(previousQuarter)
    )
      ? previousQuarter
      : String(currentQuarter);
}

// =====================================
// THEME CHANGE
// =====================================

window.addEventListener(
  "timidy-theme-change",
  () => {
    if (initialized) {
      renderReport();
    }
  }
);

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

// =====================================
// BROWSER BACK/FORWARD CACHE
// =====================================

// Only check when the browser restores
// an existing page from its back/forward
// cache. Ordinary initial load is handled
// by refreshReports() below.

window.addEventListener(
  "pageshow",
  event => {
    if (event.persisted) {
      refreshReports();
    }
  }
);

// =====================================
// TAB VISIBILITY REFRESH
// =====================================

// Returning quickly does not trigger
// another database download.
//
// After 60 seconds, data is refreshed.

document.addEventListener(
  "visibilitychange",
  () => {
    if (
      !document.hidden &&
      initialized
    ) {
      refreshReports();
    }
  }
);

// =====================================
// INITIALIZATION
// =====================================

refreshReports();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
