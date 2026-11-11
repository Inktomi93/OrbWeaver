import type { ReactElement } from "react";
import { Badge } from "#primitives/badge";
import { Check, Icon, TriangleAlert } from "#primitives/icons";
import { toolCallBlockVariants } from "./variants.ts";

// ui-local structural mirror of @orb/contracts/chat's ToolCallRecord — ui never imports contracts.
export interface ToolCallBlockRecord {
  readonly name: string;
  /** The model's raw JSON-string arguments (provenance-faithful — may be malformed). */
  readonly arguments: string;
  /** A parseable JSON document when non-null; `null` = recorded but not executed. */
  readonly result: string | null;
  /** Authoritative for error styling — never inferred from `result`'s shape. */
  readonly isError: boolean;
  readonly durationMs: number | null;
}

export interface ToolCallBlockProps {
  readonly record: ToolCallBlockRecord;
}

// Declared ONCE as an `as const` tuple, the union derived (§7.5 orb/no-inline-union-alias).
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
  // the raw string is returned and ToolCallBlock renders it verbatim
  // in the Arguments and Result `pre` blocks, so malformed JSON is shown, never blank. Ends if either `pre`
  // stops rendering prettyOrRaw's return.
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/**
 * Generic tool-invocation block — the fallback every unregistered tool name falls back to. Three
 * states driven only by the record, never by parsing prose: error, unexecuted (`result === null`), success.
 */
export function ToolCallBlock({ record }: ToolCallBlockProps): ReactElement {
  const slots = toolCallBlockVariants();
  const state = stateOf(record);
  const argumentsText = prettyOrRaw(record.arguments);

  return (
    <details className={slots.root()} data-slot="tool-call-block">
      <summary className={slots.summary()} data-slot="tool-call-block-summary">
        <span className={slots.name()} data-slot="tool-call-block-name">
          {record.name}
        </span>
        <span aria-live="polite" className={slots.status()} data-slot="tool-call-block-status">
          {state === "error" ? (
            <Badge tone="destructive" variant="solid">
              <Icon icon={TriangleAlert} size="xs" /> Error
            </Badge>
          ) : null}
          {state === "unexecuted" ? <Badge>Requested, not run</Badge> : null}
          {state === "success" ? (
            <Badge tone="success" variant="solid">
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
