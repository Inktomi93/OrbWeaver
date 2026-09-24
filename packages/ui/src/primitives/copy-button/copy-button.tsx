import type { ReactElement } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { ClipboardOutcome } from "#lib";
import { cn, copyActionName, writeClipboardText } from "#lib";
import type { ButtonBaseProps } from "#primitives/button";
import { Button } from "#primitives/button";
import { Check, Copy, Icon } from "#primitives/icons";
import { Text } from "#primitives/text";
import { Textarea } from "#primitives/textarea";
import { copyButtonVariants } from "./variants.ts";

// The manual-copy field scrolls past this many lines, so a whole log never pushes the page away.
const FIELD_MAX_ROWS = 6;

const MANUAL_COPY = "The text is selected below: press Ctrl+C (⌘C on a Mac) to copy it.";

const OUTCOME_MESSAGE: Record<ClipboardOutcome, string> = {
  copied: "Copied.",
  insecure: `This page is on plain http, and the browser only allows copying over HTTPS. ${MANUAL_COPY}`,
  refused: `The browser blocked the copy. ${MANUAL_COPY}`,
};

function statusMessage(outcome: ClipboardOutcome | null, copiedHint: string | undefined): string {
  if (outcome === null) {
    return "";
  }
  return outcome === "copied" && copiedHint !== undefined ? `${OUTCOME_MESSAGE.copied} ${copiedHint}` : OUTCOME_MESSAGE[outcome];
}

export interface CopyButtonProps extends Omit<ButtonBaseProps, "aria-label" | "aria-labelledby" | "children" | "className" | "loading" | "onClick"> {
  /** Exactly what lands on the clipboard. */
  readonly text: string;
  /** What is copied, as the tail of the accessible name `Copy <what>`: "the command claude setup-token". */
  readonly what: string;
  /** A next step read after "Copied." — where to paste it. */
  readonly copiedHint?: string;
  /** Render the glyph alone, for a dense toolbar. The accessible name is the same either way. */
  readonly iconOnly?: boolean;
  /** Placement of the whole control (button, status and manual-copy field) in its parent. */
  readonly className?: string;
}

/**
 * CopyButton — the one copy-to-clipboard control. A press writes `text`, and the always-mounted status
 * line (`role="status"`, polite) says what happened and carries it as `data-outcome`. When the write fails (an insecure http page has no
 * Clipboard API; a browser can refuse), a read-only field shows `text` focused and selected, and the
 * status says to copy it by hand. The button keeps its `Copy <what>` name in every state, so a success
 * swaps the glyph and never the label (§13.10 N2).
 */
export function CopyButton({ text, what, copiedHint, iconOnly = false, className, intent = "secondary", size = "sm", ...rest }: CopyButtonProps): ReactElement {
  // A fresh object per settled press, so a repeat of the same outcome still re-runs the select effect.
  const [settled, setSettled] = useState<{ readonly outcome: ClipboardOutcome } | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  // Counts presses, so a write that settles after a newer press cannot overwrite the newer result.
  const latestPressRef = useRef(0);
  const fieldId = useId();
  const slots = copyButtonVariants();
  const outcome = settled?.outcome ?? null;
  const failed = outcome !== null && outcome !== "copied";

  useEffect(() => {
    if (settled === null || settled.outcome === "copied") {
      return;
    }
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, [settled]);

  const copy = async (): Promise<void> => {
    // Clear first: a live region re-announces only when its text changes, so a second press with the same
    // result must pass through the empty state to be heard again. The click commits this before the write settles.
    latestPressRef.current += 1;
    const press = latestPressRef.current;
    setSettled(null);
    const next = await writeClipboardText(text);
    if (press === latestPressRef.current) {
      setSettled({ outcome: next });
    }
  };

  return (
    <span className={cn(slots.root(), className)} data-slot="copy-button-root">
      <Button aria-label={copyActionName(what)} {...rest} intent={intent} onClick={copy} size={size} type="button">
        <Icon icon={outcome === "copied" ? Check : Copy} size="sm" />
        {iconOnly ? null : "Copy"}
      </Button>
      <Text
        aria-atomic="true"
        aria-live="polite"
        as="span"
        className={slots.status()}
        data-outcome={outcome ?? undefined}
        data-slot="copy-button-status"
        role="status"
        voice="gloss"
      >
        {statusMessage(outcome, copiedHint)}
      </Text>
      {failed ? (
        <Textarea aria-label={what} className={slots.field()} id={fieldId} maxRows={FIELD_MAX_ROWS} readOnly={true} ref={fieldRef} value={text} />
      ) : null}
    </span>
  );
}
