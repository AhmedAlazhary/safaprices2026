// Initial Data Setup for Inventory Management System
// Run this script once to populate initial data

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initial warehouses data
const warehouses = [
  { name: "المخزن الرئيسي" },
  { name: "مخزن الإسكندرية" },
  { name: "مخزن الدخيلة" },
  { name: "مخزن المواد الخام" }
];

// Initial customers and suppliers data
const customersSuppliers = [
  { name: "عميل نوعي", type: "customer" },
  { name: "شركة المقاولون العرب", type: "customer" },
  { name: "شركة المطورون العقاريون", type: "customer" },
  { name: "مورد الأسمنت الوطني", type: "supplier" },
  { name: "شركة الصلب العربية", type: "supplier" },
  { name: "مورد الأخشاب المستوردة", type: "supplier" }
];

// Initial products data for garage
const products = [
  {
    name: "Brake Pads",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 150,
    salePrice: 200,
    minStock: 20
  },
  {
    name: "Oil Filter",
    unit: "piece",
    categoryId: "oils_filters",
    purchasePrice: 45,
    salePrice: 65,
    minStock: 50
  },
  {
    name: "Air Filter",
    unit: "piece",
    categoryId: "oils_filters",
    purchasePrice: 35,
    salePrice: 50,
    minStock: 40
  },
  {
    name: "Engine Oil 5W-30",
    unit: "liter",
    categoryId: "oils_filters",
    purchasePrice: 85,
    salePrice: 120,
    minStock: 30
  },
  {
    name: "Transmission Oil",
    unit: "liter",
    categoryId: "oils_filters",
    purchasePrice: 95,
    salePrice: 140,
    minStock: 25
  },
  {
    name: "Car Tire 175/65 R14",
    unit: "piece",
    categoryId: "tires",
    purchasePrice: 450,
    salePrice: 600,
    minStock: 15
  },
  {
    name: "Car Tire 185/65 R15",
    unit: "piece",
    categoryId: "tires",
    purchasePrice: 550,
    salePrice: 750,
    minStock: 12
  },
  {
    name: "Battery 12V 45Ah",
    unit: "piece",
    categoryId: "batteries",
    purchasePrice: 350,
    salePrice: 500,
    minStock: 10
  },
  {
    name: "Battery 12V 60Ah",
    unit: "piece",
    categoryId: "batteries",
    purchasePrice: 450,
    salePrice: 650,
    minStock: 8
  },
  {
    name: "Spark Plug",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 25,
    salePrice: 40,
    minStock: 100
  },
  {
    name: "Headlight Bulb",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 35,
    salePrice: 55,
    minStock: 60
  },
  {
    name: "Alternator Belt",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 85,
    salePrice: 120,
    minStock: 25
  },
  {
    name: "Clutch Plate",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 250,
    salePrice: 350,
    minStock: 15
  },
  {
    name: "Disc Brake",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 180,
    salePrice: 280,
    minStock: 20
  },
  {
    name: "Used Brake Pads",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    salePrice: 0,
    minStock: 0
  },
  {
    name: "Used Oil Filter",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    salePrice: 0,
    minStock: 0
  },
  {
    name: "Used Tire",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    salePrice: 0,
    minStock: 0
  },
  {
    name: "Used Battery",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    salePrice: 0,
    minStock: 0
  }
];

// Function to initialize all data
async function initializeData() {
  try {
    console.log('Starting data initialization...');
    
    // Initialize warehouses
    console.log('Creating warehouses...');
    for (const warehouse of warehouses) {
      const docRef = doc(collection(db, 'warehouses'));
      await setDoc(docRef, {
        ...warehouse,
        createdAt: serverTimestamp()
      });
      console.log(`Created warehouse: ${warehouse.name}`);
    }
    
    // Initialize customers and suppliers
    console.log('Creating customers and suppliers...');
    for (const cs of customersSuppliers) {
      const docRef = doc(collection(db, 'customers_suppliers'));
      await setDoc(docRef, {
        ...cs,
        createdAt: serverTimestamp()
      });
      console.log(`Created ${cs.type}: ${cs.name}`);
    }
    
    // Initialize products
    console.log('Creating products...');
    for (const product of products) {
      const docRef = doc(collection(db, 'products'));
      await setDoc(docRef, {
        ...product,
        createdAt: serverTimestamp()
      });
      console.log(`Created product: ${product.name}`);
    }
    
    console.log('Data initialization completed successfully!');
    console.log('Please refresh your application to see the new data.');
    
  } catch (error) {
    console.error('Error initializing data:', error);
  }
}

// Function to create sample stock balances
async function createSampleStockBalances() {
  try {
    console.log('Creating sample stock balances...');
    
    // Get all warehouses and products
    const warehousesSnapshot = await getDocs(collection(db, 'warehouses'));
    const productsSnapshot = await getDocs(collection(db, 'products'));
    
    const warehousesList = warehousesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const productsList = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Create stock balances for main warehouse only
    const mainWarehouse = warehousesList.find(w => w.name === "المخزن الرئيسي");
    
    if (mainWarehouse) {
      for (const product of productsList) {
        const stockId = `${product.id}_${mainWarehouse.id}`;
        const stockRef = doc(db, 'stock_balances', stockId);
        
        // Random initial quantities
        const initialQuantity = Math.floor(Math.random() * 200) + 50;
        
        await setDoc(stockRef, {
          productId: product.id,
          warehouseId: mainWarehouse.id,
          quantity: initialQuantity,
          avgCost: product.purchasePrice,
          updatedAt: serverTimestamp()
        });
        
        console.log(`Created stock balance for ${product.name}: ${initialQuantity} units`);
      }
    }
    
    console.log('Sample stock balances created successfully!');
    
  } catch (error) {
    console.error('Error creating stock balances:', error);
  }
}

// Function to check if data already exists
async function checkDataExists() {
  try {
    const warehousesSnapshot = await getDocs(collection(db, 'warehouses'));
    const productsSnapshot = await getDocs(collection(db, 'products'));
    
    return {
      warehouses: warehousesSnapshot.size > 0,
      products: productsSnapshot.size > 0
    };
  } catch (error) {
    console.error('Error checking data existence:', error);
    return { warehouses: false, products: false };
  }
}

// Main initialization function
async function runInitialization() {
  const dataExists = await checkDataExists();
  
  if (dataExists.warehouses || dataExists.products) {
    console.log('Data already exists. Skipping initialization.');
    console.log('Warehouses:', dataExists.warehouses ? 'Yes' : 'No');
    console.log('Products:', dataExists.products ? 'Yes' : 'No');
    return;
  }
  
  console.log('No existing data found. Starting initialization...');
  
  await initializeData();
  
  // Wait a bit then create stock balances
  setTimeout(async () => {
    await createSampleStockBalances();
  }, 2000);
}

// Auto-run initialization
runInitialization();

// Export functions for manual use
window.initializeInventoryData = initializeData;
window.createSampleStockBalances = createSampleStockBalances;
window.checkDataExists = checkDataExists;
