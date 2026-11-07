import { CtIsolation } from "@orb/testkit/browser";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Skeleton } from "@orb/ui/skeleton";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement } from "react";

const STAND_IN_HOST_PX = 300;
const WRAP_HOST_PX = 100;
const WRAP_CHILD_PX = 60;
const LONG_LINE = "A line far longer than any measure it could take, so the cap and nothing else decides where the box ends.".repeat(4);

/** Each owner axis on its production primitive, with a raw reference box where the axis must equal a token. */
export function OwnerAxesStory(): ReactElement {
  return (
    <CtIsolation subject="Owner axes" isolates="Each primitive with its own props, and nothing from a shell">
      <Text data-probe="text-cap-prose" cap="prose">
        {LONG_LINE}
      </Text>
      <Text data-probe="ref-prose" style={{ maxInlineSize: "var(--reading-measure-prose)" }}>
        {LONG_LINE}
      </Text>
      <div style={{ inlineSize: STAND_IN_HOST_PX }}>
        <Skeleton data-probe="skeleton-half" height="lineLabel" width="half" />
        <Skeleton data-probe="skeleton-control" height="controlMd" width="full" />
        <Skeleton data-probe="skeleton-avatar" height="avatarMd" width="avatarMd" variant="circle" />
        <Row>
          <Skeleton data-probe="skeleton-grow" height="lineMicro" grow={true} />
          <Skeleton height="lineMicro" width="avatarMd" />
        </Row>
        <div data-probe="skeleton-host" style={{ position: "relative", blockSize: STAND_IN_HOST_PX, inlineSize: STAND_IN_HOST_PX }}>
          <Skeleton data-probe="skeleton-cover" cover={true} />
        </div>
        <Button data-probe="ref-control" size="md">
          x
        </Button>
        <Text data-probe="ref-label" voice="label">
          x
        </Text>
        <Avatar data-probe="ref-avatar" size="md" alt="x" />
      </div>
      <div style={{ inlineSize: WRAP_HOST_PX }}>
        <Row data-probe="row-wrap" wrap={true}>
          <div style={{ inlineSize: WRAP_CHILD_PX, blockSize: WRAP_CHILD_PX, flexShrink: 0 }} />
          <div style={{ inlineSize: WRAP_CHILD_PX, blockSize: WRAP_CHILD_PX, flexShrink: 0 }} />
        </Row>
        <Row data-probe="row-nowrap">
          <div style={{ inlineSize: WRAP_CHILD_PX, blockSize: WRAP_CHILD_PX, flexShrink: 0 }} />
          <div style={{ inlineSize: WRAP_CHILD_PX, blockSize: WRAP_CHILD_PX, flexShrink: 0 }} />
        </Row>
      </div>
      <Stack data-probe="stack-pad-end" paddingBlockEnd="section" />
      <Row data-probe="row-pad-end" paddingBlockEnd="tight" />
      <Stack data-probe="ref-pad-section" paddingBlock="section" />
      <Row data-probe="ref-pad-tight" paddingBlock="tight" />
      <Heading data-probe="heading-cap-reading" level={2} cap="reading">
        {LONG_LINE}
      </Heading>
    </CtIsolation>
  );
}
