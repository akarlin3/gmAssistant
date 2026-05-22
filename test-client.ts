import { getFirebaseApp } from './lib/firebase/client';
const app = getFirebaseApp();
console.log("App Options initialized:", app.options);
