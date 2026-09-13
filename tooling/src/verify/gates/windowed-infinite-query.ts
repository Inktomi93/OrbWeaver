// `maxPages` WINDOWS an infinite query's cache, and a window has two consequences the three surfaces that
// shipped it all got wrong. (A) TanStack evicts the HEAD page past the cap, and with
// `getPreviousPageParam: () => undefined` nothing can ever fetch it back — rows vanish off the TOP of the
// list as the user scrolls (owner dogfood 2026-08-13 P1: the character library at `maxPages: 5` × 30 = 150
// rows, and the same shape in databank + the chat list). (B) any client-side LENS — filter/search/sort over
// the flattened pages — then sees only the window, so a match on row 200 is invisible while the list claims
// to be searchable. The three fixes all DELETED the cap (a virtualized list is already DOM-bounded and
// summary rows are light) and moved the lens SERVER-side onto the keyset, which is the standing law in
// `docs/architecture/core/client-architecture-lockdown.md`: a paged list's search/sort/filter is a WIRE
// param, and the sort IS the keyset key.
//
// EXTINCT AT LANDING, DELIBERATELY, AND STILL EXTINCT AT CONVERSION. Re-derived 2026-09-12: zero `maxPages`
// property assignments remain under `packages/client/src` (the four surviving mentions are comments and one
// JSDoc). This policy exists so the fourth surface cannot re-introduce the class.
//
// FAMILY: `windowed-infinite-query`, shared with `windowed-infinite-query-health`. That sibling is the
// BLINDNESS TRIPWIRE, split out at conversion because it differs on BOTH axes §3 names — it is `hard`
// (a blind detector is not an occurrence anyone may waive) and `entire-population` (its verdict is
// "does this tree contain any `infiniteQueryOptions` call at all", which cannot compose over a subset).
// Keeping it here would have forced the whole module to `entire-population`, which over-declares: this
// policy's per-call-site verdict composes over any selection.
//
// POPULATION PORT: BYTE-IDENTICAL. Legacy `scanRoot: (p) => p.includes("packages/client/src/")` is exactly
// the `@client` root (`packages/client/src/`).
//
// MARKER CENSUS: ZERO. No `@orb-gate-ignore windowed-infinite-query` line exists anywhere on the tree at
// the pre-conversion SHA, so nothing was translated, dropped, or dead-lettered.
//
// LEGACY SHA: 67366da91.
//
// THE TWO ARMS NOW SHARE ONE FINDING, AND THE MARKER GRAMMAR IS WHY. Legacy reported the cap TWICE — once
// per arm — and distinguished them by the finding TOKEN (`maxPages/no-rewind` vs `maxPages/client-lens`).
// Neither token survives conversion: `locateFinding` (lib/ordinary-waiver.ts:420-428) requires the token to
// be the EXACT authored text at the finding's own line and column, and neither string is authored anywhere.
// Under the central grammar both arms would therefore derive the SAME token `maxPages` on the SAME carrier,
// which is precisely the shape that makes every marker `over-broad` and the site UNWAIVABLE (§4.2). The
// remedy §4.2 names is "report once per call site", so the cap is ONE finding and the ARMS clause rides the
// message. The set of flagged NODES is unchanged; only the cardinality on a both-arms cap moved 2 → 1, which
// the §4.6 differential classifies and the three `messageIncludes` rows below pin.
//
// §4.1 NARROWING MATRIX, measured 2026-09-12 by cutting each fence OPEN in a scratch copy and re-running
// this module's own rows:
//   factory-name `infiniteQueryOptions`     → RED ×3 (the `queryOptions` row; and the two ARM rows, which
//                                              lose their cap once every member call is a factory and the
//                                              lens branch stops being reached)
//     MATRIX CORRECTION (#2087, 2026-09-12). This cell read "RED ×2 (the `queryOptions` row; and the arm
//     rows)" and BOTH halves of that sentence were false of the tree: measured, the cut reddened
//     `mustFlag[4]`/`[5]` ONLY, and `mustPass[3]` — the row whose own `why` promised it dies under this
//     exact cut — stayed GREEN, because its fixture carried no `maxPages` and so produced no subject on
//     either side of the cut. A fixture that cannot reach the fence measures the FIXTURE, not the fence
//     (§4.1). The row now carries a cap, so the factory name is the only thing standing between it and a
//     finding, and the count above is the re-measured one.
//   property-access receiver                → RED ×1 (the bare-call row)
//   `neverRewinds`                          → RED ×3 (the real-rewind row, the reshape row, the ARM-B row)
//   `LENS_METHODS` membership               → RED ×1 (the `.map` reshape row)
//   population `@client`                    → RED ×1 (the `@server` row, which carries an in-population anchor)
//   the shared const-hop reader             → WRONG-DIRECTION: cutting it flags FEWER, so §4.1's cut does not
//                                              apply; the two const-hop mustFlag rows are its enforcement and
//                                              both RED under the cut
//
// DECLARED LIMITS, each with its own `mustPass` row:
//   · the options expression is resolved through the SHARED stable-binding reader, so an inline literal and
//     any number of immutable const hops (same file or imported) are read. A SPREAD (`{ ...base, … }`), a
//     call-built options object and a reassigned binding are not object literals this reader can name, and
//     the cap is invisible in them.
//   · ARM B pairs the cap with a lens by FILE, not by dataflow: a lens over an unrelated array in the same
//     file counts. Acceptable — the cap is the thing to delete either way, and the corpus is zero.
// SHA FORM NOTE: the `LEGACY SHA` above is the last commit that TOUCHED THE LEGACY DESCRIPTOR, not this
// conversion's parent (`e81ca1979^`) — the other convention in this corpus. Both resolve to readable
// legacy source; this one points at it in its final state, which is why it was kept.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `windowed-infinite-query` descriptor at 2eaae72bbfb355e1f7cc84291433983e48557177, the parent of the conversion
// `e81ca1979` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `67366da91`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,433 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,319 and final `population` admits 1,319.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts`
// (virtual) admitted by both; outside `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import type { ArrowFunction, CallExpression, FunctionExpression, Node as MorphNode, ReturnStatement } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { resolveStableExpression } from "../lib/reference-fact.ts";

