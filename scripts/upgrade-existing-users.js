// scripts/upgrade-existing-users.js
// قم بتشغيل هذا السكريبت مرة واحدة فقط من خلال Node.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // حمّل هذا الملف من Firebase Console

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// ============================================
// قائمة المستخدمين الحاليين (أضف بياناتهم هنا)
// ============================================
const EXISTING_USERS = [
    { email: 'user1@example.com', name: 'أحمد' },
    { email: 'user2@example.com', name: 'محمد' },
    { email: 'user3@example.com', name: 'سارة' },
    { email: 'user4@example.com', name: 'فاطمة' }
];

async function upgradeExistingUsersToAdmin() {
    console.log('🚀 بدء ترقية المستخدمين الحاليين إلى أدمن...');
    
    let upgradedCount = 0;
    let notFoundCount = 0;
    
    for (const user of EXISTING_USERS) {
        try {
            // البحث عن المستخدم بالبريد الإلكتروني
            const userRecord = await admin.auth().getUserByEmail(user.email);
            
            // تعيين صلاحية admin
            await admin.auth().setCustomUserClaims(userRecord.uid, {
                admin: true,
                manager: false,
                viewer: false
            });
            
            // تسجيل في Firestore
            await admin.firestore().collection('user_roles').doc(userRecord.uid).set({
                email: user.email,
                displayName: user.name,
                role: 'admin',
                isOriginalUser: true,  // علامة للمستخدم الأصلي
                upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
                upgradedBy: 'system'
            }, { merge: true });
            
            // تسجيل في Audit Trail
            await admin.firestore().collection('audit_logs').add({
                action: 'auto_upgrade_to_admin',
                targetEmail: user.email,
                targetUid: userRecord.uid,
                performedBy: 'system',
                reason: 'مستخدم أصلي في النظام',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`✅ تم ترقية: ${user.email} (${user.name})`);
            upgradedCount++;
            
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                console.log(`❌ لم يتم العثور على المستخدم: ${user.email}`);
                notFoundCount++;
            } else {
                console.error(`❌ خطأ في ترقية ${user.email}:`, error.message);
            }
        }
    }
    
    console.log('\n📊 التقرير النهائي:');
    console.log(`   - تم ترقية: ${upgradedCount} مستخدم`);
    console.log(`   - غير موجود: ${notFoundCount} مستخدم`);
    console.log('✅ اكتملت عملية الترقية!');
}

// تشغيل السكريبت
upgradeExistingUsersToAdmin().then(() => process.exit(0));
