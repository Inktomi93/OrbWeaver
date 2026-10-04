// Forgotten gems are per-character lifetime aggregates, not conversation rows, so they use shelf tiles and
// a lifetime-totals label (#127). The magnitude is tokens returned, never words or cost; imported/local
// data can have no token or price measurement. Missing tokens say not recorded, distinct from a measured
// zero (#174/B2).
//
// Each tile is a ghost button following the home quick-pick anatomy. Its name stays at the label step; the
// focal voice is rationed to the surface primary.
//
// The #536 successor removes the decorative bar while retaining the old accessibility ruling: value text
// is the accessible datum, and bars cannot carry color-alone meaning. A Meter would duplicate the
// announced magnitude. The shelf ranks volume × time quiet while the old bar measured token totals; these
// independent orders can disagree, so a bar misstates rank. gemMagnitudes retains the value/provenance in
// words, and the ordinal states rank. The obsolete explanatory legend goes with the bar.

import { Button } from "@orb/ui/button";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { timeLib } from "#lib";
import { selectCorpusCharacter } from "#state";
import { formatCount } from "../lib/corpus-analysis-state.ts";
import { CharacterAvatar } from "./character-avatar.tsx";

type ForgottenGem = inferOutput<Trpc["discovery"]["forgottenGems"]>[number];

/** The tile's MAGNITUDES — the two lifetime totals, on their own line so the third fact can have one. */
function gemMagnitudes(gem: ForgottenGem): string {
  const exchanges = `${formatCount(gem.messageCount)} ${gem.messageCount === 1 ? "exchange" : "exchanges"}`;
  // ABSENT ACCOUNTING IS NOT A ZERO (side-eye corpus re-pass B2, owner-observed). This read "0 tokens
  // returned · 1,187 exchanges" for five characters, because the economics op coalesced a missing count to
  // 0 — and an imported library has no token counts at all, so the tile's leading number was a confident
  // measurement of something never measured. `tokensOut` is nullable and its provenance stays on the wire;
  // null/unrecorded says so, while an imported estimate keeps its `~` instead of laundering into exact copy.
  const tokens =
    gem.tokensOut === null || gem.tokensOutProvenance === "unrecorded"
      ? "tokens not recorded"
      : `${gem.tokensOutProvenance === "estimated" ? "~" : ""}${formatCount(gem.tokensOut)} tokens written`;
  return `${tokens} · ${exchanges}`;
}

/** The tile's POINT, on its own line (B1). "last opened <ago>", never "<stamp> quiet": `formatRelativeAgo`
 *  is the kit's ONE sentence-ago form and returns "just now" for a sub-minute span, so no call site can
 *  compose the "now ago" this app has already shipped once. The band above supplies the "lifetime totals"
 *  framing; the tile states plain facts. */
function gemLastOpened(gem: ForgottenGem): string {
  return `last opened ${timeLib.formatRelativeAgo(gem.lastActiveAt)}`;
}