const INFINITE_FACTORY = "infiniteQueryOptions";
const MAX_PAGES = "maxPages";
const PREVIOUS_PARAM = "getPreviousPageParam";
const UNDEFINED = "undefined";
/** The client-side list lenses ARM B pairs a cap with. `.map` is NOT one — it reshapes, it does not select. */
const LENS_METHODS: ReadonlySet<string> = new Set(["filter", "sort", "toSorted", "find", "findIndex", "slice"]);

const NO_REWIND_ARM = "no-rewind";
const CLIENT_LENS_ARM = "client-lens";

const MESSAGE =
  "`maxPages` WINDOWS an infinite query's cache, and this surface cannot survive the window: with no recoverable `getPreviousPageParam` the evicted HEAD page can never be re-fetched (rows disappear off the top as the user scrolls — the 2026-08-13 dogfood P1 on the character library, and the same shape in databank and the chat list), and any CLIENT-SIDE lens over the flattened pages silently searches only the window. All three live surfaces answered this by DELETING the cap.";

const FIX =
  "delete `maxPages` — a virtualized list is already DOM-bounded and summary rows are light — and push the lens SERVER-side onto the keyset (search/sort/filter as wire params; the sort IS the keyset key, docs/architecture/core/client-architecture-lockdown.md). The worked shapes are packages/client/src/features/character/surfaces/character-library-surface.tsx and packages/client/src/features/databank/surfaces/databank-library-surface.tsx, whose headers record the removal and why. A deliberate window waives that occurrence with `@orb-waive windowed-infinite-query(maxPages): <reason + end condition>` — the position is the cap's own PROPERTY NAME, `maxPages`, because the finding anchors on the property assignment and BOTH arms now share it.";

