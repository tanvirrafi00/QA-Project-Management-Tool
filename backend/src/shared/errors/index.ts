/**
 * Centralized Error Classes
 */

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AIError extends AppError {
  constructor(message: string, public provider?: string) {
    super(message, 503, 'AI_ERROR');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public errors?: Record<string, string[]> | Record<string, string>) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ProcessingError extends AppError {
  constructor(message: string) {
    super(message, 500, 'PROCESSING_ERROR');
  }
}

export class ExportError extends AppError {
  constructor(message: string) {
    super(message, 500, 'EXPORT_ERROR');
  }
}

/* ------------------------------------------------------------------ *
 * HTTP-mapped errors (Migration Roadmap Step 2 / Deliverable 4 §8)
 *
 * These replace the message-regex status sniffing in controllers. Throw one of
 * these from a service; the global error handler (see `errorResponse`) maps
 * `statusCode` straight to the HTTP status, so controllers can just `next(err)`.
 * ------------------------------------------------------------------ */

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMITED');
  }
}

/** Thrown by the orchestrator when a job's cancel signal is set between phases (Phase 6). */
export class JobCancelledError extends AppError {
  constructor(message = 'Generation cancelled') {
    super(message, 499, 'JOB_CANCELLED');
  }
}

/** Standard envelope for any thrown error, used by the global Express handler. */
export function errorResponse(err: unknown): {
  status: number;
  body: { success: false; message: string; errors?: Record<string, string[]> };
} {
  if (err instanceof AppError) {
    if (err.statusCode === 400) {
      const formattedErrors: Record<string, string[]> = {};
      const errors = (err as any).errors;
      if (errors) {
        for (const [key, value] of Object.entries(errors)) {
          formattedErrors[key] = Array.isArray(value) ? value : [value as string];
        }
      }
      return {
        status: 400,
        body: {
          success: false,
          message: err.message || 'Validation failed',
          ...(errors ? { errors: formattedErrors } : {}),
        },
      };
    }

    let message = err.message;
    if (err.statusCode === 401 && (!message || message === 'Authentication required')) {
      message = 'Unauthorized';
    }
    if (err.statusCode === 403 && (!message || message === 'You do not have permission to do that')) {
      message = 'Access denied';
    }

    return { status: err.statusCode, body: { success: false, message } };
  }
  // Unknown errors are never leaked to the client.
  return { status: 500, body: { success: false, message: 'Internal server error' } };
}
