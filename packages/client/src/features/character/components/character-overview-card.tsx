// The CONTEXT Field tab's RESTING state — an overview instrument card, not an empty state. The context
// panel is INSTRUMENT tier (UI-Density-Law §3.1: "read-mostly, glanceable, many data per cm²"), and a
// panel that opens to 480×1000px of "Open a field to inspect it" beside a data-rich editor fails its tier
// (stickler 2026-08-01 F4).
//
// IT CARRIES WHAT CONTENT DOES NOT (#513, side-eye 2026-08-22 rail-characters P2-4 — "the context pane is a
// read-only echo"). The card shipped as Tokens · Openings · Tags · Chats over Origin, and at 1280px with the
// editor open FOUR of those printed twice on one screen: the header's `1257 total · 1017 permanent`, the
// hero's `@handle`, its `1 chat ›`, the tags row, and the greeting pills that ARE the openings count. A pane
// spending 384px restating what is 300px to its left has not found a job. So the echo group is gone and the
// rows that replaced it are the ones CONTENT never shows:
//
//   ORIGIN    where this card came from — added / source / card quality (handle dropped: the hero prints it)
//   ACTIVITY  when you two last spoke — the one chat fact the hero's count does NOT state
//   TAGS      what she is filed under, read-only (the editing strip stays in the CONTENT hero)
//
// THE F4 RULING SURVIVES, ITS INPUT CHANGED. F4 refused a panel with NOTHING to inspect; it never required
// these particular datums, and a card of three groups is still an instrument. The pick-a-field instruction
// stays the FOOTER gloss.
//
// #513'S OWN LINKS + OPTIONS GROUPS ARE GONE, AND THAT RULING SURVIVES TOO — ITS INPUT CHANGED (#860, owner
// 2026-08-30). They were minted here as "the Links TAB's data, one glance ahead of it" and "the Options
// TAB's, likewise", which was right while those tabs were a strip away and this card was the pane's only
// resting content. Two things then broke it: the 2026-08-30 delta pass measured `Links` and `Options`
// rendering as a section INSIDE this tab *and* as their own tabs, simultaneously visible in one 384px pane
// (two homes for one concept, the exact IA defect the card was built to avoid), and the context-panel
// program moved every tab onto a persistent foot rail — so the tab they previewed is now one thumb-tap
// away, and a preview of a control that is always on screen is chrome, not a glance.
//
// COST, NOW: one read — `character.get` (which carries `tags`) plus the `chat.listChats` page-of-one. The
// `worldInfo.listForCharacter` + `persona.listConnectedToCharacter` pair left with the Links group.
//
// Voice: the four-voice grammar (§2.3) the rpg tabs set — a caps-micro KICKER with a hairline names each
// group, a muted LABEL names each datum, the value is a mono/tabular DATUM, and the quiet second line is a
// GLOSS.

import type { CharacterProvenance } from "@orb/contracts/character";
import { parsePluginImportedFrom } from "@orb/contracts/character";
import type { CharacterId } from "@orb/kit/ids";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { QueryErrorState, useTRPC } from "#data";
import { deriveChatTitle, timeLib } from "#lib";
import { EMPTY_VALUE } from "../lib/empty-vocabulary.ts";

const REFINERY_SCORE_DECIMALS = 2;

/** The card wants her newest thread's stamp, and that is all — the smallest page that carries it. */
const NEWEST_THREAD_ONLY = 1;

/** How many names a link row spells out before it summarizes the rest. */
const NAME_GLOSS_LIMIT = 4;

/** A time fact with no answer is NEVER, which is a different claim from an empty slot (`EMPTY_VALUE`). */
const NEVER = "Never";

export interface CharacterOverviewCardProps {
  readonly characterId: CharacterId;
}

/** The Field tab at rest: where this card CAME FROM, what it is linked to, how it renders, and when you two
 *  last spoke — with the pick-a-field hint demoted to the footer. */
