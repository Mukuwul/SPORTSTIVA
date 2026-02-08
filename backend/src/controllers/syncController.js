// src/controllers/syncController.js
// Controller for syncing data from external APIs

import apiFootballService from "../services/api.js";

/**
 * Manually trigger live match sync
 * GET /api/sync/live-matches
 */
const syncLiveMatches = async (req, res, next) => {
  try {
    await apiFootballService.syncLiveMatches();

    res.json({
      success: true,
      message: "Live matches sync triggered successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fetch and sync a specific match by API fixture ID
 * POST /api/sync/match/:fixtureId
 */
const syncMatchById = async (req, res, next) => {
  try {
    const { fixtureId } = req.params;

    const apiMatch = await apiFootballService.fetchMatchById(fixtureId);

    if (!apiMatch) {
      return res.status(404).json({
        success: false,
        message: "Match not found in API",
      });
    }

    await apiFootballService.syncSingleMatch(apiMatch);

    res.json({
      success: true,
      message: `Match ${fixtureId} synced successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get raw live matches from API (without saving)
 * GET /api/sync/preview-live
 */
const previewLiveMatches = async (req, res, next) => {
  try {
    const liveMatches = await apiFootballService.fetchLiveMatches();

    const preview = liveMatches.map((match) => ({
      id: match.fixture.id,
      teams: `${match.teams.home.name} vs ${match.teams.away.name}`,
      score: `${match.goals.home} - ${match.goals.away}`,
      status: match.fixture.status.short,
      elapsed: match.fixture.status.elapsed,
      league: match.league.name,
    }));

    res.json({
      success: true,
      count: preview.length,
      data: preview,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  syncLiveMatches,
  syncMatchById,
  previewLiveMatches,
};
