// foundation/observability/bug-report-diagnostics — the production "Report a bug" server read. The ring it
// reads is free text, so these seed the REAL log ring with canaries in every field a log line can carry and
// prove none survives the projection, then prove each safety step is the one doing the work.

import { bugReportDiagnosticsSchema } from "@orb/contracts/diagnostics";
import { beforeEach, describe } from "vitest";
import { readBugReportDiagnostics } from "../../../../packages/server/src/foundation/observability/bug-report-diagnostics.ts";
import { secretLiterals } from "../../../../packages/server/src/foundation/observability/debug/bug-report.ts";
import { logRing } from "../../../../packages/server/src/foundation/observability/logger.ts";
import { expect, test } from "../../../support/fixtures.ts";

const AT = "2026-09-02T08:00:00.000Z";
const AT_MS = Date.UTC(2026, 8, 2, 8);

// Canaries, one per class a public report must never carry. Each is a value no grammar-checked field
// would produce by accident, so a hit can only be a leak.
const CHAT = "The lantern-keeper whispered canarychatline into the dark";
const PERSONA = "Persona sheet canarypersonatext with a long backstory";
const CARD = "Card description canarycardtext";
const API_KEY = "sk-or-v1-canaryapikey0123456789abcdef";
const SESSION = "canarySessionToken_Q3n-x9Zk2pLmA8rT0vWy";
const COOKIE = `orb_session_insecure=${SESSION}`;
const HOME_PATH = "/home/canaryuser/orbweaver/packages/server/src/x.ts";
const HOST = "canary-host.example";
const USER_ID = "user_canaryowner";
const HANDLE = "canaryhandle";
/** The first-start owner password, in the generated (mixed-case base64url) shape. */
const GENERATED_PASSWORD = "Q3n_x9Zk2pLmA8rT0vWyCanaryPw";
/** A user-chosen lower-case password: the shape that DOES pass the lower-case grammars, so only the secret
 *  literal check can keep it out. */
const CHOSEN_PASSWORD = "hunterpasswordcanary";

const CANARIES = [
  CHAT,
  "canarychatline",
  PERSONA,
  "canarypersonatext",
  CARD,
  "canarycardtext",
  API_KEY,
  SESSION,
  HOME_PATH,
  "canaryuser",
  HOST,
  USER_ID,
  HANDLE,
  GENERATED_PASSWORD,
  CHOSEN_PASSWORD,
];

function line(fields: Record<string, unknown>): string {
  return JSON.stringify({ level: "error", time: AT, ...fields });
}

/** Every field a pino error line in this server can carry, each holding canaries. */
function seedHostileRing(): void {
  logRing.push(
    line({
      msg: `client error: ${CHAT}`,
      userId: USER_ID,
      handle: HANDLE,
      url: `https://${HOST}/chats?invite=${SESSION}`,
      stack: `Error: ${PERSONA}\n    at render (${HOME_PATH}:1:2)`,
      clientRequestId: SESSION,
    }),
  );
  logRing.push(
    line({
      msg: "trpc: unmapped error on chat.send — surfaced to the caller as a 500",
      event: "trpc.unhandled",
      path: "chat.send",
      err: { type: "TypeError", message: `${CARD} ${API_KEY}`, stack: `TypeError: x\n    at ${HOME_PATH}:9:9`, code: GENERATED_PASSWORD },
      req: { headers: { cookie: COOKIE, authorization: `Bearer ${SESSION}` } },
    }),
  );
  // The chosen password in every grammar-shaped slot it can fit.
  logRing.push(line({ msg: `${CHOSEN_PASSWORD}: boot`, event: CHOSEN_PASSWORD, code: CHOSEN_PASSWORD }));
  // A whole message that is free text with no category prefix.
  logRing.push(line({ msg: `${PERSONA} said ${CHAT}`, code: "SQLITE_BUSY" }));
}

// biome-ignore-start lint/style/useNamingConvention: environment variable names are the server's fixed upper-case keys, and the key NAME is what selects a secret.
const SECRETS = secretLiterals({ LOCAL_INITIAL_PASSWORD: CHOSEN_PASSWORD, OPENROUTER_API_KEY: API_KEY, SESSION_SECRET: SESSION });
/** The env slice that holds only the first-start owner password. */
const INITIAL_PASSWORD_ENV = { LOCAL_INITIAL_PASSWORD: CHOSEN_PASSWORD };
// biome-ignore-end lint/style/useNamingConvention: end of the block above

