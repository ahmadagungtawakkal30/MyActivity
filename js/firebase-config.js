import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🔴 CONFIG FIREBASE 🔴
const firebaseConfig = {
  apiKey: "AIzaSyAtjUAyUtmSh55eE5nRRhGl6za_s9HKlkE",
  authDomain: "myactivity-b4dcb.firebaseapp.com",
  databaseURL:
    "https://myactivity-b4dcb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "myactivity-b4dcb",
  storageBucket: "myactivity-b4dcb.firebasestorage.app",
  messagingSenderId: "1035168536876",
  appId: "1:1035168536876:web:0bec30623f64ebd6267489",
  measurementId: "G-FWSML6HNWH",
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const getStoredUserId = () => {
  try {
    const stored = sessionStorage.getItem("current_user_id");
    return stored && stored.trim() ? stored.trim() : "";
  } catch (error) {
    return "";
  }
};

export let CURRENT_USER_ID = getStoredUserId();

export const setCurrentUserId = (uid) => {
  const safeUid = uid || "";
  CURRENT_USER_ID = safeUid;
  try {
    if (safeUid) {
      sessionStorage.setItem("current_user_id", safeUid);
    } else {
      sessionStorage.removeItem("current_user_id");
    }
  } catch (error) {
    // ignore storage issues
  }
  return safeUid;
};

export async function resolveCurrentUserId() {
  const storedUserId = getStoredUserId();

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    if (!usersSnap.empty) {
      const validIds = usersSnap.docs.map((docSnap) => docSnap.id);
      if (storedUserId && validIds.includes(storedUserId)) {
        setCurrentUserId(storedUserId);
        return storedUserId;
      }

      const firstUserId = usersSnap.docs[0].id;
      setCurrentUserId(firstUserId);
      return firstUserId;
    }
  } catch (error) {
    console.warn("Tidak ada user yang ditemukan di collection users:", error);
  }

  if (storedUserId) {
    setCurrentUserId(storedUserId);
    return storedUserId;
  }

  const fallbackUserId = "user_1";
  setCurrentUserId(fallbackUserId);
  return fallbackUserId;
}

export async function resolveUserIdByUsername(username) {
  const normalized = String(username || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    for (const docSnap of usersSnap.docs) {
      const data = docSnap.data() || {};
      const docId = String(docSnap.id || "")
        .trim()
        .toLowerCase();
      const docUsername = String(data.username || data.name || "")
        .trim()
        .toLowerCase();
      if (docId === normalized || docUsername === normalized) {
        setCurrentUserId(docSnap.id);
        return docSnap.id;
      }
    }
  } catch (error) {
    console.warn("Gagal mencari user berdasarkan username:", error);
  }

  return null;
}

export const getUserAuthSettingRef = (uid = CURRENT_USER_ID) =>
  doc(db, "users", uid, "settings", "auth");

export const getUserTransactionsRef = (uid = CURRENT_USER_ID) =>
  collection(db, "users", uid, "transactions");

export const authSettingDocRef = () => getUserAuthSettingRef(CURRENT_USER_ID);
export const transactionsRef = () => getUserTransactionsRef(CURRENT_USER_ID);
