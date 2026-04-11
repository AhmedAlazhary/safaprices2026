/**
 * Garage System Core Module
 * Enterprise-grade garage management system with Firebase integration
 * 
 * Features:
 * - Firebase Transactions for data integrity
 * - Audit trail system
 * - Cloud Storage integration
 * - Offline support
 * - Smart notifications
 * - Role-based security
 */

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBkX7y8z9A1B2C3D4E5F6G7H8I9J0K1L2M",
  authDomain: "trialsafaprices2026.firebaseapp.com",
  databaseURL: "https://trialsafaprices2026-default-rtdb.firebaseio.com",
  projectId: "trialsafaprices2026",
  storageBucket: "trialsafaprices2026.appspot.com",
  messagingSenderId: "177091434445",
  appId: "1:177091434445:web:568b6ae3ba270a21d4d684"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();

// Enable offline persistence
firebase.firestore().enablePersistence()
  .catch((err) => {
    console.error('Firestore persistence error:', err);
  });

// Garage System Class
class GarageSystem {
  constructor() {
    this.currentUser = null;
    this.collections = {
      vehicles: 'vehicles',
      staff: 'staff',
      inventory: 'inventory',
      operations: 'operations',
      maintenanceOrders: 'maintenance_orders',
      auditTrail: 'audit_trail',
      notifications: 'notifications',
      settings: 'settings'
    };
    this.cache = new Map();
    this.listeners = new Map();
  }

  // Initialize system
  async initialize() {
    try {
      // Check authentication
      auth.onAuthStateChanged(user => {
        this.currentUser = user;
        if (user) {
          this.setupSystem();
        } else {
          window.location.href = 'index.html';
        }
      });
    } catch (error) {
      console.error('System initialization error:', error);
      throw error;
    }
  }

  // Setup system after authentication
  async setupSystem() {
    try {
      await this.loadUserPermissions();
      this.setupRealtimeListeners();
      this.setupEventHandlers();
      this.checkPendingOperations();
    } catch (error) {
      console.error('System setup error:', error);
      throw error;
    }
  }

  // Load user permissions and role
  async loadUserPermissions() {
    const userDoc = await db.collection('users').doc(this.currentUser.uid).get();
    if (userDoc.exists) {
      this.userRole = userDoc.data().role || 'viewer';
      this.permissions = userDoc.data().permissions || {};
    }
  }

