// Gate: brand-in-name-position — a param/field sitting in a NAME POSITION that `@orb/kit/ids` already mints
// a brand for, declared as a bare `string`. `chatId: string` beside a live `ChatId` is an id-confusion hole
// the compiler was ALREADY able to close: every wrong-id call (a messageId where a chatId goes, a foreign
// wire id landing in a tenant lookup) type-checks. The POSITION VOCABULARY IS DERIVED from the ids module —
// zero hardcoded paths, with a blindness tripwire. Escape: the two-sided `@foreign-id-ok:` marker (a foreign
// wire's id that shares our spelling). TRANSITION COMPLETE (2026-08-03): the landing baseline (169 files /
// 374 sites) was burned to `{}` and the baseline + its generator were DELETED per the declared terminal
// state — every finding now reports directly, with no budget to hide behind.
//
// ── THE ARMS ────────────────────────────────────────────────────────────────────────────────────────────
//   A1 position    — a Parameter / PropertySignature / PropertyDeclaration whose NAME is the lowerCamel of a
//                    brand alias exported by `packages/kit/src/ids/index.ts` (`export type X = TypeIdOf<…>`
//                    or `= Branded<…>`), declared `string` (alone or unioned only with null/undefined).
//   A2 marker      — `// @foreign-id-ok(<positionName>): <reason>` on the line or the line above exempts that
//                    ONE named position. The reason is REQUIRED (the house grammar `marker:\s*\S`); the NAME
//                    is required too, because a line-scoped marker over-exempts — the live corpus has
//                    `record(chatId: string, sessionId: string)`, a foreign sessionId beside one of OUR
//                    chatIds. TWO-SIDED: a marker naming no live bare-`string` position is itself RED (a
//                    stale exemption is a loaded gun — the next `chatId: string` written on that line
//                    inherits an exemption nobody granted it), and a MALFORMED marker — which exempts
//                    nothing at all — reds as its own flavour rather than sitting there looking like
//                    protection.
//   A3 blindness   — ZERO brands derived from the ids module ⇒ RED. A gate keyed on a derivation that stops
//                    resolving reports ✓ forever (GATE-AUTHORING §4.6).
//
// ── THE PERMANENT EXEMPTIONS (marked, never budgeted) ───────────────────────────────────────────────────
// Three foreign-wire classes carry `@foreign-id-ok:` markers (plus the provider-error `sessionId`, marked
// during the burn-down): the agent-sdk's `sessionId` (the Claude Agent SDK's own chat-session id — a
// NAME COLLISION with our BFF `SessionId = TypeIdOf<"session">`), local-light's `modelId` (HuggingFace repo
// ids, not the OpenRouter `ModelId` brand), and the plugin sandbox's wire DTOs (`contracts/src/plugin/**` +
// `domain/plugin/**` — an untrusted guest's JSON, branded only after it is parsed).
// NOTED, NOT ORDERED: the agent-sdk name collision is itself a rename candidate for that burn-down lane —
// spelling it `sdkSessionId` would dissolve the marker instead of documenting it.
//
// ── DECLARED LIMITS (each with a mustPass row) ──────────────────────────────────────────────────────────
// EXACT lowerCamel match only: `ownerId`/`actorUserId`/`fromChatId` are UserId/ChatId positions in prose but
// not in this vocabulary — a suffix matcher would need a hand-kept skip list (`handleSubmit`, `modelIdList`)
// and that is the hand-list this gate exists to avoid. VARIABLE declarations and return types are out of
// scope: the brief's defect is the SIGNATURE (what a caller can hand you), not a local. And a position typed
// through a NAMED type reference (`chatId: SomeAlias`) is invisible — this is a syntactic reader, the same
// limit `injected-op-caller-param` writes down for its param scan.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const IDS_MODULE = "packages/kit/src/ids/index.ts";
/** The real-tree ANCHOR for the whole-tree arms. Deliberately NOT the ids module: the conformance examples
 *  PLANT that file (they must — it is the derivation source), so anchoring there would fire the stale/blind
 *  arms inside every mini-project and red the gate's own self-proof (GATE-AUTHORING §4.5). */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
