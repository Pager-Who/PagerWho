import "dotenv/config";

import type { Server } from "node:http";

import { createApp } from "./app";
import { readCopilotConfig } from "./copilot/model-client";
import { apiLogger } from "./logger";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const app = createApp();

const copilot = readCopilotConfig();
if (copilot.status === "invalid") {
  // Problems name variables only; values (including API keys) are never logged.
  apiLogger.warn("Copilot is disabled: model provider configuration is incomplete or invalid", { problems: copilot.problems });
} else {
  apiLogger.info(copilot.status === "configured" ? "Copilot enabled" : "Copilot disabled: no model provider configured",
    copilot.status === "configured" ? { api_format: copilot.config.apiFormat, model: copilot.config.model } : {});
}

const server = app.listen(port, host, () => {
  apiLogger.info("API listening", {
    host,
    port,
    url: `http://${host}:${port}`,
  });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    apiLogger.error("API port is already in use", { host, port });
  } else {
    apiLogger.error("API server failed", { error });
  }
  process.exit(1);
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  apiLogger.info("API shutting down", { signal });

  closeServer(server);
}

function closeServer(httpServer: Server) {
  httpServer.close((error) => {
    if (error) {
      apiLogger.error("API shutdown failed", { error });
      process.exit(1);
    }
    process.exit(0);
  });
  httpServer.closeIdleConnections();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
