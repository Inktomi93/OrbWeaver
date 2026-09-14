// Policy: chat-viewer-plane-canon-reads (ledger D79, chat read-visibility: two planes, one verdict) — a
// VIEWER-PLANE chat verb may not reach a ROOM-PLANE floorless canon reader. THE OCCURRENCE ARM; the three
// fail-loud blindness arms are the `-health` sibling, because they are unsuppressible and this door is not.
//
// RULE AND ARMS. Keyed off the LIVE authority matrix (`substrate/auth/matrix.ts::CHAT_VERB_AUTHORITY`),
// never a path list: a verb whose matrix authority is anything other than `host`/`non-chat-scoped` is
// viewer plane, and a bulk canon reader reached from its factory — directly or through a module-local
// helper — is a finding on the reader CALL, unless that reader's own result is filtered through a
// directly-negated `isBelowHistoryFloor` bound to the filtered element and the viewer's resolved floor.
// The complete model, the banned-set rationale and the resolver law are in `lib/chat-plane-read.ts`.
// DECLARED LIMIT, carried from the legacy module and still true: reach is module-local (a helper in the
// same file), not cross-module.
//
// FAMILY `chat-viewer-plane`, reader `lib/chat-plane-read.ts` — `chatPlaneVisitors`/`resolveChatMatrix`/
// `judgeChatPlane` here, `resolveChatMatrix`/`rottedReaders`/`judgeChatPlane` in the health sibling, both
// reached from `create`. The canonical subject declarations `BULK_CANON_READERS` and
// `ROOM_PLANE_AUTHORITIES` are the vocabulary both arms judge against.
//
// POPULATION PORT (legacy `1994ec3d0`, `scanRoot: (p) => /(?:^|\/)packages\/server\/src\/domain\/chat\//`):
// `legacy − final` = the whole-project matrix sweep. The legacy module found `CHAT_VERB_AUTHORITY` by NAME
// through `ctx.project.getSourceFiles()`, outside its own scanRoot; the final contract forbids that, so the
// matrix must live in the declared population. On today's tree it does (`substrate/auth/matrix.ts`), so
// the effective difference is zero — and a matrix moved OUT of domain/chat now reports blindness through
// the health sibling instead of resolving invisibly from outside the fence. `final − legacy` = none: the
// `under` glob admits exactly the `.ts`/`.tsx` the scanRoot regex did. Measured receipts are in
// `tests/tooling/verify/gates/chat-viewer-plane-family.test.ts`.
//
// RETIRED PRIVATE-MARKER CENSUS. The legacy `@orb-gate-ignore chat-viewer-plane-canon-reads(<verb>:<reader>)`
// door had ZERO live occurrences repo-wide at conversion (the single match was this module's own MESSAGE
// prose), and its position was an ALLOWLIST-key DISCRIMINATOR, not an authored slice — so it could not port
// by spelling (standing law §2.1). It is recorded as a dead door, not relocated. The legacy gate-local
// `ALLOWLIST` (3 `verb:reader` rows) and its stale-ratchet arm did not survive conversion either (§5/§8);
// each row's reason is now the `reason` of a central `@orb-waive` at its own call site, and central
// reconciliation owns the stale judgment.
import { defineGate } from "../contract/policy.ts";
import { CHAT_DOMAIN_UNDER, chatPlaneVisitors, createChatPlaneIndex, judgeChatPlane, MATRIX_CONST, resolveChatMatrix } from "../lib/chat-plane-read.ts";

const MESSAGE =
  "a VIEWER-PLANE chat verb (matrix authority other than host/non-chat-scoped) reaches a ROOM-PLANE floorless " +
  "canon reader. Those readers return canon CONTENT with no history floor, so the caller silently hands a " +
  "`from-join` member the pre-join transcript every other read path withholds (D79 — substrate/auth/clamp.ts). " +
  "The finding is anchored on the reader CALL, so two banned reads in one body are two independently " +
  "waivable findings.";
const FIX =
  "use a floor-taking read (`loadMessagesPage`/`loadStreamReplay`/`loadMessageSlots` with the " +
  "`historyFloorSeq` the guard already stamped on the membership), or clamp the result in the same body via " +
  "`isBelowHistoryFloor`. If the read is genuinely ROOM-plane (its product leaves no canon bytes toward the " +
  "caller), license it at the call site with " +
  "`// @orb-waive chat-viewer-plane-canon-reads(<the reader name at the reported column>): <why no canon bytes reach the caller>`.";

