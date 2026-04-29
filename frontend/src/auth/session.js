const AUTH_KEY = "appointly_auth";
const LEGACY_TOKEN = "appointly_token";
const LEGACY_USER = "appointly_user";
/** Active business (workspace) for tenant dashboard API scoping — Mongo ObjectId string. */
const WORKSPACE_KEY = "appointly_workspace_id";

function readAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data?.token && data?.user) return data;
    }
  } catch {
    clearSession();
    return null;
  }
  return migrateLegacy();
}

function migrateLegacy() {
  try {
    const token = localStorage.getItem(LEGACY_TOKEN);
    const userRaw = localStorage.getItem(LEGACY_USER);
    if (!token || !userRaw) return null;
    const user = JSON.parse(userRaw);
    const payload = { token, user };
    localStorage.setItem(AUTH_KEY, JSON.stringify(payload));
    localStorage.removeItem(LEGACY_TOKEN);
    localStorage.removeItem(LEGACY_USER);
    return payload;
  } catch {
    localStorage.removeItem(LEGACY_TOKEN);
    localStorage.removeItem(LEGACY_USER);
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
}

export function clearSession() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(LEGACY_TOKEN);
  localStorage.removeItem(LEGACY_USER);
  clearWorkspaceId();
}

/** Current workspace for tenant users (which owned business to scope dashboard data to). */
export function getStoredWorkspaceId() {
  try {
    const id = localStorage.getItem(WORKSPACE_KEY);
    return id && String(id).trim() ? String(id).trim() : null;
  } catch {
    return null;
  }
}

export function setStoredWorkspaceId(id) {
  if (id == null || String(id).trim() === "") {
    localStorage.removeItem(WORKSPACE_KEY);
    return;
  }
  localStorage.setItem(WORKSPACE_KEY, String(id).trim());
}

export function clearWorkspaceId() {
  localStorage.removeItem(WORKSPACE_KEY);
}

export function getToken() {
  return readAuth()?.token ?? null;
}

export function getStoredUser() {
  return readAuth()?.user ?? null;
}

/** Replace stored user (e.g. after profile update). Token unchanged. */
export function replaceSessionUser(user) {
  const token = getToken();
  if (!token || !user) return;
  setSession(token, user);
}
