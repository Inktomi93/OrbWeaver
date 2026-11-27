// What the connection editor says for a write the server did not take. An embedder refusal has its own line (it lands on the
// fact row or the top note). Any other failure is said by the one place that holds its fix: under the field, or on the line
// above the tiers. The editor's mutation declares that line, so no toast repeats it while the editor is open.

import { useState } from "react";
import type { ConnectionFieldRefusal, ConnectionRefusalTarget } from "#lib";
import { connectionEditorRefusalLine, connectionFieldRefusalOf, editorPlacesRefusal, embedRefusalOf } from "#lib";
import type { EditorEmbedRefusal, EditorFailureLineSpec } from "../components/connection-editor-refusal.tsx";

/** The last write the server did not take, other than an embedder refusal: the refusal it was, or none for a failure with
 *  no code, and the draft the refused field showed before it went back to the saved value. */
interface EditorWriteFailure {
  readonly refusal: ConnectionFieldRefusal | null;
  readonly draft: string | null;
}

/** The fields of a patch a refusal can name, so the line quotes what the person typed. */
export interface RefusedPatch {
  readonly label?: string | undefined;
  readonly baseUrl?: string | null | undefined;
  readonly model?: string | undefined;
}

const SAVE_FAILED_LINE = "Couldn't save that connection.";

/** What a refused patch tried to put in the field `target` names. */
function refusedDraft(part: RefusedPatch, target: ConnectionRefusalTarget): string | null {
  if (target === "label") {
    return part.label ?? null;
  }
  if (target === "baseUrl") {
    return part.baseUrl ?? null;
  }
  return target === "model" ? (part.model ?? null) : null;
}

/** The line above the tiers for a failure no field here holds: a refusal for a control the editor lacks (the provider, the
 *  protocol, the saved key, a connection that is gone) or a failure with no code. `null` when a field says it. */
function failureLineOf(failure: EditorWriteFailure | null): EditorFailureLineSpec | null {
  if (failure === null) {
    return null;
  }
  if (failure.refusal === null) {
    return { sentence: SAVE_FAILED_LINE, goesBack: false };
  }
  return editorPlacesRefusal(failure.refusal.target)
    ? null
    : { sentence: connectionEditorRefusalLine(failure.refusal, failure.draft), goesBack: failure.refusal.target === "connection" };
}

export interface EditorWriteFailureState {
  /** The line under the field `target` names for the last failure, else `null`. */
  readonly fieldLine: (target: ConnectionRefusalTarget) => string | null;
  /** What a screen reader hears for a refused field: its line, else nothing. */
  readonly announcement: string;
  /** The line above the tiers, else `null`. `lineKey` changes with every failure, so the line mounts afresh and takes
   *  focus: it can sit above the viewport at a large text size while the person is on a field below. */
  readonly line: EditorFailureLineSpec | null;
  readonly lineKey: string;
  readonly embedRefusal: EditorEmbedRefusal | null;
  /** Counts refused writes: an uncontrolled field keyed on the saved value alone would keep the refused draft, because a
   *  refusal leaves that value unchanged. */
  readonly refusedWrites: number;
  /** A write landed: nothing is refused any more. */
  readonly landed: () => void;
  /** A write failed: say it where its fix is. `factPath` is the fact row an embedder refusal came from. */
  readonly failed: (error: unknown, part: RefusedPatch, factPath: string | null) => void;
}

export function useEditorWriteFailure(): EditorWriteFailureState {
  const [failure, setFailure] = useState<EditorWriteFailure | null>(null);
  const [embedRefusal, setEmbedRefusal] = useState<EditorEmbedRefusal | null>(null);
  const [refusedWrites, setRefusedWrites] = useState(0);
  const [failures, setFailures] = useState(0);

  const fieldLine = (target: ConnectionRefusalTarget): string | null =>
    failure === null || failure.refusal === null || failure.refusal.target !== target ? null : connectionEditorRefusalLine(failure.refusal, failure.draft);

  return {
    fieldLine,
    announcement: fieldLine("baseUrl") ?? fieldLine("label") ?? fieldLine("model") ?? "",
    line: failureLineOf(failure),
    lineKey: String(failures),
    embedRefusal,
    refusedWrites,
    landed: (): void => {
      setEmbedRefusal(null);
      setFailure(null);
    },
    failed: (error, part, factPath): void => {
      const fieldRefused = connectionFieldRefusalOf(error);
      const embedRefused = embedRefusalOf(error);
      setFailures((count) => count + 1);
      setFailure(embedRefused === null ? { refusal: fieldRefused, draft: fieldRefused === null ? null : refusedDraft(part, fieldRefused.target) } : null);
      setEmbedRefusal(embedRefused === null ? null : { refusal: embedRefused, path: factPath });
      if (fieldRefused !== null || embedRefused !== null) {
        setRefusedWrites((count) => count + 1);
      }
    },
  };
}
