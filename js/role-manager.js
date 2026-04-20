// js/role-manager.js - Role Management and Assignment
import { auth, db, doc, setDoc, getDoc, collection, getDocs, query, where, updateDoc } from './firebase-config.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js';

// Cloud Functions references
let functions;
let assignUserRoleFunction;
let getAllUsersFunction;
let deleteUserFunction;
let createUserWithRoleFunction;
const ORIGINAL_ADMIN_EMAILS = new Set([
    'ahmed@safatrans.com',
    'hesham@safatrans.com',
    'omar@safatrans.com',
    'sabry@safatrans.com'
]);

function isOriginalAdminEmail(email) {
    return ORIGINAL_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

// تهيئة Firebase Functions
async function initFunctions() {
    if (!functions) {
        const { getFunctions } = await import('https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js');
        functions = getFunctions();
        assignUserRoleFunction = httpsCallable(functions, 'assignUserRole');
        getAllUsersFunction = httpsCallable(functions, 'getAllUsers');
        deleteUserFunction = httpsCallable(functions, 'deleteUser');
        createUserWithRoleFunction = httpsCallable(functions, 'createUserWithRole');
    }
}

// تعيين دور للمستخدم
export async function assignUserRole(uid, role, assignedBy = null) {
    try {
        await initFunctions();
        
        const result = await assignUserRoleFunction({
            uid: uid,
            role: role,
            assignedBy: assignedBy || auth.currentUser.uid
        });
        
        return result.data;
    } catch (error) {
        console.error('Error assigning user role:', error);
        throw new Error(error.message);
    }
}

// الحصول على جميع المستخدمين مع أدوارهم
export async function getAllUsers() {
    try {
        await initFunctions();
        
        const result = await getAllUsersFunction();
        return result.data.users;
    } catch (error) {
        console.error('Error getting all users:', error);
        throw new Error(error.message);
    }
}

// حذف مستخدم
export async function deleteUser(uid, deletedBy = null) {
    try {
        await initFunctions();
        
        const result = await deleteUserFunction({
            uid: uid,
            deletedBy: deletedBy || auth.currentUser.uid
        });
        
        return result.data;
    } catch (error) {
        console.error('Error deleting user:', error);
        throw new Error(error.message);
    }
}

export async function createUserWithRole(email, password, displayName, role = 'viewer', createdBy = null) {
    try {
        await initFunctions();

        const result = await createUserWithRoleFunction({
            email,
            password,
            displayName,
            role,
            createdBy: createdBy || auth.currentUser?.uid || null
        });

        return result.data;
    } catch (error) {
        console.error('Error creating user with role:', error);
        throw new Error(error.message);
    }
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
