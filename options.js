import { getAuthToken, removeCachedAuthToken, getUserProfile, syncData } from "./options_oauth.js";

const DEFAULT_PROVIDERS = [];

let jsEditor = null;
let cssEditor = null;
let providers = [];
let customAssets = {};
let selectedId = null;
let selectedZoom = 100;
let activeCodeTab = "regular"; // "regular" or "sidepanel"

const zoomVal = document.getElementById("zoom-val");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");

const webList = document.getElementById("web-list");
const addBtn = document.getElementById("add-btn");
const saveBtn = document.getElementById("save-btn");
const deleteBtn = document.getElementById("delete-btn");

const editorView = document.getElementById("editor-view");
const emptyView = document.getElementById("empty-view");

const webName = document.getElementById("web-name");
const webUrl = document.getElementById("web-url");

const formatJsBtn = document.getElementById("format-js-btn");
const formatCssBtn = document.getElementById("format-css-btn");

const syncProfile = document.getElementById("sync-profile");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");
const syncStatus = document.getElementById("sync-status");
const logoutBtn = document.getElementById("logout-btn");
const manualSyncBtn = document.getElementById("manual-sync-btn");
const loginBtn = document.getElementById("login-btn");

const syncSetupOverlay = document.getElementById("sync-setup-overlay");
const inputSyncCredentials = document.getElementById("input-sync-credentials");
const btnUploadSyncJson = document.getElementById("btn-upload-sync-json");
const btnCancelSyncSetup = document.getElementById("btn-cancel-sync-setup");

const searchInput = document.getElementById("search-input");
const rulesCount = document.getElementById("rules-count");

const ruleEnabled = document.getElementById("rule-enabled");
const ruleSidepanel = document.getElementById("rule-sidepanel");
const zoomGroupContainer = document.getElementById("zoom-group-container");

const tabRegular = document.getElementById("tab-regular");
const tabSidepanel = document.getElementById("tab-sidepanel");

function init() {
  chrome.storage.local.get(["providers", "custom_assets"], (result) => {
    providers = result.providers || DEFAULT_PROVIDERS;
    customAssets = result.custom_assets || {};
    
    // Compatibility: Make sure existing providers have enabled/inSidePanel set
    providers.forEach(p => {
      if (p.enabled === undefined) p.enabled = true;
      if (p.inSidePanel === undefined) p.inSidePanel = true;
    });

    initEditors();
    renderSidebar();
    
    if (providers.length > 0) {
      const activeProviders = providers.filter(p => !p.deleted);
      if (activeProviders.length > 0) {
        selectWeb(activeProviders[0].id);
      }
    }

    renderSyncUI();
    attemptSilentSync();
  });
  
  if (searchInput) {
    searchInput.addEventListener("input", renderSidebar);
  }

  if (tabRegular && tabSidepanel) {
    tabRegular.addEventListener("click", () => switchCodeTab("regular"));
    tabSidepanel.addEventListener("click", () => switchCodeTab("sidepanel"));
  }

  if (ruleSidepanel) {
    ruleSidepanel.addEventListener("change", (e) => {
      zoomGroupContainer.classList.toggle("hidden", !e.target.checked);
    });
  }
}

function switchCodeTab(target) {
  if (!selectedId) return;
  if (activeCodeTab === target) return;

  // Cache the current values from the editor
  const currentJs = jsEditor.getValue();
  const currentCss = cssEditor.getValue();

  if (!customAssets[selectedId]) {
    customAssets[selectedId] = {};
  }

  if (activeCodeTab === "regular") {
    customAssets[selectedId].js = currentJs;
    customAssets[selectedId].css = currentCss;
  } else {
    customAssets[selectedId].sidepanelJs = currentJs;
    customAssets[selectedId].sidepanelCss = currentCss;
  }

  activeCodeTab = target;

  // Update UI tabs
  tabRegular.classList.toggle("active", target === "regular");
  tabSidepanel.classList.toggle("active", target === "sidepanel");

  // Update labels
  document.getElementById("js-label").textContent = target === "regular" ? "JavaScript" : "JavaScript (Side Panel)";
  document.getElementById("css-label").textContent = target === "regular" ? "SCSS or CSS" : "SCSS or CSS (Side Panel)";

  // Load target values
  const assets = customAssets[selectedId];
  if (target === "regular") {
    jsEditor.setValue(assets.js || "", -1);
    cssEditor.setValue(assets.css || "", -1);
  } else {
    jsEditor.setValue(assets.sidepanelJs || "", -1);
    cssEditor.setValue(assets.sidepanelCss || "", -1);
  }
}

