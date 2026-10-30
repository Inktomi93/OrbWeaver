import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Icon } from "@orb/ui/icons";
import { WebSpinner } from "@orb/ui/spinner";
import { Heading, Text } from "@orb/ui/text";
import { WeaveGlyph } from "@orb/ui/web-weave";

export const Buttons = () => (
  <>
    <Button intent="primary">Save</Button>
    <Button intent="solid" size="icon" aria-label="Send" />
    <Button intent="destructive">Delete</Button>
    <Button intent="secondary" size="sm">Cancel</Button>
    <Button intent="outline" shape="pill">Tag</Button>
    <Button intent="ghost" size="sm" onClick={go}>Open</Button>
    <Button intent="ghost" tone="muted">Quiet</Button>
    <Button intent="ghost" tone="destructive">Remove</Button>
    <Button intent="ghost" tone="default">Plain</Button>
    <Button intent="link" tone="primary">More</Button>
    <Button intent="link" tone="muted">Less</Button>
    <Button intent="bare" size="media">Art</Button>
    <Button intent="primary" tone="muted">Fill owns ink</Button>
  </>
);

export const Badges = () => (
  <>
    <Badge intent="neutral">Idle</Badge>
    <Badge intent="neutral" tone="soft" size="sm">Idle</Badge>
    <Badge intent="warning" size="sm">Stale</Badge>
    <Badge intent="danger" tone="soft">Failed</Badge>
    <Badge intent="info" tone="ghost">Note</Badge>
    <Badge intent="primary" size="dot" aria-hidden={true} />
    <Badge tone="soft">Plain</Badge>
  </>
);

export const Cards = () => (
  <>
    <Card tone="neutral">a</Card>
    <Card tone="clear" outline="dashed">b</Card>
    <Card tone="muted">c</Card>
    <Card tone="warning">d</Card>
    <Card tone="infoTint">e</Card>
    <Card tone="primaryEdge">f</Card>
    <Card tone="primaryOutline" shadow="none" outline="dashed">g</Card>
    <Card tone="highlight">h</Card>
    <Card shape="well">i</Card>
    <Card tone="bubble" shape="bubble" shadow="none">j</Card>
    <Card tone="popover" shape="pill" shadow="overlay">k</Card>
  </>
);

export const Inks = () => (
  <>
    <Text tone="muted">a</Text>
    <Text voice="gloss" tone="destructive">b</Text>
    <Text tone="accent">c</Text>
    <Text tone="onPrimary">d</Text>
    <Text tone="default">e</Text>
    <Text tone="muted" ink="inherit">f</Text>
    <Heading level={2} tone="speaker">g</Heading>
    <Icon icon={Star} tone="accolade" />
    <Icon icon={Star} tone="warning" size="sm" />
    <WeaveGlyph tone="accent" />
    <WebSpinner tone="muted" label="Loading" />
  </>
);
