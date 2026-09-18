// Policy: chat-viewer-plane-canon-reads-health (ledger D161) — THE THREE FAIL-LOUD ARMS of the chat
// two-plane family, split off its occurrence sibling because a structural gate's real failure mode is
// going silently GREEN and a blindness alarm must not be suppressible:
//  • matrix missing / unreadable in the declared population → the family keys every verdict off it;
//  • a banned bulk reader declared nowhere in domain/chat → the reader was RENAMED past the family;
//  • a viewer-plane verb with no discoverable `ChatService["<verb>"]`-annotated factory → the verb moved
//    out of the population, or lost the annotation implementations are resolved through, so it is UNCHECKED.
// `hard`/`error`: none of the three has an offending node to hang a marker off, and none may be waived.
// The occurrence arm is `chat-viewer-plane-canon-reads`, which is `ordinary` and does carry a door.
//
// FAMILY `chat-viewer-plane`, reader `lib/chat-plane-read.ts` — `chatPlaneVisitors`, `resolveChatMatrix`,
// `rottedReaders`, `judgeChatPlane`, `isViewerPlane` and the canonical `BULK_CANON_READERS` /
// `ROOM_PLANE_AUTHORITIES` vocabulary, all reached from `create` in both siblings.
//
// ANCHORING. The legacy module hard-coded `ctx.report({ file: ".../matrix.ts", line: 0, column: 0 })` for
// all three, which a final policy cannot do: an absence verdict may not anchor on a path the population
// need not admit (`ctx.report.file` refuses one outside the effective population). The arms now anchor
// through the shared `subjectAnchor` over the matrix file, then `persistence/queries.ts`, then the
// lexicographically first admitted source — the accused NAME stays in the message, where it was always the
// load-bearing half.
//
// POPULATION PORT: identical to the occurrence sibling; the analysis and receipts are in its header and in
// `tests/tooling/verify/gates/chat-viewer-plane-family.suite.test.ts`.
// RETIRED PRIVATE-MARKER CENSUS: the legacy module's fourth file-level arm — the `ALLOWLIST` stale ratchet
// ("a sanctioned pair whose call site is gone must be deleted") — is NOT reproduced here. Its subject, the
// gate-local allowlist, did not survive conversion (standing law §5/§8); its three rows are central
// `@orb-waive` markers and central reconciliation reports a consumed-zero marker as stale, which is the
// same guarantee in its one home.
import { defineGate } from "../contract/policy.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import {
  CHAT_DOMAIN_UNDER,
  CHAT_MATRIX_FILE,
  CHAT_QUERIES_FILE,
  chatPlaneVisitors,
  createChatPlaneIndex,
  isViewerPlane,
  judgeChatPlane,
  MATRIX_CONST,
  resolveChatMatrix,
  rottedReaders,
  SERVICE_TYPE,
} from "../lib/chat-plane-read.ts";

const MESSAGE =
  "the chat two-plane family is BLIND: the authority matrix, a banned bulk canon reader, or a viewer-plane " +
  "verb's factory could not be resolved in packages/server/src/domain/chat. Every D161 verdict keys off those " +
  "three, so the occurrence policy would report a clean domain for a reason that has nothing to do with " +
  "safety. The finding names which one, anchored on an admitted chat source.";
const FIX =
  `restore the subject the finding names: the \`${MATRIX_CONST}\` declaration under domain/chat, the renamed ` +
  "bulk canon reader in tooling/src/verify/lib/chat-plane-read.ts `BULK_CANON_READERS`, or the " +
  `\`${SERVICE_TYPE}["<verb>"]\` return annotation on the verb's factory (the house convention this family ` +
  "resolves implementations through).";

const ANCHORS = [CHAT_MATRIX_FILE, CHAT_QUERIES_FILE];

const QUERIES_SRC =
  "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n";

