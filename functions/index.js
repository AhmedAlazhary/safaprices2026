/**
 * Firebase Cloud Functions for Garage System
 * Smart notifications and automated workflows
 * 
 * Features:
 * - Low stock alerts
 * - Maintenance reminders
 * - Daily reports
 * - Data backups
 * - Automated cleanup
 * - RBAC (Role-Based Access Control)
 * - User management
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// Database references
const db = admin.firestore();
const storage = admin.storage();

// Email configuration (configure with your email service)
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: functions.config().email.user,
    pass: functions.config().email.pass
  }
});

/**
 * Low Stock Alert Trigger
 * Runs when inventory is updated
 */
exports.lowStockAlert = functions.firestore
  .document('inventory/{itemId}')
  .onWrite(async (change, context) => {
    const newValue = change.after.data();
    const previousValue = change.before.data();

    // Check if quantity changed and is below reorder level
    if (newValue && newValue.availableQty <= newValue.reorderLevel) {
      const previousQty = previousValue ? previousValue.availableQty : 0;
      
      // Only send alert if this is a new low stock situation
      if (previousQty > newValue.reorderLevel) {
        await sendLowStockNotification(newValue);
        await createLowStockTask(newValue);
      }
    }
  });

/**
 * Maintenance Due Reminder
 * Runs daily at 8 AM
 */
exports.maintenanceDueReminder = functions.pubsub
  .schedule('0 8 * * *') // Daily at 8 AM
  .timeZone('Africa/Cairo')
  .onRun(async (context) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 7); // Check next 7 days

    const vehiclesSnapshot = await db.collection('vehicles')
      .where('status', '==', 'active')
      .where('nextMaintenanceDate', '<=', tomorrow)
      .get();

    const notifications = [];

    for (const doc of vehiclesSnapshot.docs) {
      const vehicle = doc.data();
      const daysUntilMaintenance = Math.ceil((vehicle.nextMaintenanceDate.toDate() - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntilMaintenance <= 0) {
        // Overdue maintenance
        notifications.push({
          type: 'maintenance_overdue',
          vehicle: vehicle,
          message: `Vehicle ${vehicle.plateNumber} is overdue for maintenance`,
          priority: 'urgent'
        });
      } else if (daysUntilMaintenance <= 7) {
        // Upcoming maintenance
        notifications.push({
          type: 'maintenance_due',
          vehicle: vehicle,
          message: `Vehicle ${vehicle.plateNumber} is due for maintenance in ${daysUntilMaintenance} days`,
          priority: 'high'
        });
      }
    }

    // Send notifications to managers and mechanics
    await sendMaintenanceNotifications(notifications);
  });

/**
 * Daily Summary Report
 * Runs daily at 6 PM
 */
exports.dailySummaryReport = functions.pubsub
  .schedule('0 18 * * *') // Daily at 6 PM
  .timeZone('Africa/Cairo')
  .onRun(async (context) => {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    // Get today's operations
    const operationsSnapshot = await db.collection('operations')
      .where('createdAt', '>=', startOfDay)
      .where('createdAt', '<=', endOfDay)
      .get();

    // Get today's maintenance orders
    const maintenanceSnapshot = await db.collection('maintenance_orders')
      .where('createdAt', '>=', startOfDay)
      .where('createdAt', '<=', endOfDay)
      .get();

    // Get current inventory status
    const inventorySnapshot = await db.collection('inventory').get();

    // Calculate statistics
    const stats = {
      totalOperations: operationsSnapshot.size,
      totalIssues: operationsSnapshot.docs.filter(doc => doc.data().type === 'issue').size,
      totalReceives: operationsSnapshot.docs.filter(doc => doc.data().type === 'receive').size,
      totalMaintenanceOrders: maintenanceSnapshot.size,
      completedMaintenanceOrders: maintenanceSnapshot.docs.filter(doc => doc.data().status === 'completed').size,
      lowStockItems: inventorySnapshot.docs.filter(doc => 
        doc.data().availableQty <= doc.data().reorderLevel
      ).size,
      totalInventoryValue: inventorySnapshot.docs.reduce((sum, doc) => 
        sum + (doc.data().availableQty * doc.data().purchasePrice), 0
      )
    };

    // Send daily report to managers
    await sendDailyReport(stats);
  });

/**
 * Automated Data Backup
 * Runs weekly on Sunday at 2 AM
 */
exports.automatedBackup = functions.pubsub
  .schedule('0 2 * * 0') // Weekly on Sunday at 2 AM
  .timeZone('Africa/Cairo')
  .onRun(async (context) => {
    const collections = ['vehicles', 'staff', 'inventory', 'operations', 'maintenance_orders', 'audit_trail'];
    const backupData = {};

    for (const collectionName of collections) {
      const snapshot = await db.collection(collectionName).get();
      backupData[collectionName] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }

    // Save backup to Cloud Storage
    const backupFileName = `backups/garage_backup_${new Date().toISOString().split('T')[0]}.json`;
    const backupFile = storage.bucket().file(backupFileName);

    await backupFile.save(JSON.stringify(backupData), {
      metadata: {
        contentType: 'application/json',
        backupDate: new Date().toISOString()
      }
    });

    // Clean up old backups (keep last 30 days)
    await cleanupOldBackups();

    console.log(`Backup completed: ${backupFileName}`);
  });

/**
 * User Activity Monitoring
 * Runs when user performs any action
 */
exports.logUserActivity = functions.firestore
  .document('audit_trail/{auditId}')
  .onCreate(async (snapshot, context) => {
    const auditData = snapshot.data();
    
    // Check for suspicious activity
    if (auditData.action === 'inventory_issue' && auditData.newValue.availableQty < 0) {
      await sendSecurityAlert(auditData, 'Negative inventory detected');
    }

    // Check for rapid operations (possible automation abuse)
    const recentOperations = await db.collection('audit_trail')
      .where('userId', '==', auditData.userId)
      .where('timestamp', '>=', new Date(Date.now() - 5 * 60 * 1000)) // Last 5 minutes
      .get();

    if (recentOperations.size > 50) {
      await sendSecurityAlert(auditData, 'High frequency operations detected');
    }
  });

