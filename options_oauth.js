function simpleHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0;
  }
  return h.toString(36);
}

async function generatePkcePair() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = Array.from(array, dec => ('0' + dec.toString(16)).slice(-2)).join('');
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { verifier, challenge };
}

async function exchangeCodeForTokens(clientId, code, verifier, redirectUrl) {
  const result = await chrome.storage.local.get("client_secret");
  const clientSecret = result.client_secret;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: code,
      code_verifier: verifier,
      redirect_uri: redirectUrl
    })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error_description || errData.error || "Failed to exchange code");
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token
  };
}

async function refreshAccessToken(clientId, refreshToken) {
  const result = await chrome.storage.local.get("client_secret");
  const clientSecret = result.client_secret;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error_description || errData.error || "Failed to refresh token");
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken
  };
}

export function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.identity) {
      reject(new Error("Chrome Identity API is not available (must run as Chrome Extension)"));
      return;
    }

    chrome.storage.local.get(["oauth_token", "oauth_token_time", "refresh_token", "client_id", "client_secret"], async (result) => {
      if (result.oauth_token && result.oauth_token_time) {
        const age = Date.now() - result.oauth_token_time;
        if (age < 3500 * 1000) {
          resolve(result.oauth_token);
          return;
        }
      }

      const clientId = result.client_id;
      const clientSecret = result.client_secret;

      if (!clientId || !clientSecret) {
        reject(new Error("credentials_required"));
        return;
      }

      if (result.refresh_token) {
        try {
          const refreshed = await refreshAccessToken(clientId, result.refresh_token);
          chrome.storage.local.set({
            oauth_token: refreshed.accessToken,
            oauth_token_time: Date.now(),
            refresh_token: refreshed.refreshToken
          }, () => {
            resolve(refreshed.accessToken);
          });
          return;
        } catch (err) {
          console.error(err);
        }
      }

      if (!interactive) {
        reject(new Error("interaction_required"));
        return;
      }

      try {
        const pair = await generatePkcePair();
        chrome.storage.local.set({ pkce_verifier: pair.verifier }, () => {
          fallbackToWebAuthFlowPKCE(resolve, reject, clientId, pair.challenge);
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

function fallbackToWebAuthFlowPKCE(resolve, reject, clientId, challenge) {
  const redirectUrl = chrome.identity.getRedirectURL();
  const scopes = "openid email profile https://www.googleapis.com/auth/drive.file";
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=${encodeURIComponent(scopes)}&code_challenge=${challenge}&code_challenge_method=S256&access_type=offline&prompt=consent`;

  chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true
  }, (responseUrl) => {
    if (chrome.runtime.lastError) {
      reject(chrome.runtime.lastError);
      return;
    }
    if (!responseUrl) {
      reject(new Error("Authentication failed: empty response"));
      return;
    }

    chrome.storage.local.get(["pkce_verifier"], async (result) => {
      const verifier = result.pkce_verifier;
      try {
        const url = new URL(responseUrl);
        const hashParams = new URLSearchParams(url.hash.substring(1));
        const searchParams = new URLSearchParams(url.search);
        const code = hashParams.get("code") || searchParams.get("code");
        const error = hashParams.get("error") || searchParams.get("error");

        if (code) {
          try {
            const tokenRes = await exchangeCodeForTokens(clientId, code, verifier, redirectUrl);
            chrome.storage.local.set({
              oauth_token: tokenRes.accessToken,
              oauth_token_time: Date.now(),
              refresh_token: tokenRes.refreshToken
            }, () => {
              resolve(tokenRes.accessToken);
            });
          } catch (exchangeErr) {
            reject(exchangeErr);
          }
        } else if (error) {
          reject(new Error(error));
        } else {
          reject(new Error("Authorization code not found in response"));
        }
      } catch (e) {
        reject(e);
      }
    });
  });
}

export function removeCachedAuthToken(_token) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(["oauth_token", "oauth_token_time", "refresh_token", "last_sync_hash", "user_profile"], resolve);
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
