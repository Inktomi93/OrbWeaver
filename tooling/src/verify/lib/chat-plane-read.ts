// THE CHAT TWO-PLANE READER (ledger D161) — the canonical vocabulary and the visitor-fed evidence both
// `chat-viewer-plane-canon-reads` (ordinary reach) and `chat-viewer-plane-canon-reads-health` (hard
// matrix/reader/coverage health) judge. It is the family's shared declaration: the authority matrix fold,
// the bulk-reader vocabulary, the reachability index and the clamp discharge live here once, so the two
// siblings cannot drift into two answers about the same bytes.
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
// visibility as membership-only). The family makes the separation structural INSIDE the domain.
//
// THE RULE. Keyed off the LIVE authority matrix (`substrate/auth/matrix.ts::CHAT_VERB_AUTHORITY`), never a
// hardcoded path list: a verb whose matrix authority is anything OTHER than `host`/`non-chat-scoped` is
// viewer-plane, and its factory may not reach a BULK canon reader.
//
// WHY THE BANNED SET IS THE *BULK* READERS. A reader that returns MANY canon rows' CONTENT for a chatId with
// no floor param is the leak class: it needs no prior knowledge, so "forgot the floor" hands over the whole
// pre-join transcript. Single-row-by-id readers (`loadMessageView`, `loadSlotTarget`, `loadContinueSnapshot`)
// are NOT banned: they require the caller to already NAME the row, and per the ratified id-plane principle a
// clamped member can only learn a row id through an equally-clamped read. Id/seq-only readers
// (`loadMessageSeqs`) and the activity plane (`loadVariableDeltas`) carry no transcript bytes.
//
// THE ONE STRUCTURAL DISCHARGE. The reader's own result is filtered through `isBelowHistoryFloor` (the ONE
// per-event verdict). A verb that reads room-plane canon and visibly clamps those rows before egress is
// correct (`replayChatEvents` is exactly this shape). It survives renames and needs no bookkeeping. The
// SECOND legacy discharge — a gate-local `verb:reader` ALLOWLIST with its own stale-ratchet arm — did not
// survive conversion (standing law §5/§8: a gate-local authority artifact receives a central home). Its
// three rows are now central `@orb-waive chat-viewer-plane-canon-reads(<position>): <reason>` markers at the
// call sites themselves, and central reconciliation owns the staleness judgment the ratchet arm used to.
//
// THE MATRIX IS RESOLVED, NOT READ FLAT (#947): its object literal is read through the shared stable-binding
// reader (`_shared/reference-fact.ts`), following object SPREADS of local/imported sibling matrices.
// `{...BASE_AUTHORITY, listMessages:"member"}` used to yield ONE verb while staying non-empty — so the
// blindness arm was satisfied, the gate reported a live matrix, and every spread-in viewer-plane verb was
// simply not judged. Composition shapes the matrix's own law does not sanction (a spread of a call, an
// unresolvable binding, a cycle) refuse loudly instead.
//
// AND EVERY MEMBER KIND IS ANSWERED, NONE IS SKIPPED (#1091, the #1035 rule carried here). The fold read
// exactly one shape — a `PropertyAssignment` whose value unwraps to a StringLiteral — and let every other
// member kind fall out of the loop with no throw and no count. Measured: `getChat: MEMBER_AUTHORITY_PROBE`
// beside `const MEMBER_AUTHORITY_PROBE = "member" as const` took the live census 93 -> 92 with the gate
// still green. A verb missing from the matrix is a verb nothing classifies, so its factory is judged for
// nothing — the D161 leak class going invisible in the one direction that is silent. The fold is TOTAL:
// every member either writes a row or THROWS. A value resolves through `as const`/`satisfies`/parens and
// through an identifier's binding (local const or named import); a SHORTHAND resolves through the same hop;
// a COMPUTED key resolves when its expression is a string literal. Everything else — a non-literal value
// that binds to nothing, a value-binding cycle, a non-literal computed key, a method, an accessor — refuses.
//
// WHY THE EVIDENCE IS VISITOR-FED. The dispatcher's kind-indexed walk is the only walk (standing law §2):
// the index below is built from the delivered node stream and an ancestor hop, never from a project sweep
// or a per-candidate descendant re-walk. `callsIn` reproduces the legacy `fn.getDescendantsOfKind(Call)`
// exactly, because a call is registered under EVERY function that encloses it.

