import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Icon, Lock } from "@orb/ui/icons";
import { IndicatorDot } from "@orb/ui/indicator-dot";
import { Corner, Row, Stack, Surface } from "@orb/ui/layout";
import { Swatch } from "@orb/ui/swatch";
import { Heading, Text } from "@orb/ui/text";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const BOX_PX = 120;
const LONG_LINE = "A line far longer than the box it sits in, which must be clipped rather than wrapped";

/** Each owner beside a reference box that spells the same step as a raw padding declaration. */
export function OneAxisOwnersStory(): ReactElement {
  return (
    <CtIsolation subject="One-axis padding and truncate owners" isolates="Stack, Row, Text and Heading with their own props, and nothing from a shell">
      <Stack paddingInline="block" data-probe="stack-inline" />
      <Stack paddingBlock="section" data-probe="stack-block" />
      <Row paddingInline="field" data-probe="row-inline" />
      <Row paddingBlock="row" data-probe="row-block" />
      <Stack padding="gutter" paddingInline="field" data-probe="stack-override" />
      <div data-probe="corner-host" style={{ position: "relative", width: BOX_PX, height: BOX_PX }}>
        <Corner data-probe="corner-badge">
          <Badge>3</Badge>
        </Corner>
        <Corner data-probe="corner-text">
          <Text as="span">3</Text>
        </Corner>
        <Corner data-probe="corner-dot">
          <IndicatorDot />
        </Corner>
        <Corner data-probe="corner-icon">
          <Icon icon={Lock} />
        </Corner>
        <Corner inset="tight" data-probe="corner-tight">
          <IndicatorDot />
        </Corner>
        <Button aria-label="Close" corner="badge" data-probe="corner-button" square={true} variant="ghost">
          x
        </Button>
      </div>
      <Surface tier="form">
        <Card padding="none" data-probe="card-padding-none">
          x
        </Card>
      </Surface>
      <Swatch size="dot" fill="primary" data-probe="swatch-dot" />
      <div style={{ display: "flex", width: BOX_PX * 2 }}>
        <Row grow={true} data-probe="row-grow" />
        <div style={{ width: BOX_PX }} />
      </div>
      <div style={{ width: BOX_PX }}>
        <Text as="p" wrap="anywhere" data-probe="text-anywhere">
          {"x".repeat(80)}
        </Text>
        <Text as="p" whitespace="preWrap" data-probe="text-prewrap">
          two lines
        </Text>
      </div>
      <Stack cap="column" data-probe="stack-cap-column" />
      <Row cap="fit" data-probe="row-cap-fit" />
      <div data-probe="ref-column" style={{ maxWidth: `var(${TOKENS["width.content-col"].cssVar})` }} />
      <div data-probe="ref-block" style={{ padding: `var(${TOKENS["spacing.block"].cssVar})` }} />
      <div data-probe="ref-section" style={{ padding: `var(${TOKENS["spacing.section"].cssVar})` }} />
      <div data-probe="ref-field" style={{ padding: `var(${TOKENS["spacing.field"].cssVar})` }} />
      <div data-probe="ref-dot" style={{ width: `var(${TOKENS["size.dot"].cssVar})`, height: `var(${TOKENS["size.dot"].cssVar})` }} />
      <div data-probe="ref-row" style={{ padding: `var(${TOKENS["spacing.row"].cssVar})` }} />
      <div style={{ width: BOX_PX }}>
        <Text truncate={true} data-probe="text-truncate">
          {LONG_LINE}
        </Text>
        <Text data-probe="text-wrap">{LONG_LINE}</Text>
        <Heading level={2} truncate={true} data-probe="heading-truncate">
          {LONG_LINE}
        </Heading>
      </div>
    </CtIsolation>
  );
}
