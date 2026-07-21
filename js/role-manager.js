// js/role-manager.js - Role Management and Assignment
import { auth, db, doc, setDoc, getDoc, collection, getDocs, query, where, updateDoc, deleteDoc } from '../firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

// Skip Cloud Functions on GitHub Pages (CORS not configured)
let useLocalFallback = window.location.hostname.includes('github.io');
const ORIGINAL_ADMIN_EMAILS = new Set([
    'ahmed@safatrans.com',
    'hesham@safatrans.com',
    'omar@safatrans.com',
    'sabry@safatrans.com'
]);

function isOriginalAdminEmail(email) {
    return ORIGINAL_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

// Page registry for permission system
export const PAGE_REGISTRY = {
    "dashboard":      { id: "dashboard",      title: "لوحة التحكم",         file: "dashboard.html",                 default: "edit" },
    "fleet":          { id: "fleet",          title: "إدارة الأسطول",       file: "fleet-management-system.html",    default: "view" },
    "inventory":      { id: "inventory",      title: "المخزون والأصول",     file: "inventory-assets-system.html",    default: "view" },
    "prices":         { id: "prices",         title: "أسعار الحاويات",      file: "prices.html",                     default: "view" },
    "daily":          { id: "daily",          title: "الشغل اليومي",        file: "daily.html",                      default: "view" },
    "drivers_roles":  { id: "drivers_roles",  title: "أدوار السواقين",      file: "drivers-roles-page.html",         default: "view" },
    "treasury":       { id: "treasury",       title: "الخزنة والتشغيل",     file: "treasury-system.html",            default: "view" },
    "warehouse":      { id: "warehouse",      title: "إدارة العهد",        file: "warehouse-management-fixed.html", default: "view" },
    "treasury_banks": { id: "treasury_banks", title: "الخزينة والبنوك",      file: "treasury-banks.html",             default: "view" },
    "garage":         { id: "garage",         title: "نظام الجراج",         file: "garage_system.html",              default: "view" },
    "lists":          { id: "lists",          title: "القوائم المشتركة",    file: "shared-lists.html",               default: "view" },
    "admin":          { id: "admin",          title: "لوحة الإدارة",        file: "admin-panel.html",                default: null }
};

export function getPageIdFromFile(file) {
    for (const [id, info] of Object.entries(PAGE_REGISTRY)) {
        if (info.file === file) return id;
    }
    return null;
}

export function getCurrentPageId() {
    const path = window.location.pathname.split('/').pop() || 'dashboard.html';
    return getPageIdFromFile(path);
}

// Save page permissions for a user
export async function saveUserPagePermissions(uid, pages) {
    const userRoleRef = doc(db, 'user_roles', uid);
    await setDoc(userRoleRef, { pages }, { merge: true });
    return true;
}

// Get page permissions for a user
export async function getUserPagePermissions(uid) {
    const userRoleDoc = await getDoc(doc(db, 'user_roles', uid));
    if (userRoleDoc.exists()) {
        return userRoleDoc.data().pages || {};
    }
    return {};
}

// Check if current user can access a given page
export async function canAccessPage(pageId) {
    if (!auth.currentUser) return false;
    const uid = auth.currentUser.uid;
    const email = auth.currentUser.email || '';
    if (isOriginalAdminEmail(email)) return 'edit';

    const pages = await getUserPagePermissions(uid);
    const perm = pages[pageId];
    if (perm === 'edit' || perm === 'view') return perm;

    const pageInfo = PAGE_REGISTRY[pageId];
    return pageInfo ? pageInfo.default : null;
}

// Get default permissions map for a new user (all pages with their defaults)
export function getDefaultPermissions() {
    const perms = {};
    for (const [id, info] of Object.entries(PAGE_REGISTRY)) {
        perms[id] = info.default;
    }
    return perms;
}

// Try Cloud Functions first, fall back to direct Firestore operations
async function withFallback(funcName, fn, fallbackFn) {
    if (useLocalFallback) return fallbackFn();
    try {
        const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js');
        const { getFunctions } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js');
        const functions = getFunctions();
        const callable = httpsCallable(functions, funcName);
        const result = await fn(callable);
        return result;
    } catch (error) {
        if (error.code === 'internal' || error.message?.includes('internal') || 
            error.message?.includes('not-found') || error.message?.includes('CORS') ||
            error.message?.includes('NETWORK_ERROR')) {
            console.warn(`Cloud Function ${funcName} unavailable, using local fallback`);
            useLocalFallback = true;
            return fallbackFn();
        }
        throw error;
    }
}

// تعيين دور للمستخدم
export async function assignUserRole(uid, role, assignedBy = null) {
    return withFallback('assignUserRole',
        async (callable) => {
            const result = await callable({ uid, role, assignedBy: assignedBy || auth.currentUser.uid });
            return result.data;
        },
        async () => {
            const userRoleRef = doc(db, 'user_roles', uid);
            const existing = await getDoc(userRoleRef);
            const data = existing.exists() ? existing.data() : {};
            await setDoc(userRoleRef, {
                ...data,
                role: role,
                updatedAt: new Date(),
                updatedBy: auth.currentUser?.uid || 'system',
                email: data.email || ''
            }, { merge: true });
            return { success: true };
        }
    );
}

// الحصول على جميع المستخدمين مع أدوارهم
export async function getAllUsers() {
    return withFallback('getAllUsers',
        async (callable) => {
            const result = await callable();
            return result.data;
        },
        async () => {
            const snapshot = await getDocs(collection(db, 'user_roles'));
            const users = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                users.push({
                    uid: doc.id,
                    email: data.email || '',
                    displayName: data.displayName || '',
                    role: data.role || 'viewer',
                    isOriginal: data.isOriginalUser === true || isOriginalAdminEmail(data.email),
                    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || '',
                    lastSignIn: data.lastSignIn?.toDate?.()?.toISOString?.() || data.lastSignIn || '',
                    disabled: data.disabled || false,
                    emailVerified: data.emailVerified || false
                });
            });
            users.sort((a, b) => a.email.localeCompare(b.email));
            return { users };
        }
    );
}

