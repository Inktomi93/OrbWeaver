// BackgroundSourceField (BG-C) — the shared write-surface picker for the carried decorative-background
// SOURCE (`ThemeBackground`, the `ThemeOverride` twin): consumed by the chat room-overrides tab (Control A,
// host-only per-chat) and the character card editor (Control B, the card's own carried background). Both
// call sites are DISCRETE immediate-write controls (pick → mutate) — this field owns ONLY the picker body;
// it never renders a save/discard affordance and never binds into an autosave FORM session (the D78
// boundary stays with the caller).
//
// REBUILT ON THE LOOKS GRAMMAR (#866 S4, owner R-BG addendum — the kind Select + name Selects were a
// seen-not-read shoehorn): ONE thumbnail grid — a None tile · the viewer's own `backgroundLibrary`
// entries — where the KIND derives from the tapped tile and is never a control. The bundled scene plates
// used to be a SECOND tile family here, drawn from a static `kind:"seeded"` catalog; they are now seeded
// into the library itself (`@orb/default-content`), so the grid has ONE image population again and a
// shipped plate can be renamed and removed exactly like an upload. The
// grid is the house `MediaGrid` cell family (selected wears the aria-selected ring). NO upload/manage
// here: the Add affordance is the LINK to Settings → Appearance → Background (the existing "points users
// here to add one" contract). The external-URL arm keeps its DISCRETE draft → Apply commit (F-P0-2: the
// server materializes a fetched URL into an owned CAS asset; committing per keystroke would fetch per
// character), behind a "From a URL…" door instead of a kind option.
//
// The asset branch reads the viewer's OWN library via `trpc.settings.getUserSettings` — the sanctioned
// cross-feature READ seam (UI-Architecture-and-Layout.md §2.1).

import { blobUrl } from "@orb/contracts/assets";
import type { ThemeBackground } from "@orb/contracts/theme";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import { Button } from "@orb/ui/button";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import type { MediaGridItem } from "@orb/ui/media-grid";
import { MediaGrid } from "@orb/ui/media-grid";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryErrorState, useTRPC } from "#data";
import { openConfigTo } from "#state";
import { QueryBoundary } from "./query-boundary.tsx";

/** The all-blank "no background" source — every non-active field heals to "" (the `themeBackgroundSchema`
 *  fault-isolation defaults), so a pick always rewrites the WHOLE object rather than leaking a stale
 *  field from a previously-picked kind. */
const EMPTY_BACKGROUND: ThemeBackground = themeBackgroundSchema.parse({});

const THUMB_WIDTH = 96;
const NONE_TILE_ID = "none";
const ASSET_PREFIX = "asset:";

interface BackgroundTile extends MediaGridItem {
  readonly pick: ThemeBackground;
}

export interface BackgroundSourceFieldProps {
  /** `null` = no source carried yet (the server's "unset" state) — rendered as kind `none`. */
  readonly value: ThemeBackground | null;
  /** Fired with the FULL rebuilt source on any pick/clear — the caller mutates with the whole object. */
  readonly onChange: (value: ThemeBackground) => void;
  /** Non-host / read-only viewers get the picker rendered inert (chat Control A's member branch). */
  readonly readOnly?: boolean;
  /**
   * The OWNER's surface-box id (#885/#1748). A shared composite can never mint its own — one literal here is
   * one remembered box for both owners, the duplicate-key defect by a route the gate's literal census cannot
   * see. Each owner mints its own; omitted, the boundary reserves nothing, as before.
   */
  readonly reserveKey?: string | undefined;
}

/** The tile the CURRENT value lights — the kind is storage detail; the grid speaks in tiles. */
function currentTileId(current: ThemeBackground): string | null {
  if (current.kind === "none") {
    return NONE_TILE_ID;
  }
  if (current.kind === "asset") {
    return `${ASSET_PREFIX}${current.assetId}`;
  }
  return null; // external — materializing server-side; no tile until the server rewrites it to `asset`.
}

