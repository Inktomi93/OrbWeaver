// BackgroundSourceField (BG-C) — the shared write-surface picker for the carried decorative-background
// SOURCE (`ThemeBackground`, the `ThemeOverride` twin): consumed by the chat room-overrides tab (Control A,
// host-only per-chat) and the character card editor (Control B, the card's own carried background). Both
// call sites are DISCRETE immediate-write controls (pick → mutate) — this field owns ONLY the picker body;
// it never renders a save/discard affordance and never binds into an autosave FORM session (the D78
// boundary stays with the caller, if any — this field sits beside it like a switch).
//
// The asset (library) branch reads the viewer's OWN `appearance.backgroundLibrary` via `trpc.settings.
// getUserSettings` — the sanctioned cross-feature READ seam (`UI-Architecture-and-Layout.md` §2.1: "cross-
// feature reads ONLY via trpc.*") — rather than importing the settings feature's upload-and-manage
// component (that component is FORM-bound to the appearance autosave session; this is a bare picker, own
// row markup, no upload). The kind vocabulary rides the shared `#lib` table (`BACKGROUND_KIND_ITEMS`) —
// the SAME one the Appearance settings surface's `backgroundImageKind` select uses (one home, no 2nd
// spelling of the label text — the `message-role-labels.ts` precedent).

import { blobUrl } from "@orb/contracts/assets";
import type { ThemeBackground } from "@orb/contracts/theme";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import type { AssetId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Check, Icon, Play } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";
import { BACKGROUND_KIND_ITEMS, listSeededBackgrounds } from "#lib";

/** The all-blank "no background" source — every non-active field heals to "" (the `themeBackgroundSchema`
 *  fault-isolation defaults), so a kind switch always rewrites the WHOLE object rather than leaking a
 *  stale field from a previously-picked kind. */
const EMPTY_BACKGROUND: ThemeBackground = themeBackgroundSchema.parse({});

const SEEDED_BACKGROUND_ITEMS: SelectItems<string> = listSeededBackgrounds().map((bg) => ({
  value: bg.id,
  label: bg.label,
}));

const THUMB_WIDTH = 96;

export interface BackgroundSourceFieldProps {
  /** `null` = no source carried yet (the server's "unset" state) — rendered as kind `none`. */
  readonly value: ThemeBackground | null;
  /** Fired with the FULL rebuilt source on any pick/clear — the caller mutates with the whole object. */
  readonly onChange: (value: ThemeBackground) => void;
  /** Non-host / read-only viewers get the picker rendered inert (chat Control A's member branch). */
  readonly readOnly?: boolean;
  /** Drop the primary select's VISIBLE "Background" label when the field sits under a titled Section that
   *  already reads "Background" (the chat context tab) — otherwise "Background" is announced twice. The
   *  `aria-label` stays (a nameless combobox is a WCAG 4.1.2 fail); only the visible duplicate is removed. */
  readonly hideLabel?: boolean;
}