/** The property named `name` on this object literal, if it is one. */
function propertyOf(object: MorphNode | undefined, name: string): MorphNode | undefined {
  return object !== undefined && Node.isObjectLiteralExpression(object)
    ? object.getProperties().find((property) => Node.isPropertyAssignment(property) && property.getName() === name)
    : undefined;
}

/** The options OBJECT behind an options argument — inline, or through the SHARED stable-binding reader
 *  (`lib/reference-fact.ts`), which follows immutable const bindings and import doors and REFUSES on a
 *  write, a cycle or a dynamic terminal. The legacy descriptor hand-rolled a same-file-const-only walk with
 *  `getDefinitionNodes()`; binding identity is a shared primitive (§12.3) and a gate may not own one. The
 *  consequence is a STRONGER reader: an options const imported from a sibling module is now read, where the
 *  legacy predicate stopped at the file boundary. */
function optionsObjectOf(argument: MorphNode): MorphNode | undefined {
  const inline = unwrapExpression(argument);
  if (Node.isObjectLiteralExpression(inline)) {
    return inline;
  }
  const resolved = resolveStableExpression(inline);
  return resolved.kind === "unresolved" ? undefined : unwrapExpression(resolved.value);
}

function isInlineFunction(node: MorphNode): node is ArrowFunction | FunctionExpression {
  return Node.isArrowFunction(node) || Node.isFunctionExpression(node);
}

/** Is this `getPreviousPageParam` value UNRECOVERABLE — absent, or a function that can only ever yield
 *  `undefined`? `() => undefined` is the live spelling; a body with a real cursor return is recoverable. */
function neverRewinds(value: MorphNode | undefined, returnsByFunction: ReadonlyMap<object, readonly ReturnStatement[]>): boolean {
  if (value === undefined) {
    return true; // absent is the same unrecoverable state as `() => undefined`
  }
  if (!isInlineFunction(value)) {
    return false; // an identifier / imported fn — not readable as a body here, assume recoverable
  }
  const body = value.getBody();
  if (!Node.isBlock(body)) {
    return body.getText() === UNDEFINED;
  }
  const returns = returnsByFunction.get(value.compilerNode) ?? [];
  return returns.length > 0 && returns.every((statement) => (statement.getExpression()?.getText() ?? UNDEFINED) === UNDEFINED);
}

function isFunctionLike(node: MorphNode): boolean {
  return Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node);
}

/** The nearest function-like ancestor — an ANCESTOR walk (§12.3), never a descendant one. */
function enclosingFunctionLike(node: MorphNode): MorphNode | undefined {
  let current = node.getParent();
  while (current !== undefined && !isFunctionLike(current)) {
    current = current.getParent();
  }
  return current;
}

/** Every `return` statement grouped by the function that owns it directly. */
function returnsByOwner(returns: readonly ReturnStatement[]): ReadonlyMap<object, readonly ReturnStatement[]> {
  const grouped = new Map<object, ReturnStatement[]>();
  for (const statement of returns) {
    const owner = enclosingFunctionLike(statement);
    if (owner !== undefined) {
      const bucket = grouped.get(owner.compilerNode) ?? [];
      bucket.push(statement);
      grouped.set(owner.compilerNode, bucket);
    }
  }
  return grouped;
}

/** Which arms bit on this cap, in a stable order. */
function armsFor(
  capOptions: MorphNode,
  lensedFiles: ReadonlySet<string>,
  path: string,
  returnsByFunction: ReadonlyMap<object, readonly ReturnStatement[]>,
): readonly string[] {
  const previous = propertyOf(capOptions, PREVIOUS_PARAM);
  const initializer = Node.isPropertyAssignment(previous) ? previous.getInitializer() : undefined;
  return [...(neverRewinds(initializer, returnsByFunction) ? [NO_REWIND_ARM] : []), ...(lensedFiles.has(path) ? [CLIENT_LENS_ARM] : [])];
}

