// The P5 ACT RAIL (panel-redesign DESIGN §4 "ACT II — THE BONE KEY ●I ─ ◉II ─ ○III") — extracted from
// rpg-quests-tab.tsx (the component-size cap; the RpgSceneCards precedent). Renders the snapshot-resident
// `tracker.plot` plane (clone-forward like quests — swipe-consistent), current act embered
// (text-highlight), past acts settled, future acts muted. TEXT is the datum (the "ACT II — title" line);
// the dot row is aria-hidden decoration (the tracker-kit a11y model). Null plot ⇒ the caller renders
// nothing (no client-invented acts, ever — §12.2.6).
//
// EDITABLE (host, #2 — act NAME + PROGRESS): the act number + the current act's title click-to-edit in
// place, riding `editSnapshot` on the `plot` plane with FINE lock paths (#10: `plot.acts` for a title
// edit, `plot.act` for a progress edit) so a pinned act rail is precise, never a whole-plot pin.

import type { RpgPlot } from "@orb/contracts/rpg";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { TrackerValue } from "#components";
import type { PlotEdit } from "../lib/plot-edit.ts";
import { RpgFieldLock } from "./rpg-field-lock.tsx";

// Roman act labels for the rail (acts beyond the table fall back to the arabic number — a 20-act
// campaign still labels honestly).
const ROMAN_ACTS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const;

function actNumeral(act: number): string {
  return ROMAN_ACTS[act - 1] ?? String(act);
}

// The rail's per-state glyph + tone (a Record over the closed 3-state axis — never a nested ternary).
const ACT_STATES = ["past", "current", "future"] as const;
type ActState = (typeof ACT_STATES)[number];
const ACT_STATE_STYLE: Readonly<Record<ActState, { readonly glyph: string; readonly className: string }>> = {
  past: { glyph: "●", className: "text-foreground" },
  current: { glyph: "◉", className: "text-highlight font-semibold" },
  future: { glyph: "○", className: "text-muted-foreground" },
};

function actState(act: number, current: number): ActState {
  if (act === current) {
    return "current";
  }
  return act < current ? "past" : "future";
}

/** One act stop on the rail — the connector rule (from act 2 on) + the state-toned glyph + numeral. */
function ActStop({ act, current }: { readonly act: number; readonly current: number }): ReactElement {
  const style = ACT_STATE_STYLE[actState(act, current)];
  return (
    <Row gap="field" align="center" className={act === 1 ? undefined : "flex-1"}>
      {act === 1 ? null : <Separator className="flex-1" />}
      {/* gloss: the dot row is quiet decoration (aria-hidden) — the state className re-colours it. */}
      <Text as="span" voice="gloss" className={style.className}>
        {style.glyph} {actNumeral(act)}
      </Text>
    </Row>
  );
}

/** The act rail — the campaign-scale plot spine above the quest cards. */
export function RpgActRail({ plot, edit }: { readonly plot: RpgPlot; readonly edit?: PlotEdit }): ReactElement {
  const total = Math.max(plot.acts.length, plot.act);
  const acts = Array.from({ length: total }, (_, i) => i + 1);
  const currentTitle = plot.acts[plot.act - 1]?.title ?? "";
  const heading = currentTitle !== "" ? `Act ${actNumeral(plot.act)} — ${currentTitle}` : `Act ${actNumeral(plot.act)}`;
  const pinned = edit === undefined ? null : ["plot", "plot.act", "plot.acts"].find((p) => edit.isLocked(p));
  return (
    <Stack gap="field" data-slot="rpg-act-rail" className="rounded-base border border-border bg-card px-block py-row">
      <Row gap="block" align="center" justify="between">
        {edit === undefined ? (
          <Text voice="kicker" className="text-highlight">
            {heading}
          </Text>
        ) : (
          <Row gap="field" align="center" className="min-w-0">
            <Text as="span" voice="kicker" className="text-highlight">
              Act
            </Text>
            {/* Rest shows the mock's ROMAN numeral; the click-reveals input edits the arabic number. */}
            <TrackerValue
              ariaLabel="Current act number"
              display={actNumeral(plot.act)}
              editValue={String(plot.act)}
              kind="numeric"
              onEdit={(next): void => {
                const n = Number.parseInt(next, 10);
                if (!Number.isNaN(n)) {
                  edit.onEditAct(Math.max(1, n));
                }
              }}
              className="!w-avatar-md px-field text-center tabular-nums"
              restClassName="font-semibold text-highlight"
            />
            <Text as="span" voice="label" aria-hidden={true} className="text-muted-foreground">
              —
            </Text>
            <TrackerValue
              ariaLabel={`Act ${plot.act} title`}
              display={currentTitle}
              placeholder="act title…"
              onEdit={(next): void => edit.onEditActTitle(next.trim())}
              className="!w-auto min-w-0 max-w-full field-sizing-content"
              restClassName="min-w-0 text-highlight"
            />
            {pinned === undefined || pinned === null ? null : <RpgFieldLock field="the act" onRelease={(): void => edit.onRelease(pinned)} />}
          </Row>
        )}
        {plot.title === "" ? null : (
          <Text as="span" voice="gloss" className="truncate">
            {plot.title}
          </Text>
        )}
      </Row>
      <Row gap="field" align="center" aria-hidden="true">
        {acts.map((act) => (
          <ActStop key={act} act={act} current={plot.act} />
        ))}
      </Row>
    </Stack>
  );
}
