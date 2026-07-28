// Gate: chat-viewer-plane-canon-reads (D16 read-visibility — the two-plane model) — a VIEWER-PLANE chat
// verb may not reach the ROOM-PLANE (floorless) canon readers.
//
// THE MODEL. The unit of read visibility is the canon row (`messages.seq`). Two planes:
//  • ROOM plane — turn assembly, the engine, compaction, quiet extraction, arbitration, the firehose. Reads
//    FULL canon under the host's authority. Unclamped BY TYPE.
//  • VIEWER plane — any bytes leaving the server toward a specific human. Clamped by that human's own join
//    floor (`substrate/auth/clamp.ts::resolveHistoryFloorSeq`, stamped once at `guard.ts::requireParticipant`).
// `persistence/queries.ts` holds BOTH families side by side: the three floor-REQUIRED reads
// (`loadMessagesPage`/`loadStreamReplay`/`loadMessageSlots` — a caller cannot forget the floor, it's a
// required param) and the floorless room-plane readers. Nothing separated them but convention, and the
// convention has already failed once OUTSIDE this domain (automation's `canInstallerSeeFact` re-derived chat
// visibility as membership-only). This gate makes the separation structural INSIDE the domain.
//
// THE RULE. Keyed off the LIVE authority matrix (`substrate/auth/matrix.ts::CHAT_VERB_AUTHORITY`), never a
// hardcoded path list: a verb whose matrix authority is anything OTHER than `host`/`non-chat-scoped` is
// viewer-plane, and its factory may not call a BULK canon reader.
//
// WHY THE BANNED SET IS THE *BULK* READERS. A reader that returns MANY canon rows' CONTENT for a chatId with
// no floor param is the leak class: it needs no prior knowledge, so "forgot the floor" hands over the whole
// pre-join transcript. Single-row-by-id readers (`loadMessageView`, `loadSlotTarget`, `loadContinueSnapshot`)
// are NOT banned: they require the caller to already NAME the row, and per the ratified id-plane principle a
// clamped member can only learn a row id through an equally-clamped read. Id/seq-only readers
// (`loadMessageSeqs`) and the activity plane (`loadVariableDeltas`) carry no transcript bytes.
//
// TWO DISCHARGES, in this order:
//  1. STRUCTURAL — the same reachable body also calls `isBelowHistoryFloor` (the ONE per-event verdict). A
//     verb that reads room-plane canon and visibly clamps it before egress is correct by construction
//     (`replayChatEvents` is exactly this shape). Preferred: it survives renames and needs no bookkeeping.
//  2. ALLOWLIST — a `verb:reader` pair whose product provably leaves the viewer plane (numbers, not bytes) or
//     is room-plane machinery a member merely TRIGGERS (a turn is one shared utterance; the prompt is the
//     room's, the transcript is the reader's). Every entry carries its reason. The list is RATCHETED: an
//     entry whose call site is gone is RED, so it can't rot into a standing exemption.
//
// THREE FAIL-LOUD ARMS, because a structural gate's real failure mode is going silently GREEN:
//  • matrix missing / unreadable      → RED (the key vanished; the gate is blind)
//  • a banned reader name not declared anywhere in the project → RED (the reader was renamed past the gate)
//  • a viewer-plane verb with no discoverable `ChatService["<verb>"]`-annotated factory → RED (the verb moved
//    out of scanRoot, or lost the annotation this gate resolves implementations through)
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const MATRIX_CONST = "CHAT_VERB_AUTHORITY";
const SERVICE_TYPE = "ChatService";
const CLAMP_FN = "isBelowHistoryFloor";
const CHAT_DOMAIN_RE = /(?:^|\/)packages\/server\/src\/domain\/chat\//u;

/** Matrix authorities that are ROOM plane (host-gated machinery) or gated elsewhere entirely. Everything
 *  else — including any authority added later — is viewer plane, so a NEW authority is checked by default. */
const ROOM_PLANE_AUTHORITIES: ReadonlySet<string> = new Set(["host", "non-chat-scoped"]);

