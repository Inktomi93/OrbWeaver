import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Command } from "@orb/ui/command";
import { DialogHeader } from "@orb/ui/dialog";
import { ChevronDown, Circle, Icon } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack, Surface } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Select } from "@orb/ui/select";
import { Separator } from "@orb/ui/separator";
import { Skeleton } from "@orb/ui/skeleton";
import { WebSpinner } from "@orb/ui/spinner";
import { Swatch } from "@orb/ui/swatch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { WeaveGlyph } from "@orb/ui/web-weave";
import type { CSSProperties, ReactElement } from "react";

// A probe is a bare span painted straight from the token a case should resolve to, so the CT compares like with like.
function Probe({ name, style }: { readonly name: string; readonly style: CSSProperties }): ReactElement {
  return <span data-probe={name} style={{ display: "block", ...style }} />;
}

function mix(token: string, percent: number): string {
  return `color-mix(in oklab, var(${token}) ${percent}%, transparent)`;
}

/** The Text and Icon modifiers and the two new voices. */
export function TextFinishStory(): ReactElement {
  return (
    <CtIsolation subject="Text and Icon modifiers" isolates="The tone, italic, selectAll, pulse and hover-cue arms and the lead and datum voices">
      <Text data-case="foreground" tone="foreground" voice="gloss">
        foreground gloss
      </Text>
      <Text data-case="prose" tone="prose">
        prose
      </Text>
      <Text data-case="onPrimary" tone="onPrimary">
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
        <Text data-case="lift" hoverCue="lift" tone="muted">
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
      <Probe name="foreground" style={{ color: "var(--color-foreground)" }} />
      <Probe name="prose" style={{ color: "var(--color-prose-body)" }} />
      <Probe name="onPrimary" style={{ color: "var(--color-primary-foreground)" }} />
      <Probe name="muted" style={{ color: "var(--color-muted-foreground)" }} />
      <Probe name="lead" style={{ fontSize: "var(--text-body)", fontWeight: 600, fontFamily: "var(--font-sans)" }} />
      <Probe name="datum" style={{ fontSize: "var(--text-micro)", fontFamily: "var(--font-sans)", color: "var(--color-foreground)" }} />
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
      <Button intent="solid">solid</Button>
      <Button intent="bare">bare</Button>
      <Button intent="ghost" tone="foreground">
        ghost foreground
      </Button>
      <Button intent="outline" tone="muted">
        outline muted
      </Button>
      <Button intent="secondary" tone="muted">
        secondary muted
      </Button>
      <Button intent="ghost" underline="dotted">
        show all
      </Button>
      <Button intent="ghost" reserveEdge={true} size="inline">
        reserved
      </Button>
      <Button confirming={true} intent="ghost">
        confirming
      </Button>
      <Button disabled={true} intent="outline" quietDisabled={true}>
        quiet disabled
      </Button>
      <Button disabled={true} intent="outline">
        dim disabled
      </Button>
      <Button focusRing="sidebar" intent="ghost">
        on the rail
      </Button>
      <Button data-selected="" intent="outline" selection="rail">
        selected row
      </Button>
      <Button intent="outline" selection="rail">
        resting row
      </Button>
      <span data-case="away">elsewhere</span>
      <Probe name="primary" style={{ color: "var(--color-primary)", backgroundColor: "var(--color-primary)" }} />
      <Probe name="foreground" style={{ color: "var(--color-foreground)" }} />
      <Probe name="muted" style={{ color: "var(--color-muted-foreground)" }} />
      <Probe name="sidebar" style={{ color: "var(--color-sidebar)" }} />
      <Probe name="accent" style={{ color: "var(--color-accent)" }} />
      <Probe name="transparent" style={{ color: "transparent", backgroundColor: "transparent" }} />
    </CtIsolation>
  );
}

const TINTS = ["success", "warning", "destructive", "info"] as const;

