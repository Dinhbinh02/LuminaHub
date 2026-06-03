const rulesList = document.getElementById("applied-rules-list");
const noRulesView = document.getElementById("no-rules-view");
const newRuleBtn = document.getElementById("new-rule-btn");
const newRuleLabel = document.getElementById("new-rule-label");
const openSidepanelBtn = document.getElementById("open-sidepanel-btn");
const openOptionsBtn = document.getElementById("open-options-btn");

let activeTab = null;
let currentUrl = "";
let currentHostname = "";
let providers = [];

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

// Initialize popup
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  activeTab = tabs[0];
  if (!activeTab || !activeTab.url) return;

  currentUrl = activeTab.url;
  try {
    currentHostname = new URL(currentUrl).hostname;
  } catch (e) {
    currentHostname = "";
  }

  // Setup New Rule Button Label
  if (currentHostname) {
    newRuleLabel.textContent = `New rule: ${currentHostname}/*`;
  } else {
    newRuleBtn.classList.add("hidden");
  }

  // Load providers and render matched rules
  chrome.storage.local.get(["providers"], (res) => {
    providers = res.providers || [];
    renderRules();
  });
});

function renderRules() {
  rulesList.innerHTML = "";
  
  if (!currentUrl) {
    noRulesView.classList.remove("hidden");
    return;
  }

  const matched = providers.filter((p) => !p.deleted && matchUrl(p.url, currentUrl));

  if (matched.length === 0) {
    noRulesView.classList.remove("hidden");
    return;
  }

  noRulesView.classList.add("hidden");

  matched.forEach((p) => {
    const li = document.createElement("li");
    li.className = "rule-item";

    const info = document.createElement("div");
    info.className = "rule-info";

    const name = document.createElement("span");
    name.className = "rule-name";
    name.textContent = p.name;

    const pattern = document.createElement("span");
    pattern.className = "rule-pattern";
    pattern.textContent = p.url;

    info.appendChild(name);
    info.appendChild(pattern);
    li.appendChild(info);

    // Switch toggle
    const label = document.createElement("label");
    label.className = "switch";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = p.enabled !== false;
    checkbox.addEventListener("change", (e) => {
      // Find matching item in main providers list and toggle it
      const original = providers.find(item => item.id === p.id);
      if (original) {
        original.enabled = e.target.checked;
        original.updatedAt = Date.now();
        chrome.storage.local.set({ providers });
        try {
          localStorage.setItem("providers", JSON.stringify(providers));
        } catch (err) {}
      }
    });

    const slider = document.createElement("span");
    slider.className = "slider";

    label.appendChild(checkbox);
    label.appendChild(slider);
    li.appendChild(label);

    rulesList.appendChild(li);
  });
}

// Add New Rule Action
newRuleBtn.addEventListener("click", () => {
  if (!currentHostname) return;

  const newId = `custom-${Date.now()}`;
  const suggestedPattern = `https://${currentHostname}/*`;
  
  const newProvider = {
    id: newId,
    name: currentHostname,
    url: suggestedPattern,
    zoom: 100,
    enabled: true,
    inSidePanel: false, // Default is false for normal rules
    updatedAt: Date.now()
  };

  providers.push(newProvider);

  chrome.storage.local.set({ 
    providers, 
    selectedProvider: newId 
  }, () => {
    try {
      localStorage.setItem("providers", JSON.stringify(providers));
      localStorage.setItem("selectedProvider", newId);
    } catch (e) {}

    // Open options page to edit the new rule
    chrome.runtime.openOptionsPage(() => {
      window.close();
    });
  });
});

// Open Side Panel Action
openSidepanelBtn.addEventListener("click", () => {
  if (activeTab) {
    chrome.sidePanel.open({ windowId: activeTab.windowId });
    window.close();
  }
});

// Open Options Action
openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage(() => {
    window.close();
  });
});