import { readStaticString, resolveLexicalValueDeclaration, resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import type { ReferenceUnresolvedReason } from "@orb/tooling/_shared/reference-fact-contract";
import type { Node as MorphNode, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyVisitor } from "../contract/policy-primitives.ts";
import { readStringValue, unwrapExpression } from "./ast-read.ts";

export const CHAT_DOMAIN_UNDER = "packages/server/src/domain/chat/**";
export const CHAT_MATRIX_FILE = "packages/server/src/domain/chat/substrate/auth/matrix.ts";
export const CHAT_QUERIES_FILE = "packages/server/src/domain/chat/persistence/queries.ts";
export const MATRIX_CONST = "CHAT_VERB_AUTHORITY";
export const SERVICE_TYPE = "ChatService";
const CLAMP_FN = "isBelowHistoryFloor";

/** How many characters of an unsupported matrix expression a refusal quotes. */
const DIAGNOSTIC_PREVIEW_CHARS = 120;

const FLOOR_BINDING_RE = /^(?:floor|floorSeq|historyFloorSeq)$/u;
const MEMBERSHIP_BINDING_RE = /(?:^|\.)membership$/u;

/** Matrix authorities that are ROOM plane (host-gated machinery) or gated elsewhere entirely. Everything
 *  else — including any authority added later — is viewer plane, so a NEW authority is checked by default. */
const ROOM_PLANE_AUTHORITIES: ReadonlySet<string> = new Set(["host", "non-chat-scoped"]);

/** The floorless BULK canon readers: many rows of canon CONTENT for a chatId, no floor parameter. */
const BULK_CANON_READERS: ReadonlySet<string> = new Set([
  "loadCanonHistory", // every committed row's MessageView (content included), whole chat
  "loadCanonHistoryAfter", // the same, from a seq — an `afterSeq` is a cursor, NOT a visibility floor
  "loadChatEventReplay", // the durable bus log: MessageView payloads + raw `delta` transcript text
]);

/** The parameter is `string`, NOT `string | undefined`, and that is the enforcement (#1091): an
 *  unclassified verb used to arrive here as `undefined` and answer "not viewer plane" — the false-negative
 *  direction. Every caller must decide what an unclassified verb means BEFORE asking. */
export function isViewerPlane(authority: string): boolean {
  return !ROOM_PLANE_AUTHORITIES.has(authority);
}

/** A refusal reason's class. `cycle` and `missing`-family reasons keep the vocabulary the legacy reader's
 *  own refusals used, so a matrix this reader cannot establish never reads as a SMALLER matrix. */
const REFUSAL_CLASS = {
  cycle: "cycle",
  missing: "unbound",
  ambiguous: "unbound",
  unsupported: "shape",
  dynamic: "shape",
  write: "shape",
} as const satisfies Record<ReferenceUnresolvedReason, "cycle" | "unbound" | "shape">;

function preview(node: MorphNode): string {
  return node.getText().slice(0, DIAGNOSTIC_PREVIEW_CHARS);
}

/** A source-manifest key: `<repo-relative file>#<CONST>`, so the scan line reads the same as every other
 *  policy's rather than leaking an absolute worktree path. */
function sourceKey(node: MorphNode, name: string): string {
  const path = node.getSourceFile().getFilePath();
  const idx = path.indexOf("/packages/");
  return `${idx === -1 ? path : path.slice(idx + 1)}#${name}`;
}

interface VerbImpl {
  readonly verb: string;
  readonly node: MorphNode;
  readonly file: SourceFile;
}

/** The visitor-fed evidence one invocation collects. Every member is filled by `chatPlaneVisitors`; nothing
 *  here re-walks the project or a subtree per candidate. */
export interface ChatPlaneIndex {
  /** Every `CHAT_VERB_AUTHORITY` variable declaration delivered, in document order. */
  readonly matrixDeclarations: MorphNode[];
  /** Every call expression, registered under EVERY enclosing function — the legacy descendant walk. */
  readonly callsByFunction: Map<MorphNode, MorphNode[]>;
  /** Module-local callables by file and name — the one-hop-and-deeper resolution target, so extracting a
   *  banned read into a file-local helper does not launder it past the family. */
  readonly localsByFile: Map<SourceFile, Map<string, MorphNode>>;
  /** Every `ChatService["<verb>"]`-annotated implementation in the population. */
  readonly verbImpls: VerbImpl[];
  /** Every function NAME declared in the population — the reader-rot arm's denominator. */
  readonly declaredFunctionNames: Set<string>;
}

export function createChatPlaneIndex(): ChatPlaneIndex {
  return {
    matrixDeclarations: [],
    callsByFunction: new Map<MorphNode, MorphNode[]>(),
    localsByFile: new Map<SourceFile, Map<string, MorphNode>>(),
    verbImpls: [],
    declaredFunctionNames: new Set<string>(),
  };
}

function isCallable(node: MorphNode): boolean {
  return Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node);
}

