/**
 * Dev-only client logger. Anything sent to console.* is readable by anyone
 * who opens the browser DevTools, and raw errors (Firebase codes, project
 * ids, security-rule paths) hand attackers a map of the backend — an OWASP
 * information-disclosure risk (A09: logging failures / A05: misconfiguration).
 *
 * In development these behave exactly like console.*; in production builds
 * they are no-ops. NODE_ENV is inlined at build time, so the dead branches
 * are stripped from the client bundle.
 *
 * Server-side code (API routes, workers) should keep using console.* — those
 * logs go to server/Workers logs, never to the user's browser.
 */
const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  log: (...args: unknown[]): void => {
    if (isDev) console.log(...args);
  },
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (isDev) console.error(...args);
  },
};
