// Public portal only: initialize Firestore without Auth or Realtime Database.
// Public reads are additionally restricted by firestore-rbac.rules to the active release.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getFirestore, collection, doc, getDoc, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyARqSgfh78TqFQ2hhZaAtUaVQFqlPuRM3w',
  authDomain: 'trialsafaprices2026.firebaseapp.com',
  projectId: 'trialsafaprices2026',
  appId: '1:177091434445:web:568b6ae3ba270a21d4d684'
}, 'safatrans-public-portal');

export const publicDb = getFirestore(app);
export const publicDoc = doc;
export const publicGetDoc = getDoc;
export const publicGetDocs = getDocs;
export const publicCollection = collection;
export const publicQuery = query;
export const publicOrderBy = orderBy;
