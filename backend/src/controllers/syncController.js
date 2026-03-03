// src/controllers/syncController.js
// Controller for syncing data from external APIs

import apiFootballService from "../services/api.js";

/**
 * Manually trigger live match sync
 * GET /api/sync/live-matches
 */
const syncLiveMatches = async (req, res, next) => {
  try {
    const result = await apiFootballService.syncLiveMatches();
    const summary = {
      totalSynced: 0,
      totalFetched: 0,
      fixtureIds: [],
      errors: [],
    };

    if (Array.isArray(result)) {
      summary.totalSynced = result.length;
      summary.fixtureIds = result
        .map((item) => item?.fixtureId ?? item?.fixture?.id ?? item?.id)
        .filter(Boolean);
    } else if (result && typeof result === "object") {
      summary.totalSynced = Number(result.synced ?? result.syncedCount ?? 0);
      summary.totalFetched = Number(result.fetched ?? result.total ?? 0);

      if (Array.isArray(result.fixtureIds)) {
        summary.fixtureIds = result.fixtureIds.filter(Boolean);
      } else if (Array.isArray(result.items)) {
        summary.fixtureIds = result.items
          .map((item) => item?.fixtureId ?? item?.fixture?.id ?? item?.id)
          .filter(Boolean);
      }

      if (Array.isArray(result.errors)) {
        summary.errors = result.errors;
      }
    }

    res.json({
      success: true,
      message: "Live matches sync triggered successfully",
      data: summary,
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