/** The verb names a return-type annotation claims: `ChatService["send"]`, `Pick<ChatService, "a" | "b">`.
 *  Shape-tolerant on purpose — it collects the string-literal types under any node mentioning ChatService. */
function verbsFromReturnType(fn: MorphNode): readonly string[] {
  const typeNode = Node.isFunctionDeclaration(fn) || Node.isArrowFunction(fn) ? fn.getReturnTypeNode() : undefined;
  if (typeNode === undefined || !typeNode.getText().includes(SERVICE_TYPE)) {
    return [];
  }
  return typeNode.getDescendantsOfKind(SyntaxKind.StringLiteral).map((literal) => literal.getLiteralText());
}

function localsFor(index: ChatPlaneIndex, file: SourceFile): Map<string, MorphNode> {
  const existing = index.localsByFile.get(file);
  if (existing !== undefined) {
    return existing;
  }
  const fresh = new Map<string, MorphNode>();
  index.localsByFile.set(file, fresh);
  return fresh;
}

/** Register one call under every function that encloses it — byte-for-byte the set the legacy
 *  `fn.getDescendantsOfKind(SyntaxKind.CallExpression)` returned for each of those functions. */
function registerCall(index: ChatPlaneIndex, call: MorphNode): void {
  for (let cur = call.getParent(); cur !== undefined; cur = cur.getParent()) {
    if (isCallable(cur)) {
      const calls = index.callsByFunction.get(cur) ?? [];
      calls.push(call);
      index.callsByFunction.set(cur, calls);
    }
  }
}

function registerFunctionDeclaration(index: ChatPlaneIndex, node: MorphNode, sourceFile: SourceFile): void {
  const name = Node.isFunctionDeclaration(node) ? node.getName() : undefined;
  if (name !== undefined) {
    index.declaredFunctionNames.add(name);
    localsFor(index, sourceFile).set(name, node);
  }
}

function registerVariableDeclaration(index: ChatPlaneIndex, node: MorphNode, sourceFile: SourceFile): void {
  if (!Node.isVariableDeclaration(node)) {
    return;
  }
  if (node.getName() === MATRIX_CONST) {
    index.matrixDeclarations.push(node);
  }
  const initializer = node.getInitializer();
  const inner = initializer === undefined ? undefined : unwrapExpression(initializer);
  if (inner !== undefined && (Node.isArrowFunction(inner) || Node.isFunctionExpression(inner))) {
    localsFor(index, sourceFile).set(node.getName(), inner);
  }
}

/** The dispatcher-fed collection. These four kinds are the whole evidence plane of both siblings. */
export function chatPlaneVisitors(index: ChatPlaneIndex): readonly GatePolicyVisitor[] {
  return [
    {
      kinds: [SyntaxKind.VariableDeclaration, SyntaxKind.FunctionDeclaration, SyntaxKind.ArrowFunction, SyntaxKind.CallExpression],
      visit: (node, sourceFile): void => {
        if (Node.isCallExpression(node)) {
          registerCall(index, node);
          return;
        }
        registerFunctionDeclaration(index, node, sourceFile);
        registerVariableDeclaration(index, node, sourceFile);
        for (const verb of verbsFromReturnType(node)) {
          index.verbImpls.push({ verb, node, file: sourceFile });
        }
      },
    },
  ];
}

