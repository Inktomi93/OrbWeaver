import { Button } from "@orb/ui/button";
import { NumberField } from "@orb/ui/number-field";
import { Toggle } from "#primitives/toggle";

export const Sizes = () => (
  <>
    <Button variant="ghost" size="icon" aria-label="Send" />
    <Button size="icon-sm" variant="ghost" aria-label="Role" />
    <Button variant="outline" size="wrap" onClick={pick}>
      A long model sentence
    </Button>
    <Button tone="destructive" size="wrap-md">
      Delete everything in this folder
    </Button>
    <Button intent="ghost" size="icon" aria-label="Old and old" />
    <Button size="sm">Kept</Button>
    <Button size="chip" variant="outline" shape="pill">
      Tag
    </Button>
    <Button size="glyph-lg" variant="ghost" aria-label="Glyph" />
  </>
);

export const Toggles = () => (
  <>
    <Toggle intent="outline" size="sm" value="a">
      A
    </Toggle>
    <Toggle aria-label="Group" intent="command" pressed={on} />
    <Toggle intent="neutral">Bold</Toggle>
    <Toggle intent="primary">Live</Toggle>
    <Toggle size="chip">Kept</Toggle>
  </>
);

export const Numbers = () => (
  <>
    <NumberField aria-label="Top p" size="inline" value={p} />
    <NumberField aria-label="Count" />
  </>
);