function renderSyncUI() {
  chrome.storage.local.get(["user_profile", "last_sync_timestamp"], (result) => {
    if (result.user_profile) {
      userName.textContent = result.user_profile.name || "Google User";
      userAvatar.src = result.user_profile.picture || "";
      syncProfile.classList.remove("hidden");
      loginBtn.classList.add("hidden");

      const lastSyncTimeEl = document.getElementById("last-sync-time");
      if (result.last_sync_timestamp) {
        const timeStr = new Date(result.last_sync_timestamp).toLocaleTimeString();
        lastSyncTimeEl.textContent = `Last sync: ${timeStr}`;
      } else {
        lastSyncTimeEl.textContent = "Never synced";
      }
    } else {
      syncProfile.classList.add("hidden");
      loginBtn.classList.remove("hidden");
    }
  });
}

async function attemptSilentSync() {
  let token = null;
  try {
    token = await getAuthToken(false);
    let profile = null;
    try {
      profile = await getUserProfile(token);
    } catch (profileErr) {
      console.warn("Silent sync profile fetch failed:", profileErr);
      if (profileErr.message === "UNAUTHORIZED") {
        throw profileErr;
      }
      profile = { name: "Lumina User", picture: "icons/icon48.png" };
    }
    chrome.storage.local.set({ user_profile: profile });
    renderSyncUI();
    syncStatus.textContent = "Syncing...";
    await syncData(token);
    chrome.storage.local.set({ last_sync_timestamp: Date.now() }, () => {
      syncStatus.textContent = "Synced to cloud";
      renderSyncUI();
    });
  } catch (err) {
    if (err.message === "UNAUTHORIZED" && token) {
      await removeCachedAuthToken(token);
      renderSyncUI();
    }
    if (err.message !== "credentials_required" && err.message !== "interaction_required") {
      console.error("Silent sync error:", err);
      syncStatus.textContent = "Sync failed";
    }
  }
}

async function loginGoogle() {
  syncStatus.textContent = "Connecting...";
  let token = null;
  try {
    token = await getAuthToken(true);
    let profile = null;
    try {
      profile = await getUserProfile(token);
    } catch (profileErr) {
      console.warn("Login profile fetch failed:", profileErr);
      if (profileErr.message === "UNAUTHORIZED") {
        throw profileErr;
      }
      profile = { name: "Lumina User", picture: "icons/icon48.png" };
    }
    
    await new Promise((resolve) => {
      chrome.storage.local.set({ user_profile: profile }, resolve);
    });
    renderSyncUI();
    
    syncStatus.textContent = "Syncing...";
    await syncData(token);
    
    await new Promise((resolve) => {
      chrome.storage.local.set({ last_sync_timestamp: Date.now() }, resolve);
    });
    
    syncStatus.textContent = "Synced to cloud";
    renderSyncUI();
    
    chrome.storage.local.get(["providers", "custom_assets"], (result) => {
      providers = result.providers || DEFAULT_PROVIDERS;
      customAssets = result.custom_assets || {};
      
      providers.forEach(p => {
        if (p.enabled === undefined) p.enabled = true;
        if (p.inSidePanel === undefined) p.inSidePanel = true;
      });

      renderSidebar();
      if (providers.length > 0) {
        selectWeb(providers[0].id);
      }
    });
  } catch (e) {
    console.error("Google login error:", e);
    if (e.message === "credentials_required") {
      syncSetupOverlay.classList.remove("hidden");
      syncStatus.textContent = "Credentials required";
      return;
    }
    if (e.message === "UNAUTHORIZED" && token) {
      await removeCachedAuthToken(token);
      renderSyncUI();
    }
    syncStatus.textContent = "Login failed";
  }
}

