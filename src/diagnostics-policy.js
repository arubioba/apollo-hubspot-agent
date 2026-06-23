import { AppError } from "./errors.js";

export class DiagnosticsDisabledError extends AppError {
  constructor() {
    super("Diagnostics are disabled.", {
      code: "DIAGNOSTICS_DISABLED",
      status: 404,
      expose: true
    });
  }
}

export function assertDiagnosticsAllowed(config) {
  if (config.diagnosticsEnabled) return;
  throw new DiagnosticsDisabledError();
}

