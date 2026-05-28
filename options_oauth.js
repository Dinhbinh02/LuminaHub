function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0;
  }
  return h.toString(36);
}

function generateVerifier() {
  const array = new Uint32Array(56);
  crypto.getRandomValues(array);
  return Array.from(array, dec => ('0' + dec.toString(16)).slice(-2)).join('');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(str) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function exchangeCodeForTokens(clientId, clientSecret, code, verifier, redirectUrl) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUrl
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${errText}`);
  }

  return res.json();
}

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${errText}`);
  }

  return res.json();
}

export function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.identity) {
      reject(new Error("Chrome Identity API is not available (must run as Chrome Extension)"));
      return;
    }

    chrome.storage.local.get(["client_id", "client_secret", "oauth_token", "oauth_token_time", "refresh_token"], async (result) => {
      const { client_id: clientId, client_secret: clientSecret, oauth_token: token, oauth_token_time: tokenTime, refresh_token: refreshToken } = result;

      if (!clientId || !clientSecret) {
        reject(new Error("credentials_required"));
        return;
      }

      if (token && tokenTime) {
        const age = Date.now() - tokenTime;
        if (age < 3500 * 1000) {
          resolve(token);
          return;
        }
      }

      if (refreshToken) {
        try {
          const data = await refreshAccessToken(clientId, clientSecret, refreshToken);
          const newToken = data.access_token;
          if (newToken) {
            chrome.storage.local.set({
              oauth_token: newToken,
              oauth_token_time: Date.now()
            }, () => {
              resolve(newToken);
            });
            return;
          }
        } catch (refreshErr) {
          console.warn("Failed to refresh access token, fallback to full auth flow:", refreshErr);
          chrome.storage.local.remove(["oauth_token", "oauth_token_time", "refresh_token"]);
        }
      }

      if (!interactive) {
        reject(new Error("interaction_required"));
        return;
      }

      try {
        const verifier = generateVerifier();
        const challenge = await generateChallengeOfVerifier(verifier);
        const redirectUrl = chrome.identity.getRedirectURL();
        const scopes = [
          "https://www.googleapis.com/auth/drive.file",
          "email",
          "profile"
        ].join(" ");

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=${encodeURIComponent(scopes)}&code_challenge=${challenge}&code_challenge_method=S256&access_type=offline&prompt=consent`;

        chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true
        }, async (responseUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!responseUrl) {
            reject(new Error("Authentication failed: empty response"));
            return;
          }
          try {
            const url = new URL(responseUrl);
            const code = url.searchParams.get("code");
            if (!code) {
              reject(new Error("Authorization code not found in response"));
              return;
            }

            const data = await exchangeCodeForTokens(clientId, clientSecret, code, verifier, redirectUrl);
            const accessToken = data.access_token;
            const newRefreshToken = data.refresh_token || refreshToken; // keep old if no new one

            if (accessToken) {
              const storageData = {
                oauth_token: accessToken,
                oauth_token_time: Date.now()
              };
              if (newRefreshToken) {
                storageData.refresh_token = newRefreshToken;
              }
              chrome.storage.local.set(storageData, () => {
                resolve(accessToken);
              });
            } else {
              reject(new Error("Access token missing in token response"));
            }
          } catch (e) {
            reject(e);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function generateChallengeOfVerifier(verifier) {
  const hashed = await sha256(verifier);
  return base64urlencode(hashed);
}

export function removeCachedAuthToken(token) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(["oauth_token", "oauth_token_time", "last_sync_hash", "user_profile"], () => {
      resolve();
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
  let fileId = await new Promise(resolve => {
    chrome.storage.local.get(["drive_file_id"], (res) => resolve(res.drive_file_id || null));
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
      console.warn("Cached file ID invalid, searching again...", e);
      chrome.storage.local.remove(["drive_file_id"]);
      fileId = null;
    }
  }

  if (!fileId) {
    remoteFileId = await findBackupFile(token);
    if (remoteFileId) {
      chrome.storage.local.set({ drive_file_id: remoteFileId });
      try {
        const backup = await downloadBackup(token, remoteFileId);
        remoteProviders = backup.providers || [];
        remoteAssets = backup.custom_assets || {};
      } catch (downloadErr) {
        if (downloadErr.message === "UNAUTHORIZED") throw downloadErr;
      }
    }
  }

  const localProviders = await new Promise(resolve => {
    chrome.storage.local.get(["providers"], (res) => resolve(res.providers || []));
  });
  const localAssets = await new Promise(resolve => {
    chrome.storage.local.get(["custom_assets"], (res) => resolve(res.custom_assets || {}));
  });

  const mergedProviders = [];
  const localProvidersMap = new Map(localProviders.map(p => [p.id, p]));
  const remoteProvidersMap = new Map(remoteProviders.map(p => [p.id, p]));
  const allProviderIds = new Set([...localProvidersMap.keys(), ...remoteProvidersMap.keys()]);

  for (const id of allProviderIds) {
    const local = localProvidersMap.get(id);
    const remote = remoteProvidersMap.get(id);
    if (local && remote) {
      const localTime = local.updatedAt || 0;
      const remoteTime = remote.updatedAt || 0;
      if (localTime >= remoteTime) {
        mergedProviders.push(local);
      } else {
        mergedProviders.push(remote);
      }
    } else if (local) {
      mergedProviders.push(local);
    } else if (remote) {
      mergedProviders.push(remote);
    }
  }

  const mergedAssets = {};
  const allAssetIds = new Set([...Object.keys(localAssets), ...Object.keys(remoteAssets)]);
  for (const id of allAssetIds) {
    const local = localAssets[id];
    const remote = remoteAssets[id];
    if (local && remote) {
      const localTime = local.updatedAt || 0;
      const remoteTime = remote.updatedAt || 0;
      if (localTime >= remoteTime) {
        mergedAssets[id] = local;
      } else {
        mergedAssets[id] = remote;
      }
    } else if (local) {
      mergedAssets[id] = local;
    } else if (remote) {
      mergedAssets[id] = remote;
    }
  }

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
    try {
      await updateBackupFile(token, remoteFileId, payload);
    } catch (updateErr) {
      if (updateErr.message === "UNAUTHORIZED") throw updateErr;
      console.warn("Failed to update backup file, recreating...", updateErr);
      chrome.storage.local.remove(["drive_file_id"]);
      remoteFileId = await createBackupFile(token, payload);
      chrome.storage.local.set({ drive_file_id: remoteFileId });
    }
  } else {
    remoteFileId = await createBackupFile(token, payload);
    chrome.storage.local.set({ drive_file_id: remoteFileId });
  }

  await new Promise(resolve => {
    chrome.storage.local.set({
      providers: mergedProviders,
      custom_assets: mergedAssets,
      last_sync_hash: newHash
    }, resolve);
  });
}
