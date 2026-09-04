import {
  db,
  resolveCurrentUserId,
  getUserSettingsRef,
  getUserTransactionsRef,
} from "./firebase-config.js";
import {
  addDoc,
  getDoc,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  deleteField,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let allTransactions = [];
let editingTransactionId = null;
let unsubscribeRealtime = null;
let selectedDetailMonth = null;
let dailySpendingLimit = 0;

function isUserAuthenticated() {
  return (
    sessionStorage.getItem("app_unlocked") === "true" &&
    !!sessionStorage.getItem("current_user_id")
  );
}

function guardAuthenticated() {
  if (!isUserAuthenticated()) {
    const pinModal = document.getElementById("pin-modal");
    ["page-dashboard", "page-transactions", "page-report"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add("hidden");
    });
    if (pinModal) pinModal.classList.remove("hidden");
    return false;
  }
  return true;
}

const getCurrentYearMonth = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

// Helper Format Rupiah
const formatRupiah = (num) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num);

const formatMonthLabel = (monthValue) => {
  if (!monthValue) return "Semua Bulan";
  const [year, month] = monthValue.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(date);
};

// Set Default Date Filter
const today = new Date();
document.getElementById("date").valueAsDate = today;

const filterMonthInput = document.getElementById("filter-month");
const transactionSearchInput = document.getElementById("transaction-search");
const reportMonthInput = document.getElementById("report-month");
const currentYearMonth = getCurrentYearMonth();
filterMonthInput.value = currentYearMonth;
reportMonthInput.value = currentYearMonth;