const GATE_SELF = "scripts/check/gates/brand-in-name-position.ts";
const BRAND_CONSTRUCTORS: ReadonlySet<string> = new Set(["TypeIdOf", "Branded"]);

/** The escape marker, in the house grammar every sibling marker uses (`allow-skip:`, `FABRICATION-OK:`,
 *  `@swallowed-ok:`, `@typeonly-ok:`, `@server-only:`) plus one tightening: the marker NAMES the position it
 *  exempts, and the REASON after the colon is REQUIRED. The name is not decoration — a line-scoped marker
 *  over-exempts, and the live corpus proves it: `record(chatId: string, sessionId: string)` in the agent-sdk
 *  session store carries a FOREIGN sessionId beside one of OUR chatIds on the same line, so a line-scoped
 *  exemption would silently launder the chatId too. */
const FOREIGN_OK_RE = /@foreign-id-ok\(([A-Za-z0-9_]+)\):\s*\S/u;
/** The BARE form — used ONLY by the stale arm, so a malformed marker (no position, no reason, or both) reds
 *  as its own flavour instead of being invisible to both sides. */
const FOREIGN_OK_BARE_RE = /@foreign-id-ok/u;

const STRING_PARTS: ReadonlySet<string> = new Set(["string", "null", "undefined"]);
const UNION_SPLIT_RE = /\|/u;
const WHITESPACE_RE = /\s+/gu;

const MESSAGE =
  "a value sits in a NAME POSITION that @orb/kit/ids already mints a brand for, declared as a bare `string` " +
  "— so every wrong-id call type-checks (a messageId handed where a chatId goes, a foreign wire id landing " +
  "in a tenant lookup). The brand EXISTS: this is a compile-time hole that was already closed elsewhere in " +
  "the tree and left open here.";

const FIX =
  'type the position with its brand (`chatId: ChatId`, `import type { ChatId } from "@orb/kit/ids"`) and let ' +
  "the value arrive branded — mint with `mintTypeId(ID_PREFIX.x)`, parse at the boundary with `typeIdSchema`, " +
  "or `castId<ChatId>()` at the ONE seam that owns the conversion. If the value is genuinely a FOREIGN wire's " +
  "id that merely shares our spelling (an SDK session id, an HF model repo id, a plugin-sandbox DTO), add " +
  "`// @foreign-id-ok(<positionName>): <whose id it is + what would end the exemption>` on the line or the " +
  "line above — the marker NAMES the position it exempts, so it cannot launder one of ours declared beside it.";

const BLIND =
  `brand-in-name-position derived ZERO brand aliases from ${IDS_MODULE} — the gate is scanning for a ` +
  "vocabulary that no longer exists and has gone silently green. Re-point the derivation in " +
  "scripts/check/gates/brand-in-name-position.ts (the name-keyed blindness tripwire, GATE-AUTHORING.md §4.6).";

const STALE_MARKER_STALE = (named: string): string =>
  `\`@foreign-id-ok(${named})\` guards nothing — \`${named}\` is not declared a bare \`string\` on the line this ` +
  "marker guards (the first code line below its comment block). The field was typed with its brand, renamed, " +
  "or deleted; delete the marker (a stale exemption is " +
  "a lie, and the next bare-`string` id written here would silently inherit it). (GATE-AUTHORING.md §4.4)";

const STALE_MARKER_MALFORMED =
  "`@foreign-id-ok` marker is MALFORMED, so it exempts nothing at all — the grammar is " +
  "`// @foreign-id-ok(<positionName>): <whose id it is + what would end the exemption>`, and both the named " +
  "position and the reason are REQUIRED (the name is what keeps a marker from laundering a second, OURS id " +
  "declared on the same line). Fix it, or delete it. (GATE-AUTHORING.md §4.3)";

// ── derivation ──────────────────────────────────────────────────────────────────────────────────────────

