// The staged folder's dry run in the preflight: counts per kind and skip reasons up front, names behind a toggle.

import type { ImportPreview, ImportPreviewKind, ImportPreviewList } from "@orb/contracts/import";
import { IMPORT_PREVIEW_KINDS } from "@orb/contracts/import";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Stack } from "@orb/ui/layout";
import { Progress } from "@orb/ui/progress";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { ImportPreviewState } from "../hooks/use-library-import.ts";
import { IMPORT_PREVIEW_RETRY_NAME } from "../lib/portability-model.ts";

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
  const bare = list.items.filter((item) => item.withoutArt === true).length;
  const notes = [...(owned === 0 ? [] : [`${String(owned)} already in your library`]), ...(bare === 0 ? [] : [`${String(bare)} will import without art`])];
  return [counted(list.total, KIND_NOUNS[kind]), ...notes].join(", ");
}

function namesLine(names: readonly string[], total: number): string {
  const unlisted = total - names.length;
  return unlisted > 0 ? `${names.join(", ")}, and ${String(unlisted)} more` : names.join(", ");
}

interface SkipGroup {
  readonly reason: string;
  readonly sources: readonly string[];
}

/** One group per distinct reason: a broken folder repeats one reason many times. */
function skipGroups(skipped: ImportPreview["skipped"]): SkipGroup[] {
  const groups = new Map<string, string[]>();
  for (const { reason, source } of skipped.items) {
    groups.set(reason, [...(groups.get(reason) ?? []), source]);
  }
  return [...groups].map(([reason, sources]) => ({ reason, sources }));
}

function PreviewReport({ preview }: { readonly preview: ImportPreview }): ReactElement {
  const [namesOpen, setNamesOpen] = useState(false);
  const kinds = IMPORT_PREVIEW_KINDS.filter((kind) => preview.kinds[kind].total > 0);
  const { skipped } = preview;
  const groups = skipGroups(skipped);
  const unlisted = skipped.total - skipped.items.length;
  return (
    <Stack gap="tight" role="group" aria-label="What this import would bring">
      {kinds.map((kind) => (
        <Text key={kind} voice="reading">
          {kindLine(kind, preview.kinds[kind])}
        </Text>
      ))}
      {skipped.total === 0 ? null : (
        <>
          <Text voice="reading">{`${counted(skipped.total, ["item", "items"])} would be skipped:`}</Text>
          {groups.map(({ reason, sources }) => (
            <Text key={reason} voice="gloss" wrap="anywhere">
              {sources.length === 1 ? reason : `${reason} (${String(sources.length)})`}
            </Text>
          ))}
        </>
      )}
      {kinds.length === 0 && skipped.total === 0 ? null : (
        <Collapsible open={namesOpen} onOpenChange={setNamesOpen}>
          <CollapsibleTrigger>{namesOpen ? "Hide names" : "Show names"}</CollapsibleTrigger>
          <CollapsiblePanel>
            <Stack gap="tight">
              {kinds.map((kind) => (
                <Text key={kind} voice="gloss" wrap="anywhere">
                  {`${KIND_NOUNS[kind][1]}: ${namesLine(
                    preview.kinds[kind].items.map((item) => item.name),
                    preview.kinds[kind].total,
                  )}`}
                </Text>
              ))}
              {groups.map(({ reason, sources }) => (
                <Text key={reason} voice="gloss" wrap="anywhere">
                  {`Skipped, ${reason}: ${sources.join(", ")}`}
                </Text>
              ))}
              {unlisted > 0 ? (
                <Text voice="gloss" wrap="anywhere">
                  {`And ${String(unlisted)} more skipped.`}
                </Text>
              ) : null}
            </Stack>
          </CollapsiblePanel>
        </Collapsible>
      )}
    </Stack>
  );
}

/** Nothing for a pick with no dry run; a failed dry run says so and leaves the import to the reader. */
export function ImportPreviewSummary({ state, onRetry }: { readonly state: ImportPreviewState; readonly onRetry: () => void }): ReactElement | null {
  switch (state.status) {
    case "off":
      return null;
    case "reading": {
      const { batch, progress } = state;
      const upload = batch.total > 1 ? `Upload ${String(batch.index + 1)} of ${String(batch.total)} — ` : "";
      return <Progress showValue={true} value={progress.pct} label={`${upload}Reading the folder. Nothing is imported yet.`} />;
    }
    case "failed":
      return (
        <Stack gap="tight">
          <Text voice="reading" tone="destructive" role="status">
            {`No preview. ${state.message} You can still import, or try again.`}
          </Text>
          <Row justify="start">
            <Button variant="outline" onClick={onRetry}>
              {IMPORT_PREVIEW_RETRY_NAME}
            </Button>
          </Row>
        </Stack>
      );
    case "ready":
      return <PreviewReport preview={state.preview} />;
  }
}
