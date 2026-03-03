// src/services/apiFootballService.js
// Service to fetch live match data from API-Football

import axios from "axios";
import Match from "../models/match.js";
import { broadcastToMatch } from "../websocket/wsHandlers.js";

/**
 * API-Football Service
 * Fetches live match data and updates database + broadcasts to WebSocket clients
 */

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_HOST = "v3.football.api-sports.io";
const BASE_URL = `https://${API_HOST}`;

const ensureApiKey = () => {
  if (!API_KEY) {
    throw new Error(
      "Missing API_FOOTBALL_KEY environment variable. Set it before syncing live matches.",
    );
  }
};

const getApiHeaders = () => ({
  "x-rapidapi-key": API_KEY,
  "x-rapidapi-host": API_HOST,
});

const formatApiError = (error) => {
  const status = error?.response?.status;
  const rawDetail =
    error?.response?.data?.message || error?.response?.data?.errors || error.message;
  let detail = rawDetail;

  if (rawDetail && typeof rawDetail === "object") {
    try {
      detail = JSON.stringify(rawDetail);
    } catch {
      detail = error.message;
    }
  }

  return status
    ? `API-Football request failed (${status}): ${detail}`
    : `API-Football request failed: ${detail}`;
};

/**
 * Fetch live matches from API-Football
 * @returns {Promise<Array>} - Array of live match data
 */
const fetchLiveMatches = async () => {
  try {
    ensureApiKey();
    const response = await axios.get(`${BASE_URL}/fixtures`, {
      params: { live: "all" },
      headers: getApiHeaders(),
    });

    return response.data.response || [];
  } catch (error) {
    console.error("Error fetching live matches:", formatApiError(error));
    throw error;
  }
};

/**
 * Fetch specific match by ID
 * @param {number} fixtureId - API-Football fixture ID
 * @returns {Promise<Object>} - Match data
 */
const fetchMatchById = async (fixtureId) => {
  try {
    ensureApiKey();
    const response = await axios.get(`${BASE_URL}/fixtures`, {
      params: { id: fixtureId },
      headers: getApiHeaders(),
    });

    return response.data.response[0] || null;
  } catch (error) {
    console.error(`Error fetching match ${fixtureId}:`, formatApiError(error));
    throw error;
  }
};

/**
 * Fetch match events for commentary generation.
 * API-Football returns events from /fixtures/events, not always in /fixtures.
 * @param {number} fixtureId - API-Football fixture ID
 * @returns {Promise<Array>} - Fixture events
 */
const fetchMatchEvents = async (fixtureId) => {
  try {
    ensureApiKey();
    const response = await axios.get(`${BASE_URL}/fixtures/events`, {
      params: { fixture: fixtureId },
      headers: getApiHeaders(),
    });
    return response.data.response || [];
  } catch (error) {
    console.error(`Error fetching fixture events for ${fixtureId}:`, formatApiError(error));
    throw error;
  }
};

/**
 * Transform API-Football data to our database format
 * @param {Object} apiMatch - Match data from API-Football
 * @returns {Object} - Match data in our format
 */
const transformMatchData = (apiMatch) => {
  return {
    team_home: apiMatch.teams.home.name,
    team_away: apiMatch.teams.away.name,
    score_home: apiMatch.goals.home || 0,
    score_away: apiMatch.goals.away || 0,
    status: mapStatus(apiMatch.fixture.status.short),
    start_time: apiMatch.fixture.date,
    api_fixture_id: apiMatch.fixture.id,
  };
};

/**
 * Map API-Football status to our status format
 * @param {string} apiStatus - Status from API (1H, HT, 2H, FT, etc.)
 * @returns {string} - Our status (scheduled, live, finished)
 */
const mapStatus = (apiStatus) => {
  const liveStatuses = ["1H", "2H", "ET", "P", "BT", "LIVE"];
  const finishedStatuses = [
    "FT",
    "AET",
    "PEN",
    "PST",
    "CANC",
    "ABD",
    "AWD",
    "WO",
  ];

  if (liveStatuses.includes(apiStatus)) return "live";
  if (finishedStatuses.includes(apiStatus)) return "finished";
  return "scheduled";
};

/**
 * Generate commentary from match events
 * @param {Array} events - Events from API-Football
 * @returns {Array} - Commentary objects
 */
const generateCommentaryFromEvents = (events) => {
  if (!events) return [];

  return events.map((event) => {
    let message = "";
    let eventType = "general";

    switch (event.type) {
      case "Goal":
        message = `GOAL! ${event?.player?.name || "Unknown player"} scores for ${
          event?.team?.name || "Unknown team"
        }!`;
        eventType = "goal";
        break;
      case "Card":
        message = `${event.detail || "Card"} for ${event?.player?.name || "Unknown player"}`;
        eventType = "card";
        break;
      case "subst":
        message = `Substitution: ${event?.player?.name || "Unknown player"} OFF, ${
          event?.assist?.name || "Unknown player"
        } ON`;
        eventType = "substitution";
        break;
      case "Var":
        message = `VAR: ${event.detail}`;
        eventType = "var";
        break;
      default:
        message = `${event.type}: ${event.detail || ""}`;
    }

    return {
      message,
      event_type: eventType,
      minute: event.time.elapsed,
    };
  });
};

