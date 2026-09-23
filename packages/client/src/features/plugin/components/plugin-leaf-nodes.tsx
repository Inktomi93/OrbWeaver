// The LEAF node renderers — the display leaves and the form/action leaves —
// split out of `plugin-surface-renderer.tsx`, which owns the walk, the caps and the container dispatch.
//
// THE SPLIT FOLLOWS `plugin-browse-nodes.tsx`: the one exported entry `SurfaceLeaf` takes the CONCRETE values a
// leaf needs (surface state, the resolved owner-scoped image urls, the form draft + its setter, the action
// submitter, the in-flight flag) rather than the renderer's own `RenderCtx` object. That keeps the renderer the
// single owner of the walk, gives this module NO import back into it (so there is no cycle to unpick), and keeps
// `RenderCtx` private to the renderer.
//
// The WHOLE leaf concern lives HERE and behind one door: the display/form partition, the `isFormNode` guard, and
// both leaf families are module-private, so each leaf renderer stays exhaustive over its own SMALL union (a new
// node kind still fails `tsc` in the switch that owns it) without the union alias ever being exported — which
// `no-inline-types` forbids for a feature module, and which is why the renderer delegates every leaf to
// `SurfaceLeaf` instead of dispatching the two families itself. Exporting only a component also satisfies the
// react-refresh `useComponentExportOnlyModules` rule (a guard export would break it).

import type {
  PluginBadgeNode,
  PluginBoundString,
  PluginButtonNode,
  PluginConfirmButtonNode,
  PluginGridNode,
  PluginIconNode,
  PluginImageNode,
  PluginKeyValueNode,
  PluginListNode,
  PluginMarkdownNode,
  PluginMeterNode,
  PluginNodeKind,
  PluginNumberFieldNode,
  PluginSelectNode,
  PluginSliderNode,
  PluginTabsNode,
  PluginTextFieldNode,
  PluginTextNode,
  PluginToggleNode,
} from "@orb/contracts/plugin";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Icon } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { MessageMedia } from "@orb/ui/message-media";
import { Meter } from "@orb/ui/meter";
import { NumberField } from "@orb/ui/number-field";
import { Slider } from "@orb/ui/slider";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { ConfirmDialog } from "#components";
import { PLUGIN_ICON_GLYPHS } from "../lib/plugin-icon-glyphs.ts";
import { imageNodeCoverKey, keyValueRows, METER_DEFAULT_MAX, numFromValues, resolveNumber, resolveString } from "../lib/plugin-surface-bindings.ts";
import { SurfaceGrid } from "./plugin-browse-nodes.tsx";
import { BoundSelect, TabsStrip } from "./plugin-option-controls.tsx";

/** The display leaves (no form state) and the form/action leaves — partition the non-container node union so
 *  each leaf renderer stays over a SMALL union (a new kind still fails `tsc`). Local to this module: these are
 *  rendering partitions, not a cross-boundary contract shape, and are never exported (the walk dispatches through
 *  `isFormNode`, never by naming a union).
 *
 *  `grid` is a DISPLAY leaf even though a tile can carry an `actionId`: it holds no draft state of its own — a
 *  tile click submits the surface's current `values` bag plus the tile's id, exactly as a `button` does. */
type DisplayNode =
  | PluginTextNode
  | PluginBadgeNode
  | PluginMeterNode
  | PluginKeyValueNode
  | PluginListNode
  | PluginImageNode
  | PluginMarkdownNode
  | PluginGridNode
  | PluginIconNode;
type FormNode =
  | PluginTextFieldNode
  | PluginNumberFieldNode
  | PluginToggleNode
  | PluginSelectNode
  | PluginSliderNode
  | PluginTabsNode
  | PluginButtonNode
  | PluginConfirmButtonNode;

const FORM_KINDS: ReadonlySet<PluginNodeKind> = new Set<PluginNodeKind>([
  "textField",
  "numberField",
  "toggle",
  "select",
  "slider",
  "tabs",
  "button",
  "confirmButton",
]);

/** Is this leaf a FORM/ACTION leaf (draft state) rather than a DISPLAY leaf? Module-private: the walk delegates
 *  every leaf to `SurfaceLeaf`, which uses this to route to the right family without either union being named
 *  outside this file. */
function isFormNode(node: DisplayNode | FormNode): node is FormNode {
  return FORM_KINDS.has(node.kind);
}

/** Submit `actionId` with the current draft, plus any EXTRA values the affordance carries (a grid tile's `tile`
 *  id). Mirrors `RenderCtx.submit` — passed concretely so this module never imports the renderer's context. */
