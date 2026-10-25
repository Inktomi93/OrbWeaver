// The P5 ACT RAIL ("ACT II — THE BONE KEY ●I ─ ◉II ─ ○III") — extracted from
// rpg-quests-tab.tsx (the component-size cap; the RpgSceneCards precedent). Renders the snapshot-resident
// `tracker.plot` plane (clone-forward like quests — swipe-consistent), current act embered
// (text-accolade), past acts settled, future acts muted. TEXT is the datum (the "ACT II — title" line);
// the dot row is aria-hidden decoration (the tracker-kit a11y model). Null plot ⇒ the caller renders
// nothing (no client-invented acts, ever).
//
// EDITABLE (host, #2 — act NAME + PROGRESS): the act number + the current act's title click-to-edit in
// place, riding `editSnapshot` on the `plot` plane with FINE lock paths (#10: `plot.acts` for a title
// edit, `plot.act` for a progress edit) so a pinned act rail is precise, never a whole-plot pin.

import type { RpgPlot } from "@orb/contracts/rpg";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement } from "react";
import type { PlotEdit } from "../lib/plot-edit.ts";
import { RpgFieldLock } from "./rpg-field-lock.tsx";
import { TrackerValue } from "./tracker-blocks/index.ts";

// Roman act labels for the rail (acts beyond the table fall back to the arabic number — a 20-act
// campaign still labels honestly).
const ROMAN_ACTS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const;

function actNumeral(act: number): string {
  return ROMAN_ACTS[act - 1] ?? String(act);
}

// The rail's per-state glyph + tone (a Record over the closed 3-state axis — never a nested ternary).
const ACT_STATES = ["past", "current", "future"] as const;
type ActState = (typeof ACT_STATES)[number];
// `past` takes the Card's ink (`card-foreground` resolves to the same value as `foreground`) over the gloss voice's muted ink.
const ACT_STATE_STYLE: Readonly<Record<ActState, { readonly glyph: string; readonly text: Pick<ComponentProps<typeof Text>, "tone" | "ink"> }>> = {
  past: { glyph: "●", text: { ink: "inherit" } },
  current: { glyph: "◉", text: { tone: "accolade" } },
  future: { glyph: "○", text: { tone: "muted" } },
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
      {/* gloss: the dot row is quiet decoration (aria-hidden) — the state tone re-colours it. */}
      <Text as="span" voice="gloss" {...style.text}>
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
    <Card tone="neutral">
      <Stack gap="field" data-slot="rpg-act-rail">
        <Row gap="block" align="center" justify="between">
          {edit === undefined ? (
            <Text voice="kicker" tone="accolade">
              {heading}
            </Text>
          ) : (
            <Row gap="field" align="center" className="min-inline-0">
              <Text as="span" voice="kicker" tone="accolade">
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
                className="px-field text-center"
                numeric={true}
                width="avatar-md"
                tone="accolade"
              />
              <Text as="span" voice="label" aria-hidden={true} tone="muted">
                —
              </Text>
              <TrackerValue
                ariaLabel={`Act ${plot.act} title`}
                display={currentTitle}
                placeholder="act title…"
                onEdit={(next): void => edit.onEditActTitle(next.trim())}
                className="field-sizing-content max-inline-full min-inline-0"
                width="auto"
                restClassName="min-inline-0"
                tone="accolade"
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
    </Card>
  );
}
