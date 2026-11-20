// The editor template: an editor's body under its declared tier, on the column of the `ContentPane` it sits in.
// A form editor takes the pane's column, which breathes once the pane clears `@cq-64`. An instrument whose only flexing cell
// is a control track holds the narrow cap inside that column, because every surplus pixel would widen the track.

import type { StackProps } from "@orb/ui/layout";
import { Stack, Surface } from "@orb/ui/layout";
import type { ComponentProps, ReactElement } from "react";

const EDITOR_KINDS = ["form", "instrument"] as const;
/** The column's own block inset: none, the block step, or the section step a whole editor pane opens with. */
const EDITOR_INSETS = ["none", "block", "section"] as const;

export interface EditorPageProps extends Omit<ComponentProps<"div">, "className"> {
  /** The column's look, named here so the variant census reads the Stack it lands on. */
  readonly gap?: StackProps["gap"];
  readonly padding?: StackProps["padding"];
  readonly focusTarget?: StackProps["focusTarget"];
  /** `form` takes the pane's column; `instrument` holds the narrow cap. The tier follows. */
  readonly kind?: (typeof EDITOR_KINDS)[number];
  readonly inset?: (typeof EDITOR_INSETS)[number];
}

/** One editor body, under its declared tier. */
export function EditorPage({ kind = "form", inset = "none", gap, padding, focusTarget, ...stack }: EditorPageProps): ReactElement {
  const instrument = kind === "instrument";
  return (
    <Surface tier={kind}>
      <Stack
        {...stack}
        gap={gap}
        padding={padding}
        paddingBlock={inset === "none" ? undefined : inset}
        focusTarget={focusTarget}
        cap={instrument ? "column" : undefined}
        width="full"
        centred={instrument}
        minWidth="shrinks"
      />
    </Surface>
  );
}
