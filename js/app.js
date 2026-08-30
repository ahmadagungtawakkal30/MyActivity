import {
  db,
  resolveCurrentUserId,
  getUserTransactionsRef,
} from "./firebase-config.js";
import {
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let allTransactions = [];
let editingTransactionId = null;
let unsubscribeRealtime = null;

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

function showConfirmModal({ title, message, yesText, onConfirm }) {
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
  };
  confirmCloseBtn.onclick = () => {
    confirmModal.classList.add("hidden");
    confirmModal.classList.remove("flex");
  };
  confirmModal.onclick = (event) => {
    if (event.target === confirmModal) {
      confirmModal.classList.add("hidden");
      confirmModal.classList.remove("flex");
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
  pageDashboard.classList.remove("hidden");
  pageTransactions.classList.add("hidden");
  pageReport.classList.add("hidden");
  setActiveNav("dashboard");
}

function showTransactions() {
  pageTransactions.classList.remove("hidden");
  pageDashboard.classList.add("hidden");
  pageReport.classList.add("hidden");
  syncTransactionTypeSelection();
  setActiveNav("transactions");
}

function showReport() {
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
  submitBtn.disabled = true;

  const payload = {
    type: document.querySelector('input[name="type"]:checked').value,
    date: document.getElementById("date").value,
    category: document.getElementById("category").value,
    amount: Number(document.getElementById("amount").value),
    description: document.getElementById("description").value,
  };

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

    if (isMatchMonth) {
      if (item.type === "pemasukan") totalIncome += item.amount;
      else totalExpense += item.amount;
    }

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

  document.getElementById("total-income").innerText = formatRupiah(totalIncome);
  document.getElementById("total-expense").innerText =
    formatRupiah(totalExpense);
  document.getElementById("total-balance").innerText = formatRupiah(
    totalIncome - totalExpense,
  );

  cashflowChart.data.datasets[0].data = [totalIncome, totalExpense];
  cashflowChart.update();

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
reportMonthInput.addEventListener("change", renderReport);
document.getElementById("reset-filter-btn").addEventListener("click", () => {
  filterMonthInput.value = "";
  renderApp();
});
document.getElementById("reset-report-btn").addEventListener("click", () => {
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
  const monthlyData = getMonthlyTotals();

  if (monthlyData.length === 0) {
    reportList.innerHTML = `
      <div class="py-8 text-center text-slate-400 text-sm">
        Belum ada data transaksi untuk laporan bulanan.
      </div>
    `;
    document.getElementById("report-income").innerText = formatRupiah(0);
    document.getElementById("report-expense").innerText = formatRupiah(0);
    document.getElementById("report-balance").innerText = formatRupiah(0);
    return;
  }

  const selectedMonth = reportMonthInput.value || getCurrentYearMonth();
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
    const row = document.createElement("div");
    row.className = `p-3 rounded-xl border ${
      isSelected ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"
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
    reportList.appendChild(row);
  });
}

// Listener Real-Time Firestore Langsung ke Sub-collection
export async function listenToRealtimeData() {
  const currentUserId = await resolveCurrentUserId();
  const userTransactionsRef = getUserTransactionsRef(currentUserId);
  const q = query(userTransactionsRef, orderBy("date", "desc"));

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
