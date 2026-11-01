// The staged folder's dry run in the preflight: counts per kind and skip reasons up front, names behind a toggle.

import type { ImportPreview, ImportPreviewKind, ImportPreviewList } from "@orb/contracts/import";
import { IMPORT_PREVIEW_KINDS } from "@orb/contracts/import";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Progress } from "@orb/ui/progress";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { ImportPreviewState } from "../hooks/use-library-import.ts";

const KIND_NOUNS: Readonly<Record<ImportPreviewKind, readonly [one: string, many: string]>> = {
  characters: ["character", "characters"],
  chats: ["chat", "chats"],
  personas: ["persona", "personas"],
  worlds: ["world book", "world books"],
  presets: ["preset", "presets"],
  themes: ["theme", "themes"],
  backgrounds: ["background", "backgrounds"],
  groups: ["group", "groups"],
  orphans: ["character made from chats with no card", "characters made from chats with no card"],
};

function counted(count: number, [one, many]: readonly [string, string]): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function kindLine(kind: ImportPreviewKind, list: ImportPreviewList): string {
  const owned = list.items.filter((item) => item.inLibrary === true).length;
  return owned === 0 ? counted(list.total, KIND_NOUNS[kind]) : `${counted(list.total, KIND_NOUNS[kind])}, ${String(owned)} already in your library`;
}

function namesLine(names: readonly string[], total: number): string {
  const unlisted = total - names.length;
  return unlisted > 0 ? `${names.join(", ")}, and ${String(unlisted)} more` : names.join(", ");
}

/** One line per distinct reason: a broken folder repeats one reason many times. */
function skipLines(skipped: ImportPreview["skipped"]): string[] {
  const counts = new Map<string, number>();
  for (const { reason } of skipped.items) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts].map(([reason, count]) => (count === 1 ? reason : `${reason} (${String(count)})`));
}

function PreviewReport({ preview }: { readonly preview: ImportPreview }): ReactElement {
  const kinds = IMPORT_PREVIEW_KINDS.filter((kind) => preview.kinds[kind].total > 0);
  const { skipped } = preview;
  return (
    <Stack gap="tight" role="group" aria-label="What this import would bring">
      {kinds.length === 0 ? <Text voice="reading">Nothing to import was found in this folder.</Text> : null}
      {kinds.map((kind) => (
        <Text key={kind} voice="reading">
          {kindLine(kind, preview.kinds[kind])}
        </Text>
      ))}
      {skipped.total === 0 ? null : (
        <>
          <Text voice="reading">{`${counted(skipped.total, ["item", "items"])} would be skipped:`}</Text>
          {skipLines(skipped).map((line) => (
            <Text key={line} voice="gloss" className="wrap-anywhere">
              {line}
            </Text>
          ))}
        </>
      )}
      <Collapsible>
        <CollapsibleTrigger>
          <Text as="span" voice="gloss">
            Show names
          </Text>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <Stack gap="tight">
            {kinds.map((kind) => (
              <Text key={kind} voice="gloss" className="wrap-anywhere">
                {`${KIND_NOUNS[kind][1]}: ${namesLine(
                  preview.kinds[kind].items.map((item) => item.name),
                  preview.kinds[kind].total,
                )}`}
              </Text>
            ))}
            {skipped.total === 0 ? null : (
              <Text voice="gloss" className="wrap-anywhere">
                {`skipped: ${namesLine(
                  skipped.items.map((item) => item.source),
                  skipped.total,
                )}`}
              </Text>
            )}
          </Stack>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}

/** Nothing for a pick with no dry run; a failed dry run says so and leaves the import to the reader. */
export function ImportPreviewSummary({ state }: { readonly state: ImportPreviewState }): ReactElement | null {
  switch (state.status) {
    case "off":
      return null;
    case "reading": {
      const { batch, progress } = state;
      const upload = batch.total > 1 ? `Upload ${String(batch.index + 1)} of ${String(batch.total)} — ` : "";
      return <Progress showValue={true} value={progress.pct} label={`${upload}Reading the folder. Nothing is imported yet.`} />;
    }
    case "failed":
      return <Text voice="gloss">{`No preview: ${state.message} You can still import, or cancel.`}</Text>;
    case "ready":
      return <PreviewReport preview={state.preview} />;
  }
}