/**
 * Image Processing and Optimization
 * Runs when image is uploaded
 */
exports.processImageUpload = functions.storage
  .object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    const contentType = object.contentType;

    // Only process images
    if (!contentType.startsWith('image/')) {
      return;
    }

    // Skip if already processed
    if (filePath.includes('processed_')) {
      return;
    }

    try {
      // Download image
      const buffer = await storage.bucket().file(filePath).download();
      
      // Process image (resize, compress, etc.)
      const processedBuffer = await processImage(buffer[0]);
      
      // Upload processed version
      const processedPath = `processed_${filePath}`;
      await storage.bucket().file(processedPath).save(processedBuffer, {
        metadata: {
          contentType: contentType,
          originalPath: filePath,
          processedAt: new Date().toISOString()
        }
      });

      console.log(`Image processed: ${processedPath}`);
    } catch (error) {
      console.error('Image processing error:', error);
    }
  });

/**
 * Send low stock notification
 */
async function sendLowStockNotification(item) {
  const managers = await getManagers();
  const mechanics = await getMechanics();

  const notification = {
    title: 'Low Stock Alert',
    message: `${item.name} is below reorder level (${item.availableQty} <= ${item.reorderLevel})`,
    data: {
      itemId: item.id,
      currentQty: item.availableQty,
      reorderLevel: item.reorderLevel
    },
    priority: 'high'
  };

  // Send in-app notifications
  for (const manager of managers) {
    await createNotification(manager.id, 'low_stock', notification.title, notification.message, notification.data);
  }

  // Send email notifications
  for (const manager of managers) {
    await sendEmail(manager.email, notification.title, notification.message);
  }

  console.log(`Low stock notification sent for item: ${item.name}`);
}

/**
 * Send maintenance notifications
 */
async function sendMaintenanceNotifications(notifications) {
  const managers = await getManagers();
  const mechanics = await getMechanics();

  for (const notif of notifications) {
    // Send in-app notifications
    for (const manager of managers) {
      await createNotification(manager.id, notif.type, notif.message, '', { vehicle: notif.vehicle });
    }

    // Send email notifications
    for (const manager of managers) {
      await sendEmail(manager.email, 'Maintenance Reminder', notif.message);
    }
  }

  console.log(`Sent ${notifications.length} maintenance notifications`);
}

/**
 * Send daily report
 */
async function sendDailyReport(stats) {
  const managers = await getManagers();

  const reportHtml = `
    <h2>Daily Garage Report - ${new Date().toLocaleDateString()}</h2>
    <h3>Operations Summary</h3>
    <ul>
      <li>Total Operations: ${stats.totalOperations}</li>
      <li>Issues: ${stats.totalIssues}</li>
      <li>Receives: ${stats.totalReceives}</li>
    </ul>
    
    <h3>Maintenance Summary</h3>
    <ul>
      <li>Total Orders: ${stats.totalMaintenanceOrders}</li>
      <li>Completed: ${stats.completedMaintenanceOrders}</li>
    </ul>
    
    <h3>Inventory Summary</h3>
    <ul>
      <li>Low Stock Items: ${stats.lowStockItems}</li>
      <li>Total Inventory Value: ${stats.totalInventoryValue.toFixed(2)} EGP</li>
    </ul>
  `;

  for (const manager of managers) {
    await sendEmail(manager.email, 'Daily Garage Report', reportHtml, true);
  }

  console.log('Daily report sent to managers');
}

/**
 * Send security alert
 */
async function sendSecurityAlert(auditData, alertMessage) {
  const admins = await getAdmins();

  const notification = {
    title: 'Security Alert',
    message: alertMessage,
    data: {
      auditId: auditData.id,
      userId: auditData.userId,
      action: auditData.action
    },
    priority: 'urgent'
  };

  for (const admin of admins) {
    await createNotification(admin.id, 'security_alert', notification.title, notification.message, notification.data);
    await sendEmail(admin.email, 'Security Alert', alertMessage);
  }

  console.log(`Security alert sent: ${alertMessage}`);
}

/**
 * Create notification in Firestore
 */
