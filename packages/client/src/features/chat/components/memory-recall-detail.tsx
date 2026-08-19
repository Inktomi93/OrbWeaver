// The `{{memory}}` recall DETAIL readout (#250 / #313) — WHAT memory fetched and WHY: the query it matched
// on, the pool it chose from, every surfaced block with the score it was admitted on, and the top rejects
// with the reason each lost. ONE home, two consumers: the Preview tab's Diagnostics drawer
// (`assembly-preview-diagnostics.tsx`) and the header brain-icon POPOVER (`chat-recall-indicator.tsx`).
//
// Host-only DATA by inheritance — both consumers feed it a `MemoryRecallSlice` read under a host gate (the
// digest scores/identity are not room-public; they never ride the bus). Content-free by construction: the
// slice carries block identity + scores, never digest bytes.

import type { MemoryRecallCandidate, MemoryRecallSlice, MemoryRecallVerdict } from "@orb/contracts/chat";
import { Badge } from "@orb/ui/badge";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

/** The instrument's section voice (micro-caps, muted) — a panel-width heading, never the `Section` default
 *  title size, which shouts louder than the data it labels. */
function Kicker({ children }: { readonly children: ReactNode }): ReactElement {
  return <Text voice="kicker">{children}</Text>;
}

function TraceLine({ label, value }: { readonly label: string; readonly value: ReactNode }): ReactElement {
  return (
    <Row gap="block" justify="between" align="start">
      <Text className="shrink-0" voice="label">
        {label}
      </Text>
      <Text className="min-w-0 text-end break-words" voice="datum">
        {value}
      </Text>
    </Row>
  );
}

/** The human label per recall verdict (`MemoryRecallVerdict`) — a mapped-type Record, so a widened axis fails
 *  `tsc` here (§5.5). Written as the ANSWER to "why is this block here / not here", not the internal stage name:
 *  a host reads "still in the live history", never "live-window". */
const RECALL_VERDICT_LABEL: Record<MemoryRecallVerdict, string> = {
  admitted: "surfaced",
  "below-floor": "below the score floor",
  "bridge-covered": "covered by a higher tier",
  "mode-excluded": "not eligible in this mode",
  "live-window": "still in the live history",
  unwitnessed: "not witnessed by this speaker",
};

/** `relevance` is cosine similarity in 0..1; the readout is a percentage, the only unit a host has intuition
 *  for. The rank SCORE is deliberately not rendered — it is CSLS-adjusted and lower-is-closer, so printing it
 *  beside a percentage would put two opposite scales on one line. */
const RELEVANCE_PERCENT = 100;

/**
 * WHAT MEMORY FETCHED AND WHY (#250) — the recall slice: the query it matched on, the pool it chose from, and
 * every surfaced block with the score it was admitted on, followed by the top rejects with the reason each lost.
 *
 * `null` ⇒ recall never ran for this slice (a hand-built context) — distinct from a recall that surfaced
 * nothing, which renders its own counts and reason.
 */
export function MemoryRecallDetail({ recall }: { readonly recall: MemoryRecallSlice | null }): ReactElement {
  if (recall === null) {
    return (
      <Section heading={<Kicker>Memory recall</Kicker>}>
        <Text>Memory recall did not run for this assembly.</Text>
      </Section>
    );
  }
  return (
    <Section heading={<Kicker>{`Memory recall — ${recall.surfaced} of ${recall.poolSize} surfaced`}</Kicker>}>
      <Stack gap="field">
        <TraceLine label="Mode" value={recall.mode} />
        <TraceLine label="Pool → candidates → surfaced" value={`${recall.poolSize} → ${recall.candidateCount} → ${recall.surfaced}`} />
        {recall.note === null ? null : <TraceLine label="Result" value={recall.note} />}
        {recall.queryText === null ? null : (
          <Stack gap="row">
            <Text voice="label">{recall.queryEmbedded ? "Query (embedded)" : "Query"}</Text>
            <Text className="whitespace-pre-wrap" voice="datum">
              {recall.queryText}
            </Text>
          </Stack>
        )}
        {recall.candidates.length === 0 ? (
          <Text>No memory blocks were considered.</Text>
        ) : (
          <Stack gap="row" role="list">
            {recall.candidates.map((candidate) => (
              <RecallCandidateLine candidate={candidate} key={`${candidate.scopedCharacterId}:${candidate.tier}:${candidate.blockIdx}`} />
            ))}
          </Stack>
        )}
      </Stack>
    </Section>
  );
}

/** One considered block: `tier.block` leads (its stable identity), the verdict + score trail it. A SURFACED
 *  block wears the badge — the same "this one is noteworthy" weight the wire rows use. */
function RecallCandidateLine({ candidate }: { readonly candidate: MemoryRecallCandidate }): ReactElement {
  const rank = candidate.rank === undefined ? "" : `#${candidate.rank + 1} `;
  const label = RECALL_VERDICT_LABEL[candidate.verdict];
  return (
    <Row align="baseline" data-slot="memory-recall-candidate" gap="block" justify="between" role="listitem">
      <Text voice="datum">{`${rank}tier ${candidate.tier} · block ${candidate.blockIdx}`}</Text>
      <Row align="baseline" className="shrink-0" gap="field">
        {candidate.verdict === "admitted" ? (
          <Badge intent="info" size="sm">
            {label}
          </Badge>
        ) : (
          <Text voice="gloss">{label}</Text>
        )}
        {candidate.relevance === undefined ? null : <Text voice="gloss">{`${Math.round(candidate.relevance * RELEVANCE_PERCENT)}% match`}</Text>}
      </Row>
    </Row>
  );
}
