// plugin-surface-renderer — the ONE first-party renderer for the declarative plugin-surface vocabulary.
// It maps every closed node kind to a sealed `@orb/ui` primitive: a plugin
// composes house components as DATA and never touches the DOM, so tokens/theme/a11y/density come free and the
// vocabulary cannot express raw HTML, host chrome, a modal, or a write channel.
//
// This file owns the WALK — the caps re-validation, the depth guard, the container dispatch, and the surface
// state/draft/image-url plumbing. The individual node renderers live beside it: the browse-genre containers in
// `plugin-browse-nodes.tsx`, and every LEAF behind the one `SurfaceLeaf` door in `plugin-leaf-nodes.tsx` (which
// keeps the display/form partition module-private, so no render-only union type has to be exported).
//
// THE SPEC IS UNTRUSTED GUEST OUTPUT. Two independent defences run at THIS boundary, not just at registration:
//   1. THE CAPS, re-validated client-side (`pluginSurfaceSpecSchema` — 32 KiB / 256 nodes / depth 8 / every
//      string bounded). A spec that fails renders a safe fallback, never a hang/OOM; a depth guard in the walk
//      is the belt under the schema's suspenders.
//   2. THE IMAGE OWNER-SCOPE (the plugin-secrev gate). An `image` node's `assetId` is guest-supplied and only
//      FORMAT-validated (`ui.ts` defers CAS ownership to a server resolve). A guest can name ANY id, including a
//      VICTIM's private asset, so ids resolve through `assets.resolveBlobRefs` — the OWNER-SCOPED read
//      (`resolve-owned-asset-refs.ts`: `ownerId` in the WHERE, a foreign id simply absent), keyed by the
//      session owner = the installer (v1 viewer==installer). A foreign/unowned id yields no ref → the empty
//      placeholder, NEVER another user's blob. The #820 `bundleAsset` arm changes NONE of that: a bundle path
//      is a NAME resolved against this plugin's own install-time map (`plugin.listBundleAssets`, gated by the
//      owner-scoped row load) and the id it yields then rides the exact same owner-scoped resolve. A path the
//      plugin never shipped resolves to nothing and paints the same placeholder.
//
// Actions round-trip through `invokeUiAction`; `host.ui.setState` publishes state whose `pluginSurfaceStateChanged`
// bus poke (belt: the mutation's own invalidate) repaints this surface. Form field values are CLIENT-transient
// until an action submits the whole `values` bag.

import { blobUrl } from "@orb/contracts/assets";
import type { PluginButtonNode, PluginSurfaceAnchor, PluginSurfaceNode } from "@orb/contracts/plugin";
import { PLUGIN_ANCHOR_PRIMARY_ALLOWED, PLUGIN_SPEC_MAX_DEPTH, pluginSurfaceSpecSchema, resolvePluginPrimaryButton } from "@orb/contracts/plugin";
import type { AssetId, ChatId, PluginId } from "@orb/kit/ids";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useInvokeUiAction } from "../lib/plugin-mutations.ts";
import { collectDefaults, collectImageAssetIds, specNamesBundleAsset } from "../lib/plugin-surface-bindings.ts";
import { applyPluginUiOutcome } from "../lib/plugin-ui-outcome.ts";
import { MasterDetail, SurfaceSearchBar } from "./plugin-browse-nodes.tsx";
import { SurfaceLeaf } from "./plugin-leaf-nodes.tsx";

/** The transient render context threaded through the walk — read-only surface state (for `$state` bindings),
 *  the form draft + its setter, the action submitter, resolved OWNER-SCOPED image urls, and the in-flight flag. */
interface RenderCtx {
  readonly state: Record<string, unknown>;
  readonly values: Record<string, string>;
  readonly setValue: (name: string, value: string) => void;
  /** Submit `actionId` with the current draft, plus any EXTRA values the affordance carries (a grid tile's
   *  `tile` id — the round-trip has to say WHICH tile, and a tile is not a form field a person edits). */
  readonly submit: (actionId: string, extra?: Record<string, string>) => void;
  readonly submitting: boolean;
  /** COVER KEY → owner-scoped blob url. The key is whichever spelling the node carries — an `asset_…` id, or a
   *  `ui/assets/…` bundle path (#820), which the walk above aliases onto its resolved id's url. Absent = the
   *  installer does not own it, it is gone, or the plugin never shipped that path ⇒ placeholder. */
  readonly imageUrls: ReadonlyMap<string, string>;
  /** The ONE button this surface's anchor granted the house primary weight (#818), by NODE IDENTITY out of the
   *  validated tree — `null` when the anchor refuses a primary or the spec claims none. Every other button,
   *  including a second `primary`, renders neutral. Identity, not an id: a spec node has none. */
  readonly primaryButton: PluginButtonNode | null;
}

