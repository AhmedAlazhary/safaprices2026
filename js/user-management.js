import { auth } from '../firebase-config.js';
import {
    getAllUsers,
    assignUserRole,
    deleteUser,
    createUserWithRole,
    isOriginalUser,
    getOriginalUsers,
    canChangeUserRole,
    logRoleChange,
    filterUsersByRole,
    sortUsers,
    exportUsersToCSV,
    getRoleStatistics,
    PAGE_REGISTRY,
    saveUserPagePermissions,
    getUserPagePermissions,
    getDefaultPermissions
} from './role-manager.js';
import { getCurrentUserRole, isAdmin } from './auth-guard-module.js';

let currentUsers = [];
let currentSort = { column: 'email', order: 'asc' };
let autoRefreshInterval = null;

export async function initUserManagement() {
    if (!isAdmin()) {
        console.warn('User management requires admin privileges');
        return;
    }

    await refreshUserManagement();
    setupStaticEvents();
}

export async function refreshUserManagement() {
    await renderUsersTable('users-table-container');
    await updateUserStatistics('user-stats-container');
}

export async function renderUsersTable(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<div class="loading">جارٍ تحميل المستخدمين...</div>';

    try {
        const [users, originalUsers] = await Promise.all([
            fetchAllUsers(),
            getOriginalUsers()
        ]);

        const originalEmails = new Set(originalUsers.map((user) => String(user.email || '').toLowerCase()));
        currentUsers = users.map((user) => ({
            ...user,
            isOriginal: Boolean(user.isOriginal || originalEmails.has(String(user.email || '').toLowerCase()))
        }));

        renderTable(container, currentUsers);
    } catch (error) {
        console.error('Error rendering users table:', error);
        container.innerHTML = `
            <div style="background:#f8d7da;border:1px solid #f5c6cb;border-radius:8px;padding:2rem;text-align:center;margin:2rem 0">
                <h3 style="color:#721c24;margin-bottom:1rem">خطأ في تحميل المستخدمين</h3>
                <p style="color:#721c24">${escapeHtml(error.message || 'حدث خطأ غير متوقع')}</p>
                <button class="retry-btn" onclick="location.reload()" style="margin-top:1rem">إعادة المحاولة</button>
            </div>
        `;
    }
}

async function fetchAllUsers() {
    const result = await getAllUsers();
    return result.users || result.data?.users || [];
}

