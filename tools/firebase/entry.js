// The parts of the Firebase SDK that Masa uses, bundled into one self-hosted file (no scripts from other sites).
// Build: cd tools/firebase && npm ci && npm run build
import { initializeApp } from "firebase/app";
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged, signInWithCredential, GoogleAuthProvider, signOut, deleteUser, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, deleteField, connectFirestoreEmulator, getDocs } from "firebase/firestore";
window.MasaFire = {
  initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged, signInWithCredential, GoogleAuthProvider, signOut, deleteUser, connectAuthEmulator,
  initializeFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, deleteField, connectFirestoreEmulator, getDocs
};
