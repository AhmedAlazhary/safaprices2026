# Garage System Firebase Collections Schema

## Collections Overview

### 1. Vehicles Collection
```javascript
{
  id: "vehicle_001",
  plateNumber: "1234-ABC",
  make: "Toyota",
  model: "Corolla",
  year: 2020,
  odometer: 45000,
  status: "active", // active, maintenance, retired
  assignedDriver: "driver_001",
  lastMaintenanceDate: "2024-01-15",
  nextMaintenanceDate: "2024-04-15",
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: "user_uid"
}
```

### 2. Staff Collection
```javascript
{
  id: "staff_001",
  name: "Ahmed Mohamed",
  email: "ahmed@garage.com",
  role: "mechanic", // admin, manager, mechanic, driver
  specialization: "engine", // engine, body, electrical, general
  phone: "+201234567890",
  status: "active", // active, on_leave, terminated
  hireDate: "2023-01-01",
  certifications: ["cert_001", "cert_002"],
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: "user_uid"
}
```

### 3. Inventory Collection
```javascript
{
  id: "item_001",
  name: "Engine Oil 5W-30",
  sku: "OIL-5W30-001",
  category: "oil", // oil, parts, scrap, tools
  type: "new", // new, scrap, used
  unit: "liter",
  purchasePrice: 120.50,
  salePrice: 150.00,
  availableQty: 25,
  reorderLevel: 10,
  location: "shelf_A_15",
  supplier: "supplier_001",
  images: ["image_url_1", "image_url_2"],
  specifications: {
    viscosity: "5W-30",
    volume: "4L",
    certification: "API SN"
  },
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: "user_uid"
}
```

### 4. Operations Collection
```javascript
{
  id: "operation_001",
  type: "issue", // issue, receive, return, transfer
  referenceId: "job_order_001",
  itemId: "item_001",
  itemName: "Engine Oil 5W-30",
  quantity: 5,
  unitPrice: 120.50,
  totalPrice: 602.50,
  fromLocation: "main_warehouse",
  toLocation: "vehicle_001",
  performedBy: "staff_001",
  approvedBy: "manager_001",
  status: "completed", // pending, approved, completed, cancelled
  notes: "Oil change for vehicle 001",
  documents: ["doc_url_1", "doc_url_2"],
  images: ["image_url_1"],
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: "user_uid"
}
```

### 5. Maintenance_Orders Collection
```javascript
{
  id: "order_001",
  orderNumber: "MO-2024-001",
  vehicleId: "vehicle_001",
  vehicleInfo: {
    plateNumber: "1234-ABC",
    make: "Toyota",
    model: "Corolla"
  },
  assignedMechanic: "staff_001",
  mechanicInfo: {
    name: "Ahmed Mohamed",
    specialization: "engine"
  },
  type: "scheduled", // scheduled, emergency, repair
  priority: "normal", // low, normal, high, urgent
  status: "in_progress", // pending, in_progress, completed, cancelled
  estimatedCost: 500.00,
  actualCost: 450.00,
  odometerAtService: 45000,
  description: "Regular oil change and filter replacement",
  partsUsed: [
    {
      itemId: "item_001",
      name: "Engine Oil 5W-30",
      quantity: 5,
      unitPrice: 120.50,
      totalPrice: 602.50
    }
  ],
  laborHours: 2,
  laborRate: 100.00,
  laborCost: 200.00,
  images: {
    before: ["image_url_1", "image_url_2"],
    after: ["image_url_3", "image_url_4"]
  },
  documents: ["doc_url_1"],
  notes: "Customer requested premium oil filter",
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: "user_uid",
  completedAt: timestamp,
  completedBy: "staff_001"
}
```

### 6. Audit_Trail Collection
```javascript
{
  id: "audit_001",
  userId: "user_uid",
  userEmail: "user@garage.com",
  action: "inventory_issue", // inventory_issue, inventory_receive, order_create, order_update
  collection: "Inventory",
  documentId: "item_001",
  documentName: "Engine Oil 5W-30",
  oldValue: { availableQty: 25 },
  newValue: { availableQty: 20 },
  changeDescription: "Issued 5 liters for vehicle maintenance",
  ipAddress: "192.168.1.100",
  userAgent: "Mozilla/5.0...",
  timestamp: timestamp,
  sessionId: "session_001"
}
```

### 7. Notifications Collection
```javascript
{
  id: "notif_001",
  userId: "user_uid",
  type: "low_stock", // low_stock, maintenance_due, order_assigned
  title: "Low Stock Alert",
  message: "Engine Oil 5W-30 is below reorder level",
  data: {
    itemId: "item_001",
    currentQty: 8,
    reorderLevel: 10
  },
  priority: "high", // low, normal, high, urgent
  status: "unread", // unread, read, archived
  createdAt: timestamp,
  readAt: timestamp
}
```

### 8. Settings Collection
```javascript
{
  id: "settings_001",
  key: "system_settings",
  value: {
    lowStockAlerts: true,
    maintenanceReminders: true,
    autoBackup: true,
    currency: "EGP",
    timezone: "Africa/Cairo",
    workingHours: {
      start: "08:00",
      end: "17:00"
    }
  },
  updatedBy: "user_uid",
  updatedAt: timestamp
}
```

## Indexes for Performance

### Firestore Indexes
- **Vehicles**: status, assignedDriver
- **Inventory**: category, type, availableQty
- **Operations**: type, status, createdAt
- **Maintenance_Orders**: status, vehicleId, assignedMechanic
- **Audit_Trail**: userId, timestamp, collection
- **Notifications**: userId, status, createdAt