const BLIND = `${MATRIX_CONST} could not be read in the chat domain — this policy keys every verdict off it, so a clean result would be blindness rather than safety. Refusing the run; the health sibling reports the missing matrix.`;

export const gate = defineGate({
  id: "chat-viewer-plane-canon-reads",
  family: "chat-viewer-plane",
  authority: "ordinary",
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
        ctx.receipt({ kind: "population", source: "chat-plane-source-files", members: ctx.files.length });
        const matrix = resolveChatMatrix(index);
        if (matrix === undefined) {
          throw new Error(`chat-viewer-plane-canon-reads: ${BLIND}`);
        }
        for (const violation of judgeChatPlane(index, matrix).violations) {
          const plural = violation.verbs.length === 1 ? "" : "s";
          const named = violation.verbs.map((verb) => `\`${verb}\``).join(", ");
          ctx.report.node(violation.call, { message: `${MESSAGE} Reached from viewer-plane verb${plural} ${named}; reader \`${violation.reader}\`.` });
        }
      },
    };
  },
  mustFlag: [
    {
      // THE #947 SPLIT: `{...BASE_AUTHORITY, listMessages: "member"}` — the viewer-plane verb under test
      // reaches the matrix only through the imported spread. Unresolved, the matrix held ONE verb, stayed
      // non-empty (so the blindness arm was satisfied) and `replayChatEvents` was simply never judged.
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/base-matrix.ts": 'export const BASE_AUTHORITY = { replayChatEvents: "member" } as const;\n',
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'import { BASE_AUTHORITY } from "./base-matrix";\nexport const CHAT_VERB_AUTHORITY = { ...BASE_AUTHORITY, listMessages: "member" } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadChatEventReplay } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createReplayChatEvents(): ChatService["replayChatEvents"] {\n  return async () => await loadChatEventReplay();\n}\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => [];\n}\nexport const x = [createReplayChatEvents, createListMessages];\n',
      },
      expect: { count: 1, token: "loadChatEventReplay" },
      why: "THE #947 SPLIT RED: a spread-in viewer-plane verb reads a bulk canon reader with no floor clamp — the exact leak class, invisible while the matrix was read flat",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { replayChatEvents: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadChatEventReplay } from "../persistence/queries";\nimport { isBelowHistoryFloor } from "../substrate/auth";\nimport type { ChatService } from "../contract/service";\nfunction createReplayChatEvents(): ChatService["replayChatEvents"] {\n  return async () => (await loadChatEventReplay()).filter((event) => isBelowHistoryFloor(event, 1));\n}\nexport const x = createReplayChatEvents;\n',
      },
      expect: { count: 1, token: "loadChatEventReplay" },
      why: "the positive floor verdict retains exactly the pre-join events it must withhold — presence of the clamp call is not enough without the rejecting polarity",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { replayChatEvents: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadChatEventReplay } from "../persistence/queries";\nimport { isBelowHistoryFloor } from "../substrate/auth";\nimport type { ChatService } from "../contract/service";\ndeclare const unrelated: number;\nfunction createReplayChatEvents(): ChatService["replayChatEvents"] {\n  return async (_params: never, floor: number) => (await loadChatEventReplay()).filter((event) => !isBelowHistoryFloor(unrelated, floor));\n}\nexport const x = createReplayChatEvents;\n',
      },
      expect: { count: 1, token: "loadChatEventReplay" },
      why: "a correctly negated verdict over an unrelated event does not clamp the filtered canon row",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { replayChatEvents: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadChatEventReplay } from "../persistence/queries";\nimport { isBelowHistoryFloor } from "../substrate/auth";\nimport type { ChatService } from "../contract/service";\ndeclare const unrelatedFloor: number;\nfunction createReplayChatEvents(): ChatService["replayChatEvents"] {\n  return async (_params: never, floor: number) => (await loadChatEventReplay()).filter((event) => !isBelowHistoryFloor(event, unrelatedFloor) && floor > 0);\n}\nexport const x = createReplayChatEvents;\n',
      },
      expect: { count: 1, token: "loadChatEventReplay" },
      why: "a clamp fed an unrelated number is not bound to the viewer's resolved history floor",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { replayChatEvents: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadChatEventReplay } from "../persistence/queries";\nimport { isBelowHistoryFloor } from "../substrate/auth";\nimport type { ChatService } from "../contract/service";\ndeclare const otherRows: number[];\nfunction createReplayChatEvents(): ChatService["replayChatEvents"] {\n  return async () => {\n    const rows = await loadChatEventReplay();\n    const unrelated = otherRows.filter((e) => !isBelowHistoryFloor(e, 1));\n    return rows.concat(unrelated);\n  };\n}\nexport const x = createReplayChatEvents;\n',
      },
      expect: { count: 1, token: "loadChatEventReplay" },
      why: "a clamp over unrelated rows reachable from the same verb cannot discharge the floorless canon read",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { listMessages: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadCanonHistory } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => await loadCanonHistory();\n}\nexport const x = createListMessages;\n',
      },
      expect: { count: 1, token: "loadCanonHistory" },
      why: "a `member`-classified verb calling the floorless loadCanonHistory — the exact shape D79 says must be RED",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { editMessage: "author-or-host" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/edit.ts":
          'import { loadCanonHistory } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nasync function gather(): Promise<number[]> {\n  return await loadCanonHistory();\n}\nfunction createEditMessage(): ChatService["editMessage"] {\n  return async () => await gather();\n}\nexport const x = createEditMessage;\n',
      },
      expect: { count: 1, token: "loadCanonHistory" },
      why: "the read hidden behind a module-local helper — laundering it through one hop must not launder it past the policy",
    },
    {
      // #1091 MEMBER KIND — a row whose VALUE is a local const. On the real tree `getChat: MEMBER_AUTHORITY_PROBE`
      // took the census 93 -> 92 with the gate still green: the verb stopped being judged, silently. The `host`
      // row keeps the matrix non-empty, so the blindness arm cannot stand in for this red.
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'const MEMBER_AUTHORITY = "member" as const;\nexport const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: MEMBER_AUTHORITY } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadCanonHistory } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => await loadCanonHistory();\n}\nfunction createPreviewAssembly(): ChatService["previewAssembly"] {\n  return async () => [];\n}\nexport const x = [createListMessages, createPreviewAssembly];\n',
      },
      expect: { count: 1, token: "loadCanonHistory" },
      why: "a viewer-plane row written as a LOCAL CONST is still a viewer-plane row — resolving the value is what keeps the verb judged",
    },
    {
      // The same value one module away: an IMPORTED authority const, the shape a shared vocabulary file makes
      // natural. Resolved through the same shared stable-binding hop the matrix object itself takes.
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/authorities.ts": 'export const MEMBER = "member" as const;\n',
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'import { MEMBER } from "./authorities";\nexport const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: MEMBER } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadCanonHistory } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => await loadCanonHistory();\n}\nfunction createPreviewAssembly(): ChatService["previewAssembly"] {\n  return async () => [];\n}\nexport const x = [createListMessages, createPreviewAssembly];\n',
      },
      expect: { count: 1, token: "loadCanonHistory" },
      why: "an IMPORTED authority const must not launder a verb out of the judged set",
    },
    {
      // A SHORTHAND member (`{ previewAssembly, listMessages }`) — one editor refactor away from the inline row,
      // and the exact shape #1035 caught dropping a drizzle column with its whole FK obligation.
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'const listMessages = "member" as const;\nexport const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadCanonHistory } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => await loadCanonHistory();\n}\nfunction createPreviewAssembly(): ChatService["previewAssembly"] {\n  return async () => [];\n}\nexport const x = [createListMessages, createPreviewAssembly];\n',
      },
      expect: { count: 1, token: "loadCanonHistory" },
      why: "a shorthand row resolves through its binding — before #1091 it fell out of the fold with no throw and no count",
    },
    {
      // A COMPUTED key whose expression is a string literal. Before #1091 this read as the literal key text
      // `["listMessages"]`, which matches no factory — so it produced an UNCHECKED coverage finding instead of
      // judging the verb: loud, but about the wrong thing, and the real read went unjudged.
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", ["listMessages"]: "member" } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadCanonHistory } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => await loadCanonHistory();\n}\nfunction createPreviewAssembly(): ChatService["previewAssembly"] {\n  return async () => [];\n}\nexport const x = [createListMessages, createPreviewAssembly];\n',
      },
      expect: { count: 1, token: "loadCanonHistory" },
      why: "a computed STRING-LITERAL key names its verb — the resolved key must be the verb, not the bracket text",
    },
    {
      // THE §4.3a SHAPE THE LEGACY DISCRIMINATOR EXISTED FOR, now proved by COORDINATES: one body reaching TWO
      // banned readers is TWO findings at two authored positions, so each is independently waivable. The legacy
      // `<verb>:<reader>` token could express this only as a label; the final position does it by construction.
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { listMessages: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadCanonHistory, loadChatEventReplay } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => [...(await loadCanonHistory()), ...(await loadChatEventReplay())];\n}\nexport const x = createListMessages;\n',
      },
      expect: { count: 2 },
      why: "TWO banned readers in ONE body are TWO findings at two distinct authored positions — the independent-waivability property §4.3a names, held by the coordinate rather than by a discriminator label",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/base-matrix.ts": 'export const BASE_AUTHORITY = { replayChatEvents: "member" } as const;\n',
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'import { BASE_AUTHORITY } from "./base-matrix";\nexport const CHAT_VERB_AUTHORITY = { ...BASE_AUTHORITY, listMessages: "member" } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadChatEventReplay } from "../persistence/queries";\nimport { isBelowHistoryFloor } from "../substrate/auth";\nimport type { ChatService } from "../contract/service";\nfunction createReplayChatEvents(): ChatService["replayChatEvents"] {\n  return async (_params: never, floor: number) => (await loadChatEventReplay()).filter((event) => !isBelowHistoryFloor(event, floor));\n}\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => [];\n}\nexport const x = [createReplayChatEvents, createListMessages];\n',
      },
      why: "the SPLIT's green half: the spread-in verb DISCHARGES structurally (its rows are filtered through the one floor verdict) — resolving the spread widens the judged set without widening the accusation",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadCanonHistory } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createPreviewAssembly(): ChatService["previewAssembly"] {\n  return async () => await loadCanonHistory();\n}\nexport const x = createPreviewAssembly;\n',
      },
      why: "a `host`-classified verb reading full canon is the ROOM plane doing its job — untouched",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { replayChatEvents: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadChatEventReplay } from "../persistence/queries";\nimport { isBelowHistoryFloor } from "../substrate/auth";\nimport type { ChatService } from "../contract/service";\nfunction createReplayChatEvents(): ChatService["replayChatEvents"] {\n  return async (_params: never, floor: number) => (await loadChatEventReplay()).filter((event) => !isBelowHistoryFloor(event, floor));\n}\nexport const x = createReplayChatEvents;\n',
      },
      why: "the STRUCTURAL discharge: a viewer-plane verb retains only filtered canon elements whose canonical floor verdict is false",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { replayChatEvents: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<Array<{ payload: number }>> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadChatEventReplay } from "../persistence/queries";\nimport { isBelowHistoryFloor } from "../substrate/auth";\nimport type { ChatService } from "../contract/service";\nfunction createReplayChatEvents(): ChatService["replayChatEvents"] {\n  return async (_params: never, membership: { historyFloorSeq: number }) => (await loadChatEventReplay()).filter(({ payload }) => !isBelowHistoryFloor(payload, membership.historyFloorSeq));\n}\nexport const x = createReplayChatEvents;\n',
      },
      why: "the production replay shape: a destructured payload is the filtered row's canon event and membership.historyFloorSeq is the viewer's resolved floor",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { listMessages: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\nexport async function loadMessagesPage(_floor: number): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadMessagesPage } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => await loadMessagesPage(0);\n}\nexport const x = createListMessages;\n',
      },
      why: "the correct shape: a viewer-plane verb using the floor-TAKING read — the policy must not fire on the good path",
    },
    {
      // VALUE FIDELITY, not merely key presence: the resolved authority must be the STRING the const holds. A
      // reader that resolved the key but handed back the identifier text would classify this room-plane verb as
      // viewer-plane (every unknown authority is viewer-plane by design) and accuse the ROOM plane of its job.
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'const HOST_AUTHORITY = "host" as const;\nexport const CHAT_VERB_AUTHORITY = { previewAssembly: HOST_AUTHORITY } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadCanonHistory } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createPreviewAssembly(): ChatService["previewAssembly"] {\n  return async () => await loadCanonHistory();\n}\nexport const x = createPreviewAssembly;\n',
      },
      why: "a `host` authority written as a const is still `host` — resolving the member must widen the judged set without widening the accusation",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
      },
      expect: { messageIncludes: "keys every verdict off it, so a clean result would be blindness rather than safety" },
      why: "NO MATRIX, NO VERDICT: with the matrix absent from the declared population this arm must WITHHOLD rather than report a clean chat domain — the legacy module returned after one file-level finding, which on the ordinary arm would have been a silent green",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { ...baseAuthority(), listMessages: "member" } as const;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
      },
      expect: { messageIncludes: "unsupported CHAT_VERB_AUTHORITY expression" },
      why: "a matrix this reader cannot establish must never read as a SMALLER matrix on the occurrence arm either — the reach verdict withholds with the health sibling rather than judging a partial matrix",
    },
  ],
});
