import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCWKBxIi9DTuA8hiSMCDUCkNiG_fsFlxyg",
  authDomain: "campaign-prep-fc9ed.firebaseapp.com",
  projectId: "campaign-prep-fc9ed",
  storageBucket: "campaign-prep-fc9ed.firebasestorage.app",
  messagingSenderId: "549573496390",
  appId: "1:549573496390:web:0e718df86b18bbbbb28447"
};

console.log("Initializing Firebase with API Key:", firebaseConfig.apiKey.slice(0, 10) + "...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

console.log("Attempting anonymous sign-in...");
signInAnonymously(auth).then(() => {
    console.log("Success! API key works.");
    process.exit(0);
}).catch(err => {
    console.error("Failed!", err.code, err.message);
    process.exit(1);
});
