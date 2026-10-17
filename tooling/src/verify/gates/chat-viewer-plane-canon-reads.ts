// Viewer-plane chat verbs require a viewer-floor filter before floorless canon reaches a caller (D161).
// Unreadable matrices and declared viewer verbs without annotated owners refuse before occurrence judgments.
// Reachability follows module-local helpers; waivers license reported calls, never missing prerequisites.

import { defineGate } from "../contract/policy.ts";
import {
  CHAT_DOMAIN_UNDER,
  chatPlaneVisitors,
  createChatPlaneIndex,
  isViewerPlane,
  judgeChatPlane,
  MATRIX_CONST,
  resolveChatMatrix,
  SERVICE_TYPE,
} from "../lib/chat-plane-read.ts";

const MESSAGE =
  "a VIEWER-PLANE chat verb (matrix authority other than host/non-chat-scoped) reaches a ROOM-PLANE floorless " +
  "canon reader. Those readers return canon CONTENT with no history floor, so the caller silently hands a " +
  "`from-join` member the pre-join transcript every other read path withholds (D161 — substrate/auth/clamp.ts). " +
  "The finding is anchored on the reader CALL, so two banned reads in one body are two independently " +
  "waivable findings.";
const FIX =
  "use a floor-taking read (`loadMessagesPage`/`loadStreamReplay`/`loadMessageSlots` with the " +
  "`historyFloorSeq` the guard already stamped on the membership), or clamp the result in the same body via " +
  "`isBelowHistoryFloor`. If the read is genuinely ROOM-plane (its product leaves no canon bytes toward the " +
  "caller), license it at the call site with " +
  "`// @orb-waive chat-viewer-plane-canon-reads(<the reader name at the reported column>): <why no canon bytes reach the caller>`.";

const BLIND = `${MATRIX_CONST} could not be read in the chat domain — this policy keys every verdict off it, so a clean result would be blindness rather than safety. Refusing the run.`;

export const gate = defineGate({
  id: "chat-viewer-plane-canon-reads",
  family: "chat-viewer-plane-canon-reads",
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
        const judgment = judgeChatPlane(index, matrix);
        for (const [verb, authority] of matrix.verbs) {
          if (isViewerPlane(authority) && !judgment.covered.has(verb)) {
            throw new Error(`viewer-plane verb "${verb}" has no discoverable ${SERVICE_TYPE}["${verb}"]-annotated factory under domain/chat; it is UNCHECKED`);
          }
        }
        for (const violation of judgment.violations) {
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
      why: "a `member`-classified verb calling the floorless loadCanonHistory — the exact shape D161 says must be RED",
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
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", cleanupChats: "non-chat-scoped" } as const;\n',
      },
      why: "Room-plane verbs create no viewer-plane implementation obligation; this is not a global nonempty-factory certification.",
    },
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
        "packages/server/src/domain/chat/substrate/auth/matrix.ts": 'export const CHAT_VERB_AUTHORITY = { listMessages: "member" } as const;\n',
      },
      expect: { messageIncludes: "UNCHECKED" },
      why: "A declared viewer-plane verb needs its annotated implementation before any reachability verdict; this prerequisite cannot be waived.",
    },
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
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { ...MISSING_BASE, listMessages: "member" } as const;\n',
      },
      expect: { messageIncludes: 'CHAT_VERB_AUTHORITY binding "MISSING_BASE" resolves to no local declaration or named import' },
      why: "a matrix spread of an identifier nothing binds refuses rather than folding the rows it can see",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          "export const OTHER = { ...CHAT_VERB_AUTHORITY };\nexport const CHAT_VERB_AUTHORITY = { ...OTHER } as const;\n",
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
      },
      expect: { messageIncludes: "which resolved to zero verbs" },
      why: "a spread that contributes ZERO verbs refuses — an empty contribution is the silent-shrink shape the blindness arm cannot see, because the matrix stays non-empty",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: authorityFor() } as const;\n',
      },
      expect: { messageIncludes: "unsupported CHAT_VERB_AUTHORITY value" },
      why: "a matrix VALUE built by a CALL refuses — an unreadable authority must never DROP its verb, which is the one direction that is silent",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: MISSING } as const;\n',
      },
      expect: { messageIncludes: 'CHAT_VERB_AUTHORITY value binding "MISSING" resolves to no local declaration or named import' },
      why: "a matrix VALUE identifier nothing binds refuses rather than silently dropping that verb from the classified set",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'const A = B;\nconst B = A;\nexport const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages: A } as const;\n',
      },
      expect: { messageIncludes: "CHAT_VERB_AUTHORITY value binding cycle" },
      why: "a matrix VALUE binding cycle (`const A = B; const B = A;`) refuses instead of recursing — the value chain is its OWN cycle domain",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts": 'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages } as const;\n',
      },
      expect: { messageIncludes: 'CHAT_VERB_AUTHORITY value binding "listMessages" resolves to no local declaration or named import' },
      why: "a SHORTHAND row nothing binds refuses — before #1091 it fell out of the fold with no throw and no count",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", [verbKey]: "member" } as const;\n',
      },
      expect: { messageIncludes: "computed CHAT_VERB_AUTHORITY key" },
      why: "a COMPUTED key that is not a string literal refuses — a key this reader cannot NAME matches no factory, so it would report an UNCHECKED verb that does not exist while the real one went unjudged",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", listMessages() { return "member"; } } as const;\n',
      },
      expect: { messageIncludes: "unsupported CHAT_VERB_AUTHORITY member kind MethodDeclaration" },
      why: "a METHOD member refuses by its own kind — a member kind the fold cannot answer must never be dropped",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { previewAssembly: "host", get listMessages() { return "member"; } } as const;\n',
      },
      expect: { messageIncludes: "unsupported CHAT_VERB_AUTHORITY member kind GetAccessor" },
      why: "a GETTER member refuses by its own kind — the fold is TOTAL, so every member either writes a row or throws",
    },
  ],
});
