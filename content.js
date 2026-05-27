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
      const script = document.createElement("script");
      script.textContent = providerAssets.js;
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.error(e);
    }
  }
}

const isFrame = window.self !== window.top;
let fallbackTimeout;

if (isFrame) {
  const hideStyle = document.createElement("style");
  hideStyle.id = "__luminahub_temp_hide__";
  hideStyle.textContent = "html { display: none !important; }";
  (document.head || document.documentElement).appendChild(hideStyle);

  fallbackTimeout = setTimeout(() => {
    const styleEl = document.getElementById("__luminahub_temp_hide__");
    if (styleEl) styleEl.remove();
  }, 200);
}

chrome.storage.local.get(["providers", "custom_assets"], (res) => {
  if (fallbackTimeout) clearTimeout(fallbackTimeout);
  const providers = res.providers || [];
  const assets = res.custom_assets || {};
  const currentUrl = window.location.href;

  if (currentUrl.includes("copilot.microsoft.com")) {
    const defaultCopilotStyle = document.createElement("style");
    defaultCopilotStyle.textContent = `
      #cookie-banner,
      .max-w-cookie-banner,
      [data-testid="cookie-banner-accept-button"],
      [data-testid="cookie-banner-reject-button"] {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(defaultCopilotStyle);
  }

  if (currentUrl.includes("chatgpt.com")) {
    const defaultChatGptStyle = document.createElement("style");
    defaultChatGptStyle.textContent = `
      #modal-cookie-consent-banner-mobile,
      [data-testid="modal-cookie-consent-banner-mobile"] {
        display: none !important;
        pointer-events: none !important;
      }
      body {
        pointer-events: auto !important;
        overflow: auto !important;
      }
    `;
    (document.head || document.documentElement).appendChild(defaultChatGptStyle);
  }

  applyAssets(providers, assets);

  if (isFrame) {
    const tempStyle = document.getElementById("__luminahub_temp_hide__");
    if (tempStyle) tempStyle.remove();
  }
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
