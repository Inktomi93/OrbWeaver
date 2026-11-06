import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Command } from "@orb/ui/command";
import { DialogHeader } from "@orb/ui/dialog";
import { ChevronDown, Circle, Icon } from "@orb/ui/icons";
import { InlineAction } from "@orb/ui/inline-action";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack, Surface } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { MessageBubble } from "@orb/ui/message-bubble";
import { PictureButton } from "@orb/ui/picture-button";
import { Select } from "@orb/ui/select";
import { Separator } from "@orb/ui/separator";
import { Skeleton } from "@orb/ui/skeleton";
import { WebSpinner } from "@orb/ui/spinner";
import { Swatch } from "@orb/ui/swatch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { PigmentScope, Tone, ToneRole } from "@orb/ui/tokens";
import { PIGMENTS, TOKENS } from "@orb/ui/tokens";
import { WeaveGlyph } from "@orb/ui/web-weave";
import type { CSSProperties, ReactElement } from "react";

// A probe is a bare span painted straight from the token a case should resolve to, so the CT compares like with like. A
// probe that reads a D336 tone role stamps the tone the case stamps.
function Probe({
  name,
  style,
  tone,
  pigment,
}: {
  readonly name: string;
  readonly style: CSSProperties;
  readonly tone?: Tone;
  readonly pigment?: PigmentScope;
}): ReactElement {
  return <span data-pigment={pigment} data-probe={name} data-tone={tone} style={{ display: "block", ...style }} />;
}

function role(name: ToneRole): string {
  return `var(${TOKENS[`color.tone-${name}`].cssVar})`;
}

/** The Text and Icon modifiers and the two new voices. */
export function TextFinishStory(): ReactElement {
  return (
    <CtIsolation subject="Text and Icon modifiers" isolates="The tone, italic, selectAll, pulse and hover-cue arms and the lead and datum voices">
      <Text data-case="foreground" ink="foreground" voice="gloss">
        foreground gloss
      </Text>
      <Text data-case="prose" ink="prose">
        prose
      </Text>
      <Text data-case="onPrimary" tone="primary" ink="toneForeground">
        on primary
      </Text>
      <Text data-case="italic" italic={true}>
        thought
      </Text>
      <Text data-case="selectAll" selectAll={true}>
        https://example.test/repo
      </Text>
      <Text data-case="pulse" pulse={true}>
        responding…
      </Text>
      <Text data-case="lead" voice="lead">
        3 imported, 1 skipped
      </Text>
      <Text data-case="datum" voice="datum">
        1024
      </Text>
      <Icon icon={Circle} label="pulsing icon" pulse={true} />
      <div className="group" data-case="cue-group">
        <Text data-case="lift" hoverCue="lift" ink="muted">
          Resume
        </Text>
        <Text as="span" data-case="nudge" hoverCue="nudge">
          →
        </Text>
      </div>
      <div className="group/row" data-case="yield-group">
        <Icon icon={Circle} label="yielding icon" yieldOnHover={true} />
      </div>
      <div className="group" data-panel-open="" data-case="open-group">
        <Icon icon={ChevronDown} label="open chevron" openTurn={true} />
      </div>
      <span data-case="away">elsewhere</span>
      <Probe name="foreground" style={{ color: `var(${TOKENS["color.foreground"].cssVar})` }} />
      <Probe name="prose" style={{ color: `var(${TOKENS["color.prose-body"].cssVar})` }} />
      <Probe name="onPrimary" style={{ color: `var(${TOKENS["color.primary-foreground"].cssVar})` }} />
      <Probe name="muted" style={{ color: `var(${TOKENS["color.muted-foreground"].cssVar})` }} />
      <Probe name="lead" style={{ fontSize: `var(${TOKENS["text.body"].cssVar})`, fontWeight: 600, fontFamily: `var(${TOKENS["font.sans"].cssVar})` }} />
      <Probe
        name="datum"
        style={{
          fontSize: `var(${TOKENS["text.micro"].cssVar})`,
          fontFamily: `var(${TOKENS["font.sans"].cssVar})`,
          color: `var(${TOKENS["color.foreground"].cssVar})`,
        }}
      />
    </CtIsolation>
  );
}

