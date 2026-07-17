"use client";

import { useState, useEffect, useRef } from "react";

/**
 * First-visit splash showing the Guidr logo.
 *
 * SSR/hydration strategy: both server and client first render ALWAYS produce
 * the splash markup — that's what keeps hydration trees identical. The inline
 * script in app/layout.tsx adds `.guidr-skip-splash` to <html> before hydrate
 * if sessionStorage says we've already seen the splash, and CSS uses that
 * class to hide the overlay immediately — no visible flash.
 *
 * After hydration, a useEffect checks sessionStorage and either dismisses
 * the splash instantly (returning visitor) or runs the timed fade-out
 * sequence (first visitor). Reading sessionStorage during render would
 * desync server and client and cause a hydration mismatch.
 */
export default function LoadingScreen() {
  const [show, setShow] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Returning visitor: dismiss instantly. CSS already hid the overlay via
    // the .guidr-skip-splash class on <html>, so React unmounting it now
    // doesn't produce a visible flash.
    if (sessionStorage.getItem("guidr_loaded")) {
      setShow(false);
      return;
    }

    // First-visit splash budget ~2.8s: 1.8s solid display, then an 800ms
    // fade (matches the CSS transition), plus 200ms buffer before unmount
    // so the fade visibly completes instead of getting cut off.
    setTimeout(() => setFadeOut(true), 1800);
    setTimeout(() => {
      setShow(false);
      sessionStorage.setItem("guidr_loaded", "true");
    }, 2800);
  }, []);

  if (!show) return null;

  return (
    <div className={`loading-overlay ${fadeOut ? "fade-out" : ""}`}>
      <img
        src="/loading-splash.jpg"
        alt="Guidr — Security Made Simple"
        fetchPriority="high"
      />
    </div>
  );
}
