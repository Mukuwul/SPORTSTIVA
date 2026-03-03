import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  api,
  deriveWsUrl,
  loadApiBase,
  normalizeApiBase,
  normalizeWsUrl,
  saveApiBase,
} from "./services/api";

const WS_STORAGE_KEY = "sportstiva.ws.url";
const REFRESH_MS = 20000;
const COMMENTARY_POLL_MS = 12000;

function App() {
  const [apiBase, setApiBase] = useState(loadApiBase());
  const [apiInput, setApiInput] = useState(loadApiBase());
  const [wsInput, setWsInput] = useState(
    localStorage.getItem(WS_STORAGE_KEY) || deriveWsUrl(loadApiBase()),
  );

  const [apiStatus, setApiStatus] = useState("Checking...");
  const [wsStatus, setWsStatus] = useState("Disconnected");
  const [isLoading, setIsLoading] = useState(true);
  const [referenceTime, setReferenceTime] = useState(() => Date.now());

  const [allMatches, setAllMatches] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [selectedLiveMatchId, setSelectedLiveMatchId] = useState(null);
  const [commentary, setCommentary] = useState([]);

  const wsRef = useRef(null);
  const subscribedMatchRef = useRef(null);

  const [upcomingMatches, pastMatches] = useMemo(() => {
    const sortedByStart = [...allMatches].sort((a, b) => {
      const first = new Date(a.start_time || 0).getTime();
      const second = new Date(b.start_time || 0).getTime();
      return first - second;
    });

    const upcoming = [];
    const past = [];

    for (const match of sortedByStart) {
      const status = String(match.status || "").toLowerCase();
      const start = new Date(match.start_time || 0).getTime();

      if (status === "scheduled" && start >= referenceTime) {
        upcoming.push(match);
      } else if (status === "finished" || (status !== "live" && start < referenceTime)) {
        past.push(match);
      }
    }

    past.sort((a, b) => {
      const first = new Date(a.start_time || 0).getTime();
      const second = new Date(b.start_time || 0).getTime();
      return second - first;
    });

    return [upcoming.slice(0, 4), past.slice(0, 4)];
  }, [allMatches, referenceTime]);

  async function refreshAll() {
    setIsLoading(true);
    setReferenceTime(Date.now());
    await Promise.allSettled([checkHealth(), loadMatches()]);
    setIsLoading(false);
  }

  async function checkHealth() {
    try {
      const health = await api.getHealth(apiBase);
      setApiStatus(health.message || "Online");
    } catch {
      setApiStatus("Offline");
    }
  }

  async function loadMatches() {
    try {
      const [allResponse, liveResponse] = await Promise.all([
        api.getMatches(apiBase),
        api.getLiveMatches(apiBase),
      ]);

      const all = Array.isArray(allResponse.data) ? allResponse.data : [];
      const live = Array.isArray(liveResponse.data) ? liveResponse.data : [];

      setAllMatches(all);
      setLiveMatches(live.slice(0, 4));

      if (
        selectedLiveMatchId &&
        !live.some((match) => Number(match.id) === Number(selectedLiveMatchId))
      ) {
        setSelectedLiveMatchId(null);
        setCommentary([]);
      }
    } catch {
      setAllMatches([]);
      setLiveMatches([]);
    }
  }

  async function loadCommentary(matchId) {
    if (!matchId) return;
    try {
      const response = await api.getCommentary(apiBase, matchId, 100);
      setCommentary(Array.isArray(response.data) ? response.data : []);
    } catch {
      setCommentary([]);
    }
  }

  async function handleSyncLiveNow() {
    try {
      await api.syncLive(apiBase);
      await refreshAll();
    } catch {
      // No-op on sync failure.
    }
  }

  function handleSaveConnection() {
    const normalizedApi = normalizeApiBase(apiInput);
    if (!normalizedApi) return;

    const normalizedWs = normalizeWsUrl(wsInput) || deriveWsUrl(normalizedApi);
    if (!normalizedWs) return;

    saveApiBase(normalizedApi);
    localStorage.setItem(WS_STORAGE_KEY, normalizedWs);

    setApiBase(normalizedApi);
    setApiInput(normalizedApi);
    setWsInput(normalizedWs);
  }

  function connectSocket() {
    const normalizedWs = normalizeWsUrl(wsInput) || deriveWsUrl(apiBase);
    if (!normalizedWs) return;

    closeSocket(false);
    setWsStatus("Connecting...");

    const ws = new WebSocket(normalizedWs);
    wsRef.current = ws;
    localStorage.setItem(WS_STORAGE_KEY, normalizedWs);
    setWsInput(normalizedWs);

    ws.onopen = () => {
      setWsStatus("Connected");
      if (selectedLiveMatchId) {
        subscribeToMatch(selectedLiveMatchId);
      }
    };

    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      handleWsMessage(message);
    };

    ws.onclose = () => {
      setWsStatus("Disconnected");
      subscribedMatchRef.current = null;
    };

    ws.onerror = () => {
      setWsStatus("Error");
    };
  }

  function closeSocket(updateStatus = true) {
    if (!wsRef.current) return;

    try {
      if (wsRef.current.readyState === WebSocket.OPEN && subscribedMatchRef.current) {
        wsRef.current.send(
          JSON.stringify({
            type: "unsubscribe",
            matchId: Number(subscribedMatchRef.current),
          }),
        );
      }
      wsRef.current.close();
    } catch {
      // Best effort close.
    }

    wsRef.current = null;
    subscribedMatchRef.current = null;
    if (updateStatus) setWsStatus("Disconnected");
  }

  function subscribeToMatch(matchId) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    if (
      subscribedMatchRef.current &&
      Number(subscribedMatchRef.current) !== Number(matchId)
    ) {
      unsubscribeFromMatch(subscribedMatchRef.current);
    }

    wsRef.current.send(
      JSON.stringify({
        type: "subscribe",
        matchId: Number(matchId),
      }),
    );

    subscribedMatchRef.current = Number(matchId);
  }

  function unsubscribeFromMatch(matchId) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !matchId) return;
    wsRef.current.send(
      JSON.stringify({
        type: "unsubscribe",
        matchId: Number(matchId),
      }),
    );
    subscribedMatchRef.current = null;
  }

  function handleWsMessage(message) {
    const type = String(message?.type || "");

    if (type === "score_update" || type === "status_update") {
      if (message.data) {
        setAllMatches((current) => mergeMatch(current, message.data));
        setLiveMatches((current) => mergeLiveMatch(current, message.data));
      }
      return;
    }

    if (type === "new_commentary" && message.data) {
      if (Number(selectedLiveMatchId) === Number(message.data.match_id)) {
        setCommentary((current) => [...current, message.data]);
      }
      return;
    }

    if (type === "server_shutdown") {
      setWsStatus("Server Shutdown");
    }
  }

  useEffect(() => {
    refreshAll();
    connectSocket();

    const refreshInterval = setInterval(refreshAll, REFRESH_MS);
    return () => {
      clearInterval(refreshInterval);
      closeSocket(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  useEffect(() => {
    if (!selectedLiveMatchId) {
      setCommentary([]);
      if (subscribedMatchRef.current) {
        unsubscribeFromMatch(subscribedMatchRef.current);
      }
      return;
    }

    loadCommentary(selectedLiveMatchId);
    subscribeToMatch(selectedLiveMatchId);

    const interval = setInterval(
      () => loadCommentary(selectedLiveMatchId),
      COMMENTARY_POLL_MS,
    );
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLiveMatchId, apiBase]);

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">SPORTSTIVA</p>
          <h1>Real-Time Sports Updates</h1>
          <p className="subline">
            Live, upcoming, and past matches with instant commentary for live games.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={refreshAll}>
            Refresh
          </button>
          <button className="btn btn-accent" onClick={handleSyncLiveNow}>
            Sync Live
          </button>
        </div>
      </header>

      <main className="grid">
        <section className="panel panel-wide">
          <h2>Connection</h2>
          <div className="row row-2">
            <label>
              API Base URL
              <input
                value={apiInput}
                onChange={(event) => setApiInput(event.target.value)}
                placeholder="http://localhost:5000"
              />
            </label>
            <label>
              WebSocket URL
              <input
                value={wsInput}
                onChange={(event) => setWsInput(event.target.value)}
                placeholder="ws://localhost:5000/ws"
              />
            </label>
          </div>
          <div className="actions">
            <button className="btn btn-secondary" onClick={handleSaveConnection}>
              Save
            </button>
            <button className="btn btn-accent" onClick={connectSocket}>
              Connect
            </button>
            <button className="btn btn-danger" onClick={() => closeSocket()}>
              Disconnect
            </button>
          </div>
          <p className="status-line">
            API <span className={`pill ${apiStatus === "Offline" ? "pill-bad" : "pill-ok"}`}>{apiStatus}</span>
            WS{" "}
            <span
              className={`pill ${
                wsStatus === "Connected"
                  ? "pill-live"
                  : wsStatus.includes("Error") || wsStatus.includes("Shutdown")
                    ? "pill-bad"
                    : "pill-neutral"
              }`}
            >
              {wsStatus}
            </span>
          </p>
        </section>

        <section className="panel panel-tall">
          <div className="panel-head">
            <h2>Live Matches</h2>
            <span className="pill pill-live">Showing {liveMatches.length}/4</span>
          </div>
          <div className="list">
            {isLoading && <p className="muted">Loading live matches...</p>}
            {!isLoading && liveMatches.length === 0 && (
              <p className="muted">No live matches right now.</p>
            )}
            {liveMatches.map((match) => (
              <article
                className={`match clickable ${
                  Number(match.id) === Number(selectedLiveMatchId) ? "match-selected" : ""
                }`}
                key={match.id}
                onClick={() => setSelectedLiveMatchId(match.id)}
              >
                <div>
                  <h4>
                    {teamName(match.home_team, match.team_home)} vs{" "}
                    {teamName(match.away_team, match.team_away)}
                  </h4>
                  <p className="small">{formatDate(match.start_time)}</p>
                </div>
                <div className="score-block">
                  <span>
                    {asNumber(match.home_score, 0)} - {asNumber(match.away_score, 0)}
                  </span>
                  <small>{match.status || "live"}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel panel-tall">
          <div className="panel-head">
            <h2>Upcoming Matches</h2>
            <span className="pill pill-neutral">Showing {upcomingMatches.length}/4</span>
          </div>
          <div className="list">
            {!isLoading && upcomingMatches.length === 0 && (
              <p className="muted">No upcoming matches available.</p>
            )}
            {upcomingMatches.map((match) => (
              <article className="match" key={match.id}>
                <div>
                  <h4>
                    {teamName(match.home_team, match.team_home)} vs{" "}
                    {teamName(match.away_team, match.team_away)}
                  </h4>
                  <p className="small">{formatDate(match.start_time)}</p>
                </div>
                <div className="score-block">
                  <span>
                    {asNumber(match.home_score, 0)} - {asNumber(match.away_score, 0)}
                  </span>
                  <small>{match.status || "scheduled"}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel panel-tall">
          <div className="panel-head">
            <h2>Past Matches</h2>
            <span className="pill pill-neutral">Showing {pastMatches.length}/4</span>
          </div>
          <div className="list">
            {!isLoading && pastMatches.length === 0 && (
              <p className="muted">No past matches available.</p>
            )}
            {pastMatches.map((match) => (
              <article className="match" key={match.id}>
                <div>
                  <h4>
                    {teamName(match.home_team, match.team_home)} vs{" "}
                    {teamName(match.away_team, match.team_away)}
                  </h4>
                  <p className="small">{formatDate(match.start_time)}</p>
                </div>
                <div className="score-block">
                  <span>
                    {asNumber(match.home_score, 0)} - {asNumber(match.away_score, 0)}
                  </span>
                  <small>{match.status || "finished"}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        {selectedLiveMatchId && (
          <section className="panel panel-wide panel-commentary">
            <div className="panel-head">
              <h2>Live Commentary</h2>
              <button
                className="btn btn-secondary"
                onClick={() => loadCommentary(selectedLiveMatchId)}
              >
                Reload
              </button>
            </div>
            <p className="subline">
              Match #{selectedLiveMatchId} selected. Commentary updates in real time.
            </p>
            <div className="list commentary-list">
              {commentary.length === 0 && (
                <p className="muted">No commentary available yet for this match.</p>
              )}
              {commentary.map((item) => (
                <article className="comment" key={item.id}>
                  <div className="comment-head">
                    <span>{item.event_type || "general"}</span>
                    <small>
                      {item.minute ?? "NA"} min | {formatDate(item.created_at)}
                    </small>
                  </div>
                  <p>{item.message}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {!selectedLiveMatchId && (
          <section className="panel panel-wide empty-state">
            <h2>Live Commentary</h2>
            <p className="muted">
              Click any live match card to open commentary for that match.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

function teamName(primary, fallback) {
  return primary || fallback || "Unknown Team";
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDate(value) {
  if (!value) return "NA";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "NA";
  return date.toLocaleString();
}

function mergeMatch(current, updated) {
  const id = Number(updated.id);
  const next = current.filter((item) => Number(item.id) !== id);
  next.unshift(updated);
  return next;
}

function mergeLiveMatch(current, updated) {
  const status = String(updated.status || "").toLowerCase();
  const id = Number(updated.id);
  const filtered = current.filter((item) => Number(item.id) !== id);
  if (status === "live") {
    filtered.unshift(updated);
  }
  return filtered.slice(0, 4);
}

export default App;
