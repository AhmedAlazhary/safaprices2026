// js/ui-restrict.js - UI Restrictions Based on User Role
import { getCurrentUserRole, isAdmin, isManagerOrAbove, isViewerOrAbove } from './auth-guard.js';

// تهيئة قيود الواجهة
export function initUIRestrictions(userRole = null) {
    const role = userRole || getCurrentUserRole();
    
    // إخفاء/إظهار العناصر بناءً على الصلاحية
    restrictNavigation(role);
    restrictButtons(role);
    restrictForms(role);
    restrictTables(role);
    restrictModals(role);
    
    // إضافة علامة صلاحية للصفحة
    addRoleIndicator(role);
}

// تقييد شريط التنقل
function restrictNavigation(userRole) {
    // إخفاء عناصر التنقل المحمية
    const adminOnlyItems = document.querySelectorAll('[data-role="admin"]');
    const managerOnlyItems = document.querySelectorAll('[data-role="manager"]');
    const viewerOnlyItems = document.querySelectorAll('[data-role="viewer"]');
    
    adminOnlyItems.forEach(item => {
        if (userRole !== 'admin') {
            item.style.display = 'none';
        }
    });
    
    managerOnlyItems.forEach(item => {
        if (!['admin', 'manager'].includes(userRole)) {
            item.style.display = 'none';
        }
    });
    
    viewerOnlyItems.forEach(item => {
        if (!['admin', 'manager', 'viewer'].includes(userRole)) {
            item.style.display = 'none';
        }
    });
}

// تقييد الأزرار
function restrictButtons(userRole) {
    // أزرار الإضافة (Admin & Manager فقط)
    const addButtons = document.querySelectorAll('[data-action="add"]');
    addButtons.forEach(button => {
        if (!isManagerOrAbove()) {
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            button.title = 'يتطلب صلاحية Manager أو أعلى';
        }
    });
    
    // أزرار التعديل (Admin & Manager فقط)
    const editButtons = document.querySelectorAll('[data-action="edit"]');
    editButtons.forEach(button => {
        if (!isManagerOrAbove()) {
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            button.title = 'يتطلب صلاحية Manager أو أعلى';
        }
    });
    
    // أزرار الحذف (Admin فقط)
    const deleteButtons = document.querySelectorAll('[data-action="delete"]');
    deleteButtons.forEach(button => {
        if (!isAdmin()) {
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            button.title = 'يتطلب صلاحية Admin';
        }
    });
    
    // أزرار التصدير (Admin & Manager فقط)
    const exportButtons = document.querySelectorAll('[data-action="export"]');
    exportButtons.forEach(button => {
        if (!isManagerOrAbove()) {
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            button.title = 'يتطلب صلاحية Manager أو أعلى';
        }
    });
    
    // أزرار الطباعة (جميع المستخدمين)
    const printButtons = document.querySelectorAll('[data-action="print"]');
    printButtons.forEach(button => {
        if (!isViewerOrAbove()) {
            button.disabled = true;
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
            button.title = 'يتطلب صلاحية Viewer على الأقل';
        }
    });
}

// تقييد النماذج
function restrictForms(userRole) {
    // نماذج الإدخال (Admin & Manager فقط)
    const inputForms = document.querySelectorAll('[data-form="input"]');
    inputForms.forEach(form => {
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (!isManagerOrAbove()) {
                input.disabled = true;
                input.style.backgroundColor = '#f5f5f5';
            }
        });
        
        // إخفاء أزرار الإرسال
        const submitButtons = form.querySelectorAll('button[type="submit"], [type="button"]');
        submitButtons.forEach(button => {
            if (!isManagerOrAbove()) {
                button.style.display = 'none';
            }
        });
    });
    
    // حقول البحث (جميع المستخدمين)
    const searchFields = document.querySelectorAll('[data-field="search"]');
    searchFields.forEach(field => {
        if (!isViewerOrAbove()) {
            field.disabled = true;
            field.style.backgroundColor = '#f5f5f5';
        }
    });
}

// تقييد الجداول
function restrictTables(userRole) {
    // إخفاء أعمدة الإجراءات
    const actionColumns = document.querySelectorAll('[data-column="actions"]');
    actionColumns.forEach(column => {
        if (!isManagerOrAbove()) {
            column.style.display = 'none';
        }
    });
    
    // تعطيل الخلايا القابلة للتعديل
    const editableCells = document.querySelectorAll('[data-editable="true"]');
    editableCells.forEach(cell => {
        if (!isManagerOrAbove()) {
            cell.contentEditable = false;
            cell.style.backgroundColor = '#f5f5f5';
            cell.style.cursor = 'default';
        }
    });
}

