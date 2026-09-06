// WHY the Extensions section has no pages to show (#924) — the one derivation both panes resolve their
// teaching empty from, so the LIST and the CONTENT pane can never state different facts about the same
// account.
//
// PER-USER EMPTINESS IS ABOUT THE ASKER. `plugin.list` is the caller's OWN rows and `plugin.listSurfaces`
// only ever collects the caller's own ENABLED plugins, so "no pages" is never a fact about the deployment.
// A fresh boot is the proof: nine example plugins land installed-disabled with an empty grant and a standing
// consent ask (`entry/boot/seed-example-plugins.ts`), which is zero surfaces and nine reasons to say
// something other than "install a plugin".
//
// THE PENDING ARM IS THE POINT, not defensiveness. Both reads are non-suspense `useQuery` (the switcher must
// not blank the painted page beside it), so before they settle `plugins` is `undefined` and `pages` is `[]` —
// and a pane that renders its empty from that says "you have none" about an account it has not read yet.
// `reason: null` is that state, and the panes draw their loading skin for it. This is the same discipline the
// empty itself exists for: do not state a fact you do not have.
//
// BOTH QUERIES ARE READ HERE even though `usePluginPages` reads them too — TanStack dedupes by key, so this
// costs no request, and the alternative (widening `usePluginPages`' return with a pending flag) would put
// the page list and the reason-for-no-pages behind one shape that two panes consume differently.

import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { useTRPC } from "#data";
import type { EXTENSIONS_EMPTY_COPY } from "../lib/extensions-copy.ts";

/** The axis, DERIVED from the copy map rather than declared beside it — a reason without copy is not a
 *  reachable state, and a client feature is not a type home for a declared union (`no-inline-types`). */
type ExtensionsEmptyReason = keyof typeof EXTENSIONS_EMPTY_COPY;

/** One projected row of `plugin.list` — a private derived alias, the `plugin-row.tsx` precedent (a 1-line
 *  `inferOutput` derivation, not an exported shape a type home would own). */
type PluginView = inferOutput<Trpc["plugin"]["list"]>[number];

/** The resolved reason plus the plugins its copy is about. */
export interface ExtensionsEmptyView {
  /** `null` while the reads have not settled — the pane owes a loading skin, not a claim. */
  readonly reason: ExtensionsEmptyReason | null;
  /**
   * The installed plugins standing on the caller's consent — EMPTY on every other arm.
   *
   * IT USED TO BE A COUNT, AND THE RULING SURVIVES — ITS INPUT CHANGED (#1699). #924's reason for carrying a
   * number was that the copy spends one ("2 plugins are installed but not allowed to do anything yet"), and
   * it still does — off `.length`, so there is one source rather than two. What the count could not do was
   * let the pane NAME them: nine installed plugins rendered as one anonymous `Review what they ask for`, the
   * only map row on the surface with no semantic identity. The rows themselves are what this arm is about,
   * so the rows are what it carries, and the count is derived where it is printed.
   */
  readonly awaitingPlugins: readonly PluginView[];
}

const PENDING: ExtensionsEmptyView = { reason: null, awaitingPlugins: [] };

/** Every other arm: the reason alone, with no plugins to name. */
const NONE_AWAITING: readonly PluginView[] = [];

/**
 * Resolve why the caller sees no extension pages. Ordered by what they must do next, most-blocking first:
 * nothing installed → something is asking for consent → everything is switched off → the plugins that ARE
 * running simply bring no page.
 *
 * `reconsentPending` is the SERVER's durable verdict ("this plugin asks for capabilities you have not
 * allowed") — the same field `PluginRow`'s notice renders from, so this pane and the grant screen it points
 * at can never disagree about whether an answer is owed.
 */
export function useExtensionsEmpty(): ExtensionsEmptyView {
  const trpc = useTRPC();
  const { data: plugins } = useQuery(trpc.plugin.list.queryOptions());
  const { data: surfaces } = useQuery(trpc.plugin.listSurfaces.queryOptions());
  if (plugins === undefined || surfaces === undefined) {
    return PENDING;
  }
  if (plugins.length === 0) {
    return { reason: "none-installed", awaitingPlugins: NONE_AWAITING };
  }
  const awaitingPlugins = plugins.filter((plugin) => plugin.reconsentPending);
  if (awaitingPlugins.length > 0) {
    return { reason: "awaiting-consent", awaitingPlugins };
  }
  if (plugins.every((plugin) => plugin.status !== "enabled")) {
    return { reason: "all-off", awaitingPlugins: NONE_AWAITING };
  }
  return { reason: "no-pages", awaitingPlugins: NONE_AWAITING };
}
