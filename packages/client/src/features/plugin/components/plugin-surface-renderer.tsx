// plugin-surface-renderer — the ONE first-party renderer for the declarative plugin-surface vocabulary
// (plugin-ui-plane #679 U1, §4.3). It maps every closed node kind to a sealed `@orb/ui` primitive: a plugin
// composes house components as DATA and never touches the DOM, so tokens/theme/a11y/density come free and the
// vocabulary cannot express raw HTML, host chrome, a modal, or a write channel.
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
//      placeholder, NEVER another user's blob.
//
// Actions round-trip through `invokeUiAction`; `host.ui.setState` publishes state whose `pluginSurfaceStateChanged`
// bus poke (belt: the mutation's own invalidate) repaints this surface. Form field values are CLIENT-transient
// until an action submits the whole `values` bag.

import { blobUrl } from "@orb/contracts/assets";
import type {
  PluginBadgeNode,
  PluginBoundString,
  PluginButtonNode,
  PluginConfirmButtonNode,
  PluginImageNode,
  PluginKeyValueNode,
  PluginListNode,
  PluginMarkdownNode,
  PluginMeterNode,
  PluginNodeKind,
  PluginNumberFieldNode,
  PluginSelectNode,
  PluginSliderNode,
  PluginSurfaceNode,
  PluginTextFieldNode,
  PluginTextNode,
  PluginToggleNode,
} from "@orb/contracts/plugin";
import { PLUGIN_SPEC_MAX_DEPTH, pluginSurfaceSpecSchema } from "@orb/contracts/plugin";
import type { AssetId, PluginId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { MessageMedia } from "@orb/ui/message-media";
import { Meter } from "@orb/ui/meter";
import { NumberField } from "@orb/ui/number-field";
import { Select } from "@orb/ui/select";
import { Slider } from "@orb/ui/slider";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useInvokeUiAction } from "../lib/plugin-mutations.ts";
import { collectDefaults, collectImageAssetIds, METER_DEFAULT_MAX, numFromValues, resolveNumber, resolveString } from "../lib/plugin-surface-bindings.ts";

/** The seven display leaves (no form state) and the seven form/action leaves — partition the non-container node
 *  union so each leaf renderer stays over a SMALL union (a new kind still fails `tsc`). Local to the renderer:
 *  these are rendering partitions, not a cross-boundary contract shape. */
type DisplayNode = PluginTextNode | PluginBadgeNode | PluginMeterNode | PluginKeyValueNode | PluginListNode | PluginImageNode | PluginMarkdownNode;
type FormNode =
  | PluginTextFieldNode
  | PluginNumberFieldNode
  | PluginToggleNode
  | PluginSelectNode
  | PluginSliderNode
  | PluginButtonNode
  | PluginConfirmButtonNode;

const FORM_KINDS: ReadonlySet<PluginNodeKind> = new Set<PluginNodeKind>(["textField", "numberField", "toggle", "select", "slider", "button", "confirmButton"]);
function isFormNode(node: DisplayNode | FormNode): node is FormNode {
  return FORM_KINDS.has(node.kind);
}

/** The transient render context threaded through the walk — read-only surface state (for `$state` bindings),
 *  the form draft + its setter, the action submitter, resolved OWNER-SCOPED image urls, and the in-flight flag. */
interface RenderCtx {
  readonly state: Record<string, unknown>;
  readonly values: Record<string, string>;
  readonly setValue: (name: string, value: string) => void;
  readonly submit: (actionId: string) => void;
  readonly submitting: boolean;
  /** assetId → owner-scoped blob url. Absent = the installer does not own it (or it is gone) ⇒ placeholder. */
  readonly imageUrls: ReadonlyMap<string, string>;
}

/** The house Text voice for a plugin `text`/section voice — `gloss`/`label` pass through; `body` is the default. */
function BoundText({
  value,
  voice,
  state,
}: {
  readonly value: PluginBoundString;
  readonly voice: "body" | "gloss" | "label" | undefined;
  readonly state: Record<string, unknown>;
}): ReactElement {
  const text = resolveString(value, state);
  if (voice === "gloss" || voice === "label") {
    return (
      <Text prose={true} voice={voice}>
        {text}
      </Text>
    );
  }
  return <Text prose={true}>{text}</Text>;
}

/** The renderer entry: validate the spec (caps), resolve owner-scoped image urls + surface state, hold the form
 *  draft, render the root node. */
