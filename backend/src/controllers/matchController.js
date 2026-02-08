// src/controllers/matchController.js
// Controller handling HTTP requests for match operations

import Match from "../models/match.js";
import { broadcastToMatch } from "../websocket/wsHandlers.js";

/**
 * Match Controller
 * Handles all HTTP endpoints related to matches and commentary
 */

/**
 * GET /api/matches
 * Get all matches
 */
const getAllMatches = async (req, res, next) => {
  try {
    const matches = await Match.getAll();
    res.json({
      success: true,
      data: matches,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/matches/live
 * Get all live matches
 */
const getLiveMatches = async (req, res, next) => {
  try {
    const matches = await Match.getLiveMatches();
    res.json({
      success: true,
      data: matches,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/matches/:id
 * Get a single match by ID
 */
const getMatchById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = await Match.getById(id);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    res.json({
      success: true,
      data: match,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/matches
 * Create a new match
 */
const createMatch = async (req, res, next) => {
  try {
    const { team_home, team_away, start_time } = req.body;

    // Validation
    if (!team_home || !team_away) {
      return res.status(400).json({
        success: false,
        message: "Team names are required",
      });
    }

    const match = await Match.create({ team_home, team_away, start_time });

    res.status(201).json({
      success: true,
      data: match,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/matches/:id/score
 * Update match score
 */
const updateScore = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { score_home, score_away } = req.body;

    // Validation
    if (score_home === undefined || score_away === undefined) {
      return res.status(400).json({
        success: false,
        message: "Both scores are required",
      });
    }

    const match = await Match.updateScore(id, { score_home, score_away });

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // Broadcast score update to WebSocket subscribers
    broadcastToMatch(id, {
      type: "score_update",
      data: match,
    });

    res.json({
      success: true,
      data: match,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/matches/:id/status
 * Update match status
 */
const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validation
    const validStatuses = ["scheduled", "live", "finished"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const match = await Match.updateStatus(id, status);

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // Broadcast status update to WebSocket subscribers
    broadcastToMatch(id, {
      type: "status_update",
      data: match,
    });

    res.json({
      success: true,
      data: match,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/matches/:id
 * Delete a match
 */
const deleteMatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Match.delete(id);

    res.json({
      success: true,
      message: "Match deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/matches/:id/commentary
 * Get commentary for a specific match
 */
const getCommentary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const commentary = await Match.getCommentary(id, limit);

    res.json({
      success: true,
      data: commentary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/matches/:id/commentary
 * Add commentary to a match
 */
const addCommentary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, event_type, minute } = req.body;

    // Validation
    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Commentary message is required",
      });
    }

    const commentary = await Match.addCommentary({
      match_id: id,
      message,
      event_type,
      minute,
    });

    // Broadcast new commentary to WebSocket subscribers
    broadcastToMatch(id, {
      type: "new_commentary",
      data: commentary,
    });

    res.status(201).json({
      success: true,
      data: commentary,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getAllMatches,
  getLiveMatches,
  getMatchById,
  createMatch,
  updateScore,
  updateStatus,
  deleteMatch,
  getCommentary,
  addCommentary,
};
