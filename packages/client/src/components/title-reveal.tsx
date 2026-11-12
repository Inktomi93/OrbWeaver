// A one-line title that its row can cut still says all of itself, by the press, tap or key that reaches it. While a text part of the title is cut
// the title is the control that opens its whole text; while nothing is cut it carries no extra control, and the reveal never shrinks the title under
// its floor: the floor belongs to the row, and the control adds no padding of its own.
//
// A title that is already a control keeps that control in both states (`action`): while it is cut its press opens the reveal, whose popup offers the
// control's own action, and while it is not its press is that action. A tooltip is no reveal here, because it opens on neither touch nor a plain key.
//
// A control that holds focus or an open reveal stays a control when its title stops being cut, so the focus that returns to it when the reveal
// closes does not fall to the page body.

import { Button } from "@orb/ui/button";
import { InlineAction } from "@orb/ui/inline-action";
import { Contents, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
import { CutPartContext, useCutParts } from "./use-is-cut.ts";

/** The reasons a reveal closes with focus going where the user pointed, not back to the control that opened it. */
const FOCUS_LEAVES: ReadonlySet<string> = new Set(["outside-press", "focus-out"]);

/** What a press does: open the whole text, or take the control's own action. */
type PressMode = "reveal" | "act";

/** The keys whose press on a button is its click. */
const PRESS_KEYS: ReadonlySet<string> = new Set(["Enter", " "]);

/** What a title that is already a control does when pressed uncut, and what its reveal offers while it is cut. */
interface TitleAction {
  /** The label of the action inside the reveal. */
  readonly label: string;
  readonly onSelect: () => void;
  /** The control, drawn for the state it is in: its name carries the whole title either way. */
  readonly control: (state: { readonly cut: boolean }) => ReactElement;
}

export interface TitleRevealProps {
  /** The whole title: what the reveal prints, and what a cut title's control is named by. */
  readonly whole: string;
  /** The title fills the room its row gives it, so the control that replaces it fills that room too and takes the floor the title carries. */
  readonly fill?: boolean;
  readonly action?: TitleAction;
  /** The control a cut title becomes, where the title is not already one and the row's own layout has to hold under the control. Default: a text-height action that fills the row. */
  readonly control?: ReactElement;
  /** What the title sits in while it is not a control, where the row's layout wants a box around it. The control carries that layout itself. */
  readonly frame?: (children: ReactNode) => ReactElement;
  readonly children: ReactNode;
}

function Reveal({
  whole,
  action,
}: {
  readonly whole: string;
  readonly action?: { readonly label: string; readonly onSelect: () => void } | undefined;
}): ReactElement {
  return (
    <PopoverPopup aria-label={whole} side="bottom">
      <Stack gap="row">
        <Text>{whole}</Text>
        {action === undefined ? null : (
          <Button onClick={action.onSelect} size="sm" type="button" variant="outline">
            {action.label}
          </Button>
        )}
      </Stack>
    </PopoverPopup>
  );
}

export function TitleReveal({ whole, fill = false, action, control: own, frame, children }: TitleRevealProps): ReactElement {
  const { cut, part } = useCutParts();
  const [open, setOpen] = useState(false);
  // Set when a reveal opens and cleared when focus leaves the control, so the control outlives the cut that made it.
  const [held, setHeld] = useState(false);
  const isControl = action !== undefined || cut || held;
  const revealing = cut || open;
  // A press acts on the state it started in: the layout can change between the press and its click, and a press that began on the control's own
  // action is not turned into a reveal by a cut that arrived under the finger. Set at pointer-down or key-down, spent when the press ends.
  const started = useRef<PressMode | null>(null);
  const modeNow = (): PressMode => (revealing ? "reveal" : "act");
  const begin = (): void => {
    started.current = modeNow();
  };
  const end = (): void => {
    globalThis.setTimeout(() => {
      started.current = null;
    }, 0);
  };
  const mode = (): PressMode => started.current ?? modeNow();

  const control = action === undefined ? (own ?? <InlineAction grow={fill} step="label" type="button" />) : action.control({ cut });
  const trigger = (
    <PopoverTrigger
      aria-expanded={revealing ? open : undefined}
      aria-haspopup={revealing ? "dialog" : undefined}
      onBlur={(): void => {
        started.current = null;
        if (!open) {
          setHeld(false);
        }
      }}
      onClick={action === undefined ? undefined : (): void => (mode() === "act" ? action.onSelect() : undefined)}
      onKeyDown={(event): void => (PRESS_KEYS.has(event.key) ? begin() : undefined)}
      onKeyUp={end}
      onPointerCancel={end}
      onPointerDown={begin}
      onPointerUp={end}
      render={control}
    >
      {children}
    </PopoverTrigger>
  );

  return (
    <Contents data-slot="title-reveal">
      <CutPartContext value={part}>
        {isControl ? (
          <Popover
            onOpenChange={(next, details): void => {
              const reveals = next && mode() === "reveal";
              setOpen(reveals);
              if (reveals) {
                setHeld(true);
              } else if (!next && FOCUS_LEAVES.has(details.reason)) {
                setHeld(false);
              }
            }}
            open={open}
          >
            {trigger}
            <Reveal
              action={
                action === undefined
                  ? undefined
                  : {
                      label: action.label,
                      onSelect: (): void => {
                        setOpen(false);
                        action.onSelect();
                      },
                    }
              }
              whole={whole}
            />
          </Popover>
        ) : (
          (frame?.(children) ?? children)
        )}
      </CutPartContext>
    </Contents>
  );
}
