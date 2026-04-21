// Initial Data Setup for Inventory and Assets Management System
// Run this script once to populate initial data

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ⚠️ SECURITY WARNING: API key is exposed for development only
// In production, use environment variables instead
const firebaseConfig = {
  apiKey: "AIzaSyARqSgfh78TqFQ2hhZaAtUaVQFqlPuRM3w",
  authDomain: "trialsafaprices2026.firebaseapp.com",
  projectId: "trialsafaprices2026",
  storageBucket: "trialsafaprices2026.appspot.com",
  messagingSenderId: "177091434445",
  appId: "1:177091434445:web:568b6ae3ba270a21d4d684"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initial inventory items data
const inventoryItems = [
  // قطع غيار
  {
    name: "فلتر زيت محرك",
    categoryId: "قطع غيار",
    unit: "قطعة",
    quantity: 50,
    unitPrice: 45.00,
    location: "المخزن الرئيسي",
    status: "جديد"
  },
  {
    name: "فلتر هواء",
    categoryId: "قطع غيار",
    unit: "قطعة",
    quantity: 30,
    unitPrice: 25.00,
    location: "المخزن الرئيسي",
    status: "جديد"
  },
  {
    name: "بطارية سيارة",
    categoryId: "قطع غيار",
    unit: "قطعة",
    quantity: 20,
    unitPrice: 350.00,
    location: "المخزن الرئيسي",
    status: "جديد"
  },
  {
    name: "وسادات فرامل أمامية",
    categoryId: "قطع غيار",
    unit: "زوج",
    quantity: 15,
    unitPrice: 120.00,
    location: "المخزن الرئيسي",
    status: "جديد"
  },
  // زيوت
  {
    name: "زيت محرك 10W-40",
    categoryId: "زيوت",
    unit: "لتر",
    quantity: 100,
    unitPrice: 85.00,
    location: "المخزن الرئيسي",
    status: "جديد"
  },
  {
    name: "زيت محرك 5W-30",
    categoryId: "زيوت",
    unit: "لتر",
    quantity: 80,
    unitPrice: 95.00,
    location: "المخزن الرئيسي",
    status: "جديد"
  },
  {
    name: "زيت ناقل حركة",
    categoryId: "زيوت",
    unit: "لتر",
    quantity: 60,
    unitPrice: 110.00,
    location: "المخزن الرئيسي",
    status: "جديد"
  },
  // خردة
  {
    name: "إطارات مستعملة",
    categoryId: "خردة",
    unit: "قطعة",
    quantity: 25,
    unitPrice: 50.00,
    location: "مخزن الخردة",
    status: "خردة"
  },
  {
    name: "بطاريات تالفة",
    categoryId: "خردة",
    unit: "قطعة",
    quantity: 10,
    unitPrice: 30.00,
    location: "مخزن الخردة",
    status: "خردة"
  },
  {
    name: "فلترات مستعملة",
    categoryId: "خردة",
    unit: "قطعة",
    quantity: 40,
    unitPrice: 5.00,
    location: "مخزن الخردة",
    status: "خردة"
  }
];

// Initial assets data
const assets = [
  {
    type: "سيارة",
    plateNumber: "ق ج 1234",
    currentCounter: 45000,
    driver: "أحمد محمد",
    status: "نشط",
    value: 150000.00
  },
  {
    type: "سيارة",
    plateNumber: "ق ج 5678",
    currentCounter: 32000,
    driver: "محمد علي",
    status: "نشط",
    value: 120000.00
  },
  {
    type: "معدة",
    plateNumber: "",
    currentCounter: 1200,
    driver: "حسين سالم",
    status: "نشط",
    value: 45000.00
  },
  {
    type: "سيارة",
    plateNumber: "ق ج 9012",
    currentCounter: 67000,
    driver: "خالد أحمد",
    status: "صيانة",
    value: 95000.00
  }
];

// Initial lookups data
const lookups = {
  categories: ["قطع غيار", "زيوت", "خردة"],
  accountingItems: [
    "مصروفات وقود",
    "مصروفات صيانة",
    "مصروفات قطع غيار",
    "مصروفات زيوت",
    "مصروفات متنوعة",
    "مكافآت موظفين",
    "إيجار مقر",
    "فواتير كهرباء ومياه",
    "مصروفات نقل"
  ],
  units: ["قطعة", "زوج", "لتر", "كيلو", "متر"],
  locations: ["المخزن الرئيسي", "مخزن الخردة", "مخزن الإسكندرية", "مخزن الدخيلة"],
  assetTypes: ["سيارة", "معدة"],
  assetStatuses: ["نشط", "صيانة", "متوقف"],
  itemStatuses: ["جديد", "مستعمل", "خردة"]
};

// Function to initialize all data
async function initializeInventoryAssetsData() {
  try {
    console.log('Starting inventory and assets data initialization...');
    
    // Check if user is authenticated
    const user = auth.currentUser;
    if (!user) {
      console.error('User not authenticated');
      return;
    }
    
    // Initialize Items collection
    console.log('Initializing Items collection...');
    for (const item of inventoryItems) {
      const docRef = doc(collection(db, 'Items'));
      await setDoc(docRef, {
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log(`Added item: ${item.name}`);
    }
    
    // Initialize Assets collection
    console.log('Initializing Assets collection...');
    for (const asset of assets) {
      const docRef = doc(collection(db, 'Assets'));
      await setDoc(docRef, {
        ...asset,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log(`Added asset: ${asset.type} - ${asset.plateNumber || 'N/A'}`);
    }
    
    // Initialize Lookups collection
    console.log('Initializing Lookups collection...');
    for (const [key, value] of Object.entries(lookups)) {
      await setDoc(doc(db, 'Lookups', key), {
        items: value,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log(`Added lookup: ${key}`);
    }
    
    console.log('✅ Inventory and Assets data initialization completed successfully!');
    alert('تم تهيئة بيانات المخزن والأصول بنجاح!');
    
  } catch (error) {
    console.error('❌ Error initializing data:', error);
    alert('حدث خطأ أثناء تهيئة البيانات: ' + error.message);
  }
}

// Function to clear all data (for testing)
async function clearInventoryAssetsData() {
  try {
    console.log('Clearing inventory and assets data...');
    
    if (!confirm('هل أنت متأكد من حذف جميع بيانات المخزن والأصول؟ هذا الإجراء لا يمكن التراجع عنه.')) {
      return;
    }
    
    // Clear Items collection
    const itemsSnapshot = await getDocs(collection(db, 'Items'));
    for (const doc of itemsSnapshot.docs) {
      await deleteDoc(doc.ref);
    }
    
    // Clear Assets collection
    const assetsSnapshot = await getDocs(collection(db, 'Assets'));
    for (const doc of assetsSnapshot.docs) {
      await deleteDoc(doc.ref);
    }
    
    // Clear Lookups collection
    const lookupsSnapshot = await getDocs(collection(db, 'Lookups'));
    for (const doc of lookupsSnapshot.docs) {
      await deleteDoc(doc.ref);
    }
    
    console.log('✅ All inventory and assets data cleared successfully!');
    alert('تم حذف جميع بيانات المخزن والأصول بنجاح!');
    
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    alert('حدث خطأ أثناء حذف البيانات: ' + error.message);
  }
}

// Export functions for use in HTML
window.initializeInventoryAssetsData = initializeInventoryAssetsData;
window.clearInventoryAssetsData = clearInventoryAssetsData;

// Auto-initialize if running directly
if (window.location.pathname.includes('init-inventory-assets-data.js')) {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('Inventory and Assets Data Initialization Script Loaded');
    console.log('Available functions:');
    console.log('- initializeInventoryAssetsData(): Initialize all data');
    console.log('- clearInventoryAssetsData(): Clear all data');
  });
}
