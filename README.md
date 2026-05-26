# LuminaHub 🌐

> A premium sidebar companion Chrome Extension. Access and inject custom JS/CSS styles into your favorite websites side-by-side with your browsing.

---

## ✨ Features

- 📅 **Dual-Screen Sidebar Layout**: Browse your favorite web apps right next to your active workspace tabs.
- 🎨 **Custom JS/CSS Injection**: Personalize and automate sites with custom styles and scripts using the integrated Ace code editor.
- ⚡ **Zero-Flash Start Injection**: Injects custom styles at `document_start` to prevent flash of unstyled content (FOUC).
- 🔄 **Smart Refresh & Navigation**: Reloads the exact subpage you are currently viewing within the frame.
- 💾 **State Persistence**: Remembers the exact URL path you were viewing, restoring your exact workspace state when reopening the sidebar.

---

## 🛠️ Architecture & Directory Map

```
LuminaHub/
├── manifest.json              # Extension setup, permissions & inject matching (Manifest V3)
├── background.js              # Service worker configuring sidepanel behaviors
├── content.js                 # Injects custom scripts/styles and monitors dynamic URL navigation
├── sidepanel.html             # UI layout for the side panel frame and navigation controls
├── sidepanel.js               # Side panel main state controller and message handlers
├── sidepanel.css              # Custom styling for the side panel navigation UI
├── options.html               # Options page dashboard layout
├── options.js                 # Controller for editing custom JS/CSS styles per provider
├── options.css                # Styling rules for options page dashboard
├── rules.json                 # DeclarativeNetRequest rules for frame-ancestor header modification
├── icons/                     # Extension branding icon assets
└── provider-icons/            # Brand assets for built-in web providers
```

---

## 📥 Installation

1. Clone or download the `LuminaHub` directory.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** in the top left corner.
5. Select the `LuminaHub` directory.
6. Click the extension icon to slide open the workspace sidebar!
