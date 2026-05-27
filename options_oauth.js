function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0;
  }
  return h.toString(36);
}

export function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.identity) {
      reject(new Error("Chrome Identity API is not available (must run as Chrome Extension)"));
      return;
    }

    chrome.identity.getAuthToken({ interactive: interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

export function removeCachedAuthToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token: token }, () => {
      chrome.storage.local.remove(["oauth_token", "oauth_token_time", "refresh_token", "last_sync_hash", "user_profile"], resolve);
    });
  });
}

export async function getUserProfile(token) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    throw new Error("Failed to fetch profile");
  }
  return res.json();
}

async function apiCall(url, token, options = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...options.headers
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    throw new Error(`API error: ${res.statusText}`);
  }
  return res;
}

export async function findBackupFile(token) {
  const q = encodeURIComponent("name='luminahub_sync.json' and trashed=false");
  const res = await apiCall(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, token);
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

export async function downloadBackup(token, fileId) {
  const res = await apiCall(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, token);
  return res.json();
}

export async function createBackupFile(token, payload) {
  const metadata = {
    name: "luminahub_sync.json",
    mimeType: "application/json"
  };
  const resMetadata = await apiCall("https://www.googleapis.com/drive/v3/files", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata)
  });
  const fileData = await resMetadata.json();
  const fileId = fileData.id;

  await apiCall(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return fileId;
}

export async function updateBackupFile(token, fileId, payload) {
  await apiCall(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function syncData(token) {
  const fileId = await findBackupFile(token);
  const localProviders = await new Promise(resolve => {
    chrome.storage.local.get(["providers"], (res) => resolve(res.providers || []));
  });
  const localAssets = await new Promise(resolve => {
    chrome.storage.local.get(["custom_assets"], (res) => resolve(res.custom_assets || {}));
  });

  let remoteProviders = [];
  let remoteAssets = {};
  let remoteFileId = fileId;

  if (fileId) {
    try {
      const backup = await downloadBackup(token, fileId);
      remoteProviders = backup.providers || [];
      remoteAssets = backup.custom_assets || {};
    } catch (e) {
      if (e.message === "UNAUTHORIZED") throw e;
    }
  }

  const mergedProviders = [];
  const localProvidersMap = new Map(localProviders.map(p => [p.id, p]));
  const remoteProvidersMap = new Map(remoteProviders.map(p => [p.id, p]));
  const allProviderIds = new Set([...localProvidersMap.keys(), ...remoteProvidersMap.keys()]);

  for (const id of allProviderIds) {
    const local = localProvidersMap.get(id);
    const remote = remoteProvidersMap.get(id);
    if (local) {
      mergedProviders.push(local);
    } else if (remote) {
      mergedProviders.push(remote);
    }
  }

  const mergedAssets = { ...remoteAssets, ...localAssets };

  const hashableStr = JSON.stringify({ providers: mergedProviders, custom_assets: mergedAssets });
  const newHash = simpleHash(hashableStr);

  const stored = await new Promise(resolve => chrome.storage.local.get(["last_sync_hash"], resolve));
  if (stored.last_sync_hash === newHash) {
    return;
  }

  const payload = {
    providers: mergedProviders,
    custom_assets: mergedAssets,
    lastSynced: Date.now()
  };

  if (remoteFileId) {
    await updateBackupFile(token, remoteFileId, payload);
  } else {
    remoteFileId = await createBackupFile(token, payload);
  }

  await new Promise(resolve => {
    chrome.storage.local.set({
      providers: mergedProviders,
      custom_assets: mergedAssets,
      last_sync_hash: newHash
    }, resolve);
  });
}