async function handleManualSync() {
  syncStatus.textContent = "Syncing...";
  let token = null;
  try {
    token = await getAuthToken(true);
    await syncData(token);
    chrome.storage.local.set({ last_sync_timestamp: Date.now() }, () => {
      syncStatus.textContent = "Synced to cloud";
      renderSyncUI();
      chrome.storage.local.get(["providers", "custom_assets"], (result) => {
        providers = result.providers || DEFAULT_PROVIDERS;
        customAssets = result.custom_assets || {};
        
        providers.forEach(p => {
          if (p.enabled === undefined) p.enabled = true;
          if (p.inSidePanel === undefined) p.inSidePanel = true;
        });

        renderSidebar();
        if (providers.length > 0) {
          selectWeb(providers[0].id);
        }
      });
    });
  } catch (err) {
    console.error("Manual sync failed:", err);
    if (err.message === "credentials_required") {
      syncSetupOverlay.classList.remove("hidden");
      syncStatus.textContent = "Credentials required";
      return;
    }
    if (err.message === "UNAUTHORIZED" && token) {
      await removeCachedAuthToken(token);
      renderSyncUI();
    }
    syncStatus.textContent = "Sync failed";
  }
}

async function logoutGoogle() {
  chrome.storage.local.get(["oauth_token"], async (result) => {
    if (result.oauth_token) {
      await removeCachedAuthToken(result.oauth_token);
    }
    chrome.storage.local.remove(["user_profile", "oauth_token", "oauth_token_time", "refresh_token", "last_sync_hash", "last_sync_timestamp"], () => {
      renderSyncUI();
    });
  });
}

loginBtn.addEventListener("click", loginGoogle);
logoutBtn.addEventListener("click", logoutGoogle);
manualSyncBtn.addEventListener("click", handleManualSync);

btnCancelSyncSetup.addEventListener("click", () => {
  syncSetupOverlay.classList.add("hidden");
});

btnUploadSyncJson.addEventListener("click", () => {
  inputSyncCredentials.click();
});

