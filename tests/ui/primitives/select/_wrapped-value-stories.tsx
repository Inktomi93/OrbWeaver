import { CtIsolation } from "@orb/testkit/browser";
import { Row } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import type { ComponentProps, ReactElement } from "react";

interface WrappedSelectStoryProps {
  /** The pane's width in CSS px, narrower than the long value. */
  readonly width: number;
  readonly layout: NonNullable<ComponentProps<typeof Select>["layout"]>;
  /** The accessible name and the selected label of the picker whose value outgrows the pane. */
  readonly long: string;
  /** The accessible name and the selected label of the picker whose value fits one line. */
  readonly short: string;
}

/** A picker whose value outgrows its pane and one whose value fits, each in its own row, as a form lays them. */
export function WrappedSelectStory({ width, layout, long, short }: WrappedSelectStoryProps): ReactElement {
  return (
    <CtIsolation subject="Select" isolates="How a trigger holds a value wider than its pane needs no application services.">
      <div data-pane="" style={{ inlineSize: width }}>
        <Row>
          <Select aria-label={long} defaultValue="value" items={[{ value: "value", label: long }]} layout={layout} />
        </Row>
        <Row>
          <Select aria-label={short} defaultValue="value" items={[{ value: "value", label: short }]} layout={layout} />
        </Row>
      </div>
    </CtIsolation>
  );
}
