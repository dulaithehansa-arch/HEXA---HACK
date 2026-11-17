import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAK4-LSqRYJ02rJ1QG4wZlrB6A30TWS1rA",
    authDomain: "hexa-hack.firebaseapp.com",
    projectId: "hexa-hack",
    storageBucket: "hexa-hack.firebasestorage.app",
    messagingSenderId: "406340142827",
    appId: "1:406340142827:web:8a42bc3cc1cea0481ee0ae",
    measurementId: "G-CJ5DHD9TR5"
};

const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

isSupported()
    .then(supported => {
        if (supported) getAnalytics(firebaseApp);
    })
    .catch(error => console.error("Firebase Analytics could not initialize:", error));
