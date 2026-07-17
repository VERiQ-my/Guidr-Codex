/**
 * Popup.
 *
 * The "0 requests sent" line in popup.html is a promise this codebase has to
 * keep. If you ever add a network call anywhere in this extension, that line
 * becomes a lie and it must come out on the same commit.
 *
 * We use the "activeTab" permission to learn the hostname of the tab the user
 * is looking at, so that "turn off on this site" can work. activeTab is granted
 * only at the moment the user clicks the Guidr icon and it lapses afterwards.
 * The alternative, "tabs", would give Guidr standing access to the URL of every
 * open tab, forever, which is not a trade worth one convenience toggle.
 */

const $ = (id: string) => document.getElementById(id)!;

function currentHostname(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      if (!url) return resolve(null);
      try {
        resolve(new URL(url).hostname);
      } catch {
        resolve(null);
      }
    });
  });
}

async function render() {
  const host = await currentHostname();

  chrome.storage.local.get(["stats", "enabled", "disabledHosts"], (res) => {
    const stats = res.stats ?? { blocks: 0, warnings: 0 };
    $("blocks").textContent = String(stats.blocks ?? 0);
    $("warnings").textContent = String(stats.warnings ?? 0);

    const globallyEnabled = res.enabled !== false;
    const disabledHosts: string[] = res.disabledHosts ?? [];
    const siteOff = host ? disabledHosts.includes(host) : false;

    const toggleAll = $("toggle-all") as HTMLButtonElement;
    toggleAll.textContent = globallyEnabled ? "Pause" : "Resume";
    toggleAll.onclick = () => {
      chrome.storage.local.set({ enabled: !globallyEnabled }, render);
    };

    const toggleSite = $("toggle-site") as HTMLButtonElement;
    const label = $("site-label");

    if (!host) {
      label.textContent = "No site to turn off here";
      toggleSite.disabled = true;
      return;
    }

    label.textContent = siteOff ? `Guidr is off on ${host}` : `Turn off on ${host}`;
    toggleSite.textContent = siteOff ? "Turn on" : "Turn off";
    toggleSite.onclick = () => {
      const next = siteOff
        ? disabledHosts.filter((h) => h !== host)
        : [...disabledHosts, host];
      chrome.storage.local.set({ disabledHosts: next }, render);
    };
  });
}

void render();
