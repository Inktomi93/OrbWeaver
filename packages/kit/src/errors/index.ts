/**
 * The domain error taxonomy — thrown by verbs, mapped to tRPC codes at the
 * transport boundary by the domain-error middleware.
 *
 * BOOT-CRITICAL: `DomainNotFoundError` must exist before the tag / credentials /
 * character front doors re-export it (`core/Core-Legacy-Migration-and-Gaps.md` §1). Lives
 * in `@orb/kit` (isomorphic — `extends Error` is the one sanctioned class shape,
 * `core/Spine-TypeScript-and-Patterns.md` §6).
 */

/** Capture a clean stack trace where the V8 API is available (Node + Chromium); a
 *  no-op elsewhere (Firefox/Safari) — kit is browser-safe, so this must not assume V8. */
function captureStack(target: Error, ctor: new (...args: never[]) => Error): void {
  const ErrorCtor = Error as unknown as {
    captureStackTrace?: (t: Error, c: unknown) => void;
  };
  ErrorCtor.captureStackTrace?.(target, ctor);
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    captureStack(this, this.constructor as new (...args: never[]) => Error);
  }
}

/** The entity the caller asked for does not exist. Maps to tRPC NOT_FOUND. */
export class DomainNotFoundError extends DomainError {
  constructor(entityName: string, id: string) {
    super(`${entityName} ${id} not found`);
    this.name = this.constructor.name;
  }
}

/** A uniqueness / state conflict (e.g. a duplicate handle). Maps to tRPC CONFLICT. */
export class DomainConflictError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Authenticated but not permitted (e.g. a non-owner hitting an owner-only surface,
 * a non-participant hitting a chat). Distinct from "not found" — the caller exists,
 * the action is gated. Maps to tRPC FORBIDDEN.
 */
export class DomainForbiddenError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** A coded operational failure (the `code` is the discriminator). Maps to tRPC BAD_REQUEST. */
export class DomainOperationError extends DomainError {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

/**
 * Rate-limited at the domain boundary. Maps to tRPC TOO_MANY_REQUESTS; the optional
 * `msBeforeNext` propagates to `Retry-After` and `remainingPoints` to
 * `X-RateLimit-Remaining`. Accepts either a numeric `msBeforeNext` or an options
 * object (preferred — carries `remainingPoints` too).
 */
export class DomainRateLimitError extends DomainError {
  readonly msBeforeNext: number | undefined;
  readonly remainingPoints: number | undefined;
  constructor(message: string, msBeforeNextOrOpts?: number | { msBeforeNext?: number; remainingPoints?: number }) {
    super(message);
    this.name = this.constructor.name;
    if (typeof msBeforeNextOrOpts === "number") {
      this.msBeforeNext = msBeforeNextOrOpts;
      this.remainingPoints = undefined;
    } else {
      this.msBeforeNext = msBeforeNextOrOpts?.msBeforeNext;
      this.remainingPoints = msBeforeNextOrOpts?.remainingPoints;
    }
  }
}

/**
 * Upstream provider/service unavailable (transient — 503, network failure, model
 * overloaded). Maps to tRPC SERVICE_UNAVAILABLE; distinct from
 * `DomainOperationError` (BAD_REQUEST) so the client can retry vs. surface.
 */
export class DomainUnavailableError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * The caller has no credential for the requested provider AND host fallback is
 * unavailable. Maps to tRPC FAILED_PRECONDITION + `cause: { provider }` so the
 * client can redirect to the credentials page (the action is "add a key", not "retry").
 */
export class DomainNoCredentialError extends DomainError {
  readonly provider: string;
  constructor(provider: string) {
    super(`No ${provider} credential — add a key in settings.`);
    this.name = this.constructor.name;
    this.provider = provider;
  }
}
