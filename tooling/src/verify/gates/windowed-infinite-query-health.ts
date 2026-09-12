// Policy: windowed-infinite-query-health — the BLINDNESS TRIPWIRE for `windowed-infinite-query`, family
// `windowed-infinite-query`.
//
// Its sibling keys on the LITERAL member name `infiniteQueryOptions`. If TanStack renames the option, or
// the tRPC query factory moves, that policy goes silently green forever and its zero is a placebo. So a
// client tree that resolves ZERO `infiniteQueryOptions` call sites is itself RED.
//
// WHY IT IS A SEPARATE POLICY (§3, and it differs on BOTH axes that force a split):
//   · AUTHORITY — `hard`. "This detector can no longer see its subject" is not an occurrence an author may
//     waive; the only answer is to re-point the policy. Its sibling is `ordinary` because a deliberate
//     window is a legitimate, reason-bearing exception.
//   · EXECUTION — `entire-population`. The verdict is a whole-tree census, so a narrowed selection must
//     DEFER rather than declare the tree blind. Its sibling's per-call-site verdict composes over any
//     subset, and folding this arm in would have forced `entire-population` on the whole module —
//     the over-declaration §5b.1 names.
//
// THE REAL-TREE ANCHOR (§4.5), and why it is this file. `packages/client/src/data/trpc.ts` is the tRPC
// proxy's one home: present on every real run, in the population, and — re-derived 2026-09-12 — it does not
// itself call `infiniteQueryOptions` (the five live call sites are surfaces and components, plus
// `data/create-collection-surface.ts`, which only NAMES the member in a type and a JSDoc line). Without the
// anchor test, every fixture-sized run would "prove" the tree blind. The legacy descriptor guarded on "some
// file under packages/client/src/data/ is loaded", which is the same idea with a directory's worth of slack;
// the exact file is the stronger guard and matches the `spacing-tier-home-health` shape.
//
// THE FINDING ANCHORS ON THAT FILE, NOT ON THE GATE MODULE. Legacy reported at
// `tooling/src/verify/gates/windowed-infinite-query.ts:1`, which is outside this policy's own population and
// is inexpressible under the final contract (`report.file` requires population membership). The anchor move
// is classified in the §4.6 differential; it binds no marker, because a `hard` policy has no waiver door.
//
// §4.1 NARROWING MATRIX, measured 2026-09-12, and A TRIPWIRE'S CUT DIRECTION IS THE REVERSE OF AN
// OCCURRENCE POLICY'S: every fence here ACQUITS (it decides what counts as a live call site), so opening one
// makes the policy flag FEWER and the falsifier is a `mustFlag` row going GREEN, never a `mustPass` going red.
//   anchor self-guard            → RED ×1 (the un-anchored mustPass; it reds as the runtime's own
//                                   "finding file is outside the effective population" tool error)
//   property-access receiver     → RED ×1 (the bare-call mustFlag)
//   factory-name equality        → RED ×2 (the renamed-factory and cross-population mustFlags)
//   population `@client`         → RED ×1 (the cross-population mustFlag)
//
// POPULATION PORT: BYTE-IDENTICAL to the legacy `scanRoot` (`@client` === `packages/client/src/`).
// FAMILY: `windowed-infinite-query`, shared with the occurrence policy; the shared computation is the
// `infiniteQueryOptions` member-call subject, spelled identically in both modules.
// LEGACY SHA: 67366da91 (the `finalize` hook of the single legacy `windowed-infinite-query` descriptor).
// SHA FORM NOTE: the `LEGACY SHA` above is the last commit that TOUCHED THE LEGACY DESCRIPTOR, not this
// conversion's parent (`e81ca1979^`) — the other convention in this corpus. Both resolve to readable
// legacy source; this one points at it in its final state, which is why it was kept.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const INFINITE_FACTORY = "infiniteQueryOptions";
/** The tRPC proxy's one home — loaded on every real run, and never a factory call site itself. */
const ANCHOR = "packages/client/src/data/trpc.ts";

const MESSAGE = `DERIVED NOTHING — no \`${INFINITE_FACTORY}\` call site exists under packages/client/src, so windowed-infinite-query's whole basis has moved or been renamed and its green verdict is a placebo. Re-point it at the current query factory: tooling/src/verify/gates/windowed-infinite-query.ts.`;

