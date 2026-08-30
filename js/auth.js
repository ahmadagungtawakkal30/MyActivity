import {
  resolveCurrentUserId,
  resolveUserIdByUsername,
  getUserAuthSettingRef,
  setCurrentUserId,
} from "./firebase-config.js";
import {
  getDoc,
  setDoc,
  getDocs,
  collection,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { listenToRealtimeData } from "./app.js";

const pinModal = document.getElementById("pin-modal");
const usernameInput = document.getElementById("username-input");
const pinInput = document.getElementById("pin-input");
const pinForm = document.getElementById("pin-form");
const pinError = document.getElementById("pin-error");
const pinCancelBtn = document.getElementById("pin-cancel-btn");
const usernameField = document.getElementById("username-field");

let isChangingPin = false;

function clearAuthSession() {
  sessionStorage.removeItem("app_unlocked");
  sessionStorage.removeItem("current_user_id");
  localStorage.removeItem("current_user_id");

  document.cookie.split(";").forEach((cookie) => {
    const name = cookie.trim().split("=")[0];
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    }
  });
}

function hideMainPages() {
  ["page-dashboard", "page-transactions", "page-report"].forEach((pageId) => {
    const page = document.getElementById(pageId);
    if (page) page.classList.add("hidden");
  });
}

function showDashboardOnly() {
  hideMainPages();
  const dashboard = document.getElementById("page-dashboard");
  const transactions = document.getElementById("page-transactions");
  const report = document.getElementById("page-report");
  if (dashboard) dashboard.classList.remove("hidden");
  if (transactions) transactions.classList.add("hidden");
  if (report) report.classList.add("hidden");
}

function resetPinFlow() {
  isChangingPin = false;
  usernameField.classList.remove("hidden");
  document.getElementById("pin-title").innerText = "Masukkan User & PIN";
  document.getElementById("pin-sub").innerText =
    "Masukkan nama user dan PIN beserta simbol awalan hari ini.";
  document.getElementById("pin-submit-btn").innerText = "Buka Dashboard";
  pinError.classList.add("hidden");
  usernameInput.value = "";
  pinInput.value = "";
  pinModal.classList.add("hidden");
  hideMainPages();
}

function openPinModal() {
  hideMainPages();
  pinModal.classList.remove("hidden");
}

function closePinModal() {
  resetPinFlow();
}

const defaultDayPrefixes = {
  0: "?", // Minggu
  1: "*", // Senin
  2: '"', // Selasa
  3: "'", // Rabu
  4: ":", // Kamis
  5: ";", // Jumat
  6: "!", // Sabtu
};

// Ambil Konfigurasi Auth Murni dari Sub-collection Cloud Firestore
async function getAuthConfigFromCloud(userId = null) {
  try {
    const activeUserId = userId || (await resolveCurrentUserId());
    const authRef = getUserAuthSettingRef(activeUserId);
    const docSnap = await getDoc(authRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        userId: activeUserId,
        basePin: data.basePin || "",
        dayPrefixes: data.dayPrefixes || defaultDayPrefixes,
      };
    } else {
      return {
        userId: activeUserId,
        basePin: "",
        dayPrefixes: defaultDayPrefixes,
      };
    }
  } catch (err) {
    console.error("Gagal mengambil data Auth dari Cloud:", err);
    return {
      userId: userId || (await resolveCurrentUserId()),
      basePin: "",
      dayPrefixes: defaultDayPrefixes,
    };
  }
}

async function initializeAuthState() {
  const unlocked = sessionStorage.getItem("app_unlocked") === "true";
  const storedUserId = sessionStorage.getItem("current_user_id");

  if (!unlocked || !storedUserId) {
    hideMainPages();
    pinModal.classList.remove("hidden");
    return;
  }

  try {
    const authRef = getUserAuthSettingRef(storedUserId);
    const authSnap = await getDoc(authRef);

    if (!authSnap.exists()) {
      clearAuthSession();
      hideMainPages();
      pinModal.classList.remove("hidden");
      return;
    }

    pinModal.classList.add("hidden");
    showDashboardOnly();
    listenToRealtimeData();
  } catch (error) {
    console.error("Auth session tidak valid:", error);
    clearAuthSession();
    hideMainPages();
    pinModal.classList.remove("hidden");
  }
}

initializeAuthState();

pinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const enteredPin = pinInput.value.trim();
  const submitBtn = document.getElementById("pin-submit-btn");

  submitBtn.disabled = true;
  submitBtn.innerText = "Memverifikasi...";

  if (isChangingPin) {
    if (enteredPin.length < 4) {
      pinError.innerText = "PIN dasar minimal 4 digit!";
      pinError.classList.remove("hidden");
      submitBtn.disabled = false;
      submitBtn.innerText = "Simpan PIN Baru";
      return;
    }

    try {
      const activeUserId = await resolveCurrentUserId();
      const authRef = getUserAuthSettingRef(activeUserId);
      await setDoc(authRef, { basePin: enteredPin }, { merge: true });
      alert("PIN dasar berhasil diperbarui di Database Cloud!");
      isChangingPin = false;
      usernameField.classList.remove("hidden");
      document.getElementById("pin-title").innerText = "Masukkan User & PIN";
      document.getElementById("pin-sub").innerText =
        "Masukkan nama user dan PIN beserta simbol awalan hari ini.";
      document.getElementById("pin-submit-btn").innerText = "Buka Dashboard";
      pinModal.classList.add("hidden");
      usernameInput.value = "";
      pinInput.value = "";
    } catch (err) {
      alert("Gagal memperbarui PIN di DB: " + err.message);
    } finally {
      submitBtn.disabled = false;
    }
    return;
  }

  if (!username) {
    pinError.innerText = "Nama user wajib diisi!";
    pinError.classList.remove("hidden");
    submitBtn.disabled = false;
    submitBtn.innerText = "Buka Dashboard";
    return;
  }

  const selectedUserId = await resolveUserIdByUsername(username);
  if (!selectedUserId) {
    pinError.innerText =
      "Nama user tidak ditemukan. Cek kembali username Anda.";
    pinError.classList.remove("hidden");
    submitBtn.disabled = false;
    submitBtn.innerText = "Buka Dashboard";
    return;
  }

  setCurrentUserId(selectedUserId);
  const authConfig = await getAuthConfigFromCloud(selectedUserId);
  const todayIndex = new Date().getDay().toString();
  const todayPrefix = authConfig.dayPrefixes[todayIndex] || "";
  const expectedPin = todayPrefix + authConfig.basePin;

  if (enteredPin === expectedPin) {
    sessionStorage.setItem("app_unlocked", "true");
    sessionStorage.setItem("current_user_id", selectedUserId);
    pinModal.classList.add("hidden");
    pinError.classList.add("hidden");
    usernameInput.value = "";
    pinInput.value = "";
    showDashboardOnly();
    listenToRealtimeData();
  } else {
    pinError.innerText = "Nama user atau PIN salah untuk hari ini!";
    pinError.classList.remove("hidden");
    pinInput.value = "";
  }

  submitBtn.disabled = false;
  submitBtn.innerText = "Buka Dashboard";
});

document.getElementById("lock-btn").addEventListener("click", () => {
  clearAuthSession();
  isChangingPin = false;
  usernameField.classList.remove("hidden");
  document.getElementById("pin-title").innerText = "Masukkan User & PIN";
  document.getElementById("pin-sub").innerText =
    "Masukkan nama user dan PIN beserta simbol awalan hari ini.";
  document.getElementById("pin-submit-btn").innerText = "Buka Dashboard";
  hideMainPages();
  pinError.classList.add("hidden");
  pinInput.value = "";
  usernameInput.value = "";
  pinModal.classList.remove("hidden");
});

pinCancelBtn.addEventListener("click", () => {
  if (isChangingPin) {
    const confirmModal = document.getElementById("confirm-modal");
    const confirmTitle = document.getElementById("confirm-title");
    const confirmMessage = document.getElementById("confirm-message");
    const confirmYesBtn = document.getElementById("confirm-yes-btn");
    const confirmCancelBtn = document.getElementById("confirm-cancel-btn");

    confirmTitle.textContent = "Batal ganti PIN?";
    confirmMessage.textContent =
      "PIN baru belum disimpan. Anda yakin ingin menutup popup ini?";
    confirmYesBtn.textContent = "Ya, batal";
    confirmYesBtn.onclick = () => {
      closePinModal();
      confirmModal.classList.add("hidden");
      confirmModal.classList.remove("flex");
    };
    confirmCancelBtn.onclick = () => {
      confirmModal.classList.add("hidden");
      confirmModal.classList.remove("flex");
      openPinModal();
    };
    document.getElementById("confirm-close-btn").onclick = () => {
      confirmModal.classList.add("hidden");
      confirmModal.classList.remove("flex");
      openPinModal();
    };
    confirmModal.addEventListener(
      "click",
      (event) => {
        if (event.target === confirmModal) {
          confirmModal.classList.add("hidden");
          confirmModal.classList.remove("flex");
          openPinModal();
        }
      },
      { once: true },
    );
    confirmModal.classList.remove("hidden");
    confirmModal.classList.add("flex");
    return;
  }

  closePinModal();
});

pinModal.addEventListener("click", (event) => {
  if (event.target === pinModal) {
    closePinModal();
  }
});

document.getElementById("change-pin-btn").addEventListener("click", () => {
  isChangingPin = true;
  usernameField.classList.add("hidden");
  document.getElementById("pin-title").innerText = "Ganti PIN Dasar Baru";
  document.getElementById("pin-sub").innerText =
    "Masukkan PIN rahasia baru (akan disimpan di Cloud Firestore).";
  document.getElementById("pin-submit-btn").innerText = "Simpan PIN Baru";
  pinError.classList.add("hidden");
  pinInput.value = "";
  openPinModal();
});