// حذف مستخدم
export async function deleteUser(uid, deletedBy = null) {
    return withFallback('deleteUser',
        async (callable) => {
            const result = await callable({ uid, deletedBy: deletedBy || auth.currentUser.uid });
            return result.data;
        },
        async () => {
            await deleteDoc(doc(db, 'user_roles', uid));
            await deleteDoc(doc(db, 'audit_logs', uid));
            console.warn('deleteUser fallback: removed from user_roles. Auth user NOT deleted (requires Cloud Functions)');
            return { success: true, note: 'تم حذف الدور فقط. لم يتم حذف حساب Auth لأنه يتطلب نشر Functions.' };
        }
    );
}

export async function createUserWithRole(email, password, displayName, role = 'viewer', createdBy = null) {
    return withFallback('createUserWithRole',
        async (callable) => {
            const result = await callable({ email, password, displayName, role, createdBy: createdBy || auth.currentUser?.uid || null });
            return result.data;
        },
        async () => {
            const currentUser = auth.currentUser;
            if (!currentUser || !currentUser.email) {
                throw new Error('يجب تسجيل الدخول كمسؤول أولاً');
            }
            const adminEmail = currentUser.email;
            const adminPassword = prompt('لإنشاء مستخدم جديد، أدخل كلمة مرور المسؤول لإعادة تسجيل الدخول بعد الإنشاء:');
            if (!adminPassword) {
                throw new Error('تم إلغاء إنشاء المستخدم');
            }

            window.__skipReinit = true;

            try {
                const userCred = await createUserWithEmailAndPassword(auth, email, password);
                const newUid = userCred.user.uid;

                await setDoc(doc(db, 'user_roles', newUid), {
                    email,
                    displayName,
                    role: role || 'viewer',
                    isOriginalUser: false,
                    createdBy: createdBy || currentUser.uid || 'system',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    pages: getDefaultPermissions()
                });

                await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
                window.__skipReinit = false;
                return { success: true, uid: newUid };
            } catch (err) {
                window.__skipReinit = false;
                if (err.code === 'auth/email-already-in-use') {
                    throw new Error('البريد الإلكتروني مستخدم بالفعل');
                }
                if (err.code === 'auth/weak-password') {
                    throw new Error('كلمة المرور ضعيفة جداً (6 أحرف على الأقل)');
                }
                throw new Error('فشل إنشاء المستخدم: ' + (err.message || 'خطأ غير متوقع'));
            }
        }
    );
}