/** The brand alias names `@orb/kit/ids` exports (`export type X = TypeIdOf<…> | Branded<…>`) mapped to the
 *  lowerCamel NAME POSITION each one owns: `ChatId` → `chatId`, `SessionToken` → `sessionToken`. Derived, so
 *  a new brand polices its own position the day it is minted and a deleted brand stops policing. */
function deriveBrandPositions(sourceFiles: readonly SourceFile[]): Map<string, string> {
  const positions = new Map<string, string>();
  for (const sf of sourceFiles) {
    if (!sf.getFilePath().includes(IDS_MODULE)) {
      continue;
    }
    for (const alias of sf.getTypeAliases()) {
      const typeNode = alias.getTypeNode();
      if (typeNode?.isKind(SyntaxKind.TypeReference) !== true || !BRAND_CONSTRUCTORS.has(typeNode.getTypeName().getText())) {
        continue;
      }
      const name = alias.getName();
      positions.set(name.charAt(0).toLowerCase() + name.slice(1), name);
    }
  }
  return positions;
}

// ── detection ───────────────────────────────────────────────────────────────────────────────────────────

/** `string`, or a union of `string` with nothing but null/undefined. Whitespace-normalized so the multi-line
 *  spelling reads the same as the one-liner. */
function isBareString(typeText: string): boolean {
  const parts = typeText.replace(WHITESPACE_RE, "").split(UNION_SPLIT_RE);
  return parts.includes("string") && parts.every((part) => STRING_PARTS.has(part));
}

/** The simple NAME of a param/field node, or undefined for a binding pattern / computed name. */
function simpleName(node: Node): string | undefined {
  const nameNode = (node as { getNameNode?: () => Node }).getNameNode?.();
  return nameNode?.isKind(SyntaxKind.Identifier) === true ? nameNode.getText() : undefined;
}

/** The node's own explicit type annotation text, or undefined when it has none (inferred — nothing declared
 *  to be wrong about). */
function declaredTypeText(node: Node): string | undefined {
  return (node as { getTypeNode?: () => Node | undefined }).getTypeNode?.()?.getText();
}

/** The position name a marker on this line exempts, or undefined (no marker / malformed). */
function markedPosition(line: string): string | undefined {
  return FOREIGN_OK_RE.exec(line)?.[1];
}

const COMMENT_LINE_RE = /^\s*(?:\/\/|\*|\/\*)/u;
const BLANK_LINE_RE = /^\s*$/u;

/**
 * Every marker in a file, resolved to the 1-based line it GUARDS: `{ line, name, guards }`.
 *
 * A marker guards the first line BELOW it that is neither a comment nor blank — i.e. the declaration the
 * comment block sits on top of — unless the marker rides at the end of a code line, in which case it guards
 * its own. Resolving through the whole comment BLOCK (not just one line of adjacency) is what lets a
 * declaration carrying TWO foreign positions carry two stacked markers; a one-line-above rule silently
 * dropped the outer one, which the real-tree probe caught. ONE resolver, read by the detector AND by the
 * stale arm, so the two sides can never disagree about what a marker guards.
 */
function resolveMarkers(lines: readonly string[]): { readonly line: number; readonly name: string | undefined; readonly guards: number }[] {
  const out: { line: number; name: string | undefined; guards: number }[] = [];
  for (const [index, text] of lines.entries()) {
    if (!FOREIGN_OK_BARE_RE.test(text)) {
      continue;
    }
    const lineNo = index + 1;
    const beforeComment = text.slice(0, text.indexOf("//"));
    let guards = lineNo;
    if (BLANK_LINE_RE.test(beforeComment)) {
      guards = lineNo + 1;
      while (guards <= lines.length && (COMMENT_LINE_RE.test(lines[guards - 1] ?? "") || BLANK_LINE_RE.test(lines[guards - 1] ?? ""))) {
        guards += 1;
      }
    }
    out.push({ line: lineNo, name: markedPosition(text), guards });
  }
  return out;
}