/** The Button intents and axes the drain added. */
export function ButtonFinishStory(): ReactElement {
  return (
    <CtIsolation
      subject="Button intents and state axes"
      isolates="solid, bare, the widened tone, underline, reserveEdge, confirming, quietDisabled, focusRing and the rail"
    >
      <Button focal={false}>solid</Button>
      <PictureButton>bare</PictureButton>
      <Button variant="ghost" ink="foreground">
        ghost foreground
      </Button>
      <Button variant="outline" ink="muted">
        outline muted
      </Button>

      <Button variant="ghost" underline="dotted">
        show all
      </Button>
      <InlineAction variant="ghost" reserveEdge={true} step="label">
        reserved
      </InlineAction>
      <Button confirming={true} variant="ghost">
        confirming
      </Button>
      <Button disabled={true} variant="outline" quietDisabled={true}>
        quiet disabled
      </Button>
      <Button disabled={true} variant="outline">
        dim disabled
      </Button>
      <Button focusRing="sidebar" variant="ghost">
        on the rail
      </Button>
      <Button data-selected="" variant="outline" selection="rail">
        selected row
      </Button>
      <Button variant="outline" selection="rail">
        resting row
      </Button>
      <span data-case="away">elsewhere</span>
      <Probe name="primary" style={{ color: `var(${TOKENS["color.primary"].cssVar})`, backgroundColor: `var(${TOKENS["color.primary"].cssVar})` }} />
      <Probe name="foreground" style={{ color: `var(${TOKENS["color.foreground"].cssVar})` }} />
      <Probe name="muted" style={{ color: `var(${TOKENS["color.muted-foreground"].cssVar})` }} />
      <Probe name="sidebar" style={{ color: `var(${TOKENS["color.sidebar"].cssVar})` }} />
      <Probe name="accent" style={{ color: `var(${TOKENS["color.accent"].cssVar})` }} />
      <Probe name="transparent" style={{ color: "transparent", backgroundColor: "transparent" }} />
    </CtIsolation>
  );
}

/** The Card shapes, tones and state axes the drain added, tier-less, inside a tier and under the glow elevation. */
export function CardFinishStory(): ReactElement {
  return (
    <CtIsolation subject="Card shapes, tones and axes" isolates="Each remaining arm against its token, tier-less and inside an instrument Surface">
      <MessageBubble data-case="bubble" messageRole="user" shape="bubble">
        bubble
      </MessageBubble>
      <Surface tier="instrument">
        <MessageBubble data-case="tier-bubble" messageRole="assistant" shape="bubble">
          bubble in a tier
        </MessageBubble>
      </Surface>
      <Card data-case="rail" rail="primary">
        set
      </Card>
      <Card data-case="focusable" focusable={true} tabIndex={-1}>
        region
      </Card>
      <Card data-case="own-slot" ownSlot="named-hook">
        named
      </Card>
      <div data-elevation="glow">
        <Card data-case="glow-follow" interactive={true}>
          follows
        </Card>
        <Card data-case="glow-none">static</Card>
      </div>
      <span data-case="away">elsewhere</span>
      <Probe name="radius-card" style={{ borderRadius: `var(${TOKENS["radius.card"].cssVar})`, padding: `var(${TOKENS["spacing.field"].cssVar})` }} />
      <Probe
        name="bubble"
        style={{
          backgroundColor: `var(${TOKENS["color.user-bubble"].cssVar})`,
          paddingBlock: `var(${TOKENS["spacing.row"].cssVar})`,
          paddingInline: `var(${TOKENS["spacing.block"].cssVar})`,
        }}
      />
      <Probe name="primary" tone="primary" style={{ borderColor: role("solid"), backgroundColor: "transparent" }} />
    </CtIsolation>
  );
}

