// js/user-management.js - User Management Interface
import { auth, db, collection, getDocs, doc, getDoc } from './firebase-config.js';
import { 
    getAllUsers, 
    assignUserRole, 
    deleteUser, 
    isOriginalUser, 
    getOriginalUsers,
    canChangeUserRole,
    logRoleChange,
    searchUsers,
    filterUsersByRole,
    sortUsers,
    exportUsersToCSV,
    getRoleStatistics
} from './role-manager.js';
import { getCurrentUserRole, isAdmin } from './auth-guard.js';

// عرض جميع المستخدمين في جدول
export async function renderUsersTable(containerId) {
    try {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container with id '${containerId}' not found`);
            return;
        }

        container.innerHTML = '<div class="loading">جاري تحميل المستخدمين...</div>';
        
        // جلب جميع المستخدمين
        const users = await fetchAllUsers();
        
        // جلب قائمة المستخدمين الأصليين
        const originalUsers = await getOriginalUsers();
        const originalUserEmails = new Set(originalUsers.map(user => user.email));
        
        // إضافة خاصية isOriginal لكل مستخدم
        const usersWithOriginalFlag = users.map(user => ({
            ...user,
            isOriginal: originalUserEmails.has(user.email)
        }));
        
        // عرض الجدول
        renderTable(container, usersWithOriginalFlag);
        
        // إضافة أحداث الجدول
        setupTableEvents();
        
    } catch (error) {
        console.error('Error rendering users table:', error);
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="error-message">
                    <h3>❌ خطأ في تحميل المستخدمين</h3>
                    <p>${error.message}</p>
                    <button onclick="location.reload()" class="retry-btn">إعادة المحاولة</button>
                </div>
            `;
        }
    }
}

// جلب جميع المستخدمين مع التحقق من الصلاحيات
export async function fetchAllUsers() {
    try {
        const result = await getAllUsers();
        return result.data || result;
    } catch (error) {
        console.error('Error fetching users:', error);
        throw new Error(error.message);
    }
}