export const gate = defineGate({
  id: "chat-viewer-plane-canon-reads-health",
  family: "chat-viewer-plane",
  authority: "hard",
  severity: "error",
  population: { in: ["@server"], under: [CHAT_DOMAIN_UNDER] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const index = createChatPlaneIndex();
    return {
      visitors: chatPlaneVisitors(index),
      evaluate: (): void => {
        const paths = new Set(ctx.files.map(ctx.relativePath));
        ctx.receipt({ kind: "population", source: "chat-plane-health-sources", members: paths.size });
        const anchor = subjectAnchor(paths, ANCHORS);
        const matrix = resolveChatMatrix(index);
        if (matrix === undefined) {
          ctx.report.file(anchor(CHAT_MATRIX_FILE), {
            message: `${MATRIX_CONST} could not be read under domain/chat — the chat two-plane family keys every verdict off it, so it is now blind. Restore the matrix (or fix its shape) before shipping.`,
          });
          return;
        }
        for (const reader of rottedReaders(index)) {
          ctx.report.file(anchor(CHAT_QUERIES_FILE), {
            message: `the room-plane reader "${reader}" is no longer declared in domain/chat — the family's BULK_CANON_READERS vocabulary has rotted (a rename would leave every D161 verdict silently green). Update tooling/src/verify/lib/chat-plane-read.ts.`,
          });
        }
        const { covered } = judgeChatPlane(index, matrix);
        for (const [verb, authority] of matrix.verbs) {
          if (isViewerPlane(authority) && !covered.has(verb)) {
            ctx.report.file(anchor(CHAT_MATRIX_FILE), {
              message: `viewer-plane verb "${verb}" (authority "${authority}") has no discoverable \`${SERVICE_TYPE}["${verb}"]\`-annotated factory under domain/chat — this family resolves implementations through that annotation, so the verb is UNCHECKED. Annotate its factory's return type (the house convention) or widen the population.`,
            });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { listMessages: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { count: 1, messageIncludes: "UNCHECKED" },
      why: "a viewer-plane verb with NO discoverable annotated factory — the silent-green case (verb moved / annotation dropped) must be RED, not ignored",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { listMessages: "host" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\n",
      },
      expect: { count: 2, messageIncludes: "has rotted" },
      why: "two banned readers absent from the tree — the rename-past-the-family blindness must be RED, never silently green, and it is ONE finding per rotted reader",
    },
    {
      // THE BLINDNESS ARM, and its ANCHOR: with no matrix declaration in the population the verdict cannot
      // point at `matrix.ts` (it is not admitted), so `subjectAnchor` falls through to the next named subject.
      mode: "types",
      files: { "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC },
      expect: { count: 1, messageIncludes: "it is now blind" },
      why: "THE MATRIX IS GONE: the key every D161 verdict hangs off cannot be read, so the family reports blindness on an ADMITTED anchor rather than a clean chat domain",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { listMessages: "member", previewAssembly: "host" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
        "packages/server/src/domain/chat/verbs/read.ts":
          'import type { ChatService } from "../contract/service";\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => [];\n}\nexport const x = createListMessages;\n',
      },
      why: "a readable matrix, all three bulk readers declared, and every VIEWER-plane verb resolved to an annotated factory — the health arm is silent when the family can see",
    },
    {
      // The room-plane half of the coverage arm: a `host` verb needs no factory, because the occurrence
      // policy never judges it. A coverage arm that demanded one would accuse the ROOM plane of its job.
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", cleanupChats: "non-chat-scoped" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      why: "both ROOM-plane authorities (`host`, `non-chat-scoped`) are outside the coverage obligation — an unannotated room-plane verb is not an UNCHECKED viewer-plane verb",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { ...baseAuthority(), listMessages: "member" } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { messageIncludes: "unsupported CHAT_VERB_AUTHORITY expression" },
      why: "a matrix spread of a CALL refuses — an unreadable matrix must never read as a smaller one, which would satisfy the blindness arm while dropping every spread-in verb",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { ...MISSING_BASE, listMessages: "member" } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { messageIncludes: 'CHAT_VERB_AUTHORITY binding "MISSING_BASE" resolves to no local declaration or named import' },
      why: "a matrix spread of an identifier nothing binds refuses rather than folding the rows it can see",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          "export const OTHER = { ...CHAT_VERB_AUTHORITY };\nexport const CHAT_VERB_AUTHORITY = { ...OTHER } as const;\n",
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { messageIncludes: "CHAT_VERB_AUTHORITY composition cycle" },
      why: "a matrix composition cycle refuses instead of recursing — `seen` is threaded across the fold/resolve boundary, so the recursion cannot blow the stack instead",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/base-matrix.ts": "export const BASE_AUTHORITY = {} as const;\n",
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'import { BASE_AUTHORITY } from "./base-matrix";\nexport const CHAT_VERB_AUTHORITY = { ...BASE_AUTHORITY, listMessages: "member" } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { messageIncludes: "which resolved to zero verbs" },
      why: "a spread that contributes ZERO verbs refuses — an empty contribution is the silent-shrink shape the blindness arm cannot see, because the matrix stays non-empty",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: authorityFor() } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { messageIncludes: "unsupported CHAT_VERB_AUTHORITY value" },
      why: "a matrix VALUE built by a CALL refuses — an unreadable authority must never DROP its verb, which is the one direction that is silent",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: MISSING } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { messageIncludes: 'CHAT_VERB_AUTHORITY value binding "MISSING" resolves to no local declaration or named import' },
      why: "a matrix VALUE identifier nothing binds refuses rather than silently dropping that verb from the classified set",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'const A = B;\nconst B = A;\nexport const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: A } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { messageIncludes: "CHAT_VERB_AUTHORITY value binding cycle" },
      why: "a matrix VALUE binding cycle (`const A = B; const B = A;`) refuses instead of recursing — the value chain is its OWN cycle domain",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts": 'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { messageIncludes: 'CHAT_VERB_AUTHORITY value binding "listMessages" resolves to no local declaration or named import' },
      why: "a SHORTHAND row nothing binds refuses — before #1091 it fell out of the fold with no throw and no count",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", [verbKey]: "member" } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { messageIncludes: "computed CHAT_VERB_AUTHORITY key" },
      why: "a COMPUTED key that is not a string literal refuses — a key this reader cannot NAME matches no factory, so it would report an UNCHECKED verb that does not exist while the real one went unjudged",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages() { return "member"; } } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { messageIncludes: "unsupported CHAT_VERB_AUTHORITY member kind MethodDeclaration" },
      why: "a METHOD member refuses by its own kind — a member kind the fold cannot answer must never be dropped",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", get listMessages() { return "member"; } } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": QUERIES_SRC,
      },
      expect: { messageIncludes: "unsupported CHAT_VERB_AUTHORITY member kind GetAccessor" },
      why: "a GETTER member refuses by its own kind — the fold is TOTAL, so every member either writes a row or throws",
    },
  ],
});
