// js/auth-guard.js - Route Guards and Authentication Protection
// Note: This file uses global Firebase from compat version

// صفحات تتطلب صلاحيات معينة
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

// الصفحات العامة (لا تتطلب تسجيل دخول)
const PUBLIC_ROUTES = [
    'index.html',
    'login.html',
    'register.html'
];

// Initialize route guards
function initRouteGuards() {
    firebase.auth().onAuthStateChanged((user) => {
        const currentPath = window.location.pathname;
        const currentPage = currentPath.split('/').pop() || 'index.html';
        
        // Check if current page requires authentication
        if (PROTECTED_ROUTES[currentPage]) {
            if (!user) {
                // Redirect to login
                window.location.href = 'index.html';
                return;
            }
            
            // Check user role
            checkUserRole(user, currentPage);
        } else {
            // تخزين معلومات المستخدم في sessionStorage
            if (user) {
                sessionStorage.setItem('userRole', userRole);
                sessionStorage.setItem('userUID', user.uid);
                sessionStorage.setItem('userEmail', user.email);
                sessionStorage.setItem('userDisplayName', user.displayName || user.email);
            }
        }
    });
}

// الحصول على دور المستخدم
export async function getUserRole(user) {
    try {
        const tokenResult = await user.getIdTokenResult(true);
        
        // التحقق من Custom Claims
        if (tokenResult.claims.admin) return 'admin';
        if (tokenResult.claims.manager) return 'manager';
        if (tokenResult.claims.viewer) return 'viewer';
        
        // إذا لم يوجد Custom Claims، تحقق من Firestore
        const userRoleDoc = await getDoc(doc(db, 'user_roles', user.uid));
        if (userRoleDoc.exists()) {
            return userRoleDoc.data().role || 'viewer';
        }
        
        // دور افتراضي للمستخدمين الجدد
        return 'viewer';
    } catch (error) {
        console.error('Error getting user role:', error);
        return 'viewer'; // دور افتراضي آمن
    }
}

// التحقق من أن المستخدم لديه صلاحية الوصول للصفحة
function hasAccess(page, userRole) {
    // الصفحات العامة متاحة للجميع
    if (PUBLIC_ROUTES.includes(page)) {
        return true;
    }
    
    // الصفحات المحمية تتطلب صلاحيات معينة
    const requiredRoles = PROTECTED_ROUTES[page];
    if (!requiredRoles) {
        return true; // صفحة غير محددة - السماح بالوصول
    }
    
    return requiredRoles.includes(userRole);
}

// عرض رسالة خطأ عند رفض الوصول
function showAccessDeniedError(page, userRole) {
    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = `
        <div style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #f44336;
            color: white;
            padding: 20px;
            text-align: center;
            z-index: 9999;
            direction: rtl;
        ">
            <h3>⚠️ وصول مرفوض</h3>
            <p>لا تملك صلاحية الوصول لصفحة "${page}"</p>
            <p>صلاحيتك الحالية: ${userRole}</p>
            <p>سيتم إعادة توجيهك إلى لوحة التحكم...</p>
        </div>
    `;
    document.body.appendChild(errorDiv);
}

// التحقق من صلاحية المستخدم الحالي
export function getCurrentUserRole() {
    return sessionStorage.getItem('userRole') || 'viewer';
}

// التحقق مما إذا كان المستخدم الحالي هو أدمن
export function isAdmin() {
    return getCurrentUserRole() === 'admin';
}

// التحقق مما إذا كان المستخدم الحالي هو manager أو أعلى
export function isManagerOrAbove() {
    const role = getCurrentUserRole();
    return role === 'admin' || role === 'manager';
}

// التحقق مما إذا كان المستخدم الحالي هو viewer أو أعلى
export function isViewerOrAbove() {
    const role = getCurrentUserRole();
    return role === 'admin' || role === 'manager' || role === 'viewer';
}

// حماية أزرار معينة بناءً على الصلاحية
export function protectButton(buttonId, requiredRole) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    const userRole = getCurrentUserRole();
    
    if (!hasRoleAccess(userRole, requiredRole)) {
        button.disabled = true;
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
        button.title = `هذا الزر يتطلب صلاحية ${requiredRole} أو أعلى`;
    }
}

// التحقق من صلاحية الوصول
function hasRoleAccess(userRole, requiredRole) {
    const roleHierarchy = {
        'viewer': 1,
        'manager': 2,
        'admin': 3
    };
    
    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

// التحقق من صلاحية المستخدم
async function checkUserRole(user, currentPage) {
    const userRole = await getUserRole(user);
    sessionStorage.setItem('userRole', userRole);
    
    if (!hasAccess(currentPage, userRole)) {
        showAccessDeniedError(currentPage, userRole);
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 3000);
    }
}

// تسجيل الخروج مع مسح البيانات
export async function logout() {
    try {
        await auth.signOut();
        sessionStorage.clear();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
}
