// The OPTION-GRAMMAR controls — `select` (a menu) and `tabs` (a one-of-N strip, #799). ONE grammar in two
// presentations: exactly one of `options`/`optionsFrom`, a `value`, and a LIVE `actionId` whose pick IS the
// act. They live beside `plugin-leaf-nodes.tsx` rather than inside it for the reason the whole feature splits
// this way — each takes the CONCRETE values it needs, never the renderer's context object, so this module has
// no import back into the walk and no union type has to leave a component module (`no-inline-types`).
//
// The two are HERE TOGETHER on purpose. Their handlers share one non-obvious rule that a reader must see in
// one place: the fresh pick rides the round-trip as an EXTRA value, because the React state write beside it is
// async and the submit must not read the stale draft bag.

import type { PluginSelectNode, PluginTabsNode } from "@orb/contracts/plugin";
import { Field } from "@orb/ui/field";
import { Select } from "@orb/ui/select";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { selectOptions, tabOptions } from "../lib/plugin-surface-bindings.ts";

/** Submit `actionId` with the current draft plus the fresh pick — the leaf module's own `SubmitAction`,
 *  restated here rather than imported so this module keeps its zero-import-back-into-the-walk property. */
type SubmitAction = (actionId: string, extra?: Record<string, string>) => void;

/** The MENU half of the option grammar (`select`) — extracted beside {@link TabsStrip} for the same reason
 *  and at the same time: the two nodes are one grammar in two presentations, and each carries a live-pick
 *  handler whose refusals belong where they are decided rather than buried in the leaf if-chain. */
export function BoundSelect({
  node,
  values,
  setValue,
  submit,
  state,
}: {
  readonly node: PluginSelectNode;
  readonly values: Record<string, string>;
  readonly setValue: (name: string, value: string) => void;
  readonly submit: SubmitAction;
  readonly state: Record<string, unknown>;
}): ReactElement {
  return (
    <Field label={node.label}>
      {/* aria-label mirrors the Field label onto the trigger — Base UI's Select.Label doesn't reach the
            trigger's aria-labelledby standalone, and the static a11y rule wants the control's own name. */}
      <Select
        aria-label={node.label}
        items={selectOptions(node, state).map((o) => ({ label: o.label, value: o.value }))}
        onValueChange={(next: string | null): void => {
          setValue(node.name, next ?? "");
          // A LIVE select (hub v1.2): the pick IS the act — fire its action with the fresh value riding
          // as `extra` (the React state write above is async; the submit must not read the stale bag).
          if (node.actionId !== undefined) {
            submit(node.actionId, { [node.name]: next ?? "" });
          }
        }}
        value={values[node.name] ?? ""}
      />
    </Field>
  );
}

/** THE ONE-OF-N STRIP (#799) — its own component so {@link FormLeaf}'s if-chain stays under the house
 *  cognitive-complexity ceiling (the `BoundText` precedent one family over), and so the pick handler's two
 *  refusals read where they are decided rather than buried mid-chain. */
export function TabsStrip({
  node,
  values,
  setValue,
  submit,
  state,
}: {
  readonly node: PluginTabsNode;
  readonly values: Record<string, string>;
  readonly setValue: (name: string, value: string) => void;
  readonly submit: SubmitAction;
  readonly state: Record<string, unknown>;
}): ReactElement {
  // THE ONE-OF-N STRIP (#799) — the house segmented control (`ToggleGroup`/`Toggle` on their `radio`
  // arm), never house `Tabs`: this node owns no panels (what a pick changes is whatever the plugin
  // republishes), and a `tablist` whose tabs point at no `tabpanel` is dangling ARIA. The radiogroup is
  // the primitive that means exactly "pick one of these".
  const picked = values[node.name] ?? "";
  return (
    <Field label={node.label}>
      {/* aria-label mirrors the Field label onto the GROUP so the radiogroup carries its OWN accessible
            name — the same reason the Select and Switch arms above carry one. */}
      <ToggleGroup
        aria-label={node.label}
        onValueChange={(groupValue): void => {
          const next = groupValue[0];
          // A one-of-N strip has no "release": clicking the ACTIVE segment yields an empty array, and
          // honouring that would clear the page's own axis on a second click. The pick stands.
          if (typeof next !== "string") {
            return;
          }
          setValue(node.name, next);
          // The pick IS the act (the live select's v1.2 mechanism) — the fresh value rides as `extra`
          // because the React state write above is async and the submit must not read the stale bag.
          if (node.actionId !== undefined) {
            submit(node.actionId, { [node.name]: next });
          }
        }}
        semantics="radio"
        value={[picked]}
      >
        {tabOptions(node, state).map((option) => (
          <Toggle checked={option.value === picked} key={option.value} semantics="radio" value={option.value}>
            {option.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </Field>
  );
}