/** The floorless BULK canon readers: many rows of canon CONTENT for a chatId, no floor parameter. */
const BULK_CANON_READERS: ReadonlySet<string> = new Set([
  "loadCanonHistory", // every committed row's MessageView (content included), whole chat
  "loadCanonHistoryAfter", // the same, from a seq — an `afterSeq` is a cursor, NOT a visibility floor
  "loadChatEventReplay", // the durable bus log: MessageView payloads + raw `delta` transcript text
]);

/** Sanctioned `verb:reader` pairs — genuine ROOM-plane reads reached from a viewer-plane entry point. */
const ALLOWLIST: ReadonlyMap<string, string> = new Map([
  [
    "previewContextFit:loadCanonHistory",
    "the fit preview returns NUMBERS + one boundary id, never canon bytes: the canon is token-counted and " +
      "discarded. The fit budget is deliberately room-wide (one shared window), and the boundary id is the " +
      "ratified id plane.",
  ],
  [
    "send:loadCanonHistory",
    "turn assembly + the first-user-turn greeting-freeze probe — the prompt is the ROOM's. A turn is one " +
      "shared utterance broadcast to every member, so per-reader assembly is incoherent; the reply's BYTES " +
      "reach each member through the clamped bus/read paths.",
  ],
  [
    "commitMessage:loadCanonHistory",
    "the D56 post-without-generate verb shares `send`'s COMMIT half (`commitUserTurn`), so it reaches the " +
      "SAME first-user-turn greeting-freeze probe. Its product is a BOOLEAN (`isFirstUserTurn`) + a server-side " +
      "greeting-volatile freeze — NO canon bytes flow to the caller (it returns only the just-committed user " +
      "row, §3.6-projected). Byte-identical room-plane use to `send:loadCanonHistory` above.",
  ],
]);

const MESSAGE =
  "a VIEWER-PLANE chat verb (matrix authority other than host/non-chat-scoped) reaches a ROOM-PLANE floorless " +
  "canon reader. Those readers return canon CONTENT with no history floor, so the caller silently hands a " +
  "`from-join` member the pre-join transcript every other read path withholds (D16 — substrate/auth/clamp.ts).";
const FIX =
  "use a floor-taking read (`loadMessagesPage`/`loadStreamReplay`/`loadMessageSlots` with the " +
  "`historyFloorSeq` the guard already stamped on the membership), or clamp the result in the same body via " +
  "`isBelowHistoryFloor`. If the read is genuinely ROOM-plane (its product leaves no canon bytes toward the " +
  "caller), add a `verb:reader` entry with its reason to ALLOWLIST in scripts/check/gates/chat-viewer-plane-canon-reads.ts.";

type VerbImpl = { readonly verb: string; readonly node: Node; readonly file: SourceFile };

// ── AST helpers ────────────────────────────────────────────────────────────────────────────────────────

/** Peel `as const` / `satisfies X` / parens off an initializer. AST readers that skip this go silently
 *  GREEN on the very shape the repo writes its single-source maps in. */
function unwrap(node: Node | undefined): Node | undefined {
  let cur = node;
  while (
    cur !== undefined &&
    (cur.isKind(SyntaxKind.AsExpression) || cur.isKind(SyntaxKind.SatisfiesExpression) || cur.isKind(SyntaxKind.ParenthesizedExpression))
  ) {
    cur = cur.getExpression();
  }
  return cur;
}

/** `CHAT_VERB_AUTHORITY` as verb → authority, found by NAME anywhere in the project (not by path, so the
 *  matrix can move); `undefined` when no readable declaration exists. */
