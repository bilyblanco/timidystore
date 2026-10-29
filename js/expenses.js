
const EXPENSES_KEY = "timidy-expenses";

const field = id => document.getElementById(id);
const form = field("expenseForm");
const table = field("expensesTable");

let expenses = [];
let editingId = null;

function loadExpenses() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(EXPENSES_KEY)
    );
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveExpenses() {
  localStorage.setItem(
    EXPENSES_KEY,
    JSON.stringify(expenses)
  );
}

function money(amount) {
  return "TZS " + Number(amount).toLocaleString("en-TZ");
}

function today() {
  const date = new Date();
  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );
  return local.toISOString().slice(0, 10);
}

function showMessage(text, type = "") {
  const element = field("expenseMessage");
  element.textContent = text;
  element.className = "sale-message " + type;
}

function resetForm() {
  editingId = null;
  form.reset();

  field("expenseDate").value = today();
  field("expenseFormTitle").textContent =
    "Record New Expense";
  field("saveExpenseLabel").textContent =
    "Save Expense";
  field("cancelExpenseEdit").classList.add("hidden");
}

function updateSummary() {
  const total = expenses.reduce(
    (sum, expense) => sum + expense.amount, 0
  );

  const currentMonth = today().slice(0, 7);

  const monthly = expenses
    .filter(e => e.date.startsWith(currentMonth))
    .reduce((sum, e) => sum + e.amount, 0);

  const largest = Math.max(
    0, ...expenses.map(e => e.amount)
  );

  field("totalExpenses").textContent = money(total);
  field("monthlyExpenses").textContent = money(monthly);
  field("expenseCount").textContent = expenses.length;
  field("largestExpense").textContent = money(largest);
}

function getFilteredExpenses() {
  const search = field("searchExpense")
    .value.trim().toLowerCase();

  const month = field("filterExpenseMonth").value;
  const category = field("filterExpenseCategory").value;

  return expenses.filter(expense => {
    const matchesSearch =
      expense.title.toLowerCase().includes(search) ||
      expense.notes.toLowerCase().includes(search);

    const matchesMonth =
      !month || expense.date.startsWith(month);

    const matchesCategory =
      !category || expense.category === category;

    return matchesSearch &&
      matchesMonth &&
      matchesCategory;
  });
}

function makeButton(label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "table-action";
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function renderExpenses() {
  table.replaceChildren();

  const filtered = getFilteredExpenses().sort(
    (a, b) => b.date.localeCompare(a.date)
  );

  if (filtered.length === 0) {
    const row = table.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.textContent = "No expenses found.";
  }

  filtered.forEach(expense => {
    const row = table.insertRow();

    [
      expense.date,
      expense.title,
      expense.category,
      money(expense.amount),
      expense.notes || "—"
    ].forEach(value => {
      row.insertCell().textContent = value;
    });

    const actions = document.createElement("div");
    actions.className = "customer-actions";

    actions.append(
      makeButton("Edit", () => editExpense(expense.id)),
      makeButton("Delete", () => deleteExpense(expense.id))
    );

    row.insertCell().appendChild(actions);
  });

  updateSummary();
  renderBreakdown(filtered);
}

function renderBreakdown(records) {
  const container = field("expenseBreakdown");
  container.replaceChildren();

  const totals = {};

  records.forEach(expense => {
    totals[expense.category] =
      (totals[expense.category] || 0) + expense.amount;
  });

  const entries = Object.entries(totals)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "expense-empty";
    empty.textContent = "No expense data available.";
    container.appendChild(empty);
    return;
  }

  const maximum = Math.max(
    ...entries.map(([, amount]) => amount)
  );

  entries.forEach(([category, amount]) => {
    const wrapper = document.createElement("div");
    wrapper.className = "expense-category-row";

    const info = document.createElement("div");
    info.className = "expense-category-info";

    const name = document.createElement("strong");
    name.textContent = category;

    const value = document.createElement("span");
    value.textContent = money(amount);

    info.append(name, value);

    const track = document.createElement("div");
    track.className = "expense-bar-track";

    const bar = document.createElement("div");
    bar.className = "expense-bar-fill";
    bar.style.width = (amount / maximum * 100) + "%";

    track.appendChild(bar);
    wrapper.append(info, track);
    container.appendChild(wrapper);
  });
}

function editExpense(id) {
  const expense = expenses.find(e => e.id === id);
  if (!expense) return;

  editingId = id;

  field("expenseTitle").value = expense.title;
  field("expenseCategory").value = expense.category;
  field("expenseAmount").value = expense.amount;
  field("expenseDate").value = expense.date;
  field("expenseNotes").value = expense.notes;

  field("expenseFormTitle").textContent =
    "Edit Expense";
  field("saveExpenseLabel").textContent =
    "Update Expense";

  field("cancelExpenseEdit").classList.remove("hidden");

  form.scrollIntoView({ behavior: "smooth" });
}

function deleteExpense(id) {
  const expense = expenses.find(e => e.id === id);
  if (!expense) return;

  if (!confirm(
    `Delete expense "${expense.title}"?`
  )) return;

  const previous = expenses;
  expenses = expenses.filter(e => e.id !== id);

  try {
    saveExpenses();
  } catch {
    expenses = previous;
    showMessage("Unable to delete expense.", "error");
    return;
  }

  if (editingId === id) resetForm();

  renderExpenses();
  showMessage("Expense deleted.", "success");
}

form.addEventListener("submit", event => {
  event.preventDefault();

  const title = field("expenseTitle").value.trim();
  const category = field("expenseCategory").value;
  const amount = Number(field("expenseAmount").value);
  const date = field("expenseDate").value;
  const notes = field("expenseNotes").value.trim();

  if (
    !title ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(new Date(date + "T00:00:00").getTime())
  ) {
    showMessage("Please enter valid expense details.", "error");
    return;
  }

  const expense = {
    id: editingId || crypto.randomUUID(),
    title,
    category,
    amount,
    date,
    notes
  };

  const previous = expenses;

  if (editingId) {
    expenses = expenses.map(e =>
      e.id === editingId ? expense : e
    );
  } else {
    expenses = [...expenses, expense];
  }

  try {
    saveExpenses();
  } catch {
    expenses = previous;
    showMessage("Unable to save expense.", "error");
    return;
  }

  resetForm();
  renderExpenses();
  showMessage("Expense saved successfully!", "success");
});

field("cancelExpenseEdit").addEventListener(
  "click", resetForm
);

field("searchExpense").addEventListener(
  "input", renderExpenses
);

field("filterExpenseMonth").addEventListener(
  "change", renderExpenses
);

field("filterExpenseCategory").addEventListener(
  "change", renderExpenses
);

field("clearExpenseFilters").addEventListener(
  "click", () => {
    field("searchExpense").value = "";
    field("filterExpenseMonth").value = "";
    field("filterExpenseCategory").value = "";
    renderExpenses();
  }
);

// Light / dark mode
const themeToggle = field("themeToggle");

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

expenses = loadExpenses();
resetForm();
renderExpenses();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
