import { CtIsolation } from "@orb/testkit/browser";
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@orb/ui/accordion";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { BUTTON_BOX_OVERFLOW } from "@orb/ui/button/box-hit-area";
import { Checkbox } from "@orb/ui/checkbox";
import { GlyphButton } from "@orb/ui/glyph-button";
import { Icon, Plus } from "@orb/ui/icons";
import { InlineAction } from "@orb/ui/inline-action";
import { Input } from "@orb/ui/input";
import { CONTROL_SIZES } from "@orb/ui/lib";
import { NumberField } from "@orb/ui/number-field";
import { PictureButton } from "@orb/ui/picture-button";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Select } from "@orb/ui/select";
import { Slider } from "@orb/ui/slider";
import { Switch } from "@orb/ui/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Textarea } from "@orb/ui/textarea";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";

const steps = <Component extends keyof typeof BUTTON_BOX_OVERFLOW>(component: Component): (keyof (typeof BUTTON_BOX_OVERFLOW)[Component])[] =>
  Object.keys(BUTTON_BOX_OVERFLOW[component]) as (keyof (typeof BUTTON_BOX_OVERFLOW)[Component])[];

/** Every interactive `@orb/ui` primitive, one of each button-family box, spaced so a neighbour never answers another control's hit test. */
export function InteractivePrimitivesStory(): ReactElement {
  return (
    <CtIsolation subject="Interactive primitives" isolates="isolates each primitive from feature layout so its own touch target is measured">
      <div style={{ display: "flex", flexDirection: "column", gap: 48, padding: 48, alignItems: "flex-start" }}>
        {steps("button").map((size) => (
          <Button key={size} size={size}>
            {`Size ${size}`}
          </Button>
        ))}
        {steps("glyphButton").map((glyph) => (
          <GlyphButton aria-label={`Glyph ${glyph}`} glyph={glyph} key={glyph}>
            <Icon icon={Plus} size="xs" />
          </GlyphButton>
        ))}
        {steps("inlineAction").map((step) => (
          <InlineAction key={step} step={step}>
            {`Inline ${step}`}
          </InlineAction>
        ))}
        {/* The portrait owns the picture button's floor. */}
        <PictureButton aria-label="Picture">
          <Avatar size="hero">AB</Avatar>
        </PictureButton>
        {CONTROL_SIZES.map((size) => (
          <Button aria-label={`Square ${size}`} key={`square-${size}`} size={size} square={true} variant="ghost">
            <Icon icon={Plus} size="xs" />
          </Button>
        ))}
        {CONTROL_SIZES.map((size) => (
          <Button key={`wrap-${size}`} size={size} variant="outline" wrap={true}>
            {`Wrap ${size}`}
          </Button>
        ))}
        {CONTROL_SIZES.map((size) => (
          <Toggle key={`toggle-${size}`} size={size} variant="outline">
            {`Toggle ${size}`}
          </Toggle>
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
        {CONTROL_SIZES.map((size) => (
          <NumberField aria-label={`Count ${size}`} defaultValue={3} key={`number-${size}`} size={size} />
        ))}
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