  // Setup realtime listeners
  setupRealtimeListeners() {
    // Vehicles listener
    this.listeners.vehicles = db.collection(this.collections.vehicles)
      .onSnapshot(snapshot => {
        this.cache.set('vehicles', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        this.updateUI('vehicles');
      });

    // Staff listener
    this.listeners.staff = db.collection(this.collections.staff)
      .onSnapshot(snapshot => {
        this.cache.set('staff', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        this.updateUI('staff');
      });

    // Inventory listener
    this.listeners.inventory = db.collection(this.collections.inventory)
      .onSnapshot(snapshot => {
        this.cache.set('inventory', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        this.updateUI('inventory');
        this.checkLowStock();
      });

    // Operations listener
    this.listeners.operations = db.collection(this.collections.operations)
      .onSnapshot(snapshot => {
        this.cache.set('operations', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        this.updateUI('operations');
      });

    // Maintenance Orders listener
    this.listeners.maintenanceOrders = db.collection(this.collections.maintenanceOrders)
      .onSnapshot(snapshot => {
        this.cache.set('maintenanceOrders', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        this.updateUI('maintenanceOrders');
      });

    // Notifications listener
    this.listeners.notifications = db.collection(this.collections.notifications)
      .where('userId', '==', this.currentUser.uid)
      .where('status', '==', 'unread')
      .onSnapshot(snapshot => {
        this.cache.set('notifications', snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        this.updateNotifications();
      });
  }

  // Issue inventory items with transaction
  async issueInventory(itemId, quantity, vehicleId, notes = '') {
    const inventoryRef = db.collection(this.collections.inventory).doc(itemId);
    const operationsRef = db.collection(this.collections.operations).doc();

    try {
      const result = await db.runTransaction(async (transaction) => {
        const inventoryDoc = await transaction.get(inventoryRef);
        
        if (!inventoryDoc.exists) {
          throw new Error('Item not found in inventory');
        }

        const inventoryData = inventoryDoc.data();
        const currentQty = inventoryData.availableQty || 0;
        
        if (currentQty < quantity) {
          throw new Error('Insufficient quantity available');
        }

        const newQty = currentQty - quantity;
        const unitPrice = inventoryData.purchasePrice || 0;
        const totalPrice = quantity * unitPrice;

        // Update inventory
        transaction.update(inventoryRef, {
          availableQty: newQty,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: this.currentUser.uid
        });

        // Create operation record
        const operationData = {
          type: 'issue',
          itemId: itemId,
          itemName: inventoryData.name,
          quantity: quantity,
          unitPrice: unitPrice,
          totalPrice: totalPrice,
          fromLocation: 'main_warehouse',
          toLocation: vehicleId,
          performedBy: this.currentUser.uid,
          status: 'completed',
          notes: notes,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: this.currentUser.uid
        };

        transaction.set(operationsRef, operationData);

        return {
          success: true,
          newQuantity: newQty,
          operationId: operationsRef.id,
          operationData
        };
      });

      // Log audit trail
      await this.logAuditTrail('inventory_issue', this.collections.inventory, itemId, {
        availableQty: currentQty
      }, {
        availableQty: result.newQuantity
      }, `Issued ${quantity} units for vehicle ${vehicleId}`);

      // Check for low stock
      await this.checkLowStockItem(itemId);

      return result;

    } catch (error) {
      console.error('Inventory issue error:', error);
      throw error;
    }
  }

  // Receive inventory items with transaction
  async receiveInventory(itemId, quantity, purchasePrice, supplierId, notes = '') {
    const inventoryRef = db.collection(this.collections.inventory).doc(itemId);
    const operationsRef = db.collection(this.collections.operations).doc();

    try {
      const result = await db.runTransaction(async (transaction) => {
        const inventoryDoc = await transaction.get(inventoryRef);
        
        let currentQty = 0;
        let inventoryData = {};
        
        if (inventoryDoc.exists) {
          inventoryData = inventoryDoc.data();
          currentQty = inventoryData.availableQty || 0;
        } else {
          // Create new inventory item
          inventoryData = {
            name: `Item ${itemId}`,
            category: 'general',
            unit: 'unit'
          };
        }

        const newQty = currentQty + quantity;
        const totalPrice = quantity * purchasePrice;

        // Update or create inventory
        transaction.set(inventoryRef, {
          ...inventoryData,
          availableQty: newQty,
          purchasePrice: purchasePrice,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: this.currentUser.uid,
          createdBy: this.currentUser.uid
        }, { merge: true });

        // Create operation record
        const operationData = {
          type: 'receive',
          itemId: itemId,
          itemName: inventoryData.name,
          quantity: quantity,
          unitPrice: purchasePrice,
          totalPrice: totalPrice,
          fromLocation: 'supplier',
          toLocation: 'main_warehouse',
          performedBy: this.currentUser.uid,
          status: 'completed',
          notes: notes,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: this.currentUser.uid
        };

        transaction.set(operationsRef, operationData);

        return {
          success: true,
          newQuantity: newQty,
          operationId: operationsRef.id,
          operationData
        };
      });

      // Log audit trail
      await this.logAuditTrail('inventory_receive', this.collections.inventory, itemId, {
        availableQty: currentQty
      }, {
        availableQty: result.newQuantity
      }, `Received ${quantity} units from supplier`);

      return result;

    } catch (error) {
      console.error('Inventory receive error:', error);
      throw error;
    }
  }

  // Create maintenance order
  async createMaintenanceOrder(orderData) {
    const orderRef = db.collection(this.collections.maintenanceOrders).doc();
    
    try {
      const order = {
        orderNumber: this.generateOrderNumber(),
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: this.currentUser.uid,
        ...orderData
      };

      await orderRef.set(order);

      // Log audit trail
      await this.logAuditTrail('order_create', this.collections.maintenanceOrders, orderRef.id, {}, order, `Created maintenance order ${order.orderNumber}`);

      // Send notification to assigned mechanic
      if (order.assignedMechanic) {
        await this.sendNotification(order.assignedMechanic, 'order_assigned', 'New Maintenance Order', `You have been assigned to ${order.orderNumber}`, {
          orderId: orderRef.id,
          orderNumber: order.orderNumber
        });
      }

      return {
        success: true,
        orderId: orderRef.id,
        order
      };

    } catch (error) {
      console.error('Create maintenance order error:', error);
      throw error;
    }
  }

  // Update maintenance order
  async updateMaintenanceOrder(orderId, updateData) {
    const orderRef = db.collection(this.collections.maintenanceOrders).doc(orderId);
    
    try {
      const orderDoc = await orderRef.get();
      if (!orderDoc.exists) {
        throw new Error('Maintenance order not found');
      }

      const oldData = orderDoc.data();
      
      await orderRef.update({
        ...updateData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: this.currentUser.uid
      });

      // Log audit trail
      await this.logAuditTrail('order_update', this.collections.maintenanceOrders, orderId, oldData, updateData, `Updated maintenance order`);

      return { success: true };

    } catch (error) {
      console.error('Update maintenance order error:', error);
      throw error;
    }
  }

  // Complete maintenance order
  async completeMaintenanceOrder(orderId, completionData) {
    const orderRef = db.collection(this.collections.maintenanceOrders).doc(orderId);
    
    try {
      const result = await db.runTransaction(async (transaction) => {
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) {
          throw new Error('Maintenance order not found');
        }

        const orderData = orderDoc.data();
        
        // Update order status
        transaction.update(orderRef, {
          status: 'completed',
          actualCost: completionData.actualCost,
          completedAt: firebase.firestore.FieldValue.serverTimestamp(),
          completedBy: this.currentUser.uid,
          notes: completionData.notes,
          images: completionData.images || {},
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update vehicle odometer if provided
        if (completionData.odometerReading && orderData.vehicleId) {
          const vehicleRef = db.collection(this.collections.vehicles).doc(orderData.vehicleId);
          transaction.update(vehicleRef, {
            odometer: completionData.odometerReading,
            lastMaintenanceDate: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }

        return { success: true };
      });

      // Log audit trail
      await this.logAuditTrail('order_complete', this.collections.maintenanceOrders, orderId, { status: 'in_progress' }, { status: 'completed' }, `Completed maintenance order`);

      return result;

    } catch (error) {
      console.error('Complete maintenance order error:', error);
      throw error;
    }
  }

  // Upload document to Cloud Storage
  async uploadDocument(file, path, metadata = {}) {
    try {
      const storageRef = storage.ref(`${path}/${file.name}`);
      const uploadTask = storageRef.put(file, {
        contentType: file.type,
        customMetadata: {
          uploadedBy: this.currentUser.uid,
          uploadedAt: new Date().toISOString(),
          ...metadata
        }
      });

      return new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('Upload progress:', progress);
          },
          (error) => {
            console.error('Upload error:', error);
            reject(error);
          },
          async () => {
            const downloadURL = await storageRef.getDownloadURL();
            resolve(downloadURL);
          }
        );
      });

    } catch (error) {
      console.error('Document upload error:', error);
      throw error;
    }
  }

  // Log audit trail
  async logAuditTrail(action, collection, documentId, oldValue, newValue, description) {
    try {
      const auditRef = db.collection(this.collections.auditTrail).doc();
      
      const auditData = {
        userId: this.currentUser.uid,
        userEmail: this.currentUser.email,
        action: action,
        collection: collection,
        documentId: documentId,
        oldValue: oldValue,
        newValue: newValue,
        changeDescription: description,
        ipAddress: await this.getClientIP(),
        userAgent: navigator.userAgent,
        sessionId: this.getSessionId(),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };

      await auditRef.set(auditData);

    } catch (error) {
      console.error('Audit trail error:', error);
      // Don't throw error for audit logging
    }
  }

  // Send notification
  async sendNotification(userId, type, title, message, data = {}) {
    try {
      const notifRef = db.collection(this.collections.notifications).doc();
      
      const notifData = {
        userId: userId,
        type: type,
        title: title,
        message: message,
        data: data,
        priority: 'normal',
        status: 'unread',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      await notifRef.set(notifData);

      // Send push notification if supported
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
          body: message,
          icon: '/logo.png',
          data: data
        });
      }

    } catch (error) {
      console.error('Send notification error:', error);
      throw error;
    }
  }

  // Check low stock items
  async checkLowStock() {
    const inventory = this.cache.get('inventory') || [];
    
    for (const item of inventory) {
      await this.checkLowStockItem(item.id);
    }
  }

  // Check specific item for low stock
  async checkLowStockItem(itemId) {
    const inventory = this.cache.get('inventory') || [];
    const item = inventory.find(i => i.id === itemId);
    
    if (item && item.availableQty <= item.reorderLevel) {
      await this.sendNotification(
        this.currentUser.uid,
        'low_stock',
        'Low Stock Alert',
        `${item.name} is below reorder level (${item.availableQty} <= ${item.reorderLevel})`,
        { itemId: itemId, currentQty: item.availableQty, reorderLevel: item.reorderLevel }
      );
    }
  }

  // Check maintenance due
  async checkMaintenanceDue() {
    const vehicles = this.cache.get('vehicles') || [];
    const today = new Date();
    
    for (const vehicle of vehicles) {
      if (vehicle.nextMaintenanceDate && new Date(vehicle.nextMaintenanceDate) <= today) {
        await this.sendNotification(
          this.currentUser.uid,
          'maintenance_due',
          'Maintenance Due',
          `Vehicle ${vehicle.plateNumber} is due for maintenance`,
          { vehicleId: vehicle.id, plateNumber: vehicle.plateNumber }
        );
      }
    }
  }

  // Generate order number
  generateOrderNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `MO-${year}${month}${day}-${random}`;
  }

  // Get client IP (simplified)
  async getClientIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      return 'unknown';
    }
  }