// %c DevTools console styles (not UI theme tokens — the `[plugin]` channel's own voice, the `[bus]` precedent).
const PLUGIN_PREFIX_STYLE = "color:#888;font-weight:bold";
const PLUGIN_WARN_STYLE = "color:#c60;font-weight:bold";

/** The console line for a `primary` button this anchor DEMOTED (#818), or `""` when nothing was refused.
 *  PURE and a plain string on purpose: it is the effect's ONLY dependency below, so the warning fires when the
 *  spec's claims actually change rather than on every repaint — no dependency the linter cannot see, and no
 *  array identity to re-derive. All of a surface's refusals ride ONE line: they are one authoring mistake. */
function primaryRefusalMessage(pluginId: PluginId, surfaceId: string, anchor: PluginSurfaceAnchor, refused: readonly PluginButtonNode[]): string {
  if (refused.length === 0) {
    return "";
  }
  const why = PLUGIN_ANCHOR_PRIMARY_ALLOWED[anchor]
    ? "that anchor already granted its one primary"
    : "that anchor keeps the one-primary clamp — only `page` and `dialog` grant one";
  const labels = refused.map((node) => `"${node.label}"`).join(", ");
  return `${pluginId}/${surfaceId} · anchor ${anchor} · ${labels} — ${why}; rendered at the neutral weight.`;
}

/** Write {@link primaryRefusalMessage}'s line, or nothing. Deliberately NOT `IS_DEV`-gated like the
 *  `[bus]`/`[trpc]` instruments: this is not a host self-diagnostic, it is the ONLY channel a hierarchy mistake
 *  in an INSTALLED plugin has — an author testing against a production build would otherwise see a silently
 *  flat CTA with no reason given. Not a toast either: nothing is broken FOR THE PERSON (the button works, it is
 *  only weighted), so it belongs in the authoring channel rather than in their attention. */
function warnPrimaryRefused(message: string): void {
  if (message !== "") {
    console.warn(`%c[plugin]%c primary refused%c  ${message}`, PLUGIN_PREFIX_STYLE, PLUGIN_WARN_STYLE, "");
  }
}

/** The TIER-C SINK — where a scripted surface's interactions go instead of the server.
 *  Absent (the Tier-S default) the renderer owns everything: it reads `getSurfaceState` for the `$state`
 *  bindings and submits actions through `invokeUiAction`. Present, the OWNER owns both: the tree came from a
 *  client guest that holds its own state, and an interaction is delivered INTO that guest with no network in
 *  the path — which is the entire latency claim §4.6 makes.
 *
 *  ONE renderer for both tiers, deliberately: the vocabulary, the caps, the a11y floor and the impersonation
 *  walls are identical, so a second renderer would be a second place for them to drift. What differs between
 *  the tiers is only WHERE an event goes, which is exactly the size of this seam. */
interface PluginSurfaceSink {
  /** Deliver a button/confirm action. Fire-and-forget — the RESULT is whatever tree the guest publishes next. */
  readonly submit: (actionId: string, values: Record<string, string>) => void;
  /** Deliver a field edit LIVE, as it is typed. This is the keystroke path: a Tier-S surface holds its draft
   *  client-side until an action submits it, but a scripted filter box has to see each character to filter. */
  readonly onFieldChange: (name: string, value: string) => void;
  /** The state the `$state` bindings resolve against — the guest's, not the server's. A scripted guest usually
   *  inlines its values in the tree it publishes and passes `{}` here; the binding path stays available so the
   *  SAME spec works at either tier. */
  readonly state: Record<string, unknown>;
}

