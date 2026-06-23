export class AppError extends Error {
  constructor(message, { code, status = 400, expose = true, cause, metadata = {} } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code || this.constructor.name;
    this.status = status;
    this.expose = expose;
    this.metadata = metadata;
  }
}

export class ConfigurationError extends AppError {
  constructor(message, options = {}) {
    super(message, { code: "CONFIGURATION_ERROR", status: 503, ...options });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required.", options = {}) {
    super(message, { code: "AUTHENTICATION_ERROR", status: 401, ...options });
  }
}

export class ApolloError extends AppError {
  constructor(message, options = {}) {
    super(message, { code: "APOLLO_ERROR", status: 502, expose: false, ...options });
  }
}

export class ApolloRateLimitError extends ApolloError {
  constructor(message = "Apollo rate limit exceeded.", options = {}) {
    super(message, { code: "APOLLO_RATE_LIMIT_ERROR", status: 429, ...options });
  }
}

export class HubSpotError extends AppError {
  constructor(message, options = {}) {
    super(message, { code: "HUBSPOT_ERROR", status: 502, expose: false, ...options });
  }
}

export class HubSpotWriteBlockedError extends AppError {
  constructor(message = "HubSpot write blocked by ARA_WRITE_MODE.", options = {}) {
    super(message, { code: "HUBSPOT_WRITE_BLOCKED", status: 403, ...options });
  }
}

export class DatabaseError extends AppError {
  constructor(message, options = {}) {
    super(message, { code: "DATABASE_ERROR", status: 500, expose: false, ...options });
  }
}

export class ValidationError extends AppError {
  constructor(message, options = {}) {
    super(message, { code: "VALIDATION_ERROR", status: 400, ...options });
  }
}

export class UnexpectedError extends AppError {
  constructor(message = "Unexpected error.", options = {}) {
    super(message, { code: "UNEXPECTED_ERROR", status: 500, expose: false, ...options });
  }
}

export function toPublicError(error, correlationId) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = error?.code || "UNEXPECTED_ERROR";
  const message = error?.expose === true ? error?.message || "Unexpected server error." : "Unexpected server error.";
  return {
    status,
    body: {
      error: { code, message },
      correlation_id: correlationId
    }
  };
}
