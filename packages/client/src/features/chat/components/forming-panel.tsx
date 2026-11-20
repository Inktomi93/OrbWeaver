// One complete panel of a reply still streaming, drawn in its own routed frame under the forming cap (D354): static, no
// external media, its scripts left for the settled reply's frame. The chip stands in until its document draws, and
// whenever it cannot: a forming frame has no inert fallback, because the settled reply decides how its bytes draw.

import type { ReactElement } from "react";
import { FormingChip } from "#components";
import { REPLY_PANEL_FORMING_TITLE } from "../lib/reply-frame-names.ts";
import type { ReplyRunStyles } from "../lib/reply-parts.ts";
import type { CardOrigin } from "./card-block.tsx";
import { ReplyFrame } from "./reply-frame.tsx";

export interface FormingPanelProps {
  /** The panel's bytes, final under append (`scanFormingPanels`). */
  readonly markup: string;
  readonly styles: ReplyRunStyles;
  readonly cardOrigin: CardOrigin;
  readonly speakerName: string | undefined;
  readonly colorQuotes: boolean;
}

export function FormingPanel({ markup, styles, cardOrigin, speakerName, colorQuotes }: FormingPanelProps): ReactElement {
  const chip = <FormingChip title={REPLY_PANEL_FORMING_TITLE} />;
  return (
    <ReplyFrame
      segments={[{ kind: "markdown", markdown: markup, tokens: undefined }]}
      styles={styles}
      colorQuotes={colorQuotes}
      cardOrigin={cardOrigin}
      speakerName={speakerName}
      held={chip}
      fallback={chip}
      forming={true}
    />
  );
}
