import type { ErrorCode, ErrorResponse } from '@traceback/shared';
import { ZodError } from 'zod';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 422,
  INVALID_MERGE: 409,
  IDEMPOTENCY_REPLAY: 200,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * The only error type the service layer throws. Routes never build error bodies
 * by hand — the global error handler funnels everything into the canonical
 * `{ error: { code, message, details } }` envelope.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly status: number;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.status = STATUS_BY_CODE[code];
  }

  static notFound(entity: string, id?: string): AppError {
    return new AppError('NOT_FOUND', id ? `${entity} ${id} not found` : `${entity} not found`);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError('UNAUTHORIZED', message);
  }

  static forbidden(action: string): AppError {
    return new AppError('FORBIDDEN', `You are not allowed to ${action}`);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError('CONFLICT', message, details);
  }

  static versionConflict(message: string, details?: unknown): AppError {
    return new AppError('VERSION_CONFLICT', message, details);
  }

  static invalidTransition(from: string, to: string): AppError {
    return new AppError('INVALID_TRANSITION', `Cannot move incident from ${from} to ${to}`, {
      from,
      to,
    });
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError('VALIDATION_ERROR', message, details);
  }
}

export interface ErrorDescriptor {
  status: number;
  body: ErrorResponse;
}

export function toErrorResponse(error: unknown): ErrorDescriptor {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request failed validation',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
    };
  }

  // Fastify validation errors carry `validation` and a statusCode.
  if (typeof error === 'object' && error !== null && 'validation' in error) {
    const fastifyError = error as { message?: string; validation?: unknown };
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: fastifyError.message ?? 'Request failed validation',
          details: fastifyError.validation,
        },
      },
    };
  }

  const message = error instanceof Error ? error.message : 'Unexpected error';
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message } },
  };
}
