import { auth, db, onAuthStateChanged, signOut, doc, getDoc } from '../firebase-config.js';
import { getUserPagePermissions, getCurrentPageId, PAGE_REGISTRY } from './role-manager.js';

const ORIGINAL_ADMIN_EMAILS = new Set([
    'ahmed@safatrans.com',
    'hesham@safatrans.com',
    'omar@safatrans.com',
    'sabry@safatrans.com'
]);

const PROTECTED_ROUTES = {
    'admin-panel.html': ['admin'],
    'dashboard.html': ['admin', 'manager'],
    'inventory-assets-system.html': ['admin', 'manager'],
    'warehouse-management.html': ['admin', 'manager'],
    'daily.html': ['admin', 'manager', 'viewer'],
    'prices.html': ['admin', 'manager', 'viewer'],
    'treasury-system.html': ['admin', 'manager'],
    'treasury-banks.html': ['admin', 'manager'],
    'invoices.html': ['admin', 'manager'],
    'shared-lists.html': ['admin', 'manager', 'viewer'],
    'drivers-roles-page.html': ['admin', 'manager'],
    'upload.html': ['admin', 'manager']
};

export function getCurrentUserRole() {
    const email = String(sessionStorage.getItem('userEmail') || '').trim().toLowerCase();
    if (ORIGINAL_ADMIN_EMAILS.has(email)) {
        return 'admin';
    }

    return sessionStorage.getItem('userRole') || 'viewer';
}

export function isAdmin() {
    return getCurrentUserRole() === 'admin';
}

export function isManagerOrAbove() {
    const role = getCurrentUserRole();
    return role === 'admin' || role === 'manager';
}

export function isViewerOrAbove() {
    const role = getCurrentUserRole();
    return role === 'admin' || role === 'manager' || role === 'viewer';
}

export async function getUserRole(user) {
    try {
        const email = String(user?.email || '').trim().toLowerCase();
        if (ORIGINAL_ADMIN_EMAILS.has(email)) {
            return 'admin';
        }

        const tokenResult = await user.getIdTokenResult(true);
        if (tokenResult.claims.admin) return 'admin';
        if (tokenResult.claims.manager) return 'manager';
        if (tokenResult.claims.viewer) return 'viewer';

        const userRoleDoc = await getDoc(doc(db, 'user_roles', user.uid));
        if (userRoleDoc.exists()) {
            return userRoleDoc.data().role || 'viewer';
        }
    } catch (error) {
        console.error('Error getting user role:', error);
    }

    return 'viewer';
}

function hasAccess(page, userRole) {
    const requiredRoles = PROTECTED_ROUTES[page];
    if (!requiredRoles) {
        return true;
    }

    return requiredRoles.includes(userRole);
}

// Check page-level permission for current user on a given pageId
export async function getPageLevelPermission(pageId) {
    const email = String(sessionStorage.getItem('userEmail') || '').trim().toLowerCase();
    if (ORIGINAL_ADMIN_EMAILS.has(email)) {
        return 'edit';
    }
    const uid = sessionStorage.getItem('userUID');
    if (!uid) return null;
    const pages = await getUserPagePermissions(uid);
    return pages[pageId] || null;
}

// Combined route guard: role + page permission
export function initRouteGuard() {
    const currentPath = window.location.pathname;
    const currentPage = currentPath.split('/').pop() || 'index.html';

    if (!PROTECTED_ROUTES[currentPage]) {
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        sessionStorage.setItem('userUID', user.uid);
        sessionStorage.setItem('userEmail', user.email || '');

        const role = await getUserRole(user);
        sessionStorage.setItem('userRole', role);

        // Role-based guard
        if (!hasAccess(currentPage, role)) {
            window.location.href = 'dashboard.html';
            return;
        }

        // Page-level permission guard
        const pageId = getCurrentPageId();
        if (pageId) {
            const pagePerm = await getPageLevelPermission(pageId);
            sessionStorage.setItem('pagePermission', pagePerm || '');
            if (pagePerm === null) {
                window.location.href = 'dashboard.html';
            }
        }
    });
}

// Protect UI elements based on page permission (view = hide edit buttons)
export function protectPageElements(editSelectors) {
    const perm = sessionStorage.getItem('pagePermission');
    if (perm === 'edit') return; // full access
    if (!perm) return; // no permission set (not a protected page)

    // view-only: disable/hide edit elements
    const selectors = editSelectors || [
        'button:not(.view-safe)', 'input[type="submit"]',
        '.delete-btn', '.edit-btn', '.save-btn',
        'form', '[data-requires="edit"]'
    ];
    document.querySelectorAll(selectors.join(',')).forEach(el => {
        el.disabled = true;
        el.style.opacity = '0.5';
        el.style.pointerEvents = 'none';
        el.title = 'عرض فقط - لا يمكن التعديل';
    });
}

export function protectButton(buttonId, requiredRole) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    const hierarchy = { viewer: 1, manager: 2, admin: 3 };
    const currentRole = getCurrentUserRole();
    if ((hierarchy[currentRole] || 0) < (hierarchy[requiredRole] || 0)) {
        button.disabled = true;
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
    }
}

export async function logout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        sessionStorage.clear();
        window.location.href = 'index.html';
    }
}

// Auto-execute page permission check when module loads
(function() {
    const pageId = getCurrentPageId();
    if (!pageId) return; // not a registered page (e.g. index.html)

    onAuthStateChanged(auth, async (user) => {
        if (!user) return; // let other guards handle redirect
        const email = String(user.email || '').trim().toLowerCase();

        // Original admins get full access
        if (ORIGINAL_ADMIN_EMAILS.has(email)) {
            sessionStorage.setItem('pagePermission', 'edit');
            return;
        }

        // Get role from Firestore for permission check
        const uid = user.uid;
        let role = sessionStorage.getItem('userRole');
        if (!role) {
            const roleDoc = await getDoc(doc(db, 'user_roles', uid));
            if (roleDoc.exists()) {
                role = roleDoc.data().role || 'viewer';
                sessionStorage.setItem('userRole', role);
            }
        }

        // Admins (by role) get full access to everything
        if (role === 'admin') {
            sessionStorage.setItem('pagePermission', 'edit');
            return;
        }

        const pages = await getUserPagePermissions(uid);
        const perm = pages[pageId] || PAGE_REGISTRY[pageId]?.default || null;
        sessionStorage.setItem('pagePermission', perm || '');

        if (perm === null) {
            window.location.href = 'dashboard.html';
        }
    });
})();

window.authGuardModule = {
    getCurrentUserRole,
    isAdmin,
    isManagerOrAbove,
    isViewerOrAbove,
    getUserRole,
    initRouteGuard,
    protectButton,
    logout,
    getPageLevelPermission,
    protectPageElements,
    getCurrentPageId,
    PAGE_REGISTRY
};
