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
let activeWebId = null;

const dropdown = document.getElementById("web-dropdown");
const trigger = document.getElementById("dropdown-trigger");
const selectedText = document.getElementById("selected-web-name");
const menu = document.getElementById("dropdown-menu");

const frame = document.getElementById("web-frame");
const loader = document.getElementById("loader");
const refreshBtn = document.getElementById("refresh-btn");
const optionsBtn = document.getElementById("options-btn");

function init() {
  chrome.storage.local.get(["providers", "selectedProvider"], (result) => {
    providers = result.providers || DEFAULT_PROVIDERS;
    if (!result.providers) {
      chrome.storage.local.set({ providers: DEFAULT_PROVIDERS });
    }

    const activeId = result.selectedProvider || providers[0]?.id;
    buildDropdown();
    
    if (activeId && providers.some(p => p.id === activeId)) {
      selectWeb(activeId);
    } else if (providers.length > 0) {
      selectWeb(providers[0].id);
    }
  });
}

function buildDropdown() {
  menu.innerHTML = "";
  providers.forEach((p) => {
    const li = document.createElement("li");
    li.className = `dropdown-item ${p.id === activeWebId ? "active" : ""}`;
    
    const icon = document.createElement("img");
    if (["deepseek", "mistral", "meta", "chatgpt", "claude", "gemini", "copilot", "grok"].includes(p.id)) {
      icon.src = `provider-icons/${p.id}.svg`;
    } else {
      try {
        const domain = new URL(p.url).hostname;
        icon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
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
    });
    
    menu.appendChild(li);
  });
}

function selectWeb(id, forceBaseUrl = false) {
  const provider = providers.find((p) => p.id === id);
  if (!provider) return;

  activeWebId = id;
  selectedText.textContent = provider.name;

  if (forceBaseUrl) {
    loader.classList.remove("hidden");
    frame.src = provider.url;
    chrome.storage.local.set({ [`last_url_${id}`]: provider.url });
  } else {
    chrome.storage.local.get([`last_url_${id}`], (result) => {
      const urlToLoad = result[`last_url_${id}`] || provider.url;
      if (frame.src !== urlToLoad) {
        loader.classList.remove("hidden");
        frame.src = urlToLoad;
      }
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
}

trigger.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdown.classList.toggle("open");
});

document.addEventListener("click", () => {
  dropdown.classList.remove("open");
});

frame.addEventListener("load", () => {
  loader.classList.add("hidden");
  if (activeWebId) {
    try {
      const currentUrl = frame.contentWindow.location.href;
      if (currentUrl && currentUrl !== "about:blank") {
        chrome.storage.local.set({ [`last_url_${activeWebId}`]: currentUrl });
      }
    } catch (e) {
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === "LUMINA_URL_CHANGED" && !sender.tab) {
    if (activeWebId) {
      chrome.storage.local.set({ [`last_url_${activeWebId}`]: message.url });
    }
  }
});

refreshBtn.addEventListener("click", () => {
  loader.classList.remove("hidden");
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
    buildDropdown();
  }

  if (changes.force_refresh) {
    loader.classList.remove("hidden");
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

init();