inputSyncCredentials.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const text = evt.target.result;
      const data = JSON.parse(text);
      const config = data.web || data.installed;
      if (!config || !config.client_id || !config.client_secret) {
        throw new Error("Invalid credentials JSON format. Missing client_id or client_secret.");
      }
      await chrome.storage.local.set({
        client_id: config.client_id,
        client_secret: config.client_secret
      });
      syncSetupOverlay.classList.add("hidden");
      alert("Credentials configured successfully!");
      loginGoogle();
    } catch (err) {
      console.error("Error reading credentials file:", err);
      alert(`Configuration failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

zoomInBtn.addEventListener("click", () => {
  if (selectedZoom < 500) {
    selectedZoom += 5;
    zoomVal.textContent = `${selectedZoom}%`;
    const provider = providers.find((p) => p.id === selectedId);
    if (provider) {
      provider.zoom = selectedZoom;
      provider.updatedAt = Date.now();
      chrome.storage.local.set({ providers });
    }
  }
});

zoomOutBtn.addEventListener("click", () => {
  if (selectedZoom > 20) {
    selectedZoom -= 5;
    zoomVal.textContent = `${selectedZoom}%`;
    const provider = providers.find((p) => p.id === selectedId);
    if (provider) {
      provider.zoom = selectedZoom;
      provider.updatedAt = Date.now();
      chrome.storage.local.set({ providers });
    }
  }
});

function initEditors() {
  jsEditor = ace.edit("web-js");
  jsEditor.setTheme("ace/theme/chrome");
  jsEditor.session.setMode("ace/mode/javascript");
  jsEditor.setOptions({
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
    showPrintMargin: false,
    useWorker: false
  });

  cssEditor = ace.edit("web-css");
  cssEditor.setTheme("ace/theme/chrome");
  cssEditor.session.setMode("ace/mode/css");
  cssEditor.setOptions({
    enableBasicAutocompletion: true,
    enableLiveAutocompletion: true,
    showPrintMargin: false,
    useWorker: false
  });

  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    jsEditor.setTheme("ace/theme/tomorrow_night");
    cssEditor.setTheme("ace/theme/tomorrow_night");
  }

  formatJsBtn.addEventListener("click", () => {
    jsEditor.setValue(jsEditor.getValue(), -1);
    ace.require("ace/ext/beautify").beautify(jsEditor.session);
  });

  formatCssBtn.addEventListener("click", () => {
    cssEditor.setValue(cssEditor.getValue(), -1);
    ace.require("ace/ext/beautify").beautify(cssEditor.session);
  });

  const jsSnippetsSelect = document.getElementById("js-snippets-select");
  if (jsSnippetsSelect) {
    jsSnippetsSelect.addEventListener("change", (e) => {
      const value = e.target.value;
      if (!value) return;
      
      let snippet = "";
      if (value === "autofocus") {
        snippet = `document.addEventListener('keydown', function(event) {
  const inputElement = document.querySelector('rich-textarea div.ql-editor[contenteditable="true"], input[type="text"], input[type="search"], textarea'); // <-- REPLACE with your input/editor selector if needed
  if (!inputElement) return;

  const activeElement = document.activeElement;
  const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName) || activeElement.isContentEditable;
  const isCopyCommand = (event.ctrlKey || event.metaKey) && event.key === 'c';

  if (!isEditing && !isCopyCommand && (event.key.length === 1 || event.key === 'Enter')) {
    inputElement.focus();

    const range = document.createRange();
    range.selectNodeContents(inputElement);
    range.collapse(false);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
});\n`;
      } else if (value === "autoclick") {
        snippet = `const clickTimer = setInterval(() => {
  const btn = document.querySelector('.btn-primary, button'); // <-- REPLACE with your button selector (e.g. '.btn-primary' or '#submit-btn')
  if (btn) {
    btn.click();
    clearInterval(clickTimer);
  }
}, 500);\n`;
      } else if (value === "darkmode") {
        snippet = `const style = document.createElement('style');
style.textContent = \`
  html, body {
    background-color: #121212 !important;
    color: #e0e0e0 !important;
  }
  img, video {
    filter: brightness(.8) contrast(1.2);
  }
\`;
document.head.appendChild(style);\n`;
      } else if (value === "scroll") {
        snippet = `const observer = new MutationObserver(() => {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});
observer.observe(document.body, { childList: true, subtree: true });\n`;
      } else if (value === "scroll-to-element") {
        snippet = `window.addEventListener('DOMContentLoaded', () => {
  const targetSelector = '#id-phan-tu-cua-ban'; // <-- REPLACE with your element selector (e.g. '#header' or '.main-content')
  const targetElement = document.querySelector(targetSelector);
  if (targetElement) {
    setTimeout(() => {
      targetElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }, 150);
  }
});\n`;
      }
      
      if (snippet && jsEditor) {
        const session = jsEditor.getSession();
        const cursor = jsEditor.getCursorPosition();
        session.insert(cursor, snippet);
        jsEditor.focus();
      }
      
      jsSnippetsSelect.value = "";
    });
  }
}

