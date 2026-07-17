/**
 * Background service worker.
 *
 * Its entire job is to colour the toolbar icon. That is the passive trust
 * badge: always present, never nagging.
 *
 * Note what it does NOT do, and what it must never start doing:
 *   - It does not know what page you are on. The content script sends a trust
 *     LEVEL ("unknown" | "trusted-bank" | "impersonation"), never a URL.
 *   - It does not have the "tabs" permission. The tab id comes from
 *     sender.tab.id, which Chrome supplies for free on a message from a content
 *     script, so we can badge the right tab without the right to enumerate tabs.
 *   - It does not make network requests. There is no fetch in this file and
 *     there must not be one.
 */

type TrustLevel = "unknown" | "trusted-bank" | "impersonation";

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "trust") return;

  const tabId = sender.tab?.id;
  if (tabId === undefined) return;

  const level = message.level as TrustLevel;

  if (level === "impersonation") {
    chrome.action.setBadgeText({ tabId, text: "!" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#e5322d" });
    chrome.action.setTitle({ tabId, title: "Guidr: this site is imitating a bank" });
    return;
  }

  // Ordinary site. Guidr is watching but has nothing to report, and says so
  // quietly. An indicator that shouts on every page is an indicator nobody reads.
  chrome.action.setBadgeText({ tabId, text: "" });
  chrome.action.setTitle({ tabId, title: "Guidr: watching for scams. Nothing to report." });
});
