// A modal's title, which holds one line on a short window (and beside a dialog's header actions) and cuts its words to it. While its words
// are cut the title is the control that opens them whole, the reveal every cut chrome title offers (`docs/law/ui-platform-rulings.md`
// §8.2); the heading keeps its whole text as the modal's accessible name either way. A sheet hands in its own words part, because the
// drawer primitive belongs to `SheetDialog` alone (`orb/sheet-via-composite`).

import { DialogTitleText } from "@orb/ui/dialog";
import { InlineAction } from "@orb/ui/inline-action";
import type { ReactElement, RefCallback } from "react";
import { TitleReveal } from "./title-reveal.tsx";
import { useCutPart } from "./use-is-cut.ts";

/** The part that holds a title's words, so the cut reader measures it and the reveal opens it. */
type TitleWordsPart = (props: { readonly ref: RefCallback<HTMLElement>; readonly children: string }) => ReactElement;

interface ModalTitleProps {
  readonly title: string;
  /** The title holds one line at every height, beside a dialog's header actions. @defaultValue false */
  readonly truncate?: boolean;
  /** The words part of a modal that is not a dialog. @defaultValue the dialog's words part */
  readonly words?: TitleWordsPart;
}

function TitleWords({ title, truncate = false, words: Words }: ModalTitleProps): ReactElement {
  const cut = useCutPart();
  return Words === undefined ? (
    <DialogTitleText ref={cut} truncate={truncate}>
      {title}
    </DialogTitleText>
  ) : (
    <Words ref={cut}>{title}</Words>
  );
}

export function ModalTitle(props: ModalTitleProps): ReactElement {
  return (
    // A modal's title can sit at the window's top edge, where a text-height control's centred hit band would run off screen; so the cut
    // title's control stands at the touch floor's block size on a coarse pointer.
    <TitleReveal control={<InlineAction className="min-inline-0" grow={true} step="label" touchFloor="block" type="button" />} whole={props.title}>
      <TitleWords {...props} />
    </TitleReveal>
  );
}
