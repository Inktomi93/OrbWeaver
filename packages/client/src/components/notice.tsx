// The one notice: a status box inside a surface that states one condition, what it means and what to do, with an optional
// way to act on it. A feature passes words and buttons; the box, the glyph, the voices and their order are drawn here, so a
// warning reads the same in every pane.
//
// - The tone picks the glyph from one total map, so a tone never appears with a stray glyph or none, and a new tone fails
//   `tsc` until it names its glyph.
// - The actions sit under the text, start-aligned, never at the far end of a line: a long title wraps and the recovery stays
//   beside the sentence it answers.
// - A dismiss is the one control in the corner, because it removes the box itself rather than acting on its condition.
// - A Card is the box because a status box is the one read-only box the density law allows: its tone edge carries the
//   meaning (UI-Density-Law §4.3, the Card `variant` row).

import { Card } from "@orb/ui/card";
import { GlyphButton } from "@orb/ui/glyph-button";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon, Info, TriangleAlert, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Tip } from "./tip.tsx";

const NOTICE_TONES = ["neutral", "info", "warning"] as const;
type NoticeTone = (typeof NOTICE_TONES)[number];

const NOTICE_GLYPH: Record<NoticeTone, LucideIcon> = {
  neutral: Info,
  info: Info,
  warning: TriangleAlert,
};

interface NoticeDismiss {
  /** The control's accessible name, which says what dismissing removes. */
  readonly name: string;
  /** The tooltip that says what the screen does once the notice is gone. */
  readonly hint: string;
  readonly onDismiss: () => void;
}

export interface NoticeProps extends Omit<ComponentProps<"div">, "className" | "children" | "title" | "style"> {
  readonly tone: NoticeTone;
  /** The one sentence that states the condition. */
  readonly title: string;
  /** The quieter lines under it: the server's own words, then what to do. */
  readonly detail?: readonly string[];
  /** The buttons that act on the condition, under the text. */
  readonly action?: ReactNode;
  readonly dismiss?: NoticeDismiss;
  /** The text is announced when it appears: the notice reports a failure that arrived after the reader acted. */
  readonly alert?: boolean;
}

const NO_DETAIL: readonly string[] = [];

export function Notice({ tone, title, detail = NO_DETAIL, action, dismiss, alert = false, ...rest }: NoticeProps): ReactElement {
  return (
    <Card {...rest} tone={tone} variant="soft">
      <Row align="start" data-slot="notice" gap="field">
        <Icon icon={NOTICE_GLYPH[tone]} size="sm" tone={tone} />
        <Stack className="min-inline-0" gap="tight" grow={true} {...(alert ? { role: "alert" } : {})}>
          <Text cap="prose" data-slot="notice-title" prose={true} voice="label" wrap="anywhere">
            {title}
          </Text>
          {detail.map((line) => (
            <Text cap="prose" key={line} prose={true} voice="gloss">
              {line}
            </Text>
          ))}
          {action === undefined ? null : (
            <Row data-slot="notice-actions" gap="field" wrap={true}>
              {action}
            </Row>
          )}
        </Stack>
        {dismiss === undefined ? null : (
          <Tip text={dismiss.hint}>
            <GlyphButton aria-label={dismiss.name} glyph="sm" onClick={dismiss.onDismiss} variant="ghost">
              <Icon icon={X} size="xs" />
            </GlyphButton>
          </Tip>
        )}
      </Row>
    </Card>
  );
}
