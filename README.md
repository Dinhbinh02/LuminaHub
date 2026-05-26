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

### ⚙️ Setting up OAuth Credentials (Google Drive Sync)

To enable Google Drive backup and synchronization, you must set up your own Google OAuth2 credentials:

**Step 1 — Create a Google Cloud project**

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `Lumina Hub`).
3. Go to **APIs & Services > Library**, search for **Google Drive API**, and click **Enable**.

**Step 2 — Configure Google Auth Platform**

3. In the left menu, search for and open **Google Auth Platform** (or go to **APIs & Services > Google Auth Platform**). Click **Get Started** if prompted.
4. **Branding**: Enter your app name (e.g. `Lumina Hub`) and a user support email. Click **Next**.
5. **Audience**: Select **External** so any Google account can use it. Click **Next**.
6. Back on the **Google Auth Platform** overview, click **Publish App** to move it out of Testing mode (otherwise only test users can sign in).

**Step 3 — Create OAuth credentials**

7. Go to **APIs & Services > Credentials**.
8. Click **Create Credentials** > **OAuth client ID**.
9. Select **Web application** as the application type.
10. Under **Authorized redirect URIs**, click **Add URI** and enter: `https://<YOUR_EXTENSION_ID>.chromiumapp.org/` — replace `<YOUR_EXTENSION_ID>` with your extension's ID (found on `chrome://extensions/` after loading it unpacked).
11. Click **Create**.
12. Click the **Download JSON** button to download the configuration file (named `client_secret_<client-id>.json`).

**Step 4 — Connect to the extension**

12. Inside the Lumina Hub extension options page, click **Sign in with Google**.
13. A popup will prompt you to upload the downloaded JSON file. Select it, and the extension will automatically configure itself and start syncing!
14. Keep this JSON file — you can use it to sign in on other devices too. (Note: To use the extension on another device, simply reuse this same JSON file and add the Authorized redirect URI based on the extension's ID on that device to the Google Cloud Console settings).

---

## 🔒 Permissions & Security

Lumina Hub prioritizes your privacy. The extension requests minimal permissions to function:
- `storage`: Saves custom assets and providers locally.
- `sidePanel`: Displays the website sidebar UI.
- `identity`: Authenticates with Google API.
- `declarativeNetRequest` & `declarativeNetRequestWithHostAccess`: Adjusts frame ancestors headers to allow embed support for platforms.
- `<all_urls>` (Host Permissions): Allows scripts and style sheets injection on your designated provider websites.
