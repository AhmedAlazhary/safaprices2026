import { auth, db, onAuthStateChanged, signOut, doc, getDoc } from '../firebase-config.js';

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

        if (!hasAccess(currentPage, role)) {
            window.location.href = 'dashboard.html';
        }
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

window.authGuardModule = {
    getCurrentUserRole,
    isAdmin,
    isManagerOrAbove,
    isViewerOrAbove,
    getUserRole,
    initRouteGuard,
    protectButton,
    logout
};
