// js/user-management.js - User Management Interface
import { auth } from './firebase-config.js';
import {
    getAllUsers,
    assignUserRole,
    deleteUser,
    createUserWithRole,
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

let currentUsers = [];
let currentSort = { column: 'email', order: 'asc' };
let autoRefreshInterval = null;

export async function renderUsersTable(containerId) {
    try {
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }

        container.innerHTML = '<div class="loading">جارٍ تحميل المستخدمين...</div>';

        const users = await fetchAllUsers();
        const originalUsers = await getOriginalUsers();
        const originalUserEmails = new Set(originalUsers.map(user => String(user.email || '').toLowerCase()));

        currentUsers = users.map(user => ({
            ...user,
            isOriginal: Boolean(user.isOriginal || originalUserEmails.has(String(user.email || '').toLowerCase()))
        }));

        renderTable(container, currentUsers);
        bindFilters();
    } catch (error) {
        console.error('Error rendering users table:', error);
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="error-message">
                    <h3>خطأ في تحميل المستخدمين</h3>
                    <p>${error.message}</p>
                    <button onclick="location.reload()" class="retry-btn">إعادة المحاولة</button>
                </div>
            `;
        }
    }
}

export async function fetchAllUsers() {
    try {
        const result = await getAllUsers();
        return result.data || result;
    } catch (error) {
        console.error('Error fetching users:', error);
        throw new Error(error.message);
    }
}

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
                <button id="export-users" class="export-btn"><i class="fas fa-file-export"></i> تصدير CSV</button>
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
                        <th onclick="sortUsersByColumn('displayName')">الاسم</th>
                        <th onclick="sortUsersByColumn('email')">البريد الإلكتروني</th>
                        <th onclick="sortUsersByColumn('role')">الدور</th>
                        <th onclick="sortUsersByColumn('createdAt')">تاريخ الإنشاء</th>
                        <th onclick="sortUsersByColumn('lastSignIn')">آخر تسجيل دخول</th>
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

function renderUserRow(user, currentUserUID) {
    const isOriginal = user.isOriginal;
    const cannotChangeRole = isOriginal || user.uid === currentUserUID;
    const cannotDelete = isOriginal || user.uid === currentUserUID;

    return `
        <tr data-uid="${user.uid}" class="${isOriginal ? 'original-user-row' : ''}">
            <td>
                ${user.displayName || 'غير محدد'}
                ${isOriginal ? '<span class="badge-original">أصلي</span>' : ''}
            </td>
            <td>${user.email}</td>
            <td>
                <select class="role-select" data-uid="${user.uid}" ${cannotChangeRole ? 'disabled' : ''}>
                    <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                    <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
                ${isOriginal ? '<br><small class="original-note">مستخدم أصلي</small>' : ''}
            </td>
            <td>${formatDate(user.createdAt)}</td>
            <td>${formatDate(user.lastSignIn, 'لم يسجل بعد')}</td>
            <td class="actions-cell">
                ${!cannotDelete
                    ? `<button class="delete-user-btn" data-uid="${user.uid}" data-email="${user.email}" data-name="${user.displayName || user.email}">حذف</button>`
                    : isOriginal
                        ? '<span class="protected-user">محمي</span>'
                        : '<span class="current-user">أنت</span>'
                }
            </td>
        </tr>
    `;
}

function bindFilters() {
    const searchInput = document.getElementById('user-search');
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('input', async (e) => {
            const searchTerm = e.target.value.trim();
            const searchedUsers = await searchUsers(searchTerm);
            const originalEmails = new Set(currentUsers.filter(user => user.isOriginal).map(user => user.email));
            const normalized = searchedUsers.map(user => ({
                ...user,
                isOriginal: Boolean(user.isOriginal || originalEmails.has(user.email))
            }));
            updateTable(normalized);
        });
    }

    const roleFilter = document.getElementById('role-filter');
    if (roleFilter && !roleFilter.dataset.bound) {
        roleFilter.dataset.bound = 'true';
        roleFilter.addEventListener('change', (e) => {
            updateTable(filterUsersByRole(currentUsers, e.target.value));
        });
    }

    const exportBtn = document.getElementById('export-users');
    if (exportBtn && !exportBtn.dataset.bound) {
        exportBtn.dataset.bound = 'true';
        exportBtn.addEventListener('click', () => {
            exportUsersToCSV(currentUsers);
        });
    }
}

function updateTable(users) {
    const tbody = document.querySelector('.users-table tbody');
    if (!tbody) {
        return;
    }

    const currentUserUID = auth.currentUser?.uid;
    tbody.innerHTML = users.map(user => renderUserRow(user, currentUserUID)).join('');
}

async function handleRoleChange(uid, newRole, user) {
    try {
        const original = await isOriginalUser(uid);
        const permissionCheck = canChangeUserRole(user.role, getCurrentUserRole(), original);

        if (!permissionCheck.allowed) {
            showNotification('error', permissionCheck.reason);
            await renderUsersTable('users-table-container');
            return;
        }

        await assignUserRole(uid, newRole);
        await logRoleChange(uid, user.email, user.role, newRole, auth.currentUser.uid);
        showNotification('success', `تم تغيير دور ${user.email} إلى ${newRole}`);
    } catch (error) {
        console.error('Error changing user role:', error);
        showNotification('error', `فشل تغيير الدور: ${error.message}`);
    }
}

async function handleUserDeletion(uid, email, name) {
    try {
        const original = await isOriginalUser(uid);
        if (original) {
            showNotification('error', 'لا يمكن حذف المستخدمين الأصليين');
            return;
        }

        await deleteUser(uid);
        showNotification('success', `تم حذف المستخدم ${name || email}`);
    } catch (error) {
        console.error('Error deleting user:', error);
        showNotification('error', `فشل حذف المستخدم: ${error.message}`);
    }
}

async function handleCreateUser(form) {
    const nameInput = document.getElementById('new-user-name');
    const emailInput = document.getElementById('new-user-email');
    const passwordInput = document.getElementById('new-user-password');
    const roleInput = document.getElementById('new-user-role');
    const submitBtn = document.getElementById('create-user-btn');

    const displayName = nameInput?.value.trim();
    const email = emailInput?.value.trim().toLowerCase();
    const password = passwordInput?.value;
    const role = roleInput?.value || 'viewer';

    if (!displayName || !email || !password) {
        showNotification('error', 'يرجى إدخال جميع بيانات المستخدم الجديد');
        return;
    }

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'جارٍ إنشاء المستخدم...';

        await createUserWithRole(email, password, displayName, role);
        form.reset();
        showNotification('success', `تم إنشاء المستخدم ${email} بنجاح`);
    } catch (error) {
        console.error('Error creating user:', error);
        showNotification('error', `فشل إنشاء المستخدم: ${error.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> إنشاء المستخدم';
    }
}

function showNotification(type, message) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function formatDate(value, fallback = 'غير معروف') {
    if (!value) {
        return fallback;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return fallback;
    }

    return date.toLocaleDateString('ar-EG');
}

export async function updateUserStatistics(containerId) {
    try {
        const stats = await getRoleStatistics();
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }

        container.innerHTML = `
            <div class="stat-card">
                <h3>إجمالي المستخدمين</h3>
                <span class="stat-number">${stats.total}</span>
            </div>
            <div class="stat-card admin">
                <h3>المشرفون</h3>
                <span class="stat-number">${stats.admin}</span>
            </div>
            <div class="stat-card manager">
                <h3>المديرون</h3>
                <span class="stat-number">${stats.manager}</span>
            </div>
            <div class="stat-card viewer">
                <h3>المشاهدون</h3>
                <span class="stat-number">${stats.viewer}</span>
            </div>
            <div class="stat-card original">
                <h3>المستخدمون الأصليون</h3>
                <span class="stat-number">${stats.originalUsers}</span>
            </div>
        `;
    } catch (error) {
        console.error('Error updating user statistics:', error);
    }
}