/** Is `name` at `lineNo` exempted by a well-formed marker that guards that line? */
function hasForeignOk(markers: ReturnType<typeof resolveMarkers>, lineNo: number, name: string): boolean {
  return markers.some((marker) => marker.guards === lineNo && marker.name === name);
}

const POSITION_KINDS = [SyntaxKind.Parameter, SyntaxKind.PropertySignature, SyntaxKind.PropertyDeclaration] as const;

/** A1 — every branded name position declared a bare `string` in one file, UNMARKED, in line order. */
function brandPositionFindings(sf: SourceFile, rel: string, positions: ReadonlyMap<string, string>): Finding[] {
  const markers = resolveMarkers(sf.getFullText().split("\n"));
  const out: Finding[] = [];
  for (const kind of POSITION_KINDS) {
    for (const node of sf.getDescendantsOfKind(kind)) {
      const name = simpleName(node);
      const brand = name === undefined ? undefined : positions.get(name);
      const typeText = declaredTypeText(node);
      if (brand === undefined || typeText === undefined || !isBareString(typeText)) {
        continue;
      }
      const line = node.getStartLineNumber();
      if (hasForeignOk(markers, line, name ?? "")) {
        continue;
      }
      out.push({
        file: rel,
        line,
        column: node.getStart() - node.getStartLinePos() + 1,
        message: `\`${name}\` is declared \`${typeText}\` while \`${brand}\` is minted in @orb/kit/ids (${IDS_MODULE}).`,
      });
    }
  }
  return out.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** `line → the branded names declared a bare string on it`, BEFORE the marker filter — what the stale arm
 *  reconciles markers against. Re-runs the same predicate rather than a second parallel one, so the two
 *  sides cannot disagree about what a markable position is. */
function markablePositions(sf: SourceFile, positions: ReadonlyMap<string, string>): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (const kind of POSITION_KINDS) {
    for (const node of sf.getDescendantsOfKind(kind)) {
      const name = simpleName(node);
      const typeText = declaredTypeText(node);
      if (name === undefined || !positions.has(name) || typeText === undefined || !isBareString(typeText)) {
        continue;
      }
      const line = node.getStartLineNumber();
      const names = out.get(line) ?? new Set<string>();
      names.add(name);
      out.set(line, names);
    }
  }
  return out;
}

/** A2's STALE side — a marker whose named position is not declared a bare `string` on the line it guards. */
function staleMarkerFindings(sf: SourceFile, rel: string, positions: ReadonlyMap<string, string>): Finding[] {
  const markable = markablePositions(sf, positions);
  const out: Finding[] = [];
  for (const { line, name, guards } of resolveMarkers(sf.getFullText().split("\n"))) {
    if (name !== undefined && markable.get(guards)?.has(name) === true) {
      continue; // guarding a real position — the detector reads it there.
    }
    out.push({ file: rel, line, column: 1, message: name === undefined ? STALE_MARKER_MALFORMED : STALE_MARKER_STALE(name) });
  }
  return out;
}

/** Repo-relative form of an absolute source path (the findings' file form). */
function repoRel(path: string): string {
  for (const segment of ["/packages/", "/tests/"]) {
    const idx = path.indexOf(segment);
    if (idx !== -1) {
      return path.slice(idx + 1);
    }
  }
  return path;
}

/** The scanned corpus. Defensive `includes` form: no leading-slash assumption, since the wrong path format
 *  is a SILENT GREEN (§3). */
function inScope(path: string): boolean {
  return path.includes("packages/") || path.includes("tests/");
}

let passPositions: ReadonlyMap<string, string> = new Map();

