import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let _app: App | null = null;

function getAdminApp(): App {
  if (_app) return _app;
  const existing = getApps()[0];
  if (existing) {
    _app = existing;
    return _app;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is not set');
  }
  let creds: { project_id: string; client_email: string; private_key: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  _app = initializeApp({
    credential: cert({
      projectId: creds.project_id,
      clientEmail: creds.client_email,
      privateKey: creds.private_key.replace(/\\n/g, '\n'),
    }),
  });
  return _app;
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
