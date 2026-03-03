export const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const API_BASE_STORAGE_KEY = "sportstiva.api.base";
const encodePathSegment = (value) => encodeURIComponent(String(value));

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
  let stored;
  try {
    stored = localStorage.getItem(API_BASE_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to read API base from localStorage:", error);
  }
  return normalizeApiBase(stored) || DEFAULT_API_BASE;
}

export function saveApiBase(base) {
  const normalized = normalizeApiBase(base);
  if (!normalized) return "";
  try {
    localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
    return normalized;
  } catch (error) {
    console.error("Failed to save API base to localStorage:", error);
    return "";
  }
}

async function request(apiBase, path, { method = "GET", body, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${method} ${path} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

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
    return request(apiBase, `/api/matches/${encodePathSegment(matchId)}`);
  },
  createMatch(apiBase, body) {
    return request(apiBase, "/api/matches", { method: "POST", body });
  },
  updateScore(apiBase, matchId, body) {
    return request(apiBase, `/api/matches/${encodePathSegment(matchId)}/score`, {
      method: "PATCH",
      body,
    });
  },
  updateStatus(apiBase, matchId, body) {
    return request(apiBase, `/api/matches/${encodePathSegment(matchId)}/status`, {
      method: "PATCH",
      body,
    });
  },
  deleteMatch(apiBase, matchId) {
    return request(apiBase, `/api/matches/${encodePathSegment(matchId)}`, {
      method: "DELETE",
    });
  },
  getCommentary(apiBase, matchId, limit = 100) {
    const query = new URLSearchParams({ limit: String(limit) }).toString();
    return request(
      apiBase,
      `/api/matches/${encodePathSegment(matchId)}/commentary?${query}`,
    );
  },
  addCommentary(apiBase, matchId, body) {
    return request(apiBase, `/api/matches/${encodePathSegment(matchId)}/commentary`, {
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
    return request(apiBase, `/api/sync/match/${encodePathSegment(fixtureId)}`, {
      method: "POST",
    });
  },
};
