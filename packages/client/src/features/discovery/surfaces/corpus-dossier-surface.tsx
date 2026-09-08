// The Corpus CONTENT dossier (a character selected) — one character's composed understanding. Reads
// `characterDossier` (distilled headline facets + portrait↔card alignment + nearest neighbours) +
// `characterKeywords` (its keyword profile, charted as a bar-list). Neighbour rows re-select into this
// same dossier; the "Similar art" strip seeds `search.similarArt` from this character's avatar so
// look-alike portraits are one click away. The ASK panel grounds a free-text question against the
// character's recent PLAYED scenes via `askCard` and badges the answer with its provenance — the surface's
// ONE primary is Ask.
//
// THREE provenance states, not two (`answerState`): `grounded`/`speculative` are the MODEL'S claim about its
// own answer; `degraded` is OURS — the reply failed the payload schema twice, so the body is raw text the
// server couldn't parse. Merging degraded into "Speculative" blamed the model for our parse failure and hid
// that the text below was never validated at all.

import { SCORE_MAX } from "@orb/contracts/refinery";
import type { CharacterId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { BarList } from "@orb/ui/bar-list";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { ArrowLeft, Icon, Sparkles } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId, useFocusOnMount } from "#lib";
import { selectCorpusCharacter, setActiveSection } from "#state";
import { CharacterAvatar } from "../components/character-avatar.tsx";
import { CorpusDistillEmptyState } from "../components/corpus-distill-empty-state.tsx";
import { characterFacetLine } from "../lib/character-facet.ts";
import { toBarItems } from "../lib/corpus-charts.ts";
import { percent } from "../lib/corpus-vocabulary.ts";

/** The refinery rubric is a weighted average, so one decimal is the honest resolution (the character
 *  overview card's own `REFINERY_SCORE_DECIMALS` reads the same value the same way). */
const SCORE_PRECISION = 1;
const KEYWORD_LIMIT = 24;
const SIMILAR_ART_TOP_N = 8;
const SKELETON_ROW_COUNT = 3;

export interface CorpusDossierSurfaceProps {
  readonly characterId: CharacterId;
  readonly onBack: () => void;
}

