const DEFAULT_PROVIDERS = [];

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
let currentFullUrl = "";

function formatDisplayUrl(url) {
  if (!url) return "";
  if (url.startsWith("https://www.google.com/search?q=")) {
    try {
      const urlObj = new URL(url);
      const query = urlObj.searchParams.get("q");
      if (query) return query;
    } catch (e) {}
  }
  return url.replace(/^https?:\/\/(www\.)?/i, "");
}

function setAddressBarValue(url) {
  currentFullUrl = url;
  if (document.activeElement !== addressInput) {
    addressInput.value = formatDisplayUrl(url);
  } else {
    addressInput.value = url;
  }
}

const addressInput = document.getElementById("address-input");
const suggestionsDropdown = document.getElementById("suggestions-dropdown");

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

  progressFill.style.transition = "none";
  progressFill.style.width = "0%";
  progressFill.offsetHeight; // Force reflow

  progressFill.style.transition = "width 3.5s cubic-bezier(0.08, 0.82, 0.17, 1)";
  progressFill.style.width = "90%";

  if (loaderTimeout) clearTimeout(loaderTimeout);
  loaderTimeout = setTimeout(() => {
    hideLoader();
  }, 8000);
}

function hideLoader() {
  if (loaderTimeout) {
    clearTimeout(loaderTimeout);
    loaderTimeout = null;
  }

  progressFill.style.transition = "width 0.2s ease-out";
  progressFill.style.width = "100%";

  setTimeout(() => {
    loader.classList.add("hidden");
    frame.style.opacity = "1";
    frame.style.pointerEvents = "auto";
  }, 200);
}

function selectWeb(id, forceBaseUrl = false) {
  const provider = providers.find((p) => p.id === id);
  if (!provider) return;

  activeWebId = id;
  frame.style.zoom = (provider.zoom || 100) / 100;

  if (forceBaseUrl) {
    showLoader();
    frame.src = provider.url;
    setAddressBarValue(provider.url);
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
    setAddressBarValue(cachedUrl);
    chrome.storage.local.get([`last_url_${id}`], (result) => {
      const urlToLoad = result[`last_url_${id}`] || provider.url;
      if (frame.src !== urlToLoad) {
        frame.src = urlToLoad;
      }
      setAddressBarValue(urlToLoad);
      try {
        localStorage.setItem(`last_url_${id}`, urlToLoad);
      } catch (e) {}
    });
  }

  chrome.storage.local.set({ selectedProvider: id });
  try {
    localStorage.setItem("selectedProvider", id);
  } catch (e) {}
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

    const activeProviders = providers.filter(p => !p.deleted && p.inSidePanel !== false);
    const activeId = result.selectedProvider || (activeProviders[0] ? activeProviders[0].id : null);

    if (activeId && activeProviders.some(p => p.id === activeId)) {
      selectWeb(activeId);
    } else if (activeProviders.length > 0) {
      selectWeb(activeProviders[0].id);
    } else {
      navigate("https://www.google.com");
    }
  });
}

function matchUrl(pattern, urlStr) {
  try {
    if (!pattern.includes("*") && !pattern.includes("/")) {
      const hostname = new URL("https://" + pattern).hostname;
      return new URL(urlStr).hostname === hostname;
    }
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexStr = "^" + escaped.replace(/\*/g, '.*') + "$";
    const regex = new RegExp(regexStr, 'i');
    return regex.test(urlStr);
  } catch (e) {
    return false;
  }
}

function matchAndActivateProvider(url) {
  const matched = providers.find(p => !p.deleted && p.enabled !== false && matchUrl(p.url, url));
  if (matched) {
    activeWebId = matched.id;
    frame.style.zoom = (matched.zoom || 100) / 100;
    chrome.storage.local.set({ selectedProvider: matched.id });
    try {
      localStorage.setItem("selectedProvider", matched.id);
    } catch (e) {}
  } else {
    activeWebId = null;
    frame.style.zoom = 1.0;
  }
}

function navigate(input) {
  input = input.trim();
  if (!input) return;

  let targetUrl = "";
  // Check if query is a URL or domain pattern
  const isUrlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i.test(input);
  if (isUrlPattern || input.startsWith("localhost") || input.startsWith("http://") || input.startsWith("https://")) {
    if (!/^https?:\/\//i.test(input)) {
      targetUrl = "https://" + input;
    } else {
      targetUrl = input;
    }
  } else {
    targetUrl = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
  }

  showLoader();
  frame.src = targetUrl;
  setAddressBarValue(targetUrl);

  matchAndActivateProvider(targetUrl);
}

function updateHistory(url) {
  if (!url || url === "about:blank" || url.startsWith("chrome-extension://") || url.includes("google.com/search")) return;
  chrome.storage.local.get(["history"], (result) => {
    let history = result.history || {};
    if (!history[url]) {
      let displayName = url;
      try {
        const urlObj = new URL(url);
        displayName = urlObj.hostname + (urlObj.pathname !== "/" ? urlObj.pathname : "");
      } catch (e) {}
      history[url] = { url: url, count: 0, lastVisited: Date.now(), name: displayName };
    }
    history[url].count += 1;
    history[url].lastVisited = Date.now();

    // Limit history size to 500 entries
    const entries = Object.entries(history);
    if (entries.length > 500) {
      entries.sort((a, b) => a[1].lastVisited - b[1].lastVisited);
      const toDelete = entries.slice(0, entries.length - 500);
      toDelete.forEach(([k]) => delete history[k]);
    }

    chrome.storage.local.set({ history: history });
  });
}