export function CharacterOverviewCard({ characterId }: CharacterOverviewCardProps): ReactElement {
  const trpc = useTRPC();
  const { data, isError, refetch } = useQuery(trpc.character.get.queryOptions({ characterId }));
  // HER page-of-one (2026-08-09): `items[0]` is her newest-updated thread, and the list's own order is
  // last-activity — so that row IS the last time you two spoke, and it is the same row the chats projection's
  // identity gloss reads, so the two surfaces cannot print different "last" times.
  const chatsQuery = useQuery(trpc.chat.listChats.queryOptions({ characterId, limit: NEWEST_THREAD_ONLY }));

  // A FAILED READ IS NOT A SLOW ONE (#1500). `data === undefined` used to be the only branch, so once the
  // client's two retries were spent the card sat on "Loading…" forever with no recovery but a page reload —
  // the panel's whole content, stuck, claiming to be working. The error arm comes FIRST because it is the
  // narrower claim: `isError` implies `data === undefined`, never the reverse.
  if (isError) {
    return <QueryErrorState label="this character" onRetry={(): void => void refetch()} />;
  }
  if (data === undefined) {
    return <Text voice="quiet">Loading…</Text>;
  }

  const newest = chatsQuery.data?.items[0];
  const lastMessageAt = newest === undefined ? null : (newest.lastMessageAt ?? newest.updatedAt);
  // The ACCEPTED chips as the card wears them — hidden-on-card tags are excluded here for the same reason
  // the hero's strip excludes them: a tag hidden on the card is not part of what this card SAYS it is.
  const tagNames = data.tags.filter((tag) => !tag.isHiddenOnCard).map((tag) => tag.name);

  return (
    <Stack gap="section" className="relative min-h-0 overflow-y-auto overscroll-contain" data-slot="character-overview">
      {/* THE INSTRUCTION LEADS THE PANE (side-eye 2026-09-02 nit 27, #1139). This line explains what the pane
          DOES — pick a field over there, read it here — and it sat BELOW Origin, Activity and Tags, i.e.
          after everything it introduces, where a reader who needed it had already scrolled past the answer.
          It moves; nothing else about it does. It is still the one place the character's own NAME is spoken
          in this pane (the rule below survives: a kicker names a SECTION, never a datum, §2.3), which is why
          it stays a gloss run with the name as inline emphasis rather than becoming a heading. */}
      <Text voice="gloss">
        Pick a field on{" "}
        {/* RATIFIED raw axes (#573): this is INLINE EMPHASIS inside another voice's run, not a voice of its
            own — every voice re-spells size and color, so one here would break the sentence it sits in. It
            carries `gloss`'s own micro step plus the weight and foreground ink that make the name stand out. */}
        <Text as="span" size="micro" weight="semibold">
          {data.name}
        </Text>{" "}
        to inspect it here.
      </Text>

      <Stack gap="row">
        <Kicker>Origin</Kicker>
        <OverviewRow label="Added" value={timeLib.formatRelative(data.createdAt)} mono={false} />
        {/* A URL reads as a measurement (mono); the two phrases read as prose — `OverviewRow`'s own rule. */}
        <OverviewRow label="Source" value={sourceLabel(data)} mono={data.provenance === "imported"} />
        {data.refinery === null || data.refinery.score === null ? null : (
          <OverviewRow label="Card quality" value={data.refinery.score.toFixed(REFINERY_SCORE_DECIMALS)} mono={true} />
        )}
      </Stack>

      <Stack gap="row">
        <Kicker>Activity</Kicker>
        {/* RECENCY, NOT A CENSUS: the hero's "N chats ›" is the count, 300px away and always on screen.
            AND IT NAMES THE THREAD (#878 F13, side-eye 2026-08-30). It printed a bare date (`Aug 2, 2026`)
            where the mock draws `Example — Midnight Run · 3h`: "which chat" is the fact a reader can act
            on, and "which day" is the one they cannot. The name rides the row grammar's own GLOSS slot —
            the same shape the Tags row uses (datum on the right, names underneath) — and the value stays
            the recency, through the ONE `timeLib` display seam (probe-mode-frozen, so a snapshot diff does
            not churn every minute). `deriveChatTitle` is the ONE title derivation, so an untitled thread
            falls back to her name here exactly as it does in the topbar and the band. */}
        <OverviewRow
          label="Last chat"
          value={lastMessageAt === null ? NEVER : timeLib.formatRelative(lastMessageAt)}
          {...(newest === undefined ? {} : { gloss: deriveChatTitle(newest.title, [data.name]) })}
          mono={false}
        />
      </Stack>

      <Stack gap="row">
        <Kicker>Tags</Kicker>
        {/* READ-ONLY, on purpose (#860): the editing strip — accepted chips with their removes, `Add tag`,
            and the suggestion pills — stays in the CONTENT hero, where the tags sit ON the card the way the
            reader sees them. This is the same fact stated as a datum, so the pane can answer "what is she
            filed under" without the reader leaving the field they are inspecting. The count is the datum
            and the names are the gloss, matching every other row here; `EMPTY_VALUE` is the house word. */}
        <OverviewRow
          label="Applied"
          value={tagNames.length === 0 ? EMPTY_VALUE : String(tagNames.length)}
          {...(tagNames.length === 0 ? {} : { gloss: nameGloss(tagNames) })}
          mono={tagNames.length > 0}
        />
      </Stack>
    </Stack>
  );
}

/** What the SHIPPED example cards say for `Source`. */
const SHIPPED_SOURCE = "Example — shipped with Orbweaver";
/** …and what a card the owner really did author here says. */
const AUTHORED_SOURCE = "Made here";
/** The `imported` arm's word when the URL is absent. `characterProvenanceOf` derives `imported` FROM a
 *  non-null `importedFrom`, so the two are correlated — but that correlation lives in the derivation, not in
 *  the type, so the arm still owes a string. */
const IMPORTED_SOURCE = "Imported";

