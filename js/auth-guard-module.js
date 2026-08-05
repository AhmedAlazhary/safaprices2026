// ============================================================
// نظام الصلاحيات - الحارس المركزي (Auth Guard)
// نسخة معاد بناؤها بالكامل من البداية.
//
// الفكرة: عند تحميل أي صفحة محمية، نقرأ صلاحيات المستخدم
// مباشرة من Firestore (user_roles/{uid}.pages) ونطبّقها فورًا:
//   - ممنوع  (null)   => تحويل تلقائي إلى dashboard.html
//   - عرض    (view)   => السماح بالدخول مع إخفاء أزرار التعديل
//   - تعديل  (edit)   => دخول كامل
// نقرأ دائمًا من قاعدة البيانات عند كل تحميل صفحة، ولا نعتمد
// على كاش قديم، حتى تنطبق تغييرات الأدمن فورًا على أي مستخدم
// (سواء كان جالسًا بالفعل أو يسجل دخولًا جديدًا).
// ============================================================
import { auth, db, doc, getDoc, signOut, onAuthStateChanged } from '../firebase-config.js';
import { getCurrentPageId, PAGE_REGISTRY } from './role-manager.js';

const ORIGINAL_ADMIN_EMAILS = new Set([
    'ahmed@safatrans.com',
    'hesham@safatrans.com',
    'omar@safatrans.com',
    'sabry@safatrans.com'
]);

// ---------- أدوات مساعدة ----------