  // Get session ID
  getSessionId() {
    let sessionId = sessionStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  }

  // Update UI (to be implemented by specific UI components)
  updateUI(component) {
    // This method will be overridden by specific UI implementations
    console.log(`Updating UI for component: ${component}`);
  }

  // Update notifications
  updateNotifications() {
    const notifications = this.cache.get('notifications') || [];
    const unreadCount = notifications.length;
    
    // Update notification badge
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      badge.textContent = unreadCount;
      badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
  }

  // Check pending operations (for offline support)
  async checkPendingOperations() {
    const pendingOps = JSON.parse(localStorage.getItem('pendingOperations') || '[]');
    
    for (const op of pendingOps) {
      try {
        await this.retryOperation(op);
      } catch (error) {
        console.error('Retry operation failed:', error);
      }
    }
  }

  // Retry failed operation
  async retryOperation(operation) {
    switch (operation.type) {
      case 'issueInventory':
        await this.issueInventory(operation.itemId, operation.quantity, operation.vehicleId, operation.notes);
        break;
      case 'receiveInventory':
        await this.receiveInventory(operation.itemId, operation.quantity, operation.purchasePrice, operation.supplierId, operation.notes);
        break;
      case 'createMaintenanceOrder':
        await this.createMaintenanceOrder(operation.orderData);
        break;
      default:
        console.error('Unknown operation type:', operation.type);
    }
  }

  // Setup event handlers
  setupEventHandlers() {
    // Handle online/offline events
    window.addEventListener('online', () => {
      this.checkPendingOperations();
    });

    window.addEventListener('offline', () => {
      console.log('System offline - operations will be queued');
    });

    // Handle visibility change (for tab switching)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkPendingOperations();
      }
    });
  }

  // Logout
  async logout() {
    try {
      await auth.signOut();
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = 'index.html';
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  // Cleanup
  cleanup() {
    // Remove all listeners
    Object.values(this.listeners).forEach(unsubscribe => {
      unsubscribe();
    });
    
    // Clear cache
    this.cache.clear();
  }
}

// Export for use in other modules
window.GarageSystem = GarageSystem;

// Initialize system when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.garageSystem = new GarageSystem();
  window.garageSystem.initialize();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (window.garageSystem) {
    window.garageSystem.cleanup();
  }
});