/**
 * WHERE THIS CARD CAME FROM — the import URL if it was imported, `Example — shipped with Orbweaver` if it is
 * one of the app's own default cards, `Made here` otherwise.
 *
 * THE THIRD ARM IS THE FIX (side-eye 2026-08-30 rail-characters P3, #843). The row was
 * `importedFrom ?? "Made here"`, a two-arm claim on a three-arm fact — so on a FRESH INSTALL every one of
 * the ten shipped example characters told the user they had made it, on the one card whose entire job is
 * provenance, in the state every new user sees first.
 *
 * THAT RULING SURVIVES; ITS INPUT CHANGED (#865). The three arms are unchanged — what moved is WHO DECIDES
 * which one applies. This function used to re-derive the verdict here from `creator` + `importedFrom`; the
 * server now derives it ONCE (`characterProvenanceOf`, contracts) and projects `provenance` onto BOTH read
 * models, because the library LIST row needed the same verdict and carried neither raw column. So this is a
 * DISPATCH now, exhaustive over the closed union: a fourth provenance fails `tsc` here rather than falling
 * out as a wrong label. The `imported` arm still prints the URL — that string is the answer when we have it.
 */
function sourceLabel({ provenance, importedFrom }: { readonly provenance: CharacterProvenance; readonly importedFrom: string | null }): string {
  switch (provenance) {
    case "imported": {
      // A PLUGIN-FUNNEL import (#1702, e.g. the Card Atlas hub browser) stamps `importedFrom` as
      // `plugin:<pluginId>:<contentHash>` — a deterministic, unspoofable identity string, but not one a
      // reader should ever see raw. Print the plugin instead; a file-upload import still shows its filename.
      const plugin = parsePluginImportedFrom(importedFrom);
      return plugin === null ? (importedFrom ?? IMPORTED_SOURCE) : `Imported via ${plugin.pluginId}`;
    }
    case "shipped":
      return SHIPPED_SOURCE;
    case "authored":
      return AUTHORED_SOURCE;
    default:
      return assertNeverProvenance(provenance);
  }
}

function assertNeverProvenance(provenance: never): never {
  throw new Error(`unhandled character provenance: ${String(provenance)}`);
}

/** `rpg · noir · +3 more` — names the entries a glance can hold, counts the tail. */
function nameGloss(names: readonly string[]): string {
  const head = names.slice(0, NAME_GLOSS_LIMIT).join(" · ");
  const rest = names.length - NAME_GLOSS_LIMIT;
  return rest > 0 ? `${head} · +${rest} more` : head;
}

/** The §2.3 KICKER voice — a muted caps-micro group name with a trailing hairline (the rpg tabs' anatomy). */
function Kicker({ children }: { readonly children: string }): ReactElement {
  return (
    <Row gap="field" align="center">
      <Text voice="kicker" className="truncate">
        {children}
      </Text>
      <Separator className="flex-1" />
    </Row>
  );
}

/** One LABEL / DATUM pair with an optional GLOSS second line. `mono` is the datum's numeric skin — a
 *  measurement reads in mono tabular figures, a phrase ("Made here", "3m ago") reads as prose.
 *
 *  THE PAIR IS BOUND, NOT ADJACENT (side-eye 2026-09-02 F14). The region rendered as a flat run of sibling
 *  paragraphs — `Added` · `2d ago` · `Source` · `Example — shipped with Orbweaver` · … — with nothing tying a
 *  value to its label: correct only if you read them in visual order, which is exactly what a screen-reader
 *  user cannot rely on. The ROW is a `group` named by its own label, so the value is announced inside
 *  something that says what it is.
 *
 *  NOT `aria-labelledby` ON THE VALUE, which is what the review proposed and what this first shipped as: the
 *  value renders as a `<p>`, whose `paragraph` role is name-PROHIBITED, so the attribute is inert — measured
 *  in the CT, `toHaveAccessibleName` returned `""` with the `aria-labelledby` present on the element. `group`
 *  supports naming from the author and is the shape a label/value pair actually is. `dl`/`dt`/`dd` would be
 *  the other honest answer and is not reachable here: it needs raw HTML carrying classNames, which is exactly
 *  what the layout primitives exist to prevent, and they are `div`-only by design. */
function OverviewRow({
  label,
  value,
  gloss,
  mono,
}: {
  readonly label: string;
  readonly value: string;
  readonly gloss?: string | undefined;
  readonly mono: boolean;
}): ReactElement {
  const labelId = useId();
  return (
    <Stack aria-labelledby={labelId} data-slot="overview-row" gap="field" role="group">
      <Row gap="block" align="baseline" justify="between">
        {/* The grammar's name/value pair (#573): the row's own MUTED name rides className, because `tone`
            is declared before `voice` and loses the merge — the ratified spelling for an intentional tone.
            The value is a `datum` when it is mono/tabular and a `label` otherwise; both were spelled
            `size="label"` before, which is the A3-red internal axis. */}
        <Text voice="label" className="min-w-0 truncate text-muted-foreground" id={labelId}>
          {label}
        </Text>
        <Text voice={mono ? "datum" : "label"} className="shrink-0">
          {value}
        </Text>
      </Row>
      {gloss === undefined ? null : (
        <Text voice="gloss" className="min-w-0 break-words">
          {gloss}
        </Text>
      )}
    </Stack>
  );
}
