"use client";

import { logger } from "@/lib/logger";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface UserProfile {
  uid: string;
  fullName: string;
  username: string;
  email: string | null;
  photoURL?: string | null;
}

interface UserContextType {
  user: UserProfile | null;
  loading: boolean;
}

const UserContext = createContext<UserContextType>({ user: null, loading: true });

/** Routes viewable without an account (no redirect / no skeleton). */
function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/ms" ||
    pathname === "/login" ||
    pathname === "/onboarding" ||
    pathname.startsWith("/alert") ||
    pathname.startsWith("/guardian/invite")
  );
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Let the scanner be evaluated locally without Firebase credentials.
    // Authenticated features remain unavailable until Firebase is configured.
    if (!isFirebaseConfigured) return;

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          fullName: firebaseUser.displayName || "User",
          username: "user",
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL || null,
        });
        setLoading(false);

        try {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const data = userDoc.data();
            setUser({
              uid: firebaseUser.uid,
              fullName: data.fullName || firebaseUser.displayName || "User",
              username: data.username || "user",
              email: firebaseUser.email,
              photoURL: data.photoURL || firebaseUser.photoURL || null,
            });
          }
        } catch (error) {
          logger.error("Error fetching user profile:", error);
        }
      } else {
        setUser(null);
        if (!isPublicPath(pathname)) {
          let onboarded = false;
          try {
            onboarded = localStorage.getItem("guidr_onboarded") === "1";
          } catch {
            // Storage is unavailable; direct the person through onboarding.
          }
          router.push(onboarded ? "/login" : "/onboarding");
        }
        setLoading(false);
      }
      });
    } catch (error) {
      logger.warn("Firebase authentication is unavailable; continuing in local scan-only mode.", error);
      queueMicrotask(() => {
        setUser(null);
        setLoading(false);
      });
      return;
    }

    return () => unsubscribe?.();
  }, [pathname, router]);

  if (loading && !isPublicPath(pathname)) {
    return (
      <div className="min-h-dvh bg-guidr-bg flex flex-col">
        <div className="sticky top-0 flex items-center justify-between px-5 pt-safe-top pb-3 bg-white/90 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl animate-pulse bg-gray-200" />
          <div className="h-6 w-24 rounded animate-pulse bg-gray-200" />
          <div className="w-10 h-10 rounded-full animate-pulse bg-gray-200" />
        </div>
        <div className="flex-1 px-5 py-4 flex flex-col gap-3">
          <div className="h-32 rounded-2xl animate-pulse bg-gray-200" />
          <div className="h-20 rounded-2xl animate-pulse bg-gray-200" />
          <div className="h-20 rounded-2xl animate-pulse bg-gray-200" />
          <div className="h-20 rounded-2xl animate-pulse bg-gray-200" />
        </div>
        <div className="lg:hidden h-16 border-t border-gray-100 bg-white flex items-center justify-around px-5 pb-safe-bottom">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 rounded animate-pulse bg-gray-200" />
              <div className="w-10 h-2 rounded animate-pulse bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <UserContext.Provider value={{ user, loading }}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within UserProvider");
  return context;
}