// ── the matrix fold ────────────────────────────────────────────────────────────────────────────────────

/** The fold's accumulator: the resolved verb→authority map and the SOURCE manifest behind it. */
interface MatrixFold {
  readonly verbs: Map<string, string>;
  readonly sources: string[];
}

export interface ChatVerbMatrix {
  readonly verbs: ReadonlyMap<string, string>;
  readonly sources: readonly string[];
}

/** Every refusal in this family carries the legacy opener, so a `mustRefuse` needle names authored text
 *  rather than a generic runner envelope sentence. */
function refuse(message: string): never {
  throw new Error(`chat-viewer-plane-canon-reads: ${message}`);
}

/** The object literal an expression denotes, following identifier/alias hops through the SHARED stable
 *  binding reader. It refuses on any other shape, on an unresolvable binding, and on a cycle, because a
 *  matrix this reader cannot establish must never read as a SMALLER matrix. */
function matrixObject(expression: MorphNode): ObjectLiteralExpression {
  const direct = unwrapExpression(expression);
  if (Node.isObjectLiteralExpression(direct)) {
    return direct;
  }
  const fact = resolveStableExpression(expression);
  if (fact.kind === "resolved") {
    const terminal = unwrapExpression(fact.value);
    if (Node.isObjectLiteralExpression(terminal)) {
      return terminal;
    }
    return refuse(`unsupported ${MATRIX_CONST} expression in ${expression.getSourceFile().getFilePath()}: ${preview(expression)}`);
  }
  const kind = REFUSAL_CLASS[fact.reason];
  if (kind === "cycle") {
    return refuse(`${MATRIX_CONST} composition cycle at ${sourceKey(fact.node, direct.getText())}`);
  }
  if (kind === "unbound") {
    return refuse(`${MATRIX_CONST} binding "${direct.getText()}" resolves to no local declaration or named import`);
  }
  return refuse(`unsupported ${MATRIX_CONST} expression in ${expression.getSourceFile().getFilePath()}: ${preview(expression)}`);
}

/** A member's KEY: an identifier / numeric / quoted name read as written, or a COMPUTED key whose
 *  expression is a string literal. A computed key this reader cannot NAME must not enter the map: before
 *  #1091 it entered as the bracket text (`["listMessages"]`), which matches no factory — so the gate
 *  reported an UNCHECKED verb that does not exist while the real one went unjudged. */
function memberKey(name: MorphNode): string {
  if (Node.isComputedPropertyName(name)) {
    const computed = readStringValue(name.getExpression());
    if (computed === undefined) {
      return refuse(`computed ${MATRIX_CONST} key in ${name.getSourceFile().getFilePath()} is not a string literal: ${preview(name)}`);
    }
    return computed;
  }
  return readStringValue(name) ?? name.getText();
}

/** The authority STRING a member's value denotes — through `as const`/`satisfies`/parens and through an
 *  identifier's BINDING, the same local-or-named-import hop the matrix object itself takes, answered by the
 *  shared reader. Every other shape REFUSES: an authority this reader cannot establish would drop its verb
 *  out of the classified set entirely, and `isViewerPlane` never sees the verb it was supposed to protect. */
function authorityValue(expression: MorphNode): string {
  const fact = readStaticString(expression);
  if (fact.kind === "resolved") {
    return fact.value;
  }
  const kind = REFUSAL_CLASS[fact.reason];
  const named = unwrapExpression(expression);
  if (kind === "cycle") {
    return refuse(`${MATRIX_CONST} value binding cycle at ${sourceKey(fact.node, named.getText())}`);
  }
  if (kind === "unbound") {
    return refuse(`${MATRIX_CONST} value binding "${named.getText()}" resolves to no local declaration or named import`);
  }
  return refuse(`unsupported ${MATRIX_CONST} value in ${expression.getSourceFile().getFilePath()}: ${preview(expression)}`);
}

/** Fold one matrix object's rows into the accumulator, resolving object spreads first so a locally-written
 *  row always WINS over the base it overrides (the live `{...BASE, listMessages:"member"}` precedence).
 *
 *  `seen` is threaded ACROSS the fold/resolve boundary, not re-seeded per spread: a cycle runs
 *  fold → resolve → fold, so a per-call seed detects nothing and the recursion blows the stack instead of
 *  refusing. */