let autocompleteTimeout = null;
function handleAutocomplete(query) {
  if (autocompleteTimeout) clearTimeout(autocompleteTimeout);

  if (!query.trim()) {
    suggestionsDropdown.classList.add("hidden");
    return;
  }

  autocompleteTimeout = setTimeout(() => {
    // 1. Search locally matched rules
    const localMatches = providers.filter(p => !p.deleted && (p.name.toLowerCase().includes(query.toLowerCase()) || p.url.toLowerCase().includes(query.toLowerCase())));
    
    // 2. Search history/frequently visited
    chrome.storage.local.get(["history"], (result) => {
      const history = result.history || {};
      const historyMatches = Object.values(history)
        .filter(h => h.url.toLowerCase().includes(query.toLowerCase()) || (h.name && h.name.toLowerCase().includes(query.toLowerCase())))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // 3. Fetch predictions from Google Autocomplete service
      const googleSuggestUrl = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
      
      fetch(googleSuggestUrl)
        .then(res => res.json())
        .then(data => {
          const rawSuggestions = data[1] || [];
          const googleSuggestions = rawSuggestions.filter(item => {
            const trimmed = item.trim();
            return !/^https?:\/\//i.test(trimmed) && !/^www\./i.test(trimmed) && !/\.[a-z]{2,6}(\/|$)/i.test(trimmed);
          });
          renderSuggestions(localMatches, historyMatches, googleSuggestions);
        })
        .catch(err => {
          console.error("LuminaHub: Suggestions fetch error", err);
          renderSuggestions(localMatches, historyMatches, []);
        });
    });
  }, 150);
}

function renderSuggestions(localMatches, historyMatches, googleSuggestions) {
  suggestionsDropdown.innerHTML = "";

  if (historyMatches.length === 0 && googleSuggestions.length === 0) {
    suggestionsDropdown.classList.add("hidden");
    return;
  }

  suggestionsDropdown.classList.remove("hidden");

  // Frequently Visited Section
  if (historyMatches.length > 0) {
    const title = document.createElement("div");
    title.className = "suggestion-section-title";
    title.textContent = "Frequently Visited";
    suggestionsDropdown.appendChild(title);

    historyMatches.forEach(h => {
      const item = document.createElement("div");
      item.className = "suggestion-item";

      const icon = document.createElement("img");
      try {
        icon.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(h.url)}&size=32`;
      } catch (e) {
        icon.src = "";
      }

      const text = document.createElement("span");
      // Clean display name of history item
      text.textContent = formatDisplayUrl(h.name || h.url);
      text.title = h.url; // Show full URL on hover

      item.appendChild(icon);
      item.appendChild(text);

      item.addEventListener("click", () => {
        navigate(h.url);
        suggestionsDropdown.classList.add("hidden");
      });

      suggestionsDropdown.appendChild(item);
    });
  }

  // Google Autocomplete Predictions Section
  if (googleSuggestions.length > 0) {
    const title = document.createElement("div");
    title.className = "suggestion-section-title";
    title.textContent = "Google suggestions";
    suggestionsDropdown.appendChild(title);

    googleSuggestions.forEach(queryStr => {
      const item = document.createElement("div");
      item.className = "suggestion-item";

      const icon = document.createElement("span");
      icon.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
      icon.style.display = "inline-flex";
      icon.style.color = "var(--text-muted)";

      const text = document.createElement("span");
      text.textContent = queryStr;

      item.appendChild(icon);
      item.appendChild(text);

      item.addEventListener("click", () => {
        navigate(queryStr);
        suggestionsDropdown.classList.add("hidden");
      });

      suggestionsDropdown.appendChild(item);
    });
  }
}

function saveLastUrl(url) {
  if (!url || url === "about:blank") return;

  setAddressBarValue(url);
  updateHistory(url);

  if (!activeWebId) {
    matchAndActivateProvider(url);
  }

  if (!activeWebId) return;

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
    } catch (e) {}
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message) {
    if (message.type === "LUMINA_URL_CHANGED" && message.isSidePanel) {
      saveLastUrl(message.url);
    } else if (message.type === "LUMINA_PAGE_LOADING" && message.isSidePanel) {
      showLoader();
    }
  }
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

// Bind address bar events
addressInput.addEventListener("input", (e) => {
  handleAutocomplete(e.target.value);
});

addressInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    navigate(addressInput.value);
    suggestionsDropdown.classList.add("hidden");
    addressInput.blur();
  }
});

addressInput.addEventListener("focus", () => {
  if (currentFullUrl) {
    addressInput.value = currentFullUrl;
  }
  addressInput.select();
});

addressInput.addEventListener("blur", () => {
  setTimeout(() => {
    if (document.activeElement !== addressInput) {
      addressInput.value = formatDisplayUrl(currentFullUrl);
    }
  }, 150);
});

document.addEventListener("click", (e) => {
  if (!addressInput.contains(e.target) && !suggestionsDropdown.contains(e.target)) {
    suggestionsDropdown.classList.add("hidden");
  }
});

init();
