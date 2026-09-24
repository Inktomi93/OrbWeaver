import type { ComponentProps, ReactElement, ReactNode, RefObject } from "react";
import { createContext, use, useEffect, useId, useRef, useState } from "react";
import type { ClipboardOutcome } from "#lib";
import { cn, coarsePointerNow, copyActionName, writeClipboardText } from "#lib";
import type { ButtonBaseProps } from "#primitives/button";
import { Button } from "#primitives/button";
import { Check, Copy, Icon } from "#primitives/icons";
import { Text } from "#primitives/text";
import { Textarea } from "#primitives/textarea";
import { copyButtonVariants } from "./variants.ts";

// The manual-copy field scrolls past this many lines in a row, so a long text never pushes the page away.
const FIELD_MAX_ROWS = 6;

const COPIED = "Copied.";

const FAILURE_REASON: Record<Exclude<ClipboardOutcome, "copied">, string> = {
  insecure: "This page is on plain http, and the browser only allows copying over HTTPS.",
  refused: "The browser blocked the copy.",
};

// A touch screen has no copy shortcut; the selection handles and the system Copy item are the way in.
const MANUAL_COPY_KEYBOARD = "The text is selected: press Ctrl+C (⌘C on a Mac) to copy it.";
const MANUAL_COPY_TOUCH = "The text is selected: press and hold it, then tap Copy.";

/** One settled press. A fresh object per press, so a repeat of the same outcome re-runs the select effect. */
interface CopySettled {
  readonly outcome: ClipboardOutcome;
  /** Read once when the press settles: which manual-copy instruction fits the pointer in use. */
  readonly coarse: boolean;
}

interface CopyContextValue {
  readonly text: string;
  readonly what: string;
  readonly copiedHint: string | undefined;
  readonly settled: CopySettled | null;
  readonly copy: () => void;
  readonly fieldRef: RefObject<HTMLTextAreaElement | null>;
  readonly statusId: string;
}

const CopyContext = createContext<CopyContextValue | null>(null);

function useCopyContext(part: string): CopyContextValue {
  const context = use(CopyContext);
  if (context === null) {
    throw new Error(`${part} must be rendered inside CopyButtonRoot`);
  }
  return context;
}

function isFailed(settled: CopySettled | null): boolean {
  return settled !== null && settled.outcome !== "copied";
}

/** The root's `data-state`: `failed` is the state a consumer lays out for (the fallback takes a full line). */
function stateOf(settled: CopySettled | null): "idle" | "copied" | "failed" {
  if (settled === null) {
    return "idle";
  }
  return settled.outcome === "copied" ? "copied" : "failed";
}

export interface CopyButtonRootProps extends ComponentProps<"div"> {
  /** Exactly what lands on the clipboard. */
  readonly text: string;
  /** What is copied, as the tail of the accessible name `Copy <what>`: "the command claude setup-token". */
  readonly what: string;
  /** A next step read to screen readers after "Copied." (where to paste it). It is never painted, so a
   *  success cannot reflow the row. */
  readonly copiedHint?: string;
  /** Copy once on mount: for text the user must take now, such as a one-time link. */
  readonly autoCopy?: boolean;
}

/**
 * CopyButtonRoot — owns one copy's state for its parts, and stamps it as `data-state` (`idle`, `copied`,
 * `failed`). Compose the parts directly when the fallback must take a region the simple {@link CopyButton}
 * does not own (the log viewer's body); otherwise use {@link CopyButton}.
 */