function matrixFromFile(sf: SourceFile): ReadonlyMap<string, string> | undefined {
  const decl = sf.getVariableDeclaration(MATRIX_CONST);
  const obj = unwrap(decl?.getInitializer())?.asKind(SyntaxKind.ObjectLiteralExpression);
  const out = new Map<string, string>();
  for (const prop of obj?.getProperties() ?? []) {
    const assign = prop.asKind(SyntaxKind.PropertyAssignment);
    const value = unwrap(assign?.getInitializer())?.asKind(SyntaxKind.StringLiteral);
    if (assign !== undefined && value !== undefined) {
      out.set(assign.getName().replace(/^["']|["']$/gu, ""), value.getLiteralText());
    }
  }
  return out.size > 0 ? out : undefined;
}

function readMatrix(ctx: GateRunCtx): ReadonlyMap<string, string> | undefined {
  let found: ReadonlyMap<string, string> | undefined;
  for (const sf of ctx.project.getSourceFiles()) {
    found = matrixFromFile(sf);
    if (found !== undefined) {
      break;
    }
  }
  return found;
}

/** The verb names a return-type annotation claims: `ChatService["send"]`, `Pick<ChatService, "a" | "b">`.
 *  Shape-tolerant on purpose — it collects the string-literal types under any node mentioning ChatService. */
function verbsFromReturnType(fn: Node): string[] {
  const typeNode = fn.asKind(SyntaxKind.FunctionDeclaration)?.getReturnTypeNode() ?? fn.asKind(SyntaxKind.ArrowFunction)?.getReturnTypeNode();
  if (typeNode === undefined || !typeNode.getText().includes(SERVICE_TYPE)) {
    return [];
  }
  return typeNode.getDescendantsOfKind(SyntaxKind.StringLiteral).map((l) => l.getLiteralText());
}

/** Every module-local function in a file, by name — the one-hop-and-deeper resolution target, so extracting
 *  a banned read into a file-local helper does not launder it past this gate. */
function localFunctions(sf: SourceFile): ReadonlyMap<string, Node> {
  const out = new Map<string, Node>();
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (name !== undefined) {
      out.set(name, fn);
    }
  }
  for (const v of sf.getVariableDeclarations()) {
    const init = unwrap(v.getInitializer());
    if (init?.isKind(SyntaxKind.ArrowFunction) === true || init?.isKind(SyntaxKind.FunctionExpression) === true) {
      out.set(v.getName(), init);
    }
  }
  return out;
}

/** The identifier a CallExpression calls (`f(…)`), ignoring member calls (`x.f(…)` is never one of ours —
 *  the readers are module-scope imports). */
function calleeName(call: Node): string | undefined {
  return call.asKind(SyntaxKind.CallExpression)?.getExpression().asKind(SyntaxKind.Identifier)?.getText();
}

type Reach = { readerCalls: Node[]; clamped: boolean; readonly seen: Set<Node>; readonly queue: Node[] };

/** One function body's contribution to the reachability walk: banned-reader hits, the clamp discharge, and
 *  the module-local callees to descend into. */
function scanBody(fn: Node, locals: ReadonlyMap<string, Node>, acc: Reach): void {
  for (const call of fn.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const name = calleeName(call) ?? "";
    if (BULK_CANON_READERS.has(name)) {
      acc.readerCalls.push(call);
    }
    acc.clamped = acc.clamped || name === CLAMP_FN;
    const local = locals.get(name);
    if (local !== undefined && !acc.seen.has(local)) {
      acc.seen.add(local);
      acc.queue.push(local);
    }
  }
}

/** Every banned-reader call reachable from `root` through module-local helper calls, plus whether the same
 *  reachable body applies the clamp. Cycle-guarded by the visited-function set. */
function reachFrom(root: Node, locals: ReadonlyMap<string, Node>): Reach {
  const acc: Reach = { readerCalls: [], clamped: false, seen: new Set<Node>([root]), queue: [root] };
  for (let fn = acc.queue.pop(); fn !== undefined; fn = acc.queue.pop()) {
    scanBody(fn, locals, acc);
  }
  return acc;
}

// ── the pass ───────────────────────────────────────────────────────────────────────────────────────────

function fileLevel(ctx: GateRunCtx, message: string): void {
  ctx.report({ file: "packages/server/src/domain/chat/substrate/auth/matrix.ts", line: 0, column: 0, message });
}

/** Every `ChatService["<verb>"]`-annotated implementation in the chat domain. */
function discoverVerbImpls(files: readonly SourceFile[]): VerbImpl[] {
  const out: VerbImpl[] = [];
  for (const sf of files) {
    for (const fn of [...sf.getFunctions(), ...sf.getDescendantsOfKind(SyntaxKind.ArrowFunction)]) {
      for (const verb of verbsFromReturnType(fn)) {
        out.push({ verb, node: fn, file: sf });
      }
    }
  }
  return out;
}

function reportReaderCall(ctx: GateRunCtx, call: Node, at: { readonly verb: string; readonly reader: string; readonly authority: string }): void {
  const sf = call.getSourceFile();
  const { line, column } = sf.getLineAndColumnAtPos(call.getStart());
  ctx.report({
    file: sf.getFilePath().replace(`${ctx.root}/`, ""),
    line,
    column,
    token: at.reader,
    message: `${at.verb} (matrix authority "${at.authority}", viewer plane) calls the floorless room-plane reader ${at.reader}(). ${MESSAGE} See packages/server/src/domain/chat/substrate/auth/clamp.ts.`,
  });
}

function isViewerPlane(authority: string | undefined): boolean {
  return authority !== undefined && !ROOM_PLANE_AUTHORITIES.has(authority);
}

/** Fail-loud arm: a banned reader that no longer exists means it was RENAMED past this gate. */
function checkReaderRot(ctx: GateRunCtx, files: readonly SourceFile[]): void {
  const declared = new Set(files.flatMap((sf) => sf.getFunctions().map((f) => f.getName() ?? "")));
  for (const reader of BULK_CANON_READERS) {
    if (!declared.has(reader)) {
      fileLevel(
        ctx,
        `the room-plane reader "${reader}" is no longer declared in domain/chat — this gate's BULK_CANON_READERS list has rotted (a rename would leave the gate silently green). Update scripts/check/gates/chat-viewer-plane-canon-reads.ts.`,
      );
    }
  }
}

/** Judge ONE viewer-plane verb implementation; returns the allowlist keys it consumed. */
function checkImpl(ctx: GateRunCtx, impl: VerbImpl, authority: string, locals: ReadonlyMap<string, Node>): readonly string[] {
  const { readerCalls, clamped } = reachFrom(impl.node, locals);
  if (clamped) {
    return []; // structural discharge: the body applies the one per-event verdict before egress
  }
  const used: string[] = [];
  for (const call of readerCalls) {
    const reader = calleeName(call) ?? "";
    const key = `${impl.verb}:${reader}`;
    if (ALLOWLIST.has(key)) {
      used.push(key);
    } else {
      reportReaderCall(ctx, call, { verb: impl.verb, reader, authority });
    }
  }
  return used;
}

/** Fail-loud arm: a viewer-plane verb this gate cannot resolve is a verb it is not checking. */
function checkCoverage(ctx: GateRunCtx, matrix: ReadonlyMap<string, string>, covered: ReadonlySet<string>): void {
  for (const [verb, authority] of matrix) {
    if (isViewerPlane(authority) && !covered.has(verb)) {
      fileLevel(
        ctx,
        `viewer-plane verb "${verb}" (authority "${authority}") has no discoverable \`${SERVICE_TYPE}["${verb}"]\`-annotated factory under domain/chat — this gate resolves implementations through that annotation, so the verb is UNCHECKED. Annotate its factory's return type (the house convention) or widen the gate.`,
      );
    }
  }
}

/** Ratchet arm: a sanctioned pair whose call site is gone must be deleted, not left standing. Judged only
 *  for verbs actually discovered in this run, so a scoped/synthetic fileset cannot false-flag. */
function checkStaleAllowlist(ctx: GateRunCtx, covered: ReadonlySet<string>, used: ReadonlySet<string>): void {
  for (const key of ALLOWLIST.keys()) {
    const verb = key.slice(0, key.indexOf(":"));
    if (covered.has(verb) && !used.has(key)) {
      fileLevel(
        ctx,
        `stale ALLOWLIST entry "${key}" — that verb no longer reaches that reader. Delete the entry (scripts/check/gates/chat-viewer-plane-canon-reads.ts); a standing exemption for a call site that moved is how the next real one hides.`,
      );
    }
  }
}

export const gate: GateDescriptor = {
  name: "chat-viewer-plane-canon-reads",
  docRow: "ledger D79 (chat read-visibility: two planes, one verdict)",
  status: "active",
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => CHAT_DOMAIN_RE.test(`/${p}`),
  run: (ctx) => {
    const matrix = readMatrix(ctx);
    if (matrix === undefined) {
      fileLevel(
        ctx,
        `${MATRIX_CONST} could not be read — this gate keys every verdict off it, so it is now blind. Restore the matrix (or fix its shape) before shipping.`,
      );
      return;
    }
    const files = ctx.project.getSourceFiles().filter((sf) => CHAT_DOMAIN_RE.test(sf.getFilePath()));
    checkReaderRot(ctx, files);

    const localsByFile = new Map<SourceFile, ReadonlyMap<string, Node>>();
    const covered = new Set<string>();
    const usedAllowlist = new Set<string>();
    for (const impl of discoverVerbImpls(files)) {
      const authority = matrix.get(impl.verb);
      if (authority === undefined || !isViewerPlane(authority)) {
        continue;
      }
      covered.add(impl.verb);
      const locals = localsByFile.get(impl.file) ?? localFunctions(impl.file);
      localsByFile.set(impl.file, locals);
      for (const key of checkImpl(ctx, impl, authority, locals)) {
        usedAllowlist.add(key);
      }
    }

    checkCoverage(ctx, matrix, covered);
    checkStaleAllowlist(ctx, covered, usedAllowlist);
  },
  mustFlag: [
    {
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { listMessages: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadCanonHistory } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => await loadCanonHistory();\n}\nexport const x = createListMessages;\n',
      },
      expect: { messageIncludes: "viewer plane" },
      why: "a `member`-classified verb calling the floorless loadCanonHistory — the exact shape D16 says must be RED",
    },
    {
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { editMessage: "author-or-host" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/edit.ts":
          'import { loadCanonHistory } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nasync function gather(): Promise<number[]> {\n  return await loadCanonHistory();\n}\nfunction createEditMessage(): ChatService["editMessage"] {\n  return async () => await gather();\n}\nexport const x = createEditMessage;\n',
      },
      expect: { messageIncludes: "floorless room-plane reader" },
      why: "the read hidden behind a module-local helper — laundering it through one hop must not launder it past the gate",
    },
    {
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { listMessages: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
      },
      expect: { messageIncludes: "UNCHECKED" },
      why: "a viewer-plane verb with NO discoverable annotated factory — the silent-green case (verb moved / annotation dropped) must be RED, not ignored",
    },
    {
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { listMessages: "host" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts": "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\n",
      },
      expect: { messageIncludes: "has rotted" },
      why: "two banned readers absent from the tree — the rename-past-the-gate blindness must be RED, never silently green",
    },
  ],
  mustPass: [
    {
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
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { replayChatEvents: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadChatEventReplay } from "../persistence/queries";\nimport { isBelowHistoryFloor } from "../substrate/auth";\nimport type { ChatService } from "../contract/service";\nfunction createReplayChatEvents(): ChatService["replayChatEvents"] {\n  return async () => (await loadChatEventReplay()).filter((e) => !isBelowHistoryFloor(e, 1));\n}\nexport const x = createReplayChatEvents;\n',
      },
      why: "the STRUCTURAL discharge: a viewer-plane verb that reads room-plane canon and clamps it in the same body before egress",
    },
    {
      files: {
        "packages/server/src/domain/chat/substrate/auth/matrix.ts":
          'export const CHAT_VERB_AUTHORITY = { listMessages: "member" } as const satisfies Record<string, string>;\n',
        "packages/server/src/domain/chat/persistence/queries.ts":
          "export async function loadCanonHistory(): Promise<number[]> {\n  return [];\n}\nexport async function loadCanonHistoryAfter(): Promise<number[]> {\n  return [];\n}\nexport async function loadChatEventReplay(): Promise<number[]> {\n  return [];\n}\nexport async function loadMessagesPage(_floor: number): Promise<number[]> {\n  return [];\n}\n",
        "packages/server/src/domain/chat/verbs/read.ts":
          'import { loadMessagesPage } from "../persistence/queries";\nimport type { ChatService } from "../contract/service";\nfunction createListMessages(): ChatService["listMessages"] {\n  return async () => await loadMessagesPage(0);\n}\nexport const x = createListMessages;\n',
      },
      why: "the correct shape: a viewer-plane verb using the floor-TAKING read — the gate must not fire on the good path",
    },
  ],
};