// THE DRILL-IN FOCUSES ITS OWN DOOR BACK OUT, not its container (side-eye corpus re-pass #2, P2-4).
// This called `useFocusOnMount` on the surface ROOT — a `tabIndex={-1}` div with `outline: none`, which is
// what the re-pass measured arriving focus landing on: 869x7831, no accessible name, no visible ring. The
// gate's requirement (UI-Gates-and-Lessons §8: a drill-down surface manages focus on mount) is right and is
// KEPT; what was wrong was the target. `Back` is the control this surface exists to return through, it is
// named, and it paints a real focus ring — so the drill-in is announced instead of swallowed.
export function CorpusDossierSurface({ characterId, onBack }: CorpusDossierSurfaceProps): ReactElement {
  return (
    // No height/scroll/inset of its own — the CONTENT region owns all three for both corpus surfaces
    // (`corpus-content.tsx`, the Configuration precedent).
    <Stack data-testid={testId("corpusDossierSurface")}>
      {/* RESERVED (#1098), joining its four already-keyed siblings (`corpus.map` / `.browse` / `.visuals`
          / `.similarity`) — the drill-in was the one corpus surface still collapsing the CONTENT region to
          a sentence between the list and the dossier. Neither this surface nor its body owns a scroll box
          (`corpus-content.tsx` does, above the boundary), so the measuring wrapper is layout-inert here. */}
      <QueryBoundary
        fallback={<SkeletonRows count={6} />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the dossier" onRetry={retry} />}
        reserveKey="corpus.dossier"
      >
        <DossierBody characterId={characterId} onBack={onBack} />
      </QueryBoundary>
    </Stack>
  );
}

function DossierBody({ characterId, onBack }: { readonly characterId: CharacterId; readonly onBack: () => void }): ReactElement {
  // The drill-in's focus target (§8, and see the surface header). It lives on the BODY rather than the
  // wrapper because the button only exists once the dossier's reads have resolved — a ref on the suspended
  // shell would point at nothing on the render that matters.
  const backRef = useRef<HTMLButtonElement>(null);
  useFocusOnMount(backRef);
  const trpc = useTRPC();
  const { data: dossier } = useSuspenseQuery(trpc.discovery.characterDossier.queryOptions({ characterId }));
  const { data: keywords } = useSuspenseQuery(trpc.discovery.characterKeywords.queryOptions({ characterId, limit: KEYWORD_LIMIT }));

  if (dossier === null) {
    return (
      <CorpusDistillEmptyState
        title="Not distilled yet"
        description="This character has no distilled dossier. Distill it in the Refinery, then come back."
        secondaryAction={
          <Button intent="secondary" size="sm" onClick={onBack}>
            <Icon icon={ArrowLeft} size="sm" />
            Back
          </Button>
        }
      />
    );
  }

  const facet = characterFacetLine(dossier.genre, dossier.tone);
  const avatarHash = dossier.portrait?.avatarHash ?? null;

  return (
    <Stack gap="section">
      <Button intent="ghost" size="sm" onClick={onBack} className="self-start" ref={backRef}>
        <Icon icon={ArrowLeft} size="sm" />
        Back
      </Button>

      <Row align="center" gap="block">
        <CharacterAvatar id={characterId} name={dossier.name} hash={avatarHash} size="lg" />
        <Stack gap="field">
          <Text className="text-title leading-title font-semibold">{dossier.name}</Text>
          {/* THE FACET CHAIN IS DATA, NOT A SECTION NAME (side-eye corpus re-pass #2, P3-2). It rendered at
              `voice="kicker"` — 9.5px UPPERCASE with .09em tracking, the register reserved for a band label
              — so a distilled value the pass wrote in lower case ("fantasy · melancholic") arrived shouting.
              `gloss` is the quiet second line this actually is; the casing is `characterFacetLine`'s. */}
          {facet !== "" ? <Text voice="gloss">{facet}</Text> : null}
          {/* A MEASURE CAP ON THE PROSE (P2-8): the pitch measured 109ch and the neighbour gloss 165ch on a
              wide pane, against the 65-75ch reading law. The cap belongs on the PARAGRAPH, never on the
              page. The token is `--reading-measure-prose` since #1145 — the masthead's headline one section
              up keeps `--reading-measure`, because the law's band is about BODY line length and a display
              line is not body copy. */}
          {dossier.elevatorPitch !== null ? <Text className="max-w-(--reading-measure-prose) text-muted-foreground">{dossier.elevatorPitch}</Text> : null}
        </Stack>
      </Row>

      <Section heading="Card quality">
        {dossier.refineryScore === null ? (
          // A load-bearing empty state: "no score" is a real, actionable state, and the door out of it is
          // the sweep — so the copy names it rather than leaving a blank where a number lives on other cards.
          //
          // AND THE SENTENCE NOW CARRIES ITS DOOR (side-eye corpus re-pass B8). It named two verbs — the
          // library score sweep and a Refinery session — beside zero controls, which is a section that
          // exists only to tell you what you cannot do from here. Both verbs live in one place, so one door
          // is the honest count (`corpus-distill-empty-state.tsx`'s "Go to Refinery", same route).
          <Stack align="start" gap="field">
            {/* THE SAME MEASURE CAP ITS SIBLINGS GOT (side-eye corpus re-pass #3, P3-E). This sentence was
                the one paragraph on the surface that escaped the 65-75ch reading law — 78.6ch at
                `max-width: none`, beside a pitch and a masthead headline that both carry the token. */}
            <Text className="max-w-(--reading-measure-prose)" voice="gloss">
              Not scored yet — run the Refinery's library score sweep, or open a Refinery session on this card.
            </Text>
            <Button intent="ghost" onClick={(): void => setActiveSection("refinery")} size="sm">
              Open the Refinery →
            </Button>
          </Stack>
        ) : (
          <Text voice="gloss">
            Refinery score:{" "}
            <Text as="span" className="font-mono">
              {dossier.refineryScore.toFixed(SCORE_PRECISION)}
            </Text>{" "}
            / {SCORE_MAX}
          </Text>
        )}
      </Section>

      {dossier.portrait !== null ? (
        <Section heading="Portrait alignment">
          {/* ONE SIMILARITY VOCABULARY (side-eye corpus re-pass B8). This shipped "Card ↔ art cosine: 0.25" —
              an engineer's unit with no stated scale, on a surface that says 66% for the same KIND of number
              two sections down. Same rounding as {@link Relevance}, so a reader who has learned what 74%
              means beside a neighbour does not have to learn a second scale to read this line. */}
          <Text voice="gloss">Card ↔ art match: {percent(dossier.portrait.alignment)}</Text>
        </Section>
      ) : null}

      {dossier.tags.length > 0 ? (
        <Section heading="Tags">
          <Row align="center" gap="field" className="flex-wrap">
            {dossier.tags.map((tag) => (
              <Badge key={tag} intent="neutral" size="sm">
                {tag}
              </Badge>
            ))}
          </Row>
        </Section>
      ) : null}

      {/* NO SECTION WHEN THERE IS NO PROFILE (side-eye corpus re-pass B8). "No keyword profile computed yet."
          is the readiness rail's sentence — the rail is the ONE place this section of the app says what has
          not run (`corpus-home-surface.tsx`'s own law, and its "Story themes & keywords" row states exactly
          this pass), so a heading plus that line here is the same true nothing printed twice, one drill
          deeper. A dossier with keywords shows them; a dossier without them says nothing at all. */}
      {keywords.length === 0 ? null : (
        <Section heading="Keywords">
          <BarList
            label="Keyword profile"
            items={toBarItems(
              keywords,
              (keyword) => keyword.keyword,
              (keyword) => keyword.count,
            )}
          />
        </Section>
      )}

      <Section heading="Similar characters">
        {dossier.similar.length === 0 ? (
          <Text voice="gloss">No near neighbours found.</Text>
        ) : (
          <Stack gap="row">
            {/* THE ORDER IS NOT THE PRINTED NUMBER, AND THE LIST NOW SAYS SO (side-eye corpus re-pass U3:
                "74% at position 9"). Two true numbers ride each row and only one of them is printable: the
                RANK is search's CSLS score — a hub-adjusted DISTANCE that deliberately holds back the
                library's most-connected cards, and which reads 0.00 for the five CLOSEST neighbours (see
                {@link Relevance}) — while the READOUT is the raw cosine, the only one of the two a reader
                can act on. Re-sorting by the printed percent would throw away the better ranking to make one
                column monotonic; printing the ranking number restores the all-zeros readout this surface
                already fixed once. So the list states its own sort, which is the third arm and the honest
                one. It sits OUTSIDE the `role="list"` — a list's children are listitems, not prose.

                LEAD WITH THE CLAIM THE NUMBERS SUPPORT (side-eye corpus re-pass #2, P3-1). The line opened
                "Closest first" and then spent two clauses walking it back — over a column of percents that
                visibly does NOT descend, so the first thing a reader checks is the first thing that looks
                wrong. Same two facts, ordered so the sentence survives its own evidence.

                AND IT NO LONGER HAS TO DEFEND ITSELF (side-eye populated arm 2026-08-23, [P2-2]:
                "when a list needs prose to explain why it disagrees with itself, the list is wrong, not
                the prose"). The rows print their RANK beside the percent now, so the ordering is visible
                rather than asserted, and the clause that existed only to pre-empt the contradiction
                ("so it won't descend") is gone. The sentence keeps the part that is still information —
                which of the two quantities each number is. */}
            <Text className="max-w-(--reading-measure-prose)" voice="gloss">
              Ranked by distinctive similarity; the percent beside each rank is plain card similarity.
            </Text>
            <Stack gap="row" role="list">
              {dossier.similar.map((neighbor, index) => {
                const neighborFacet = characterFacetLine(neighbor.genre, neighbor.tone);
                return (
                  <ListRow
                    key={neighbor.characterId}
                    clickable={true}
                    onClick={(): void => selectCorpusCharacter(neighbor.characterId)}
                    leading={<CharacterAvatar id={neighbor.characterId} name={neighbor.name} hash={neighbor.avatarHash} />}
                    title={neighbor.name}
                    subtitle={neighbor.elevatorPitch ?? (neighborFacet === "" ? "" : neighborFacet)}
                    actions={<Relevance rank={index + 1} value={neighbor.relevance} />}
                  />
                );
              })}
            </Stack>
          </Stack>
        )}
      </Section>

      <SimilarArtSection characterId={characterId} />

      <AskPanel characterId={characterId} />
    </Stack>
  );
}

/** The look-alike-portrait strip — `search.similarArt` seeded by this character's own avatar vector.
 *  A plain query (not suspense) so an empty/undistilled art result degrades to a muted note in place. */
function SimilarArtSection({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  return (
    <Section heading="Similar art">
      <SimilarArtBody characterId={characterId} />
    </Section>
  );
}

function SimilarArtBody({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  const trpc = useTRPC();
  const art = useQuery(trpc.search.similarArt.queryOptions({ characterId, topN: SIMILAR_ART_TOP_N }));

  if (art.isPending) {
    return <SkeletonRows count={SKELETON_ROW_COUNT} shape="avatar-row" />;
  }
  if (art.error !== null) {
    return <QueryErrorState label="the similar art" onRetry={art.refetch} />;
  }
  if (art.data.length === 0) {
    return <Text voice="gloss">No look-alike portraits found.</Text>;
  }
  return (
    <Stack gap="row" role="list">
      {art.data.map((hit, index) => (
        <ListRow
          key={hit.characterId}
          clickable={true}
          onClick={(): void => selectCorpusCharacter(hit.characterId)}
          leading={<CharacterAvatar id={hit.characterId} name={hit.name} hash={hit.avatarHash} />}
          title={hit.name}
          actions={<Relevance rank={index + 1} value={hit.relevance} />}
        />
      ))}
    </Stack>
  );
}

/**
 * Quiet metadata (§6.3 P5): a relevance readout is a readout, not a pill — inline micro/mono/muted.
 *
 * It prints `relevance` (cosine similarity, higher = closer) as a whole percent, never the CSLS `score` it
 * used to print: that is a hub-adjusted DISTANCE clamped at zero, so this strip read
 * 0, 0, 0, 0, 0, 0.006, 0.011, 0.014 for Hikari's eight nearest neighbours — the five reading zero were the
 * five CLOSEST (corpus forensics §3). The ORDER is still the server's CSLS rank.
 *
 * THE RANK IS PRINTED BESIDE IT NOW (side-eye populated arm 2026-08-23, [P2-2]), which is what lets the
 * sentence above the list stop apologising: two true numbers ride each row, the sort key was invisible, and
 * a column reading 66, 60, 62, 67, 62, 69, 63, 70 under the words "Ranked by distinctive similarity" asked
 * the reader to take the ordering on trust against the evidence in front of them. Stating the ordinal makes
 * the sequence itself the datum — the same readout the omnibox's rows now carry (`corpus-hit-rows.tsx`
 * `HitRank`), which is why the two lists finally read alike. `rank` is 1-based.
 */
function Relevance({ rank, value }: { readonly rank: number; readonly value: number }): ReactElement {
  return (
    <Text className="shrink-0 font-mono" voice="gloss">
      {rank} · {percent(value)}
    </Text>
  );
}

function AskPanel({ characterId }: { readonly characterId: CharacterId }): ReactElement {
  const trpc = useTRPC();
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState<string | null>(null);

  const answer = useQuery(trpc.discovery.askCard.queryOptions({ characterId, question: question ?? "" }, { enabled: question !== null && question !== "" }));

  const ask = (): void => {
    const trimmed = draft.trim();
    if (trimmed !== "") {
      setQuestion(trimmed);
    }
  };

  return (
    <Section heading="Ask">
      <Stack gap="block">
        <Row align="center" gap="field">
          <Input
            aria-label="Ask a question about this character"
            data-testid={testId("corpusAskInput")}
            onValueChange={setDraft}
            placeholder="What drives them? How do they treat allies?"
            value={draft}
          />
          <Button intent="primary" size="sm" data-testid={testId("corpusAskSubmit")} onClick={ask} disabled={draft.trim() === ""}>
            <Icon icon={Sparkles} size="sm" />
            Ask
          </Button>
        </Row>
        <AskAnswer isPending={answer.isFetching} hasQuestion={question !== null} error={answer.error} data={answer.data ?? null} />
      </Stack>
    </Section>
  );
}

function AskAnswer({
  isPending,
  hasQuestion,
  error,
  data,
}: {
  readonly isPending: boolean;
  readonly hasQuestion: boolean;
  readonly error: unknown | null;
  readonly data: {
    readonly answer: string;
    readonly grounded: boolean;
    readonly degraded: boolean;
    readonly sampledMessages: number;
  } | null;
}): ReactElement | null {
  if (!hasQuestion) {
    return null;
  }
  if (isPending) {
    return <Text voice="gloss">Reading the recent scenes…</Text>;
  }
  if (error !== null) {
    return <Text voice="gloss">Couldn't answer that one.</Text>;
  }
  if (data === null) {
    return <Text voice="gloss">No played scenes to answer from yet.</Text>;
  }
  const state = answerState(data);
  return (
    <Card>
      <Stack gap="field">
        <Row align="center" gap="field">
          <Badge intent={state.intent} size="sm" data-testid={testId("corpusAskState")} data-answer-state={state.key}>
            {state.label}
          </Badge>
          <Text voice="gloss">{state.gloss ?? `${data.sampledMessages} scenes sampled`}</Text>
        </Row>
        <Text>{data.answer}</Text>
      </Stack>
    </Card>
  );
}

/** THREE states, not two — `degraded` is OUR parse failing, `grounded` is the MODEL'S claim about its own
 *  answer (contract/results.ts). Showing "Speculative" for a degraded reply attributes our failure to the
 *  model and hides that the text below is unparsed raw output, so degraded wins the badge outright. */
function answerState(data: { readonly grounded: boolean; readonly degraded: boolean }): {
  readonly key: string;
  readonly label: string;
  readonly intent: "success" | "warning";
  readonly gloss: string | null;
} {
  if (data.degraded) {
    return { key: "degraded", label: "Unstructured reply", intent: "warning", gloss: "The model didn't answer in the expected shape — this is its raw text." };
  }
  if (data.grounded) {
    return { key: "grounded", label: "Grounded", intent: "success", gloss: null };
  }
  return { key: "speculative", label: "Speculative", intent: "warning", gloss: null };
}
