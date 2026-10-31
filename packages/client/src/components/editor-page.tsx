// The editor template: the centered content column an editor's body rides, with its tier declared.
// A form column breathes to `--width-content-col-wide` once the CONTENT pane clears `@cq-64`; an instrument whose
// only flexing cell is a control track holds the narrow cap, because every surplus pixel would widen the track.

import type { StackProps } from "@orb/ui/layout";
import { Stack, Surface } from "@orb/ui/layout";
import { cn } from "@orb/ui/lib";
import type { ReactElement } from "react";

const EDITOR_KINDS = ["form", "instrument"] as const;
/** The column's own block inset: none, the block step, or the section step a whole editor pane opens with. */
const EDITOR_INSETS = ["none", "block", "section"] as const;

export interface EditorPageProps extends Omit<StackProps, "className"> {
  /** `form` breathes past `@cq-64`; `instrument` holds the narrow cap. The tier follows. */
  readonly kind?: (typeof EDITOR_KINDS)[number];
  readonly inset?: (typeof EDITOR_INSETS)[number];
}

/** One editor column, centered in the CONTENT pane, under its declared tier. */
export function EditorPage({ kind = "form", inset = "none", ...stack }: EditorPageProps): ReactElement {
  return (
    <Surface tier={kind}>
      <Stack
        {...stack}
        className={cn(
          kind === "form"
            ? "mx-auto inline-full max-inline-(--width-content-col) min-inline-0 @cq-64:max-inline-(--width-content-col-wide)"
            : "mx-auto inline-full max-inline-(--width-content-col) min-inline-0",
          inset === "block" ? "py-block" : undefined,
          inset === "section" ? "py-section" : undefined,
        )}
      />
    </Surface>
  );
}