export function BackgroundSourceField({ value, onChange, readOnly = false, hideLabel = false }: BackgroundSourceFieldProps): ReactElement {
  const current = value ?? EMPTY_BACKGROUND;
  const commit = (patch: Partial<ThemeBackground>): void => onChange({ ...EMPTY_BACKGROUND, ...patch });

  // External URL entry is a DISCRETE apply, never a per-keystroke write (F-P0-2): the caller mutates on every
  // onChange, and the server MATERIALIZES a `kind:"external"` source (fetch → magic-belt → CAS). Committing
  // per keystroke would fire a fetch-and-store on every character AND materialize an empty URL the instant the
  // kind switches to "external". So the URL lives in local draft state and only commits (once) on "Apply".
  const [externalDraft, setExternalDraft] = useState<string | null>(null);
  const inExternalMode = externalDraft !== null || current.kind === "external";
  const draftValue = externalDraft ?? current.externalUrl;

  const onKindChange = (kind: ThemeBackground["kind"]): void => {
    if (kind === "external") {
      // Enter external-entry mode WITHOUT committing (an empty URL would materialize to nothing / clear).
      setExternalDraft(current.kind === "external" ? current.externalUrl : "");
      return;
    }
    setExternalDraft(null);
    commit({ kind });
  };

  const applyExternal = (): void => {
    const url = draftValue.trim();
    if (url.length === 0) {
      return;
    }
    setExternalDraft(null);
    commit({ kind: "external", externalUrl: url });
  };

  return (
    <Stack gap="field">
      <Select
        aria-label="Background"
        disabled={readOnly}
        items={BACKGROUND_KIND_ITEMS}
        onValueChange={(kind): void => onKindChange(kind as ThemeBackground["kind"])}
        value={inExternalMode ? "external" : current.kind}
        {...(hideLabel ? {} : { label: "Background" })}
      />
      {current.kind === "seeded" && !inExternalMode && (
        <Select
          aria-label="Seeded image"
          disabled={readOnly}
          items={SEEDED_BACKGROUND_ITEMS}
          label="Seeded image"
          onValueChange={(seededId): void => commit({ kind: "seeded", seededId: seededId as string })}
          placeholder="Choose a background"
          value={current.seededId}
        />
      )}
      {inExternalMode ? (
        <Row align="end" gap="field">
          <Input
            aria-label="Background image URL"
            className="flex-1"
            disabled={readOnly}
            onValueChange={setExternalDraft}
            placeholder="https://…"
            value={draftValue}
          />
          <Button disabled={readOnly ? true : draftValue.trim().length === 0} intent="secondary" onClick={applyExternal} type="button">
            Apply
          </Button>
        </Row>
      ) : null}
      {current.kind === "asset" && !inExternalMode && !readOnly && (
        <QueryBoundary
          fallback={<Text tone="muted">Loading your background library…</Text>}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="your background library" onRetry={retry} />}
        >
          <BackgroundAssetPicker current={current} onPick={(entry): void => commit({ kind: "asset", ...entry })} />
        </QueryBoundary>
      )}
    </Stack>
  );
}

interface AssetPick {
  readonly assetId: AssetId;
  readonly assetHash: string;
  readonly mime: string;
}

interface BackgroundAssetPickerProps {
  readonly current: ThemeBackground;
  readonly onPick: (entry: AssetPick) => void;
}

/** The asset (library) branch body — the viewer's saved `appearance.backgroundLibrary` entries, pick-only
 *  (no upload/rename/delete here; that management lives on the Appearance settings surface). */
function BackgroundAssetPicker({ current, onPick }: BackgroundAssetPickerProps): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const library = data.config.appearance.backgroundLibrary;

  if (library.length === 0) {
    return (
      <Text size="micro" tone="muted">
        No saved backgrounds yet — add one from Settings → Appearance.
      </Text>
    );
  }

  return (
    <Stack gap="row">
      {library.map((entry) => {
        const selected = current.kind === "asset" && current.assetId === entry.assetId;
        const video = entry.mime.startsWith("video/");
        return (
          <Row align="center" gap="row" justify="between" key={entry.assetId}>
            <Row align="center" gap="row">
              <Avatar fallbackDelay={0} shape="square" size="sm" {...(video ? {} : { src: `${blobUrl(entry.assetHash)}?w=${THUMB_WIDTH}` })}>
                <Icon icon={video ? Play : Check} size="sm" />
              </Avatar>
              <Text as="span" className="min-w-0 flex-1 truncate">
                {entry.name}
              </Text>
            </Row>
            <Button
              aria-label={selected ? `${entry.name} in use` : `Use ${entry.name}`}
              disabled={selected}
              intent={selected ? "primary" : "secondary"}
              onClick={(): void => onPick({ assetId: entry.assetId, assetHash: entry.assetHash, mime: entry.mime })}
              size="sm"
            >
              {selected ? "In use" : "Use"}
            </Button>
          </Row>
        );
      })}
    </Stack>
  );
}
