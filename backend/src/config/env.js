// Load environment variables from both backend/.env and project-root/.env.
// This keeps local scripts working regardless of where `npm run dev` is executed.

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendEnvPath = path.resolve(__dirname, "../../.env");
const rootEnvPath = path.resolve(__dirname, "../../../.env");

const backendEnvResult = dotenv.config({ path: backendEnvPath });
if (backendEnvResult.error || !backendEnvResult.parsed) {
  console.warn(
    `[env] Could not load env file at ${backendEnvPath}${backendEnvResult.error ? `: ${backendEnvResult.error.message}` : ""}`,
  );
}

const rootEnvResult = dotenv.config({ path: rootEnvPath, override: false });
if (rootEnvResult.error || !rootEnvResult.parsed) {
  console.warn(
    `[env] Could not load env file at ${rootEnvPath}${rootEnvResult.error ? `: ${rootEnvResult.error.message}` : ""}`,
  );
}