/**
 * Sync live matches from API to database
 * Fetches live matches and updates/creates them in our database
 */
const syncLiveMatches = async () => {
  try {
    console.log("Syncing live matches from API-Football...");

    const liveMatches = await fetchLiveMatches();

    if (liveMatches.length === 0) {
      console.log("No live matches found");
      return { fetched: 0, synced: 0 };
    }

    console.log(`Found ${liveMatches.length} live matches`);
    let synced = 0;

    for (const apiMatch of liveMatches) {
      const match = await syncSingleMatch(apiMatch);
      if (match) synced += 1;
    }

    console.log(`Live matches sync complete (${synced}/${liveMatches.length})`);
    return { fetched: liveMatches.length, synced };
  } catch (error) {
    console.error("Error syncing live matches:", error.message);
    throw error;
  }
};

/**
 * Sync a single match from API to database
 * @param {Object} apiMatch - Match data from API-Football
 */
const syncSingleMatch = async (apiMatch) => {
  try {
    const matchData = transformMatchData(apiMatch);
    const fixtureId = apiMatch?.fixture?.id;

    const existingMatch = await Match.findExistingForSync(
      matchData.team_home,
      matchData.team_away,
      matchData.start_time,
    );

    let match;
    if (existingMatch) {
      await Match.updateScore(existingMatch.id, {
        score_home: matchData.score_home,
        score_away: matchData.score_away,
      });
      await Match.updateStatus(existingMatch.id, matchData.status);
      const refreshedMatch = await Match.getById(existingMatch.id);
      if (!refreshedMatch) {
        throw new Error(`Updated match ${existingMatch.id} could not be reloaded`);
      }
      match = refreshedMatch;
    } else {
      match = await Match.create(matchData);
    }

    console.log(`Synced match: ${matchData.team_home} vs ${matchData.team_away}`);

    // Most live fixture payloads do not include events; query fixture events directly.
    let events = Array.isArray(apiMatch.events) ? apiMatch.events : [];
    if (events.length === 0 && fixtureId) {
      try {
        events = await fetchMatchEvents(fixtureId);
      } catch (err) {
        console.error(`fetchMatchEvents failed for fixtureId ${fixtureId}:`, err);
        events = [];
      }
    }

    if (events.length > 0) {
      const commentaries = generateCommentaryFromEvents(events);

      for (const commentary of commentaries) {
        const alreadyExists = await Match.commentaryExists({
          match_id: match.id,
          ...commentary,
        });
        if (alreadyExists) continue;

        const savedCommentary = await Match.addCommentary({
          match_id: match.id,
          ...commentary,
        });

        // Broadcast to WebSocket subscribers
        broadcastToMatch(match.id, {
          type: "new_commentary",
          data: savedCommentary,
        });
      }
    }

    // Broadcast score update
    broadcastToMatch(match.id, {
      type: "score_update",
      data: match,
    });
    return match;
  } catch (error) {
    console.error("Error syncing match:", error.message);
    return null;
  }
};

/**
 * Start polling for live matches
 * Fetches updates every X seconds
 * @param {number} intervalSeconds - How often to poll (default: 60 seconds)
 */
const startLiveMatchPolling = (intervalSeconds = 60) => {
  console.log(`Starting live match polling (every ${intervalSeconds}s)`);

  // Initial sync
  syncLiveMatches().catch((error) => {
    console.error("Initial syncLiveMatches failed:", error);
  });

  // Set up interval
  const interval = setInterval(syncLiveMatches, intervalSeconds * 1000);

  return interval;
};

/**
 * Stop polling for live matches
 * @param {NodeJS.Timeout} interval - Interval to clear
 */
const stopLiveMatchPolling = (interval) => {
  if (interval) {
    clearInterval(interval);
    console.log("Stopped live match polling");
  }
};

export {
  fetchLiveMatches,
  fetchMatchById,
  fetchMatchEvents,
  syncLiveMatches,
  syncSingleMatch,
  startLiveMatchPolling,
  stopLiveMatchPolling,
  transformMatchData,
  generateCommentaryFromEvents,
};

export default {
  fetchLiveMatches,
  fetchMatchById,
  fetchMatchEvents,
  syncLiveMatches,
  syncSingleMatch,
  startLiveMatchPolling,
  stopLiveMatchPolling,
  transformMatchData,
  generateCommentaryFromEvents,
};