type SubmitAction = (actionId: string, extra?: Record<string, string>) => void;

/** The ONE exported leaf door — the renderer's walk delegates every non-container node here, so the display/form
 *  partition and both leaf families stay module-private. Props are the flattened `RenderCtx` fields a leaf reads
 *  (concrete, never the context object), threaded on to the family that owns each leaf kind. */
export function SurfaceLeaf({
  node,
  state,
  values,
  setValue,
  submit,
  submitting,
  imageUrls,
  primaryButton,
}: {
  readonly node: DisplayNode | FormNode;
  readonly state: Record<string, unknown>;
  readonly values: Record<string, string>;
  readonly setValue: (name: string, value: string) => void;
  readonly submit: SubmitAction;
  readonly submitting: boolean;
  readonly imageUrls: ReadonlyMap<string, string>;
  /** The ONE button node the surface's anchor granted the primary weight (#818), or `null`. The walk decided it
   *  over the WHOLE tree, so a leaf only has to ask "am I that node?" — see the `button` branch below. */
  readonly primaryButton: PluginButtonNode | null;
}): ReactElement {
  return isFormNode(node) ? (
    // `state` reaches the form family too (hub v1.3): a bound select's OPTION LIST lives in published
    // state even though its picked value stays in the client draft.
    <FormLeaf node={node} primaryButton={primaryButton} setValue={setValue} state={state} submit={submit} submitting={submitting} values={values} />
  ) : (
    <DisplayLeaf imageUrls={imageUrls} node={node} state={state} submit={submit} />
  );
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

/** The seven DISPLAY leaves (no form state). An if-chain, not a switch: each guard narrows `node`, and the
 *  final `markdown` return doubles as the forward-compat fallback over an untrusted (post-validation) spec. */
function DisplayLeaf({
  node,
  state,
  imageUrls,
  submit,
}: {
  readonly node: DisplayNode;
  readonly state: Record<string, unknown>;
  readonly imageUrls: ReadonlyMap<string, string>;
  readonly submit: SubmitAction;
}): ReactElement {
  if (node.kind === "text") {
    return <BoundText state={state} value={node.value} voice={node.voice} />;
  }
  if (node.kind === "badge") {
    return (
      <Badge intent={node.intent ?? "neutral"} size="sm" tone="soft">
        {resolveString(node.text, state)}
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
        value={resolveNumber(node.value, state)}
      />
    );
  }
  if (node.kind === "keyValue") {
    // BOTH ARMS collapse through `keyValueRows` (hub v1.3): declared rows verbatim, or the `rowsFrom`
    // binding resolved (validated + clamped) against published state. Arm-blind below.
    return (
      <Stack gap="tight">
        {keyValueRows(node, state).map((kv) => (
          <Row align="baseline" gap="field" justify="between" key={kv.key}>
            <Text voice="label">{kv.key}</Text>
            <Text prose={true} voice="gloss">
              {resolveString(kv.value, state)}
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
            {resolveString(item, state)}
          </Text>
        ))}
      </Stack>
    );
  }
  if (node.kind === "image") {
    // ALL THREE ARMS collapse through `imageNodeCoverKey` (#774 ARM C / #820): the declared `assetId`, the
    // `assetFrom` binding format-gated against state, or the `bundleAsset` zip path. A bound value that is not
    // a well-formed asset id, a bundle path this plugin never shipped, or an id the installer does not OWN
    // (the map only ever holds owner-scoped resolutions) is a `url` miss and paints the placeholder, never a
    // foreign blob.
    const coverKey = imageNodeCoverKey(node, state);
    return <SurfaceImage node={node} url={coverKey === undefined ? undefined : imageUrls.get(coverKey)} />;
  }
  if (node.kind === "grid") {
    return <SurfaceGrid imageUrls={imageUrls} node={node} state={state} submit={submit} />;
  }
  if (node.kind === "icon") {
    // The sealed sizing wrapper, glyph resolved through the ONE total name→component map. `label` ABSENT is
    // the house default and the honest one: a glyph beside text is decoration (`aria-hidden`), and a plugin
    // that names a label is claiming the glyph is the only thing saying this — so it gets a named node.
    // `label` is spread conditionally, never passed as `undefined`: `IconProps.label` is `string?` and the
    // repo runs `exactOptionalPropertyTypes`, so an explicit undefined is a type error — and the ABSENT
    // prop is what makes the glyph `aria-hidden`.
    return <Icon icon={PLUGIN_ICON_GLYPHS[node.name]} size="sm" {...(node.label === undefined ? {} : { label: node.label })} />;
  }
  // Untrusted plugin markdown — the sealed Streamdown renderer's `untrusted` tier (Tier-A allowlist + url gate),
  // the same posture model output takes; never `trusted`. Last in the chain, so it is also the safe fallback.
  return (
    <Markdown mode="static" trust="untrusted">
      {resolveString(node.value, state)}
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

/** The house `Button` intent for one plugin `button` leaf (#818). The primary weight is granted by NODE
 *  IDENTITY — the walk arbitrated it over the whole surface at its anchor — so a `variant: "primary"` this leaf
 *  was NOT granted falls through to `secondary`, exactly like a `neutral` one. Reading `node.variant` for the
 *  primary arm here is the bug this function exists to make unwritable: it would give every claimant the weight. */
function buttonIntent(node: PluginButtonNode, primaryButton: PluginButtonNode | null): "primary" | "outline" | "secondary" {
  if (node === primaryButton) {
    return "primary";
  }
  return node.variant === "outline" ? "outline" : "secondary";
}

/** The FORM/ACTION leaves. Values are client-transient until an action submits the whole bag. An if-chain,
 *  not a switch: each guard narrows `node`, and the final `confirmButton` return doubles as the safe fallback. */
function FormLeaf({
  node,
  values,
  setValue,
  submit,
  submitting,
  state,
  primaryButton,
}: {
  readonly node: FormNode;
  readonly values: Record<string, string>;
  readonly setValue: (name: string, value: string) => void;
  readonly submit: SubmitAction;
  readonly submitting: boolean;
  readonly state: Record<string, unknown>;
  readonly primaryButton: PluginButtonNode | null;
}): ReactElement {
  if (node.kind === "textField") {
    return (
      <Field description={node.placeholder} label={node.label}>
        <Input onValueChange={(next: string): void => setValue(node.name, next)} placeholder={node.placeholder} value={values[node.name] ?? ""} />
      </Field>
    );
  }
  if (node.kind === "numberField") {
    return (
      <Field label={node.label}>
        <NumberField
          max={node.max}
          min={node.min}
          onValueChange={(next): void => setValue(node.name, next === null ? "" : String(next))}
          step={node.step}
          value={values[node.name] === undefined || values[node.name] === "" ? null : Number(values[node.name])}
        />
      </Field>
    );
  }
  if (node.kind === "toggle") {
    return (
      <Field label={node.label} orientation="horizontal">
        <Switch
          checked={values[node.name] === "true"}
          onCheckedChange={(next): void => {
            setValue(node.name, String(next));
            // A LIVE toggle (hub v1.3): the flip IS the act — fire its action with the fresh value riding
            // as `extra` (the select's v1.2 mechanism; the async React state write cannot race it).
            if (node.actionId !== undefined) {
              submit(node.actionId, { [node.name]: String(next) });
            }
          }}
        />
      </Field>
    );
  }
  if (node.kind === "select") {
    return <BoundSelect node={node} setValue={setValue} state={state} submit={submit} values={values} />;
  }
  if (node.kind === "tabs") {
    return <TabsStrip node={node} setValue={setValue} state={state} submit={submit} values={values} />;
  }
  if (node.kind === "slider") {
    return (
      <Slider
        label={node.label}
        max={node.max}
        min={node.min}
        onValueChange={(next): void => setValue(node.name, String(next))}
        step={node.step ?? 1}
        value={numFromValues(values, node.name, node.min)}
      />
    );
  }
  if (node.kind === "button") {
    // #818 — the PRIMARY weight is granted by IDENTITY, never by reading `node.variant` here. A leaf asking
    // "is my variant primary?" would give every claimant the weight; the walk already picked the one the
    // anchor admits, so a second `primary` falls through to `secondary` exactly like a `neutral` one and the
    // renderer has already told the plugin's author why (`warnPrimaryRefused`).
    return (
      <Button intent={buttonIntent(node, primaryButton)} loading={submitting} onClick={(): void => submit(node.actionId)} size="sm">
        {node.label}
      </Button>
    );
  }
  // confirmButton — last in the chain, so it is also the safe fallback over an untrusted (post-validation) spec.
  return (
    <ConfirmDialog
      confirmLabel={node.label}
      description={node.confirmBody ?? ""}
      onConfirm={(): void => submit(node.actionId)}
      title={node.confirmTitle}
      trigger={
        <Button intent="destructive" loading={submitting} size="sm">
          {node.label}
        </Button>
      }
    />
  );
}
