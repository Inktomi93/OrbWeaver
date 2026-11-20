// A dry run in a preflight: counts per kind and skip reasons up front, names behind a toggle. The import's staged folder
// and the SillyTavern export both render through the one layout here, so the two previews read alike.

import type { ImportPreview, ImportPreviewKind, ImportPreviewSkip } from "@orb/contracts/import";
import { IMPORT_PREVIEW_KINDS } from "@orb/contracts/import";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Stack } from "@orb/ui/layout";
import { Progress } from "@orb/ui/progress";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useState } from "react";
import { RETRY_NAME } from "#lib";
import type { ImportPreviewState } from "../hooks/use-library-import.ts";
import type { StExportPreviewState } from "../hooks/use-st-export-preview.ts";
import { IMPORT_PREVIEW_HIDE_NAMES, IMPORT_PREVIEW_REPORT_NAME, IMPORT_PREVIEW_SHOW_NAMES, importPreviewProfileLabel } from "../lib/import-library-names.ts";
import { counted, KIND_NOUNS, previewKindLine, previewPresetDetailLines, previewProfiles } from "../lib/portability-model.ts";
import type { PreviewLine, PreviewReasonGroup } from "../lib/st-export-model.ts";
import { stExportKindLines, stExportLeftGroups, stExportNameLines } from "../lib/st-export-model.ts";
import { ST_EXPORT_PREVIEW_FAILED, ST_EXPORT_READING, ST_EXPORT_REPORT_NAME } from "../lib/st-export-names.ts";

function namesLine(names: readonly string[], total: number): string {
  const unlisted = total - names.length;
  return unlisted > 0 ? `${names.join(", ")}, and ${String(unlisted)} more` : names.join(", ");
}

/** One group per distinct reason: a broken folder repeats one reason many times. */
function skipGroups(skipped: readonly ImportPreviewSkip[]): PreviewReasonGroup[] {
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
        const listed = items.filter((item) => inScope(scope, item.source.profile));
        const names = listed.map((item) => item.name);
        // A capped list's unlisted tail belongs to no profile, so a profile's line holds only what it names.
        return names.length === 0 ? null : (
          <Fragment key={kind}>
            <Text voice="gloss" cap="prose" prose={true} wrap="anywhere">
              {`${KIND_NOUNS[kind][1]}: ${namesLine(names, scope === undefined ? total : names.length)}`}
            </Text>
            {listed.flatMap((item) =>
              previewPresetDetailLines(item).map((line) => (
                <Text key={`${item.sourceDigest}-${line}`} voice="gloss" cap="prose" prose={true} wrap="anywhere">
                  {line}
                </Text>
              )),
            )}
          </Fragment>
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

// The shared layout: a line per kind, the reasons entries stay behind, and the names behind a toggle.
function PreviewLayout({
  label,
  lines,
  skipped,
  names,
}: {
  readonly label: string;
  readonly lines: readonly PreviewLine[];
  readonly skipped: { readonly heading: string; readonly groups: readonly PreviewReasonGroup[] } | null;
  readonly names: ReactNode;
}): ReactElement {
  const [namesOpen, setNamesOpen] = useState(false);
  const namesToggle = namesOpen ? IMPORT_PREVIEW_HIDE_NAMES : IMPORT_PREVIEW_SHOW_NAMES;
  return (
    <Stack gap="tight" role="group" aria-label={label}>
      {lines.map(({ key, text }) => (
        <Text key={key} voice="reading">
          {text}
        </Text>
      ))}
      {skipped === null ? null : (
        <>
          <Text voice="reading">{skipped.heading}</Text>
          {skipped.groups.map(({ reason, sources }) => (
            <Text key={reason} voice="reading" wrap="anywhere">
              {sources.length === 1 ? reason : `${reason} (${String(sources.length)})`}
            </Text>
          ))}
        </>
      )}
      {lines.length === 0 && skipped === null ? null : (
        <Collapsible open={namesOpen} onOpenChange={setNamesOpen}>
          <CollapsibleTrigger>{namesToggle}</CollapsibleTrigger>
          <CollapsiblePanel>
            <Stack gap="tight">{names}</Stack>
          </CollapsiblePanel>
        </Collapsible>
      )}
    </Stack>
  );
}

function PreviewReport({ preview }: { readonly preview: ImportPreview }): ReactElement {
  const kinds = IMPORT_PREVIEW_KINDS.filter((kind) => preview.kinds[kind].total > 0);
  const { skipped } = preview;
  const profiles = previewProfiles(preview);
  const scopes: readonly NamesScope[] = profiles.length > 1 ? profiles : [undefined];
  const unlisted = skipped.total - skipped.items.length;
  return (
    <PreviewLayout
      label={IMPORT_PREVIEW_REPORT_NAME}
      lines={kinds.map((kind) => ({ key: kind, text: previewKindLine(kind, preview.kinds[kind]) }))}
      skipped={skipped.total === 0 ? null : { heading: `${counted(skipped.total, ["item", "items"])} would be skipped:`, groups: skipGroups(skipped.items) }}
      names={
        <>
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
        </>
      }
    />
  );
}

function PreviewFailed({ line, onRetry }: { readonly line: string; readonly onRetry: () => void }): ReactElement {
  return (
    <Stack gap="tight">
      <Text voice="reading" tone="destructive" role="status">
        {line}
      </Text>
      <Row justify="start">
        <Button variant="outline" onClick={onRetry}>
          {RETRY_NAME}
        </Button>
      </Row>
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
      return <PreviewFailed line={`No preview. ${state.message} You can still import, or try again.`} onRetry={onRetry} />;
    case "ready":
      return <PreviewReport preview={state.preview} />;
  }
}

/** The SillyTavern export's dry run in its preflight: the import preview's layout over the export report, whose files
 *  each name the SillyTavern door that takes them back. */
export function StExportPreviewSummary({ state, onRetry }: { readonly state: StExportPreviewState; readonly onRetry: () => void }): ReactElement | null {
  switch (state.status) {
    case "off":
      return null;
    case "reading":
      return (
        <Text voice="reading" role="status">
          {ST_EXPORT_READING}
        </Text>
      );
    case "failed":
      return <PreviewFailed line={ST_EXPORT_PREVIEW_FAILED} onRetry={onRetry} />;
    case "ready": {
      const { report } = state;
      const left = stExportLeftGroups(report);
      return (
        <PreviewLayout
          label={ST_EXPORT_REPORT_NAME}
          lines={stExportKindLines(report)}
          skipped={left}
          names={
            <>
              {stExportNameLines(report).map(({ key, text }) => (
                <Text key={key} voice="gloss" cap="prose" prose={true} wrap="anywhere">
                  {text}
                </Text>
              ))}
              {(left?.groups ?? []).map(({ reason, sources }) => (
                <Text key={reason} voice="gloss" cap="prose" prose={true} wrap="anywhere">
                  {`Stays here, ${reason}: ${sources.join(", ")}`}
                </Text>
              ))}
            </>
          }
        />
      );
    }
  }
}
