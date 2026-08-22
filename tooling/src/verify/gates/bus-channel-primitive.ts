// Gate: bus-channel-primitive (client-architecture-lockdown.md §13/§16 G10) — `defineBusChannel`
// (transport/trpc/bus-channel.ts) is the ONE transport EventEmitter home. chat/user/notifications used to
// hand-roll `new EventEmitter()` + `setMaxListeners(0)` + a channel-key fn + `on(emitter, channel, {signal})`
// three times over (M9); a fourth bus reaching for a bespoke emitter instead of the mint is the same drift
// reappearing. Buddy's `@orb/kit/replay-buffer`-backed bus (`domain/buddy`) is domain-minted, not a transport
// `EventEmitter` — out of this gate's scope by owner ruling (O4, tracked separately).
//
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the mint's own home is SCANNED and exempted by a
// cited row plus the shared RENAME TRIPWIRE, not scoped out of scanRoot — an excluded home would carry its
// exemption silently through a move, and the whole claim of this gate is that the mint has ONE address.
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { HOME_SWEEP_ANCHOR, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const TRANSPORT_SCOPE = /\/packages\/server\/src\/transport\//u;
const GATE_SELF = "tooling/src/verify/gates/bus-channel-primitive.ts";

/** The ONE transport EventEmitter home. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/server/src/transport/trpc/bus-channel.ts": {
    why: "`defineBusChannel`'s own module — the emitter it wraps is constructed HERE, which is the entire point of the mint (M9, client-architecture-lockdown.md §13/§16 G10). Ends when the mint moves: the rename tripwire reds the row at its dead path",
  },
};

const MESSAGE =
  "`new EventEmitter(` under packages/server/src/transport/ outside bus-channel.ts — defineBusChannel (client-architecture-lockdown.md §13/§16 G10) is the ONE transport EventEmitter home; a bespoke emitter re-introduces the machinery M9 unified. Buddy's domain-minted replay-buffer bus is out of scope (O4).";

export const gate: GateDescriptor = {
  name: "bus-channel-primitive",
  docRow: "client-architecture-lockdown.md §13/§16 G10",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "route the bus through defineBusChannel (transport/trpc/bus-channel.ts) instead of a bespoke `new EventEmitter()`.",
  scanRoot: (p) => TRANSPORT_SCOPE.test(`/${p}`),
  kinds: [SyntaxKind.NewExpression],
  visit: (node, sf, ctx) => {
    if (!Node.isNewExpression(node)) {
      return;
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    if (node.getExpression().getText() === "EventEmitter") {
      ctx.report(node, { token: "new EventEmitter(", offset: 0 });
    }
  },
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "transport EventEmitter mint" });
  },
  mustFlag: [
    {
      files: 'import { EventEmitter } from "node:events";\nexport const bus = new EventEmitter();\n',
      at: "packages/server/src/transport/trpc/__probe-bus.ts",
      why: "a bespoke `new EventEmitter()` under transport/, outside bus-channel.ts's own home — reintroduces the pre-M9 pattern",
    },
    {
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
        "packages/server/src/transport/trpc/routers/x.ts": "export const r = null;\n",
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the shared anchor is loaded but bus-channel.ts resolves to no file — the mint moved, which the old scanRoot exclusion could not see",
    },
  ],
  mustPass: [
    {
      files: 'import { EventEmitter } from "node:events";\nexport const bus = new EventEmitter();\n',
      at: "packages/server/src/transport/trpc/bus-channel.ts",
      why: "THE ALLOWLIST ITSELF: the primitive's own home is now SCANNED and passes only on a cited SANCTIONED_HOMES row — this is where `new EventEmitter()` is SUPPOSED to live",
    },
    {
      files: "export class Thing {}\nexport const t = new Thing();\n",
      at: "packages/server/src/transport/trpc/__probe-other.ts",
      why: "a `new` expression for a non-EventEmitter constructor under transport/ — not the gate's target",
    },
  ],
};
