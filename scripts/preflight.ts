import "dotenv/config";
import { assertDeployment } from "../src/lib/operations/config";
try { assertDeployment(); console.log("Deployment configuration passed; operational approval and external acceptance remain required."); }
catch { console.error("DEPLOYMENT_PREFLIGHT_FAILED: check deployment runbook; no secrets logged."); process.exitCode = 1; }
