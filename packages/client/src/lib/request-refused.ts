// A request the client or the server's HTTP edge turns away before any procedure answers: a body over the mount cap, a
// sign-in or proxy page in place of JSON, and the size check a file import runs before it sends. One typed error carries
// the kind, so a caller keys on it and never on the message, and the message is plain words with the raw status kept in
// `detail` for the log.

import { TRPC_BODY_MAX_BYTES } from "@orb/contracts/uploads";
import { formatBytes } from "@orb/kit/strings";

const STATUS_UNAUTHORIZED = 401;
const STATUS_FORBIDDEN = 403;
const STATUS_PAYLOAD_TOO_LARGE = 413;
const STATUS_UNSUPPORTED_MEDIA = 415;
const STATUS_TOO_MANY_REQUESTS = 429;
const STATUS_BAD_GATEWAY = 502;
const STATUS_SERVICE_UNAVAILABLE = 503;
const STATUS_GATEWAY_TIMEOUT = 504;

const REFUSAL_KINDS = ["tooLarge", "signedOut", "forbidden", "unsupportedMedia", "rateLimited", "unreachable", "redirected", "unexpected"] as const;
export type RefusalKind = (typeof REFUSAL_KINDS)[number];

/** The reader's sentence for a refusal of each kind, besides `tooLarge`, which states its limit ({@link tooLargeMessage}). */
const REFUSAL_MESSAGES: Readonly<Record<Exclude<RefusalKind, "tooLarge">, string>> = {
  signedOut: "You are signed out. Sign in again, then retry.",
  forbidden: "The server refused this request before reading it. A network allowlist or a proxy in front of it may be blocking this device.",
  unsupportedMedia: "The server did not accept how this request was sent. Reload the page, then retry.",
  rateLimited: "Too many requests in a short time. Wait a moment, then retry.",
  unreachable: "The server is not answering right now. It may be restarting, or a proxy in front of it cannot reach it. Retry in a moment.",
  redirected: "A sign-in or proxy page answered in place of the app. Reload the page and sign in again.",
  unexpected: "The server sent an answer the app could not read. Reload the page, then retry.",
};

/** The one sentence for a request or file over a size limit, used for the server's 413 and for every check made before sending. */
function tooLargeMessage(limit: number): string {
  return `The file or request is too large. The limit is ${formatBytes(limit)}.`;
}

/** A request turned away at the edge or by a check before it was sent. `status` is null when nothing was sent. */
class RequestRefusedError extends Error {
  readonly kind: RefusalKind;
  readonly status: number | null;
  /** The limit a `tooLarge` refusal names (bytes, or characters for a text check), else null. */
  readonly limit: number | null;
  /** The raw status and content type, for the log: never the headline. */
  readonly detail: string;

  constructor(kind: RefusalKind, init: { readonly status: number | null; readonly limit?: number; readonly detail: string }) {
    super(kind === "tooLarge" ? tooLargeMessage(init.limit ?? TRPC_BODY_MAX_BYTES) : REFUSAL_MESSAGES[kind]);
    this.name = "RequestRefusedError";
    this.kind = kind;
    this.status = init.status;
    this.limit = kind === "tooLarge" ? (init.limit ?? TRPC_BODY_MAX_BYTES) : null;
    this.detail = init.detail;
  }
}

const KIND_OF_STATUS: ReadonlyMap<number, RefusalKind> = new Map([
  [STATUS_PAYLOAD_TOO_LARGE, "tooLarge"],
  [STATUS_UNAUTHORIZED, "signedOut"],
  [STATUS_FORBIDDEN, "forbidden"],
  [STATUS_UNSUPPORTED_MEDIA, "unsupportedMedia"],
  [STATUS_TOO_MANY_REQUESTS, "rateLimited"],
  [STATUS_BAD_GATEWAY, "unreachable"],
  [STATUS_SERVICE_UNAVAILABLE, "unreachable"],
  [STATUS_GATEWAY_TIMEOUT, "unreachable"],
]);

/** The refusal for a tRPC answer that is not JSON. A redirect reads as a sign-in or proxy page whatever its final status. */
export function refusalOfAnswer(response: Response): RequestRefusedError {
  const contentType = response.headers.get("content-type") ?? "";
  const where = response.redirected ? ` after a redirect${response.url === "" ? "" : ` to ${response.url}`}` : "";
  const detail = `HTTP ${response.status}${where}, content type ${contentType === "" ? "none" : contentType}`;
  return new RequestRefusedError(response.redirected ? "redirected" : (KIND_OF_STATUS.get(response.status) ?? "unexpected"), {
    status: response.status,
    detail,
  });
}

/** The refusal for a text or request over a limit, raised before anything is sent. */
function tooLargeBeforeSending(limit: number): RequestRefusedError {
  return new RequestRefusedError("tooLarge", { status: null, limit, detail: `over the ${String(limit)} limit before sending` });
}

/** The refusal a failure carries, found on the error or on its `cause` (the tRPC client wraps what its fetch throws), else undefined. */
export function requestRefusalOf(error: unknown): RequestRefusedError | undefined {
  if (error instanceof RequestRefusedError) {
    return error;
  }
  return error instanceof Error && error.cause instanceof RequestRefusedError ? error.cause : undefined;
}

/** The text of a picked file, refused before any request when it is longer than `maxChars`: the length a procedure's `z.string().max()` reads. */
export async function readTextWithin(file: File, maxChars: number): Promise<string> {
  const text = await file.text();
  if (text.length > maxChars) {
    throw tooLargeBeforeSending(maxChars);
  }
  return text;
}

/** The refusal for picked files whose sizes together pass `maxBytes`, else undefined: the check a multipart import runs before its POST. */
export function refuseOversizeFiles(files: readonly File[], maxBytes: number): RequestRefusedError | undefined {
  return files.reduce((total, file) => total + file.size, 0) > maxBytes ? tooLargeBeforeSending(maxBytes) : undefined;
}