async function createNotification(userId, type, title, message, data = {}) {
  const notification = {
    userId: userId,
    type: type,
    title: title,
    message: message,
    data: data,
    priority: 'normal',
    status: 'unread',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.collection('notifications').add(notification);
}

/**
 * Create low stock task
 */
async function createLowStockTask(item) {
  const task = {
    title: `Reorder ${item.name}`,
    description: `Item is below reorder level. Current: ${item.availableQty}, Reorder at: ${item.reorderLevel}`,
    priority: 'high',
    status: 'pending',
    assignedTo: null,
    createdBy: 'system',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    data: {
      itemId: item.id,
      itemName: item.name,
      currentQty: item.availableQty,
      reorderLevel: item.reorderLevel,
      suggestedOrderQty: item.reorderLevel * 2 // Suggest ordering double the reorder level
    }
  };

  await db.collection('tasks').add(task);
}

/**
 * Send email
 */
async function sendEmail(to, subject, message, isHtml = false) {
  const mailOptions = {
    from: functions.config().email.from,
    to: to,
    subject: subject,
    text: isHtml ? null : message,
    html: isHtml ? message : null
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to: ${to}`);
  } catch (error) {
    console.error('Email send error:', error);
  }
}

/**
 * Get managers from database
 */
async function getManagers() {
  const snapshot = await db.collection('users')
    .where('role', '==', 'manager')
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get mechanics from database
 */
async function getMechanics() {
  const snapshot = await db.collection('users')
    .where('role', '==', 'mechanic')
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get admins from database
 */
async function getAdmins() {
  const snapshot = await db.collection('users')
    .where('role', '==', 'admin')
    .get();
  
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Clean up old backups
 */
async function cleanupOldBackups() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep last 30 days

  const files = await storage.bucket().getFiles({
    prefix: 'backups/'
  });

  for (const file of files[0]) {
    if (file.name.includes('garage_backup_')) {
      const fileDate = new Date(file.name.match(/garage_backup_(.+)\.json/)[1]);
      if (fileDate < cutoffDate) {
        await file.delete();
        console.log(`Deleted old backup: ${file.name}`);
      }
    }
  }
}

/**
 * Process image (resize and compress)
 */
async function processImage(buffer) {
  // This is a placeholder for image processing
  // In a real implementation, you would use a library like Sharp
  // to resize, compress, and optimize images
  
  // For now, just return the original buffer
  // In production, implement actual image processing
  return buffer;
}

/**
 * Welcome email for new users
 */
exports.sendWelcomeEmail = functions.auth.user().onCreate(async (user) => {
  const userDoc = await db.collection('users').doc(user.uid).get();
  
  if (userDoc.exists) {
    const userData = userDoc.data();
    
    const welcomeMessage = `
      Welcome to the Garage Management System!
      
      Your account has been created with the following details:
      - Name: ${userData.name}
      - Email: ${userData.email}
      - Role: ${userData.role}
      
      Please login to get started.
    `;
    
    await sendEmail(user.email, 'Welcome to Garage Management System', welcomeMessage);
  }
});

/**
 * Cleanup old notifications
 */
exports.cleanupOldNotifications = functions.pubsub
  .schedule('0 1 * * *') // Daily at 1 AM
  .timeZone('Africa/Cairo')
  .onRun(async (context) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // Delete notifications older than 30 days

    const oldNotifications = await db.collection('notifications')
      .where('createdAt', '<', cutoffDate)
      .where('status', '==', 'read')
      .get();

    const batch = db.batch();
    oldNotifications.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Cleaned up ${oldNotifications.size} old notifications`);
  });

/**
 * Generate monthly reports
 */
