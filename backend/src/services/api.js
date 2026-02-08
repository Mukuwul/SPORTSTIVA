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

/**
 * Fetch live matches from API-Football
 * @returns {Promise<Array>} - Array of live match data
 */
const fetchLiveMatches = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/fixtures`, {
      params: { live: "all" },
      headers: {
        "x-rapidapi-key": API_KEY,
        "x-rapidapi-host": API_HOST,
      },
    });

    return response.data.response || [];
  } catch (error) {
    console.error("❌ Error fetching live matches:", error.message);
    return [];
  }
};

/**
 * Fetch specific match by ID
 * @param {number} fixtureId - API-Football fixture ID
 * @returns {Promise<Object>} - Match data
 */
const fetchMatchById = async (fixtureId) => {
  try {
    const response = await axios.get(`${BASE_URL}/fixtures`, {
      params: { id: fixtureId },
      headers: {
        "x-rapidapi-key": API_KEY,
        "x-rapidapi-host": API_HOST,
      },
    });

    return response.data.response[0] || null;
  } catch (error) {
    console.error(`❌ Error fetching match ${fixtureId}:`, error.message);
    return null;
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
    // Store API fixture ID for reference
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
        message = `⚽ GOAL! ${event.player.name} scores for ${event.team.name}!`;
        eventType = "goal";
        break;
      case "Card":
        const cardEmoji = event.detail === "Yellow Card" ? "🟨" : "🟥";
        message = `${cardEmoji} ${event.detail} for ${event.player.name}`;
        eventType = "card";
        break;
      case "subst":
        message = `🔄 Substitution: ${event.player.name} OFF, ${event.assist.name} ON`;
        eventType = "substitution";
        break;
      case "Var":
        message = `📹 VAR: ${event.detail}`;
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
    console.log("🔄 Syncing live matches from API-Football...");

    const liveMatches = await fetchLiveMatches();

    if (liveMatches.length === 0) {
      console.log("📭 No live matches found");
      return;
    }

    console.log(`📊 Found ${liveMatches.length} live matches`);

    for (const apiMatch of liveMatches) {
      await syncSingleMatch(apiMatch);
    }

    console.log("✅ Live matches sync complete");
  } catch (error) {
    console.error("❌ Error syncing live matches:", error);
  }
};

/**
 * Sync a single match from API to database
 * @param {Object} apiMatch - Match data from API-Football
 */
const syncSingleMatch = async (apiMatch) => {
  try {
    const matchData = transformMatchData(apiMatch);

    // Check if match exists in our database by API fixture ID
    // For now, we'll create it if it doesn't exist
    // In production, you'd store api_fixture_id and query by it

    const match = await Match.create(matchData);

    console.log(
      `✅ Synced match: ${matchData.team_home} vs ${matchData.team_away}`,
    );

    // Generate and add commentary from events
    if (apiMatch.events && apiMatch.events.length > 0) {
      const commentaries = generateCommentaryFromEvents(apiMatch.events);

      for (const commentary of commentaries) {
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
  } catch (error) {
    console.error("❌ Error syncing match:", error);
  }
};

/**
 * Start polling for live matches
 * Fetches updates every X seconds
 * @param {number} intervalSeconds - How often to poll (default: 60 seconds)
 */
const startLiveMatchPolling = (intervalSeconds = 60) => {
  console.log(`🚀 Starting live match polling (every ${intervalSeconds}s)`);

  // Initial sync
  syncLiveMatches();

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
    console.log("🛑 Stopped live match polling");
  }
};

export {
  fetchLiveMatches,
  fetchMatchById,
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
  syncLiveMatches,
  syncSingleMatch,
  startLiveMatchPolling,
  stopLiveMatchPolling,
  transformMatchData,
  generateCommentaryFromEvents,
};
