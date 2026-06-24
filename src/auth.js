import crypto from "node:crypto";
import { config } from "./config.js";
import { AuthenticationError } from "./errors.js";
import { logger } from "./logger.js";

const HEADER = "x-ara-admin-token";
const SESSION_HEADER = "x-ara-session-token";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeToken(value) {
  return String(value || "").trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
}

function sign(value) {
  return crypto.createHmac("sha256", config.adminToken).update(value).digest("base64url");
}

function createSignedSession(email, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    email,
    exp: now + SESSION_TTL_MS
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySignedSession(token, now = Date.now()) {
  const [payload, signature] = normalizeToken(token).split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const activeOperator = config.operatorUsers.some(user => user.email === body.email);
    return activeOperator && Number(body.exp) > now;
  } catch {
    return false;
  }
}

export function createOperatorSession({ email, password } = {}) {
  if (!config.operatorUsers.length) {
    logger.warn("authorization.denied", "Operator credentials are not configured.");
    throw new AuthenticationError("Operator authentication is not configured.", { status: 503 });
  }
  const normalizedEmail = normalizeToken(email).toLowerCase();
  const normalizedPassword = normalizeToken(password);
  const operator = config.operatorUsers.find(user => safeEqual(normalizedEmail, user.email));
  if (!operator || !safeEqual(normalizedPassword, operator.password)) {
    logger.warn("authorization.denied", "Invalid operator credentials.");
    throw new AuthenticationError("Invalid operator credentials.");
  }
  const token = createSignedSession(normalizedEmail);
  return {
    session: {
      token,
      operator_email: normalizedEmail,
      expires_in_seconds: Math.floor(SESSION_TTL_MS / 1000)
    }
  };
}

export function requireInternalAuth(req) {
  if (!config.adminToken) {
    logger.warn("authorization.denied", "Admin token is not configured.");
    throw new AuthenticationError("Internal authentication is not configured.", { status: 503 });
  }
  const token = normalizeToken(req.get(HEADER));
  const sessionToken = normalizeToken(req.get(SESSION_HEADER));
  if ((token && safeEqual(token, config.adminToken)) || (sessionToken && verifySignedSession(sessionToken))) {
    return;
  }
  {
    logger.warn("authorization.denied", "Invalid or missing admin token.", {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    throw new AuthenticationError("Invalid or missing internal authentication token.");
  }
}

export const adminAuthHeader = HEADER;
export const sessionAuthHeader = SESSION_HEADER;