export async function initUserManagement() {
    if (!isAdmin()) {
        console.warn('User management requires admin privileges');
        return;
    }

    await renderUsersTable('users-table-container');
    await updateUserStatistics('user-stats-container');
    setupAdditionalEvents();
}

function setupAdditionalEvents() {
    const tableContainer = document.getElementById('users-table-container');
    if (tableContainer && !tableContainer.dataset.bound) {
        tableContainer.dataset.bound = 'true';

        tableContainer.addEventListener('change', async (e) => {
            if (!e.target.classList.contains('role-select')) {
                return;
            }

            const uid = e.target.dataset.uid;
            const user = currentUsers.find(item => item.uid === uid);
            if (!user || user.role === e.target.value) {
                return;
            }

            await handleRoleChange(uid, e.target.value, user);
            await renderUsersTable('users-table-container');
            await updateUserStatistics('user-stats-container');
        });

        tableContainer.addEventListener('click', async (e) => {
            const button = e.target.closest('.delete-user-btn');
            if (!button) {
                return;
            }

            const { uid, email, name } = button.dataset;
            if (confirm(`هل أنت متأكد من حذف المستخدم "${name}" (${email})؟\n\nهذا الإجراء لا يمكن التراجع عنه!`)) {
                await handleUserDeletion(uid, email, name);
                await renderUsersTable('users-table-container');
                await updateUserStatistics('user-stats-container');
            }
        });
    }

    const createForm = document.getElementById('create-user-form');
    if (createForm && !createForm.dataset.bound) {
        createForm.dataset.bound = 'true';
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleCreateUser(createForm);
            await renderUsersTable('users-table-container');
            await updateUserStatistics('user-stats-container');
        });
    }

    if (!autoRefreshInterval) {
        autoRefreshInterval = setInterval(async () => {
            try {
                await renderUsersTable('users-table-container');
                await updateUserStatistics('user-stats-container');
            } catch (error) {
                console.error('Auto-refresh error:', error);
            }
        }, 30000);
    }
}