const transactionForm = document.getElementById("transaction-form");
const submitBtn = document.getElementById("submit-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmYesBtn = document.getElementById("confirm-yes-btn");
const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
const confirmCloseBtn = document.getElementById("confirm-close-btn");
const dailyLimitForm = document.getElementById("daily-limit-form");
const dailyLimitInput = document.getElementById("daily-limit-input");
const dailyLimitFeedback = document.getElementById("daily-limit-feedback");
const deleteDailyLimitBtn = document.getElementById("delete-daily-limit-btn");
const dailyLimitDetailModal = document.getElementById(
  "daily-limit-detail-modal",
);
const dailyLimitDetailFilter = document.getElementById(
  "daily-limit-detail-filter",
);
const dailyLimitDetailList = document.getElementById("daily-limit-detail-list");

function getDailyLimitDates(month = "all") {
  return [
    ...new Set(
      allTransactions
        .filter(
          (item) =>
            item.type === "pengeluaran" &&
            item.date &&
            (month === "all" || item.date.startsWith(month)),
        )
        .map((item) => item.date),
    ),
  ].sort((a, b) => b.localeCompare(a));
}

function getDaysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function getDailyLimitPeriodDays(period) {
  if (period !== "all") return getDaysInMonth(period);

  const months = new Set(
    allTransactions
      .filter((item) => item.type === "pengeluaran" && item.date)
      .map((item) => item.date.slice(0, 7)),
  );
  return [...months].reduce((total, month) => total + getDaysInMonth(month), 0);
}

function renderDailyLimitDetail() {
  const selectedPeriod = dailyLimitDetailFilter.value || "all";
  const dates = getDailyLimitDates(selectedPeriod);
  const dailyDetails = dates.map((date) => {
    const spent = getDailySpent(date);
    const remaining = dailySpendingLimit
      ? Math.max(dailySpendingLimit - spent, 0)
      : 0;
    const overLimit = dailySpendingLimit
      ? Math.max(spent - dailySpendingLimit, 0)
      : 0;
    return { date, spent, remaining, overLimit };
  });
  const totalExpense = dailyDetails.reduce(
    (total, item) => total + item.spent,
    0,
  );
  const periodDays = getDailyLimitPeriodDays(selectedPeriod);
  const totalLimit = dailySpendingLimit ? dailySpendingLimit * periodDays : 0;
  const totalRemaining = totalLimit - totalExpense;
  const totalOverLimit = Math.max(-totalRemaining, 0);

  document.getElementById("detail-total-expense").innerText =
    formatRupiah(totalExpense);
  document.getElementById("detail-total-limit").innerText = dailySpendingLimit
    ? formatRupiah(totalLimit)
    : "Belum diatur";
  document.getElementById("detail-total-remaining").innerText =
    dailySpendingLimit ? formatRupiah(totalRemaining) : "Belum diatur";
  document.getElementById("detail-total-over-limit").innerText =
    dailySpendingLimit ? formatRupiah(totalOverLimit) : "Belum diatur";

  const periodLabel =
    selectedPeriod === "all"
      ? "seluruh transaksi"
      : formatMonthLabel(selectedPeriod);
  document.getElementById("daily-limit-detail-summary").innerText =
    `${periodLabel}: ${periodDays} hari x batas harian, ${dates.length} hari memiliki pengeluaran.`;

  if (!dates.length) {
    dailyLimitDetailList.innerHTML = `
      <div class="py-8 text-center text-slate-400 text-sm">
        Belum ada transaksi pengeluaran pada periode ini.
      </div>
    `;
    return;
  }

  dailyLimitDetailList.innerHTML = dailyDetails
    .map(
      (item) => `
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs font-bold text-slate-700">${item.date}</span>
            <span class="text-xs font-bold text-rose-600">${formatRupiah(item.spent)}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 mt-2 text-[11px]">
            <span class="text-emerald-600">Sisa: ${dailySpendingLimit ? formatRupiah(item.remaining) : "-"}</span>
            <span class="text-right text-rose-600">Lebih: ${dailySpendingLimit ? formatRupiah(item.overLimit) : "-"}</span>
          </div>
        </div>
      `,
    )
    .join("");
}

function populateDailyLimitDetailFilter() {
  const currentValue = dailyLimitDetailFilter.value || "all";
  const months = [
    ...new Set(
      allTransactions
        .filter((item) => item.type === "pengeluaran" && item.date)
        .map((item) => item.date.slice(0, 7)),
    ),
  ].sort((a, b) => b.localeCompare(a));
  dailyLimitDetailFilter.innerHTML = `<option value="all">Semua transaksi</option>${months
    .map(
      (month) => `<option value="${month}">${formatMonthLabel(month)}</option>`,
    )
    .join("")}`;
  dailyLimitDetailFilter.value =
    months.includes(currentValue) || currentValue === "all"
      ? currentValue
      : "all";
}

function openDailyLimitDetail() {
  populateDailyLimitDetailFilter();
  renderDailyLimitDetail();
  dailyLimitDetailModal.classList.remove("hidden");
  dailyLimitDetailModal.setAttribute("aria-hidden", "false");
}

function closeDailyLimitDetail() {
  dailyLimitDetailModal.classList.add("hidden");
  dailyLimitDetailModal.setAttribute("aria-hidden", "true");
}

function getDateTransactions(date, excludedId = null) {
  return allTransactions.filter(
    (item) =>
      item.id !== excludedId &&
      item.date === date &&
      item.type === "pengeluaran",
  );
}

function getTodayDate() {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDailySpent(date, excludedId = null) {
  return getDateTransactions(date, excludedId).reduce(
    (total, item) => total + Number(item.amount || 0),
    0,
  );
}

function renderDailyAssistant() {
  const date = getTodayDate();
  const spent = getDailySpent(date);
  const spentElement = document.getElementById("daily-spent");
  const limitElement = document.getElementById("daily-limit-display");
  const remainingElement = document.getElementById("daily-remaining");
  const overLimitElement = document.getElementById("daily-over-limit");
  const statusElement = document.getElementById("daily-assistant-status");
  const tipElement = document.getElementById("daily-assistant-tip");
  const iconElement = document.getElementById("daily-assistant-icon");

  spentElement.innerText = formatRupiah(spent);
  dailyLimitInput.value = dailySpendingLimit || "";

  if (!dailySpendingLimit) {
    limitElement.innerText = "Belum diatur";
    remainingElement.innerText = "Belum diatur";
    overLimitElement.innerText = "Belum diatur";
    statusElement.innerText = "Atur batas agar pengeluaran lebih terarah";
    tipElement.innerText =
      "Asisten akan menghitung sisa batas dan memberi peringatan saat input transaksi.";
    iconElement.innerText = "💡";
    return;
  }

  const remaining = dailySpendingLimit - spent;
  const overLimit = Math.max(spent - dailySpendingLimit, 0);
  limitElement.innerText = formatRupiah(dailySpendingLimit);
  remainingElement.innerText = formatRupiah(Math.max(remaining, 0));
  overLimitElement.innerText = formatRupiah(overLimit);
  overLimitElement.className = `text-sm font-bold mt-1 ${overLimit > 0 ? "text-rose-600" : "text-slate-400"}`;
  remainingElement.className = `text-sm font-bold mt-1 ${remaining < 0 ? "text-rose-600" : "text-emerald-600"}`;

  if (remaining < 0) {
    statusElement.innerText = "Pengeluaran hari ini sudah melewati batas";
    tipElement.innerText = `Kurangi ${formatRupiah(Math.abs(remaining))} dari pengeluaran berikutnya agar kembali sesuai rencana.`;
    iconElement.innerText = "⚠️";
  } else if (remaining === 0) {
    statusElement.innerText = "Batas pengeluaran hari ini sudah habis";
    tipElement.innerText =
      "Hindari pengeluaran tambahan atau naikkan batas jika memang diperlukan.";
    iconElement.innerText = "🛑";
  } else {
    statusElement.innerText = "Pengeluaran hari ini masih dalam kendali";
    tipElement.innerText = `Sisa ruang pengeluaran hari ini ${formatRupiah(remaining)}.`;
    iconElement.innerText = "✅";
  }
  if (remaining > 0 && spent >= dailySpendingLimit * 0.8) {
    statusElement.innerText = "Pengeluaran hari ini mendekati batas";
    tipElement.innerText = `Pemakaian sudah ${Math.round((spent / dailySpendingLimit) * 100)}%. Sisa ${formatRupiah(remaining)}.`;
    iconElement.innerText = "🔔";
  }
  if (!dailyLimitDetailModal.classList.contains("hidden")) {
    populateDailyLimitDetailFilter();
    renderDailyLimitDetail();
  }
}

async function loadDailySpendingLimit() {
  try {
    const currentUserId = await resolveCurrentUserId();
    const settingsSnap = await getDoc(getUserSettingsRef(currentUserId));
    dailySpendingLimit = settingsSnap.exists()
      ? Number(settingsSnap.data().dailySpendingLimit || 0)
      : 0;
    renderDailyAssistant();
  } catch (error) {
    console.error("Gagal mengambil batas pengeluaran harian:", error);
  }
}

function showConfirmModal({ title, message, yesText, onConfirm, onCancel }) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmYesBtn.textContent = yesText;
  confirmYesBtn.onclick = () => {
    confirmModal.classList.add("hidden");
    confirmModal.classList.remove("flex");
    onConfirm();
  };
  confirmCancelBtn.onclick = () => {
    confirmModal.classList.add("hidden");
    confirmModal.classList.remove("flex");
    if (typeof onCancel === "function") onCancel();
  };
  confirmCloseBtn.onclick = () => {
    confirmModal.classList.add("hidden");
    confirmModal.classList.remove("flex");
    if (typeof onCancel === "function") onCancel();
  };
  confirmModal.onclick = (event) => {
    if (event.target === confirmModal) {
      confirmModal.classList.add("hidden");
      confirmModal.classList.remove("flex");
      if (typeof onCancel === "function") onCancel();
    }
  };
  confirmModal.classList.remove("hidden");
  confirmModal.classList.add("flex");
}

function resetTransactionForm() {
  transactionForm.reset();
  editingTransactionId = null;
  submitBtn.textContent = "Simpan Transaksi";
  cancelEditBtn.classList.add("hidden");
  document.getElementById("type-pengeluaran").checked = true;
  syncTransactionTypeSelection();
  document.getElementById("date").valueAsDate = new Date();
}

function fillTransactionForm(item) {
  editingTransactionId = item.id;
  document.getElementById("type-pemasukan").checked = item.type === "pemasukan";
  document.getElementById("type-pengeluaran").checked =
    item.type === "pengeluaran";
  document.getElementById("date").value = item.date;
  document.getElementById("category").value = item.category;
  document.getElementById("amount").value = item.amount;
  document.getElementById("description").value = item.description || "";
  syncTransactionTypeSelection();
  submitBtn.textContent = "Update Transaksi";
  cancelEditBtn.classList.remove("hidden");
}

function syncTransactionTypeSelection() {
  document.querySelectorAll('input[name="type"]').forEach((input) => {
    const targetLabel = document.querySelector(`label[for="${input.id}"]`);
    if (!targetLabel) return;

    const isIncome = input.value === "pemasukan";
    const isChecked = input.checked;

    targetLabel.classList.toggle("bg-emerald-50", isChecked && isIncome);
    targetLabel.classList.toggle("border-emerald-500", isChecked && isIncome);
    targetLabel.classList.toggle("text-emerald-600", isChecked && isIncome);

    targetLabel.classList.toggle("bg-rose-50", isChecked && !isIncome);
    targetLabel.classList.toggle("border-rose-500", isChecked && !isIncome);
    targetLabel.classList.toggle("text-rose-600", isChecked && !isIncome);

    targetLabel.classList.toggle("bg-slate-50", !isChecked);
    targetLabel.classList.toggle("border-slate-200", !isChecked);
    targetLabel.classList.toggle("text-slate-500", !isChecked);
  });
}

document
  .querySelectorAll('input[name="type"]')
  .forEach((input) =>
    input.addEventListener("change", syncTransactionTypeSelection),
  );

syncTransactionTypeSelection();

// Kontrol Navigasi
const pageDashboard = document.getElementById("page-dashboard");
const pageTransactions = document.getElementById("page-transactions");
const pageReport = document.getElementById("page-report");

const btnDashDesktop = document.getElementById("nav-dashboard-desktop");
const btnTransDesktop = document.getElementById("nav-transactions-desktop");
const btnReportDesktop = document.getElementById("nav-report-desktop");
const btnDashMobile = document.getElementById("nav-dashboard-mobile");
const btnTransMobile = document.getElementById("nav-transactions-mobile");
const btnReportMobile = document.getElementById("nav-report-mobile");

[
  "daily-spent-card",
  "daily-limit-card",
  "daily-remaining-card",
  "daily-over-limit-card",
].forEach((cardId) =>
  document
    .getElementById(cardId)
    .addEventListener("click", openDailyLimitDetail),
);
dailyLimitDetailFilter.addEventListener("change", renderDailyLimitDetail);
document
  .getElementById("close-daily-limit-detail-btn")
  .addEventListener("click", closeDailyLimitDetail);
dailyLimitDetailModal.addEventListener("click", (event) => {
  if (event.target === dailyLimitDetailModal) closeDailyLimitDetail();
});

function setActiveNav(active) {
  const desktopBtnMap = {
    dashboard: btnDashDesktop,
    transactions: btnTransDesktop,
    report: btnReportDesktop,
  };
  const mobileBtnMap = {
    dashboard: btnDashMobile,
    transactions: btnTransMobile,
    report: btnReportMobile,
  };

  Object.entries(desktopBtnMap).forEach(([key, btn]) => {
    btn.className =
      key === active
        ? "px-5 py-2.5 rounded-lg text-sm font-semibold transition bg-white text-slate-900 shadow-sm"
        : "px-5 py-2.5 rounded-lg text-sm font-semibold transition text-slate-500 hover:text-slate-900";
  });

  Object.entries(mobileBtnMap).forEach(([key, btn]) => {
    btn.className =
      key === active
        ? "flex flex-col items-center gap-1 text-blue-600"
        : "flex flex-col items-center gap-1 text-slate-400";
  });
}

function showDashboard() {
  if (!guardAuthenticated()) return;
  pageDashboard.classList.remove("hidden");
  pageTransactions.classList.add("hidden");
  pageReport.classList.add("hidden");
  setActiveNav("dashboard");
}

function showTransactions() {
  if (!guardAuthenticated()) return;
  pageTransactions.classList.remove("hidden");
  pageDashboard.classList.add("hidden");
  pageReport.classList.add("hidden");
  syncTransactionTypeSelection();
  setActiveNav("transactions");
}

function showReport() {
  if (!guardAuthenticated()) return;
  pageReport.classList.remove("hidden");
  pageDashboard.classList.add("hidden");
  pageTransactions.classList.add("hidden");
  renderReport();
  setActiveNav("report");
}

btnDashDesktop.addEventListener("click", showDashboard);
btnTransDesktop.addEventListener("click", showTransactions);
btnReportDesktop.addEventListener("click", showReport);
btnDashMobile.addEventListener("click", showDashboard);
btnTransMobile.addEventListener("click", showTransactions);
btnReportMobile.addEventListener("click", showReport);
document
  .getElementById("go-to-transaction-btn")
  .addEventListener("click", showTransactions);

// Chart.js Setup
const ctx = document.getElementById("cashflowChart").getContext("2d");
const cashflowChart = new Chart(ctx, {
  type: "doughnut",
  data: {
    labels: ["Pemasukan", "Pengeluaran"],
    datasets: [{ data: [0, 0], backgroundColor: ["#10b981", "#f43f5e"] }],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom" } },
  },
});

// Submit Transaksi (Simpan / Update)
transactionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!guardAuthenticated()) {
    alert("Silakan login terlebih dahulu sebelum menambah atau mengubah data.");
    return;
  }
  submitBtn.disabled = true;

  const payload = {
    type: document.querySelector('input[name="type"]:checked').value,
    date: document.getElementById("date").value,
    category: document.getElementById("category").value,
    amount: Number(document.getElementById("amount").value),
    description: document.getElementById("description").value,
  };

  if (payload.type === "pengeluaran" && dailySpendingLimit > 0) {
    const spentBefore = getDailySpent(payload.date, editingTransactionId);
    const projectedSpent = spentBefore + payload.amount;

    if (projectedSpent > dailySpendingLimit) {
      const confirmed = await new Promise((resolve) => {
        showConfirmModal({
          title: "Melebihi batas harian?",
          message: `Pengeluaran tanggal ${payload.date} menjadi ${formatRupiah(projectedSpent)}, melewati batas ${formatRupiah(dailySpendingLimit)}. Tetap simpan transaksi ini?`,
          yesText: "Ya, tetap simpan",
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

      if (!confirmed) {
        submitBtn.disabled = false;
        return;
      }
    }
  }

  try {
    const currentUserId = await resolveCurrentUserId();
    const userTransactionsRef = getUserTransactionsRef(currentUserId);

    if (editingTransactionId) {
      const itemDocRef = doc(
        db,
        "users",
        currentUserId,
        "transactions",
        editingTransactionId,
      );
      await updateDoc(itemDocRef, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(userTransactionsRef, {
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
    resetTransactionForm();
    showDashboard();
  } catch (err) {
    alert(
      editingTransactionId
        ? "Gagal memperbarui transaksi ke Cloud: " + err.message
        : "Gagal menyimpan transaksi ke Cloud: " + err.message,
    );
  } finally {
    submitBtn.disabled = false;
  }
});

cancelEditBtn.addEventListener("click", () => {
  showConfirmModal({
    title: "Batal edit transaksi?",
    message: "Perubahan yang belum disimpan akan dibatalkan. Yakin lanjut?",
    yesText: "Ya, batal",
    onConfirm: () => {
      resetTransactionForm();
      showTransactions();
    },
  });
});

// Render Data ke Dashboard & List
function renderApp() {
  const selectedMonth = filterMonthInput.value;
  const searchTerm = transactionSearchInput.value.trim().toLowerCase();
  let totalIncome = 0;
  let totalExpense = 0;

  const desktopList = document.getElementById("transaction-list-desktop");
  const mobileList = document.getElementById("transaction-list-mobile");

  desktopList.innerHTML = "";
  mobileList.innerHTML = "";

  if (allTransactions.length === 0) {
    const emptyText = `<p class="py-6 text-center text-slate-400 text-xs sm:text-sm">Belum ada transaksi dicatat.</p>`;
    desktopList.innerHTML = `<tr><td colspan="4">${emptyText}</td></tr>`;
    mobileList.innerHTML = emptyText;
  }

  allTransactions.forEach((item) => {
    const isMatchMonth = selectedMonth
      ? item.date && item.date.startsWith(selectedMonth)
      : true;
    const searchableText =
      `${item.category || ""} ${item.description || ""} ${item.date || ""}`.toLowerCase();
    const isMatchSearch = !searchTerm || searchableText.includes(searchTerm);

    if (isMatchMonth) {
      if (item.type === "pemasukan") totalIncome += item.amount;
      else totalExpense += item.amount;
    }

    if (!isMatchMonth || !isMatchSearch) return;

    const isIncome = item.type === "pemasukan";

    // Desktop Row
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition";
    tr.innerHTML = `
      <td class="py-3 px-2 text-slate-500 whitespace-nowrap">${item.date}</td>
      <td class="py-3 px-2">
        <div class="font-semibold text-slate-800">${item.category}</div>
        <div class="text-xs text-slate-400">${item.description || "-"}</div>
      </td>
      <td class="py-3 px-2 text-right font-semibold whitespace-nowrap ${isIncome ? "text-emerald-600" : "text-rose-600"}">
        ${isIncome ? "+" : "-"} ${formatRupiah(item.amount)}
      </td>
      <td class="py-3 px-2 text-center">
        <div class="flex items-center justify-center gap-2">
          <button data-id="${item.id}" class="edit-btn inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition">
            ✏️ Edit
          </button>
          <button data-id="${item.id}" class="delete-btn inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-600 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition">
            🗑️ Hapus
          </button>
        </div>
      </td>
    `;
    desktopList.appendChild(tr);

    // Mobile Card
    const card = document.createElement("div");
    card.className =
      "p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between gap-3";
    card.innerHTML = `
      <div class="space-y-0.5">
        <div class="flex items-center gap-2">
          <span class="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${isIncome ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}">
            ${item.category}
          </span>
          <span class="text-[11px] text-slate-400">${item.date}</span>
        </div>
        <p class="text-xs text-slate-500 line-clamp-1">${item.description || "-"}</p>
      </div>
      <div class="text-right flex flex-col items-end gap-1">
        <span class="text-xs font-bold whitespace-nowrap ${isIncome ? "text-emerald-600" : "text-rose-600"}">
          ${isIncome ? "+" : "-"} ${formatRupiah(item.amount)}
        </span>
        <div class="flex items-center gap-2">
          <button data-id="${item.id}" class="edit-btn inline-flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-[10px] font-semibold">
            Edit
          </button>
          <button data-id="${item.id}" class="delete-btn inline-flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-600 px-2 py-1 rounded-md text-[10px] font-semibold">
            Hapus
          </button>
        </div>
      </div>
    `;
    mobileList.appendChild(card);
  });

  if (desktopList.children.length === 0) {
    const emptyText = searchTerm
      ? "Transaksi tidak ditemukan."
      : "Belum ada transaksi pada periode ini.";
    desktopList.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-400 text-xs sm:text-sm">${emptyText}</td></tr>`;
    mobileList.innerHTML = `<p class="py-6 text-center text-slate-400 text-xs sm:text-sm">${emptyText}</p>`;
  }

  document.getElementById("total-income").innerText = formatRupiah(totalIncome);
  document.getElementById("total-expense").innerText =
    formatRupiah(totalExpense);
  document.getElementById("total-balance").innerText = formatRupiah(
    totalIncome - totalExpense,
  );

  cashflowChart.data.datasets[0].data = [totalIncome, totalExpense];
  cashflowChart.update();
  renderDailyAssistant();

  // Attach Listener Button Edit
  document.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const docId = e.target.getAttribute("data-id");
      const item = allTransactions.find(
        (transaction) => transaction.id === docId,
      );
      if (!item) return;

      showConfirmModal({
        title: "Edit transaksi?",
        message: `Data ${item.category} pada ${item.date} akan diubah. Yakin lanjut?`,
        yesText: "Ya, edit",
        onConfirm: () => {
          fillTransactionForm(item);
          showTransactions();
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
      });
    });
  });

  // Attach Listener Button Hapus
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const docId = e.target.getAttribute("data-id");
      if (!docId) return;

      const item = allTransactions.find(
        (transaction) => transaction.id === docId,
      );

      showConfirmModal({
        title: "Hapus transaksi?",
        message: item
          ? `Transaksi ${item.category} (${item.date}) akan dihapus permanen. Yakin lanjut?`
          : "Transaksi ini akan dihapus permanen. Yakin lanjut?",
        yesText: "Ya, hapus",
        onConfirm: async () => {
          try {
            const currentUserId = await resolveCurrentUserId();
            await deleteDoc(
              doc(db, "users", currentUserId, "transactions", docId),
            );
          } catch (err) {
            alert("Gagal menghapus transaksi: " + err.message);
          }
        },
      });
    });
  });
}

