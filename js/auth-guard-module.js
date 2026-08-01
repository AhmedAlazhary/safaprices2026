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
    return pages[pageId] ?? null;
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
            sessionStorage.setItem('pagePermission', pagePerm ?? '');
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
    }
    try {
        if (window.firebase && typeof window.firebase.auth === 'function') {
            await window.firebase.auth().signOut();
        }
    } catch (error) {}
    sessionStorage.clear();
    window.location.href = 'index.html';
}

// Read a user_roles doc using whichever Firestore is authenticated on this page.
// Pages that sign in via the compat SDK (possibly a different version, e.g. fleet v10)
// have an unauthenticated modular `db`, so we must read through the compat Firestore.
async function readUserRoleDoc(uid) {
    try {
        if (window.firebase && typeof window.firebase.firestore === 'function') {
            const fs = window.firebase.firestore();
            const snap = await fs.collection('user_roles').doc(uid).get();
            if (snap.exists) return snap.data();
            return null;
        }
    } catch (e) {}
    const roleDoc = await getDoc(doc(db, 'user_roles', uid));
    return roleDoc.exists() ? roleDoc.data() : null;
}

// Auto-execute page permission check when module loads
(function() {
    const pageId = getCurrentPageId();
    if (!pageId) return; // not a registered page (e.g. index.html)

    // 1) Synchronous check using login session. Works on every page regardless of
    //    which Firebase SDK version signed the user in (sessionStorage is shared).
    const email = String(sessionStorage.getItem('userEmail') || '').trim().toLowerCase();
    const role = sessionStorage.getItem('userRole') || '';
    const isAdminUser = ORIGINAL_ADMIN_EMAILS.has(email) || role === 'admin';

    if (isAdminUser) {
        sessionStorage.setItem('pagePermission', 'edit');
    } else {
        let pages = {};
        try {
            pages = JSON.parse(sessionStorage.getItem('userPages') || '{}');
        } catch (e) {}
        const perm = pages[pageId] ?? PAGE_REGISTRY[pageId]?.default ?? null;
        sessionStorage.setItem('pagePermission', perm ?? '');
        if (perm === null) {
            console.log(`[auth-guard] BLOCKED ${email} from ${pageId} (sync)`);
            window.location.href = 'dashboard.html';
            return;
        }
        console.log(`[auth-guard] allowed ${email} on ${pageId} (sync, perm=${perm})`);
    }

    // 2) Async verification for fresh tabs / direct page loads / stale caches.
    async function enforce(user) {
        if (!user) return;
        const uEmail = String(user.email || '').trim().toLowerCase();

        if (ORIGINAL_ADMIN_EMAILS.has(uEmail)) {
            sessionStorage.setItem('pagePermission', 'edit');
            return;
        }

        const uid = user.uid;
        sessionStorage.setItem('userUID', uid);
        let uRole = sessionStorage.getItem('userRole');
        if (!uRole) {
            try {
                const data = await readUserRoleDoc(uid);
                if (data) {
                    uRole = data.role || 'viewer';
                    sessionStorage.setItem('userRole', uRole);
                    if (data.pages) sessionStorage.setItem('userPages', JSON.stringify(data.pages));
                }
            } catch (error) {
                console.error('[auth-guard] role read failed', error);
            }
        }

        if (uRole === 'admin') {
            sessionStorage.setItem('pagePermission', 'edit');
            return;
        }

        try {
            const data = await readUserRoleDoc(uid);
            const pages = (data && data.pages) || {};
            sessionStorage.setItem('userPages', JSON.stringify(pages));
            const perm = pages[pageId] ?? PAGE_REGISTRY[pageId]?.default ?? null;
            sessionStorage.setItem('pagePermission', perm ?? '');

            if (perm === null) {
                console.log(`[auth-guard] BLOCKED ${uEmail} from ${pageId} (async)`);
                window.location.href = 'dashboard.html';
            } else {
                console.log(`[auth-guard] allowed ${uEmail} on ${pageId} (async, perm=${perm})`);
            }
        } catch (error) {
            console.error('[auth-guard] permission read failed for', uid, error);
        }
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            enforce(user);
            return;
        }
        // Page may be signed in via a different-version compat SDK (e.g. fleet v10 compat)
        try {
            if (window.firebase && typeof window.firebase.auth === 'function') {
                const compatAuth = window.firebase.auth();
                if (compatAuth) {
                    compatAuth.onAuthStateChanged((cUser) => {
                        if (cUser) enforce(cUser);
                    });
                }
            }
        } catch (e) {}
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
