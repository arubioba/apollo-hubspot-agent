import crypto from "node:crypto";
import { config } from "./config.js";
import { AuthenticationError } from "./errors.js";
import { logger } from "./logger.js";

const HEADER = "x-ara-admin-token";

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeToken(value) {
  return String(value || "").trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
}

export function requireInternalAuth(req) {
  if (!config.adminToken) {
    logger.warn("authorization.denied", "Admin token is not configured.");
    throw new AuthenticationError("Internal authentication is not configured.", { status: 503 });
  }
  const token = normalizeToken(req.get(HEADER));
  if (!token || !safeEqual(token, config.adminToken)) {
    logger.warn("authorization.denied", "Invalid or missing admin token.", {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    throw new AuthenticationError("Invalid or missing internal authentication token.");
  }
}

export const adminAuthHeader = HEADER;

