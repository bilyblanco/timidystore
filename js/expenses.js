
"use strict";

// ========================================
// TIMIDY STORE — SUPABASE EXPENSES
// Optimized loading, search and rendering
// ========================================

const db = window.timidySupabase;

if (!db) {
  throw new Error("Supabase is not configured.");
}

const field = id => document.getElementById(id);

const form = field("expenseForm");
const table = field("expensesTable");
const searchInput = field("searchExpense");
const monthFilter = field("filterExpenseMonth");
const categoryFilter = field("filterExpenseCategory");
const message = field("expenseMessage");

const REFRESH_INTERVAL = 60 * 1000;

let expenses = [];
let expenseById = new Map();

let editingId = null;
let busy = false;
let initialized = false;
let lastRefresh = 0;
let refreshPromise = null;
let searchTimer = null;

// ========================================
// UTILITIES
// ========================================

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return (
    `${Date.now()}-` +
    Math.random().toString(36).slice(2)
  );
}

function money(amount) {
  return (
    "TZS " +
    Number(amount || 0).toLocaleString(
      "en-TZ",
      { maximumFractionDigits: 2 }
    )
  );
}

function today() {
  const date = new Date();

  const local = new Date(
    date.getTime() -
    date.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 10);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(
    value + "T00:00:00Z"
  );

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
    amount: Number(row.amount || 0),
    date: row.date,
    notes: row.notes || ""
  };
}

function showMessage(text, type = "") {
  if (!message) return;

  message.textContent = text;
  message.className =
    "sale-message " + type;
}

function setBusy(value) {
  busy = value;

  if (form) {
    form.querySelectorAll(
      "input, select, textarea, button"
    ).forEach(element => {
      element.disabled = value;
    });
  }

  if (table) {
    table.querySelectorAll("button").forEach(
      button => {
        button.disabled = value;
      }
    );
  }

  const cancel = field("cancelExpenseEdit");

  if (cancel) {
    cancel.disabled = value;
  }
}

function errorText(error) {
  return error?.message || "Please try again.";
}

// ========================================
// SUPABASE DATA LOADING
// ========================================

// Deduplicate overlapping read requests.
// Database writes remain separate.

async function loadExpenses() {
  if (refreshPromise) {
    return refreshPromise;
  }

  const request = (async () => {
    const { data, error } = await db
      .from("expenses")
      .select(
        "id,title,category,amount,date,notes"
      )
      .order("date", {
        ascending: false
      });

    if (error) {
      throw error;
    }

    // Replace data only after success.
    expenses = (data || []).map(mapExpense);

    expenseById = new Map(
      expenses.map(expense => [
        expense.id,
        expense
      ])
    );

    lastRefresh = Date.now();
    initialized = true;

    updateSummary();
    renderExpenses();
  })();

  refreshPromise = request;

  try {
    return await request;
  } finally {
    if (refreshPromise === request) {
      refreshPromise = null;
    }
  }
}

// ========================================
// FORM
// ========================================

function resetForm() {
  editingId = null;

  if (form) {
    form.reset();
  }

  field("expenseDate").value = today();

  field("expenseFormTitle").textContent =
    "Record New Expense";

  field("saveExpenseLabel").textContent =
    "Save Expense";

  field("cancelExpenseEdit").classList.add(
    "hidden"
  );
}

// ========================================
// SUMMARY
// ========================================

// Summary is based on ALL expenses,
// regardless of search and filters.

function updateSummary() {
  let total = 0;
  let monthly = 0;
  let largest = 0;

  const currentMonth = today().slice(0, 7);

  for (const expense of expenses) {
    total += expense.amount;

    if (
      expense.date.startsWith(currentMonth)
    ) {
      monthly += expense.amount;
    }

    if (expense.amount > largest) {
      largest = expense.amount;
    }
  }

  field("totalExpenses").textContent =
    money(total);

  field("monthlyExpenses").textContent =
    money(monthly);

  field("expenseCount").textContent =
    expenses.length;

  field("largestExpense").textContent =
    money(largest);
}

// ========================================
// FILTERING
// ========================================

function getFilteredExpenses() {
  const term = searchInput
    ? searchInput.value.trim().toLowerCase()
    : "";

  const month = monthFilter
    ? monthFilter.value
    : "";

  const category = categoryFilter
    ? categoryFilter.value
    : "";

  return expenses.filter(expense => {
    if (
      month &&
      !expense.date.startsWith(month)
    ) {
      return false;
    }

    if (
      category &&
      expense.category !== category
    ) {
      return false;
    }

    if (
      term &&
      !expense.title.toLowerCase().includes(term) &&
      !expense.notes.toLowerCase().includes(term)
    ) {
      return false;
    }

    return true;
  });
}

// ========================================
// TABLE BUTTONS
// ========================================

// One shared listener handles all rows.

