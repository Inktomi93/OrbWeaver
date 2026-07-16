// Story wrappers for select CT (CT mounts from a non-test module).
import { Select } from "@orb/ui/select";
import type { ReactElement } from "react";

const ITEMS = [
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
  { label: "Gamma", value: "gamma" },
];

/**
 * `renderValue` is a children-render-fn forwarded to Base UI `Select.Value` — it must be defined in
 * this browser-bundled fixture (not inline in the `.ct.tsx`): Base UI calls it synchronously during
 * render to produce the trigger's displayed node, and a Node-side test closure proxied across the CT
 * boundary cannot return synchronously (the same class of constraint as the autocomplete `filter`
 * story).
 */
export function RenderValueStory(): ReactElement {
  return <Select defaultValue="beta" items={ITEMS} renderValue={(value): string => `Selected: ${String(value)}`} />;
}