// التأكد من أن المستخدم لديه دور
export async function ensureUserHasRole(user) {
    try {
        if (isOriginalAdminEmail(user.email)) {
            return;
        }

        // التحقق من Custom Claims
        const tokenResult = await user.getIdTokenResult();
        const hasAnyRole = tokenResult.claims.admin || 
                          tokenResult.claims.manager || 
                          tokenResult.claims.viewer;
        
        if (hasAnyRole) {
            return; // المستخدم لديه دور بالفعل
        }
        
        // تعيين دور viewer افتراضي للمستخدمين الجدد
        await assignUserRole(user.uid, 'viewer', 'system');
        
        console.log(`✅ تم تعيين دور viewer تلقائياً للمستخدم الجديد: ${user.email}`);
    } catch (error) {
        console.error('Error ensuring user has role:', error);
        throw error;
    }
}

// الحصول على دور المستخدم من Firestore
export async function getUserRoleFromFirestore(uid) {
    try {
        const userRoleDoc = await getDoc(doc(db, 'user_roles', uid));
        if (userRoleDoc.exists()) {
            return userRoleDoc.data().role;
        }
        return null;
    } catch (error) {
        console.error('Error getting user role from Firestore:', error);
        return null;
    }
}

// تحديث دور المستخدم في Firestore
export async function updateUserRoleInFirestore(uid, role, updatedBy = null) {
    try {
        const userRoleRef = doc(db, 'user_roles', uid);
        const userRoleDoc = await getDoc(userRoleRef);
        
        const roleData = {
            role: role,
            updatedAt: new Date(),
            updatedBy: updatedBy || auth.currentUser?.uid
        };
        
        if (userRoleDoc.exists()) {
            await updateDoc(userRoleRef, roleData);
        } else {
            await setDoc(userRoleRef, roleData);
        }
        
        return true;
    } catch (error) {
        console.error('Error updating user role in Firestore:', error);
        throw error;
    }
}

// التحقق مما إذا كان المستخدم أصلياً
export async function isOriginalUser(uid) {
    try {
        const userRoleDoc = await getDoc(doc(db, 'user_roles', uid));
        return userRoleDoc.exists && userRoleDoc.data().isOriginalUser === true;
    } catch (error) {
        console.error('Error checking if user is original:', error);
        return false;
    }
}

