const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const API_BASE_STORAGE_KEY = "sportstiva.api.base";

export function normalizeApiBase(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

export function normalizeWsUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function deriveWsUrl(apiBase) {
  try {
    const url = new URL(apiBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function loadApiBase() {
  const stored = localStorage.getItem(API_BASE_STORAGE_KEY);
  return normalizeApiBase(stored) || DEFAULT_API_BASE;
}

export function saveApiBase(base) {
  const normalized = normalizeApiBase(base);
  if (!normalized) return "";
  localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
  return normalized;
}

async function request(apiBase, path, { method = "GET", body } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `${method} ${path} failed (${response.status})`);
  }
  return payload;
}

export const api = {
  getHealth(apiBase) {
    return request(apiBase, "/health");
  },
  getWsStats(apiBase) {
    return request(apiBase, "/api/ws-stats");
  },
  getMatches(apiBase) {
    return request(apiBase, "/api/matches");
  },
  getLiveMatches(apiBase) {
    return request(apiBase, "/api/matches/live");
  },
  getMatchById(apiBase, matchId) {
    return request(apiBase, `/api/matches/${matchId}`);
  },
  createMatch(apiBase, body) {
    return request(apiBase, "/api/matches", { method: "POST", body });
  },
  updateScore(apiBase, matchId, body) {
    return request(apiBase, `/api/matches/${matchId}/score`, {
      method: "PATCH",
      body,
    });
  },
  updateStatus(apiBase, matchId, body) {
    return request(apiBase, `/api/matches/${matchId}/status`, {
      method: "PATCH",
      body,
    });
  },
  deleteMatch(apiBase, matchId) {
    return request(apiBase, `/api/matches/${matchId}`, { method: "DELETE" });
  },
  getCommentary(apiBase, matchId, limit = 100) {
    return request(apiBase, `/api/matches/${matchId}/commentary?limit=${limit}`);
  },
  addCommentary(apiBase, matchId, body) {
    return request(apiBase, `/api/matches/${matchId}/commentary`, {
      method: "POST",
      body,
    });
  },
  previewLive(apiBase) {
    return request(apiBase, "/api/sync/preview-live");
  },
  syncLive(apiBase) {
    return request(apiBase, "/api/sync/live-matches", { method: "POST" });
  },
  syncFixture(apiBase, fixtureId) {
    return request(apiBase, `/api/sync/match/${fixtureId}`, { method: "POST" });
  },
};
