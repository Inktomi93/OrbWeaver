import { CtIsolation } from "@orb/testkit/browser";
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@orb/ui/accordion";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { BUTTON_SIZE_OVERFLOW } from "@orb/ui/button/size-hit-area";
import { Checkbox } from "@orb/ui/checkbox";
import { Icon, Plus } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { NumberField } from "@orb/ui/number-field";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Select } from "@orb/ui/select";
import { Slider } from "@orb/ui/slider";
import { Switch } from "@orb/ui/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Textarea } from "@orb/ui/textarea";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";

const BUTTON_SIZES = Object.keys(BUTTON_SIZE_OVERFLOW) as (keyof typeof BUTTON_SIZE_OVERFLOW)[];

/** A glyph-sized button holds an icon, a `media` button holds the portrait that owns its floor, the rest hold a label. */
function buttonContent(size: keyof typeof BUTTON_SIZE_OVERFLOW): ReactElement {
  if (size.startsWith("icon") || size.startsWith("glyph")) {
    return <Icon icon={Plus} size="xs" />;
  }
  if (size === "media") {
    return <Avatar size="hero">AB</Avatar>;
  }
  return <>Edit title</>;
}

/** Every interactive `@orb/ui` primitive, one of each Button size, spaced so a neighbour never answers another control's hit test. */
export function InteractivePrimitivesStory(): ReactElement {
  return (
    <CtIsolation subject="Interactive primitives" isolates="isolates each primitive from feature layout so its own touch target is measured">
      <div style={{ display: "flex", flexDirection: "column", gap: 48, padding: 48, alignItems: "flex-start" }}>
        {BUTTON_SIZES.map((size) => (
          <Button aria-label={`Size ${size}`} key={size} size={size}>
            {buttonContent(size)}
          </Button>
        ))}
        <Toggle>Bold</Toggle>
        <ToggleGroup aria-label="Alignment" defaultValue={["left"]}>
          <Toggle value="left">Left</Toggle>
          <Toggle value="right">Right</Toggle>
        </ToggleGroup>
        <Checkbox aria-label="Agree" />
        <Switch aria-label="Enabled" />
        <RadioGroup aria-label="Choice" defaultValue="a">
          <RadioGroupItem value="a">Option A</RadioGroupItem>
          <RadioGroupItem value="b">Option B</RadioGroupItem>
        </RadioGroup>
        <Slider defaultValue={2} max={5} thumbLabels={["Level"]} />
        <Select aria-label="Pick one" defaultValue="a" items={[{ value: "a", label: "A" }]} />
        <NumberField aria-label="Count" defaultValue={3} />
        <Input aria-label="Plain text" />
        <Textarea aria-label="Long text" />
        <Tabs defaultValue="one">
          <TabsList>
            <TabsTab value="one">One</TabsTab>
            <TabsTab value="two">Two</TabsTab>
          </TabsList>
          <TabsPanel value="one">First</TabsPanel>
          <TabsPanel value="two">Second</TabsPanel>
        </Tabs>
        <Accordion>
          <AccordionItem value="a">
            <AccordionHeader>
              <AccordionTrigger>Section</AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel>Body</AccordionPanel>
          </AccordionItem>
        </Accordion>
      </div>
    </CtIsolation>
  );
}

/** A control a finger cannot reliably hit: the planted defect the touch-floor probe must report. */
export function UndersizedTargetStory(): ReactElement {
  return (
    <CtIsolation subject="Undersized touch target" isolates="plants a 16px control so the touch-floor probe is proven to fail">
      <div style={{ padding: 48 }}>
        <button aria-label="Tiny" style={{ width: 16, height: 16 }} type="button" />
      </div>
    </CtIsolation>
  );
}