// الحصول على المستخدمين الأصليين
export async function getOriginalUsers() {
    try {
        const userRolesQuery = query(
            collection(db, 'user_roles'),
            where('isOriginalUser', '==', true)
        );
        const snapshot = await getDocs(userRolesQuery);
        
        return snapshot.docs.map(doc => ({
            uid: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error getting original users:', error);
        return [];
    }
}

// تسجيل تغيير الدور في Audit Trail
export async function logRoleChange(targetUid, targetEmail, oldRole, newRole, changedBy) {
    try {
        const auditData = {
            action: 'role_change',
            targetUid: targetUid,
            targetEmail: targetEmail,
            oldRole: oldRole,
            newRole: newRole,
            changedBy: changedBy,
            timestamp: new Date(),
            userAgent: navigator.userAgent,
            ip: await getUserIP()
        };
        
        await setDoc(doc(collection(db, 'audit_logs')), auditData);
    } catch (error) {
        console.error('Error logging role change:', error);
    }
}

// الحصول على IP المستخدم (باستخدام API بسيط)
async function getUserIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        return 'unknown';
    }
}

// التحقق من صلاحية تغيير دور المستخدم
export function canChangeUserRole(targetUserRole, currentUserRole, isOriginalUser = false) {
    // لا يمكن تغيير صلاحية المستخدمين الأصليين
    if (isOriginalUser) {
        return {
            allowed: false,
            reason: 'لا يمكن تغيير صلاحية المستخدمين الأصليين في النظام'
        };
    }
    
    // قواعد التسلسل الهرمي للصلاحيات
    const roleHierarchy = {
        'viewer': 1,
        'manager': 2,
        'admin': 3
    };
    
    const targetLevel = roleHierarchy[targetUserRole] || 0;
    const currentLevel = roleHierarchy[currentUserRole] || 0;
    
    // لا يمكن للمستخدم تغيير دور مستخدم أعلى منه
    if (targetLevel >= currentLevel) {
        return {
            allowed: false,
            reason: 'لا يمكن تغيير صلاحية مستخدم بنفس صلاحيتك أو أعلى'
        };
    }
    
    // فقط Admin يمكنه تعيين أدوار Admin
    if (currentUserRole !== 'admin' && targetLevel === 3) {
        return {
            allowed: false,
            reason: 'فقط Admin يمكنه تعيين صلاحية Admin'
        };
    }
    
    return {
        allowed: true,
        reason: null
    };
}

// الحصول على إحصائيات الأدوار
export async function getRoleStatistics() {
    try {
        const userRolesSnapshot = await getDocs(collection(db, 'user_roles'));
        const roles = { admin: 0, manager: 0, viewer: 0 };
        let originalUsers = 0;
        
        userRolesSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const role = data.role;
            
            if (roles.hasOwnProperty(role)) {
                roles[role]++;
            }
            
            if (data.isOriginalUser) {
                originalUsers++;
            }
        });
        
        return {
            ...roles,
            total: userRolesSnapshot.size,
            originalUsers: originalUsers
        };
    } catch (error) {
        console.error('Error getting role statistics:', error);
        return { admin: 0, manager: 0, viewer: 0, total: 0, originalUsers: 0 };
    }
}

// البحث عن المستخدمين
export async function searchUsers(searchTerm) {
    try {
        const allUsers = await getAllUsers();
        
        if (!searchTerm) {
            return allUsers;
        }
        
        const term = searchTerm.toLowerCase();
        return allUsers.filter(user => 
            user.email.toLowerCase().includes(term) ||
            (user.displayName && user.displayName.toLowerCase().includes(term))
        );
    } catch (error) {
        console.error('Error searching users:', error);
        return [];
    }
}

// تصفية المستخدمين حسب الدور
export function filterUsersByRole(users, role) {
    if (!role || role === 'all') {
        return users;
    }
    
    return users.filter(user => user.role === role);
}

// ترتيب المستخدمين
export function sortUsers(users, sortBy = 'email', order = 'asc') {
    return users.sort((a, b) => {
        let aValue = a[sortBy] || '';
        let bValue = b[sortBy] || '';
        
        if (sortBy === 'createdAt' || sortBy === 'lastSignIn') {
            aValue = new Date(aValue);
            bValue = new Date(bValue);
        } else {
            aValue = aValue.toString().toLowerCase();
            bValue = bValue.toString().toLowerCase();
        }
        
        if (order === 'desc') {
            return bValue > aValue ? 1 : bValue < aValue ? -1 : 0;
        } else {
            return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        }
    });
}

// تصدير بيانات المستخدمين
export function exportUsersToCSV(users) {
    const headers = [
        'البريد الإلكتروني',
        'الاسم',
        'الدور',
        'تاريخ الإنشاء',
        'آخر تسجيل دخول',
        'مستخدم أصلي'
    ];
    
    const rows = users.map(user => [
        user.email,
        user.displayName || '',
        user.role || '',
        user.createdAt ? new Date(user.createdAt).toLocaleDateString('ar-EG') : '',
        user.lastSignIn ? new Date(user.lastSignIn).toLocaleDateString('ar-EG') : '',
        user.isOriginal ? 'نعم' : 'لا'
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `users_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