function makeButton(label, action, expenseId) {
  const button = document.createElement(
    "button"
  );

  button.type = "button";
  button.className = "table-action";
  button.textContent = label;

  button.dataset.action = action;
  button.dataset.expenseId = expenseId;

  button.disabled = busy;

  return button;
}

if (table) {
  table.addEventListener(
    "click",
    event => {
      if (busy) return;

      const button = event.target.closest(
        "button[data-action][data-expense-id]"
      );

      if (
        !button ||
        !table.contains(button)
      ) {
        return;
      }

      const id = button.dataset.expenseId;

      if (button.dataset.action === "edit") {
        editExpense(id);
      } else if (
        button.dataset.action === "delete"
      ) {
        deleteExpense(id);
      }
    }
  );
}

// ========================================
// TABLE
// ========================================

function renderExpenses() {
  if (!table) return;

  // Supabase already orders by date.
  // Filtering preserves that order.
  const filtered = getFilteredExpenses();

  const fragment =
    document.createDocumentFragment();

  if (filtered.length === 0) {
    const row =
      document.createElement("tr");

    const cell =
      document.createElement("td");

    cell.colSpan = 6;
    cell.textContent = "No expenses found.";

    row.appendChild(cell);
    fragment.appendChild(row);
  } else {
    for (const expense of filtered) {
      const row =
        document.createElement("tr");

      [
        expense.date,
        expense.title,
        expense.category,
        money(expense.amount),
        expense.notes || "—"
      ].forEach(value => {
        const cell =
          document.createElement("td");

        cell.textContent = value ?? "";

        row.appendChild(cell);
      });

      const actionsCell =
        document.createElement("td");

      const actions =
        document.createElement("div");

      actions.className = "customer-actions";

      actions.append(
        makeButton(
          "Edit",
          "edit",
          expense.id
        ),
        makeButton(
          "Delete",
          "delete",
          expense.id
        )
      );

      actionsCell.appendChild(actions);
      row.appendChild(actionsCell);

      fragment.appendChild(row);
    }
  }

  // One DOM update for the table.
  table.replaceChildren(fragment);

  // Breakdown uses filtered records.
  renderBreakdown(filtered);
}

// ========================================
// CATEGORY BREAKDOWN
// ========================================

function renderBreakdown(records) {
  const container = field(
    "expenseBreakdown"
  );

  if (!container) return;

  const totals = new Map();

  for (const expense of records) {
    totals.set(
      expense.category,
      (totals.get(expense.category) || 0) +
        expense.amount
    );
  }

  const entries = [...totals.entries()]
    .sort((a, b) => b[1] - a[1]);

  const fragment =
    document.createDocumentFragment();

  if (entries.length === 0) {
    const empty =
      document.createElement("p");

    empty.className = "expense-empty";
    empty.textContent =
      "No expense data available.";

    fragment.appendChild(empty);
    container.replaceChildren(fragment);
    return;
  }

  // Entries are sorted descending.
  const maximum = entries[0][1];

  for (const [category, amount] of entries) {
    const wrapper =
      document.createElement("div");

    wrapper.className =
      "expense-category-row";

    const info =
      document.createElement("div");

    info.className =
      "expense-category-info";

    const name =
      document.createElement("strong");

    name.textContent = category;

    const value =
      document.createElement("span");

    value.textContent = money(amount);

    info.append(name, value);

    const track =
      document.createElement("div");

    track.className =
      "expense-bar-track";

    const bar =
      document.createElement("div");

    bar.className =
      "expense-bar-fill";

    bar.style.width =
      maximum > 0
        ? `${(amount / maximum) * 100}%`
        : "0%";

    track.appendChild(bar);
    wrapper.append(info, track);

    fragment.appendChild(wrapper);
  }

  container.replaceChildren(fragment);
}

// ========================================
// EDIT EXPENSE
// ========================================

function editExpense(id) {
  if (busy) return;

  const expense = expenseById.get(id);

  if (!expense) return;

  editingId = id;

  field("expenseTitle").value =
    expense.title;

  field("expenseCategory").value =
    expense.category;

  field("expenseAmount").value =
    expense.amount;

  field("expenseDate").value =
    expense.date;

  field("expenseNotes").value =
    expense.notes;

  field("expenseFormTitle").textContent =
    "Edit Expense";

  field("saveExpenseLabel").textContent =
    "Update Expense";

  field("cancelExpenseEdit").classList.remove(
    "hidden"
  );

  form.scrollIntoView({
    behavior: "smooth"
  });
}

// ========================================
// DELETE EXPENSE
// ========================================

