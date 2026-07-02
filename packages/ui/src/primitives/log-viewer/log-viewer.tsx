import type { ReactElement } from "react";
import { useLayoutEffect, useRef } from "react";
import { cn } from "#lib";
import { Button } from "#primitives/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve AlertTriangle/CircleAlert/Copy/Icon/Info fine (the spinner.tsx precedent).
import { AlertTriangle, CircleAlert, Copy, Icon, Info } from "#primitives/icons";
import { logViewerVariants } from "./variants";

// Levels declared ONCE as an `as const` tuple, union derived (§7.5 no-inline-union-redecl); both
// stay local — consumers name it via `LogLine["level"]` on the object form.
const LOG_LEVELS = ["info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_GLYPH: Record<LogLevel, typeof Info> = {
  info: Info,
  warn: AlertTriangle,
  error: CircleAlert,
};

// The glyph doubles as the accessible name for the level (Icon's `label` prop) — a second,
// non-visual signal alongside the intent-token color for the "never color alone" contract.
const LEVEL_LABEL: Record<LogLevel, string> = {
  info: "Info",
  warn: "Warning",
  error: "Error",
};

/**
 * A single log line: a plain string (unleveled, the common case) or `{ text, level }` for the
 * leveled treatment. Arrays may freely mix both forms.
 */
export type LogLine = string | { readonly text: string; readonly level?: LogLevel };

function textOf(line: LogLine): string {
  return typeof line === "string" ? line : line.text;
}

function levelOf(line: LogLine): LogLevel | undefined {
  return typeof line === "string" ? undefined : line.level;
}

export interface LogViewerProps {
  readonly lines: readonly LogLine[];
  /** Cap the rendered window to the most recent N lines — a display cap; the caller owns the full log. */
  readonly maxLines?: number;
  readonly className?: string;
}

/**
 * LogViewer — a read-only monospace line panel (ui-package-design item 12). NOT the code-editor
 * seal: no editing, no CodeMirror, just lines. Pinned-to-bottom autoscroll on append, a
 * copy-to-clipboard affordance, and a `level` glyph+intent-token pair per line (never color
 * alone).
 *
 * The scrollable line region carries `role="log"` + `aria-live="polite"` — the streaming-log
 * accessibility contract (assistive tech announces new lines as they arrive).
 *
 * Usage: `<LogViewer lines={logLines} maxLines={256} className="h-64" />`
 */
export function LogViewer({ lines, maxLines, className }: LogViewerProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visible = maxLines === undefined ? lines : lines.slice(-maxLines);
  const slots = logViewerVariants();
  // The "did the rendered content actually change" guard — content, not just re-render, drives
  // the scroll (a signature over length + last line beats deep-comparing the whole array).
  const lastLine = visible.at(-1);
  const contentSignature = `${visible.length}:${lastLine === undefined ? "" : textOf(lastLine)}`;
  const previousSignatureRef = useRef<string | null>(null);

  // Pinned-to-bottom autoscroll: every append re-scrolls the line region to its new bottom.
  // No dependency array (runs every commit) + an internal signature guard, since the effect body
  // itself doesn't reference `visible`/`contentSignature` directly (exhaustive-deps would flag
  // them as unused deps otherwise). `behavior` passed explicitly to `scrollTo` overrides the
  // global reduced-motion CSS floor (styles/globals.css forces `scroll-behavior: auto` only for
  // CSS-triggered scrolls), so the reduced-motion check happens here via `matchMedia` directly.
  useLayoutEffect(() => {
    if (previousSignatureRef.current === contentSignature) {
      return;
    }
    previousSignatureRef.current = contentSignature;
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    const reducedMotion = globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
  });

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(visible.map(textOf).join("\n"));
  };

  return (
    <div className={cn(slots.root(), className)}>
      <div className={slots.toolbar()}>
        <Button type="button" intent="ghost" size="sm" onClick={handleCopy}>
          <Icon icon={Copy} size="sm" label="Copy log" />
        </Button>
      </div>
      <div ref={scrollRef} role="log" aria-live="polite" className={slots.scroll()}>
        {visible.map((line, index) => {
          const level = levelOf(line);
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: an append-only log tail (lines are never reordered/removed from the middle) — position is a stable identity.
              key={index}
              data-log-line=""
              data-level={level}
              className={slots.line({ level })}
            >
              {level === undefined ? null : (
                <Icon
                  icon={LEVEL_GLYPH[level]}
                  size="sm"
                  label={LEVEL_LABEL[level]}
                  className={slots.glyph()}
                />
              )}
              <span>{textOf(line)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
