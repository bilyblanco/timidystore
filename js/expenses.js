
"use strict";

// ========================================
// TIMIDY STORE — SUPABASE EXPENSES
// ========================================

const db = window.timidySupabase;

if (!db) {
  throw new Error("Supabase is not configured.");
}

const field = id => document.getElementById(id);
const form = field("expenseForm");
const table = field("expensesTable");

let expenses = [];
let editingId = null;
let busy = false;

// ----------------------------------------
// UTILITIES
// ----------------------------------------

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function money(amount) {
  return "TZS " + Number(amount || 0).toLocaleString(
    "en-TZ",
    { maximumFractionDigits: 2 }
  );
}

function today() {
  const date = new Date();

  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 10);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(value + "T00:00:00Z");

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function mapExpense(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    amount: Number(row.amount),
    date: row.date,
    notes: row.notes || ""
  };
}

function showMessage(text, type = "") {
  const element = field("expenseMessage");

  if (!element) return;

  element.textContent = text;
  element.className = "sale-message " + type;
}

function setBusy(value) {
  busy = value;

  if (form) {
    form.querySelectorAll("input, select, textarea, button")
      .forEach(element => {
        element.disabled = value;
      });
  }

  if (table) {
    table.querySelectorAll("button").forEach(button => {
      button.disabled = value;
    });
  }
}

// ----------------------------------------
// SUPABASE DATA LOADING
// ----------------------------------------

async function loadExpenses() {
  const { data, error } = await db
    .from("expenses")
    .select("id, title, category, amount, date, notes")
    .order("date", { ascending: false });

  if (error) throw error;

  expenses = (data || []).map(mapExpense);

  renderExpenses();
}

// ----------------------------------------
// FORM
// ----------------------------------------

function resetForm() {
  editingId = null;

  if (form) form.reset();

  field("expenseDate").value = today();

  field("expenseFormTitle").textContent =
    "Record New Expense";

  field("saveExpenseLabel").textContent =
    "Save Expense";

  field("cancelExpenseEdit").classList.add("hidden");
}

// ----------------------------------------
// SUMMARY
// ----------------------------------------

function updateSummary() {
  const total = expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  const currentMonth = today().slice(0, 7);

  const monthly = expenses
    .filter(expense =>
      expense.date.startsWith(currentMonth)
    )
    .reduce(
      (sum, expense) => sum + expense.amount,
      0
    );

  const largest = expenses.reduce(
    (maximum, expense) =>
      Math.max(maximum, expense.amount),
    0
  );

  field("totalExpenses").textContent = money(total);
  field("monthlyExpenses").textContent = money(monthly);
  field("expenseCount").textContent = expenses.length;
  field("largestExpense").textContent = money(largest);
}

// ----------------------------------------
// FILTERING
// ----------------------------------------

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

    return (
      matchesSearch &&
      matchesMonth &&
      matchesCategory
    );
  });
}

// ----------------------------------------
// TABLE
// ----------------------------------------

function makeButton(label, handler) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "table-action";
  button.textContent = label;
  button.disabled = busy;

  button.addEventListener("click", handler);

  return button;
}

function renderExpenses() {
  if (!table) return;

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
      makeButton(
        "Edit",
        () => editExpense(expense.id)
      ),
      makeButton(
        "Delete",
        () => deleteExpense(expense.id)
      )
    );

    row.insertCell().appendChild(actions);
  });

  updateSummary();
  renderBreakdown(filtered);
}

// ----------------------------------------
// CATEGORY BREAKDOWN
// ----------------------------------------

function renderBreakdown(records) {
  const container = field("expenseBreakdown");

  if (!container) return;

  container.replaceChildren();

  const totals = new Map();

  records.forEach(expense => {
    totals.set(
      expense.category,
      (totals.get(expense.category) || 0) +
        expense.amount
    );
  });

  const entries = [...totals.entries()]
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

    bar.style.width =
      (amount / maximum * 100) + "%";

    track.appendChild(bar);
    wrapper.append(info, track);
    container.appendChild(wrapper);
  });
}

// ----------------------------------------
// EDIT EXPENSE
// ----------------------------------------

