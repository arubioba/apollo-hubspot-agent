import { config } from "./config.js";
import { HubSpotWriteBlockedError } from "./errors.js";
import { logger } from "./logger.js";

export function assertHubSpotWriteAllowed(action, metadata = {}) {
  if (config.writeMode === "enabled") return true;
  logger.warn("authorization.denied", "HubSpot write blocked by ARA_WRITE_MODE.", {
    action,
    writeMode: config.writeMode,
    ...metadata
  });
  throw new HubSpotWriteBlockedError(`HubSpot write blocked because ARA_WRITE_MODE=${config.writeMode}.`);
}

export function isPreviewMode() {
  return config.writeMode === "preview";
}

