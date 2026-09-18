"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  isGuest: boolean;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleRedirect: () => Promise<void>;
  loginAsGuest: () => void;
  exitGuest: () => void;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isGuest: false,
  loading: true,
  error: null,
  signInWithGoogle: async () => {},
  signInWithGoogleRedirect: async () => {},
  loginAsGuest: () => {},
  exitGuest: () => {},
  logout: async () => {},
  clearError: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedGuest = sessionStorage.getItem("uiuc_cmind_guest");
      if (storedGuest === "true") {
        setIsGuest(true);
      }
    }

    // Check if user is returning from a redirect sign-in flow
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          setUser(result.user);
          setIsGuest(false);
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("uiuc_cmind_guest");
          }
        }
      })
      .catch((err: any) => {
        console.error("Firebase redirect result error:", err);
        handleAuthError(err);
      });

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setIsGuest(false);
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("uiuc_cmind_guest");
        }
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleAuthError = (err: any) => {
    console.error("Firebase auth error:", err);
    if (err?.code === "auth/unauthorized-domain") {
      const currentHost = typeof window !== "undefined" ? window.location.hostname : "your domain";
      setError(
        `Domain "${currentHost}" is not authorized in Firebase Authentication. Please ensure it is added to the Authorized Domains list in the Firebase Console.`
      );
    } else if (err?.code === "auth/popup-blocked") {
      setError("Pop-up was blocked by your browser. You can use redirect sign-in instead.");
    } else if (err?.code === "auth/cancelled-popup-request" || err?.code === "auth/popup-closed-by-user") {
      // User closed the popup window or opened multiple popups
      setError(null);
    } else {
      setError(err?.message || "Failed to sign in. Please try again.");
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err?.code === "auth/popup-blocked") {
        console.warn("Popup blocked, attempting redirect sign-in fallback...");
        await signInWithRedirect(auth, provider);
        return;
      }
      handleAuthError(err);
    }
  };

  const signInWithGoogleRedirect = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithRedirect(auth, provider);
    } catch (err: any) {
      handleAuthError(err);
    }
  };

  const loginAsGuest = () => {
    setIsGuest(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("uiuc_cmind_guest", "true");
    }
  };

  const exitGuest = () => {
    setIsGuest(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("uiuc_cmind_guest");
    }
  };

  const logout = async () => {
    setError(null);
    setIsGuest(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("uiuc_cmind_guest");
    }
    await signOut(auth);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        isGuest,
        loading,
        error,
        signInWithGoogle,
        signInWithGoogleRedirect,
        loginAsGuest,
        exitGuest,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
