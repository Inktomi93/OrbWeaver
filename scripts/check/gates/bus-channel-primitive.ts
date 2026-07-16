// Gate: bus-channel-primitive (client-architecture-lockdown.md §13/§16 G10) — `defineBusChannel`
// (transport/trpc/bus-channel.ts) is the ONE transport EventEmitter home. chat/user/notifications used to
// hand-roll `new EventEmitter()` + `setMaxListeners(0)` + a channel-key fn + `on(emitter, channel, {signal})`
// three times over (M9); a fourth bus reaching for a bespoke emitter instead of the mint is the same drift
// reappearing. Buddy's `@orb/kit/replay-buffer`-backed bus (`domain/buddy`) is domain-minted, not a transport
// `EventEmitter` — out of this gate's scope by owner ruling (O4, tracked separately).
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const TRANSPORT_SCOPE = /\/packages\/server\/src\/transport\//u;
const OWN_HOME = /\/packages\/server\/src\/transport\/trpc\/bus-channel\.ts$/u;

const MESSAGE =
  "`new EventEmitter(` under packages/server/src/transport/ outside bus-channel.ts — defineBusChannel (client-architecture-lockdown.md §13/§16 G10) is the ONE transport EventEmitter home; a bespoke emitter re-introduces the machinery M9 unified. Buddy's domain-minted replay-buffer bus is out of scope (O4).";

export const gate: GateDescriptor = {
  name: "bus-channel-primitive",
  docRow: "client-architecture-lockdown.md §13/§16 G10",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "route the bus through defineBusChannel (transport/trpc/bus-channel.ts) instead of a bespoke `new EventEmitter()`.",
  scanRoot: (p) => TRANSPORT_SCOPE.test(`/${p}`) && !OWN_HOME.test(`/${p}`),
  kinds: [SyntaxKind.NewExpression],
  visit: (node, _sf, ctx) => {
    if (!Node.isNewExpression(node)) {
      return;
    }
    if (node.getExpression().getText() === "EventEmitter") {
      ctx.report(node, { token: "new EventEmitter(", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'import { EventEmitter } from "node:events";\nexport const bus = new EventEmitter();\n',
      at: "packages/server/src/transport/trpc/__probe-bus.ts",
      why: "a bespoke `new EventEmitter()` under transport/, outside bus-channel.ts's own home — reintroduces the pre-M9 pattern",
    },
  ],
  mustPass: [
    {
      files: 'import { EventEmitter } from "node:events";\nexport const bus = new EventEmitter();\n',
      at: "packages/server/src/transport/trpc/bus-channel.ts",
      why: "the primitive's OWN home is exempt — this is where `new EventEmitter()` is SUPPOSED to live",
    },
    {
      files: "export class Thing {}\nexport const t = new Thing();\n",
      at: "packages/server/src/transport/trpc/__probe-other.ts",
      why: "a `new` expression for a non-EventEmitter constructor under transport/ — not the gate's target",
    },
  ],
};