/** The Card shapes, tones and state axes the drain added, tier-less, inside a tier and under the glow elevation. */
export function CardFinishStory(): ReactElement {
  return (
    <CtIsolation subject="Card shapes, tones and axes" isolates="Each new arm against its token, tier-less and inside an instrument Surface">
      <Card data-case="float" shape="float">
        float
      </Card>
      <Card data-case="inset" shape="inset">
        inset
      </Card>
      <Card data-case="plate" shape="plate">
        plate
      </Card>
      <Card data-case="pill" shape="pill">
        pill
      </Card>
      <Card data-case="bubble" shape="bubble" tone="userBubble">
        bubble
      </Card>
      <Surface tier="instrument">
        <Card data-case="tier-float" shape="float">
          float in a tier
        </Card>
        <Card data-case="tier-bubble" shape="bubble" tone="bubble">
          bubble in a tier
        </Card>
      </Surface>
      {TINTS.map((tint) => (
        <Card data-case={`${tint}Tint`} key={tint} tone={`${tint}Tint`}>
          {tint}
        </Card>
      ))}
      <Card data-case="primaryEdge" tone="primaryEdge">
        edge
      </Card>
      <Card data-case="primaryOutline" tone="primaryOutline">
        outline
      </Card>
      <Card data-case="raised" tone="raised">
        raised
      </Card>
      <Card data-case="sidebarEdge" tone="sidebarEdge">
        sidebar edge
      </Card>
      <Card data-case="popover" tone="popover">
        popover
      </Card>
      <Card data-case="mutedWash" tone="mutedWash">
        wash
      </Card>
      <Card data-case="systemBubble" tone="systemBubble">
        system
      </Card>
      <Card data-case="rail" rail="primary">
        set
      </Card>
      <Card data-case="spoiler" spoiler={true}>
        hidden
      </Card>
      <Card data-case="presence-hidden" presence="hidden">
        gone
      </Card>
      <Card data-case="presence-shown" presence="shown">
        here
      </Card>
      <Card data-case="holds-field" holdsField={true}>
        field host
      </Card>
      <Card data-case="drop-armed" data-drag-over="" dropTarget={true}>
        armed
      </Card>
      <Card data-case="focusable" focusable={true} tabIndex={-1}>
        region
      </Card>
      <Card data-case="own-slot" ownSlot="named-hook">
        named
      </Card>
      <Card data-case="overlay" shadow="overlay">
        lifted
      </Card>
      <div data-elevation="glow">
        <Card data-case="glow-follow">follows</Card>
        <Card data-case="glow-none" shadow="none">
          diagram
        </Card>
      </div>
      <span data-case="away">elsewhere</span>
      <Probe name="radius-card" style={{ borderRadius: "var(--radius-card)", padding: "var(--spacing-field)" }} />
      <Probe name="radius-inset" style={{ borderRadius: "var(--radius-inset)" }} />
      <Probe name="radius-full" style={{ borderRadius: "var(--radius-full)" }} />
      <Probe name="bubble" style={{ backgroundColor: "var(--color-user-bubble)", paddingBlock: "var(--spacing-row)", paddingInline: "var(--spacing-block)" }} />
      {TINTS.map((tint) => (
        <Probe key={tint} name={`${tint}Tint`} style={{ backgroundColor: mix(`--color-${tint}`, 10), borderColor: mix(`--color-${tint}`, 40) }} />
      ))}
      <Probe name="primaryEdge" style={{ borderColor: mix("--color-primary", 40) }} />
      <Probe name="primary" style={{ borderColor: "var(--color-primary)", backgroundColor: "transparent" }} />
      <Probe name="raised" style={{ backgroundColor: "var(--color-surface-raised)" }} />
      <Probe name="sidebarEdge" style={{ borderColor: "var(--color-sidebar-border)" }} />
      <Probe name="popover" style={{ backgroundColor: "var(--color-popover)", color: "var(--color-popover-foreground)" }} />
      <Probe name="mutedWash" style={{ backgroundColor: mix("--color-muted", 40) }} />
      <Probe name="muted" style={{ backgroundColor: "var(--color-muted)" }} />
      <Probe name="systemBubble" style={{ backgroundColor: "var(--color-system-bubble)" }} />
    </CtIsolation>
  );
}

