import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDataConnect, connectDataConnectEmulator } from "firebase/data-connect";
import { connectorConfig } from "./dataconnect";

const firebaseConfig = {
  apiKey: "AIzaSyDe38fk234v_nKf6jjr3dusMkKAJwpTK_k",
  authDomain: "uiuc-cmind-2026.firebaseapp.com",
  projectId: "uiuc-cmind-2026",
  storageBucket: "uiuc-cmind-2026.firebasestorage.app",
  messagingSenderId: "150735849884",
  appId: "1:150735849884:web:6fcf2f3774b1103300a059",
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

export const dataConnect = getDataConnect(app, connectorConfig);
// Connect to the local Data Connect emulator (PostgreSQL) only in development
if (process.env.NODE_ENV === 'development') {
  connectDataConnectEmulator(dataConnect, 'localhost', 9399);
}