exports.monthlyReport = functions.pubsub
  .schedule('0 8 1 * *') // 1st of each month at 8 AM
  .timeZone('Africa/Cairo')
  .onRun(async (context) => {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get monthly statistics
    const operationsSnapshot = await db.collection('operations')
      .where('createdAt', '>=', firstDayOfMonth)
      .where('createdAt', '<=', lastDayOfMonth)
      .get();

    const maintenanceSnapshot = await db.collection('maintenance_orders')
      .where('createdAt', '>=', firstDayOfMonth)
      .where('createdAt', '<=', lastDayOfMonth)
      .get();

    // Generate report
    const report = {
      month: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
      totalOperations: operationsSnapshot.size,
      totalMaintenanceOrders: maintenanceSnapshot.size,
      totalRevenue: calculateMonthlyRevenue(operationsSnapshot),
      totalExpenses: calculateMonthlyExpenses(maintenanceSnapshot),
      topMechanics: getTopMechanics(maintenanceSnapshot),
      topItems: getTopItems(operationsSnapshot)
    };

    // Save report to database
    await db.collection('monthly_reports').add({
      ...report,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send report to managers
    await sendMonthlyReport(report);
  });

/**
 * Calculate monthly revenue
 */
function calculateMonthlyRevenue(operationsSnapshot) {
  return operationsSnapshot.docs
    .filter(doc => doc.data().type === 'issue')
    .reduce((sum, doc) => sum + (doc.data().totalPrice || 0), 0);
}

/**
 * Calculate monthly expenses
 */
function calculateMonthlyExpenses(maintenanceSnapshot) {
  return maintenanceSnapshot.docs
    .filter(doc => doc.data().actualCost)
    .reduce((sum, doc) => sum + (doc.data().actualCost || 0), 0);
}

/**
 * Get top mechanics
 */
function getTopMechanics(maintenanceSnapshot) {
  const mechanicStats = {};
  
  maintenanceSnapshot.docs.forEach(doc => {
    const order = doc.data();
    const mechanicId = order.assignedMechanic;
    
    if (!mechanicStats[mechanicId]) {
      mechanicStats[mechanicId] = {
        id: mechanicId,
        name: order.mechanicInfo?.name || 'Unknown',
        orders: 0,
        revenue: 0
      };
    }
    
    mechanicStats[mechanicId].orders++;
    mechanicStats[mechanicId].revenue += order.actualCost || 0;
  });

  return Object.values(mechanicStats)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

/**
 * Get top items
 */
function getTopItems(operationsSnapshot) {
  const itemStats = {};
  
  operationsSnapshot.docs.forEach(doc => {
    const operation = doc.data();
    const itemId = operation.itemId;
    
    if (!itemStats[itemId]) {
      itemStats[itemId] = {
        id: itemId,
        name: operation.itemName,
        quantity: 0,
        revenue: 0
      };
    }
    
    itemStats[itemId].quantity += operation.quantity;
    itemStats[itemId].revenue += operation.totalPrice || 0;
  });

  return Object.values(itemStats)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
}

/**
 * Send monthly report
 */
async function sendMonthlyReport(report) {
  const managers = await getManagers();
  
  const reportHtml = `
    <h2>Monthly Garage Report - ${report.month}</h2>
    
    <h3>Summary</h3>
    <ul>
      <li>Total Operations: ${report.totalOperations}</li>
      <li>Total Maintenance Orders: ${report.totalMaintenanceOrders}</li>
      <li>Total Revenue: ${report.totalRevenue.toFixed(2)} EGP</li>
      <li>Total Expenses: ${report.totalExpenses.toFixed(2)} EGP</li>
      <li>Net Profit: ${(report.totalRevenue - report.totalExpenses).toFixed(2)} EGP</li>
    </ul>
    
    <h3>Top Mechanics</h3>
    <table>
      <tr><th>Name</th><th>Orders</th><th>Revenue</th></tr>
      ${report.topMechanics.map(mech => 
        `<tr><td>${mech.name}</td><td>${mech.orders}</td><td>${mech.revenue.toFixed(2)} EGP</td></tr>`
      ).join('')}
    </table>
    
    <h3>Top Items</h3>
    <table>
      <tr><th>Item</th><th>Quantity</th><th>Revenue</th></tr>
      ${report.topItems.map(item => 
        `<tr><td>${item.name}</td><td>${item.quantity}</td><td>${item.revenue.toFixed(2)} EGP</td></tr>`
      ).join('')}
    </table>
  `;

  for (const manager of managers) {
    await sendEmail(manager.email, `Monthly Garage Report - ${report.month}`, reportHtml, true);
  }

  console.log(`Monthly report sent for ${report.month}`);
});

// ============================================
// RBAC (Role-Based Access Control) Functions
// ============================================

const ORIGINAL_ADMIN_EMAILS = new Set([
    'ahmed@safatrans.com',
    'hesham@safatrans.com',
    'omar@safatrans.com',
    'sabry@safatrans.com'
]);

function isOriginalAdminEmail(email) {
    return ORIGINAL_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

/**
 * دالة مساعدة للتحقق مما إذا كان المستخدم أصلياً
 */
async function isOriginalUser(uid) {
    const userRoleDoc = await db.collection('user_roles').doc(uid).get();
    if (userRoleDoc.exists && userRoleDoc.data().isOriginalUser === true) {
        return true;
    }

    try {
        const userRecord = await admin.auth().getUser(uid);
        return isOriginalAdminEmail(userRecord.email);
    } catch (error) {
        console.error('Error checking original user by email:', error);
        return false;
    }
}

/**
 * تعيين دور للمستخدم
 */
exports.assignUserRole = functions.https.onCall(async (data, context) => {
    // التحقق من أن المستخدم الحالي هو أدمن
    if (!context.auth || !context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'غير مصرح');
    }

    const { uid, role, assignedBy } = data;
    
    if (!uid || !role) {
        throw new functions.https.HttpsError('invalid-argument', 'المعلمات مطلوبة');
    }

    // التحقق من صحة الدور
    const validRoles = ['admin', 'manager', 'viewer'];
    if (!validRoles.includes(role)) {
        throw new functions.https.HttpsError('invalid-argument', 'دور غير صالح');
    }

    // التحقق: هل المستهدف مستخدم أصلي؟
    const isOriginal = await isOriginalUser(uid);
    if (isOriginal && role !== 'admin') {
        throw new functions.https.HttpsError(
            'permission-denied',
            'لا يمكن تغيير صلاحية المستخدمين الأصليين في النظام'
        );
    }

    try {
        // الحصول على معلومات المستخدم
        const userRecord = await admin.auth().getUser(uid);
        const oldRole = await getUserCurrentRole(uid);

        // تعيين Custom Claims
        const claims = {
            admin: role === 'admin',
            manager: role === 'manager',
            viewer: role === 'viewer'
        };

        await admin.auth().setCustomUserClaims(uid, claims);

        // تحديث Firestore
        await db.collection('user_roles').doc(uid).set({
            email: userRecord.email,
            displayName: userRecord.displayName,
            role: role,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: assignedBy || context.auth.uid,
            isOriginalUser: isOriginal
        }, { merge: true });

        // تسجيل في Audit Trail
        await db.collection('audit_logs').add({
            action: 'role_change',
            targetUid: uid,
            targetEmail: userRecord.email,
            oldRole: oldRole,
            newRole: role,
            performedBy: assignedBy || context.auth.uid,
            performedByEmail: context.auth.token.email,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            reason: isOriginal ? 'حماية المستخدم الأصلي' : 'تغيير دور عادي'
        });

        return { success: true, message: 'تم تحديث الدور بنجاح' };

    } catch (error) {
        console.error('Error assigning user role:', error);
        throw new functions.https.HttpsError('internal', 'فشل تحديث الدور');
    }
});

/**
 * الحصول على جميع المستخدمين مع أدوارهم
 */
exports.getAllUsers = functions.https.onCall(async (data, context) => {
    // التحقق من أن المستخدم الحالي هو أدمن
    if (!context.auth || !context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'غير مصرح');
    }

    try {
        // جلب جميع المستخدمين من Auth
        const listUsersResult = await admin.auth().listUsers();
        const users = listUsersResult.users;

        // جلب أدوار المستخدمين من Firestore
        const userRolesSnapshot = await db.collection('user_roles').get();
        const userRoles = {};
        
        userRolesSnapshot.forEach(doc => {
            userRoles[doc.id] = doc.data();
        });

        // دمج البيانات
        const usersWithRoles = users.map(user => {
            const roleData = userRoles[user.uid] || {};
            const token = user.customClaims || {};
            const isOriginalAdmin = roleData.isOriginalUser || isOriginalAdminEmail(user.email);
            const resolvedRole = roleData.role || (token.admin || isOriginalAdmin ? 'admin' : 'viewer');
            
            return {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                role: resolvedRole,
                isOriginal: isOriginalAdmin,
                createdAt: user.metadata.creationTime,
                lastSignIn: user.metadata.lastSignInTime,
                disabled: user.disabled,
                emailVerified: user.emailVerified
            };
        });

        // الترتيب حسب البريد الإلكتروني
        usersWithRoles.sort((a, b) => a.email.localeCompare(b.email));

        return { users: usersWithRoles };

    } catch (error) {
        console.error('Error getting all users:', error);
        throw new functions.https.HttpsError('internal', 'فشل جلب المستخدمين');
    }
});

/**
 * حذف مستخدم
 */
exports.deleteUser = functions.https.onCall(async (data, context) => {
    // التحقق من أن المستخدم الحالي هو أدمن
    if (!context.auth || !context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'غير مصرح');
    }

    const { uid, deletedBy } = data;
    
    if (!uid) {
        throw new functions.https.HttpsError('invalid-argument', 'معرف المستخدم مطلوب');
    }

    // التحقق: هل المستهدف مستخدم أصلي؟
    const isOriginal = await isOriginalUser(uid);
    if (isOriginal) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'لا يمكن حذف المستخدمين الأصليين في النظام'
        );
    }

    // التحقق من أن المستخدم لا يحاول حذف نفسه
    if (uid === context.auth.uid) {
        throw new functions.https.HttpsError('invalid-argument', 'لا يمكن حذف حسابك الخاص');
    }

    try {
        // الحصول على معلومات المستخدم قبل الحذف
        const userRecord = await admin.auth().getUser(uid);

        // حذف المستخدم من Auth
        await admin.auth().deleteUser(uid);

        // حذف بيانات المستخدم من Firestore
        await db.collection('user_roles').doc(uid).delete();

        // تسجيل في Audit Trail
        await db.collection('audit_logs').add({
            action: 'user_deletion',
            targetUid: uid,
            targetEmail: userRecord.email,
            targetDisplayName: userRecord.displayName,
            performedBy: deletedBy || context.auth.uid,
            performedByEmail: context.auth.token.email,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            reason: 'حذف مستخدم عادي'
        });

        return { success: true, message: 'تم حذف المستخدم بنجاح' };

    } catch (error) {
        console.error('Error deleting user:', error);
        throw new functions.https.HttpsError('internal', 'فشل حذف المستخدم');
    }
});