function editExpense(id) {
  if (busy) return;

  const expense = expenses.find(
    item => item.id === id
  );

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

  form.scrollIntoView({
    behavior: "smooth"
  });
}

// ----------------------------------------
// DELETE EXPENSE FROM SUPABASE
// ----------------------------------------

async function deleteExpense(id) {
  if (busy) return;

  const expense = expenses.find(
    item => item.id === id
  );

  if (!expense) return;

  if (!confirm(
    `Delete expense "${expense.title}"?`
  )) {
    return;
  }

  setBusy(true);

  try {
    const { data, error } = await db
      .from("expenses")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) throw error;

    if (!data || data.length !== 1) {
      throw new Error("Expense deletion was not confirmed.");
    }

    if (editingId === id) {
      resetForm();
    }

    await loadExpenses();

    showMessage("Expense deleted.", "success");
  } catch (error) {
    console.error("Unable to delete expense:", error);

    showMessage(
      "Unable to delete expense: " +
      (error.message || "Please try again."),
      "error"
    );
  } finally {
    setBusy(false);
  }
}

// ----------------------------------------
// SAVE EXPENSE TO SUPABASE
// ----------------------------------------

async function saveExpense(event) {
  event.preventDefault();

  if (busy) return;

  const title = field("expenseTitle").value.trim();
  const category = field("expenseCategory").value.trim();

  const amountInput = field("expenseAmount").value;
  const amount = Number(amountInput);

  const date = field("expenseDate").value;
  const notes = field("expenseNotes").value.trim();

  if (
    !title ||
    !category ||
    amountInput.trim() === "" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !validDate(date)
  ) {
    showMessage(
      "Please enter valid expense details.",
      "error"
    );
    return;
  }

  const payload = {
    title,
    category,
    amount,
    date,
    notes
  };

  setBusy(true);
  showMessage("Saving expense...");

  try {
    if (editingId) {
      const { data, error } = await db
        .from("expenses")
        .update(payload)
        .eq("id", editingId)
        .select("id");

      if (error) throw error;

      if (!data || data.length !== 1) {
        throw new Error("Expense update was not confirmed.");
      }
    } else {
      const { error } = await db
        .from("expenses")
        .insert({
          id: createId(),
          ...payload
        });

      if (error) throw error;
    }

    await loadExpenses();

    resetForm();

    showMessage(
      "Expense saved successfully!",
      "success"
    );
  } catch (error) {
    console.error("Unable to save expense:", error);

    showMessage(
      "Unable to save expense: " +
      (error.message || "Please try again."),
      "error"
    );
  } finally {
    setBusy(false);
  }
}

// ----------------------------------------
// EVENT LISTENERS
// ----------------------------------------

if (form) {
  form.addEventListener("submit", saveExpense);
}

const cancelEdit = field("cancelExpenseEdit");

if (cancelEdit) {
  cancelEdit.addEventListener("click", resetForm);
}

const searchInput = field("searchExpense");

if (searchInput) {
  searchInput.addEventListener("input", renderExpenses);
}

const monthFilter = field("filterExpenseMonth");

if (monthFilter) {
  monthFilter.addEventListener("change", renderExpenses);
}

const categoryFilter = field("filterExpenseCategory");

if (categoryFilter) {
  categoryFilter.addEventListener("change", renderExpenses);
}

const clearFilters = field("clearExpenseFilters");

if (clearFilters) {
  clearFilters.addEventListener("click", () => {
    field("searchExpense").value = "";
    field("filterExpenseMonth").value = "";
    field("filterExpenseCategory").value = "";

    renderExpenses();
  });
}

// ----------------------------------------
// INITIALIZATION
// ----------------------------------------

async function initializeExpenses() {
  resetForm();
  setBusy(true);

  try {
    const user =
      await window.TimidyAuth.getAuthorizedUser();

    if (!user) {
      window.location.replace("login.html");
      return;
    }

    await loadExpenses();
  } catch (error) {
    console.error("Unable to load expenses:", error);

    showMessage(
      "Unable to load expenses: " +
      (error.message || "Please try again."),
      "error"
    );
  } finally {
    setBusy(false);
  }
}

initializeExpenses();

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