/**
 * THE DRAFT'S IDENTITY: which FIELDS this spec has, in order — never what they currently hold (#1502).
 *
 * `values` is a name-keyed draft seeded ONCE at mount, and this component is not remounted when the spec
 * under a given `surfaceId` is replaced. So a surface that swapped its form kept the previous form's draft:
 * entries under names the new spec does not have (submitted back to the plugin as if the user had typed
 * them) and no entry at all for the new spec's fields, whose declared defaults never landed. Making that
 * string the mount KEY is the fix — the draft is thrown away exactly when it stops being about this form.
 *
 * VALUES ARE DELIBERATELY EXCLUDED from the identity, and that exclusion is load-bearing. A Tier-C guest
 * republishes its WHOLE tree on every keystroke with its values inlined (`sink.onFieldChange` → the guest's
 * next tree), so a value-sensitive key would remount the very input being typed into and drop the caret on
 * each character. The field NAMES are the form's identity; the values are its contents.
 */
function draftIdentityOf(spec: PluginSurfaceNode): string {
  const fields: Record<string, string> = {};
  collectDefaults(spec, fields);
  return JSON.stringify(Object.keys(fields));
}

/** The renderer entry: validate the spec (caps), then mount the form KEYED BY the spec's field set so a
 *  replaced spec cannot inherit the previous one's draft ({@link draftIdentityOf}). */
export function PluginSurfaceRenderer(props: PluginSurfaceRendererProps): ReactElement {
  const parsed = pluginSurfaceSpecSchema.safeParse(props.spec);
  if (!parsed.success) {
    return (
      <Text prose={true} role="alert" voice="gloss">
        This plugin's panel couldn't be displayed — its layout didn't pass validation.
      </Text>
    );
  }
  return <PluginSurfaceForm {...props} key={draftIdentityOf(parsed.data)} spec={parsed.data} />;
}

interface PluginSurfaceRendererProps {
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  readonly spec: PluginSurfaceNode;
  /** WHERE this surface is mounted (#818). Required, and each of the seven mount sites names its own: the
   *  anchor is what decides whether a `primary` button is honoured ({@link resolvePluginPrimaryButton}), and a
   *  defaulted anchor would silently hand the chat band's attention budget away. */
  readonly anchor: PluginSurfaceAnchor;
  /** The ROOM this surface is mounted in (row 777). Threaded into the state read and the action round-trip so a
   *  room-anchored surface sees its own room's publication and acts in the room a person is looking at. */
  readonly chatId?: ChatId;
  /** Tier C only — see {@link PluginSurfaceSink}. */
  readonly sink?: PluginSurfaceSink;
  /** The binding root to resolve `{ $state }` against, when the surface HAS one that is not the plugin's
   *  published state — the `tool-card` anchor (U3), whose root is the persisted `ToolCallRecord` of the call
   *  being rendered (`PluginToolCardState`). Omitted ⇒ the published `getSurfaceState` plane, which is the
   *  right root for every anchor whose surface is per-(plugin, surface) rather than per-CALL. */
  readonly state?: Record<string, unknown> | undefined;
}

/** The form half: owner-scoped image urls + surface state, the draft, the root node. Its `spec` is ALREADY
 *  VALIDATED (the entry above parses, and is also what keys this component's mount). */