/**
 * إنشاء مستخدم جديد مع دور محدد
 */
exports.createUserWithRole = functions.https.onCall(async (data, context) => {
    // التحقق من أن المستخدم الحالي هو أدمن
    if (!context.auth || !context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'غير مصرح');
    }

    const { email, password, displayName, role, createdBy } = data;
    
    if (!email || !password) {
        throw new functions.https.HttpsError('invalid-argument', 'البريد الإلكتروني وكلمة المرور مطلوبان');
    }

    // التحقق من صحة الدور
    const validRoles = ['admin', 'manager', 'viewer'];
    const userRole = isOriginalAdminEmail(email) ? 'admin' : (role || 'viewer');
    if (!validRoles.includes(userRole)) {
        throw new functions.https.HttpsError('invalid-argument', 'دور غير صالح');
    }

    try {
        // إنشاء المستخدم في Auth
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: displayName || email.split('@')[0]
        });

        // تعيين Custom Claims
        const claims = {
            admin: userRole === 'admin',
            manager: userRole === 'manager',
            viewer: userRole === 'viewer'
        };

        await admin.auth().setCustomUserClaims(userRecord.uid, claims);

        // إنشاء سجل في Firestore
        await db.collection('user_roles').doc(userRecord.uid).set({
            email: userRecord.email,
            displayName: userRecord.displayName,
            role: userRole,
            isOriginalUser: isOriginalAdminEmail(userRecord.email),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: createdBy || context.auth.uid
        });

        // تسجيل في Audit Trail
        await db.collection('audit_logs').add({
            action: 'user_creation',
            targetUid: userRecord.uid,
            targetEmail: userRecord.email,
            targetDisplayName: userRecord.displayName,
            role: userRole,
            performedBy: createdBy || context.auth.uid,
            performedByEmail: context.auth.token.email,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return { 
            success: true, 
            message: 'تم إنشاء المستخدم بنجاح',
            uid: userRecord.uid
        };

    } catch (error) {
        console.error('Error creating user:', error);
        throw new functions.https.HttpsError('internal', 'فشل إنشاء المستخدم');
    }
});

/**
 * تعيين دور افتراضي للمستخدمين الجدد تلقائياً
 */
exports.assignDefaultRoleOnSignup = functions.auth.user().onCreate(async (user) => {
    try {
        // التحقق مما إذا كان المستخدم لديه دور بالفعل
        const hasClaims = user.customClaims && (
            user.customClaims.admin || 
            user.customClaims.manager || 
            user.customClaims.viewer
        );

        if (hasClaims) {
            console.log(`User ${user.email} already has role claims`);
            return;
        }

        const isOriginalAdmin = isOriginalAdminEmail(user.email);
        const assignedRole = isOriginalAdmin ? 'admin' : 'viewer';

        await admin.auth().setCustomUserClaims(user.uid, {
            admin: assignedRole === 'admin',
            manager: false,
            viewer: assignedRole === 'viewer'
        });

        // إنشاء سجل في Firestore
        await db.collection('user_roles').doc(user.uid).set({
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            role: assignedRole,
            isOriginalUser: isOriginalAdmin,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: 'system'
        });

        console.log(`✅ Assigned ${assignedRole} role to new user: ${user.email}`);

    } catch (error) {
        console.error('Error assigning default role:', error);
    }
});

exports.syncOriginalAdminRole = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً');
    }

    const userRecord = await admin.auth().getUser(context.auth.uid);
    if (!isOriginalAdminEmail(userRecord.email)) {
        throw new functions.https.HttpsError('permission-denied', 'هذا المستخدم ليس من المستخدمين الأصليين');
    }

    await admin.auth().setCustomUserClaims(userRecord.uid, {
        admin: true,
        manager: false,
        viewer: false
    });

    await db.collection('user_roles').doc(userRecord.uid).set({
        email: userRecord.email,
        displayName: userRecord.displayName || userRecord.email.split('@')[0],
        role: 'admin',
        isOriginalUser: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: 'system-bootstrap'
    }, { merge: true });

    return {
        success: true,
        role: 'admin',
        isOriginalUser: true
    };
});

/**
 * الحصول على دور المستخدم الحالي
 */
async function getUserCurrentRole(uid) {
    try {
        const userRoleDoc = await db.collection('user_roles').doc(uid).get();
        if (userRoleDoc.exists) {
            return userRoleDoc.data().role;
        }
        
        // التحقق من Custom Claims
        const userRecord = await admin.auth().getUser(uid);
        const claims = userRecord.customClaims || {};
        
        if (isOriginalAdminEmail(userRecord.email)) return 'admin';
        if (claims.admin) return 'admin';
        if (claims.manager) return 'manager';
        if (claims.viewer) return 'viewer';
        
        return 'viewer';
    } catch (error) {
        console.error('Error getting user current role:', error);
        return 'viewer';
    }
}

