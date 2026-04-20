// js/rbac-main.js - Main RBAC Initialization File
import { auth, onAuthStateChanged } from './firebase-config.js';
import { initRouteGuard, getUserRole, logout } from './auth-guard-module.js';
import { initUIRestrictions } from './ui-restrict.js';
import { ensureUserHasRole } from './role-manager.js';

// تهيئة النظام بالكامل
let isRBACInitialized = false;

export async function initRBAC() {
    if (isRBACInitialized) return;
    
    console.log('🚀 بدء تهيئة نظام الصلاحيات (RBAC)...');
    
    // تهيئة حماية المسارات
    initRouteGuard();
    
    // مراقبة حالة المصادقة
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log(`👤 المستخدم: ${user.email}`);
            
            try {
                // التحقق من أن المستخدم لديه دور (للمستخدمين الجدد)
                const tokenResult = await user.getIdTokenResult();
                const hasAnyRole = tokenResult.claims.admin || 
                                  tokenResult.claims.manager || 
                                  tokenResult.claims.viewer;
                
                if (!hasAnyRole) {
                    console.log('🔄 المستخدم الجديد بدون دور - تعيين دور viewer تلقائياً');
                    // مستخدم جديد بدون دور → تعيين viewer تلقائياً
                    await assignDefaultRoleToNewUser(user);
                }
                
                const role = await getUserRole(user);
                console.log(`🔐 دور المستخدم: ${role}`);
                
                // تخزين معلومات المستخدم
                sessionStorage.setItem('userRole', role);
                sessionStorage.setItem('userUID', user.uid);
                sessionStorage.setItem('userEmail', user.email);
                sessionStorage.setItem('userDisplayName', user.displayName || user.email);
                
                // تهيئة قيود الواجهة
                initUIRestrictions(role);
                
                // حماية الروابط
                protectAllLinks();
                
                // إضافة أحداث إضافية
                setupGlobalEvents();
                
                console.log('✅ تم تهيئة نظام الصلاحيات بنجاح');
                
            } catch (error) {
                console.error('❌ خطأ في تهيئة الصلاحيات:', error);
                handleRBACError(error);
            }
        } else {
            console.log('👋 المستخدم غير مسجل دخوله');
            // مسح بيانات الجلسة
            sessionStorage.clear();
        }
    });
    
    isRBACInitialized = true;
}

// تعيين دور افتراضي للمستخدمين الجدد
async function assignDefaultRoleToNewUser(user) {
    try {
        const { assignUserRole } = await import('./role-manager.js');
        await assignUserRole(user.uid, 'viewer', 'system');
        console.log(`✅ تم تعيين دور viewer تلقائياً للمستخدم الجديد: ${user.email}`);
        
        // عرض إشعار ترحيبي
        showWelcomeNotification(user);
    } catch (error) {
        console.error('❌ فشل تعيين الدور الافتراضي:', error);
    }
}