const GROUNDS = ["background", "card", "popover", "raised", "sidebar"] as const;
const GROUND_FILLS = {
  background: `var(${TOKENS["color.background"].cssVar})`,
  card: `var(${TOKENS["color.card"].cssVar})`,
  popover: `var(${TOKENS["color.popover"].cssVar})`,
  raised: `var(${TOKENS["color.surface-raised"].cssVar})`,
  sidebar: `var(${TOKENS["color.sidebar"].cssVar})`,
} as const;

/** The layout-box axes the drain added: dividers, grounds, plates and the state treatments. */
export function LayoutFinishStory(): ReactElement {
  return (
    <CtIsolation subject="Row and Stack axes" isolates="divider weight, tone, style and between; ground; plate; and the state treatments">
      <Stack data-case="list">
        <Stack data-case="between-first" divider="between">
          one
        </Stack>
        <Stack data-case="between-last" divider="between">
          two
        </Stack>
      </Stack>
      <Row data-case="rule" divider="start" tone="primary" dividerWeight="rule">
        rule
      </Row>
      <Stack data-case="dashed" divider="start" dividerStyle="dashed">
        dashed
      </Stack>
      {GROUNDS.map((ground) => (
        <Stack data-case={`ground-${ground}`} ground={ground} key={ground}>
          {ground}
        </Stack>
      ))}
      <Row data-case="ground-faint" ground="faint">
        faint
      </Row>
      <Container data-case="container-card" ground="card">
        container
      </Container>
      <Stack data-case="unless-plain" ground="backgroundUnlessArt">
        plain room
      </Stack>
      <div data-has-bg-image="">
        <Stack data-case="unless-art" ground="backgroundUnlessArt">
          room over art
        </Stack>
        <Row data-case="plate-band" plate="band">
          band
        </Row>
        <Stack data-case="plate-error" plate="error">
          error
        </Stack>
      </div>
      <Row data-case="plate-plain" plate="band">
        band without art
      </Row>
      <Stack data-case="fade" fade="start" fadeFrom="sidebar">
        fade
      </Stack>
      <Stack data-case="ink" ink="foreground">
        ink
      </Stack>
      <Stack data-case="receded-motion" receded={true}>
        eases
      </Stack>
      <Stack data-case="focus-target" focusTarget={true} tabIndex={-1}>
        arrival
      </Stack>
      <Row data-case="scroll-x" scrollFade="x">
        strip
      </Row>
      <div className="group" data-case="reveal-group">
        <Row data-case="inert" inertUntilHover={true}>
          act
        </Row>
      </div>
      <span data-case="away">elsewhere</span>
      <Probe name="primary" style={{ borderColor: `var(${TOKENS["color.primary"].cssVar})` }} />
      {GROUNDS.map((ground) => (
        <Probe key={ground} name={`ground-${ground}`} style={{ backgroundColor: GROUND_FILLS[ground] }} />
      ))}
      <Probe name="ground-faint" style={{ backgroundColor: GROUND_FILLS.background }} />
      <Probe name="reading-plate" style={{ backgroundColor: `var(${TOKENS["color.reading-plate"].cssVar})` }} />
      <Probe name="card" style={{ backgroundColor: `var(${TOKENS["color.card"].cssVar})` }} />
      <Probe name="foreground" style={{ color: `var(${TOKENS["color.foreground"].cssVar})` }} />
      <Probe name="transparent" style={{ backgroundColor: "transparent" }} />
    </CtIsolation>
  );
}

