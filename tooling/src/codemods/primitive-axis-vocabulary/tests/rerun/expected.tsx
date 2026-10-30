import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Icon } from "@orb/ui/icons";
import { WebSpinner } from "@orb/ui/spinner";
import { Heading, Text } from "@orb/ui/text";
import { WeaveGlyph } from "@orb/ui/web-weave";

export const Buttons = () => (
  <>
    <Button>Save</Button>
    <Button focal={false} square={true} aria-label="Send" />
    <Button tone="destructive">Delete</Button>
    <Button variant="outline" size="sm">Cancel</Button>
    <Button variant="outline" shape="pill">Tag</Button>
    <Button variant="ghost" size="sm" onClick={go}>Open</Button>
    <Button variant="ghost" ink="muted">Quiet</Button>
    <Button variant="ghost" tone="destructive">Remove</Button>
    <Button variant="ghost">Plain</Button>
    <Button variant="link">More</Button>
    <Button variant="link" ink="muted">Less</Button>
    <Button variant="bare" size="media">Art</Button>
    <Button>Fill owns ink</Button>
  </>
);

export const Badges = () => (
  <>
    <Badge>Idle</Badge>
    <Badge size="sm">Idle</Badge>
    <Badge tone="warning" variant="solid" size="sm">Stale</Badge>
    <Badge tone="destructive">Failed</Badge>
    <Badge tone="info" variant="outline">Note</Badge>
    <Badge tone="primary" variant="solid" size="dot" aria-hidden={true} />
    <Badge>Plain</Badge>
  </>
);

export const Cards = () => (
  <>
    <Card>a</Card>
    <Card variant="outline" dashed={true}>b</Card>
    <Card variant="soft">c</Card>
    <Card tone="warning" variant="soft">d</Card>
    <Card tone="info" variant="soft">e</Card>
    <Card tone="primary">f</Card>
    <Card tone="primary" variant="outline" dashed={true}>g</Card>
    <Card tone="warning" variant="outline">h</Card>
    <Card variant="soft">i</Card>
    <Card tone="bubble" shape="bubble">j</Card>
    <Card tone="popover" shape="pill" shadow="overlay">k</Card>
  </>
);

export const Inks = () => (
  <>
    <Text ink="muted">a</Text>
    <Text voice="gloss" tone="destructive">b</Text>
    <Text tone="primary">c</Text>
    <Text tone="primary" ink="toneForeground">d</Text>
    <Text>e</Text>
    <Text ink="inherit">f</Text>
    <Heading level={2} ink="speaker">g</Heading>
    <Icon icon={Star} ink="accolade" />
    <Icon icon={Star} tone="warning" size="sm" />
    <WeaveGlyph tone="primary" />
    <WebSpinner ink="muted" label="Loading" />
  </>
);