## Security Rules Structure

### Basic Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Staff collection - role-based access
    match /staff/{staffId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'manager'];
    }
    
    // Vehicles collection
    match /vehicles/{vehicleId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'manager'];
    }
    
    // Inventory collection
    match /inventory/{itemId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'manager', 'mechanic'];
    }
    
    // Operations collection
    match /operations/{operationId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'manager', 'mechanic'];
    }
    
    // Maintenance Orders collection
    match /maintenance_orders/{orderId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'manager', 'mechanic'];
    }
    
    // Audit Trail - read-only for most users
    match /audit_trail/{auditId} {
      allow read: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'manager'];
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin'];
    }
    
    // Notifications - user-specific
    match /notifications/{notifId} {
      allow read, write: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
  }
}
```

## Data Migration Plan

### Phase 1: Backup Existing Data
```javascript
// Export existing collections
const collections = ['JobOrders', 'Inventory', 'Staff', 'Expenses'];
collections.forEach(async (collection) => {
  const snapshot = await getDocs(collection(db, collection));
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  // Save to backup file
});
```

### Phase 2: Transform Data Structure
```javascript
// Transform JobOrders to Maintenance_Orders
function transformJobOrder(jobOrder) {
  return {
    id: jobOrder.id,
    orderNumber: jobOrder.jobNumber || `MO-${Date.now()}`,
    vehicleId: jobOrder.vehicleId,
    // ... map old fields to new structure
  };
}
```

### Phase 3: Import to New Collections
```javascript
// Import transformed data
batch.set(doc(db, 'maintenance_orders', order.id), transformedOrder);
```

## Performance Optimization

### 1. Pagination
```javascript
// Implement cursor-based pagination for large collections
const query = query(
  collection(db, 'operations'),
  orderBy('createdAt', 'desc'),
  startAfter(lastVisible),
  limit(20)
);
```

### 2. Caching Strategy
```javascript
// Cache frequently accessed data
const cache = new Map();
function getCachedData(key, fetchFunction) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const data = fetchFunction();
  cache.set(key, data);
  return data;
}
```

### 3. Batch Operations
```javascript
// Use batch writes for multiple operations
const batch = writeBatch(db);
operations.forEach(op => {
  batch.set(doc(db, 'operations', op.id), op);
});
await batch.commit();
```

## Backup and Recovery

### 1. Automated Backups
```javascript
// Schedule daily backups
export const scheduledBackup = functions.pubsub
  .schedule('0 2 * * *') // Daily at 2 AM
  .timeZone('Africa/Cairo')
  .onRun(async (context) => {
    // Backup all collections
  });
```

### 2. Point-in-Time Recovery
```javascript
// Restore from specific timestamp
const restorePoint = new Date('2024-01-01T00:00:00Z');
const snapshot = await getDocs(
  query(collection(db, 'inventory'), where('createdAt', '<=', restorePoint))
);
```

## Monitoring and Analytics

### 1. Performance Metrics
```javascript
// Track operation performance
const performanceMetrics = {
  operationType: 'inventory_issue',
  executionTime: 150, // ms
  timestamp: serverTimestamp(),
  userId: request.auth.uid
};
```

### 2. Error Tracking
```javascript
// Log errors for debugging
functions.logger.error('Operation failed', {
  error: error.message,
  userId: request.auth.uid,
  operation: 'inventory_issue'
});
```

## Testing Strategy

### 1. Unit Tests
```javascript
// Test transaction logic
describe('Inventory Transaction', () => {
  it('should deduct quantity correctly', async () => {
    const result = await issueInventory(itemId, quantity);
    expect(result.newQuantity).toBe(expectedQuantity);
  });
});
```

### 2. Integration Tests
```javascript
// Test end-to-end workflows
describe('Maintenance Order Flow', () => {
  it('should complete full maintenance cycle', async () => {
    // Create order -> Issue parts -> Complete order
  });
});
```

## Deployment Strategy

### 1. Environment Configuration
```javascript
const config = {
  development: {
    projectId: 'garage-dev',
    location: 'us-central1'
  },
  production: {
    projectId: 'garage-prod',
    location: 'us-central1'
  }
};
```

### 2. CI/CD Pipeline
```yaml
# GitHub Actions workflow
name: Deploy Garage System
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Firebase
        run: firebase deploy --project=garage-prod
```

## Documentation Standards

### 1. API Documentation
```javascript
/**
 * Issues inventory items for maintenance
 * @param {string} itemId - The inventory item ID
 * @param {number} quantity - The quantity to issue
 * @param {string} vehicleId - The vehicle ID
 * @returns {Promise<Object>} The operation result
 */
async function issueInventory(itemId, quantity, vehicleId) {
  // Implementation
}
```

### 2. Database Schema Documentation
```markdown
## Inventory Collection
### Fields
- `id`: Unique identifier
- `name`: Item name
- `availableQty`: Current available quantity
- `reorderLevel`: Minimum quantity before reorder
```

## Future Enhancements

### 1. AI Integration
- Predictive maintenance scheduling
- Inventory demand forecasting
- Cost optimization recommendations

### 2. Mobile App
- React Native mobile application
- Offline support with sync
- Push notifications

### 3. Advanced Analytics
- Custom dashboard builder
- Performance metrics
- Cost analysis reports
