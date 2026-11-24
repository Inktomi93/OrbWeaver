/**
 * The domain error taxonomy — thrown by verbs, mapped to tRPC codes at the
 * transport boundary by the domain-error middleware.
 *
 * BOOT-CRITICAL: `DomainNotFoundError` must exist before the tag / credentials /
 * character front doors re-export it . Lives
 * in `@orb/kit` (isomorphic — `extends Error` is the one sanctioned class shape,
 * `docs/law/Spine-TypeScript-and-Patterns.md` §6).
 */

import type { Branded, CharacterId, RpgGameId, RpgQuestId, SocketId, TypeIdOf, TypeIdPrefix, UserId } from "#ids";

/** Capture a clean stack trace where the V8 API is available (Node + Chromium); a
 *  no-op elsewhere (Firefox/Safari) — kit is browser-safe, so this must not assume V8. */
function captureStack(target: Error, ctor: new (...args: never[]) => Error): void {
  const ErrorCtor: ErrorConstructor & { readonly captureStackTrace?: (t: Error, c: typeof ctor) => void } = Error;
  ErrorCtor.captureStackTrace?.(target, ctor);
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    captureStack(this, this.constructor as new (...args: never[]) => Error);
  }
}

/** The TypeID kinds a verb reports as not found. A kind a verb never throws is not here: a new one is added here and to
 *  `notFoundLabel`, which `tsc` demands. */
type NotFoundTypeIdKind = Extract<
  TypeIdPrefix,
  | "asset"
  | "automation_rule"
  | "automation_suggestion"
  | "character"
  | "chat"
  | "document"
  | "gallery_item"
  | "notification"
  | "persona"
  | "plugin"
  | "preset"
  | "refinery_run"
  | "refinery_schema"
  | "refinery_session"
  | "regex_script"
  | "roster_preset"
  | "rpg_checkpoint"
  | "rpg_journal"
  | "rpg_snapshot"
  | "session"
  | "tag"
  | "theme"
  | "workload"
  | "workload_schedule"
  | "world_book"
  | "world_entry"
>;

/** Ids that are not TypeIDs, and kinds found by the id of the entity they hang on. The plugin slug is spelled as its
 *  brand because `kit` cannot import the contracts' `PluginSlug`; a rename there fails `tsc` at the throw. */
interface NotFoundOtherIdByKind {
  readonly user: UserId;
  readonly socket: SocketId;
  readonly quest: RpgQuestId;
  readonly "plugin distribution": Branded<"PluginSlug">;
  /** The game's current snapshot, found by the game's id: the game exists and has none. */
  readonly "rpg head snapshot": RpgGameId;
  /** A character's place in a chat, found by the character's id: the character exists and holds no seat there. */
  readonly "chat seat": CharacterId;
}

type NotFoundIdByKind = { readonly [P in NotFoundTypeIdKind]: TypeIdOf<P> } & NotFoundOtherIdByKind;

type NotFoundIdKind = keyof NotFoundIdByKind;

// Generic in the kinds it spans, so a ref built from a kind held as a type parameter keeps its kind and id paired.
type NotFoundIdRefOf<K extends NotFoundIdKind> = { readonly [P in K]: { readonly kind: P; readonly id: NotFoundIdByKind[P] } }[K];

/** The entity the caller asked for, by the id of its kind: a wrong-brand id cannot compile. */
type NotFoundIdRef = NotFoundIdRefOf<NotFoundIdKind>;

/** An entity found by a name or an id no brand of ours names: a tool's registry name, and a quest objective's id,
 *  which is minted inside the snapshot blob as plain text. */
interface NotFoundKeyRef {
  readonly kind: "tool" | "quest objective";
  readonly key: string;
}

/** A row an import payload names by its place in the payload, never by an id. */
interface NotFoundPositionRef {
  readonly kind: "imported message";
  readonly index: number;
}

/** An entity whose lookup names nothing the caller may be told: an invite is found by its secret token, and a
 *  workload admission fails on a funder or owner whose existence is not the caller's to learn. */
interface NotFoundBareRef {
  readonly kind: "invite" | "workload admission";
}

/** What was not found: a kind-keyed ref in the shape of `MacroSourceRef`, plus the three forms an id cannot carry. */
export type NotFoundRef = NotFoundIdRef | NotFoundKeyRef | NotFoundPositionRef | NotFoundBareRef;

/** What a person reads for each kind, as a noun phrase that follows "the". The error's message is built from this and
 *  carries no kind token; the kind and id stay on the error's `ref`. A new kind fails `tsc` here until it has a label. */