export function PluginSurfaceRenderer({
  pluginId,
  surfaceId,
  spec,
}: {
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  readonly spec: PluginSurfaceNode;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const invoke = useInvokeUiAction({ trpc, invalidation });
  // No manual memoization — the React Compiler memoizes compiled files. `safeParse`/the walk/the Map are pure
  // functions of their inputs, so the Compiler caches them across renders on its own.
  const parsed = pluginSurfaceSpecSchema.safeParse(spec);
  const imageIds: AssetId[] = [];
  if (parsed.success) {
    collectImageAssetIds(parsed.data, imageIds);
  }
  const { data: refs } = useQuery({ ...trpc.assets.resolveBlobRefs.queryOptions({ assetIds: imageIds }), enabled: imageIds.length > 0 });
  const imageUrls = new Map((refs ?? []).map((ref) => [ref.assetId, blobUrl(ref.hash)] as const));
  const { data: state } = useQuery(trpc.plugin.getSurfaceState.queryOptions({ pluginId, surfaceId }));
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (parsed.success) {
      collectDefaults(parsed.data, out);
    }
    return out;
  });

  if (!parsed.success) {
    return (
      <Text prose={true} role="alert" voice="gloss">
        This plugin's panel couldn't be displayed — its layout didn't pass validation.
      </Text>
    );
  }

  const ctx: RenderCtx = {
    state: state ?? {},
    values,
    setValue: (name, value) => setValues((current) => ({ ...current, [name]: value })),
    submit: (actionId) => invoke.mutate({ pluginId, surfaceId, actionId, values }),
    submitting: invoke.isPending,
    imageUrls,
  };
  return <SurfaceNode ctx={ctx} depth={1} node={parsed.data} />;
}

/** Map a node's children to SurfaceNode. */
function renderChildren(children: readonly PluginSurfaceNode[], depth: number, ctx: RenderCtx): ReactNode {
  return children.map((child, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a plugin spec node carries no id and the tree is static per render (re-validated, never reordered), so the index IS a stable key here.
    <SurfaceNode ctx={ctx} depth={depth + 1} key={index} node={child} />
  ));
}

/** One node → its sealed primitive. Containers recurse; every leaf delegates to the display/form renderer. The
 *  DEPTH GUARD is the belt under the schema's depth cap. */
function SurfaceNode({ node, depth, ctx }: { readonly node: PluginSurfaceNode; readonly depth: number; readonly ctx: RenderCtx }): ReactElement | null {
  if (depth > PLUGIN_SPEC_MAX_DEPTH) {
    return null;
  }
  // Containers vs leaves is a DISPATCH, not an exhaustive case-per-kind: each container guard narrows `node`,
  // and what remains flows to the leaf renderers (each exhaustive over its own SMALL union). An if-chain, not a
  // switch, so the three container kinds carry no obligation to re-list the fourteen leaves the leaf switches own.
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
  return isFormNode(node) ? <FormLeaf ctx={ctx} node={node} /> : <DisplayLeaf ctx={ctx} node={node} />;
}

/** The seven DISPLAY leaves (no form state). An if-chain, not a switch: each guard narrows `node`, and the
 *  final `markdown` return doubles as the forward-compat fallback over an untrusted (post-validation) spec. */
function DisplayLeaf({ node, ctx }: { readonly node: DisplayNode; readonly ctx: RenderCtx }): ReactElement {
  if (node.kind === "text") {
    return <BoundText state={ctx.state} value={node.value} voice={node.voice} />;
  }
  if (node.kind === "badge") {
    return (
      <Badge intent={node.intent ?? "neutral"} size="sm" tone="soft">
        {resolveString(node.text, ctx.state)}
      </Badge>
    );
  }
  if (node.kind === "meter") {
    return (
      <Meter
        kind="linear"
        label={node.label ?? ""}
        max={node.max ?? METER_DEFAULT_MAX}
        showValue={node.label !== undefined}
        value={resolveNumber(node.value, ctx.state)}
      />
    );
  }
  if (node.kind === "keyValue") {
    return (
      <Stack gap="tight">
        {node.rows.map((kv) => (
          <Row align="baseline" gap="field" justify="between" key={kv.key}>
            <Text voice="label">{kv.key}</Text>
            <Text prose={true} voice="gloss">
              {resolveString(kv.value, ctx.state)}
            </Text>
          </Row>
        ))}
      </Stack>
    );
  }
  if (node.kind === "list") {
    return (
      <Stack gap="tight">
        {node.items.map((item, index) => (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: a list item is a bindable string with no id and the list is static per render — index is a stable key here.
            key={index}
            prose={true}
          >
            {resolveString(item, ctx.state)}
          </Text>
        ))}
      </Stack>
    );
  }
  if (node.kind === "image") {
    return <SurfaceImage node={node} url={ctx.imageUrls.get(node.assetId)} />;
  }
  // Untrusted plugin markdown — the sealed Streamdown renderer's `untrusted` tier (Tier-A allowlist + url gate),
  // the same posture model output takes; never `trusted`. Last in the chain, so it is also the safe fallback.
  return (
    <Markdown mode="static" trust="untrusted">
      {resolveString(node.value, ctx.state)}
    </Markdown>
  );
}