function PluginSurfaceForm({ pluginId, surfaceId, spec, anchor, chatId, sink, state: boundState }: PluginSurfaceRendererProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const invoke = useInvokeUiAction({ trpc, invalidation });
  // No manual memoization — the React Compiler memoizes compiled files. The walk/the Map are pure functions
  // of their inputs, so the Compiler caches them across renders on its own.
  // The published-plane state read. It fires ONLY for a surface that has NEITHER its own binding root (a
  // tool-card, U3 — `boundState`) NOR a client-side guest (Tier C, U4 — `sink`): a scripted surface's state lives
  // in its guest and a card's lives in its call record, so for both the server read must not fire at all — not
  // merely be ignored. `enabled` disables it (keeping the Tier-C ZERO-NETWORK claim honest and a card query-free),
  // and `chatId` (row 777) scopes a room-anchored read. (The hook is unconditional; only `enabled` moves.)
  // It reads ABOVE the image sweep because the sweep now takes the state (#774 ARM C): a bound grid's covers
  // and a bound image's asset live in state, and ids the sweep never saw would never paint.
  const { data: publishedState } = useQuery({
    ...trpc.plugin.getSurfaceState.queryOptions({ pluginId, surfaceId, ...(chatId === undefined ? {} : { chatId }) }),
    enabled: sink === undefined && boundState === undefined,
  });
  const state = boundState ?? publishedState;
  // The SAME effective state the render ctx binds against — one derivation, so the sweep and the renderer can
  // never disagree about which state a binding resolves in.
  const effectiveState = sink === undefined ? (state ?? {}) : sink.state;
  // #820 — the plugin's own INSTALL-TIME `ui/assets/` map, read only when the spec actually names a bundle
  // path (a surface that ships no bundle art pays for no query). It is a NAME lookup and nothing more: the
  // ids it returns still ride the owner-scoped `resolveBlobRefs` below, so this adds no reach.
  const wantsBundleAssets = specNamesBundleAsset(spec);
  const { data: bundleAssetRows } = useQuery({ ...trpc.plugin.listBundleAssets.queryOptions({ pluginId }), enabled: wantsBundleAssets });
  const bundleAssets = new Map((bundleAssetRows ?? []).map((row) => [row.path, row.assetId] as const));
  const imageIds: AssetId[] = [];
  collectImageAssetIds(spec, effectiveState, bundleAssets, imageIds);
  const { data: refs } = useQuery({ ...trpc.assets.resolveBlobRefs.queryOptions({ assetIds: imageIds }), enabled: imageIds.length > 0 });
  // Keyed by BOTH spellings a node can name (#820): the resolved `asset_…` id, and — for every bundle path
  // that mapped to a resolved id — the path itself. The leaves look their cover up by whichever key their
  // node carries, so no renderer below this line has to know the bundle arm exists. A path whose id did not
  // resolve (not owned, reaped, or never shipped) simply has no entry, which is the placeholder.
  // `Map<string, string>` explicitly: the key space is COVER KEYS, not ids — inference would narrow it to
  // `AssetId` off the refs alone and then refuse the bundle-path aliases the loop below adds.
  const imageUrls = new Map<string, string>((refs ?? []).map((ref) => [ref.assetId, blobUrl(ref.hash)] as const));
  for (const [path, assetId] of bundleAssets) {
    const url = imageUrls.get(assetId);
    if (url !== undefined) {
      imageUrls.set(path, url);
    }
  }
  // #818 — the per-anchor PRIMARY arbitration, decided ONCE over the validated tree and threaded down by node
  // IDENTITY. It runs here, not in the button leaf, because the law is about the WHOLE surface at THIS anchor:
  // a leaf can only see itself, and "the first one wins" is not a fact a leaf holds.
  const arbitration = resolvePluginPrimaryButton(spec, anchor);
  const refusalMessage = primaryRefusalMessage(pluginId, surfaceId, anchor, arbitration.refused);
  // The refusal reaches the plugin's AUTHOR in an effect (never in the render body): a console write during
  // render fires on every repaint of a perfectly static defect. The message string is the whole dependency.
  useEffect(() => {
    warnPrimaryRefused(refusalMessage);
  }, [refusalMessage]);
  // Seeded ONCE — and the mount is KEYED by this spec's field set (`draftIdentityOf`), so "once" now
  // means once per FORM rather than once per surface id.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    collectDefaults(spec, out);
    return out;
  });

  const ctx: RenderCtx = {
    // Tier C binds against the GUEST's state (the server read did not even fire); Tier S binds against the
    // published row, with `{}` for "nothing published yet" so every binding falls back rather than throwing.
    state: effectiveState,
    values,
    setValue: (name, value) => {
      setValues((current) => ({ ...current, [name]: value }));
      // TIER C: the keystroke also goes INTO the guest, immediately. The local draft is still kept so the input
      // stays controlled and responsive even while the guest is mid-event — the guest's next published tree is
      // what actually changes what is displayed.
      sink?.onFieldChange(name, value);
    },
    // TIER C (U4) routes the action into the guest through the sink (zero-network); Tier S (U5) does the async
    // round-trip and applies the drained UI OUTCOME — the host-mediated toasts + at most one dialog-open the
    // guest asked for while it ran (§4.5a). `mutateAsync` (not `mutate`) is what surfaces that result; the
    // `catch` is not a swallow (the mutation's own `errorToast` already told the person) — it keeps a handled
    // rejection from surfacing as an unhandled one on this fire-and-forget path. `chatId` (row 777) scopes the
    // action to the room a person is looking at.
    submit: (actionId, extra) => {
      const merged = extra === undefined ? values : { ...values, ...extra };
      if (sink !== undefined) {
        sink.submit(actionId, merged);
        return;
      }
      // @orb-waive caught-failure-ownership(mutateAsync): the comment above explains — the
      // mutation's own errorToast already told the person; this catch only keeps a handled rejection from
      // surfacing as unhandled on this fire-and-forget path. Ends if that mutation drops its errorToast.
      void invoke
        .mutateAsync({ pluginId, surfaceId, actionId, values: merged, ...(chatId === undefined ? {} : { chatId }) })
        .then((outcome) => applyPluginUiOutcome(pluginId, outcome))
        .catch(() => undefined);
    },
    // A Tier-C action never has a pending network leg, so there is nothing to spin: `submitting` is false and
    // the guest's re-render IS the feedback.
    submitting: sink === undefined && invoke.isPending,
    imageUrls,
    primaryButton: arbitration.granted,
  };
  return <SurfaceNode ctx={ctx} depth={1} node={spec} />;
}