function renderSidebar() {
  webList.innerHTML = "";
  const query = searchInput ? searchInput.value.toLowerCase() : "";
  
  const filtered = providers.filter((p) => {
    if (p.deleted) return false;
    return p.name.toLowerCase().includes(query) || p.url.toLowerCase().includes(query);
  });

  if (rulesCount) {
    rulesCount.textContent = filtered.length;
  }

  filtered.forEach((p) => {
    const li = document.createElement("li");
    li.className = `web-item ${p.id === selectedId ? "active" : ""}`;
    
    // Left part (Icon + Name + URL)
    const leftDiv = document.createElement("div");
    leftDiv.className = "web-item-left";
    
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
    
    const textWrapper = document.createElement("div");
    textWrapper.style.display = "flex";
    textWrapper.style.flexDirection = "column";
    textWrapper.style.gap = "2px";
    textWrapper.style.minWidth = "0";
    
    const nameSpan = document.createElement("span");
    nameSpan.textContent = p.name;
    nameSpan.style.fontSize = "13px";
    nameSpan.style.fontWeight = "600";
    
    const urlSpan = document.createElement("span");
    urlSpan.textContent = p.url;
    urlSpan.style.fontSize = "10px";
    urlSpan.style.color = "var(--text-muted)";
    urlSpan.style.whiteSpace = "nowrap";
    urlSpan.style.overflow = "hidden";
    urlSpan.style.textOverflow = "ellipsis";
    
    textWrapper.appendChild(nameSpan);
    textWrapper.appendChild(urlSpan);
    leftDiv.appendChild(icon);
    leftDiv.appendChild(textWrapper);
    li.appendChild(leftDiv);
    
    leftDiv.addEventListener("click", () => {
      selectWeb(p.id);
    });
    
    // Right part (Active Switch Toggle)
    const rightDiv = document.createElement("div");
    const switchLabel = document.createElement("label");
    switchLabel.className = "switch";
    switchLabel.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = p.enabled !== false;
    checkbox.addEventListener("change", (e) => {
      p.enabled = e.target.checked;
      p.updatedAt = Date.now();
      chrome.storage.local.set({ providers });
      try {
        localStorage.setItem("providers", JSON.stringify(providers));
      } catch (err) {}
      
      if (selectedId === p.id) {
        ruleEnabled.checked = p.enabled;
      }
    });
    
    const slider = document.createElement("span");
    slider.className = "slider round";
    
    switchLabel.appendChild(checkbox);
    switchLabel.appendChild(slider);
    rightDiv.appendChild(switchLabel);
    li.appendChild(rightDiv);
    
    webList.appendChild(li);
  });
}

function selectWeb(id) {
  selectedId = id;
  renderSidebar();
  
  const provider = providers.find((p) => p.id === id);
  if (!provider || provider.deleted) return;
  
  emptyView.classList.add("hidden");
  editorView.classList.remove("hidden");
  
  webName.value = provider.name;
  webUrl.value = provider.url;
  
  ruleEnabled.checked = provider.enabled !== false;
  ruleSidepanel.checked = provider.inSidePanel !== false;
  zoomGroupContainer.classList.toggle("hidden", provider.inSidePanel === false);
  
  selectedZoom = provider.zoom || 100;
  zoomVal.textContent = `${selectedZoom}%`;
  
  // Set code editor tab back to "regular" on change selection
  activeCodeTab = "regular";
  tabRegular.classList.add("active");
  tabSidepanel.classList.remove("active");
  document.getElementById("js-label").textContent = "JavaScript";
  document.getElementById("css-label").textContent = "SCSS or CSS";

  const assets = customAssets[id] || { js: "", css: "", sidepanelJs: "", sidepanelCss: "" };
  jsEditor.setValue(assets.js || "", -1);
  cssEditor.setValue(assets.css || "", -1);
}

