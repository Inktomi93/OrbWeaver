// "INVESTED, BUT QUIET" — the forgotten-gem shelf (program #102 corpus leg, issue #127; mockup A's
// understanding TILES).
//
// THE TWO DEFECTS THIS SHAPE ANSWERS, both measured on the live instance:
//   1. A GEM WAS WEARING CHAT-ROW CLOTHING. A per-CHARACTER lifetime aggregate rendered in a `ListRow` reads
//      as one conversation — the largest real chat on this instance is 71 messages, so a career total looked
//      like a bug. A gem is now a TILE in a shelf: a different anatomy from a row, and the band above says
//      "lifetime totals" once so the aggregate is framed rather than mistaken.
//   2. A DEAD COST COLUMN. Six identical `$0.00` cells, because a local-model instance records no spend.
//      Cost appears NOWHERE here. The trailing magnitude is TOKENS RETURNED (`tokensOut`), the signal that
//      actually varies on this corpus (10,217 → 0), so the column carries information instead of zeros.
//      IT IS LABELLED "tokens returned", NOT "words" (#174, owner-observed live 2026-08-18: "Hikari 281,711
//      words"). The field is the model's OUTPUT TOKEN total — as a word claim it overstates by ~30-40%, and
//      this app already counts real words elsewhere off a real `wordCount()` (`stats.wrapped.words`, the
//      analytics overview's "Words" figure), so the two are separately true numbers and the label decides
//      which one the reader thinks they are reading.
//
// THE TILE IS A GHOST BUTTON, not a Card — the shipped precedent for an interactive grid cell whose subject
// is a character (`home-quick-picks-tile-body.tsx`), and it keeps the name at the `label` step, which is the
// only step a feature can spell inside a control (`size` is an @orb/ui-internal axis the density A3 arm reds
// at any feature call site, and `focal` is the ONE-per-surface promotion voice this shelf must not spend).
//
// THE BAR SITS OUTSIDE THE BUTTON AND IS DECORATION. `TrackBar` is aria-hidden by contract — its own header
// states the law: "the value TEXT is the accessible datum; bars are decorative, never colour-alone meaning",
// and the magnitude is already stated in the tile's gloss. The alternative, `Meter`, is `role="meter"` (bar-as-datum)
// and would announce the same magnitude a second time inside a named control. RECEIPTED DEVIATION on its
// tint: the mockup paints the bar with `--color-primary` mixed toward muted, and TrackBar's palette arms are
// the CATEGORICAL track ramp (vitality green — a hue this surface does not otherwise contain, which is the
// exact complaint its own `accent` comment records) or a semantic zone accent. `info` at the arm's rationed
// 55% is the honest closest; painting primary would take a change inside the sealed `@orb/ui`.

import { Button } from "@orb/ui/button";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import { TrackBar } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { timeLib } from "#lib";
import { selectCorpusCharacter } from "#state";
import { formatCount } from "../lib/corpus-analysis-state.ts";
import { CharacterAvatar } from "./character-avatar.tsx";

type ForgottenGem = inferOutput<Trpc["discovery"]["forgottenGems"]>[number];

function gemGloss(gem: ForgottenGem): string {
  const exchanges = `${formatCount(gem.messageCount)} ${gem.messageCount === 1 ? "exchange" : "exchanges"}`;
  // "last opened <ago>", never "<stamp> quiet": `formatRelativeAgo` is the kit's ONE sentence-ago form and
  // returns "just now" for a sub-minute span, so no call site can compose the "now ago" this app has already
  // shipped once. The band above supplies the "lifetime totals" framing; the row states plain facts.
  return `${formatCount(gem.tokensOut)} tokens returned · ${exchanges} · last opened ${timeLib.formatRelativeAgo(gem.lastActiveAt)}`;
}

export function CorpusGemTiles({ gems }: { readonly gems: readonly ForgottenGem[] }): ReactElement | null {
  if (gems.length === 0) {
    // NOT a muted "No quiet-but-invested characters yet." note. This section reports FINDINGS; no findings
    // means there is nothing to report, and a sentence saying so is one more brick in the wall of truthful
    // nothing the readiness rail already covers in one place.
    return null;
  }
  // The shelf's own top value sets the bar scale — these are relative investments within YOUR library, and
  // there is no external maximum a tokens-returned total could be a fraction of.
  const topTokensOut = Math.max(...gems.map((gem) => gem.tokensOut), 1);

  return (
    <Section kicker="Invested, but quiet" level={2}>
      {/* THE GLOSS NAMES THE ACTUAL RANK (corpus forensics §6). It used to read "most tokens returned, least
          recently opened" — neither of which was the sort: the primary key was message count, and the "quiet"
          term was a tie-break on an integer with no ties, so it never fired and the headline gem was the
          character played six hours ago. The verb now ranks the CONJUNCTION (volume × how long quiet), and
          this line says so in the shelf's own words. */}
      <Text voice="gloss">Lifetime totals per character — the most played, longest left alone.</Text>
      {/* auto-fit at the 16rem tile floor: a wider pane shows MORE tiles, never wider ones. `role="list"`
          needs real `listitem` CHILDREN or the cells are generic to AT and the list announces empty. */}
      <Grid aria-label="Invested but quiet characters" cols="auto" gap="row" role="list">
        {gems.map((gem) => (
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
                <CharacterAvatar hash={gem.avatarHash} id={gem.characterId} name={gem.name} size="lg" />
                <Stack className="min-w-0 flex-1" gap="tight">
                  {/* `block truncate`, not `line-clamp-1`: the Button base is `whitespace-nowrap`, and a
                      nowrap line inside a `-webkit-box` clamp overflows its cell with NO ellipsis at all
                      (measured on the quick-picks shelf — a long character name ran over its neighbour). */}
                  <Text as="span" className="block truncate text-foreground" voice="label">
                    {gem.name}
                  </Text>
                  <Text as="span" className="block truncate" voice="gloss">
                    {gemGloss(gem)}
                  </Text>
                </Stack>
              </Row>
            </Button>
            <TrackBar accent="info" max={topTokensOut} value={gem.tokensOut} />
          </Stack>
        ))}
      </Grid>
    </Section>
  );
}
