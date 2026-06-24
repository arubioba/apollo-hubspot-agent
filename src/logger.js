import { config } from "./config.js";
import { getCorrelationId } from "./context.js";

const SECRET_KEYS = /(authorization|token|key|secret|password|credential)/i;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?<!\w)\+?\d[\d\s().-]{7,}\d(?!\w)/g;

export function maskEmail(value) {
  return String(value).replace(EMAIL_RE, email => {
    const [local, domain] = email.split("@");
    return `${local.slice(0, 1)}***@${domain}`;
  });
}

export function maskPhone(value) {
  return String(value).replace(PHONE_RE, phone => {
    const digits = phone.replace(/\D/g, "");
    return digits.length > 4 ? `***${digits.slice(-4)}` : "***";
  });
}

export function sanitize(value, key = "") {
  if (value == null) return value;
  if (SECRET_KEYS.test(key)) return "[REDACTED]";
  if (typeof value === "string") return maskPhone(maskEmail(value));
  if (Array.isArray(value)) return value.map(item => sanitize(item, key));
  if (value instanceof Error) {
    return {
      name: value.name,
      code: value.code,
      message: sanitize(value.message),
      stack: config.nodeEnv === "production" ? undefined : sanitize(value.stack)
    };
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey)]));
  }
  return value;
}

export function log(level, event, message, metadata = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "ara",
    environment: config.nodeEnv,
    correlation_id: metadata.correlationId || getCorrelationId() || null,
    event,
    message,
    duration_ms: metadata.durationMs,
    metadata: sanitize(metadata)
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event, message, metadata) => config.logLevel === "debug" && log("debug", event, message, metadata),
  info: (event, message, metadata) => log("info", event, message, metadata),
  warn: (event, message, metadata) => log("warn", event, message, metadata),
  error: (event, message, metadata) => log("error", event, message, metadata)
};