addBtn.addEventListener("click", (e) => {
  e.preventDefault();
  const newId = `custom-${Date.now()}`;
  const newProvider = {
    id: newId,
    name: "New Website",
    url: "https://",
    zoom: 100,
    enabled: true,
    inSidePanel: false, // Default new rules to not show in side panel
    updatedAt: Date.now()
  };
  
  providers.push(newProvider);
  chrome.storage.local.set({ providers }, () => {
    try {
      localStorage.setItem("providers", JSON.stringify(providers));
    } catch (err) {}
    selectWeb(newId);
  });
});

saveBtn.addEventListener("click", () => {
  if (!selectedId) return;
  
  const providerIndex = providers.findIndex((p) => p.id === selectedId);
  if (providerIndex === -1) return;
  
  const newUrl = webUrl.value.trim();
  
  providers[providerIndex].name = webName.value.trim();
  providers[providerIndex].url = newUrl;
  providers[providerIndex].enabled = ruleEnabled.checked;
  providers[providerIndex].inSidePanel = ruleSidepanel.checked;
  providers[providerIndex].zoom = selectedZoom;
  providers[providerIndex].updatedAt = Date.now();
  
  // Capture current values into memory
  if (!customAssets[selectedId]) {
    customAssets[selectedId] = {};
  }
  
  if (activeCodeTab === "regular") {
    customAssets[selectedId].js = jsEditor.getValue();
    customAssets[selectedId].css = cssEditor.getValue();
  } else {
    customAssets[selectedId].sidepanelJs = jsEditor.getValue();
    customAssets[selectedId].sidepanelCss = cssEditor.getValue();
  }
  
  customAssets[selectedId].updatedAt = Date.now();
  
  chrome.storage.local.set({ providers, custom_assets: customAssets, force_refresh: Date.now() }, () => {
    try {
      localStorage.setItem("providers", JSON.stringify(providers));
    } catch (err) {}
    updateDynamicRules();
    renderSidebar();
    selectWeb(selectedId);
  });
});

deleteBtn.addEventListener("click", () => {
  if (!selectedId) return;
  
  const provider = providers.find((p) => p.id === selectedId);
  if (provider) {
    provider.deleted = true;
    provider.updatedAt = Date.now();
  }
  
  if (customAssets[selectedId]) {
    customAssets[selectedId].deleted = true;
    customAssets[selectedId].updatedAt = Date.now();
  } else {
    customAssets[selectedId] = {
      deleted: true,
      updatedAt: Date.now()
    };
  }
  
  chrome.storage.local.set({ providers, custom_assets: customAssets }, () => {
    try {
      localStorage.setItem("providers", JSON.stringify(providers));
    } catch (err) {}
    updateDynamicRules();
    selectedId = null;
    editorView.classList.add("hidden");
    emptyView.classList.remove("hidden");
    renderSidebar();
  });
});

function updateDynamicRules() {
  if (typeof chrome === "undefined" || !chrome.declarativeNetRequest) return;
  
  chrome.declarativeNetRequest.getDynamicRules((existingRules) => {
    const removeRuleIds = existingRules.map((rule) => rule.id);
    const addRules = [];
    
    // Only construct frame rule exceptions for rule configurations that are in the Sidepanel
    providers.forEach((p, index) => {
      if (p.deleted || !p.inSidePanel) return;
      try {
        const hostname = new URL(p.url).hostname;
        if (!hostname) return;
        
        addRules.push({
          id: 100 + index,
          priority: 1,
          action: {
            type: "modifyHeaders",
            responseHeaders: [
              { header: "x-frame-options", operation: "remove" },
              { header: "content-security-policy", operation: "remove" },
              { header: "content-security-policy-report-only", operation: "remove" },
              { header: "cross-origin-resource-policy", operation: "remove" },
              { header: "cross-origin-embedder-policy", operation: "remove" },
              { header: "cross-origin-opener-policy", operation: "remove" }
            ]
          },
          condition: {
            urlFilter: `||${hostname}/`,
            resourceTypes: ["sub_frame"]
          }
        });
      } catch (e) {}
    });
    
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules
    });
  });
}

init();
