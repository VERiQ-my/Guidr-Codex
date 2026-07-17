"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setErr("");
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const withEmail = async (create: boolean) => {
    setErr("");
    setBusy(true);
    try {
      if (create) await createUserWithEmailAndPassword(auth, email, pw);
      else await signInWithEmailAndPassword(auth, email, pw);
      router.push("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-guidr-bg flex items-center justify-center px-5">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-guidr-text text-center">Sign in to Guidr</h1>

        <button
          type="button"
          onClick={google}
          disabled={busy}
          className="w-full py-3 rounded-xl bg-guidr-primary-dark text-white font-semibold hover:bg-guidr-primary transition-colors disabled:opacity-60"
        >
          Continue with Google
        </button>

        <div className="flex items-center gap-3 text-xs text-guidr-muted">
          <span className="flex-1 h-px bg-gray-200" /> or <span className="flex-1 h-px bg-gray-200" />
        </div>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-guidr-text focus:border-guidr-primary outline-none"
        />
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Password"
          className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-guidr-text focus:border-guidr-primary outline-none"
        />

        {err && <p className="text-xs text-guidr-red">{err}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => withEmail(false)}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-guidr-primary text-white text-sm font-semibold disabled:opacity-60"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => withEmail(true)}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-white border border-gray-200 text-guidr-text text-sm font-semibold disabled:opacity-60"
          >
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
}
