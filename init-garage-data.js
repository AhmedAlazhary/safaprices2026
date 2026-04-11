// Initialize Garage System Data
import { 
  auth, 
  db, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc,
  getDocs,
  serverTimestamp 
} from './firebase-config.js';

// Initial warehouses data for garage
const warehouses = [
  {
    name: "Main Warehouse",
    location: "Main Building",
    description: "Main storage for all spare parts and supplies"
  },
  {
    name: "Scrap Yard",
    location: "Back Area",
    description: "Storage for scrap and used parts"
  }
];

// Initial products data for garage
const products = [
  // Spare Parts
  {
    name: "Brake Pads Front",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 150,
    minStock: 20
  },
  {
    name: "Brake Pads Rear",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 120,
    minStock: 20
  },
  {
    name: "Oil Filter",
    unit: "piece",
    categoryId: "oils_filters",
    purchasePrice: 45,
    minStock: 50
  },
  {
    name: "Air Filter",
    unit: "piece",
    categoryId: "oils_filters",
    purchasePrice: 35,
    minStock: 40
  },
  {
    name: "Fuel Filter",
    unit: "piece",
    categoryId: "oils_filters",
    purchasePrice: 55,
    minStock: 30
  },
  {
    name: "Engine Oil 5W-30",
    unit: "liter",
    categoryId: "oils_filters",
    purchasePrice: 85,
    minStock: 30
  },
  {
    name: "Engine Oil 10W-40",
    unit: "liter",
    categoryId: "oils_filters",
    purchasePrice: 75,
    minStock: 25
  },
  {
    name: "Transmission Oil",
    unit: "liter",
    categoryId: "oils_filters",
    purchasePrice: 95,
    minStock: 25
  },
  {
    name: "Differential Oil",
    unit: "liter",
    categoryId: "oils_filters",
    purchasePrice: 105,
    minStock: 20
  },
  {
    name: "Car Tire 175/65 R14",
    unit: "piece",
    categoryId: "tires",
    purchasePrice: 450,
    minStock: 15
  },
  {
    name: "Car Tire 185/65 R15",
    unit: "piece",
    categoryId: "tires",
    purchasePrice: 550,
    minStock: 12
  },
  {
    name: "Car Tire 195/65 R16",
    unit: "piece",
    categoryId: "tires",
    purchasePrice: 650,
    minStock: 10
  },
  {
    name: "Battery 12V 45Ah",
    unit: "piece",
    categoryId: "batteries",
    purchasePrice: 350,
    minStock: 10
  },
  {
    name: "Battery 12V 60Ah",
    unit: "piece",
    categoryId: "batteries",
    purchasePrice: 450,
    minStock: 8
  },
  {
    name: "Battery 12V 75Ah",
    unit: "piece",
    categoryId: "batteries",
    purchasePrice: 550,
    minStock: 6
  },
  {
    name: "Spark Plug",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 25,
    minStock: 100
  },
  {
    name: "Headlight Bulb H4",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 35,
    minStock: 60
  },
  {
    name: "Alternator Belt",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 85,
    minStock: 25
  },
  {
    name: "Timing Belt",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 150,
    minStock: 15
  },
  {
    name: "Clutch Plate",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 250,
    minStock: 15
  },
  {
    name: "Disc Brake Front",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 180,
    minStock: 20
  },
  {
    name: "Disc Brake Rear",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 160,
    minStock: 20
  },
  {
    name: "Shock Absorber Front",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 220,
    minStock: 12
  },
  {
    name: "Shock Absorber Rear",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 200,
    minStock: 12
  },
  {
    name: "Radiator Hose",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 65,
    minStock: 30
  },
  {
    name: "Water Pump",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 180,
    minStock: 10
  },
  {
    name: "Thermostat",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 45,
    minStock: 20
  },
  {
    name: "Radiator Fan",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 280,
    minStock: 8
  },
  {
    name: "Fuel Pump",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 320,
    minStock: 6
  },
  {
    name: "Starter Motor",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 450,
    minStock: 5
  },
  {
    name: "Alternator",
    unit: "piece",
    categoryId: "spare_parts",
    purchasePrice: 550,
    minStock: 4
  },
  // Scrap & Used Items
  {
    name: "Used Brake Pads",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    minStock: 0
  },
  {
    name: "Used Oil Filter",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    minStock: 0
  },
  {
    name: "Used Air Filter",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    minStock: 0
  },
  {
    name: "Used Tire",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    minStock: 0
  },
  {
    name: "Used Battery",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    minStock: 0
  },
  {
    name: "Used Spark Plug",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    minStock: 0
  },
  {
    name: "Used Belt",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    minStock: 0
  },
  {
    name: "Used Shock Absorber",
    unit: "piece",
    categoryId: "scrap_used",
    purchasePrice: 0,
    minStock: 0
  }
];

