// src/server.js
// Main server file - Entry point for the application
// Initializes Express server and WebSocket server

import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "http";
import { pool } from "./config/db.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import matchRoutes from "./routes/matchRoutes.js";
import { getStats } from "./websocket/wsHandlers.js";
import {
  initWebSocketServer,
  shutdownWebSocketServer,
} from "./websocket/wsServer.js";

/**
 * Initialize Express Application
 */
const app = express();
const PORT = process.env.PORT || 5000;

/**
 * Middleware Setup
 */

// Enable CORS for cross-origin requests
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.ALLOWED_ORIGINS?.split(",")
        : "*",
    credentials: true,
  }),
);

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

/**
 * API Routes
 */

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// WebSocket statistics endpoint
app.get("/api/ws-stats", (req, res) => {
  const stats = getStats();
  res.json({
    success: true,
    data: stats,
  });
});

// Match routes
app.use("/api/matches", matchRoutes);

/**
 * Error Handling
 */

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

/**
 * Create HTTP Server
 * We need an HTTP server instance to attach WebSocket to
 */
const server = http.createServer(app);

/**
 * Initialize WebSocket Server
 * Attach WebSocket server to HTTP server
 */
const wss = initWebSocketServer(server);

/**
 * Start Server
 */
server.listen(PORT, () => {
  console.log("=================================");
  console.log("🚀 Sportz WebSocket Server");
  console.log("=================================");
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}/ws`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("=================================");
});

/**
 * Graceful Shutdown Handling
 * Properly close connections when server is terminated
 */
const shutdown = () => {
  console.log("\n🛑 Received shutdown signal...");

  // Close WebSocket server first
  shutdownWebSocketServer(wss);

  // Close HTTP server
  server.close(() => {
    console.log("✅ HTTP server closed");

    // Close database connections
    pool.end(() => {
      console.log("✅ Database pool closed");
      console.log("👋 Server shutdown complete");
      process.exit(0);
    });
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error("⚠️  Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/**
 * Handle uncaught exceptions
 */
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  shutdown();
});

/**
 * Handle unhandled promise rejections
 */
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  shutdown();
});

export { app, server, wss };
