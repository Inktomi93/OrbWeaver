// The DEV-ONLY half of the door's third job (client-architecture-lockdown.md §3/§7): assemble the three
// agent-bridge implementations and install `globalThis.__orb`. A fourth composition-tier directory module,
// and the only one that composes its siblings — which is exactly the privilege §3 reserves for door glue.
//
// WHY IT IS ITS OWN MODULE (#433, the boot-eval split). `installAgentDebugHandle` already no-ops outside
// dev, but its ARGUMENTS were built unconditionally at the call site in main.tsx — so `buildAgentNav` /
// `buildAgentSeed` / `buildAgentRpg` were live static imports of the boot chunk and dragged their whole
// graph into the bundle every visitor evaluates before the login form can paint. Measured on this tree's
// production build, that graph was ~570 kB of the 1.15 MB entry: @orb/contracts `preset` (78 kB, reached
// through `chat/metadata`) + `rpg` (65 kB) + `refinery`/`chat`/`character`/`imagery` prose, and through
// `contracts/preset` → `@orb/kit/macro` → `@orb/kit/cel` the cel-js evaluator (140 kB) and luxon (125 kB).
// None of it is reachable from a prod build's `__orb`, which does not exist.
//
// Behind `import.meta.env.DEV` + a dynamic `import()` in main.tsx, the bundler constant-folds the arm away
// and this module (and everything only it reaches) leaves the production output entirely — the same shape
// main.tsx already uses for `lib/long-task-tracer.ts`. In dev the install lands a microtask-plus-fetch
// later than it used to; that costs no evidence, because every performance channel the handle installs
// observes with `buffered: true` (motion-stats LoAF + layout-shift, long-task-tracer longtask + event).
//
// The singletons are PASSED IN, never imported: `compose/` is the door's own half and
// `client-compose-door-only` gives it exactly three legal importers (main.tsx, routes/router.tsx, a
// compose/ sibling). Only `#state` readers are reached directly, which the composition tier may do.

import { cssMergeTrace } from "@orb/ui/lib";
import type { QueryClient } from "@tanstack/react-query";
import type { Trpc, TrpcClient } from "#data";
import type { ContributorRegistry } from "#lib";
import type { ConfigSectionContribution } from "#state";
import { activeChatId, activeDurableLocalUserId } from "#state";
import { buildAgentNav } from "../agent-nav/index.ts";
import { buildAgentPlugin } from "../agent-plugin/index.ts";
import { buildAgentRpg } from "../agent-rpg/index.ts";
import { buildAgentSeed } from "../agent-seed/index.ts";
import { installAgentDebugHandle } from "../lib/agent-bridge.ts";

/** Build the four `__orb` implementations and install the dev introspection handle. Dev-only by
 *  construction: main.tsx reaches this module through an `import.meta.env.DEV` dynamic import.
 *  `resolveConfigSections` is #1638's injected thunk (`agent-nav/index.ts`'s `ResolveConfigSections`) —
 *  main.tsx builds it over a SEPARATE dynamic `import()` of `compose/config-sections.ts` (this module may
 *  not import `compose/` itself, `client-compose-door-only`) and hands it straight through; `undefined`
 *  here is only the pre-#1638 test/story call shape, never a real boot path. */
export function installAgentHandles(
  queryClient: QueryClient,
  trpcClient: TrpcClient,
  trpcProxy: Trpc,
  resolveConfigSections?: () => ContributorRegistry<ConfigSectionContribution> | null,
): void {
  cssMergeTrace.enable();
  installAgentDebugHandle(queryClient, {
    nav: buildAgentNav(trpcProxy, queryClient, resolveConfigSections),
    seed: buildAgentSeed(trpcClient),
    rpg: buildAgentRpg(trpcClient, activeChatId),
    pluginLog: buildAgentPlugin(trpcClient),
    css: { read: cssMergeTrace.read, reset: cssMergeTrace.reset },
    durableLocalUserId: activeDurableLocalUserId,
  });
}
