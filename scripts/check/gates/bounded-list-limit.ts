// Gate: bounded-list-limit (Tier-4-Transport.md — the #45/#46 unbounded list-`limit` ceiling) — a paged/list
// tRPC input must never accept an UNBOUNDED `limit`. An inline `limit: z.number()…` chain WITHOUT a `.max(…)`
// feeds an unbounded SQL `.limit()` — the #45 class (an 872-chat library / a big re-import that dies on the
// fetch); a `.max()` at the trust boundary turns an over-ask into a BAD_REQUEST. Scanned in the two wire-schema
// homes: the tRPC router tree + `packages/contracts/src`. A `limit` whose value is a NAMED schema (an
// Identifier) is OUT of scope — it is separately defined and may be a recursion cap (`toolRecurseLimitSchema`),
// not a page size. DECLARED LIMITS: `topN`-named top-N fields carry the SAME bomb class (bounded by hand this
// lane in `search.*`) but the gate is `limit`-scoped by design; a `z.coerce.number()` root has no live `limit`
// site on the tree. Escape: the shared `// @orb-gate-ignore bounded-list-limit: <reason>` marker.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { unwrapExpression } from "../ast-read.ts";
import type { GateDescriptor } from "../contract.ts";

const MESSAGE =
  "an unbounded `limit` in a list/paged tRPC input (Tier-4-Transport.md — the #45/#46 ceiling): an inline " +
  "`limit: z.number()…` chain with no `.max(…)` feeds an unbounded SQL `.limit()` (the chat.listChats-scale " +
  "fetch bomb). Add `.max(<PER_DOMAIN_CONST>)` so an over-bound ask is a BAD_REQUEST, never a whole-catalog read.";
const FIX =
  "bound the field with `.max(<CONST>)` from a per-domain contract constant (the `CHARACTER_LIST_MAX_LIMIT` / " +
  "`character.list` precedent) — e.g. `z.number().int().min(1).max(MY_LIST_MAX_LIMIT).optional()`.";

/** Walk a property initializer's zod CALL CHAIN (built outermost-first: `.optional()` wraps `.max()` wraps
 *  `.int()` wraps `z.number()`), reporting whether it is rooted at `z.number()` / `z.coerce.number()` and
 *  whether a `.max(…)` appears anywhere in the chain. Wrapping (`as`/`satisfies`/parens) is unwrapped at each
 *  hop so `(z.number().optional()) as X` is read like the bare chain. A NAMED-schema initializer (an
 *  Identifier) is not a CallExpression, so the loop never runs and `isZodNumber` stays false — correctly out
 *  of scope. */
function analyzeZodNumberChain(init: Node): { isZodNumber: boolean; hasMax: boolean } {
  let isZodNumber = false;
  let hasMax = false;
  let cur: Node = unwrapExpression(init);
  while (cur.isKind(SyntaxKind.CallExpression)) {
    const callee = cur.getExpression();
    if (!callee.isKind(SyntaxKind.PropertyAccessExpression)) {
      break;
    }
    const name = callee.getName();
    if (name === "max") {
      hasMax = true;
    }
    const recv = unwrapExpression(callee.getExpression());
    if (name === "number") {
      const recvText = recv.getText();
      if (recvText === "z" || recvText === "z.coerce") {
        isZodNumber = true;
      }
    }
    cur = recv;
  }
  return { isZodNumber, hasMax };
}

export const gate: GateDescriptor = {
  name: "bounded-list-limit",
  docRow: "Tier-4-Transport.md (#45/#46 unbounded list-`limit` ceiling)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.startsWith("packages/server/src/transport/trpc/routers/") || p.startsWith("packages/contracts/src/"),
  kinds: [SyntaxKind.PropertyAssignment],
  visit: (node, _sf, ctx) => {
    if (!node.isKind(SyntaxKind.PropertyAssignment) || node.getName() !== "limit") {
      return;
    }
    const init = node.getInitializer();
    if (init === undefined) {
      return;
    }
    const { isZodNumber, hasMax } = analyzeZodNumberChain(init);
    if (isZodNumber && !hasMax) {
      ctx.report(node, { token: "limit", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'import { z } from "zod";\nexport const s = z.object({ limit: z.number().int().optional() });\n',
      at: "packages/server/src/transport/trpc/routers/probe.ts",
      expect: { count: 1, token: "limit" },
      why: "the founding #45 shape — an inline `limit: z.number().int().optional()` with no `.max()` in a router input, RED",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.object({ limit: z.number().int().positive().optional() });\n',
      at: "packages/contracts/src/probe/index.ts",
      expect: { count: 1, token: "limit" },
      why: "the stats/discovery `.positive().optional()` variant in a contracts wire schema, RED",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.object({ limit: z.number() });\n',
      at: "packages/server/src/transport/trpc/routers/probe.ts",
      expect: { count: 1, token: "limit" },
      why: "a bare unbounded `limit: z.number()` (no chain at all), RED",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.object({ limit: (z.number().int().optional()) });\n',
      at: "packages/server/src/transport/trpc/routers/probe.ts",
      expect: { count: 1, token: "limit" },
      why: "a parenthesized unbounded chain — the wrapping is unwrapped at each hop, still RED",
    },
  ],
  mustPass: [
    {
      files: 'import { z } from "zod";\nconst LIST_MAX = 100;\nexport const s = z.object({ limit: z.number().int().min(1).max(LIST_MAX).optional() });\n',
      at: "packages/server/src/transport/trpc/routers/probe.ts",
      why: "the bounded shape — `.max(LIST_MAX)` present in the chain, passes (the character.list precedent)",
    },
    {
      files:
        'import { z } from "zod";\nimport { toolRecurseLimitSchema } from "#domain/chat";\nexport const s = z.object({ limit: toolRecurseLimitSchema });\n',
      at: "packages/server/src/transport/trpc/routers/probe.ts",
      why: "a `limit` whose value is a NAMED schema (an Identifier, not an inline z.number chain) — out of scope, passes (the live `chat.ts` toolRecurseLimit shape)",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.object({ topN: z.number().int().positive() });\n',
      at: "packages/server/src/transport/trpc/routers/probe.ts",
      why: "DECLARED LIMIT: a `topN`-named field is the same bomb class but the gate is `limit`-scoped by design — not flagged (bounded by hand in search.*)",
    },
    {
      files: 'import { z } from "zod";\nexport const s = z.object({ count: z.number().int().optional() });\n',
      at: "packages/server/src/transport/trpc/routers/probe.ts",
      why: "a non-`limit` numeric field is not a list page size — passes (the gate keys on the field name)",
    },
  ],
};
