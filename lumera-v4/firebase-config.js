import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyB-CGZSWCYsztuBtkeH9gHWFkq3kZxPwgY",
  authDomain: "lumera-studio.firebaseapp.com",
  projectId: "lumera-studio",
  storageBucket: "lumera-studio.firebasestorage.app",
  messagingSenderId: "578287637773",
  appId: "1:578287637773:web:cb3d0cc456c452a0880c44",
  measurementId: "G-TZ0BG9P1K3"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
