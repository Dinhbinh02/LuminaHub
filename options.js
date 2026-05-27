import { getAuthToken, removeCachedAuthToken, getUserProfile, syncData } from "./options_oauth.js";

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

let jsEditor = null;
let cssEditor = null;
let providers = [];
let customAssets = {};
let selectedId = null;

const webList = document.getElementById("web-list");
const addBtn = document.getElementById("add-btn");
const saveBtn = document.getElementById("save-btn");
const deleteBtn = document.getElementById("delete-btn");

const editorView = document.getElementById("editor-view");
const emptyView = document.getElementById("empty-view");

const webName = document.getElementById("web-name");
const webUrl = document.getElementById("web-url");
const panelTitle = document.getElementById("panel-title");

const formatJsBtn = document.getElementById("format-js-btn");
const formatCssBtn = document.getElementById("format-css-btn");

const syncProfile = document.getElementById("sync-profile");
const userAvatar = document.getElementById("user-avatar");
const userName = document.getElementById("user-name");
const syncStatus = document.getElementById("sync-status");
const logoutBtn = document.getElementById("logout-btn");
const manualSyncBtn = document.getElementById("manual-sync-btn");
const loginBtn = document.getElementById("login-btn");

function init() {
  chrome.storage.local.get(["providers", "custom_assets"], (result) => {
    providers = result.providers || DEFAULT_PROVIDERS;
    customAssets = result.custom_assets || {};
    initEditors();
    renderSidebar();
    
    if (providers.length > 0) {
      selectWeb(providers[0].id);
    }

    renderSyncUI();
    attemptSilentSync();
  });
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
  try {
    const token = await getAuthToken(false);
    const profile = await getUserProfile(token);
    chrome.storage.local.set({ user_profile: profile });
    renderSyncUI();
    syncStatus.textContent = "Syncing...";
    await syncData(token);
    chrome.storage.local.set({ last_sync_timestamp: Date.now() }, () => {
      syncStatus.textContent = "Synced to cloud";
      renderSyncUI();
    });
  } catch (err) {
    if (err.message !== "credentials_required" && err.message !== "interaction_required") {
      console.error("Silent sync error:", err);
      syncStatus.textContent = "Sync failed";
    }
  }
}

async function loginGoogle() {
  syncStatus.textContent = "Connecting...";
  try {
    const token = await getAuthToken(true);
    const profile = await getUserProfile(token);
    chrome.storage.local.set({ user_profile: profile }, () => {
      renderSyncUI();
      syncStatus.textContent = "Syncing...";
      syncData(token).then(() => {
        chrome.storage.local.set({ last_sync_timestamp: Date.now() }, () => {
          syncStatus.textContent = "Synced to cloud";
          renderSyncUI();
          chrome.storage.local.get(["providers", "custom_assets"], (result) => {
            providers = result.providers || DEFAULT_PROVIDERS;
            customAssets = result.custom_assets || {};
            renderSidebar();
            if (providers.length > 0) {
              selectWeb(providers[0].id);
            }
          });
        });
      }).catch(err => {
        console.error(err);
        syncStatus.textContent = "Sync failed";
      });
    });
  } catch (e) {
    console.error("Google login error:", e);
    syncStatus.textContent = "Login failed";
  }
}

async function handleManualSync() {
  syncStatus.textContent = "Syncing...";
  try {
    const token = await getAuthToken(true);
    await syncData(token);
    chrome.storage.local.set({ last_sync_timestamp: Date.now() }, () => {
      syncStatus.textContent = "Synced to cloud";
      renderSyncUI();
      chrome.storage.local.get(["providers", "custom_assets"], (result) => {
        providers = result.providers || DEFAULT_PROVIDERS;
        customAssets = result.custom_assets || {};
        renderSidebar();
        if (providers.length > 0) {
          selectWeb(providers[0].id);
        }
      });
    });
  } catch (err) {
    console.error("Manual sync failed:", err);
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
}

function renderSidebar() {
  webList.innerHTML = "";
  providers.forEach((p) => {
    const li = document.createElement("li");
    li.className = `web-item ${p.id === selectedId ? "active" : ""}`;
    
    const icon = document.createElement("img");
    if (["deepseek", "mistral", "meta", "chatgpt", "claude", "gemini", "copilot", "grok"].includes(p.id)) {
      icon.src = `provider-icons/${p.id}.svg`;
    } else {
      try {
        const domain = new URL(p.url).hostname;
        icon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=62`;
      } catch (e) {
        icon.src = "";
      }
    }
    
    const span = document.createElement("span");
    span.textContent = p.name;
    
    li.appendChild(icon);
    li.appendChild(span);
    
    li.addEventListener("click", () => {
      selectWeb(p.id);
    });
    
    webList.appendChild(li);
  });
}

function selectWeb(id) {
  selectedId = id;
  renderSidebar();
  
  const provider = providers.find((p) => p.id === id);
  if (!provider) return;
  
  emptyView.classList.add("hidden");
  editorView.classList.remove("hidden");
  
  panelTitle.textContent = `Edit ${provider.name}`;
  webName.value = provider.name;
  webUrl.value = provider.url;
  
  const assets = customAssets[id] || { js: "", css: "" };
  jsEditor.setValue(assets.js || "", -1);
  cssEditor.setValue(assets.css || "", -1);
}

addBtn.addEventListener("click", () => {
  const newId = `custom-${Date.now()}`;
  const newProvider = {
    id: newId,
    name: "New Website",
    url: "https://"
  };
  
  providers.push(newProvider);
  chrome.storage.local.set({ providers }, () => {
    selectWeb(newId);
  });
});

saveBtn.addEventListener("click", () => {
  if (!selectedId) return;
  
  const providerIndex = providers.findIndex((p) => p.id === selectedId);
  if (providerIndex === -1) return;
  
  const oldUrl = providers[providerIndex].url;
  const newUrl = webUrl.value.trim();
  
  providers[providerIndex].name = webName.value.trim();
  providers[providerIndex].url = newUrl;
  
  customAssets[selectedId] = {
    js: jsEditor.getValue(),
    css: cssEditor.getValue()
  };
  
  chrome.storage.local.set({ providers, custom_assets: customAssets, force_refresh: Date.now() }, () => {
    updateDynamicRules();
    renderSidebar();
    selectWeb(selectedId);
  });
});

deleteBtn.addEventListener("click", () => {
  if (!selectedId) return;
  
  providers = providers.filter((p) => p.id !== selectedId);
  delete customAssets[selectedId];
  
  chrome.storage.local.set({ providers, custom_assets: customAssets }, () => {
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
    
    providers.forEach((p, index) => {
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