function foldMatrix(obj: ObjectLiteralExpression, out: MatrixFold, seen: ReadonlySet<string>): void {
  const key = sourceKey(obj, obj.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ?? MATRIX_CONST);
  if (seen.has(key)) {
    refuse(`${MATRIX_CONST} composition cycle at ${key}`);
  }
  out.sources.push(key);
  const nested: ReadonlySet<string> = new Set([...seen, key]);
  for (const prop of obj.getProperties()) {
    if (Node.isSpreadAssignment(prop)) {
      const before = out.verbs.size;
      foldMatrix(matrixObject(prop.getExpression()), out, nested);
      if (out.verbs.size === before) {
        refuse(`${MATRIX_CONST} at ${key} spreads "${prop.getExpression().getText()}", which resolved to zero verbs`);
      }
      continue;
    }
    if (Node.isPropertyAssignment(prop)) {
      const initializer = prop.getInitializer();
      if (initializer === undefined) {
        refuse(`${MATRIX_CONST} row "${prop.getName()}" at ${key} has no value`);
      }
      out.verbs.set(memberKey(prop.getNameNode()), authorityValue(initializer));
      continue;
    }
    // A SHORTHAND row (`{ previewAssembly, listMessages }`) is the same row one hop away: its NAME is both
    // the verb and the value expression, so the binding hop answers it.
    if (Node.isShorthandPropertyAssignment(prop)) {
      out.verbs.set(prop.getName(), authorityValue(prop.getNameNode()));
      continue;
    }
    refuse(`unsupported ${MATRIX_CONST} member kind ${prop.getKindName()} at ${key}: ${preview(prop)}`);
  }
}

/** `CHAT_VERB_AUTHORITY` as verb → authority, RESOLVED through object spreads of local/imported sibling
 *  matrices (#947); `undefined` when no readable declaration exists in the effective population, which is
 *  the BLINDNESS condition the health sibling reports and the reach sibling refuses on. */
export function resolveChatMatrix(index: ChatPlaneIndex): ChatVerbMatrix | undefined {
  let found: ChatVerbMatrix | undefined;
  for (const declaration of index.matrixDeclarations) {
    if (!Node.isVariableDeclaration(declaration)) {
      continue;
    }
    const initializer = declaration.getInitializer();
    const obj = initializer === undefined ? undefined : unwrapExpression(initializer);
    if (obj === undefined || !Node.isObjectLiteralExpression(obj)) {
      continue;
    }
    const fold: MatrixFold = { verbs: new Map<string, string>(), sources: [] };
    foldMatrix(obj, fold, new Set());
    if (fold.verbs.size > 0) {
      found = { verbs: fold.verbs, sources: fold.sources };
      break;
    }
  }
  return found;
}

// ── reachability and the structural discharge ──────────────────────────────────────────────────────────

/** The identifier a CallExpression calls (`f(…)`), ignoring member calls (`x.f(…)` is never one of ours —
 *  the readers are module-scope imports). */
function calleeName(call: MorphNode): string | undefined {
  const callee = Node.isCallExpression(call) ? call.getExpression() : undefined;
  return callee !== undefined && Node.isIdentifier(callee) ? callee.getText() : undefined;
}

function callsIn(index: ChatPlaneIndex, fn: MorphNode): readonly MorphNode[] {
  return index.callsByFunction.get(fn) ?? [];
}

/** Every banned-reader call reachable from `root` through module-local helper calls. Cycle-guarded by the
 *  visited-function set. */
function reachFrom(index: ChatPlaneIndex, root: MorphNode, locals: ReadonlyMap<string, MorphNode>): readonly MorphNode[] {
  const readerCalls: MorphNode[] = [];
  const seen = new Set<MorphNode>([root]);
  const queue: MorphNode[] = [root];
  for (let fn = queue.pop(); fn !== undefined; fn = queue.pop()) {
    for (const call of callsIn(index, fn)) {
      const name = calleeName(call) ?? "";
      if (BULK_CANON_READERS.has(name)) {
        readerCalls.push(call);
      }
      const local = locals.get(name);
      if (local !== undefined && !seen.has(local)) {
        seen.add(local);
        queue.push(local);
      }
    }
  }
  return readerCalls;
}