const GROUNDS = ["background", "card", "popover", "raised", "sidebar"] as const;
const GROUND_FILLS = {
  background: "var(--color-background)",
  card: "var(--color-card)",
  popover: "var(--color-popover)",
  raised: "var(--color-surface-raised)",
  sidebar: "var(--color-sidebar)",
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
      <Row data-case="rule" divider="start" dividerTone="primary" dividerWeight="rule">
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
      <Stack data-case="highlight" highlight={true}>
        anchor
      </Stack>
      <Stack data-case="spoiler" spoiler={true}>
        spoiler
      </Stack>
      <Stack data-case="slide-parked" slide="parked">
        parked
      </Stack>
      <Stack data-case="slide-shown" slide="shown">
        shown
      </Stack>
      <Stack data-case="lifted" lifted={true}>
        lifted
      </Stack>
      <Stack data-case="fade" fade="start" fadeFrom="sidebar">
        fade
      </Stack>
      <Stack data-case="ink" ink="foreground">
        ink
      </Stack>
      <Stack data-case="opacity-motion" opacityMotion={true}>
        eases
      </Stack>
      <Stack data-case="focus-target" focusTarget={true} tabIndex={-1}>
        arrival
      </Stack>
      <Row data-case="scroll-x" scrollFade="x">
        strip
      </Row>
      <div className="group" data-case="reveal-group">
        <Row data-case="reveal-interactive" reveal="interactive">
          act
        </Row>
        <Row data-case="reveal-focus" reveal="focus">
          act
        </Row>
        <Row data-case="inert" inertUntilHover={true}>
          act
        </Row>
      </div>
      <Row data-case="state-expanded" data-expanded="" stateFill="expanded">
        expanded
      </Row>
      <Row data-case="state-selected" data-selected="" stateFill="selected">
        selected
      </Row>
      <span data-case="away">elsewhere</span>
      <Probe name="primary" style={{ borderColor: "var(--color-primary)" }} />
      {GROUNDS.map((ground) => (
        <Probe key={ground} name={`ground-${ground}`} style={{ backgroundColor: GROUND_FILLS[ground] }} />
      ))}
      <Probe name="ground-faint" style={{ backgroundColor: mix("--color-card", 40) }} />
      <Probe name="reading-plate" style={{ backgroundColor: "var(--color-reading-plate)" }} />
      <Probe name="card" style={{ backgroundColor: "var(--color-card)" }} />
      <Probe name="muted" style={{ backgroundColor: "var(--color-muted)" }} />
      <Probe name="accent" style={{ backgroundColor: "var(--color-accent)" }} />
      <Probe name="foreground" style={{ color: "var(--color-foreground)" }} />
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
      <Badge data-case="badge-accent" face="code" intent="accent">
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
      <WebSpinner label="Loading" tone="accent" />
      <span data-case="weave">
        <WeaveGlyph decorative={true} tone="accent" />
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
      <Probe name="foreground" style={{ color: "var(--color-foreground)" }} />
      <Probe name="separator" style={{ backgroundColor: mix("--color-primary", 35) }} />
      <Probe name="radius-base" style={{ borderRadius: "var(--radius-base)" }} />
      <Probe name="mono" style={{ fontFamily: "var(--font-mono)" }} />
      <Probe name="accent" style={{ backgroundColor: "var(--color-accent)" }} />
      <Probe name="primary" style={{ color: "var(--color-primary)", borderColor: mix("--color-primary", 55) }} />
      <Probe name="title" style={{ fontSize: "var(--text-title)" }} />
      <Probe name="sidebar" style={{ backgroundColor: "var(--color-sidebar)" }} />
      <Probe name="success" style={{ backgroundColor: "var(--color-success)" }} />
      <Probe name="muted-ink" style={{ borderColor: "var(--color-muted-foreground)" }} />
      <Probe name="step2" style={{ backgroundColor: mix("--color-foreground", 32) }} />
    </CtIsolation>
  );
}
