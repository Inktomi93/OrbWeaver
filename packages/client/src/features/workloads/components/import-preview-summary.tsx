// The staged folder's dry run in the preflight: counts per kind and skip reasons up front, names behind a toggle.

import type { ImportPreview, ImportPreviewKind, ImportPreviewSkip } from "@orb/contracts/import";
import { IMPORT_PREVIEW_KINDS } from "@orb/contracts/import";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Stack } from "@orb/ui/layout";
import { Progress } from "@orb/ui/progress";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { RETRY_NAME } from "#lib";
import type { ImportPreviewState } from "../hooks/use-library-import.ts";
import { IMPORT_PREVIEW_HIDE_NAMES, IMPORT_PREVIEW_REPORT_NAME, IMPORT_PREVIEW_SHOW_NAMES, importPreviewProfileLabel } from "../lib/import-library-names.ts";
import { counted, KIND_NOUNS, previewKindLine, previewProfiles } from "../lib/portability-model.ts";

function namesLine(names: readonly string[], total: number): string {
  const unlisted = total - names.length;
  return unlisted > 0 ? `${names.join(", ")}, and ${String(unlisted)} more` : names.join(", ");
}

interface SkipGroup {
  readonly reason: string;
  readonly sources: readonly string[];
}

/** One group per distinct reason: a broken folder repeats one reason many times. */
function skipGroups(skipped: readonly ImportPreviewSkip[]): SkipGroup[] {
  const groups = new Map<string, string[]>();
  for (const { reason, source } of skipped) {
    groups.set(reason, [...(groups.get(reason) ?? []), source.path]);
  }
  return [...groups].map(([reason, sources]) => ({ reason, sources }));
}

/** What the names panel lists: the whole upload (`undefined`, when it holds one profile) or one profile's entries
 *  (`null` for the skips at the upload's root, beside the profiles). */
type NamesScope = string | null | undefined;

function inScope(scope: NamesScope, profile: string | null): boolean {
  return scope === undefined || profile === scope;
}

/** The names of one scope: a line per populated kind, then a line per skip reason. A profile's own lines sit under its label. */
function ScopeNames({
  preview,
  kinds,
  scope,
}: {
  readonly preview: ImportPreview;
  readonly kinds: readonly ImportPreviewKind[];
  readonly scope: NamesScope;
}): ReactElement {
  const lines = (
    <>
      {kinds.map((kind) => {
        const { total, items } = preview.kinds[kind];
        const names = items.filter((item) => inScope(scope, item.source.profile)).map((item) => item.name);
        // A capped list's unlisted tail belongs to no profile, so a profile's line holds only what it names.
        return names.length === 0 ? null : (
          <Text key={kind} voice="gloss" cap="prose" prose={true} wrap="anywhere">
            {`${KIND_NOUNS[kind][1]}: ${namesLine(names, scope === undefined ? total : names.length)}`}
          </Text>
        );
      })}
      {skipGroups(preview.skipped.items.filter((skip) => inScope(scope, skip.source.profile))).map(({ reason, sources }) => (
        <Text key={reason} voice="gloss" cap="prose" prose={true} wrap="anywhere">
          {`Skipped, ${reason}: ${sources.join(", ")}`}
        </Text>
      ))}
    </>
  );
  return typeof scope === "string" ? (
    <Stack gap="tight">
      <Text voice="label" wrap="anywhere">
        {importPreviewProfileLabel(scope)}
      </Text>
      {lines}
    </Stack>
  ) : (
    lines
  );
}

function PreviewReport({ preview }: { readonly preview: ImportPreview }): ReactElement {
  const [namesOpen, setNamesOpen] = useState(false);
  const kinds = IMPORT_PREVIEW_KINDS.filter((kind) => preview.kinds[kind].total > 0);
  const { skipped } = preview;
  const groups = skipGroups(skipped.items);
  const profiles = previewProfiles(preview);
  const scopes: readonly NamesScope[] = profiles.length > 1 ? profiles : [undefined];
  const unlisted = skipped.total - skipped.items.length;
  const namesToggle = namesOpen ? IMPORT_PREVIEW_HIDE_NAMES : IMPORT_PREVIEW_SHOW_NAMES;
  return (
    <Stack gap="tight" role="group" aria-label={IMPORT_PREVIEW_REPORT_NAME}>
      {kinds.map((kind) => (
        <Text key={kind} voice="reading">
          {previewKindLine(kind, preview.kinds[kind])}
        </Text>
      ))}
      {skipped.total === 0 ? null : (
        <>
          <Text voice="reading">{`${counted(skipped.total, ["item", "items"])} would be skipped:`}</Text>
          {groups.map(({ reason, sources }) => (
            <Text key={reason} voice="reading" wrap="anywhere">
              {sources.length === 1 ? reason : `${reason} (${String(sources.length)})`}
            </Text>
          ))}
        </>
      )}
      {kinds.length === 0 && skipped.total === 0 ? null : (
        <Collapsible open={namesOpen} onOpenChange={setNamesOpen}>
          <CollapsibleTrigger>{namesToggle}</CollapsibleTrigger>
          <CollapsiblePanel>
            <Stack gap="tight">
              {scopes.map((scope) => (
                <ScopeNames key={scope ?? ""} preview={preview} kinds={kinds} scope={scope} />
              ))}
              {scopes.length > 1
                ? kinds
                    .filter((kind) => preview.kinds[kind].total > preview.kinds[kind].items.length)
                    .map((kind) => (
                      <Text key={kind} voice="gloss" cap="prose" prose={true} wrap="anywhere">
                        {`And ${String(preview.kinds[kind].total - preview.kinds[kind].items.length)} more ${KIND_NOUNS[kind][1]}.`}
                      </Text>
                    ))
                : null}
              {unlisted > 0 ? (
                <Text voice="gloss" cap="prose" prose={true} wrap="anywhere">
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
      const upload = batch.total > 1 ? `Upload ${String(batch.index + 1)} of ${String(batch.total)}: ` : "";
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
              {RETRY_NAME}
            </Button>
          </Row>
        </Stack>
      );
    case "ready":
      return <PreviewReport preview={state.preview} />;
  }
}