// عرض إشعار ترحيبي للمستخدمين الجدد
function showWelcomeNotification(user) {
    const notification = document.createElement('div');
    notification.className = 'welcome-notification';
    notification.innerHTML = `
        <div class="welcome-content">
            <h3>🎉 مرحباً بك في النظام!</h3>
            <p>تم تسجيل حسابك بنجاح</p>
            <p>صلاحيتك الحالية: <strong>Viewer</strong></p>
            <p>يمكنك الآن عرض البيانات والصفحات المتاحة</p>
            <button onclick="this.parentElement.parentElement.remove()">موافق</button>
        </div>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        direction: rtl;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        .welcome-content {
            background: white;
            padding: 30px;
            border-radius: 15px;
            text-align: center;
            max-width: 400px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }
        
        .welcome-content h3 {
            color: #4caf50;
            margin-bottom: 15px;
        }
        
        .welcome-content p {
            margin: 10px 0;
            color: #666;
        }
        
        .welcome-content button {
            background: #4caf50;
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 16px;
            margin-top: 20px;
            transition: background 0.3s;
        }
        
        .welcome-content button:hover {
            background: #45a049;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(notification);
}

// حماية جميع الروابط في الصفحة
function protectAllLinks() {
    const role = sessionStorage.getItem('userRole');
    if (role) {
        initUIRestrictions(role);
    }
}

// إعداد أحداث عامة
function setupGlobalEvents() {
    // مراقبة تغييرات الصفحة
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            // إعادة تهيئة القيود عند تغيير الصفحة
            setTimeout(() => {
                const role = sessionStorage.getItem('userRole');
                if (role) {
                    initUIRestrictions(role);
                    protectAllLinks();
                }
            }, 100);
        }
    }).observe(document, { subtree: true, childList: true });
    
    // اختصارات لوحة المفاتيح العامة
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+L لتسجيل الخروج
        if (e.ctrlKey && e.shiftKey && e.key === 'L') {
            e.preventDefault();
            logout();
        }
        
        // Ctrl+Shift+I لعرض معلومات المستخدم
        if (e.ctrlKey && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            showUserInfo();
        }
    });
    
    // مراقبة الأخطاء
    window.addEventListener('error', (event) => {
        if (event.message.includes('permission-denied')) {
            showPermissionDeniedError();
        }
    });
}

// عرض معلومات المستخدم
function showUserInfo() {
    const user = auth.currentUser;
    if (!user) return;
    
    const role = sessionStorage.getItem('userRole');
    const info = `
        معلومات المستخدم الحالي:
        📧 البريد: ${user.email}
        👤 الاسم: ${user.displayName || 'غير محدد'}
        🔐 الدور: ${role}
        🆔 UID: ${user.uid}
        📅 آخر تسجيل دخول: ${user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString('ar-EG') : 'غير معروف'}
    `;
    
    console.log(info);
    
    // عرض في واجهة المستخدم
    const modal = document.createElement('div');
    modal.innerHTML = `
        <div class="user-info-modal">
            <div class="modal-content">
                <h3>📋 معلومات المستخدم</h3>
                <pre>${info}</pre>
                <button onclick="this.parentElement.parentElement.remove()">إغلاق</button>
            </div>
        </div>
    `;
    
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        .modal-content {
            background: white;
            padding: 30px;
            border-radius: 15px;
            max-width: 500px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            direction: rtl;
        }
        
        .modal-content h3 {
            margin-bottom: 20px;
            color: #2196f3;
        }
        
        .modal-content pre {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            line-height: 1.6;
        }
        
        .modal-content button {
            background: #2196f3;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 15px;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(modal);
}

// عرض خطأ رفض الإذن
function showPermissionDeniedError() {
    const error = document.createElement('div');
    error.innerHTML = `
        <div class="permission-error">
            <h3>🚫 خطأ في الصلاحيات</h3>
            <p>ليس لديك صلاحية للقيام بهذا الإجراء</p>
            <p>يرجى التواصل مع المسؤول للحصول على الصلاحيات المناسبة</p>
            <button onclick="this.parentElement.remove()">موافق</button>
        </div>
    `;
    
    error.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f44336;
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 10000;
        max-width: 300px;
        direction: rtl;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    `;
    
    document.body.appendChild(error);
    
    setTimeout(() => {
        if (error.parentElement) {
            error.remove();
        }
    }, 5000);
}

// معالجة أخطاء RBAC
function handleRBACError(error) {
    console.error('RBAC Error:', error);
    
    // محاولة إعادة التهيئة
    setTimeout(() => {
        console.log('🔄 محاولة إعادة تهيئة نظام الصلاحيات...');
        isRBACInitialized = false;
        initRBAC();
    }, 5000);
}

// التحقق من صحة النظام
export function validateRBACSystem() {
    const checks = [
        {
            name: 'Firebase Auth',
            check: () => auth !== null,
            critical: true
        },
        {
            name: 'User Role in Session',
            check: () => sessionStorage.getItem('userRole') !== null,
            critical: true
        },
        {
            name: 'User UID in Session',
            check: () => sessionStorage.getItem('userUID') !== null,
            critical: true
        },
        {
            name: 'Current User',
            check: () => auth.currentUser !== null,
            critical: false
        }
    ];
    
    const results = checks.map(({ name, check, critical }) => ({
        name,
        status: check() ? '✅' : '❌',
        critical
    }));
    
    console.group('🔍 RBAC System Validation');
    results.forEach(result => {
        console.log(`${result.status} ${result.name}${result.critical ? ' (Critical)' : ''}`);
    });
    console.groupEnd();
    
    const allCriticalPassed = results.filter(r => r.critical).every(r => r.status === '✅');
    return allCriticalPassed;
}

// بدء التشغيل التلقائي
document.addEventListener('DOMContentLoaded', () => {
    // انتظر قليلاً قبل بدء التهيئة
    setTimeout(() => {
        initRBAC();
    }, 100);
});

// تصدير الدوال الرئيسية
export {
    assignDefaultRoleToNewUser,
    showWelcomeNotification,
    showUserInfo,
    validateRBACSystem
};