function notFoundLabel(kind: NotFoundRef["kind"]): string {
  switch (kind) {
    case "asset":
      return "file";
    case "automation_rule":
      return "automation rule";
    case "automation_suggestion":
      return "automation suggestion";
    case "character":
      return "character";
    case "chat":
      return "chat";
    case "document":
      return "document";
    case "gallery_item":
      return "gallery item";
    case "notification":
      return "notification";
    case "persona":
      return "persona";
    case "plugin":
      return "plugin";
    case "preset":
      return "preset";
    case "refinery_run":
      return "refinery run";
    case "refinery_schema":
      return "refinery schema";
    case "refinery_session":
      return "refinery session";
    case "regex_script":
      return "regex script";
    case "roster_preset":
      return "roster preset";
    case "rpg_checkpoint":
      return "checkpoint";
    case "rpg_journal":
      return "journal entry";
    case "rpg_snapshot":
      return "saved game state";
    case "session":
      return "session";
    case "tag":
      return "tag";
    case "theme":
      return "theme";
    case "workload":
      return "workload";
    case "workload_schedule":
      return "schedule";
    case "world_book":
      return "world book";
    case "world_entry":
      return "world entry";
    case "user":
      return "user";
    case "socket":
      return "stream connection";
    case "quest":
      return "quest";
    case "plugin distribution":
      return "plugin distribution";
    case "rpg head snapshot":
      return "current game state";
    case "chat seat":
      return "seat for that character in this chat";
    case "tool":
      return "tool";
    case "quest objective":
      return "quest objective";
    case "imported message":
      return "imported message";
    case "invite":
      return "invite";
    case "workload admission":
      return "owner or funder of this run";
    default:
      return kind satisfies never;
  }
}

/** A kind and its id as one tuple, so a union of kinds is a union of pairs and an id of another kind cannot ride along. */
type NotFoundIdEntity<K extends NotFoundIdKind> = { readonly [P in K]: readonly [kind: P, id: NotFoundIdByKind[P]] }[K];

/** A ref for a kind and id that arrive as a tuple of correlated unions: a caller spreads its tuple (`...entity`), which
 *  keeps the pairing, where two separate arguments of those unions would not. */
export function notFoundIdRef<K extends NotFoundIdKind>(...[kind, id]: NotFoundIdEntity<K>): NotFoundIdRefOf<K> {
  const ref: NotFoundIdRefOf<K> = { kind, id };
  return ref;
}

function describeNotFound(ref: NotFoundRef): string {
  const label = notFoundLabel(ref.kind);
  if ("key" in ref) {
    return `Could not find the ${label} "${ref.key}".`;
  }
  if ("index" in ref) {
    return `Could not find the ${label} at position ${ref.index}.`;
  }
  return `Could not find the ${label}.`;
}

/** The entity the caller asked for does not exist. Maps to tRPC NOT_FOUND. */
export class DomainNotFoundError extends DomainError {
  /** What was not found, as data: the message is copy for a reader, and this is what a handler or a log reads. */
  readonly ref: NotFoundRef;
  constructor(ref: NotFoundRef) {
    super(describeNotFound(ref));
    this.name = this.constructor.name;
    this.ref = ref;
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
  /** A fixed code a client keys on instead of the message, for a refusal it says in its own words. Absent for every
   *  other refusal, which stays codeless on the wire. */
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

/** The facts a coded refusal states beside its code, so a client can say them without reading the message. */
export type DomainOperationDetail = Readonly<Record<string, string | number | boolean>>;

/** A coded operational failure (the `code` is the discriminator). Maps to tRPC BAD_REQUEST. */
export class DomainOperationError extends DomainError {
  readonly code: string;
  readonly detail: DomainOperationDetail | undefined;
  constructor(code: string, message: string, detail?: DomainOperationDetail) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.detail = detail;
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
 * An invariant tripwire fired: a state the code proves impossible was reached. It is not the caller's doing and
 * a retry cannot help, so the transport answers INTERNAL_SERVER_ERROR with fixed copy (the message never leaves
 * the server) and logs this error at error level.
 */
export class DomainInternalFaultError extends DomainError {
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
  /** The stored reason a revoked key carries; `null` for a key that is not the caller's. */
  readonly revokedReason: string | null;
  constructor(provider: string, revokedReason: string | null = null) {
    super(`No ${provider} credential — add a key in settings.`);
    this.name = this.constructor.name;
    this.provider = provider;
    this.revokedReason = revokedReason;
  }
}