/** An `image` node — the src is ALWAYS an owner-scoped CAS blob url; a miss is the empty placeholder. */
function SurfaceImage({ node, url }: { readonly node: PluginImageNode; readonly url: string | undefined }): ReactElement {
  if (url === undefined) {
    // Owner-scope miss: the installer does not own this asset (or it is gone). NEVER another user's blob.
    return (
      <Stack align="center" className="rounded-base border border-border border-dashed p-block" justify="center">
        <Text voice="gloss">{node.alt ?? "Image unavailable"}</Text>
      </Stack>
    );
  }
  // Through the sealed house media primitive (asset-vs-external dispatch + broken-media fallback, D44) — the
  // src is an OWNER-SCOPED CAS asset url, the only source the vocabulary permits.
  return <MessageMedia alt={node.alt ?? ""} media="image" src={{ kind: "asset", url }} />;
}

/** The seven FORM/ACTION leaves. Values are client-transient until an action submits the whole bag. An if-chain,
 *  not a switch: each guard narrows `node`, and the final `confirmButton` return doubles as the safe fallback. */
function FormLeaf({ node, ctx }: { readonly node: FormNode; readonly ctx: RenderCtx }): ReactElement {
  if (node.kind === "textField") {
    return (
      <Field description={node.placeholder} label={node.label}>
        <Input onValueChange={(next: string): void => ctx.setValue(node.name, next)} placeholder={node.placeholder} value={ctx.values[node.name] ?? ""} />
      </Field>
    );
  }
  if (node.kind === "numberField") {
    return (
      <Field label={node.label}>
        <NumberField
          max={node.max}
          min={node.min}
          onValueChange={(next): void => ctx.setValue(node.name, next === null ? "" : String(next))}
          step={node.step}
          value={ctx.values[node.name] === undefined || ctx.values[node.name] === "" ? null : Number(ctx.values[node.name])}
        />
      </Field>
    );
  }
  if (node.kind === "toggle") {
    return (
      <Field label={node.label} orientation="horizontal">
        {/* aria-label carries the field label onto the control itself — Field renders the visible label, but
            the a11y rule wants the Switch to carry its OWN accessible name (same string, no double-voicing). */}
        <Switch aria-label={node.label} checked={ctx.values[node.name] === "true"} onCheckedChange={(next): void => ctx.setValue(node.name, String(next))} />
      </Field>
    );
  }
  if (node.kind === "select") {
    return (
      <Field label={node.label}>
        {/* aria-label mirrors the Field label onto the trigger — Base UI's Select.Label doesn't reach the
            trigger's aria-labelledby standalone, and the static a11y rule wants the control's own name. */}
        <Select
          aria-label={node.label}
          items={node.options.map((o) => ({ label: o.label, value: o.value }))}
          onValueChange={(next: string | null): void => ctx.setValue(node.name, next ?? "")}
          value={ctx.values[node.name] ?? ""}
        />
      </Field>
    );
  }
  if (node.kind === "slider") {
    return (
      <Slider
        label={node.label}
        max={node.max}
        min={node.min}
        onValueChange={(next): void => ctx.setValue(node.name, String(next))}
        step={node.step ?? 1}
        value={numFromValues(ctx.values, node.name, node.min)}
      />
    );
  }
  if (node.kind === "button") {
    return (
      <Button intent={node.variant === "outline" ? "outline" : "secondary"} loading={ctx.submitting} onClick={(): void => ctx.submit(node.actionId)} size="sm">
        {node.label}
      </Button>
    );
  }
  // confirmButton — last in the chain, so it is also the safe fallback over an untrusted (post-validation) spec.
  return (
    <ConfirmDialog
      confirmLabel={node.label}
      description={node.confirmBody ?? ""}
      onConfirm={(): void => ctx.submit(node.actionId)}
      title={node.confirmTitle}
      trigger={
        <Button intent="destructive" loading={ctx.submitting} size="sm">
          {node.label}
        </Button>
      }
    />
  );
}
