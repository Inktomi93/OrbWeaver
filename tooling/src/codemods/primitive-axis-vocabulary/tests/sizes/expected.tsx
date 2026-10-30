import { Button } from "@orb/ui/button";
import { NumberField } from "@orb/ui/number-field";
import { Toggle } from "#primitives/toggle";

export const Sizes = () => (
  <>
    <Button variant="ghost" square={true} aria-label="Send" />
    <Button size="sm" square={true} variant="ghost" aria-label="Role" />
    <Button variant="outline" size="sm" wrap={true} onClick={pick}>
      A long model sentence
    </Button>
    <Button tone="destructive" wrap={true}>
      Delete everything in this folder
    </Button>
    <Button variant="ghost" square={true} aria-label="Old and old" />
    <Button size="sm">Kept</Button>
    <Button size="chip" variant="outline" shape="pill">
      Tag
    </Button>
    <Button size="glyph-lg" variant="ghost" aria-label="Glyph" />
  </>
);

export const Toggles = () => (
  <>
    <Toggle variant="outline" size="sm" value="a">
      A
    </Toggle>
    <Toggle aria-label="Group" ink="foreground" pressed={on} />
    <Toggle>Bold</Toggle>
    <Toggle tone="primary">Live</Toggle>
    <Toggle size="chip">Kept</Toggle>
  </>
);

export const Numbers = () => (
  <>
    <NumberField aria-label="Top p" layout="inline" value={p} />
    <NumberField aria-label="Count" />
  </>
);