// عرض الجدول
function renderTable(container, users) {
    const currentUserUID = auth.currentUser?.uid;
    const currentUserRole = getCurrentUserRole();
    
    container.innerHTML = `
        <div class="users-controls">
            <div class="search-filter">
                <input type="text" id="user-search" placeholder="البحث عن مستخدم..." class="search-input">
                <select id="role-filter" class="filter-select">
                    <option value="all">جميع الأدوار</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="viewer">Viewer</option>
                </select>
                <button id="export-users" class="export-btn">📥 تصدير CSV</button>
            </div>
            <div class="stats">
                <span class="stat-item">المجموع: ${users.length}</span>
                <span class="stat-item">Admin: ${users.filter(u => u.role === 'admin').length}</span>
                <span class="stat-item">Manager: ${users.filter(u => u.role === 'manager').length}</span>
                <span class="stat-item">Viewer: ${users.filter(u => u.role === 'viewer').length}</span>
            </div>
        </div>
        
        <div class="table-container">
            <table class="users-table">
                <thead>
                    <tr>
                        <th onclick="sortUsersByColumn('displayName')">الاسم ↕</th>
                        <th onclick="sortUsersByColumn('email')">البريد الإلكتروني ↕</th>
                        <th onclick="sortUsersByColumn('role')">الدور ↕</th>
                        <th onclick="sortUsersByColumn('createdAt')">تاريخ الإنشاء ↕</th>
                        <th onclick="sortUsersByColumn('lastSignIn')">آخر تسجيل دخول ↕</th>
                        <th>الإجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => renderUserRow(user, currentUserUID, currentUserRole)).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// عرض صف مستخدم واحد
function renderUserRow(user, currentUserUID, currentUserRole) {
    const isOriginal = user.isOriginal;
    const cannotChangeRole = isOriginal || user.uid === currentUserUID;
    const cannotDelete = isOriginal || user.uid === currentUserUID;
    
    return `
        <tr data-uid="${user.uid}" class="${isOriginal ? 'original-user-row' : ''}">
            <td>
                ${user.displayName || 'غير محدد'}
                ${isOriginal ? '<span class="badge-original">⭐ أصلي</span>' : ''}
            </td>
            <td>${user.email}</td>
            <td>
                <select class="role-select" data-uid="${user.uid}" ${cannotChangeRole ? 'disabled' : ''}>
                    <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>👁️ Viewer</option>
                    <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>📊 Manager</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>👑 Admin</option>
                </select>
                ${isOriginal ? '<br><small class="original-note">🔒 مستخدم أصلي</small>' : ''}
            </td>
            <td>${user.createdAt ? new Date(user.createdAt).toLocaleDateString('ar-EG') : 'غير معروف'}</td>
            <td>${user.lastSignIn ? new Date(user.lastSignIn).toLocaleDateString('ar-EG') : 'لم يسجل بعد'}</td>
            <td class="actions-cell">
                ${!cannotDelete ? 
                    `<button class="delete-user-btn" data-uid="${user.uid}" data-email="${user.email}" data-name="${user.displayName || user.email}">🗑️ حذف</button>` : 
                    isOriginal ? '<span class="protected-user">🔒 محمي</span>' : 
                    '<span class="current-user">أنت</span>'
                }
            </td>
        </tr>
    `;
}

// إعداد أحداث الجدول
function setupTableEvents() {
    let currentUsers = [];
    let currentSort = { column: 'email', order: 'asc' };
    
    // جلب المستخدمين الحاليين
    fetchAllUsers().then(users => {
        currentUsers = users;
    });
    
    // البحث
    const searchInput = document.getElementById('user-search');
    if (searchInput) {
        searchInput.addEventListener('input', async (e) => {
            const searchTerm = e.target.value;
            const filtered = await searchUsers(searchTerm);
            updateTable(filtered);
        });
    }
    
    // فلترة حسب الدور
    const roleFilter = document.getElementById('role-filter');
    if (roleFilter) {
        roleFilter.addEventListener('change', async (e) => {
            const role = e.target.value;
            const filtered = filterUsersByRole(currentUsers, role);
            updateTable(filtered);
        });
    }
    
    // التصدير
    const exportBtn = document.getElementById('export-users');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportUsersToCSV(currentUsers);
        });
    }
    
    // تغيير الدور
    document.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', async (e) => {
            const uid = e.target.dataset.uid;
            const newRole = e.target.value;
            const user = currentUsers.find(u => u.uid === uid);
            
            if (user && user.role !== newRole) {
                await handleRoleChange(uid, newRole, user);
            }
        });
    });
    
    // الحذف
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const uid = e.target.dataset.uid;
            const email = e.target.dataset.email;
            const name = e.target.dataset.name;
            
            if (confirm(`هل أنت متأكد من حذف المستخدم "${name}" (${email})؟\n\nهذا الإجراء لا يمكن التراجع عنه!`)) {
                await handleUserDeletion(uid, email, name);
            }
        });
    });
    
    // تحديث الجدول
    function updateTable(users) {
        const tbody = document.querySelector('.users-table tbody');
        if (tbody) {
            const currentUserUID = auth.currentUser?.uid;
            const currentUserRole = getCurrentUserRole();
            
            tbody.innerHTML = users.map(user => renderUserRow(user, currentUserUID, currentUserRole)).join('');
            
            // إعادة إعداد الأحداث
            setupTableEvents();
        }
    }
    
    // الترتيب
    window.sortUsersByColumn = (column) => {
        if (currentSort.column === column) {
            currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = column;
            currentSort.order = 'asc';
        }
        
        const sorted = sortUsers(currentUsers, currentSort.column, currentSort.order);
        updateTable(sorted);
    };
}

// معالجة تغيير الدور
async function handleRoleChange(uid, newRole, user) {
    try {
        // التحقق من الصلاحيات
        const isOriginal = await isOriginalUser(uid);
        const permissionCheck = canChangeUserRole(user.role, getCurrentUserRole(), isOriginal);
        
        if (!permissionCheck.allowed) {
            alert(`❌ ${permissionCheck.reason}`);
            // إعادة القيمة القديمة
            const select = document.querySelector(`.role-select[data-uid="${uid}"]`);
            if (select) select.value = user.role;
            return;
        }
        
        // تغيير الدور
        await assignUserRole(uid, newRole);
        
        // تسجيل التغيير
        await logRoleChange(uid, user.email, user.role, newRole, auth.currentUser.uid);
        
        // تحديث الواجهة
        user.role = newRole;
        
        // عرض رسالة نجاح
        showNotification('success', `✅ تم تغيير دور "${user.email}" إلى ${newRole}`);
        
    } catch (error) {
        console.error('Error changing user role:', error);
        alert(`❌ فشل تغيير الدور: ${error.message}`);
        
        // إعادة القيمة القديمة
        const select = document.querySelector(`.role-select[data-uid="${uid}"]`);
        if (select) select.value = user.role;
    }
}

// معالجة حذف المستخدم
async function handleUserDeletion(uid, email, name) {
    try {
        // التحقق من أن المستخدم ليس أصلياً
        const isOriginal = await isOriginalUser(uid);
        if (isOriginal) {
            alert('❌ لا يمكن حذف المستخدمين الأصليين في النظام');
            return;
        }
        
        // حذف المستخدم
        await deleteUser(uid);
        
        // إزالة الصف من الجدول
        const row = document.querySelector(`tr[data-uid="${uid}"]`);
        if (row) {
            row.remove();
        }
        
        // عرض رسالة نجاح
        showNotification('success', `✅ تم حذف المستخدم "${name}" بنجاح`);
        
    } catch (error) {
        console.error('Error deleting user:', error);
        alert(`❌ فشل حذف المستخدم: ${error.message}`);
    }
}

// عرض الإشعارات
function showNotification(type, message) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        direction: rtl;
        ${type === 'success' ? 'background: #4caf50;' : 'background: #f44336;'}
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// تحديث إحصائيات المستخدمين
export async function updateUserStatistics(containerId) {
    try {
        const stats = await getRoleStatistics();
        const container = document.getElementById(containerId);
        
        if (container) {
            container.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <h3>👥 إجمالي المستخدمين</h3>
                        <span class="stat-number">${stats.total}</span>
                    </div>
                    <div class="stat-card admin">
                        <h3>👑 المشرفون</h3>
                        <span class="stat-number">${stats.admin}</span>
                    </div>
                    <div class="stat-card manager">
                        <h3>📊 المديرون</h3>
                        <span class="stat-number">${stats.manager}</span>
                    </div>
                    <div class="stat-card viewer">
                        <h3>👁️ المشاهدون</h3>
                        <span class="stat-number">${stats.viewer}</span>
                    </div>
                    <div class="stat-card original">
                        <h3>⭐ المستخدمون الأصليون</h3>
                        <span class="stat-number">${stats.originalUsers}</span>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error updating user statistics:', error);
    }
}

// تهيئة صفحة إدارة المستخدمين
export async function initUserManagement() {
    if (!isAdmin()) {
        console.warn('User management requires admin privileges');
        return;
    }
    
    // عرض جدول المستخدمين
    await renderUsersTable('users-table-container');
    
    // عرض الإحصائيات
    await updateUserStatistics('user-stats-container');
    
    // إعداد أحداث إضافية
    setupAdditionalEvents();
}

// إعداد أحداث إضافية
function setupAdditionalEvents() {
    // تحديث تلقائي كل 30 ثانية
    setInterval(async () => {
        try {
            await renderUsersTable('users-table-container');
            await updateUserStatistics('user-stats-container');
        } catch (error) {
            console.error('Auto-refresh error:', error);
        }
    }, 30000);
    
    // اختصارات لوحة المفاتيح
    document.addEventListener('keydown', (e) => {
        // Ctrl+E للتصدير
        if (e.ctrlKey && e.key === 'e') {
            e.preventDefault();
            const exportBtn = document.getElementById('export-users');
            if (exportBtn) exportBtn.click();
        }
        
        // Ctrl+F للبحث
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('user-search');
            if (searchInput) searchInput.focus();
        }
    });
}