/** Does `node` bind to `parameter`, or to a binding element destructured from it? */
function identifierComesFromParameter(id: MorphNode, parameter: MorphNode): boolean {
  if (!Node.isIdentifier(id)) {
    return false;
  }
  const fact = resolveLexicalValueDeclaration(id);
  if (fact.kind === "unresolved") {
    return false;
  }
  const declaration = fact.value;
  return declaration === parameter || (Node.isBindingElement(declaration) && declaration.getFirstAncestorByKind(SyntaxKind.Parameter) === parameter);
}

/** The verdict's event argument must be the filtered element (or a property/destructured field of it), not
 *  another event that happens to be in scope. */
function comesFromFilterElement(expression: MorphNode, parameter: MorphNode): boolean {
  const value = unwrapExpression(expression);
  if (Node.isIdentifier(value)) {
    return identifierComesFromParameter(value, parameter);
  }
  if (Node.isPropertyAccessExpression(value) || Node.isElementAccessExpression(value)) {
    return comesFromFilterElement(value.getExpression(), parameter);
  }
  return false;
}

/** The second verdict argument must be an explicit history-floor binding. A literal or unrelated number
 *  cannot prove that this viewer's resolved floor protects the egress. */
function isHistoryFloorBinding(expression: MorphNode): boolean {
  const value = unwrapExpression(expression);
  if (Node.isIdentifier(value)) {
    return FLOOR_BINDING_RE.test(value.getText()) && resolveLexicalValueDeclaration(value).kind === "resolved";
  }
  if (!Node.isPropertyAccessExpression(value)) {
    return false;
  }
  const receiver = value.getExpression();
  const receiverIds = Node.isIdentifier(receiver) ? [receiver] : receiver.getDescendantsOfKind(SyntaxKind.Identifier);
  return (
    value.getName() === "historyFloorSeq" &&
    MEMBERSHIP_BINDING_RE.test(receiver.getText()) &&
    receiverIds.some((id) => resolveLexicalValueDeclaration(id).kind === "resolved")
  );
}

/** A canonical filter retains an event only when the ONE floor verdict is false. The predicate must be the
 *  direct callback result; merely mentioning a negated verdict in a larger expression is not a proof. */
function callbackAppliesVisibleVerdict(callback: MorphNode): boolean {
  if (!(Node.isArrowFunction(callback) || Node.isFunctionExpression(callback))) {
    return false;
  }
  const parameter = callback.getParameters()[0];
  if (parameter === undefined) {
    return false;
  }
  const body = callback.getBody();
  let returned: MorphNode | undefined = body;
  if (Node.isBlock(body)) {
    const statements = body.getStatements();
    const only = statements.length === 1 ? statements[0] : undefined;
    returned = only !== undefined && Node.isReturnStatement(only) ? only.getExpression() : undefined;
  }
  const predicate = returned === undefined ? undefined : unwrapExpression(returned);
  if (predicate === undefined || !Node.isPrefixUnaryExpression(predicate) || predicate.getOperatorToken() !== SyntaxKind.ExclamationToken) {
    return false;
  }
  const verdict = unwrapExpression(predicate.getOperand());
  if (!Node.isCallExpression(verdict)) {
    return false;
  }
  const [event, floor] = verdict.getArguments();
  return (
    calleeName(verdict) === CLAMP_FN && event !== undefined && floor !== undefined && comesFromFilterElement(event, parameter) && isHistoryFloorBinding(floor)
  );
}

/** Is `candidate` a strict ancestor of `node`? The exact question the legacy
 *  `receiver.getDescendants().includes(readerCall)` asked, answered by the parent chain instead of by
 *  materializing every descendant of the receiver. */
function isAncestorOf(candidate: MorphNode, node: MorphNode): boolean {
  for (let cur = node.getParent(); cur !== undefined; cur = cur.getParent()) {
    if (cur === candidate) {
      return true;
    }
  }
  return false;
}

