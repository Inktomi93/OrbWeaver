import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Circle, Icon } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack, Surface } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

const TONES = ["info", "accolade", "speaker", "dialogue", "narration"] as const;
const PROBE_INKS = {
  info: "--color-info",
  accolade: "--color-accolade",
  speaker: "--color-speaker",
  dialogue: "--color-dialogue",
  narration: "--color-narration",
} as const;

/** Each meaning tone beside a probe painted straight from its token, so the test compares like with like. */
export function ToneStory(): ReactElement {
  return (
    <CtIsolation subject="Text and Icon meaning tones" isolates="The tone arms against their colour tokens, without application state">
      {TONES.map((tone) => (
        <Row key={tone} gap="field" data-tone-case={tone}>
          <Text tone={tone}>{tone} text</Text>
          <Icon icon={Circle} tone={tone} label={`${tone} icon`} />
          <span data-probe={tone} style={{ color: `var(${PROBE_INKS[tone]})` }}>
            probe
          </span>
        </Row>
      ))}
      <Icon icon={Circle} shadow={true} label="shadowed icon" />
      <Icon icon={Circle} label="plain icon" />
    </CtIsolation>
  );
}

/** The Text modifiers and the code voice, each beside a probe for the value it should resolve to. */
export function TextModifierStory(): ReactElement {
  return (
    <CtIsolation subject="Text strike, numeric and the code voice" isolates="The modifier arms on one Text each">
      <Text strike={true}>struck</Text>
      <Text numeric={true}>1234</Text>
      <Text>plain</Text>
      <Text voice="code">id_01hx</Text>
      <span data-probe="code" style={{ fontFamily: "var(--font-mono)", color: "var(--color-foreground)" }}>
        probe
      </span>
    </CtIsolation>
  );
}

/** The link intent beside a probe in the primary ink. */
export function LinkStory(): ReactElement {
  return (
    <CtIsolation subject="Button link intent" isolates="The link arm at rest">
      <Button intent="link" size="inline">
        Show more
      </Button>
      <span data-probe="primary" style={{ color: "var(--color-primary)", backgroundColor: "transparent" }}>
        probe
      </span>
    </CtIsolation>
  );
}

/** Every pointer-class visibility arm, on each primitive that carries it. */
export function PointerVisibilityStory(): ReactElement {
  return (
    <CtIsolation subject="hiddenAt and srOnlyAt" isolates="hiddenAt on Text, Row, Stack and Button; srOnlyAt on Text, Row and Stack">
      <Text hiddenAt="coarse">text hidden at coarse</Text>
      <Text hiddenAt="fine">text hidden at fine</Text>
      <Text srOnlyAt="coarse">text announced only at coarse</Text>
      <Row hiddenAt="coarse" data-case="row-hidden-coarse">
        row
      </Row>
      <Row srOnlyAt="coarse" data-case="row-sr-coarse">
        row label
      </Row>
      <Stack hiddenAt="fine" data-case="stack-hidden-fine">
        stack
      </Stack>
      <Stack srOnlyAt="coarse" data-case="stack-sr-coarse">
        stack label
      </Stack>
      <Button hiddenAt="coarse">button hidden at coarse</Button>
    </CtIsolation>
  );
}

/** The coarse touch floors, each on a box that is under the floor without it. */
export function TouchFloorStory(): ReactElement {
  return (
    <CtIsolation subject="touchFloor" isolates="The coarse-pointer floor arms on Row, Stack, Button, Badge and CollapsibleTrigger">
      <Row touchFloor="block" data-case="row-block">
        <Text as="span">value</Text>
      </Row>
      <Row gap="field" touchFloor="gap" data-case="row-gap">
        <span>a</span>
        <span>b</span>
      </Row>
      <Stack touchFloor="block" data-case="stack-block">
        <Text as="span">value</Text>
      </Stack>
      <Button aria-label="glyph chip" intent="secondary" size="sm" touchFloor="inline">
        <Icon icon={Circle} size="xs" />
      </Button>
      <Badge size="compact" touchFloor="block">
        chip
      </Badge>
      <Collapsible>
        <CollapsibleTrigger size="text" touchFloor="block">
          Tool calls
        </CollapsibleTrigger>
      </Collapsible>
      <span data-probe="touch" style={{ blockSize: "var(--size-touch-target)", display: "block" }} />
      <span data-probe="block-gap" style={{ inlineSize: "var(--spacing-block)", display: "block" }} />
    </CtIsolation>
  );
}

/** A hover-revealed action Row and a ListRow with revealed actions, each inside a hover group. */
export function RevealStory(): ReactElement {
  return (
    <CtIsolation subject="Row reveal and ListRow revealActions" isolates="The hover-reveal arms against their group">
      <div className="group" data-case="row-group">
        <Row reveal="hover" data-case="row-hover">
          <Button intent="ghost" size="sm">
            act
          </Button>
        </Row>
        <Row reveal="faint" data-case="row-faint">
          <Button intent="ghost" size="sm">
            pin
          </Button>
        </Row>
      </div>
      <ListRow
        title="Row with revealed actions"
        revealActions={true}
        actions={
          <Button intent="ghost" size="sm">
            edit
          </Button>
        }
      />
      <span data-case="away">elsewhere</span>
    </CtIsolation>
  );
}

/** The Card shapes and tones the drain needs, inside and outside a tier, beside token probes. */
export function CardShapeStory(): ReactElement {
  return (
    <CtIsolation subject="Card shape and tone" isolates="The row and well shapes and the clear and accent tones, tier-less and inside an instrument Surface">
      <Card shape="row" data-case="row">
        row
      </Card>
      <Card shape="well" data-case="well">
        well
      </Card>
      <Card tone="clear" data-case="clear">
        clear
      </Card>
      <Card shape="well" tone="accent" data-case="accent-well">
        accent
      </Card>
      <Card data-case="island">island</Card>
      <Surface tier="instrument">
        <Card shape="row" data-case="tier-row">
          row in a tier
        </Card>
      </Surface>
      <span data-probe="control" style={{ borderRadius: "var(--radius-control)", display: "block" }} />
      <span data-probe="muted" style={{ backgroundColor: "var(--color-muted)", display: "block" }} />
      <span data-probe="accent" style={{ backgroundColor: "var(--color-accent)", display: "block" }} />
      <span data-probe="clear" style={{ backgroundColor: "transparent", display: "block" }} />
    </CtIsolation>
  );
}

/** The Input width steps and the numeric arm. */
export function InputStory(): ReactElement {
  return (
    <CtIsolation subject="Input width and numeric" isolates="The width steps reach the element, and numeric sets tabular figures">
      <Input aria-label="avatar-md" layout="inline" width="avatar-md" numeric={true} />
      <Input aria-label="full" layout="inline" />
      <span data-probe="avatar-md" style={{ inlineSize: "var(--size-avatar-md)", display: "block" }} />
    </CtIsolation>
  );
}