// Function to initialize all data
async function initializeGarageData() {
  try {
    console.log('Starting garage data initialization...');
    
    // Check if user is authenticated
    if (!auth.currentUser) {
      console.error('User not authenticated. Please login first.');
      alert('Please login first before initializing data.');
      return;
    }
    
    // Initialize warehouses
    console.log('Creating warehouses...');
    for (const warehouse of warehouses) {
      const warehouseRef = doc(collection(db, 'warehouses'));
      await setDoc(warehouseRef, {
        ...warehouse,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid
      });
      console.log(`Created warehouse: ${warehouse.name}`);
    }
    
    // Initialize products
    console.log('Creating products...');
    for (const product of products) {
      const productRef = doc(collection(db, 'products'));
      await setDoc(productRef, {
        ...product,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
        updatedAt: serverTimestamp()
      });
      console.log(`Created product: ${product.name}`);
    }
    
    // Initialize initial stock balances
    console.log('Creating initial stock balances...');
    const warehouseSnapshot = await getDocs(collection(db, 'warehouses'));
    const productSnapshot = await getDocs(collection(db, 'products'));
    
    const warehousesList = warehouseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const productsList = productSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    for (const product of productsList) {
      for (const warehouse of warehousesList) {
        // Skip scrap items for initial stock
        if (product.categoryId === 'scrap_used') {
          continue;
        }
        
        // Add initial stock for main warehouse only
        if (warehouse.name === 'Main Warehouse') {
          const stockId = `${product.id}_${warehouse.id}`;
          const stockRef = doc(collection(db, 'stock_balances'), stockId);
          
          // Set initial quantities based on product type
          let initialQuantity = 0;
          if (product.categoryId === 'spare_parts') {
            initialQuantity = Math.floor(Math.random() * 50) + 20; // 20-70 pieces
          } else if (product.categoryId === 'oils_filters') {
            initialQuantity = Math.floor(Math.random() * 30) + 15; // 15-45 units
          } else if (product.categoryId === 'tires') {
            initialQuantity = Math.floor(Math.random() * 20) + 10; // 10-30 pieces
          } else if (product.categoryId === 'batteries') {
            initialQuantity = Math.floor(Math.random() * 15) + 5; // 5-20 pieces
          }
          
          await setDoc(stockRef, {
            productId: product.id,
            warehouseId: warehouse.id,
            quantity: initialQuantity,
            avgCost: product.purchasePrice,
            updatedAt: serverTimestamp()
          });
          
          console.log(`Set initial stock for ${product.name}: ${initialQuantity} units`);
        }
      }
    }
    
    console.log('Garage data initialization completed successfully!');
    alert('Database initialized successfully! The system is now ready for use.');
    
  } catch (error) {
    console.error('Error initializing garage data:', error);
    alert('Error initializing data: ' + error.message);
  }
}

// Function to clear all data (for testing purposes)
async function clearAllData() {
  if (!confirm('Are you sure you want to delete ALL data? This action cannot be undone!')) {
    return;
  }
  
  try {
    console.log('Clearing all data...');
    
    // Clear all collections
    const collections = ['products', 'warehouses', 'stock_balances', 'stock_movements', 'dispenses', 'dispense_items', 'scrap_sales'];
    
    for (const collectionName of collections) {
      const snapshot = await getDocs(collection(db, collectionName));
      
      for (const doc of snapshot.docs) {
        await deleteDoc(doc.ref);
      }
      
      console.log(`Cleared collection: ${collectionName}`);
    }
    
    console.log('All data cleared successfully!');
    alert('All data has been cleared. You can now initialize fresh data.');
    
  } catch (error) {
    console.error('Error clearing data:', error);
    alert('Error clearing data: ' + error.message);
  }
}

// Auto-initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
  console.log('Garage data initialization script loaded');
  
  // Add buttons to the page for manual control
  const controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: white;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    direction: ltr;
  `;
  
  controlsDiv.innerHTML = `
    <h4 style="margin: 0 0 10px 0; color: #2c3e50;">Database Controls</h4>
    <button onclick="initializeGarageData()" style="display: block; width: 100%; margin: 5px 0; padding: 8px 12px; background: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer;">Initialize Data</button>
    <button onclick="clearAllData()" style="display: block; width: 100%; margin: 5px 0; padding: 8px 12px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;">Clear All Data</button>
  `;
  
  document.body.appendChild(controlsDiv);
});

// Export functions for manual use
window.initializeGarageData = initializeGarageData;
window.clearAllData = clearAllData;