export function CopyButtonRoot({ text, what, copiedHint, autoCopy = false, children, ...rest }: CopyButtonRootProps): ReactElement {
  const [settled, setSettled] = useState<CopySettled | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  // Counts presses, so a write that settles after a newer press cannot overwrite the newer result.
  const latestPressRef = useRef(0);
  const autoCopiedRef = useRef(false);
  const statusId = useId();

  const write = (): void => {
    latestPressRef.current += 1;
    const press = latestPressRef.current;
    writeClipboardText(text, (outcome) => {
      if (press === latestPressRef.current) {
        setSettled({ outcome, coarse: coarsePointerNow() });
      }
    });
  };

  const copy = (): void => {
    // Clear first: a live region re-announces only when its text changes, so a repeat of the same result
    // must pass through the empty state to be heard again.
    setSettled(null);
    write();
  };

  useEffect(() => {
    if (settled === null || settled.outcome === "copied") {
      return;
    }
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, [settled]);

  useEffect(() => {
    // The ref keeps the one-time copy to one write when a development remount runs the effect twice.
    if (!autoCopy || autoCopiedRef.current) {
      return;
    }
    autoCopiedRef.current = true;
    write();
  });

  return (
    <CopyContext value={{ text, what, copiedHint, settled, copy, fieldRef, statusId }}>
      <div data-slot="copy-button-root" data-state={stateOf(settled)} {...rest}>
        {children}
      </div>
    </CopyContext>
  );
}

export interface CopyButtonTriggerProps extends Omit<ButtonBaseProps, "aria-label" | "aria-labelledby" | "children" | "loading" | "onClick"> {
  /** Render the glyph alone, for a dense toolbar. The accessible name is the same either way. */
  readonly iconOnly?: boolean;
}

/** The press. Its name is `Copy <what>` in every state, so a success swaps the glyph, never the label (§13.10 N2). */
export function CopyButtonTrigger({ iconOnly = false, intent = "secondary", size = "sm", ...rest }: CopyButtonTriggerProps): ReactElement {
  const { what, settled, copy } = useCopyContext("CopyButtonTrigger");
  return (
    <Button aria-label={copyActionName(what)} {...rest} intent={intent} onClick={copy} size={size} type="button">
      <Icon icon={settled?.outcome === "copied" ? Check : Copy} size="sm" />
      {iconOnly ? null : "Copy"}
    </Button>
  );
}

/** The always-mounted polite live region. It carries the outcome as `data-outcome`. Place it on the side
 *  of the trigger away from the row's anchor, so its text grows away from the button. */
export function CopyButtonStatus({ className }: { readonly className?: string }): ReactElement {
  const { copiedHint, settled, statusId } = useCopyContext("CopyButtonStatus");
  const slots = copyButtonVariants();
  return (
    <Text
      aria-atomic="true"
      aria-live="polite"
      as="span"
      className={cn(slots.status(), className)}
      data-outcome={settled?.outcome}
      data-slot="copy-button-status"
      id={statusId}
      role="status"
      voice="gloss"
    >
      <StatusMessage copiedHint={copiedHint} settled={settled} />
    </Text>
  );
}

function StatusMessage({ settled, copiedHint }: { readonly settled: CopySettled | null; readonly copiedHint: string | undefined }): ReactNode {
  const slots = copyButtonVariants();
  if (settled === null) {
    return null;
  }
  if (settled.outcome === "copied") {
    return (
      <>
        {COPIED}
        {copiedHint === undefined ? null : <span className={slots.hint()}> {copiedHint}</span>}
      </>
    );
  }
  return `${FAILURE_REASON[settled.outcome]} ${settled.coarse ? MANUAL_COPY_TOUCH : MANUAL_COPY_KEYBOARD}`;
}

/** The visible form of the text (a command chip, a link). The manual-copy field replaces it while a copy
 *  has failed, so the text never shows twice. Adds no box: its wrapper is `display: contents`. */
export function CopyButtonSubject({ children }: { readonly children: ReactNode }): ReactElement {
  const { settled } = useCopyContext("CopyButtonSubject");
  const slots = copyButtonVariants();
  return (
    <div className={slots.subject()} data-slot="copy-button-subject" hidden={isFailed(settled)}>
      {children}
    </div>
  );
}

export interface CopyButtonFallbackProps {
  readonly className?: string;
  /** The field's height ceiling in lines. Omit it when the field fills a bounded region instead. */
  readonly maxRows?: number;
}

/** The manual-copy field: read-only, holding exactly the copied text, focused and selected while a copy has
 *  failed, and described by the status that says why. Rendered only in the failed state. */
export function CopyButtonFallback({ className, maxRows }: CopyButtonFallbackProps): ReactElement | null {
  const { text, what, settled, fieldRef, statusId } = useCopyContext("CopyButtonFallback");
  const slots = copyButtonVariants();
  // An id (not only the aria-label) is what Chrome's form-field identity audit accepts.
  const fieldId = useId();
  if (!isFailed(settled)) {
    return null;
  }
  return (
    <Textarea
      aria-describedby={statusId}
      aria-label={what}
      className={cn(slots.field(), className) ?? ""}
      id={fieldId}
      readOnly={true}
      ref={fieldRef}
      value={text}
      {...(maxRows === undefined ? {} : { maxRows })}
    />
  );
}

export type CopyButtonProps = Pick<CopyButtonRootProps, "autoCopy" | "className" | "copiedHint" | "text" | "what"> &
  Omit<CopyButtonTriggerProps, "className"> & {
    /** The visible form of the text. The manual-copy field replaces it on a failed copy. */
    readonly children?: ReactNode;
  };

/**
 * CopyButton — the one copy-to-clipboard control: the subject (the visible text), the press, and the polite
 * status, in one wrapping row. A press writes `text`. When the write fails (an insecure http page has no
 * Clipboard API; a browser can refuse), a read-only field on its own full-width line replaces the subject,
 * focused and selected, and the status says how to copy it by hand.
 */
export function CopyButton({ text, what, copiedHint, autoCopy, className, children, ...trigger }: CopyButtonProps): ReactElement {
  const slots = copyButtonVariants();
  return (
    <CopyButtonRoot
      className={cn(slots.root(), className)}
      text={text}
      what={what}
      {...(copiedHint === undefined ? {} : { copiedHint })}
      {...(autoCopy === undefined ? {} : { autoCopy })}
    >
      {children === undefined ? null : <CopyButtonSubject>{children}</CopyButtonSubject>}
      <CopyButtonFallback maxRows={FIELD_MAX_ROWS} />
      <CopyButtonTrigger {...trigger} />
      <CopyButtonStatus />
    </CopyButtonRoot>
  );
}
