// Gate: windowed-infinite-query — `maxPages` on an infinite query WINDOWS the cache, and a window has two
// consequences the three surfaces that shipped it all got wrong. (A) TanStack evicts the HEAD page past the
// cap, and with `getPreviousPageParam: () => undefined` nothing can ever fetch it back — rows vanish off the
// TOP of the list as the user scrolls (owner dogfood 2026-08-13 P1; the character library at `maxPages: 5`
// × 30 = 150 rows, and the same shape in databank + the chat list). (B) any client-side LENS —
// filter/search/sort over the flattened pages — then sees only the window, so a match on row 200 is
// invisible while the list claims to be searchable. The three fixes all DELETED the cap (a virtualized list
// is already DOM-bounded and summary rows are light) and moved the lens SERVER-side onto the keyset, which
// is the standing law: `docs/architecture/core/client-architecture-lockdown.md` — a paged list's
// search/sort/filter is a WIRE param, and the sort IS the keyset key.
//
// EXTINCT AT LANDING, DELIBERATELY. Zero `maxPages` remain on the tree (all three were removed 2026-08-13/14);
// this gate exists so the fourth surface cannot re-introduce the class. A gate for a class that is currently
// extinct is exactly the right time to write one — the corpus is clean, so the baseline is zero and the
// first re-appearance is unambiguous.
//
// BLINDNESS TRIPWIRE (§4.6): the gate keys on the literal names `maxPages` and `infiniteQueryOptions`. If
// TanStack's option is renamed or the query factory moves, this gate would go silently green forever — so a
// real tree with ZERO `infiniteQueryOptions` call sites is itself RED.
//
// DECLARED LIMITS (mustPass rows): a `maxPages` reached through a spread variable is not read; ARM B pairs
// the cap with a lens by FILE, not by dataflow, so a lens over an unrelated array in the same file counts
// (acceptable — the cap is the thing to delete either way, and the corpus is zero).
import type { Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const MESSAGE =
  "`maxPages` WINDOWS an infinite query's cache, and this surface cannot survive the window: with no " +
  "recoverable `getPreviousPageParam` the evicted HEAD page can never be re-fetched (rows disappear off the " +
  "top as the user scrolls — the 2026-08-13 dogfood P1 on the character library, and the same shape in " +
  "databank and the chat list), and any CLIENT-SIDE lens over the flattened pages silently searches only " +
  "the window. All three live surfaces answered this by DELETING the cap — the finding's TOKEN says which " +
  "arm bit (`maxPages/no-rewind` vs `maxPages/client-lens`). See scripts/check/gates/windowed-infinite-query.ts.";

const FIX =
  "delete `maxPages` — a virtualized list is already DOM-bounded and summary rows are light — and push the " +
  "lens SERVER-side onto the keyset (search/sort/filter as wire params; the sort IS the keyset key, " +
  "docs/architecture/core/client-architecture-lockdown.md). The worked shapes: " +
  "packages/client/src/features/character/surfaces/character-library-surface.tsx and " +
  "packages/client/src/features/databank/surfaces/databank-library-surface.tsx, whose headers record the " +
  "removal and why.";

/** ARM tokens. A two-arm gate has ONE message, so the FINDING TOKEN names which arm bit — and per
 *  GATE-AUTHORING.md §4.3a it is also what an `@orb-gate-ignore` must name, because BOTH arms can fire on
 *  the same `maxPages` property and an unpositioned marker would silently absolve both. */
const NO_REWIND_TOKEN = "maxPages/no-rewind";
const CLIENT_LENS_TOKEN = "maxPages/client-lens";
const BLIND_MESSAGE =
  "DERIVED NOTHING — no `infiniteQueryOptions` call site exists under packages/client/src, so this gate's " +
  "whole basis has moved or been renamed and its green verdict is a placebo (GATE-AUTHORING.md §4.6). " +
  "Re-point it at the current query factory: scripts/check/gates/windowed-infinite-query.ts";

const GATE_SELF = "scripts/check/gates/windowed-infinite-query.ts";
const INFINITE_FACTORY = "infiniteQueryOptions";
const MAX_PAGES = "maxPages";
const PREVIOUS_PARAM = "getPreviousPageParam";
/** The client-side list lenses ARM B pairs a cap with. `.map` is not one — it reshapes, it does not select. */
const LENS_METHODS: ReadonlySet<string> = new Set(["filter", "sort", "toSorted", "find", "findIndex", "slice"]);

/** Is this `getPreviousPageParam` value UNRECOVERABLE — an arrow/function that can only ever yield
 *  `undefined`? `() => undefined` is the live spelling; a body with a real cursor return is recoverable. */
function neverRewinds(value: TsNode | undefined): boolean {
  if (value === undefined) {
    return true; // absent is the same unrecoverable state as `() => undefined`
  }
  const body = Node.isArrowFunction(value) || Node.isFunctionExpression(value) ? value.getBody() : undefined;
  if (body === undefined) {
    return false; // an identifier / imported fn — not readable here, assume recoverable
  }
  if (!Node.isBlock(body)) {
    return body.getText() === "undefined";
  }
  const returns = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
  return returns.length > 0 && returns.every((r) => (r.getExpression()?.getText() ?? "undefined") === "undefined");
}

/** The property named `name` on this object literal, if present. */
function prop(obj: TsNode, name: string): TsNode | undefined {
  return Node.isObjectLiteralExpression(obj) ? obj.getProperties().find((p) => Node.isPropertyAssignment(p) && p.getName() === name) : undefined;
}

let sawFactory = false;

export const gate: GateDescriptor = {
  name: "windowed-infinite-query",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project", // the blindness tripwire is a whole-tree claim
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes("packages/client/src/"),

  begin: () => {
    sawFactory = false;
  },

  kinds: [SyntaxKind.CallExpression],

  visit: (node, sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    const callee = node.getExpression();
    if (!Node.isPropertyAccessExpression(callee) || callee.getName() !== INFINITE_FACTORY) {
      return;
    }
    sawFactory = true;
    // The options object is the LAST argument of `x.infiniteQueryOptions(input, options)`.
    const options = node.getArguments().at(-1);
    const cap = options === undefined ? undefined : prop(options, MAX_PAGES);
    if (cap === undefined || options === undefined) {
      return;
    }
    const previous = prop(options, PREVIOUS_PARAM);
    if (neverRewinds(previous === undefined || !Node.isPropertyAssignment(previous) ? undefined : previous.getInitializer())) {
      ctx.report(cap, { token: NO_REWIND_TOKEN, offset: 0 });
    }
    const lensed = sf.getDescendantsOfKind(SyntaxKind.CallExpression).some((c) => {
      const ce = c.getExpression();
      return Node.isPropertyAccessExpression(ce) && LENS_METHODS.has(ce.getName());
    });
    if (lensed) {
      ctx.report(cap, { token: CLIENT_LENS_TOKEN, offset: 0 });
    }
  },

  finalize: (ctx) => {
    if (ctx.scope.kind === "project" && ctx.files.some((f) => f.getFilePath().includes("packages/client/src/data/")) && !sawFactory) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_MESSAGE });
    }
  },

  mustFlag: [
    {
      files:
        "export const q = (trpc) =>\n  trpc.character.list.infiniteQueryOptions(\n    { limit: 30 },\n    { maxPages: 5, getNextPageParam: (p) => p.nextCursor, getPreviousPageParam: () => undefined },\n  );\n",
      at: "packages/client/src/features/character/surfaces/character-library-surface.tsx",
      expect: { token: "maxPages/no-rewind" },
      why: "THE FOUNDING DEFECT verbatim (owner dogfood 2026-08-13 P1): `maxPages: 5` × 30 rows with an inert `getPreviousPageParam` — rows vanished off the top of the owner's library",
    },
    {
      files: "export const q = (trpc) =>\n  trpc.databank.list.infiniteQueryOptions({ limit: 30 }, { maxPages: 5, getNextPageParam: (p) => p.nextCursor });\n",
      at: "packages/client/src/features/databank/surfaces/databank-library-surface.tsx",
      expect: { token: "maxPages/no-rewind" },
      why: "an ABSENT `getPreviousPageParam` is the same unrecoverable state as an inert one — the databank spelling",
    },
    {
      files:
        "const rows = items.filter((r) => r.name.includes(query));\nexport const q = (trpc) =>\n  trpc.chat.list.infiniteQueryOptions(\n    { limit: 50 },\n    { maxPages: 5, getNextPageParam: (p) => p.nextCursor, getPreviousPageParam: (p) => p.prevCursor },\n  );\n",
      at: "packages/client/src/features/chat/hooks/use-chat-list-collection.ts",
      expect: { token: "maxPages/client-lens" },
      why: "ARM B alone — the rewind is recoverable, but a client-side `.filter` over a WINDOWED collection searches 250 rows and calls it the library",
    },
  ],
  mustPass: [
    {
      files:
        "const rows = items.filter((r) => r.starred);\nexport const q = (trpc) =>\n  trpc.character.list.infiniteQueryOptions(\n    { limit: 30, search: term, sort },\n    { initialCursor: null, getNextPageParam: (p) => p.nextCursor, getPreviousPageParam: () => undefined },\n  );\n",
      at: "packages/client/src/features/character/surfaces/character-library-surface.tsx",
      why: "THE FIX as it stands on the tree — no `maxPages` at all, so the inert `getPreviousPageParam` is harmless (nothing evicts) and the lens is a wire param. The gate judges the CAP, never the rewind on its own",
    },
    {
      files:
        "export const q = (trpc) =>\n  trpc.chat.list.infiniteQueryOptions({ limit: 50 }, { maxPages: 5, getNextPageParam: (p) => p.nextCursor, getPreviousPageParam: (p) => p.prevCursor });\n",
      at: "packages/client/src/features/chat/hooks/use-plain-window.ts",
      why: "a cap WITH a real rewind and no client-side lens is a legitimate memory window — every evicted page can be fetched back, which is the whole invariant",
    },
    {
      files: "export const q = (trpc) => trpc.character.get.queryOptions({ id });\n",
      at: "packages/client/src/features/character/hooks/use-one.ts",
      why: "DECLARED LIMIT — a non-infinite query has no pages to window; only `infiniteQueryOptions` call sites are read",
    },
    {
      files: "const options = { maxPages: 5 };\nexport const q = (trpc) => trpc.character.list.infiniteQueryOptions({ limit: 30 }, options);\n",
      at: "packages/client/src/features/character/hooks/use-indirect.ts",
      why: "DECLARED LIMIT — a cap reached through a variable is not read (the options literal is matched in place). No live surface spells it this way; the honest baseline is written here rather than assumed",
    },
  ],
};
