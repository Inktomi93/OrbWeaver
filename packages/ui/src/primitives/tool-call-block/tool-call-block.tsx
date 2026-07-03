import type { ReactElement } from "react";
import { cn } from "#lib";
import { Badge } from "#primitives/badge";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Check/AlertTriangle/Icon fine.
import { AlertTriangle, Check, Icon } from "#primitives/icons";
import { toolCallBlockVariants } from "./variants";

/**
 * The ui-local structural mirror of `@orb/contracts/chat`'s `ToolCallRecord` (tool-use-design/03
 * §3) — ui never imports contracts (ui-package-design §1), so this is the shape, not the type.
 */
export interface ToolCallBlockRecord {
  readonly toolCallId: string;
  readonly name: string;
  /** The model's raw JSON-string arguments (provenance-faithful — may be malformed). */
  readonly arguments: string;
  /** A parseable JSON document when non-null; `null` = recorded but not executed (03 §2.2). */
  readonly result: string | null;
  /** Authoritative for error styling — never inferred from `result`'s shape (03 §4 MAY #4). */
  readonly isError: boolean;
  readonly durationMs: number | null;
}

export interface ToolCallBlockProps {
  readonly record: ToolCallBlockRecord;
  /** Initial open state of the native `<details>` — the browser owns toggling after mount. */
  readonly defaultOpen?: boolean;
  readonly className?: string;
}

// Declared ONCE as an `as const` tuple, the union derived (§7.5 no-inline-union-redecl).
const TOOL_CALL_STATES = ["error", "success", "unexecuted"] as const;
type ToolCallState = (typeof TOOL_CALL_STATES)[number];

function stateOf(record: ToolCallBlockRecord): ToolCallState {
  if (record.isError) {
    return "error";
  }
  if (record.result === null) {
    return "unexecuted";
  }
  return "success";
}

/** Attempt `JSON.parse` + pretty-print; on failure return the raw string verbatim — NEVER blank. */
function prettyOrRaw(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/**
 * The generic tool-invocation block (D48; tool-use-design/03 §4 + 05 §T7) — the `TOOL_RENDERERS`
 * fallback every unregistered tool name falls back to (the registry itself is client/features
 * wiring, not shipped here). THREE states, driven ONLY by the record — never by parsing prose (03
 * §4 MAY-NOT #1):
 * - `isError: true` → error styling (danger token + icon).
 * - `result === null` → neutral "requested, not run" badge (recorded but the recurse-limit or an
 *   abort meant it never ran, 03 §2.2).
 * - else → success.
 *
 * Arguments and (when present) the result document are independently `JSON.parse`d for pretty-
 * printing; a parse failure falls back to the raw string rather than going blank (03 §4 MAY-NOT
 * #2 — the same rule for both fields, since either can carry a malformed provenance string).
 *
 * Usage: `<ToolCallBlock record={toolCallRecord} />`
 */
export function ToolCallBlock({
  record,
  defaultOpen,
  className,
}: ToolCallBlockProps): ReactElement {
  const slots = toolCallBlockVariants();
  const state = stateOf(record);
  const argumentsText = prettyOrRaw(record.arguments);

  return (
    <details className={cn(slots.root(), className)} data-slot="tool-call-block" open={defaultOpen}>
      <summary className={slots.summary()} data-slot="tool-call-block-summary">
        <span className={slots.name()} data-slot="tool-call-block-name">
          {record.name}
        </span>
        <span aria-live="polite" className={slots.status()} data-slot="tool-call-block-status">
          {state === "error" ? (
            <Badge intent="danger">
              <Icon icon={AlertTriangle} size="xs" /> Error
            </Badge>
          ) : null}
          {state === "unexecuted" ? <Badge intent="neutral">Requested, not run</Badge> : null}
          {state === "success" ? (
            <Badge intent="success">
              <Icon icon={Check} size="xs" /> Success
            </Badge>
          ) : null}
        </span>
        {record.durationMs !== null ? (
          <span className={slots.duration()} data-slot="tool-call-block-duration">
            {record.durationMs}ms
          </span>
        ) : null}
      </summary>
      <div className={slots.body()} data-slot="tool-call-block-body">
        <div className={slots.section()} data-slot="tool-call-block-section">
          <h4 className={slots.sectionLabel()} data-slot="tool-call-block-section-label">
            Arguments
          </h4>
          <pre className={slots.pre()} data-slot="tool-call-block-pre">
            {argumentsText}
          </pre>
        </div>
        {record.result !== null ? (
          <div className={slots.section()} data-slot="tool-call-block-section">
            <h4 className={slots.sectionLabel()} data-slot="tool-call-block-section-label">
              {record.isError ? "Error" : "Result"}
            </h4>
            <pre className={slots.pre()} data-slot="tool-call-block-pre">
              {prettyOrRaw(record.result)}
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}