/** Map a node's children to SurfaceNode. */
function renderChildren(children: readonly PluginSurfaceNode[], depth: number, ctx: RenderCtx): ReactNode {
  return children.map((child, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a plugin spec node carries no id and the tree is static per render (re-validated, never reordered), so the index IS a stable key here.
    <SurfaceNode ctx={ctx} depth={depth + 1} key={index} node={child} />
  ));
}

/** One node → its sealed primitive. Containers recurse; every leaf delegates to `SurfaceLeaf`. The DEPTH GUARD
 *  is the belt under the schema's depth cap. */
function SurfaceNode({ node, depth, ctx }: { readonly node: PluginSurfaceNode; readonly depth: number; readonly ctx: RenderCtx }): ReactElement | null {
  if (depth > PLUGIN_SPEC_MAX_DEPTH) {
    return null;
  }
  // Containers vs leaves is a DISPATCH, not an exhaustive case-per-kind: each container guard narrows `node`,
  // and what remains flows to `SurfaceLeaf` (which owns the leaf partition). An if-chain, not a switch, so the
  // three container kinds carry no obligation to re-list the fourteen leaves the leaf module owns.
  if (node.kind === "stack") {
    return <Stack gap={node.gap ?? "block"}>{renderChildren(node.children, depth, ctx)}</Stack>;
  }
  if (node.kind === "row") {
    return <Row gap={node.gap ?? "field"}>{renderChildren(node.children, depth, ctx)}</Row>;
  }
  if (node.kind === "section") {
    return (
      <Stack gap="field">
        <Text voice="kicker">{node.kicker}</Text>
        {renderChildren(node.children, depth, ctx)}
      </Stack>
    );
  }
  // `masterDetail` and `searchBar` are the FOURTH and FIFTH containers (U5) — they recurse through fields that
  // are not called `children` (stage bodies, the filter tail). They dispatch HERE with the other containers,
  // never from a leaf renderer, for one reason: the depth guard above has to reach their children, and the
  // schema's own cap walk counts them through the same `pluginChildNodes` seam. The renderers themselves live
  // in `plugin-browse-nodes.tsx` and take the recursion as a callback, so this file stays the walk's one owner.
  if (node.kind === "masterDetail") {
    return (
      <MasterDetail
        depth={depth}
        imageUrls={ctx.imageUrls}
        node={node}
        renderNode={(child, childDepth): ReactNode => <SurfaceNode ctx={ctx} depth={childDepth} node={child} />}
        state={ctx.state}
      />
    );
  }
  if (node.kind === "searchBar") {
    return (
      <SurfaceSearchBar
        depth={depth}
        node={node}
        renderChildren={(children, childDepth): ReactNode => renderChildren(children, childDepth, ctx)}
        setValue={ctx.setValue}
        submit={ctx.submit}
        submitting={ctx.submitting}
        values={ctx.values}
      />
    );
  }
  return (
    <SurfaceLeaf
      imageUrls={ctx.imageUrls}
      node={node}
      primaryButton={ctx.primaryButton}
      setValue={ctx.setValue}
      state={ctx.state}
      submit={ctx.submit}
      submitting={ctx.submitting}
      values={ctx.values}
    />
  );
}
