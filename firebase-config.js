// Firebase 配置（請替換為您自己的設定）
const firebaseConfig = {
  apiKey: "AIzaSyDNjyV0n61XKQnEkZjrJZ5jOwGqhujK724",
  authDomain: "trytry-10818.firebaseapp.com",
  databaseURL: "https://trytry-10818-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "trytry-10818",
  storageBucket: "trytry-10818.firebasestorage.app",
  messagingSenderId: "612680178194",
  appId: "1:612680178194:web:ba5dbb798b1212a8e456cb",
  measurementId: "G-6Z2BZF05QQ"
};

// 初始化 Firebase (v8 命名空間)
firebase.initializeApp(firebaseConfig);

// 初始化 Authentication
const auth = firebase.auth();
const database = firebase.database();

// 設定語言（可選）
auth.languageCode = 'zh-TW';

// 匿名登入（會自動保持登入狀態）
auth.signInAnonymously().catch(error => {
  console.error('匿名登入失敗:', error);
});

// 監聽登入狀態
auth.onAuthStateChanged(user => {
  if (user) {
    console.log('✅ 已匿名登入，UID:', user.uid);
  } else {
    console.log('❌ 未登入');
  }
});