function renderTable(container, users) {
    const currentUserUID = auth.currentUser?.uid;

    container.innerHTML = `
        <div class="users-controls">
            <div class="search-filter">
                <input type="text" id="user-search" placeholder="ابحث بالاسم أو البريد الإلكتروني" class="search-input">
                <select id="role-filter" class="filter-select">
                    <option value="all">كل الأدوار</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="viewer">Viewer</option>
                </select>
                <button type="button" id="export-users" class="export-btn">
                    <i class="fas fa-file-export"></i> تصدير CSV
                </button>
            </div>
            <div class="stats">
                <span class="stat-item">الإجمالي: ${users.length}</span>
                <span class="stat-item">Admins: ${users.filter((user) => user.role === 'admin').length}</span>
                <span class="stat-item">Managers: ${users.filter((user) => user.role === 'manager').length}</span>
                <span class="stat-item">Viewers: ${users.filter((user) => user.role === 'viewer').length}</span>
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
                    ${users.map((user) => renderUserRow(user, currentUserUID)).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderUserRow(user, currentUserUID) {
    const isOriginal = user.isOriginal;
    const cannotChangeRole = isOriginal || user.uid === currentUserUID;
    const cannotDelete = isOriginal || user.uid === currentUserUID;
    const safeName = escapeHtml(user.displayName || 'غير محدد');
    const safeEmail = escapeHtml(user.email || '');
    const safeUid = escapeHtml(user.uid || '');

    return `
        <tr data-uid="${safeUid}" class="${isOriginal ? 'original-user-row' : ''}">
            <td>
                ${safeName}
                ${isOriginal ? '<span class="badge-original">أصلي</span>' : ''}
            </td>
            <td>${safeEmail}</td>
            <td>
                <select class="role-select" data-uid="${safeUid}" ${cannotChangeRole ? 'disabled' : ''}>
                    <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                    <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
                ${isOriginal ? '<br><small class="original-note">مستخدم أصلي ومحمي</small>' : ''}
            </td>
            <td>${formatDate(user.createdAt)}</td>
            <td>${formatDate(user.lastSignIn, 'لم يسجل بعد')}</td>
            <td class="actions-cell">
                ${cannotDelete
                    ? (isOriginal ? '<span class="protected-user">محمي</span>' : '<span class="current-user">أنت</span>')
                    : `<button type="button" class="delete-user-btn" data-uid="${safeUid}" data-email="${safeEmail}" data-name="${safeName}">حذف</button>`
                }
            </td>
        </tr>
    `;
}

function setupStaticEvents() {
    setupTableDelegation();
    setupCreateUserForm();
    setupToolbarEvents();
    setupAutoRefresh();
}

function setupTableDelegation() {
    const tableContainer = document.getElementById('users-table-container');
    if (!tableContainer || tableContainer.dataset.bound === 'true') return;
    tableContainer.dataset.bound = 'true';

    tableContainer.addEventListener('change', async (event) => {
        const select = event.target.closest('.role-select');
        if (!select) return;

        const uid = select.dataset.uid;
        const newRole = select.value;
        const user = currentUsers.find((item) => item.uid === uid);
        if (!user || user.role === newRole) return;

        await handleRoleChange(uid, newRole, user);
        await refreshUserManagement();
    });

    tableContainer.addEventListener('click', async (event) => {
        const deleteButton = event.target.closest('.delete-user-btn');
        if (!deleteButton) return;

        const { uid, email, name } = deleteButton.dataset;
        const confirmed = confirm(`هل تريد حذف المستخدم "${name}" (${email})؟\n\nلا يمكن التراجع عن هذا الإجراء.`);
        if (!confirmed) return;

        await handleUserDeletion(uid, email, name);
        await refreshUserManagement();
    });
}

function setupCreateUserForm() {
    const form = document.getElementById('create-user-form');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await handleCreateUser(form);
        await refreshUserManagement();
    });
}

function setupToolbarEvents() {
    const searchInput = document.getElementById('user-search');
    if (searchInput && searchInput.dataset.bound !== 'true') {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('input', () => {
            applyFilters();
        });
    }

    const roleFilter = document.getElementById('role-filter');
    if (roleFilter && roleFilter.dataset.bound !== 'true') {
        roleFilter.dataset.bound = 'true';
        roleFilter.addEventListener('change', () => {
            applyFilters();
        });
    }

    const exportButton = document.getElementById('export-users');
    if (exportButton && exportButton.dataset.bound !== 'true') {
        exportButton.dataset.bound = 'true';
        exportButton.addEventListener('click', () => {
            exportUsersToCSV(currentUsers);
        });
    }

    window.sortUsersByColumn = (column) => {
        if (currentSort.column === column) {
            currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = column;
            currentSort.order = 'asc';
        }

        const sorted = sortUsers([...currentUsers], currentSort.column, currentSort.order);
        updateRenderedRows(sorted);
    };
}

function applyFilters() {
    const searchValue = String(document.getElementById('user-search')?.value || '').trim().toLowerCase();
    const roleValue = String(document.getElementById('role-filter')?.value || 'all');

    let filtered = [...currentUsers];

    if (roleValue !== 'all') {
        filtered = filterUsersByRole(filtered, roleValue);
    }

    if (searchValue) {
        filtered = filtered.filter((user) => {
            const email = String(user.email || '').toLowerCase();
            const displayName = String(user.displayName || '').toLowerCase();
            return email.includes(searchValue) || displayName.includes(searchValue);
        });
    }

    updateRenderedRows(filtered);
}

function updateRenderedRows(users) {
    const tbody = document.querySelector('.users-table tbody');
    if (!tbody) return;

    const currentUserUID = auth.currentUser?.uid;
    tbody.innerHTML = users.map((user) => renderUserRow(user, currentUserUID)).join('');
}

async function handleRoleChange(uid, newRole, user) {
    try {
        const original = await isOriginalUser(uid);
        const permissionCheck = canChangeUserRole(user.role, getCurrentUserRole(), original);

        if (!permissionCheck.allowed) {
            showNotification('error', permissionCheck.reason || 'لا يمكن تغيير هذا الدور');
            return;
        }

        await assignUserRole(uid, newRole);
        await logRoleChange(uid, user.email, user.role, newRole, auth.currentUser.uid);
        showNotification('success', `تم تحديث دور ${user.email} إلى ${newRole}`);
    } catch (error) {
        console.error('Error changing user role:', error);
        showNotification('error', `فشل تحديث الدور: ${error.message}`);
    }
}

async function handleUserDeletion(uid, email, name) {
    try {
        if (await isOriginalUser(uid)) {
            showNotification('error', 'لا يمكن حذف المستخدمين الأصليين');
            return;
        }

        const result = await deleteUser(uid);
        showNotification('success', `تم حذف المستخدم ${name || email}`);
        if (result.note) {
            setTimeout(() => showNotification('error', result.note), 500);
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showNotification('error', `فشل حذف المستخدم: ${error.message}`);
    }
}

async function handleCreateUser(form) {
    const submitButton = document.getElementById('create-user-btn');
    const displayName = String(document.getElementById('new-user-name')?.value || '').trim();
    const email = String(document.getElementById('new-user-email')?.value || '').trim().toLowerCase();
    const password = String(document.getElementById('new-user-password')?.value || '');
    const role = String(document.getElementById('new-user-role')?.value || 'viewer');

    if (!displayName || !email || !password) {
        showNotification('error', 'أكمل كل بيانات المستخدم الجديد أولًا');
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showNotification('error', 'البريد الإلكتروني غير صالح');
        return;
    }

    if (password.length < 8) {
        showNotification('error', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل');
        return;
    }

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ الإنشاء...';
        }

        await createUserWithRole(email, password, displayName, role);
        form.reset();
        showNotification('success', `تم إنشاء المستخدم ${email} بنجاح`);
    } catch (error) {
        console.error('Error creating user:', error);
        showNotification('error', `فشل إنشاء المستخدم: ${error.message}`);
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-user-plus"></i> إنشاء المستخدم';
        }
    }
}

function setupAutoRefresh() {
    if (autoRefreshInterval) return;

    autoRefreshInterval = setInterval(async () => {
        try {
            await refreshUserManagement();
        } catch (error) {
            console.error('Auto refresh failed:', error);
        }
    }, 30000);
}

export async function updateUserStatistics(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        const stats = await getRoleStatistics();
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
        console.error('Error updating stats:', error);
    }
}

function formatDate(value, fallback = 'غير معروف') {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString('ar-EG');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

// --- Permission Editor ---

let _permUsers = [];

export async function populatePermUserSelect() {
    const select = document.getElementById('perm-user-select');
    if (!select) return;
    try {
        const result = await getAllUsers();
        _permUsers = result.users || result.data?.users || [];
        select.innerHTML = '<option value="">-- اختر مستخدم --</option>' +
            _permUsers
                .filter(u => !u.isOriginal)
                .map(u => `<option value="${u.uid}">${escapeHtml(u.displayName || u.email)} (${escapeHtml(u.email)})</option>`)
                .join('');
    } catch (e) {
        console.error('perm editor: could not load users', e);
    }
}

window.loadUserPermissions = async function() {
    const select = document.getElementById('perm-user-select');
    const uid = select?.value;
    const container = document.getElementById('perm-grid-container');
    const saveBtn = document.getElementById('perm-save-btn');
    if (!uid || !container || !saveBtn) { return; }

    container.innerHTML = '<div class="perm-loading"><i class="fas fa-spinner fa-spin"></i> جارٍ تحميل الصلاحيات...</div>';
    saveBtn.disabled = true;

    try {
        const pages = await getUserPagePermissions(uid);
        const defaultPerms = getDefaultPermissions();
        const merged = { ...defaultPerms, ...pages };

        const pageEntries = Object.entries(PAGE_REGISTRY);
        const cols = pageEntries.length;

        let html = '<div class="perm-grid"><div class="perm-header"><div>الصفحة</div><div>ممنوع</div><div>عرض</div><div>تعديل</div></div>';
        pageEntries.forEach(([id, info], idx) => {
            const val = merged[id];
            html += `<div class="perm-row${idx % 2 === 1 ? ' odd' : ''}">`;
            html += `<div>${info.title}</div>`;
            html += `<div><label><input type="radio" name="perm_${id}" value="" ${val === null || val === undefined || val === '' ? 'checked' : ''}> ممنوع</label></div>`;
            html += `<div><label><input type="radio" name="perm_${id}" value="view" ${val === 'view' ? 'checked' : ''}> عرض</label></div>`;
            html += `<div><label><input type="radio" name="perm_${id}" value="edit" ${val === 'edit' ? 'checked' : ''}> تعديل</label></div>`;
            html += '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
        saveBtn.disabled = false;
        saveBtn.dataset.uid = uid;
    } catch (e) {
        container.innerHTML = `<p class="perm-loading" style="color:#c00">خطأ: ${escapeHtml(e.message)}</p>`;
    }
};

window.saveUserPermissions = async function() {
    const saveBtn = document.getElementById('perm-save-btn');
    const uid = saveBtn?.dataset.uid;
    if (!uid) { showNotification('error', 'اختر مستخدم أولاً'); return; }

    const pages = {};
    for (const id of Object.keys(PAGE_REGISTRY)) {
        const radios = document.querySelectorAll(`input[name="perm_${id}"]`);
        radios.forEach(r => { if (r.checked) pages[id] = r.value || null; });
    }

    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جارٍ الحفظ...';
        await saveUserPagePermissions(uid, pages);
        showNotification('success', 'تم حفظ الصلاحيات بنجاح');
    } catch (e) {
        showNotification('error', 'فشل حفظ الصلاحيات: ' + e.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> حفظ الصلاحيات';
    }
};

// Initialize permission editor when admin panel loads
// Called from setupStaticEvents or admin-panel.html
export async function initPermEditor() {
    await populatePermUserSelect();
}
