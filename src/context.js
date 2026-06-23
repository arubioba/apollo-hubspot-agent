import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";

const storage = new AsyncLocalStorage();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidCorrelationId(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function createCorrelationId(value) {
  return isValidCorrelationId(value) ? value : crypto.randomUUID();
}

export function runWithContext(context, fn) {
  return storage.run(context, fn);
}

export function getContext() {
  return storage.getStore() || {};
}

export function getCorrelationId() {
  return getContext().correlationId;
}

