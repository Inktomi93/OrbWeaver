import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsibleTrigger } from "@orb/ui/collapsible";
import { DialogFooter, DialogHeader } from "@orb/ui/dialog";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Contents, Grid, Row, Stack } from "@orb/ui/layout";
import { PictureButton } from "@orb/ui/picture-button";
import { TOKENS } from "@orb/ui/tokens";
import { VirtualList } from "@orb/ui/virtual-list";
import type { ReactElement } from "react";

const HOST_PX = 400;
const NARROW_HOST_PX = 80;
const SHORT_HOST_PX = 60;
const TALL_HOST_PX = 240;
const LONG_LABEL = "A label far longer than the box it sits in";
const LIST_ROWS = ["one", "two", "three"];
const LIST_ROW_PX = 24;

/** A raw box at one token, so an axis is measured against the ramp and never against a number. */
function Ref({ probe, block, inline }: { readonly probe: string; readonly block?: string; readonly inline?: string }): ReactElement {
  return (
    <div
      data-probe={probe}
      style={{ blockSize: block === undefined ? undefined : `var(${block})`, inlineSize: inline === undefined ? undefined : `var(${inline})` }}
    />
  );
}

/** Each axis on its production control, in a host that makes the axis the one thing deciding the box. */
export function ControlAxesStory(): ReactElement {
  return (
    <CtIsolation subject="Control axes" isolates="Each control with its own props, and nothing from a shell">
      <Ref probe="ref-hero" inline={TOKENS["size.avatar-hero"].cssVar} />
      <Ref probe="ref-pane-sm" inline="--container-cq-24" />
      <Ref probe="ref-field-floor" inline={TOKENS["width.field-floor"].cssVar} />
      <Ref probe="ref-scroll-sm" block={TOKENS["height.scroll-sm"].cssVar} />
      <Ref probe="ref-control-md" block={TOKENS["size.control-md"].cssVar} inline={TOKENS["size.control-md"].cssVar} />
      <Stack data-probe="ref-field-inset" paddingInline="field" />

      <div data-probe="wide-host" style={{ inlineSize: HOST_PX }}>
        <Row>
          <Button data-probe="button-grow" grow={true}>
            Grow
          </Button>
          <Button data-probe="button-rest">Rest</Button>
        </Row>
        <Row>
          <Button data-probe="button-floor" floor="field">
            F
          </Button>
        </Row>
        <Button data-probe="button-cap" cap="avatarHero" size="md">
          {LONG_LABEL}
        </Button>
        <Button data-probe="button-text-end" textAlign="end" wrap={true} width="full" size="md">
          End
        </Button>
        <Button data-probe="button-inset" inset="control" size="lg">
          Inset
        </Button>
        <Button data-probe="button-plain" size="lg">
          Plain
        </Button>
        <Badge data-probe="badge-cap" cap="avatarHero">
          {LONG_LABEL}
        </Badge>
        <Row>
          <Field data-probe="field-grow" grow={true} label="Grow">
            <Input />
          </Field>
          <Field data-probe="field-rest" label="Rest" width="content">
            <Input />
          </Field>
        </Row>
        <Field data-probe="field-cap" cap="paneSm" label="Capped">
          <Input />
        </Field>
        <PictureButton data-probe="picture-caption" caption="start" variant="ghost">
          <span data-probe="picture-mark">Mark</span>
          <span data-probe="picture-label">Caption</span>
        </PictureButton>
        <PictureButton data-probe="picture-floor" minHeight="controlMd" minWidth="controlMd" />
        <Card data-probe="card-width" width="full" cap="avatarHero" />
        <Collapsible>
          <Row>
            <CollapsibleTrigger data-probe="trigger-width" width="full">
              Open
            </CollapsibleTrigger>
          </Row>
        </Collapsible>
      </div>

      <div data-probe="narrow-host" style={{ inlineSize: NARROW_HOST_PX }}>
        <Button data-probe="button-whitespace" whitespace="normal">
          {LONG_LABEL}
        </Button>
        <Button data-probe="button-nowrap">{LONG_LABEL}</Button>
        <Badge data-probe="badge-whitespace" whitespace="normal">
          {LONG_LABEL}
        </Badge>
        <Badge data-probe="badge-nowrap">{LONG_LABEL}</Badge>
      </div>

      <Stack data-probe="dialog-host" style={{ blockSize: TALL_HOST_PX }}>
        <DialogFooter data-probe="dialog-push" push="blockEnd">
          <Button>Done</Button>
        </DialogFooter>
      </Stack>
      <div style={{ inlineSize: NARROW_HOST_PX }}>
        <DialogHeader data-probe="dialog-wrap" wrap={true}>
          <Button data-probe="wrap-first">One long header</Button>
          <Button data-probe="wrap-second">Another long header</Button>
        </DialogHeader>
      </div>

      <Row data-probe="self-host" align="start" style={{ blockSize: TALL_HOST_PX }}>
        <Stack data-probe="self-end" self="end">
          End
        </Stack>
        <Stack data-probe="self-stretch" self="stretch">
          Stretch
        </Stack>
      </Row>
      <Stack data-probe="placed-host" style={{ position: "relative", blockSize: TALL_HOST_PX, inlineSize: HOST_PX }}>
        <Row data-probe="placed-foot" placed="footBand" />
      </Stack>
      <Stack data-probe="max-height" maxHeight="scrollSm" scroll="y">
        <div style={{ blockSize: `calc(2 * var(${TOKENS["height.scroll-sm"].cssVar}))`, flexShrink: 0 }} />
      </Stack>
      <Grid data-probe="grid-gaps" gapInline="block" gapBlock="tight" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <span data-probe="cell-a">a</span>
        <span data-probe="cell-b">b</span>
        <span data-probe="cell-c">c</span>
      </Grid>
      <Row data-probe="contents-row">
        <Contents data-probe="contents">
          <span data-probe="contents-child">Child</span>
        </Contents>
      </Row>

      <div style={{ blockSize: SHORT_HOST_PX }} data-probe="list-host">
        <VirtualList
          aria-label="Filled list"
          estimateSize={(): number => LIST_ROW_PX}
          fill={true}
          gapToken="tight"
          getItemKey={(row: string): string => row}
          items={LIST_ROWS}
          renderItem={(row: string): ReactElement => <div style={{ blockSize: LIST_ROW_PX }}>{row}</div>}
        />
      </div>
    </CtIsolation>
  );
}