/** A floorless reader is discharged only when ITS result is the receiver of a `.filter(…)` whose callback
 *  rejects `isBelowHistoryFloor` for that filtered element and the viewer's resolved floor. A clamp over any
 *  other collection/argument, or one with inverted polarity, proves nothing about this read. The receiver may
 *  contain the call inline or reference the same local result binding. */
function readerResultIsClamped(index: ChatPlaneIndex, readerCall: MorphNode): boolean {
  const fn = readerCall.getFirstAncestor(isCallable);
  if (fn === undefined) {
    return false;
  }
  const resultDecl = readerCall.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  return callsIn(index, fn).some((call) => {
    if (!Node.isCallExpression(call)) {
      return false;
    }
    const callee = call.getExpression();
    if (!(Node.isPropertyAccessExpression(callee) && callee.getName() === "filter")) {
      return false;
    }
    const receiver = callee.getExpression();
    const inline = receiver === readerCall || isAncestorOf(receiver, readerCall);
    const bound =
      resultDecl !== undefined &&
      [receiver, ...receiver.getDescendantsOfKind(SyntaxKind.Identifier)].some((part) => {
        if (!Node.isIdentifier(part)) {
          return false;
        }
        const fact = resolveLexicalValueDeclaration(part);
        return fact.kind === "resolved" && fact.value === resultDecl;
      });
    const first = call.getArguments()[0];
    const callback = first === undefined ? undefined : unwrapExpression(first);
    return (inline || bound) && callback !== undefined && callbackAppliesVisibleVerdict(callback);
  });
}

interface PlaneViolation {
  /** Every viewer-plane verb whose factory reaches this call, sorted — the legacy finding's `<verb>` half. */
  readonly verbs: readonly string[];
  readonly reader: string;
  readonly call: MorphNode;
}

export interface PlaneJudgment {
  /** Viewer-plane verbs this run actually resolved to a factory — the coverage arm's numerator. */
  readonly covered: ReadonlySet<string>;
  /** Undischarged bulk-canon reads reached from a viewer-plane factory. */
  readonly violations: readonly PlaneViolation[];
}

/** Judge every discovered implementation against the resolved matrix. One traversal of the index; the
 *  reach sibling reports `violations`, the health sibling asks `covered`.
 *
 *  KEYED BY THE CALL, NOT BY `<verb>:<reader>` (the conversion's finding-granularity move). The legacy
 *  finding identity was the ALLOWLIST key, so ONE authored call reached by TWO viewer-plane verbs was TWO
 *  findings — and on the real tree exactly that happens, because `send` and `commitMessage` share
 *  `commitUserTurn`'s greeting-freeze probe. A final ordinary position is an authored coordinate, and
 *  standing law §6.2 forbids two findings at an identical carrier and position: one marker could not
 *  independently license one of them. The call is the defect and the repair, so it is the finding; every
 *  reaching verb rides in the message, which is where the discriminator label's information belongs. */
export function judgeChatPlane(index: ChatPlaneIndex, matrix: ChatVerbMatrix): PlaneJudgment {
  const covered = new Set<string>();
  const byCall = new Map<MorphNode, Set<string>>();
  for (const impl of index.verbImpls) {
    const authority = matrix.verbs.get(impl.verb);
    if (authority === undefined || !isViewerPlane(authority)) {
      continue;
    }
    covered.add(impl.verb);
    const locals = index.localsByFile.get(impl.file) ?? new Map<string, MorphNode>();
    for (const call of reachFrom(index, impl.node, locals)) {
      if (!readerResultIsClamped(index, call)) {
        const verbs = byCall.get(call) ?? new Set<string>();
        verbs.add(impl.verb);
        byCall.set(call, verbs);
      }
    }
  }
  const violations: PlaneViolation[] = [...byCall].map(([call, verbs]) => ({ verbs: [...verbs].toSorted(), reader: calleeName(call) ?? "", call }));
  return { covered, violations };
}

/** Fail-loud arm: a banned reader that no longer exists means it was RENAMED past the family. */
export function rottedReaders(index: ChatPlaneIndex): readonly string[] {
  return [...BULK_CANON_READERS].filter((reader) => !index.declaredFunctionNames.has(reader));
}
