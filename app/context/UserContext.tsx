"use client";

import { logger } from "@/lib/logger";
import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter, usePathname } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { updatePresence, upsertSession, touchSession } from "@/lib/firestore";
import { getSessionId, parseDevice } from "@/lib/account-security";

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

/**
 * Routes viewable without an account. "/" and "/ms" are the public marketing
 * landings — signed-out visitors (and search-engine crawlers) must be able to
 * see them, never a redirect or a loading skeleton.
 *
 * "/guardian/invite" is public for a different reason: it arrives as a WhatsApp
 * link from someone's family, and bouncing that visitor to a sign-up wall
 * before they've been told who is asking (or what a Guardian even is) is how
 * you lose them. The page asks for the account itself, once it has earned it.
 */
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
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Sign-in is already confirmed by auth — render the app immediately
        // from what auth knows, then enrich from Firestore. Blocking on the
        // profile read here was the cause of sign-in "loading with no end":
        // a slow/blocked Firestore transport left `loading` true forever, and
        // a failed read used to setUser(null) and bounce the user back to
        // /login. Neither can happen now — the user is shown as signed in the
        // instant auth resolves, and the profile read only adds detail.
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
          // No doc yet (e.g. just signed up with Google) — the signup flow
          // creates it; the auth-derived profile above is a fine placeholder.
        } catch (error) {
          // Keep the signed-in user; a profile read hiccup must never sign
          // them out or wedge the UI.
          logger.error("Error fetching user profile:", error);
        }
      } else {
        // User is logged out
        setUser(null);
        if (!isPublicPath(pathname)) {
          // First-time visitors see the onboarding flow; once they've been
          // through it (or skipped to sign-in) we send them straight to login.
          let onboarded = false;
          try {
            onboarded = localStorage.getItem("guidr_onboarded") === "1";
          } catch {
            /* storage disabled — treat as not yet onboarded */
          }
          router.push(onboarded ? "/login" : "/onboarding");
        }
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [pathname, router]);

  // Presence heartbeat: keep the logged-in user's lastSeen fresh so the
  // home page can count who is active right now.
  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;

    const beat = () => {
      updatePresence(uid).catch((err) =>
        logger.error("Error updating presence:", err)
      );
    };

    beat(); // stamp immediately on login / load
    const interval = setInterval(beat, 30_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.uid]);

  // Record this device as a sign-in session so the Privacy & Security page can
  // list active devices. Upsert the full label once on login, then refresh its
  // lastSeenAt when the app comes back to the foreground. Best-effort — a
  // failure here must never block the app.
  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    const sessionId = getSessionId();

    (async () => {
      let location = "";
      try {
        const res = await fetch("/api/account/whereami");
        location = (await res.json())?.location || "";
      } catch {
        /* geo optional */
      }
      const { device, os, browser } = parseDevice(navigator.userAgent || "");
      upsertSession(uid, sessionId, {
        device,
        os,
        browser,
        location,
        userAgent: navigator.userAgent || "",
      }).catch((err) => logger.error("Error recording session:", err));
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        touchSession(uid, sessionId).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user?.uid]);

  // While auth resolves on a protected route, show a skeleton that mimics
  // the app's chrome (header bar + content cards + bottom nav) instead of
  // a centered spinner. Same wait, but reads as "the page is loading"
  // rather than "is this broken?" — feels noticeably faster on slow links.
  if (loading && !isPublicPath(pathname)) {
    return (
      <div className="min-h-dvh bg-guidr-bg flex flex-col">
        {/* Header strip */}
        <div className="sticky top-0 flex items-center justify-between px-5 pt-safe-top pb-3 bg-white/90 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl animate-pulse bg-gray-200" />
          <div className="h-6 w-24 rounded animate-pulse bg-gray-200" />
          <div className="w-10 h-10 rounded-full animate-pulse bg-gray-200" />
        </div>
        {/* Content area */}
        <div className="flex-1 px-5 py-4 flex flex-col gap-3">
          <div className="h-32 rounded-2xl animate-pulse bg-gray-200" />
          <div className="h-20 rounded-2xl animate-pulse bg-gray-200" />
          <div className="h-20 rounded-2xl animate-pulse bg-gray-200" />
          <div className="h-20 rounded-2xl animate-pulse bg-gray-200" />
        </div>
        {/* Bottom nav strip */}
        <div className="lg:hidden h-16 border-t border-gray-100 bg-white flex items-center justify-around px-5 pb-safe-bottom">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-6 h-6 rounded animate-pulse bg-gray-200" />
              <div className="w-10 h-2 rounded animate-pulse bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <UserContext.Provider value={{ user, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
