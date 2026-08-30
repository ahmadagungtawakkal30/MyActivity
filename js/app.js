import { db, transactionsRef } from "./firebase-config.js";
import {
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let allTransactions = [];

// Helper Format Rupiah
const formatRupiah = (num) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(num);

// Set Default Date Filter
const today = new Date();
document.getElementById("date").valueAsDate = today;

const currentYearMonth = today.toISOString().slice(0, 7);
const filterMonthInput = document.getElementById("filter-month");
filterMonthInput.value = currentYearMonth;

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

const btnDashDesktop = document.getElementById("nav-dashboard-desktop");
const btnTransDesktop = document.getElementById("nav-transactions-desktop");
const btnDashMobile = document.getElementById("nav-dashboard-mobile");
const btnTransMobile = document.getElementById("nav-transactions-mobile");

function showDashboard() {
  pageDashboard.classList.remove("hidden");
  pageTransactions.classList.add("hidden");

  btnDashDesktop.className =
    "px-5 py-2.5 rounded-lg text-sm font-semibold transition bg-white text-slate-900 shadow-sm";
  btnTransDesktop.className =
    "px-5 py-2.5 rounded-lg text-sm font-semibold transition text-slate-500 hover:text-slate-900";

  btnDashMobile.className = "flex flex-col items-center gap-1 text-blue-600";
  btnTransMobile.className = "flex flex-col items-center gap-1 text-slate-400";
}

function showTransactions() {
  pageTransactions.classList.remove("hidden");
  pageDashboard.classList.add("hidden");
  syncTransactionTypeSelection();

  btnTransDesktop.className =
    "px-5 py-2.5 rounded-lg text-sm font-semibold transition bg-white text-slate-900 shadow-sm";
  btnDashDesktop.className =
    "px-5 py-2.5 rounded-lg text-sm font-semibold transition text-slate-500 hover:text-slate-900";

  btnTransMobile.className = "flex flex-col items-center gap-1 text-blue-600";
  btnDashMobile.className = "flex flex-col items-center gap-1 text-slate-400";
}

btnDashDesktop.addEventListener("click", showDashboard);
btnTransDesktop.addEventListener("click", showTransactions);
btnDashMobile.addEventListener("click", showDashboard);
btnTransMobile.addEventListener("click", showTransactions);
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

// Submit Transaksi
document
  .getElementById("transaction-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("submit-btn");
    submitBtn.disabled = true;

    const payload = {
      type: document.querySelector('input[name="type"]:checked').value,
      date: document.getElementById("date").value,
      category: document.getElementById("category").value,
      amount: Number(document.getElementById("amount").value),
      description: document.getElementById("description").value,
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(transactionsRef, payload);
      document.getElementById("transaction-form").reset();
      document.getElementById("type-pengeluaran").checked = true;
      syncTransactionTypeSelection();
      document.getElementById("date").valueAsDate = new Date();
      showDashboard();
    } catch (err) {
      alert("Gagal menyimpan transaksi ke Cloud: " + err.message);
    } finally {
      submitBtn.disabled = false;
    }
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
      ? item.date.startsWith(selectedMonth)
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
        <button data-id="${item.id}" class="delete-btn text-slate-300 hover:text-rose-500 text-xs font-semibold p-1">Hapus</button>
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
        <button data-id="${item.id}" class="delete-btn text-[10px] text-slate-400 hover:text-rose-500">Hapus</button>
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

  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const docId = e.target.getAttribute("data-id");
      if (!docId) return;

      if (confirm("Hapus transaksi ini dari Cloud Database?")) {
        try {
          await deleteDoc(doc(db, "transactions", docId));
        } catch (err) {
          alert("Gagal menghapus transaksi: " + err.message);
        }
      }
    });
  });
}

filterMonthInput.addEventListener("change", renderApp);
document.getElementById("reset-filter-btn").addEventListener("click", () => {
  filterMonthInput.value = "";
  renderApp();
});

// Listener Real-Time Firestore
export function listenToRealtimeData() {
  const q = query(transactionsRef, orderBy("date", "desc"));

  onSnapshot(
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
    },
    (error) => {
      console.error("Gagal mengambil data dari Firebase:", error);
    },
  );
}
