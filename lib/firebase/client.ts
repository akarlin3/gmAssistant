import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

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
let _storage: FirebaseStorage | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  
  // Check for missing runtime environment variables to prevent silent failures and clarify "auth/api-key-not-valid" errors
  if (typeof window !== 'undefined') {
    const missingVars = Object.entries(firebaseConfig)
      .filter(([_, val]) => !val)
      .map(([key]) => `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
      
    if (missingVars.length > 0) {
      console.warn(
        `[Firebase SDK] Warning: The following environment variables are missing at runtime: \n` +
        missingVars.map(v => ` - ${v}`).join('\n') +
        `\n\nIf you recently added these to your .env files, please restart your development server (e.g., stop 'npm run dev' and start it again) to bake them into the client bundle.`
      );
    }
  }

  // Use the standard default app to ensure federated Auth (popup/redirects) works correctly
  const existingApp = getApps().find(app => app.name === '[DEFAULT]');
  
  if (existingApp) {
    _app = existingApp;
  } else {
    _app = initializeApp(firebaseConfig);
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
        ignoreUndefinedProperties: true,
      });
    } catch {
      _db = getFirestore(app);
    }
  } else {
    try {
      _db = initializeFirestore(app, {
        ignoreUndefinedProperties: true,
      });
    } catch {
      _db = getFirestore(app);
    }
  }
  return _db;
}

export function getStorageClient(): FirebaseStorage {
  if (_storage) return _storage;
  _storage = getStorage(getFirebaseApp());
  return _storage;
}

export const googleProvider = new GoogleAuthProvider();

export function stripUndefined<T>(obj: T): T {
  if (obj === undefined) return undefined as any;
  if (Array.isArray(obj)) {
    return obj.map(item => stripUndefined(item)) as any;
  }
  if (obj !== null && typeof obj === 'object') {
    const proto = Object.getPrototypeOf(obj);
    if (proto === null || proto === Object.prototype) {
      const result: any = {};
      for (const key of Object.keys(obj)) {
        const val = (obj as any)[key];
        if (val !== undefined) {
          result[key] = stripUndefined(val);
        }
      }
      return result;
    }
  }
  return obj;
}