/** The arms the drain added to the other primitives. */
export function PartsFinishStory(): ReactElement {
  return (
    <CtIsolation
      subject="Primitive arms"
      isolates="Collapsible, Separator, Skeleton, Textarea, Badge, Select, Input, spinner, glyph, Tabs, DialogHeader, Command and Swatch"
    >
      <Collapsible defaultOpen={true}>
        <CollapsibleTrigger>Section</CollapsibleTrigger>
        <CollapsiblePanel data-case="holds-controls" holds="controls">
          controls
        </CollapsiblePanel>
      </Collapsible>
      <Separator data-case="separator" tone="primary" />
      <Skeleton className="block-(--size-avatar-lg) inline-(--size-avatar-lg)" data-case="skeleton" variant="portrait" />
      <Textarea aria-label="bare field" chrome="bare" face="code" />
      <Badge data-case="badge-code" face="code">
        token
      </Badge>
      <Text as="div" voice="kicker">
        <Badge data-case="badge-sentence" sentenceCase={true}>
          This script
        </Badge>
      </Text>
      <Select aria-label="Subject" items={[{ value: "aria", label: "Aria" }]} layout="inline" strong={true} value="aria" />
      <Input aria-label="title step" italic={true} layout="inline" typeStep="title" />
      <Surface tier="instrument">
        <Input aria-label="title step in a tier" layout="inline" typeStep="title" />
      </Surface>
      <WebSpinner label="Loading" tone="primary" />
      <span data-case="weave">
        <WeaveGlyph decorative={true} tone="primary" />
      </span>
      <Tabs data-case="tabs" defaultValue="a" topRule="primary">
        <TabsList data-case="tabs-list" rule="none">
          <TabsTab data-case="tab-cell" layout="cell" value="a">
            A
          </TabsTab>
          <TabsTab data-case="tab-quiet" layout="cell" quiet={true} value="b">
            B
          </TabsTab>
        </TabsList>
        <TabsPanel data-case="tabs-panel" ground="sidebar" value="a">
          panel
        </TabsPanel>
      </Tabs>
      <DialogHeader data-case="dialog-header" sticky={true}>
        Title
      </DialogHeader>
      <Command data-case="command" elevated={true} label="Palette">
        {null}
      </Command>
      <Swatch className="block-(--size-dot) inline-(--size-dot)" data-case="swatch-online" fill="success" shape="pill" />
      <Swatch className="block-(--size-dot) inline-(--size-dot)" data-case="swatch-offline" edge="ring" shape="pill" />
      <Swatch className="block-(--size-dot) inline-(--size-dot)" data-case="swatch-outline" edge="outline" fill="primary" />
      <Swatch className="block-(--size-dot) inline-(--size-dot)" data-case="swatch-step2" fill="step2" />
      <Menu defaultOpen={true}>
        <MenuTrigger>More</MenuTrigger>
        <MenuPopup>
          <MenuItem hiddenAt="fine">coarse only</MenuItem>
          <MenuItem>always</MenuItem>
        </MenuPopup>
      </Menu>
      <Probe name="foreground" style={{ color: `var(${TOKENS["color.foreground"].cssVar})` }} />
      <Probe name="separator" tone="primary" style={{ backgroundColor: role("edge") }} />
      <Probe name="radius-base" style={{ borderRadius: `var(${TOKENS["radius.base"].cssVar})` }} />
      <Probe name="mono" style={{ fontFamily: `var(${TOKENS["font.mono"].cssVar})` }} />
      <Probe name="accent" style={{ backgroundColor: `var(${TOKENS["color.accent"].cssVar})` }} />
      <Probe name="primary" tone="primary" style={{ color: role("text"), borderColor: role("edge") }} />
      <Probe name="primary-solid" tone="primary" style={{ color: role("solid") }} />
      <Probe name="title" style={{ fontSize: `var(${TOKENS["text.title"].cssVar})` }} />
      <Probe name="sidebar" style={{ backgroundColor: `var(${TOKENS["color.sidebar"].cssVar})` }} />
      <Probe name="success" style={{ backgroundColor: `var(${TOKENS["color.success"].cssVar})` }} />
      <Probe name="muted-ink" style={{ borderColor: `var(${TOKENS["color.muted-foreground"].cssVar})` }} />
      <Probe name="ladder-2" pigment="swatch-ladder" style={{ backgroundColor: `var(${PIGMENTS["swatch-ladder"]["step-2"]})` }} />
      <Probe name="quiet" style={{ opacity: `var(${TOKENS["opacity.quiet"].cssVar})` }} />
    </CtIsolation>
  );
}
