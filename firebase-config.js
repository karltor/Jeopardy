// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCCFK1oqQgldOfYUQCGWfIB-j-PdfJTGqQ",
    authDomain: "jeopardy-buzzer-f135a.firebaseapp.com",
    projectId: "jeopardy-buzzer-f135a",
    storageBucket: "jeopardy-buzzer-f135a.firebasestorage.app",
    messagingSenderId: "743013683548",
    appId: "1:743013683548:web:ced80dedbc5944a8d33199",
    measurementId: "G-MC0X368NB6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db, signInAnonymously };