// تقييد النوافذ المنبثقة
function restrictModals(userRole) {
    // نوافذ الإضافة والتعديل
    const addModals = document.querySelectorAll('[data-modal="add"]');
    const editModals = document.querySelectorAll('[data-modal="edit"]');
    const deleteModals = document.querySelectorAll('[data-modal="delete"]');
    
    addModals.forEach(modal => {
        if (!isManagerOrAbove()) {
            // إخفاء أزرار فتح النافذة
            const triggerButtons = document.querySelectorAll(`[data-target="${modal.id}"]`);
            triggerButtons.forEach(button => {
                button.style.display = 'none';
            });
        }
    });
    
    editModals.forEach(modal => {
        if (!isManagerOrAbove()) {
            const triggerButtons = document.querySelectorAll(`[data-target="${modal.id}"]`);
            triggerButtons.forEach(button => {
                button.style.display = 'none';
            });
        }
    });
    
    deleteModals.forEach(modal => {
        if (!isAdmin()) {
            const triggerButtons = document.querySelectorAll(`[data-target="${modal.id}"]`);
            triggerButtons.forEach(button => {
                button.style.display = 'none';
            });
        }
    });
}

// إضافة مؤشر الدور للصفحة
function addRoleIndicator(userRole) {
    // إزالة المؤشر الموجود إن وجد
    const existingIndicator = document.getElementById('role-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // إنشاء مؤشر جديد
    const indicator = document.createElement('div');
    indicator.id = 'role-indicator';
    indicator.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background: ${getRoleColor(userRole)};
        color: white;
        padding: 8px 15px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        direction: rtl;
    `;
    
    const roleIcon = getRoleIcon(userRole);
    const roleName = getRoleName(userRole);
    
    indicator.innerHTML = `${roleIcon} ${roleName}`;
    document.body.appendChild(indicator);
}

// الحصول على لون الدور
function getRoleColor(role) {
    const colors = {
        'admin': '#f44336',
        'manager': '#ff9800',
        'viewer': '#4caf50'
    };
    return colors[role] || '#9e9e9e';
}

// الحصول على أيقونة الدور
function getRoleIcon(role) {
    const icons = {
        'admin': '👑',
        'manager': '📊',
        'viewer': '👁️'
    };
    return icons[role] || '👤';
}

// الحصول على اسم الدور بالعربية
function getRoleName(role) {
    const names = {
        'admin': 'أدمن',
        'manager': 'مدير',
        'viewer': 'مشاهد'
    };
    return names[role] || 'مستخدم';
}

// حماية الروابط
export function protectLinks() {
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.endsWith('.html')) {
            const page = href.split('/').pop();
            const userRole = getCurrentUserRole();
            
            if (!hasPageAccess(page, userRole)) {
                link.style.opacity = '0.5';
                link.style.cursor = 'not-allowed';
                link.onclick = (e) => {
                    e.preventDefault();
                    showAccessDeniedMessage(page, userRole);
                };
            }
        }
    });
}

// التحقق من الوصول للصفحة
function hasPageAccess(page, userRole) {
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
    
    const PUBLIC_ROUTES = [
        'index.html',
        'login.html',
        'register.html'
    ];
    
    if (PUBLIC_ROUTES.includes(page)) {
        return true;
    }
    
    const requiredRoles = PROTECTED_ROUTES[page];
    if (!requiredRoles) {
        return true;
    }
    
    return requiredRoles.includes(userRole);
}

// عرض رسالة رفض الوصول
function showAccessDeniedMessage(page, userRole) {
    const message = document.createElement('div');
    message.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #f44336;
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 10000;
        text-align: center;
        direction: rtl;
    `;
    
    message.innerHTML = `
        <h3>⚠️ وصول مرفوض</h3>
        <p>لا تملك صلاحية الوصول لصفحة "${page}"</p>
        <p>صلاحيتك الحالية: ${getRoleName(userRole)}</p>
        <button onclick="this.parentElement.remove()" style="
            background: white;
            color: #f44336;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 10px;
        ">موافق</button>
    `;
    
    document.body.appendChild(message);
    
    // إزالة الرسالة تلقائياً بعد 5 ثواني
    setTimeout(() => {
        if (message.parentElement) {
            message.remove();
        }
    }, 5000);
}
