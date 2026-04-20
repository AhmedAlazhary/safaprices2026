// js/auth-guard.js - Route Guards and Authentication Protection
// Note: This file uses global Firebase from compat version
const ORIGINAL_ADMIN_EMAILS = new Set([
    'ahmed@safatrans.com',
    'hesham@safatrans.com',
    'omar@safatrans.com',
    'sabry@safatrans.com'
]);

// Initialize route guards
function initRouteGuards() {
    const currentPath = window.location.pathname;
    const currentPage = currentPath.split('/').pop() || 'index.html';
    
    // Pages that require authentication
    const protectedPages = [
        'dashboard.html',
        'admin-panel.html',
        'inventory-assets-system.html',
        'warehouse-management.html',
        'daily.html',
        'prices.html',
        'treasury-system.html',
        'treasury-banks.html',
        'invoices.html',
        'shared-lists.html',
        'drivers-roles-page.html',
        'upload.html'
    ];
    
    // Public pages (no authentication required)
    const publicPages = [
        'index.html',
        'login.html',
        'register.html'
    ];
    
    if (!protectedPages.includes(currentPage)) {
        return;
    }

    if (typeof firebase === 'undefined') {
        window.location.href = 'index.html';
        return;
    }

    firebase.auth().onAuthStateChanged((user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        sessionStorage.setItem('userUID', user.uid);
        sessionStorage.setItem('userEmail', user.email || '');
    });
}

// Function to check user role
function checkUserRole(user, page) {
    // For demo purposes, always allow access
    // In real implementation, check user role from Firebase or database
    return true;
}

// Function to get current user role
function getCurrentUserRole() {
    const email = sessionStorage.getItem('userEmail') || '';
    if (ORIGINAL_ADMIN_EMAILS.has(email.trim().toLowerCase())) {
        return 'admin';
    }

    return sessionStorage.getItem('userRole') || 'viewer';
}

// Function to protect buttons based on role
function protectButton(buttonId, requiredRole) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    const userRole = getCurrentUserRole();
    
    // For demo purposes, don't disable buttons
    // In real implementation, check role hierarchy
}

// Logout function
function logout() {
    if (typeof firebase === 'undefined') {
        sessionStorage.clear();
        window.location.href = 'index.html';
        return;
    }

    firebase.auth().signOut().finally(() => {
        sessionStorage.clear();
        window.location.href = 'index.html';
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initRouteGuards();
});

// Export functions for use in other files
window.authGuard = {
    getCurrentUserRole,
    protectButton,
    logout,
    initRouteGuards
};
