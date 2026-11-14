// The custom-schema save REFUSAL, rendered as the belt's teaching SENTENCES (schema-editor-dialog.tsx's
// three-tier raw door, tier 1). A belt refusal reaches the client as a tRPC input-validation rejection
// whose `.message` is the ZodError's SERIALIZED ISSUE ARRAY — so the carefully-worded belt sentence
// arrives wrapped in brackets, escaped quotes and JSON keys (live-drive D3 2026-08-14). This pulls each
// issue's own `.message` back out, and a bound refusal code reads as its sentence; a non-JSON message (any other
// rejection) renders verbatim, one line per line the server wrote.
import { isPlainObject } from "@orb/kit/guards";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId } from "#lib";
import { refusalSentenceOf } from "../lib/schema-draft.ts";

/** The teaching sentences carried by a refusal — one per belt issue, or the raw message as a single line. */
function refusalLines(error: unknown): readonly string[] {
  const message = isPlainObject(error) ? error["message"] : undefined;
  const raw = typeof message === "string" ? message : "That schema was refused.";
  // a non-JSON message falls through to the line split after the
  // try, and RefusalNote below renders every returned line in a Text. Ends if either the fallback return or that render goes.
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const lines = parsed
        .map((issue) =>
          typeof issue === "object" && issue !== null && typeof (issue as { message?: unknown }).message === "string"
            ? (issue as { message: string }).message
            : null,
        )
        .filter((line): line is string => line !== null);
      if (lines.length > 0) {
        return lines.map(refusalSentenceOf);
      }
    }
  } catch {
    // Not a serialized issue array — render the message verbatim below.
  }
  return raw.split("\n").map(refusalSentenceOf);
}

/** A save refusal, one teaching sentence per belt issue (never the raw serialized zod array). */
export function RefusalNote({ error }: { error: unknown }): ReactElement | null {
  if (error === null || error === undefined) {
    return null;
  }
  return (
    <Stack data-testid={testId("refinerySchemaRefusal")} gap="tight">
      {refusalLines(error).map((line) => (
        <Text key={line} role="alert" voice="gloss">
          {line}
        </Text>
      ))}
    </Stack>
  );
}
