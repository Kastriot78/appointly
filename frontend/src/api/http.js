import axios from "axios";
import { getToken, getStoredWorkspaceId } from "../auth/session";

/**
 * If VITE_API_URL is `http://localhost:5000/api`, paths like `/api/users/me`
 * would become `/api/api/users/me` and return 404. Strip a trailing `/api`.
 */
export function normalizeApiBaseUrl(url) {
  if (!url) return "http://localhost:5000";
  let u = String(url).trim().replace(/\/+$/, "");
  if (u.endsWith("/api")) {
    u = u.slice(0, -4);
  }
  return u;
}

/** Origin of the API (used to resolve `/uploads/...` paths from the backend). */
export function getApiOrigin() {
  return normalizeApiBaseUrl(import.meta.env.VITE_API_URL);
}

const baseURL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);
const OFFLINE_QUEUE_KEY = "appointly_offline_queue_v1";
const OFFLINE_QUEUE_EVENT = "appointly:offline-queue-changed";
const MUTATION_METHODS = new Set(["post", "put", "patch", "delete"]);

export const http = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

function queueSafeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readOfflineQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const rows = queueSafeParse(raw || "[]", []);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(rows) {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(rows));
  } catch {
    // ignore storage write failures
  }
  window.dispatchEvent(
    new CustomEvent(OFFLINE_QUEUE_EVENT, {
      detail: { count: Array.isArray(rows) ? rows.length : 0 },
    }),
  );
}

function queueOfflineMutation(config) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    method: String(config?.method || "post").toLowerCase(),
    url: config?.url || "",
    data: config?.data ?? null,
    params: config?.params ?? null,
    headers: {
      "Content-Type": config?.headers?.["Content-Type"] || "application/json",
      "X-Workspace-Id": config?.headers?.["X-Workspace-Id"] || undefined,
    },
  };
  const rows = readOfflineQueue();
  rows.push(entry);
  writeOfflineQueue(rows);
  return entry;
}

function canQueueRequest(config) {
  const method = String(config?.method || "get").toLowerCase();
  if (!MUTATION_METHODS.has(method)) return false;
  if (!config?.url) return false;
  // Start with booking operations where eventual consistency is acceptable.
  const url = String(config.url);
  return url.startsWith("/api/bookings/");
}

export function getOfflineQueueCount() {
  return readOfflineQueue().length;
}

export function getOfflineQueueItems() {
  return readOfflineQueue();
}

export function clearOfflineQueue() {
  writeOfflineQueue([]);
}

let flushInProgress = false;
export async function flushOfflineQueue() {
  if (flushInProgress) return { flushed: 0, remaining: getOfflineQueueCount() };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { flushed: 0, remaining: getOfflineQueueCount() };
  }
  flushInProgress = true;
  let flushed = 0;
  try {
    const rows = readOfflineQueue();
    const remaining = [];
    for (let i = 0; i < rows.length; i += 1) {
      const item = rows[i];
      try {
        await http.request({
          method: item.method,
          url: item.url,
          data: item.data,
          params: item.params,
          headers: item.headers,
          __fromOfflineQueue: true,
        });
        flushed += 1;
      } catch (err) {
        if (!err?.response) {
          // network still unstable: keep current and remaining items
          remaining.push(item, ...rows.slice(i + 1));
          break;
        }
        // server rejected this queued operation: drop it to avoid a blocked queue
      }
    }
    writeOfflineQueue(remaining);
    return { flushed, remaining: remaining.length };
  } finally {
    flushInProgress = false;
  }
}

function workspaceHeaderForRequest() {
  try {
    const raw = localStorage.getItem("appointly_auth");
    if (!raw) return null;
    const u = JSON.parse(raw)?.user;
    const r = String(u?.role || "").toLowerCase();
    if (r === "tenant") {
      return getStoredWorkspaceId();
    }
    if (r === "staff" && u?.staffBusinessId) {
      return String(u.staffBusinessId);
    }
    return null;
  } catch {
    return null;
  }
}

http.interceptors.request.use((config) => {
  const t = getToken();
  if (t) {
    config.headers.Authorization = `Bearer ${t}`;
  }
  const ws = workspaceHeaderForRequest();
  if (ws) {
    config.headers["X-Workspace-Id"] = ws;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const cfg = error?.config || {};
    const isNetworkFailure = !error?.response;
    if (
      isNetworkFailure &&
      !cfg.__fromOfflineQueue &&
      canQueueRequest(cfg)
    ) {
      const queued = queueOfflineMutation(cfg);
      return Promise.resolve({
        data: {
          queued: true,
          offline: true,
          queueId: queued.id,
          message: "Saved offline and will sync when connection returns.",
        },
        status: 202,
        statusText: "Accepted Offline",
        headers: {},
        config: cfg,
      });
    }
    return Promise.reject(error);
  },
);

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushOfflineQueue().catch(() => {});
  });
}
