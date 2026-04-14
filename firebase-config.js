// Firebase Configuration - Modular SDK v9
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { 
  getFirestore, 
  serverTimestamp, 
  runTransaction,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  limit,
  setDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// ⚠️ SECURITY WARNING: API key is exposed for development only
// In production, use environment variables instead
const firebaseConfig = {
  apiKey: "AIzaSyARqSgfh78TqFQ2hhZaAtUaVQFqlPuRM3w",
  authDomain: "trialsafaprices2026.firebaseapp.com",
  databaseURL: "https://trialsafaprices2026-default-rtdb.firebaseio.com",
  projectId: "trialsafaprices2026",
  storageBucket: "trialsafaprices2026.appspot.com",
  messagingSenderId: "177091434445",
  appId: "1:177091434445:web:568b6ae3ba270a21d4d684"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
export { 
  serverTimestamp, 
  runTransaction,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  limit,
  setDoc,
  writeBatch
};

// Export app for legacy compatibility
export default app;