export const gate = defineGate({
  id: "windowed-infinite-query-health",
  family: "windowed-infinite-query",
  authority: "hard",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  create: (ctx) => {
    let sawFactory = false;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const callee = node.getExpression();
            if (Node.isPropertyAccessExpression(callee) && callee.getName() === INFINITE_FACTORY) {
              sawFactory = true;
            }
          },
        },
      ],
      evaluate: (): void => {
        const anchored = ctx.files.some((file) => ctx.relativePath(file) === ANCHOR);
        // The census IS the receipt's subject: one anchor, measured. A `-health` policy receipts a CONSTANT
        // rather than its own finding count, or `receiptFailures`' `count === 0` predicate turns the very
        // condition it exists to report into a tool error (§12.3, the provider-side inversion one layer out).
        ctx.receipt({ kind: "population", source: ANCHOR, members: 1, unresolved: 0 });
        if (anchored && !sawFactory) {
          ctx.report.file(ANCHOR, { line: 1 });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        [ANCHOR]: "export type Trpc = unknown;\nexport const trpc = null;\n",
        "packages/client/src/features/character/surfaces/character-library-surface.tsx":
          "export const q = (trpc) => trpc.character.list.pagedOptions({ limit: 30 });\n",
      },
      expect: { count: 1, line: 1 },
      why: "THE TRIPWIRE: the anchor is loaded, so the client tier is really present, and not one `infiniteQueryOptions` call site resolves — the factory was renamed (`pagedOptions` here) and the occurrence policy's green is a placebo. The finding anchors on the tRPC home, inside the population, where legacy anchored on the gate module itself",
    },
    {
      mode: "source",
      files: {
        [ANCHOR]: "export type Trpc = unknown;\nexport const trpc = null;\n",
        "packages/client/src/features/character/hooks/bare.ts":
          "declare function infiniteQueryOptions(input: unknown): unknown;\nexport const q = infiniteQueryOptions({ limit: 30 });\n",
      },
      expect: { count: 1, line: 1 },
      why: "THE TRIPWIRE APPLIES THE SAME PREDICATE AS THE THING IT GUARDS (§4.6): its sibling's subject is a MEMBER call on the proxy, so a bare same-named local function does NOT count as a live call site and the tree is still blind. Cutting `Node.isPropertyAccessExpression(callee)` here (counting the bare call as a factory) turns this row GREEN and makes the tripwire weaker than the policy it polices — the only row that dies without the receiver clause, and a tripwire's cut direction is the REVERSE of an occurrence policy's, because its fences ACQUIT",
    },
    {
      mode: "source",
      files: {
        [ANCHOR]: "export type Trpc = unknown;\nexport const trpc = null;\n",
        "packages/client/src/features/character/surfaces/character-library-surface.tsx":
          "export const q = (trpc) => trpc.character.list.pagedOptions({ limit: 30 });\n",
        "packages/server/src/domain/character/verbs/list.ts": "export const q = (trpc) => trpc.character.list.infiniteQueryOptions({ limit: 30 });\n",
      },
      expect: { count: 1, line: 1 },
      why: "THE POPULATION FENCE, pinned, and its job here is the OPPOSITE of an occurrence policy's: population decides which files may ACQUIT the tree. A `@server` factory call must not count as a live CLIENT call site. Widening `population` to `@authored` admits it, `sawFactory` goes true and this row turns GREEN — the only row that dies without the fence. It needed a constructed fixture: the `@server`-only shape an occurrence policy uses is CLEAN here, which is how the first attempt at this cell read UNFALSIFIABLE",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [ANCHOR]: "export type Trpc = unknown;\nexport const trpc = null;\n",
        "packages/client/src/features/character/surfaces/character-library-surface.tsx":
          "export const q = (trpc) => trpc.character.list.infiniteQueryOptions({ limit: 30 }, { getNextPageParam: (p) => p.nextCursor });\n",
      },
      why: "THE LIVE TREE'S SHAPE: the anchor is loaded and a real `infiniteQueryOptions` call site resolves, so the sibling policy can still see its subject and the tripwire stays quiet",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/character/hooks/unrelated.ts": "export const clean = true;\n" },
      why: "THE ANCHOR SELF-GUARD, pinned: the tRPC home is NOT loaded — a fixture-sized or narrowly-scoped run — so the policy refuses to claim the tree blind. Cutting the `anchored` test (reporting whenever no factory is seen) turns this red, and it is the only row that dies without it. MEASURED: the cut reds it as `PASS TOOL ERROR [evaluate] finding file is outside the effective population` — the runtime's own membership fence catching a policy reporting on a file it was never given, which is the stronger failure",
    },
  ],
});
