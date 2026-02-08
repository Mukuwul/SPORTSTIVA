// src/routes/syncRoutes.js
// Routes for syncing data from external APIs

import express from "express";
const router = express.Router();
import syncController from "../controllers/syncController.js";

/**
 * Sync Routes
 * All routes are prefixed with /api/sync
 */

// Preview live matches from API (without saving)
router.get("/preview-live", syncController.previewLiveMatches);

// Trigger manual sync of all live matches
router.post("/live-matches", syncController.syncLiveMatches);

// Sync specific match by fixture ID
router.post("/match/:fixtureId", syncController.syncMatchById);

export default router;