beforeEach(() => {
  logRing.clear();
});

describe("readBugReportDiagnostics — the owner's error census", () => {
  test("no canary from any field of a hostile ring reaches the output", () => {
    seedHostileRing();
    const serialized = JSON.stringify(readBugReportDiagnostics({ includeServerErrors: true, secrets: SECRETS }));
    for (const canary of CANARIES) {
      expect(serialized, canary).not.toContain(canary);
    }
  });

  test("positive control: the grammar-checked facts DO arrive, newest first, and the wire schema accepts them", () => {
    seedHostileRing();
    const read = readBugReportDiagnostics({ includeServerErrors: true, secrets: SECRETS });
    expect(bugReportDiagnosticsSchema.safeParse(read).success).toBe(true);
    if (read.serverErrors.kind !== "included") {
      throw new Error("the owner read must include the census");
    }
    expect(read.serverErrors.held).toBe(4);
    expect(read.serverErrors.records).toContainEqual({ at: AT_MS, source: "client error", event: null, errorType: null, code: null, procedure: null });
    expect(read.serverErrors.records).toContainEqual({
      at: AT_MS,
      source: "trpc",
      event: "trpc.unhandled",
      errorType: "TypeError",
      code: null,
      procedure: "chat.send",
    });
    // The free-text message keeps nothing but its code.
    expect(read.serverErrors.records).toContainEqual({ at: AT_MS, source: null, event: null, errorType: null, code: "SQLITE_BUSY", procedure: null });
  });

  test("the SECRET LITERAL check is what keeps a lower-case password out: without it, the grammar lets it through", () => {
    seedHostileRing();
    // Break the control on purpose: no secrets known. The lower-case password fits the `source` and `code`
    // grammars and arrives — which is exactly why the literal check exists.
    expect(JSON.stringify(readBugReportDiagnostics({ includeServerErrors: true, secrets: [] }))).toContain(CHOSEN_PASSWORD);
    // Restored: the record carrying it is dropped whole.
    expect(JSON.stringify(readBugReportDiagnostics({ includeServerErrors: true, secrets: SECRETS }))).not.toContain(CHOSEN_PASSWORD);
  });

  test("the first-start password is selected from the env by NAME, so the default read already knows it", () => {
    expect(secretLiterals(INITIAL_PASSWORD_ENV)).toContain(CHOSEN_PASSWORD);
  });

  test("a bare message keeps its category only when it is one lower-case token, and the wire schema accepts every arm", () => {
    logRing.push(line({ msg: "request.thrown" }));
    logRing.push(line({ msg: "SomethingFailed" }));
    logRing.push(line({ msg: "lower case words with no colon" }));
    const read = readBugReportDiagnostics({ includeServerErrors: true, secrets: [] });
    expect(bugReportDiagnosticsSchema.safeParse(read).success).toBe(true);
    if (read.serverErrors.kind !== "included") {
      throw new Error("the owner read must include the census");
    }
    expect(read.serverErrors.records.map((record) => record.source).sort()).toEqual([null, null, "request.thrown"]);
  });

  test("a line with no parseable time is dropped rather than reported at the epoch", () => {
    logRing.push(JSON.stringify({ level: "error", msg: "boot: no time" }));
    const read = readBugReportDiagnostics({ includeServerErrors: true, secrets: [] });
    expect(read.serverErrors).toEqual({ kind: "included", records: [], held: 1 });
  });

  test("below-error lines are not part of the census", () => {
    logRing.push(JSON.stringify({ level: "warn", time: AT, msg: "security: csrf_rejected" }));
    expect(readBugReportDiagnostics({ includeServerErrors: true, secrets: [] }).serverErrors).toEqual({ kind: "included", records: [], held: 0 });
  });
});

describe("readBugReportDiagnostics — everyone else", () => {
  test("without the owner gate the census is withheld and only runtime facts remain", () => {
    seedHostileRing();
    const read = readBugReportDiagnostics({ includeServerErrors: false, secrets: SECRETS });
    expect(read.serverErrors).toEqual({ kind: "owner-only" });
    expect(bugReportDiagnosticsSchema.safeParse(read).success).toBe(true);
  });
});