export const gate: GateDescriptor = {
  name: "brand-in-name-position",
  docRow:
    "Core-Enforcement-Active-Gates.md (Layer 3) — Spine-TypeScript-and-Patterns.md (one home per shape, enforced at compile time); Core-Path-Registry.md D20",
  status: "active",
  scopeSafety: "whole-project", // the vocabulary comes from another package; the blindness arm is tree-wide
  message: MESSAGE,
  fix: FIX,
  // The ids module is scanned too: it is the derivation source, and conformance mini-projects plant it there.
  scanRoot: inScope,
  begin: (ctx: GateRunCtx) => {
    passPositions = deriveBrandPositions(ctx.project.getSourceFiles());
  },
  visitFile: (sf, ctx) => {
    const rel = repoRel(sf.getFilePath());
    // The stale-MARKER arm: an exemption that guards nothing is a lie to delete, never debt.
    for (const finding of staleMarkerFindings(sf, rel, passPositions)) {
      ctx.report(finding);
    }
    for (const finding of brandPositionFindings(sf, rel, passPositions)) {
      ctx.report(finding);
    }
  },
  finalize: (ctx) => {
    // WHOLE-TREE claim: the blindness tripwire only speaks on a real tree (§4.5/§4.6). The anchor is the
    // schema barrel — present on every real run, on no example's path.
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return;
    }
    if (passPositions.size === 0) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND });
    }
  },

  mustFlag: [
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\n',
        "packages/server/src/domain/chat/verbs/post.ts": "export function post(chatId: string, text: string): void {\n  void chatId;\n  void text;\n}\n",
      },
      expect: { count: 1, messageIncludes: "`ChatId` is minted" },
      why: "the founding shape — a server signature taking `chatId: string` while ChatId exists: every wrong-id call site type-checks",
    },
    {
      files: {
        [IDS_MODULE]: 'export type MessageId = TypeIdOf<"message">;\n',
        "packages/contracts/src/x/views.ts": "export interface Row {\n  readonly messageId: string | null;\n}\n",
      },
      expect: { count: 1 },
      why: "the FIELD form with a nullable union — a reader matching only the exact text `string` would miss half the corpus (`string | null` is the row-shape spelling)",
    },
    {
      files: {
        [IDS_MODULE]: 'export type SessionToken = Branded<"SessionToken">;\n',
        "packages/server/src/domain/sessions/contract/service.ts": "export interface Args {\n  readonly sessionToken: string;\n}\n",
      },
      expect: { count: 1 },
      why: "a `Branded<…>` brand, not a `TypeIdOf<…>` one — the vocabulary is EVERY brand the ids module mints, which is what closed the SessionToken class",
    },
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\n',
        "packages/client/src/lib/log.ts": "// @foreign-id-ok\nexport interface Entry {\n  readonly chatId: string;\n}\n",
      },
      // TWO findings: the unexempted position AND the malformed marker that failed to exempt it.
      expect: { count: 2, messageIncludes: "`ChatId` is minted" },
      why: "a marker with neither a named position nor a reason exempts nothing — the position still REDs, and the marker reds beside it instead of sitting there looking like protection",
    },
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\n',
        "packages/client/src/lib/log.ts":
          "// @foreign-id-ok(chatId): the SDK's own id, ends when the SDK brands it\nexport interface Entry {\n  readonly chatId: ChatId;\n}\n",
      },
      expect: { count: 1, messageIncludes: "guards nothing" },
      why: "A2 STALE: the field was typed with its brand and the marker stayed — a loaded gun the next bare-`string` id on that line would inherit",
    },
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\nexport type SessionId = TypeIdOf<"session">;\n',
        "packages/server/src/infra/providers/backends/agent-sdk/session/store.ts":
          "export class S {\n  // @foreign-id-ok(sessionId): the SDK's own session id. Ends if it ever carries one of our rows.\n  record(chatId: string, sessionId: string): void {\n    void chatId;\n    void sessionId;\n  }\n}\n",
      },
      expect: { count: 1, messageIncludes: "`ChatId` is minted" },
      why: "THE reason the marker names its position — the live agent-sdk `record(chatId, sessionId)` line: the foreign sessionId is exempt, OUR chatId beside it is still RED. A line-scoped marker would have laundered both",
    },
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\n',
        "packages/server/src/domain/chat/verbs/post.ts":
          "// @foreign-id-ok(chatId): a foreign wire's chat id. Ends when it stops being foreign.\n\nexport function post(roomId: string): void {\n  void roomId;\n}\n",
      },
      expect: { count: 1, messageIncludes: "guards nothing" },
      why: "the marker BLOCK resolves DOWN through blank/comment lines to the first code line — so a marker floating above an unrelated declaration is stale, not silently attached to whatever follows it two lines later",
    },
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\n',
        "tests/server/domain/chat/thing.test.ts": "export interface Fixture {\n  readonly chatId: string;\n}\n",
      },
      expect: { count: 1 },
      why: "tests/ is IN scope, deliberately: a hand-written id fixture is exactly where an unbranded string gets minted by hand instead of `mintTypeId`",
    },
  ],
  mustPass: [
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\n',
        "packages/server/src/domain/chat/verbs/post.ts": "export function post(chatId: ChatId): void {\n  void chatId;\n}\n",
      },
      why: "the SHAPE the fix asks for — the position carries its brand, so a messageId handed here is a compile error",
    },
    {
      files: {
        [IDS_MODULE]: 'export type SessionId = TypeIdOf<"session">;\n',
        "packages/server/src/infra/providers/backends/agent-sdk/log.ts":
          'export interface Frame {\n  // @foreign-id-ok(sessionId): the Claude Agent SDK\'s OWN chat-session id, a name collision with our BFF SessionId (TypeIdOf<"session">). Ends if the SDK session id ever becomes one of our rows.\n  readonly sessionId: string;\n}\n',
      },
      why: "the FOREIGN-WIRE escape with its reason — the live agent-sdk class: same spelling, a different wire's id. The reason (and its end condition) is the deliverable, not the silence",
    },
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\nexport type SessionId = TypeIdOf<"session">;\n',
        "packages/server/src/domain/x/probe.ts":
          "// @foreign-id-ok(sessionId): a foreign wire's session id. Ends when it stops being foreign.\n" +
          "// @foreign-id-ok(chatId): a foreign wire's chat id. Ends when it stops being foreign.\n" +
          "export function probe(chatId: string, sessionId: string): void {\n  void chatId;\n  void sessionId;\n}\n",
      },
      why: "STACKED markers on one declaration — a real-tree probe caught the one-line-above rule silently dropping the OUTER marker (it reported the exempted position AND a false stale). The resolver walks the whole comment BLOCK; this row is that regression, written down",
    },
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\n',
        "packages/server/src/domain/chat/verbs/post.ts":
          "export function post(fromChatId: string, ownerId: string): void {\n  void fromChatId;\n  void ownerId;\n}\n",
      },
      why: "DECLARED LIMIT: EXACT lowerCamel match only. `fromChatId`/`ownerId` are ChatId/UserId positions in prose, but a suffix matcher needs a hand-kept skip list (`handleSubmit`, `modelIdList`) — the hand-list this gate exists to avoid. This row is the baseline a widening would start from",
    },
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\n',
        "packages/server/src/domain/chat/verbs/post.ts": 'export function post(): void {\n  const chatId: string = "x";\n  void chatId;\n}\n',
      },
      why: "DECLARED LIMIT: a local VARIABLE is out of scope — the defect is the SIGNATURE (what a caller can hand you), not a local whose value the same function just produced",
    },
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\n',
        "packages/server/src/domain/chat/verbs/post.ts": "export function post(chatId: string | number): void {\n  void chatId;\n}\n",
      },
      why: "DECLARED LIMIT: only `string` unioned with null/undefined counts — a genuinely polymorphic position is a different (and rarer) defect than the bare-string hole",
    },
    {
      files: {
        [IDS_MODULE]: 'export type ChatId = TypeIdOf<"chat">;\nexport type Branded<B extends string> = string & { readonly brand: B };\n',
        "packages/server/src/domain/chat/verbs/post.ts": "export function post(roomId: string): void {\n  void roomId;\n}\n",
      },
      why: "a name position NO brand claims — `roomId` has no `RoomId` in the ids module, so the vocabulary (and only the vocabulary) decides. A brand deleted from ids stops policing its position the same day",
    },
  ],
};