function isOriginalAdmin(email) {
    return ORIGINAL_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

// المصدر النشط لتسجيل الدخول: نسخة compat إن وُجدت على الصفحة، وإلا نسخة modular.
function activeAuth() {
    try {
        if (window.firebase && typeof window.firebase.auth === 'function') {
            return window.firebase.auth();
        }
    } catch (e) {}
    return auth;
}

// قراءة بيانات المستخدم من Firestore عبر المصدر النشط (النسخة المسجّل عليها الدخول).
async function readUserRole(uid) {
    try {
        if (window.firebase && typeof window.firebase.firestore === 'function') {
            const fs = window.firebase.firestore();
            const snap = await fs.collection('user_roles').doc(uid).get();
            return snap.exists ? snap.data() : null;
        }
    } catch (e) {}
    const snap = await getDoc(doc(db, 'user_roles', uid));
    return snap.exists ? snap.data() : null;
}

// حساب صلاحية صفحة معينة: القيمة الصريحة، فإن لم توجد نستخدم الافتراضي.
function computePermission(pages, pageId) {
    let perm = pages[pageId];
    if (perm === undefined) {
        perm = PAGE_REGISTRY[pageId]?.default ?? null;
    }
    if (perm === '') perm = null; // القيمة الفارغة تعني "ممنوع"
    return perm;
}

function permLabel(perm) {
    if (perm === null) return 'ممنوع';
    if (perm === 'edit') return 'تعديل';
    if (perm === 'view') return 'عرض';
    return String(perm || 'غير محدد');
}

// شارة صغيرة توضح الصلاحية الحالية للصفحة (للتحقق السريع).
function showBadge(pageId, perm, email) {
    try {
        const old = document.getElementById('perm-badge');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'perm-badge';
        el.title = 'نظام الصلاحيات';
        el.style.cssText = [
            'position:fixed', 'bottom:8px', 'left:8px', 'z-index:2147483647',
            'background:rgba(0,0,0,.78)', 'color:#fff', 'padding:5px 12px',
            'border-radius:14px', 'font:12px Tahoma,Arial,sans-serif',
            'direction:rtl', 'box-shadow:0 2px 8px rgba(0,0,0,.3)'
        ].join(';');
        el.textContent = `صلاحية ${pageId}: ${permLabel(perm)}`;
        document.body.appendChild(el);
    } catch (e) {}
}

// ---------- المنفذ الأساسي ----------

// يقرأ بيانات المستخدم من قاعدة البيانات ويطبّق الصلاحية على الصفحة الحالية.
async function enforceForUser(uid, email) {
    const pageId = getCurrentPageId();
    if (!pageId) return;

    let data = null;
    try {
        data = await readUserRole(uid);
    } catch (e) {
        console.error('[صلاحيات] فشل قراءة بيانات المستخدم:', e);
    }

    const pages = (data && data.pages) || {};
    const role = (data && data.role) || (isOriginalAdmin(email) ? 'admin' : 'viewer');
    const privileged = role === 'admin' || isOriginalAdmin(email);

    const perm = privileged ? 'edit' : computePermission(pages, pageId);

    // تحديث بيانات الجلسة حتى تُستخدم في باقي الصفحة (عرض فقط / تحرير)
    sessionStorage.setItem('userUID', uid);
    sessionStorage.setItem('userEmail', email || '');
    sessionStorage.setItem('userRole', role);
    sessionStorage.setItem('userPages', JSON.stringify(pages));
    sessionStorage.setItem('pagePermission', perm ?? '');

    console.log(`[صلاحيات] ${email || uid} على "${pageId}" => ${permLabel(perm)}`);

    if (perm === null && pageId !== 'dashboard') {
        console.log(`[صلاحيات] تحويل ${email || uid} إلى dashboard.html`);
        window.location.href = 'dashboard.html';
        return;
    }

    if (perm !== null) showBadge(pageId, perm, email);
}

// ---------- التشغيل التلقائي عند تحميل الصفحة ----------

(function run() {
    const pageId = getCurrentPageId();
    if (!pageId) return; // صفحة غير مسجلة (مثل index.html)

    // 1) فحص فوري من بيانات الجلسة (تُحفظ عند تسجيل الدخول) لمنع وميض الصفحة.
    const email = String(sessionStorage.getItem('userEmail') || '').trim().toLowerCase();
    const role = sessionStorage.getItem('userRole') || '';
    const privileged = ORIGINAL_ADMIN_EMAILS.has(email) || role === 'admin';

    if (!privileged) {
        let pages = {};
        try {
            pages = JSON.parse(sessionStorage.getItem('userPages') || '{}');
        } catch (e) {}
        const perm = computePermission(pages, pageId);
        sessionStorage.setItem('pagePermission', perm ?? '');
        if (perm === null && pageId !== 'dashboard') {
            console.log(`[صلاحيات] منع فوري: ${email || 'مستخدم'} على "${pageId}"`);
            window.location.href = 'dashboard.html';
            return;
        }
        if (perm !== null && sessionStorage.getItem('userUID')) showBadge(pageId, perm, email);
    } else {
        sessionStorage.setItem('pagePermission', 'edit');
        if (sessionStorage.getItem('userUID')) showBadge(pageId, 'edit', email);
    }

    // 2) تحقق دائم من قاعدة البيانات عند كل تحميل (يلغي أي كاش قديم
    //    ويطبّق آخر تعديلات الأدمن على أي جلسة قائمة).
    const source = activeAuth();
    try {
        const handleUser = (user) => {
            if (user) enforceForUser(user.uid, user.email);
        };
        if (source && typeof source.onAuthStateChanged === 'function') {
            source.onAuthStateChanged(handleUser); // نسخة compat
        } else if (source) {
            onAuthStateChanged(source, handleUser); // نسخة modular
        }
    } catch (e) {}
})();

// ---------- تصديرات للاستخدام في باقي الصفحات ----------

export function getCurrentUserRole() {
    const email = String(sessionStorage.getItem('userEmail') || '').trim().toLowerCase();
    if (ORIGINAL_ADMIN_EMAILS.has(email)) return 'admin';
    return sessionStorage.getItem('userRole') || 'viewer';
}

export function isAdmin() {
    return getCurrentUserRole() === 'admin';
}

export function isManagerOrAbove() {
    return ['admin', 'manager'].includes(getCurrentUserRole());
}

export function isViewerOrAbove() {
    return ['admin', 'manager', 'viewer'].includes(getCurrentUserRole());
}

export async function getUserRole(user) {
    try {
        const email = String(user?.email || '').trim().toLowerCase();
        if (ORIGINAL_ADMIN_EMAILS.has(email)) return 'admin';

        const tokenResult = await user.getIdTokenResult(true);
        if (tokenResult.claims.admin) return 'admin';
        if (tokenResult.claims.manager) return 'manager';
        if (tokenResult.claims.viewer) return 'viewer';

        const data = await readUserRole(user.uid);
        if (data && data.role) return data.role;
    } catch (error) {
        console.error('Error getting user role:', error);
    }
    return 'viewer';
}

// صلاحية صفحة معينة للمستخدم الحالي (يُستخدم من لوحة التحكم).
export async function getPageLevelPermission(pageId) {
    const uid = sessionStorage.getItem('userUID');
    const email = String(sessionStorage.getItem('userEmail') || '').trim().toLowerCase();
    if (ORIGINAL_ADMIN_EMAILS.has(email)) return 'edit';
    if (!uid) return null;
    let data = null;
    try {
        data = await readUserRole(uid);
    } catch (e) {}
    const pages = (data && data.pages) || {};
    return computePermission(pages, pageId);
}

// عند "عرض فقط": تعطيل أزرار التعديل في الصفحة.
export function protectPageElements(editSelectors) {
    const perm = sessionStorage.getItem('pagePermission');
    if (perm === 'edit' || !perm) return;

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
    } catch (e) {}
    try {
        if (window.firebase && typeof window.firebase.auth === 'function') {
            await window.firebase.auth().signOut();
        }
    } catch (e) {}
    sessionStorage.clear();
    window.location.href = 'index.html';
}

export { getCurrentPageId, PAGE_REGISTRY };

window.authGuardModule = {
    getCurrentUserRole,
    isAdmin,
    isManagerOrAbove,
    isViewerOrAbove,
    getUserRole,
    logout,
    getPageLevelPermission,
    protectPageElements,
    protectButton,
    getCurrentPageId,
    PAGE_REGISTRY
};
