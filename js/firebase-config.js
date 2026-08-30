import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
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
export const transactionsRef = collection(db, "transactions");
export const authSettingDocRef = doc(db, "settings", "auth");