/**
 * التحقق من صلاحيات المستخدم للوصول إلى مورد معين
 */
exports.checkResourceAccess = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'غير مصدق');
    }

    const { resource, action } = data;
    const userRole = context.auth.token.admin ? 'admin' : 
                     context.auth.token.manager ? 'manager' : 
                     context.auth.token.viewer ? 'viewer' : 'viewer';

    // قواعد الصلاحيات
    const permissions = {
        'inventory': {
            'read': ['admin', 'manager', 'viewer'],
            'write': ['admin', 'manager'],
            'delete': ['admin']
        },
        'users': {
            'read': ['admin'],
            'write': ['admin'],
            'delete': ['admin']
        },
        'reports': {
            'read': ['admin', 'manager', 'viewer'],
            'export': ['admin', 'manager']
        },
        'settings': {
            'read': ['admin'],
            'write': ['admin']
        }
    };

    const resourcePerms = permissions[resource];
    if (!resourcePerms) {
        throw new functions.https.HttpsError('invalid-argument', 'مورد غير صالح');
    }

    const actionPerms = resourcePerms[action];
    if (!actionPerms) {
        throw new functions.https.HttpsError('invalid-argument', 'إجراء غير صالح');
    }

    const hasAccess = actionPerms.includes(userRole);

    return {
        hasAccess: hasAccess,
        userRole: userRole,
        resource: resource,
        action: action
    };
});

// ============================================
// ACCOUNTING SYSTEM CLOUD FUNCTIONS
// ============================================

/**
 * Create Journal Entry for Stock Movement
 * Triggered when item quantity changes
 */
exports.onStockMovementCreate = functions.firestore
    .document('Items/{itemId}')
    .onWrite(async (change, context) => {
        const beforeData = change.before.data();
        const afterData = change.after.data();
        
        if (!beforeData && !afterData) return;
        
        // Skip if quantity didn't change
        if (beforeData && afterData && beforeData.quantity === afterData.quantity) return;
        
        const itemId = context.params.itemId;
        const newQuantity = afterData ? afterData.quantity || 0 : 0;
        const oldQuantity = beforeData ? beforeData.quantity || 0 : 0;
        const unitPrice = afterData ? afterData.unitPrice || 0 : (beforeData ? beforeData.unitPrice || 0 : 0);
        
        const quantityDiff = newQuantity - oldQuantity;
        const valueDiff = Math.abs(quantityDiff * unitPrice);
        
        if (quantityDiff === 0) return;
        
        try {
            if (quantityDiff > 0) {
                // Stock IN - Debit Inventory, Credit Suppliers/Expenses
                await createDoubleEntry({
                    date: new Date(),
                    type: 'IN',
                    reference: `STOCK_IN_${itemId}`,
                    description: `إضافة مخزون: ${afterData.name || 'صنف'}`,
                    debit: valueDiff,
                    credit: 0,
                    account: 'inventory',
                    itemId: itemId,
                    quantity: quantityDiff,
                    unitPrice: unitPrice
                });
                
                await createDoubleEntry({
                    date: new Date(),
                    type: 'IN',
                    reference: `STOCK_IN_${itemId}`,
                    description: `مقابل إضافة مخزون: ${afterData.name || 'صنف'}`,
                    debit: 0,
                    credit: valueDiff,
                    account: 'suppliers',
                    itemId: itemId,
                    quantity: quantityDiff,
                    unitPrice: unitPrice
                });
            } else {
                // Stock OUT - Credit Inventory, Debit Expenses/Custody
                await createDoubleEntry({
                    date: new Date(),
                    type: 'OUT',
                    reference: `STOCK_OUT_${itemId}`,
                    description: `صرف مخزون: ${afterData.name || 'صنف'}`,
                    debit: 0,
                    credit: valueDiff,
                    account: 'inventory',
                    itemId: itemId,
                    quantity: Math.abs(quantityDiff),
                    unitPrice: unitPrice
                });
                
                await createDoubleEntry({
                    date: new Date(),
                    type: 'OUT',
                    reference: `STOCK_OUT_${itemId}`,
                    description: `مقابل صرف مخزون: ${afterData.name || 'صنف'}`,
                    debit: valueDiff,
                    credit: 0,
                    account: 'expenses',
                    itemId: itemId,
                    quantity: Math.abs(quantityDiff),
                    unitPrice: unitPrice
                });
            }
            
            console.log(`Stock movement journal entry created for item: ${itemId}`);
        } catch (error) {
            console.error('Error creating stock movement journal entry:', error);
        }
    });

/**
 * Create Journal Entry for Scrap/Disposal
 * Triggered when scrap record is created
 */
exports.onScrapCreate = functions.firestore
    .document('Scraps/{scrapId}')
    .onCreate(async (snapshot, context) => {
        const scrapData = snapshot.data();
        const scrapId = context.params.scrapId;
        
        try {
            // Credit Inventory (remove value)
            await createDoubleEntry({
                date: new Date(),
                type: 'SCRAP',
                reference: scrapId,
                description: `خردة: ${scrapData.description || 'قطعة'}`,
                debit: 0,
                credit: scrapData.value || 0,
                account: 'inventory',
                itemId: scrapData.itemId,
                scrapValue: scrapData.value
            });
            
            // Debit Scrap/Loss Account
            await createDoubleEntry({
                date: new Date(),
                type: 'SCRAP',
                reference: scrapId,
                description: `خسارة خردة: ${scrapData.description || 'قطعة'}`,
                debit: scrapData.value || 0,
                credit: 0,
                account: 'scrap',
                itemId: scrapData.itemId,
                scrapValue: scrapData.value
            });
            
            console.log(`Scrap journal entry created: ${scrapId}`);
        } catch (error) {
            console.error('Error creating scrap journal entry:', error);
        }
    });

