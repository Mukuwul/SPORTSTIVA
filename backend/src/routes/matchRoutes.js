// src/routes/matchRoutes.js
// Define all HTTP routes for match operations

import express from "express";
const router = express.Router();
import matchController from "../controllers/matchController.js";

/**
 *
 * Match Routes
 * All routes are prefixed with /api/matches
 *
 */
// Get all matches
router.get("/", matchController.getAllMatches);

// Get live matches only
router.get("/live", matchController.getLiveMatches);

// Get specific match by ID
router.get("/:id", matchController.getMatchById);

// Create a new match
router.post("/", matchController.createMatch);

// Update match score
router.patch("/:id/score", matchController.updateScore);

// Update match status
router.patch("/:id/status", matchController.updateStatus);

// Delete a match
router.delete("/:id", matchController.deleteMatch);

// Get commentary for a specific match
router.get("/:id/commentary", matchController.getCommentary);

// Add commentary to a match
router.post("/:id/commentary", matchController.addCommentary);

export default router;