export function BackgroundSourceField({ value, onChange, readOnly = false, reserveKey }: BackgroundSourceFieldProps): ReactElement {
  const current = value ?? EMPTY_BACKGROUND;
  const commit = (patch: Partial<ThemeBackground>): void => onChange({ ...EMPTY_BACKGROUND, ...patch });

  // External URL entry is a DISCRETE apply, never a per-keystroke write (F-P0-2) — see the header.
  const [externalDraft, setExternalDraft] = useState<string | null>(null);
  const draftValue = externalDraft ?? (current.kind === "external" ? current.externalUrl : "");
  const inExternalMode = externalDraft !== null || current.kind === "external";

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
      {/* THE KEY IS THE CALLER'S (#1748). The ruling that this SHARED composite may not mint one SURVIVES —
          one literal here would hand both owners (the character Look tab and the chat room-overrides tab)
          the same remembered box, the copy-paste failure the reservation gate's duplicate arm exists to red.
          What changed is that both owners now supply their own, the shape design §1.4 prescribed. */}
      <QueryBoundary
        fallback={<Text tone="muted">Loading your background library…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your background library" onRetry={retry} />}
        {...(reserveKey === undefined ? {} : { reserveKey })}
      >
        <BackgroundTileGrid current={current} onPick={readOnly ? null : commit} />
      </QueryBoundary>
      {/* Two FLAT arms (no nested ternary): the doors row at rest, the URL entry while drafting. */}
      {readOnly || inExternalMode ? null : (
        <Row align="center" gap="field" className="justify-between">
          <Button intent="ghost" onClick={(): void => setExternalDraft("")} size="sm" type="button">
            From a URL…
          </Button>
          {/* The ADD door — upload/manage lives in ONE place (BG-D's atomic library writes). */}
          <Button intent="ghost" onClick={(): void => openConfigTo("appearance", "background")} size="sm" type="button">
            Add your own in Settings
          </Button>
        </Row>
      )}
      {!readOnly && inExternalMode ? (
        <Row align="end" gap="field">
          <Input aria-label="Background image URL" className="flex-1" onValueChange={setExternalDraft} placeholder="https://…" value={draftValue} />
          <Button disabled={draftValue.trim().length === 0} intent="secondary" onClick={applyExternal} type="button">
            Apply
          </Button>
        </Row>
      ) : null}
    </Stack>
  );
}

interface BackgroundTileGridProps {
  readonly current: ThemeBackground;
  /** `null` = read-only (the grid still shows which tile is in use, but a tap does nothing). */
  readonly onPick: ((patch: Partial<ThemeBackground>) => void) | null;
}

/** The ONE tile population: None · the viewer's own library (BG-D), which now carries the seeded plates. */
function BackgroundTileGrid({ current, onPick }: BackgroundTileGridProps): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const library = data.config.appearance.backgroundLibrary;

  const tiles: readonly BackgroundTile[] = [
    { id: NONE_TILE_ID, alt: "No background", pick: { ...EMPTY_BACKGROUND, kind: "none" } },
    ...library.map(
      (entry): BackgroundTile => ({
        id: `${ASSET_PREFIX}${entry.assetId}`,
        alt: entry.name,
        // A video entry renders the placeholder box (an <img> of a video is a broken glyph); the name
        // still names it.
        ...(entry.mime.startsWith("video/") ? {} : { thumbUrl: `${blobUrl(entry.assetHash)}?w=${THUMB_WIDTH}` }),
        pick: { ...EMPTY_BACKGROUND, kind: "asset", assetId: entry.assetId, assetHash: entry.assetHash, mime: entry.mime },
      }),
    ),
  ];
  const selectedId = currentTileId(current);

  return (
    <MediaGrid
      ariaLabel="Background"
      className="max-h-64 w-full"
      items={tiles}
      minCellWidth={THUMB_WIDTH}
      selection={{
        selectedIds: new Set(selectedId === null ? [] : [selectedId]),
        onToggle: (id): void => {
          if (onPick === null) {
            return;
          }
          const tile = tiles.find((candidate) => candidate.id === id);
          if (tile !== undefined) {
            onPick(tile.pick);
          }
        },
      }}
    />
  );
}