/**
 * Create Journal Entry for Inventory Adjustment
 * Triggered when adjustment record is created
 */
exports.onInventoryAdjustment = functions.firestore
    .document('InventoryAdjustments/{adjustmentId}')
    .onCreate(async (snapshot, context) => {
        const adjustmentData = snapshot.data();
        const adjustmentId = context.params.adjustmentId;
        
        try {
            const { itemId, systemQuantity, actualQuantity, unitPrice, description } = adjustmentData;
            const difference = actualQuantity - systemQuantity;
            const adjustmentValue = Math.abs(difference * unitPrice);
            
            if (difference > 0) {
                // Surplus - Debit Inventory, Credit Expenses (as income)
                await createDoubleEntry({
                    date: new Date(),
                    type: 'ADJUSTMENT',
                    reference: adjustmentId,
                    description: `تسوية جرد - فائض: ${description}`,
                    debit: adjustmentValue,
                    credit: 0,
                    account: 'inventory',
                    itemId: itemId,
                    adjustmentQuantity: difference,
                    unitPrice: unitPrice
                });
                
                await createDoubleEntry({
                    date: new Date(),
                    type: 'ADJUSTMENT',
                    reference: adjustmentId,
                    description: `أرباح تسوية جرد: ${description}`,
                    debit: 0,
                    credit: adjustmentValue,
                    account: 'expenses',
                    itemId: itemId,
                    adjustmentQuantity: difference,
                    unitPrice: unitPrice
                });
            } else if (difference < 0) {
                // Shortage - Credit Inventory, Debit Scrap/Loss
                await createDoubleEntry({
                    date: new Date(),
                    type: 'ADJUSTMENT',
                    reference: adjustmentId,
                    description: `تسوية جرد - عجز: ${description}`,
                    debit: 0,
                    credit: adjustmentValue,
                    account: 'inventory',
                    itemId: itemId,
                    adjustmentQuantity: difference,
                    unitPrice: unitPrice
                });
                
                await createDoubleEntry({
                    date: new Date(),
                    type: 'ADJUSTMENT',
                    reference: adjustmentId,
                    description: `خسارة تسوية جرد: ${description}`,
                    debit: adjustmentValue,
                    credit: 0,
                    account: 'scrap',
                    itemId: itemId,
                    adjustmentQuantity: difference,
                    unitPrice: unitPrice
                });
            }
            
            console.log(`Inventory adjustment journal entry created: ${adjustmentId}`);
        } catch (error) {
            console.error('Error creating inventory adjustment journal entry:', error);
        }
    });

/**
 * Create Journal Entry for Custody Settlement
 * Triggered when custody is settled
 */
exports.onCustodySettlement = functions.firestore
    .document('CustodySettlements/{settlementId}')
    .onCreate(async (snapshot, context) => {
        const settlementData = snapshot.data();
        const settlementId = context.params.settlementId;
        
        try {
            const { amount, custodyOfficer, description } = settlementData;
            
            // Credit Custody Account
            await createDoubleEntry({
                date: new Date(),
                type: 'SETTLEMENT',
                reference: settlementId,
                description: `تصفية عهدة: ${description}`,
                debit: 0,
                credit: amount,
                account: 'custody',
                custodyOfficer: custodyOfficer,
                settlementAmount: amount
            });
            
            // Debit Expenses
            await createDoubleEntry({
                date: new Date(),
                type: 'SETTLEMENT',
                reference: settlementId,
                description: `مصروفات تصفية عهدة: ${description}`,
                debit: amount,
                credit: 0,
                account: 'expenses',
                custodyOfficer: custodyOfficer,
                settlementAmount: amount
            });
            
            console.log(`Custody settlement journal entry created: ${settlementId}`);
        } catch (error) {
            console.error('Error creating custody settlement journal entry:', error);
        }
    });

/**
 * Create Journal Entry for Supplier Transaction
 * Triggered when supplier transaction is created
 */
exports.onSupplierTransaction = functions.firestore
    .document('SupplierTransactions/{transactionId}')
    .onCreate(async (snapshot, context) => {
        const transactionData = snapshot.data();
        const transactionId = context.params.transactionId;
        
        try {
            const { supplierId, amount, type, description, itemId } = transactionData;
            
            if (type === 'purchase') {
                // Debit Inventory, Credit Supplier
                await createDoubleEntry({
                    date: new Date(),
                    type: 'PURCHASE',
                    reference: transactionId,
                    description: `شراء من مورد: ${description}`,
                    debit: amount,
                    credit: 0,
                    account: 'inventory',
                    supplierId: supplierId,
                    itemId: itemId,
                    purchaseAmount: amount
                });
                
                await createDoubleEntry({
                    date: new Date(),
                    type: 'PURCHASE',
                    reference: transactionId,
                    description: `ذمة مورد: ${description}`,
                    debit: 0,
                    credit: amount,
                    account: 'suppliers',
                    supplierId: supplierId,
                    itemId: itemId,
                    purchaseAmount: amount
                });
                
                // Update supplier balance
                await updateSupplierBalance(supplierId, -amount);
            } else if (type === 'payment') {
                // Debit Supplier, Credit Cash/Bank
                await createDoubleEntry({
                    date: new Date(),
                    type: 'PAYMENT',
                    reference: transactionId,
                    description: `سداد لمورد: ${description}`,
                    debit: amount,
                    credit: 0,
                    account: 'suppliers',
                    supplierId: supplierId,
                    paymentAmount: amount
                });
                
                await createDoubleEntry({
                    date: new Date(),
                    type: 'PAYMENT',
                    reference: transactionId,
                    description: `نقدية/بنك سداد مورد: ${description}`,
                    debit: 0,
                    credit: amount,
                    account: 'cash',
                    supplierId: supplierId,
                    paymentAmount: amount
                });
                
                // Update supplier balance
                await updateSupplierBalance(supplierId, amount);
            }
            
            console.log(`Supplier transaction journal entry created: ${transactionId}`);
        } catch (error) {
            console.error('Error creating supplier transaction journal entry:', error);
        }
    });

