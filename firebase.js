// firebase.js (solo JS)
window.firebaseConfig = {
  apiKey: "AIzaSyAUBfdL7ul0akWN8NJjk90GVNSDI4WG_wI",
  authDomain: "calendario-38202.firebaseapp.com",
  projectId: "calendario-38202",
  storageBucket: "calendario-38202.firebasestorage.app",
  messagingSenderId: "857498755424",
  appId: "1:857498755424:web:c5ea0c45546d235871fe05"
};

firebase.initializeApp(window.firebaseConfig);

window.fbAuth = firebase.auth();
window.fbDB   = firebase.firestore();