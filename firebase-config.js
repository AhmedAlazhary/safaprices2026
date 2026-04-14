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

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyARqSgfh78TqFQ2hhZaAtUaVQFqlPuRM3w",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "trialsafaprices2026.firebaseapp.com",
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://trialsafaprices2026-default-rtdb.firebaseio.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "trialsafaprices2026",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "trialsafaprices2026.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "177091434445",
  appId: process.env.FIREBASE_APP_ID || "1:177091434445:web:568b6ae3ba270a21d4d684"
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