/**
 * Helper function to create double-entry journal entries
 */
async function createDoubleEntry(entryData) {
    const entry = {
        ...entryData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'system'
    };
    
    await db.collection('JournalEntries').add(entry);
}

/**
 * Helper function to update supplier balance
 */
async function updateSupplierBalance(supplierId, amount) {
    const supplierRef = db.collection('Suppliers').doc(supplierId);
    
    await db.runTransaction(async (transaction) => {
        const supplierDoc = await transaction.get(supplierRef);
        
        if (!supplierDoc.exists) {
            throw new Error('Supplier does not exist');
        }
        
        const currentBalance = supplierDoc.data().currentBalance || 0;
        const newBalance = currentBalance + amount;
        
        transaction.update(supplierRef, {
            currentBalance: newBalance,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });
}

/**
 * Generate Accounting Reports
 * Callable function for generating various accounting reports
 */
exports.generateAccountingReport = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'غير مصدق');
    }
    
    const { reportType, startDate, endDate } = data;
    
    try {
        let reportData = {};
        
        switch (reportType) {
            case 'trial_balance':
                reportData = await generateTrialBalance(startDate, endDate);
                break;
            case 'income_statement':
                reportData = await generateIncomeStatement(startDate, endDate);
                break;
            case 'balance_sheet':
                reportData = await generateBalanceSheet(startDate, endDate);
                break;
            case 'ledger':
                reportData = await generateLedgerReport(startDate, endDate);
                break;
            default:
                throw new functions.https.HttpsError('invalid-argument', 'نوع تقرير غير صالح');
        }
        
        return { success: true, data: reportData };
    } catch (error) {
        console.error('Error generating accounting report:', error);
        throw new functions.https.HttpsError('internal', 'فشل إنشاء التقرير');
    }
});

/**
 * Generate Trial Balance
 */
async function generateTrialBalance(startDate, endDate) {
    const entriesSnapshot = await db.collection('JournalEntries')
        .where('date', '>=', new Date(startDate))
        .where('date', '<=', new Date(endDate))
        .get();
    
    const accounts = {};
    
    entriesSnapshot.docs.forEach(doc => {
        const entry = doc.data();
        const account = entry.account;
        
        if (!accounts[account]) {
            accounts[account] = { debit: 0, credit: 0 };
        }
        
        accounts[account].debit += entry.debit || 0;
        accounts[account].credit += entry.credit || 0;
    });
    
    return {
        title: 'ميزان المراجعة',
        period: `${startDate} - ${endDate}`,
        accounts: accounts,
        totalDebit: Object.values(accounts).reduce((sum, acc) => sum + acc.debit, 0),
        totalCredit: Object.values(accounts).reduce((sum, acc) => sum + acc.credit, 0)
    };
}

/**
 * Generate Income Statement
 */
async function generateIncomeStatement(startDate, endDate) {
    const entriesSnapshot = await db.collection('JournalEntries')
        .where('date', '>=', new Date(startDate))
        .where('date', '<=', new Date(endDate))
        .get();
    
    let revenue = 0;
    let expenses = 0;
    let scrapLoss = 0;
    
    entriesSnapshot.docs.forEach(doc => {
        const entry = doc.data();
        
        if (entry.account === 'expenses') {
            expenses += entry.debit || 0;
            expenses -= entry.credit || 0;
        } else if (entry.account === 'scrap') {
            scrapLoss += entry.debit || 0;
            scrapLoss -= entry.credit || 0;
        }
    });
    
    const totalExpenses = expenses + scrapLoss;
    const netIncome = revenue - totalExpenses;
    
    return {
        title: 'قائمة الدخل',
        period: `${startDate} - ${endDate}`,
        revenue: revenue,
        expenses: expenses,
        scrapLoss: scrapLoss,
        totalExpenses: totalExpenses,
        netIncome: netIncome
    };
}

/**
 * Generate Balance Sheet
 */
async function generateBalanceSheet(startDate, endDate) {
    const entriesSnapshot = await db.collection('JournalEntries')
        .where('date', '<=', new Date(endDate))
        .get();
    
    const accounts = {
        inventory: 0,
        custody: 0,
        suppliers: 0,
        cash: 0,
        expenses: 0,
        scrap: 0
    };
    
    entriesSnapshot.docs.forEach(doc => {
        const entry = doc.data();
        const account = entry.account;
        
        if (accounts.hasOwnProperty(account)) {
            accounts[account] += (entry.debit || 0) - (entry.credit || 0);
        }
    });
    
    const assets = accounts.inventory + accounts.custody + accounts.cash;
    const liabilities = Math.abs(accounts.suppliers);
    const equity = assets - liabilities;
    
    return {
        title: 'الميزانية العمومية',
        asOf: endDate,
        assets: {
            inventory: accounts.inventory,
            custody: accounts.custody,
            cash: accounts.cash,
            total: assets
        },
        liabilities: {
            suppliers: liabilities,
            total: liabilities
        },
        equity: equity,
        totalLiabilitiesAndEquity: liabilities + equity
    };
}

/**
 * Generate Detailed Ledger Report
 */
async function generateLedgerReport(startDate, endDate) {
    const entriesSnapshot = await db.collection('JournalEntries')
        .where('date', '>=', new Date(startDate))
        .where('date', '<=', new Date(endDate))
        .orderBy('date', 'desc')
        .get();
    
    const entries = entriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date.toDate()
    }));
    
    return {
        title: 'دفتر الأستاذ',
        period: `${startDate} - ${endDate}`,
        entries: entries,
        totalCount: entries.length
    };
}

Object.assign(exports, require("../cloud_functions.js"));
