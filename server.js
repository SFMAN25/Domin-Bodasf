const express = require('express');
const axios = require('axios');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, get } = require('firebase/database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const firebaseConfig = {
    apiKey: "AIzaSyDfL4KZ0wDUvJI9Go_luMfKFGpW-vj9c8c",
    authDomain: "domin-bodasf.firebaseapp.com",
    databaseURL: "https://domin-bodasf-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "domin-bodasf",
    storageBucket: "domin-bodasf.firebasestorage.app",
    messagingSenderId: "1061722048531",
    appId: "1:1061722048531:web:ffb75c998e238661c0d7e6",
    measurementId: "G-W60VXDTYXH"
};

// التعديل الأمني الجديد والمطلوب لحل مشكلة نظام الفحص الذكي في جيت هب (Secret Scanning)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || "SFMAN25"; 

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

async function verifyUserToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: "غير مسموح! يجب تسجيل الدخول أولاً." });
    }
    const idToken = authHeader.split(' ')[1];
    try {
        const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`;
        const response = await axios.post(verifyUrl, { idToken: idToken });
        if (response.data && response.data.users) {
            req.user = response.data.users[0];
            next();
        } else {
            res.status(401).json({ success: false, message: "جلسة المستخدم منتهية الصلاحية!" });
        }
    } catch (error) {
        res.status(401).json({ success: false, message: "فشل التحقق من هوية المستخدم الحالية." });
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/reserve', verifyUserToken, async (req, res) => {
    const { subdomain } = req.body;
    const userEmail = req.user.email;
    const userUid = req.user.localId;
    try {
        const dbRef = ref(db, 'domains/' + subdomain);
        const snapshot = await get(dbRef);
        if (snapshot.exists()) {
            return res.json({ success: false, message: "هذا الدومين الفرعي محجوز مسبقاً لمشروع آخر!" });
        }
        await set(dbRef, {
            subdomain: subdomain,
            fullDomain: `${subdomain}.bodasf.com`,
            status: "pending_upload",
            ownerEmail: userEmail,
            ownerUid: userUid,
            createdAt: new Date().toISOString()
        });
        res.json({ success: true, message: `ممتاز! النطاق ${subdomain}.bodasf.com متاح، وتم تسجيله.` });
    } catch (error) {
        res.status(500).json({ success: false, message: "خطأ بقاعدة بيانات Firebase: " + error.message });
    }
});

app.post('/api/deploy', verifyUserToken, async (req, res) => {
    const { subdomain, fileName, fileContent } = req.body;
    const userUid = req.user.localId;
    const repoName = `${subdomain}-bodasf-site`;
    try {
        const dbRef = ref(db, 'domains/' + subdomain);
        const snapshot = await get(dbRef);
        if (!snapshot.exists()) {
            return res.status(400).json({ success: false, error: "النطاق غير محجوز!" });
        }
        if (snapshot.val().ownerUid !== userUid) {
            return res.status(403).json({ success: false, error: "خطأ في الصلاحية!" });
        }

        // أ- إنشاء مستودع جديد على GitHub للموقع
        await axios.post('https://api.github.com/user/repos', {
            name: repoName,
            private: false,
            auto_init: true
        }, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3.json' }
        });

        // ب- رفع كود السكربت العميل بداخل المستودع الجديد
        await axios.put(`https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}/contents/${fileName}`, {
            message: `Deploy client system code automatically via domin BOdaSF system`,
            content: fileContent
        }, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3.json' }
        });

        await set(dbRef, {
            ...snapshot.val(),
            status: "active",
            githubRepoUrl: `https://github.com/${GITHUB_USERNAME}/${repoName}`,
            deployedAt: new Date().toISOString()
        });

        res.json({ 
            success: true, 
            message: "تم إنشاء المستودع ورفع الأكواد بنجاح تام!", 
            url: `https://github.com/${GITHUB_USERNAME}/${repoName}` 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.response ? error.response.data.message : error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 السيستم يعمل بكفاءة على بورت: ${PORT}`));