filterMonthInput.addEventListener("change", renderApp);
transactionSearchInput.addEventListener("input", renderApp);
reportMonthInput.addEventListener("change", () => {
  selectedDetailMonth = null;
  renderReport();
});
document.getElementById("reset-filter-btn").addEventListener("click", () => {
  filterMonthInput.value = "";
  renderApp();
});
document.getElementById("reset-report-btn").addEventListener("click", () => {
  selectedDetailMonth = null;
  reportMonthInput.value = getCurrentYearMonth();
  renderReport();
});

function getMonthlyTotals() {
  const monthMap = new Map();

  allTransactions.forEach((item) => {
    if (!item.date) return;
    const monthKey = item.date.slice(0, 7);
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { income: 0, expense: 0 });
    }

    const totals = monthMap.get(monthKey);
    if (item.type === "pemasukan") totals.income += Number(item.amount || 0);
    else totals.expense += Number(item.amount || 0);
  });

  return [...monthMap.entries()]
    .map(([month, totals]) => ({
      month,
      income: totals.income,
      expense: totals.expense,
      balance: totals.income - totals.expense,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

function renderReport() {
  const reportList = document.getElementById("report-monthly-list");
  const detailList = document.getElementById("report-detail-list");
  const detailMonthLabel = document.getElementById("report-detail-month");
  const monthlyData = getMonthlyTotals();
  const selectedMonth = reportMonthInput.value || getCurrentYearMonth();
  const detailTargetMonth = selectedDetailMonth || null;

  if (monthlyData.length === 0) {
    reportList.innerHTML = `
      <div class="py-8 text-center text-slate-400 text-sm">
        Belum ada data transaksi untuk laporan bulanan.
      </div>
    `;
    detailList.innerHTML = `
      <div class="py-6 text-center text-slate-400 text-xs">
        Klik salah satu bulan untuk melihat detail transaksi.
      </div>
    `;
    detailMonthLabel.textContent = "Belum dipilih";
    document.getElementById("report-income").innerText = formatRupiah(0);
    document.getElementById("report-expense").innerText = formatRupiah(0);
    document.getElementById("report-balance").innerText = formatRupiah(0);
    return;
  }

  const selectedMonthData = monthlyData.find(
    (item) => item.month === selectedMonth,
  ) || {
    month: selectedMonth,
    income: 0,
    expense: 0,
    balance: 0,
  };

  document.getElementById("report-income").innerText = formatRupiah(
    selectedMonthData.income,
  );
  document.getElementById("report-expense").innerText = formatRupiah(
    selectedMonthData.expense,
  );
  document.getElementById("report-balance").innerText = formatRupiah(
    selectedMonthData.balance,
  );

  reportList.innerHTML = "";
  monthlyData.forEach((item) => {
    const isSelected = item.month === selectedMonth;
    const row = document.createElement("button");
    row.type = "button";
    row.className = `w-full text-left p-3 rounded-xl border transition ${
      isSelected
        ? "border-blue-200 bg-blue-50"
        : "border-slate-200 bg-slate-50 hover:bg-slate-100"
    }`;
    row.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase ${isSelected ? "text-blue-600" : "text-slate-400"}">
            ${formatMonthLabel(item.month)}
          </p>
        </div>
        <div class="text-right text-xs">
          <div class="text-emerald-600 font-bold">${formatRupiah(item.income)}</div>
          <div class="text-rose-600 font-bold">${formatRupiah(item.expense)}</div>
        </div>
      </div>
      <div class="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>Saldo</span>
        <span class="font-bold ${item.balance >= 0 ? "text-emerald-600" : "text-rose-600"}">${formatRupiah(item.balance)}</span>
      </div>
    `;

    row.addEventListener("click", () => {
      selectedDetailMonth = item.month;
      reportMonthInput.value = item.month;
      renderReport();
    });

    reportList.appendChild(row);
  });

  if (!detailTargetMonth) {
    detailList.innerHTML = `
      <div class="py-6 text-center text-slate-400 text-xs">
        Klik salah satu bulan untuk melihat detail transaksi.
      </div>
    `;
    detailMonthLabel.textContent = "Belum dipilih";
    return;
  }

  const monthTransactions = allTransactions.filter(
    (item) => item.date && item.date.startsWith(detailTargetMonth),
  );
  detailMonthLabel.textContent = formatMonthLabel(detailTargetMonth);

  if (monthTransactions.length === 0) {
    detailList.innerHTML = `
      <div class="py-6 text-center text-slate-400 text-xs">
        Tidak ada transaksi pada bulan ini.
      </div>
    `;
    return;
  }

  detailList.innerHTML = "";
  monthTransactions
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((item) => {
      const itemRow = document.createElement("div");
      const isIncome = item.type === "pemasukan";
      itemRow.className =
        "flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3";
      itemRow.innerHTML = `
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
              isIncome
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700"
            }">${item.category}</span>
            <span class="text-[11px] text-slate-400">${item.date}</span>
          </div>
          <p class="mt-1 text-xs text-slate-500 truncate">${
            item.description || "-"
          }</p>
        </div>
        <span class="text-xs font-bold whitespace-nowrap ${
          isIncome ? "text-emerald-600" : "text-rose-600"
        }">${isIncome ? "+" : "-"} ${formatRupiah(item.amount)}</span>
      `;
      detailList.appendChild(itemRow);
    });
}

dailyLimitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!guardAuthenticated()) return;

  const limit = Number(dailyLimitInput.value || 0);
  if (limit < 0 || !Number.isFinite(limit)) return;

  try {
    const currentUserId = await resolveCurrentUserId();
    await setDoc(
      getUserSettingsRef(currentUserId),
      { dailySpendingLimit: limit },
      { merge: true },
    );
    dailySpendingLimit = limit;
    dailyLimitFeedback.innerText = limit
      ? "Batas pengeluaran harian berhasil disimpan."
      : "Batas harian dinonaktifkan.";
    dailyLimitFeedback.classList.remove("hidden");
    renderDailyAssistant();
  } catch (error) {
    dailyLimitFeedback.innerText = "Gagal menyimpan batas harian.";
    dailyLimitFeedback.classList.remove("hidden");
    dailyLimitFeedback.classList.replace("text-emerald-600", "text-rose-600");
    console.error("Gagal menyimpan batas pengeluaran harian:", error);
  }
});

deleteDailyLimitBtn.addEventListener("click", () => {
  if (!guardAuthenticated() || !dailySpendingLimit) {
    dailyLimitFeedback.innerText = "Belum ada batas harian untuk dihapus.";
    dailyLimitFeedback.classList.remove("hidden");
    return;
  }

  showConfirmModal({
    title: "Hapus batas harian?",
    message: "Batas pengeluaran harian akan dihapus dari akun ini.",
    yesText: "Ya, hapus",
    onConfirm: async () => {
      try {
        const currentUserId = await resolveCurrentUserId();
        await setDoc(
          getUserSettingsRef(currentUserId),
          { dailySpendingLimit: deleteField() },
          { merge: true },
        );
        dailySpendingLimit = 0;
        dailyLimitFeedback.innerText = "Batas harian berhasil dihapus.";
        dailyLimitFeedback.classList.remove("hidden", "text-rose-600");
        dailyLimitFeedback.classList.add("text-emerald-600");
        renderDailyAssistant();
      } catch (error) {
        dailyLimitFeedback.innerText = "Gagal menghapus batas harian.";
        dailyLimitFeedback.classList.remove("hidden", "text-emerald-600");
        dailyLimitFeedback.classList.add("text-rose-600");
        console.error("Gagal menghapus batas pengeluaran harian:", error);
      }
    },
  });
});

// Listener Real-Time Firestore Langsung ke Sub-collection
export async function listenToRealtimeData() {
  if (!guardAuthenticated()) return;

  const currentUserId = await resolveCurrentUserId();
  const userTransactionsRef = getUserTransactionsRef(currentUserId);
  const q = query(userTransactionsRef, orderBy("date", "desc"));
  await loadDailySpendingLimit();

  if (unsubscribeRealtime) {
    unsubscribeRealtime();
  }

  unsubscribeRealtime = onSnapshot(
    q,
    (snapshot) => {
      allTransactions = [];
      snapshot.forEach((docSnap) => {
        allTransactions.push({
          id: docSnap.id,
          ...docSnap.data(),
        });
      });
      renderApp();
      renderReport();
    },
    (error) => {
      console.error("Gagal mengambil data dari Sub-collection:", error);
    },
  );
}
