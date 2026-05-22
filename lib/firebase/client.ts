import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore';

function getEnv(value: string | undefined): string | undefined {
  if (!value || value === 'undefined' || value.trim() === '') return undefined;
  return value;
}

const firebaseConfig = {
  apiKey: getEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
  authDomain: getEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: getEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: getEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: getEnv(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: getEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
};



let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  
  const APP_NAME = 'gmbuilder-app';
  const existingApp = getApps().find(app => app.name === APP_NAME);
  
  if (existingApp) {
    _app = existingApp;
  } else {
    _app = initializeApp(firebaseConfig, APP_NAME);
  }
  
  return _app;
}

export function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getFirebaseApp());
  return _auth;
}

export function getDb(): Firestore {
  if (_db) return _db;
  const app = getFirebaseApp();
  if (typeof window !== 'undefined') {
    try {
      _db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch {
      _db = getFirestore(app);
    }
  } else {
    _db = getFirestore(app);
  }
  return _db;
}

export const googleProvider = new GoogleAuthProvider();
