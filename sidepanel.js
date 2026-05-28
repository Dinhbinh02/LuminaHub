const DEFAULT_PROVIDERS = [
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com" },
  { id: "mistral", name: "Mistral", url: "https://chat.mistral.ai" },
  { id: "meta", name: "Meta AI", url: "https://www.meta.ai" },
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com" },
  { id: "claude", name: "Claude", url: "https://claude.ai" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com" },
  { id: "copilot", name: "Copilot", url: "https://copilot.microsoft.com" },
  { id: "grok", name: "Grok", url: "https://grok.com" },
];

let providers = [];
try {
  const localProviders = localStorage.getItem("providers");
  if (localProviders) {
    providers = JSON.parse(localProviders);
  } else {
    providers = [...DEFAULT_PROVIDERS];
  }
} catch (e) {
  providers = [...DEFAULT_PROVIDERS];
}
let activeWebId = null;

const dropdown = document.getElementById("web-dropdown");
const trigger = document.getElementById("dropdown-trigger");
const selectedText = document.getElementById("selected-web-name");
const menu = document.getElementById("dropdown-menu");
const overlay = document.getElementById("dropdown-overlay");

const frame = document.getElementById("web-frame");
const loader = document.getElementById("loader");
const backBtn = document.getElementById("back-btn");
const forwardBtn = document.getElementById("forward-btn");
const refreshBtn = document.getElementById("refresh-btn");
const optionsBtn = document.getElementById("options-btn");
const progressFill = document.getElementById("progress-fill");

let loaderTimeout = null;
function showLoader() {
  loader.classList.remove("hidden");
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";

  // Reset progress bar width
  progressFill.style.transition = "none";
  progressFill.style.width = "0%";
  progressFill.offsetHeight; // Force reflow

  // Load to 90% slowly using ease-out cubic-bezier
  progressFill.style.transition = "width 3.5s cubic-bezier(0.08, 0.82, 0.17, 1)";
  progressFill.style.width = "90%";

  if (loaderTimeout) clearTimeout(loaderTimeout);
  loaderTimeout = setTimeout(() => {
    hideLoader();
  }, 8000); // 8s backup safety timeout
}

function hideLoader() {
  if (loaderTimeout) {
    clearTimeout(loaderTimeout);
    loaderTimeout = null;
  }

  // Quickly complete progress to 100%
  progressFill.style.transition = "width 0.2s ease-out";
  progressFill.style.width = "100%";

  // Hide loader and show frame after completion transition
  setTimeout(() => {
    loader.classList.add("hidden");
    frame.style.opacity = "1";
    frame.style.pointerEvents = "auto";
  }, 200);
}

function preRender() {
  const activeProviders = providers.filter(p => !p.deleted);
  let activeId = null;
  try {
    activeId = localStorage.getItem("selectedProvider");
  } catch (e) {}
  if (!activeId || !activeProviders.some(p => p.id === activeId)) {
    activeId = activeProviders[0] ? activeProviders[0].id : null;
  }
  buildDropdown();
  if (activeId) {
    selectWebSync(activeId);
  }
}

function selectWebSync(id) {
  const provider = providers.find((p) => p.id === id);
  if (!provider) return;

  activeWebId = id;
  selectedText.textContent = provider.name;
  frame.style.zoom = (provider.zoom || 100) / 100;

  let cachedUrl = null;
  try {
    cachedUrl = localStorage.getItem(`last_url_${id}`);
  } catch (e) {}
  const urlToLoad = cachedUrl || provider.url;
  frame.src = urlToLoad;
}

function init() {
  chrome.storage.local.get(["providers", "selectedProvider"], (result) => {
    providers = result.providers || DEFAULT_PROVIDERS;
    if (!result.providers) {
      chrome.storage.local.set({ providers: DEFAULT_PROVIDERS });
      try {
        localStorage.setItem("providers", JSON.stringify(DEFAULT_PROVIDERS));
      } catch (e) {}
    } else {
      try {
        localStorage.setItem("providers", JSON.stringify(providers));
      } catch (e) {}
    }

    const activeProviders = providers.filter(p => !p.deleted);
    const activeId = result.selectedProvider || (activeProviders[0] ? activeProviders[0].id : null);
    buildDropdown();

    if (activeId && activeProviders.some(p => p.id === activeId)) {
      selectWeb(activeId);
    } else if (activeProviders.length > 0) {
      selectWeb(activeProviders[0].id);
    }
  });
}

function buildDropdown() {
  menu.innerHTML = "";
  providers.forEach((p) => {
    if (p.deleted) return;
    const li = document.createElement("li");
    li.className = `dropdown-item ${p.id === activeWebId ? "active" : ""}`;

    const icon = document.createElement("img");
    if (["deepseek", "mistral", "meta", "chatgpt", "claude", "gemini", "copilot", "grok"].includes(p.id)) {
      icon.src = `provider-icons/${p.id}.svg`;
    } else {
      try {
        icon.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(p.url)}&size=32`;
      } catch (e) {
        icon.src = "";
      }
    }

    const span = document.createElement("span");
    span.textContent = p.name;

    li.appendChild(icon);
    li.appendChild(span);

    li.addEventListener("click", (e) => {
      e.stopPropagation();
      selectWeb(p.id, true);
      dropdown.classList.remove("open");
      overlay.classList.add("hidden");
    });

    menu.appendChild(li);
  });
}

function selectWeb(id, forceBaseUrl = false) {
  const provider = providers.find((p) => p.id === id);
  if (!provider) return;

  activeWebId = id;
  selectedText.textContent = provider.name;
  
  // Set zoom level
  frame.style.zoom = (provider.zoom || 100) / 100;

  if (forceBaseUrl) {
    showLoader();
    frame.src = provider.url;
    chrome.storage.local.set({ [`last_url_${id}`]: provider.url });
    try {
      localStorage.setItem(`last_url_${id}`, provider.url);
    } catch (e) {}
  } else {
    const cachedUrl = localStorage.getItem(`last_url_${id}`) || provider.url;
    if (frame.src !== cachedUrl) {
      showLoader();
      frame.src = cachedUrl;
    }
    chrome.storage.local.get([`last_url_${id}`], (result) => {
      const urlToLoad = result[`last_url_${id}`] || provider.url;
      if (frame.src !== urlToLoad) {
        frame.src = urlToLoad;
      }
      try {
        localStorage.setItem(`last_url_${id}`, urlToLoad);
      } catch (e) {}
    });
  }

  Array.from(menu.children).forEach((child, index) => {
    const p = providers[index];
    if (p && p.id === id) {
      child.classList.add("active");
    } else {
      child.classList.remove("active");
    }
  });

  chrome.storage.local.set({ selectedProvider: id });
  try {
    localStorage.setItem("selectedProvider", id);
  } catch (e) {}
}

trigger.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = dropdown.classList.toggle("open");
  if (isOpen) {
    overlay.classList.remove("hidden");
  } else {
    overlay.classList.add("hidden");
  }
});

overlay.addEventListener("click", () => {
  dropdown.classList.remove("open");
  overlay.classList.add("hidden");
});

document.addEventListener("click", () => {
  dropdown.classList.remove("open");
  overlay.classList.add("hidden");
});

function saveLastUrl(url) {
  if (!activeWebId || !url || url === "about:blank") return;
  const provider = providers.find(p => p.id === activeWebId);
  if (!provider) return;
  try {
    const providerHost = new URL(provider.url).hostname;
    const newUrlHost = new URL(url).hostname;
    if (newUrlHost.includes(providerHost) || providerHost.includes(newUrlHost)) {
      chrome.storage.local.set({ [`last_url_${activeWebId}`]: url });
      try {
        localStorage.setItem(`last_url_${activeWebId}`, url);
      } catch (e) {}
    }
  } catch (e) {
    chrome.storage.local.set({ [`last_url_${activeWebId}`]: url });
    try {
      localStorage.setItem(`last_url_${activeWebId}`, url);
    } catch (err) {}
  }
}

frame.addEventListener("load", () => {
  hideLoader();
  if (activeWebId) {
    try {
      const currentUrl = frame.contentWindow.location.href;
      saveLastUrl(currentUrl);
    } catch (e) {
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message) {
    if (message.type === "LUMINA_URL_CHANGED" && !sender.tab) {
      saveLastUrl(message.url);
    } else if (message.type === "LUMINA_PAGE_LOADING") {
      showLoader();
    }
  }
});

refreshBtn.addEventListener("click", () => {
  showLoader();
  chrome.storage.local.get([`last_url_${activeWebId}`], (result) => {
    const currentUrl = result[`last_url_${activeWebId}`];
    if (currentUrl) {
      frame.src = currentUrl;
    } else {
      frame.src = frame.src;
    }
  });
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.providers) {
    providers = changes.providers.newValue || DEFAULT_PROVIDERS;
    try {
      localStorage.setItem("providers", JSON.stringify(providers));
    } catch (e) {}
    buildDropdown();
    
    // Apply new zoom in real-time
    if (activeWebId) {
      const activeProvider = providers.find(p => p.id === activeWebId);
      if (activeProvider) {
        frame.style.zoom = (activeProvider.zoom || 100) / 100;
      }
    }
  }

  if (changes.force_refresh) {
    showLoader();
    chrome.storage.local.get([`last_url_${activeWebId}`], (result) => {
      const currentUrl = result[`last_url_${activeWebId}`];
      if (currentUrl) {
        frame.src = currentUrl;
      } else {
        frame.src = frame.src;
      }
    });
  }
});

let framePort = null;
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "lumina-frame" && !port.sender.tab) {
    framePort = port;
    port.onDisconnect.addListener(() => {
      if (framePort === port) {
        framePort = null;
      }
    });
  }
});

backBtn.addEventListener("click", () => {
  if (framePort) {
    framePort.postMessage({ action: "back" });
  }
});

forwardBtn.addEventListener("click", () => {
  if (framePort) {
    framePort.postMessage({ action: "forward" });
  }
});

// Run synchronous pre-render for immediate visual availability
preRender();

init();
