const selectors = [
  'textarea[name="search"]',
  'div.ProseMirror[data-placeholder="Ask anything"]',
  'input[placeholder="Ask Meta AI..."]',
  'textarea[name="prompt-textarea"]',
  'div[data-testid="chat-input"]',
  'rich-textarea div.ql-editor[contenteditable="true"]',
  'textarea[data-testid="composer-input"]',
  'textarea[placeholder="Ask Grok"]',
  "textarea#userInput",
];

document.addEventListener("keydown", (event) => {
  let inputElement = null;
  for (const selector of selectors) {
    inputElement = document.querySelector(selector);
    if (inputElement) break;
  }

  if (!inputElement) return;

  const activeElement = document.activeElement;
  const isEditing =
    ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName) ||
    activeElement.isContentEditable;
  const isCopyCommand = (event.ctrlKey || event.metaKey) && event.key === "c";

  if (
    !isEditing &&
    !isCopyCommand &&
    (event.key.length === 1 || event.key === "Enter")
  ) {
    inputElement.focus();

    if (inputElement.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(inputElement);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
});

function findMatchedProvider(providers) {
  const currentHostname = window.location.hostname;
  return providers.find((p) => {
    try {
      return new URL(p.url).hostname === currentHostname;
    } catch (e) {
      return false;
    }
  });
}

function applyAssets(providers, assets) {
  const matchedProvider = findMatchedProvider(providers);
  if (!matchedProvider) return;

  const providerAssets = assets[matchedProvider.id];
  if (!providerAssets) return;

  const existingStyle = document.getElementById("__luminahub_css__");
  if (existingStyle) existingStyle.remove();

  if (providerAssets.css) {
    const style = document.createElement("style");
    style.id = "__luminahub_css__";
    style.textContent = providerAssets.css;
    (document.head || document.documentElement).appendChild(style);
  }

  if (providerAssets.js) {
    try {
      const runFn = new Function(providerAssets.js);
      runFn();
    } catch (e) {
      console.error("LuminaHub: Custom JS execution error:", e);
    }
  }
}

chrome.storage.local.get(["providers", "custom_assets"], (res) => {
  const providers = res.providers || [];
  const assets = res.custom_assets || {};

  // Hide custom self-hosted cookie banners
  const style = document.createElement("style");
  style.textContent = `
    #modal-cookie-consent-banner-mobile,
    [data-testid="modal-cookie-consent-banner-mobile"],
    #cookie-banner,
    .max-w-cookie-banner {
      display: none !important;
      pointer-events: none !important;
    }
    body {
      pointer-events: auto !important;
      overflow: auto !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // Generic Cookie Consent Auto-Clicker
  const acceptButtonTexts = [
    "accept all",
    "accept all cookies",
    "accept cookies",
    "agree",
    "allow all",
    "allow cookies",
    "chấp nhận tất cả",
    "chấp nhận cookie",
    "đồng ý"
  ];

  const bannerSelectors = [
    '[id*="cookie" i]', '[class*="cookie" i]',
    '[id*="consent" i]', '[class*="consent" i]',
    '[id*="onetrust" i]', '[class*="onetrust" i]',
    '[data-testid*="cookie" i]', '[data-testid*="consent" i]'
  ];

  function autoAcceptCookies() {
    for (const selector of bannerSelectors) {
      try {
        const banners = document.querySelectorAll(selector);
        for (const banner of banners) {
          const buttons = banner.querySelectorAll("button, [role='button']");
          for (const btn of buttons) {
            const txt = btn.textContent.trim().toLowerCase();
            if (acceptButtonTexts.includes(txt) || acceptButtonTexts.some(pattern => txt.includes(pattern))) {
              btn.click();
              return;
            }
          }
        }
      } catch (e) {}
    }

    // Fallback: search all buttons on page
    try {
      const allButtons = document.querySelectorAll("button, [role='button']");
      for (const btn of allButtons) {
        const txt = btn.textContent.trim().toLowerCase();
        if (txt === "accept all" || txt === "accept all cookies") {
          btn.click();
          return;
        }
      }
    } catch (e) {}
  }

  autoAcceptCookies();
  const otInterval = setInterval(autoAcceptCookies, 1000);
  setTimeout(() => clearInterval(otInterval), 10000);

  applyAssets(providers, assets);
});

try {
  let lastUrl = window.location.href;
  chrome.runtime.sendMessage({ type: "LUMINA_URL_CHANGED", url: lastUrl });
  const intervalId = setInterval(() => {
    try {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        chrome.runtime.sendMessage({ type: "LUMINA_URL_CHANGED", url: lastUrl });
      }
    } catch (e) {
      clearInterval(intervalId);
    }
  }, 500);
} catch (e) {}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.custom_assets || changes.providers || changes.force_refresh) {
    chrome.storage.local.get(["providers", "custom_assets"], (res) => {
      applyAssets(res.providers || [], res.custom_assets || {});
    });
  }
});

try {
  if (window.self !== window.top) {
    const port = chrome.runtime.connect({ name: "lumina-frame" });
    port.onMessage.addListener((msg) => {
      if (msg.action === "back") {
        window.history.back();
      } else if (msg.action === "forward") {
        window.history.forward();
      }
    });
  }
} catch (e) {}

window.addEventListener("beforeunload", () => {
  try {
    chrome.runtime.sendMessage({ type: "LUMINA_PAGE_LOADING" });
  } catch (e) {}
});