async function deleteExpense(id) {
  if (busy) return;

  const expense = expenseById.get(id);

  if (!expense) return;

  const confirmed = confirm(
    `Delete expense "${expense.title}"?`
  );

  if (!confirmed) return;

  setBusy(true);

  let committed = false;

  try {
    const { data, error } = await db
      .from("expenses")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) throw error;

    if (
      !data ||
      data.length !== 1
    ) {
      throw new Error(
        "Expense deletion was not confirmed."
      );
    }

    committed = true;

    if (editingId === id) {
      resetForm();
    }

    await loadExpenses();

    showMessage(
      "Expense deleted.",
      "success"
    );
  } catch (error) {
    console.error(
      "Unable to delete expense:",
      error
    );

    showMessage(
      committed
        ? "Expense deleted in Supabase, but " +
          "refreshing failed. Reload the page."
        : "Expense deletion not confirmed: " +
          errorText(error) +
          " Check Supabase before retrying.",
      "error"
    );
  } finally {
    setBusy(false);
  }
}

// ========================================
// SAVE EXPENSE
// ========================================

async function saveExpense(event) {
  event.preventDefault();

  if (busy) return;

  const title = field(
    "expenseTitle"
  ).value.trim();

  const category = field(
    "expenseCategory"
  ).value.trim();

  const amountInput = field(
    "expenseAmount"
  ).value;

  const amount = Number(amountInput);

  const date = field(
    "expenseDate"
  ).value;

  const notes = field(
    "expenseNotes"
  ).value.trim();

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

  // Preserve the record being edited
  // throughout the database request.
  const targetId = editingId;

  setBusy(true);
  showMessage("Saving expense...");

  let committed = false;

  try {
    if (targetId) {
      const { data, error } = await db
        .from("expenses")
        .update(payload)
        .eq("id", targetId)
        .select("id");

      if (error) throw error;

      if (
        !data ||
        data.length !== 1
      ) {
        throw new Error(
          "Expense update was not confirmed."
        );
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

    committed = true;

    // The write succeeded. Clear the
    // form before attempting refresh.
    resetForm();

    await loadExpenses();

    showMessage(
      "Expense saved successfully!",
      "success"
    );
  } catch (error) {
    console.error(
      "Unable to save expense:",
      error
    );

    showMessage(
      committed
        ? "Expense saved in Supabase, but " +
          "refreshing failed. Reload the page " +
          "before saving another expense."
        : "Expense save not confirmed: " +
          errorText(error) +
          " Check Supabase before retrying.",
      "error"
    );
  } finally {
    setBusy(false);
  }
}

// ========================================
// FILTER EVENTS
// ========================================

if (searchInput) {
  searchInput.addEventListener(
    "input",
    () => {
      clearTimeout(searchTimer);

      searchTimer = setTimeout(
        renderExpenses,
        150
      );
    }
  );
}

if (monthFilter) {
  monthFilter.addEventListener(
    "change",
    renderExpenses
  );
}

if (categoryFilter) {
  categoryFilter.addEventListener(
    "change",
    renderExpenses
  );
}

const clearFilters = field(
  "clearExpenseFilters"
);

if (clearFilters) {
  clearFilters.addEventListener(
    "click",
    () => {
      clearTimeout(searchTimer);

      if (searchInput) {
        searchInput.value = "";
      }

      if (monthFilter) {
        monthFilter.value = "";
      }

      if (categoryFilter) {
        categoryFilter.value = "";
      }

      renderExpenses();
    }
  );
}

// ========================================
// FORM EVENTS
// ========================================

if (form) {
  form.addEventListener(
    "submit",
    saveExpense
  );
}

const cancelEdit = field(
  "cancelExpenseEdit"
);

if (cancelEdit) {
  cancelEdit.addEventListener(
    "click",
    resetForm
  );
}

// ========================================
// INITIALIZATION
// ========================================

async function initializeExpenses() {
  resetForm();
  setBusy(true);

  try {
    const user =
      await window.TimidyAuth.getAuthorizedUser();

    if (!user) {
      window.location.replace(
        "login.html"
      );

      return;
    }

    await loadExpenses();
  } catch (error) {
    console.error(
      "Unable to load expenses:",
      error
    );

    showMessage(
      "Unable to load expenses: " +
      errorText(error),
      "error"
    );
  } finally {
    setBusy(false);
  }
}

initializeExpenses();

// ========================================
// REFRESH WHEN RETURNING TO TAB
// ========================================

// Refresh after returning from a longer
// absence, not every brief tab switch.

document.addEventListener(
  "visibilitychange",
  async () => {
    if (
      document.hidden ||
      !initialized ||
      busy
    ) {
      return;
    }

    const age =
      Date.now() - lastRefresh;

    if (age < REFRESH_INTERVAL) {
      return;
    }

    setBusy(true);

    try {
      const user =
        await window.TimidyAuth.getAuthorizedUser();

      if (!user) {
        window.location.replace(
          "login.html"
        );

        return;
      }

      await loadExpenses();
    } catch (error) {
      console.error(
        "Expenses background refresh failed:",
        error
      );

      showMessage(
        "Unable to refresh expenses. " +
        "Reload the page before saving changes.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }
);

// ========================================
// ICONS
// ========================================

if (typeof lucide !== "undefined") {
  lucide.createIcons();
}