export function CorpusGemTiles({ gems }: { readonly gems: readonly ForgottenGem[] }): ReactElement | null {
  if (gems.length === 0) {
    // NOT a muted "No quiet-but-invested characters yet." note. This section reports FINDINGS; no findings
    // means there is nothing to report, and a sentence saying so is one more brick in the wall of truthful
    // nothing the readiness rail already covers in one place.
    return null;
  }

  return (
    <Section kicker="Invested, but quiet" level={2}>
      {/* THE GLOSS NAMES THE ACTUAL RANK (corpus forensics §6). It used to read "most tokens returned, least
          recently opened" — neither of which was the sort: the primary key was message count, and the "quiet"
          term was a tie-break on an integer with no ties, so it never fired and the headline gem was the
          character played six hours ago. The verb now ranks the CONJUNCTION (volume × how long quiet), and
          this line says so in the shelf's own words. */}
      {/* THE LEGEND CLAUSE WENT WITH THE BARS (#536 residual — the header states the fork). It read "Bars
          compare tokens returned, so they do not descend with the rank": a sentence whose whole job was to
          explain why one element disagreed with the list it sat on. With no bar there is nothing to
          reconcile, and what is left is the shelf's own ranking rule, stated once. */}
      {/* BOUNDED BY THE READING MEASURE (side-eye populated arm, [P3-1] / #536's line-length half). At the
          shipped 869px pane this line is the surface's widest prose and `design-audit` measured the page's
          worst paragraph at 145 chars against the 65-75ch law. */}
      {/* AND IT READS AT THE PROSE STEP (side-eye se-verify-4 N9). It rendered at 10.5px — the footnote
          register — while this component's own header records lifting the TILE gloss off exactly that step
          because 10.5px was one of 17 `undersized-ui-text` findings. The same argument reaches a SENTENCE
          the reader is meant to read: `prose` is the length statement that lifts the step to 13px without
          leaving the gloss voice, which is the lever the tiles below already use. */}
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        Lifetime totals per character — the most played, longest left alone.
      </Text>
      {/* auto-fit at the 16rem tile floor: a wider pane shows MORE tiles, never wider ones. `role="list"`
          needs real `listitem` CHILDREN or the cells are generic to AT and the list announces empty. */}
      <Grid aria-label="Invested but quiet characters" cols="auto" gap="row" role="list">
        {gems.map((gem, index) => (
          <Stack gap="tight" key={gem.characterId} role="listitem">
            {/* `role="listitem"` rides the layout WRAPPER, never the Button — an interactive element given a
                non-interactive role is a lie to AT (and eslint's own no-interactive-element-to-noninteractive-role). */}
            <Button
              className="w-full items-start justify-start text-left"
              intent="ghost"
              onClick={(): void => selectCorpusCharacter(gem.characterId)}
              size="wrap"
            >
              <Row align="center" className="w-full min-w-0" gap="row">
                {/* THE RANK IS A DATUM, NOT AN IMPLICATION (side-eye populated arm, [P2-2] / #536). The
                    shelf ranks by the CONJUNCTION volume × how-long-quiet and BARS tokens returned, so at
                    320 characters the audited row 2 read left→right 510,000 · 540,000 · 570,000 — bars
                    climbing down a descending list. Every reader parses a ranked list's leading number as
                    its sort key, and the only leading number here was the wrong one.
                    The report's two arms were "display the quantity you rank by" or "render the rank
                    ordinal so the sequence is visibly the datum". The first is unavailable without
                    lying: `gemRank` is a composite the wire does not carry as a number, and re-sorting by
                    tokens would throw away the ranking the verb was fixed to compute (corpus forensics
                    §6). So the ordinal — which is also what makes the tiles' order survive a re-flow into
                    2 or 4 columns, where "reading order" stops being obvious.
                    INSIDE the button, so it rides the tile's accessible NAME: the rank is part of what
                    this control is, not decoration beside it. */}
                <Text as="span" className="shrink-0 font-mono text-muted-foreground" voice="datum">
                  {index + 1}
                </Text>
                <CharacterAvatar hash={gem.avatarHash} id={gem.characterId} name={gem.name} size="lg" />
                <Stack className="min-w-0 flex-1" gap="tight">
                  {/* `block truncate`, not `line-clamp-1`: the Button base is `whitespace-nowrap`, and a
                      nowrap line inside a `-webkit-box` clamp overflows its cell with NO ellipsis at all
                      (measured on the quick-picks shelf — a long character name ran over its neighbour). */}
                  <Text as="span" className="block truncate text-foreground" voice="label">
                    {gem.name}
                  </Text>
                  {/* TWO LINES, AND BOTH READABLE (side-eye corpus re-pass 2026-08-19, B1). All three
                      facts used to ride ONE truncating `gloss` line inside the button: at 10.5px it was
                      one of 17 `undersized-ui-text` findings (interactive text under the 11px floor), and
                      what the truncation cut was always the tail — "last opened Nw ago", i.e. the exact
                      fact the shelf's own subtitle says it ranks by. Shrinking further, or clamping
                      harder, both keep cutting the point off; the line had to become two.
                      `prose` is the LENGTH statement that lifts the step to `label` (13px, over the floor)
                      without leaving the gloss voice, and `lines={2}` reserves the magnitudes' two lines so
                      the shelf's tiles keep one baseline whatever their names do. The last-opened line is
                      short enough to survive at the 16rem tile floor and is deliberately LAST — it is the
                      one the reader came for, and nothing wraps past it. */}
                  {/* `text-pretty` (P3-5's neighbour, P3-8): the magnitudes line wrapped with "exchanges"
                      alone on line two on all twelve tiles — a widow the browser will avoid on its own once
                      it is allowed to (text-wrap: pretty balances the LAST lines). The unit stays the honest
                      word; nothing here shortens a label to win a layout. */}
                  <Text as="span" className="block text-pretty" lines={2} prose={true} voice="gloss">
                    {gemMagnitudes(gem)}
                  </Text>
                  <Text as="span" className="block truncate" prose={true} voice="gloss">
                    {gemLastOpened(gem)}
                  </Text>
                </Stack>
              </Row>
            </Button>
          </Stack>
        ))}
      </Grid>
    </Section>
  );
}