export const gate = defineGate({
  id: "windowed-infinite-query",
  family: "windowed-infinite-query",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  // `types`, NOT `syntax` (#2256, corrected 2026-09-13) — the same correction as its sibling
  // `contract-banned-shapes`, for the same reason and the same reader. This policy imports
  // `resolveStableExpression` from `lib/reference-fact.ts`, whose `resolveStableExpressionInternal` ->
  // `importedTarget` path calls `lexicalReferenceSymbol(current)?.getAliasedSymbol()`; following a const
  // binding through an import door is a CHECKER answer, not a syntactic one. `analysis` is data the runtime
  // dispatches on and it fixes the proof MODE (`lib/policy-validation.ts#expectedMode`), so every proof row
  // below moved from `mode: "source"` to `mode: "types"` in the same commit and was re-run.
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const factories: CallExpression[] = [];
    const lensedFiles = new Set<string>();
    const returns: ReturnStatement[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const callee = node.getExpression();
            if (!Node.isPropertyAccessExpression(callee)) {
              return;
            }
            if (callee.getName() === INFINITE_FACTORY) {
              factories.push(node);
            } else if (LENS_METHODS.has(callee.getName())) {
              lensedFiles.add(ctx.relativePath(node.getSourceFile()));
            }
          },
        },
        {
          // The rewind reader's block-body half, inverted off the banned `getDescendantsOfKind`.
          kinds: [SyntaxKind.ReturnStatement],
          visit: (node): void => {
            if (Node.isReturnStatement(node)) {
              returns.push(node);
            }
          },
        },
      ],
      evaluate: (): void => {
        const returnsByFunction = returnsByOwner(returns);
        for (const call of factories) {
          // The options object is the LAST argument of `x.infiniteQueryOptions(input, options)`.
          const argument = call.getArguments().at(-1);
          const options = argument === undefined ? undefined : optionsObjectOf(argument);
          const cap = propertyOf(options, MAX_PAGES);
          if (cap === undefined || options === undefined) {
            continue;
          }
          const arms = armsFor(options, lensedFiles, ctx.relativePath(call.getSourceFile()), returnsByFunction);
          if (arms.length > 0) {
            // ONE finding per cap: the position is the property NAME `maxPages`, derived from the property
            // assignment, and the ARMS clause is the only thing that varies.
            ctx.report.node(cap, { message: `${MESSAGE} ARMS: ${arms.join(" + ")}.` });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/character/surfaces/character-library-surface.tsx":
          "export const q = (trpc) =>\n  trpc.character.list.infiniteQueryOptions(\n    { limit: 30 },\n    { maxPages: 5, getNextPageParam: (p) => p.nextCursor, getPreviousPageParam: () => undefined },\n  );\n",
      },
      expect: { count: 1, token: "maxPages", messageIncludes: "ARMS: no-rewind." },
      why: "THE FOUNDING DEFECT VERBATIM (owner dogfood 2026-08-13 P1): `maxPages: 5` × 30 rows with an inert `getPreviousPageParam` — rows vanished off the top of the owner's library. The token pins the waiver position; the `messageIncludes` pins which arm bit, now that the arm no longer rides the token",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/databank/surfaces/databank-library-surface.tsx":
          "export const q = (trpc) =>\n  trpc.databank.list.infiniteQueryOptions({ limit: 30 }, { maxPages: 5, getNextPageParam: (p) => p.nextCursor });\n",
      },
      expect: { count: 1, messageIncludes: "ARMS: no-rewind." },
      why: "an ABSENT `getPreviousPageParam` is the same unrecoverable state as an inert one — the databank spelling",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/character/hooks/use-indirect.ts":
          "const options = { maxPages: 5, getNextPageParam: (p) => p.nextCursor };\nexport const q = (trpc) => trpc.character.list.infiniteQueryOptions({ limit: 30 }, options);\n",
      },
      expect: { count: 1, messageIncludes: "ARMS: no-rewind." },
      why: "A CONST HOP still configures the infinite query; one identifier hop cannot hide an unrecoverable cache window. Carried from the legacy rows, and now served by the SHARED stable-binding reader rather than a gate-local `getDefinitionNodes` walk",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/character/hooks/imported-options.ts":
          'import { paged } from "./paged-options.ts";\nexport const q = (trpc) => trpc.character.list.infiniteQueryOptions({ limit: 30 }, paged);\n',
        "packages/client/src/features/character/hooks/paged-options.ts": "export const paged = { maxPages: 5, getNextPageParam: (p) => p.nextCursor };\n",
      },
      expect: { count: 1, messageIncludes: "ARMS: no-rewind." },
      why: "THE CONVERSION'S ONE DELIBERATE CATCH WIDENING (§4.6, classified as a stronger reader): the legacy walk filtered definitions to `decl.getSourceFile() === value.getSourceFile()`, so an options const imported from a sibling module hid the cap. The shared reader follows the import door, and the tree's zero-`maxPages` corpus makes the widening free",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/hooks/use-chat-list-collection.ts":
          "const rows = items.filter((r) => r.name.includes(query));\nexport const q = (trpc) =>\n  trpc.chat.list.infiniteQueryOptions(\n    { limit: 50 },\n    { maxPages: 5, getNextPageParam: (p) => p.nextCursor, getPreviousPageParam: (p) => p.prevCursor },\n  );\n",
      },
      expect: { count: 1, messageIncludes: "ARMS: client-lens." },
      why: "ARM B ALONE — the rewind is recoverable, but a client-side `.filter` over a WINDOWED collection searches 250 rows and calls it the library. One finding, and the message names the single arm",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/hooks/both-arms.ts":
          "const rows = items.filter((r) => r.starred);\nexport const q = (trpc) =>\n  trpc.chat.list.infiniteQueryOptions({ limit: 50 }, { maxPages: 5, getNextPageParam: (p) => p.nextCursor });\n",
      },
      expect: { count: 1, messageIncludes: "ARMS: no-rewind + client-lens." },
      why: "BOTH ARMS ON ONE PROPERTY — the case the legacy descriptor reported TWICE. It is ONE finding now, because two findings sharing a carrier AND a token are unwaivable by every marker (§4.2); the arms ride the message, and this row is the successor proof for the retired two-token vocabulary",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/character/hooks/block-rewind.ts":
          "export const q = (trpc) =>\n  trpc.character.list.infiniteQueryOptions(\n    { limit: 30 },\n    {\n      maxPages: 5,\n      getNextPageParam: (p) => p.nextCursor,\n      getPreviousPageParam: (p) => {\n        return undefined;\n      },\n    },\n  );\n",
      },
      expect: { count: 1, messageIncludes: "ARMS: no-rewind." },
      why: "A BLOCK-BODIED rewind that only ever returns `undefined` is as inert as the concise spelling. This is the arm the conversion had to REBUILD — the legacy reader called `getDescendantsOfKind(ReturnStatement)` on the body, which `defineGate` forbids; the returns now arrive through the one kind-indexed walk and are attributed by ancestor",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/character/surfaces/character-library-surface.tsx":
          "const rows = items.filter((r) => r.starred);\nexport const q = (trpc) =>\n  trpc.character.list.infiniteQueryOptions(\n    { limit: 30, search: term, sort },\n    { initialCursor: null, getNextPageParam: (p) => p.nextCursor, getPreviousPageParam: () => undefined },\n  );\n",
      },
      why: "THE FIX AS IT STANDS ON THE TREE — no `maxPages` at all, so the inert `getPreviousPageParam` is harmless (nothing evicts) and the lens is a wire param. The policy judges the CAP, never the rewind on its own",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/hooks/use-plain-window.ts":
          "export const q = (trpc) =>\n  trpc.chat.list.infiniteQueryOptions({ limit: 50 }, { maxPages: 5, getNextPageParam: (p) => p.nextCursor, getPreviousPageParam: (p) => p.prevCursor });\n",
      },
      why: "THE REWIND NARROWING, pinned: a cap WITH a real rewind and no client-side lens is a legitimate memory window — every evicted page can be fetched back, which is the whole invariant. Cutting `neverRewinds` open (returning true unconditionally) turns this red",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/chat/hooks/reshape-only.ts":
          "const labels = items.map((r) => r.name);\nexport const q = (trpc) =>\n  trpc.chat.list.infiniteQueryOptions({ limit: 50 }, { maxPages: 5, getNextPageParam: (p) => p.nextCursor, getPreviousPageParam: (p) => p.prevCursor });\n",
      },
      why: "THE LENS-SET NARROWING, pinned: `.map` RESHAPES, it does not SELECT, so it sees every page it is given and a window costs it nothing. Cutting `LENS_METHODS` membership (treating every method call as a lens) turns this red",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/character/hooks/use-one.ts": "export const q = (trpc) => trpc.character.get.queryOptions({ id }, { maxPages: 5 });\n",
      },
      why: 'THE FACTORY-NAME NARROWING, pinned, and a DECLARED LIMIT besides: a non-infinite query has no pages to window, so a `maxPages` left behind by a migration off `infiniteQueryOptions` is inert and is not this policy\'s offense. Cutting the `callee.getName() === "infiniteQueryOptions"` test (admitting every member call) turns this red — measured 2026-09-12. THE CAP IS WHAT MAKES THE ROW DISCRIMINATE (#2087): without it the fixture produced no subject under the cut either, and the row was green for a reason unrelated to the factory name while its `why` claimed otherwise',
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/character/hooks/bare-call.ts":
          "declare function infiniteQueryOptions(input: unknown, options: unknown): unknown;\nexport const q = infiniteQueryOptions({ limit: 30 }, { maxPages: 5 });\n",
      },
      why: "THE RECEIVER NARROWING, pinned: the subject is the tRPC proxy's member call `trpc.<router>.<proc>.infiniteQueryOptions(...)`, never a bare same-named local function. Cutting `Node.isPropertyAccessExpression(callee)` (admitting a bare identifier callee) turns this red",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/character/hooks/spread-options.ts":
          "const base = { maxPages: 5 };\nexport const q = (trpc) => trpc.character.list.infiniteQueryOptions({ limit: 30 }, { ...base, getNextPageParam: (p) => p.nextCursor });\n",
      },
      why: "DECLARED LIMIT: a cap reached through a SPREAD is invisible — the options literal carries no `maxPages` property assignment of its own, and the reader names properties rather than evaluating the object. Recorded rather than pinned as a fence, because no cut makes this row red: the spread simply produces no subject",
    },
    {
      mode: "types",
      files: {
        // The IN-POPULATION ANCHOR: without it `@client` admits zero paths and the row returns a
        // `[population]` TOOL ERROR rather than a pass.
        "packages/client/src/features/character/hooks/anchor.ts": "export const q = (trpc) => trpc.character.get.queryOptions({ id });\n",
        "packages/server/src/domain/character/verbs/list.ts":
          "export const q = (trpc) =>\n  trpc.character.list.infiniteQueryOptions({ limit: 30 }, { maxPages: 5, getNextPageParam: (p) => p.nextCursor });\n",
      },
      why: "THE POPULATION FENCE, pinned: mustFlag[1]'s exact shape under `@server` is not admitted. Widening `population` to `@authored` turns this red — the only row that dies without the fence",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/character/hooks/waived.ts":
          "export const q = (trpc) =>\n  trpc.character.list.infiniteQueryOptions(\n    { limit: 30 },\n    // @orb-waive windowed-infinite-query(maxPages): the proof stand-in reason; ends when this fixture stops flagging.\n    { maxPages: 5, getNextPageParam: (p) => p.nextCursor },\n  );\n",
      },
      why: "POSITIONAL IDENTITY: the finding anchors on the `maxPages` property assignment, so the derived position is the property NAME and an author waives `maxPages`. The fixture produces exactly ONE finding for the one marker to consume — which is only true BECAUSE the two arms were merged: the legacy two-finding shape shared this carrier and this token and no marker could have suppressed either",
    },
  ],
});
