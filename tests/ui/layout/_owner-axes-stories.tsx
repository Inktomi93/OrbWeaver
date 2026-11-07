import { CtIsolation } from "@orb/testkit/browser";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { InlineToken } from "@orb/ui/inline-token";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { MessageBubble } from "@orb/ui/message-bubble";
import { Separator } from "@orb/ui/separator";
import { Skeleton } from "@orb/ui/skeleton";
import { Heading, Text } from "@orb/ui/text";
import { TOKENS } from "@orb/ui/tokens";
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
      <Text data-probe="ref-prose" style={{ maxInlineSize: `var(${TOKENS["reading.measure-prose"].cssVar})` }}>
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
      <Row data-probe="push-host" style={{ inlineSize: WRAP_HOST_PX * 2 }}>
        <Text as="span">a</Text>
        <Text as="span" data-probe="text-push-end" push="inlineEnd">
          b
        </Text>
      </Row>
      <Stack data-probe="push-column" style={{ blockSize: WRAP_HOST_PX * 2 }}>
        <Text>a</Text>
        <Row data-probe="row-push-foot" push="blockEnd">
          b
        </Row>
      </Stack>
      <Text>
        <InlineToken data-probe="token-leads" leads={true}>
          a
        </InlineToken>
        <InlineToken data-probe="token-plain">b</InlineToken>
      </Text>
      <Stack data-probe="stack-empty" hiddenAt="empty" />
      <Stack data-probe="stack-held" hiddenAt="empty">
        <Text>a</Text>
      </Stack>
      <Stack data-probe="stack-always" hiddenAt="always">
        <Text>a</Text>
      </Stack>
      <Row data-probe="row-floor" minHeight="controlMd" />
      <Stack data-probe="stack-floor" minWidth="controlMd" />
      <Text data-probe="text-end" textAlign="end">
        a
      </Text>
      <Text data-probe="text-inset" inset="control">
        a
      </Text>
      <Text data-probe="text-cluster" flow="clusterTight">
        <span data-probe="cluster-a">a</span>
        <span data-probe="cluster-b">b</span>
      </Text>
      <Text as="span" data-probe="text-flow-block" flow="block">
        a
      </Text>
      <Heading data-probe="heading-baseline" flow="baselineRow" level={2}>
        a
      </Heading>
      <MessageBubble data-probe="bubble-weld" flow="weld" messageRole="assistant">
        a
      </MessageBubble>
      <MessageBubble data-probe="bubble-stack" flow="stack" messageRole="assistant">
        a
      </MessageBubble>
      <Row style={{ inlineSize: WRAP_HOST_PX * 2 }}>
        <Separator data-probe="separator-grow" grow={true} />
        <Input data-probe="input-grow" grow={true} aria-label="x" />
      </Row>
      <Heading data-probe="heading-cap-reading" level={2} cap="reading">
        {LONG_LINE}
      </Heading>
    </CtIsolation>
  );
}
