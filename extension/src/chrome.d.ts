/**
 * The slice of the extension API we actually use.
 *
 * Hand-declared instead of pulling in @types/chrome so that this list stays
 * short and auditable. If you need to add something here, that is a signal to
 * stop and ask whether it widens what Guidr can see. Adding `chrome.tabs`,
 * `chrome.history`, `chrome.cookies`, or `chrome.webRequest` to this file
 * should require the same scrutiny as adding the permission to the manifest.
 */
declare namespace chrome {
  namespace storage {
    interface StorageArea {
      get(keys: string[], cb: (items: Record<string, any>) => void): void;
      set(items: Record<string, any>, cb?: () => void): void;
    }
    const local: StorageArea;
  }

  namespace runtime {
    function sendMessage(message: any): Promise<any>;
    const onMessage: {
      addListener(
        cb: (message: any, sender: { tab?: { id?: number } }, sendResponse: (r?: any) => void) => void
      ): void;
    };
    const lastError: { message?: string } | undefined;
  }

  namespace action {
    function setBadgeText(details: { text: string; tabId?: number }): void;
    function setBadgeBackgroundColor(details: { color: string; tabId?: number }): void;
    function setTitle(details: { title: string; tabId?: number }): void;
  }

  namespace tabs {
    /**
     * Only ever called from the popup, where the "activeTab" permission gives us
     * the active tab's url for the duration of the user's click. Do NOT call
     * this from the background worker or a content script: without a user
     * gesture it would require the far broader "tabs" permission.
     */
    function query(
      queryInfo: { active: boolean; currentWindow: boolean },
      cb: (tabs: Array<{ id?: number; url?: string }>) => void
    ): void;
  }
}
