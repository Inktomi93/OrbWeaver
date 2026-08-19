// The corpus omnibox's ROW RENDERERS — one component per result branch, plus the relevance readout and the
// two helpers only they use. Split out of `corpus-search-results.tsx` (the renderer was over the client
// component-size cap again once the image row grew its thumbnail and its conditional door); that file keeps
// the QUERIES and the branch dispatch, this one keeps what a hit LOOKS like. The seam is the same one
// `../lib/corpus-result-text.ts` was cut on, one level up: text projection → row → query.
//
// ── A MEMORY IS A DOOR (corpus forensics 2026-08-18 §2, R1a) ───────────────────────────────────────────
// The Memories row was a "read-only preview": a static div over a `chatId` the wire already carried, whose
// subtitle was that id's last six characters. The retrieval underneath it is the best thing on this surface
// (five for five on checkable queries), and the row threw away every way to act on it. It now OPENS the
// room — `setActiveSection("chats")` + `selectChat`, the same two lines the notification bell uses — and
// names it through the ONE title chain (`deriveChatTitle`: authored title → cast → "Untitled chat"), with
// the digest's own scoped character as the cast rung.
//
// LANDING ON THE MESSAGE is deliberately NOT here. `MessageListHandle` exposes no scroll-to-index outside
// pin-prompt mode, and a digest's `blockIdx` is an index into fixed-width BLOCKS of a chat's whole history,
// which a paged transcript cannot address without the block size and the pages in between. Chat-level is the
// honest v1; the moment-level landing belongs to the moment artifact.
//
// ── THE NUMBER GOES THE RIGHT WAY (§3, R2b) ────────────────────────────────────────────────────────────
// The badge rendered `hit.score` — the server's CSLS-adjusted cosine DISTANCE, clamped at 0 — so every
// genuinely relevant hit read `0.00` and only a nonsense query produced anything non-zero. It now reads
// `hit.relevance` (`1 − distance`, higher = closer) as a percent. The ORDER is still the server's CSLS rank;
// this seam only decides what the reader is shown, which is why there is exactly one `RelevanceBadge`.
//
// NO `data-testid` ON A `ListRow`. Four of them once sat here and reached the DOM in exactly one place: the
// primitive builds its body from named props and forwards no rest props, so `data-testid` on a `<ListRow>`
// is dropped silently. The rows are addressed by role + accessible name instead, which is also what a user
// meets them as.

import { blobIconUrl } from "@orb/contracts/assets";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Icon, Images, MessagesSquare } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { testId } from "#lib";
import { selectChat, selectCorpusCharacter, setActiveSection } from "#state";
import { characterFacetLine } from "../lib/character-facet.ts";
import type { EvidenceRoom } from "../lib/corpus-result-text.ts";
import { chatSubtitle, evidenceScent, groupEvidenceByPassage, roomNumberingHint, snippetForDisplay } from "../lib/corpus-result-text.ts";
import { percent } from "../lib/corpus-vocabulary.ts";
import { CharacterAvatar } from "./character-avatar.tsx";

type UnifiedResult = inferOutput<Trpc["search"]["search"]>;
type DiscoverHit = Extract<UnifiedResult, { over: "discover" }>["hits"][number];

/** The unworn image row's thumbnail rung, in DEVICE pixels — `CharacterAvatar`'s `sm` ask, so the two rows
 *  in one result list request the same variant and draw at the same size. */
const UNWORN_THUMB_WIDTH = 48;

/** A distilled character card hit — click selects it into the dossier CONTENT. */
export function CharacterHitRow({
  characterId,
  name,
  avatarHash,
  genre,
  tone,
  pitch,
  relevance,
}: {
  readonly characterId: DiscoverHit["characterId"];
  readonly name: string;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly pitch: string | null;
  /** null on the LEXICAL branch: BM25 is an unbounded per-query score, not a similarity, so there is no
   *  honest percent to print for it — the rank order carries what a reader can use (R2a for that one arm). */
  readonly relevance: number | null;
}): ReactElement {
  const facet = characterFacetLine(genre, tone);
  const subtitle = pitch ?? (facet === "" ? "No pitch distilled" : facet);
  return (
    <ListRow
      clickable={true}
      onClick={(): void => selectCorpusCharacter(characterId)}
      leading={<CharacterAvatar id={characterId} name={name} hash={avatarHash} />}
      title={name}
      subtitle={subtitle}
      actions={relevance === null ? undefined : <RelevanceBadge relevance={relevance} />}
    />
  );
}

/**
 * A lived-scene discovery hit — the character, then its evidence: one PASSAGE per body, with a door into
 * every room that passage turned up in.
 *
 * THE EVIDENCE IS THE UNIT, NOT THE ROOM (side-eye corpus re-pass 2026-08-19, P1-1). This grouped by CHAT —
 * a room header, then its snippets — so a duplicated room (an import run twice, a branched chat) printed the
 * byte-identical 220-char passage once per room. The audited surface showed three doors each over the same
 * excerpt, which a reader meets as a broken search rather than as three rooms. Inverting the grouping keeps
 * every room reachable (nothing is dropped, unlike the Memories branch's first-wins dedupe) while stating
 * each distinct piece of evidence exactly once. `../lib/corpus-result-text.ts` owns the grouping.
 *
 * THE ROOMS ARE DOORS AND NOW LOOK LIKE IT (P2-2). They were borderless, centred, body-coloured `ListRow`
 * titles — the shape of a heading, so the one drill-through on this branch read as a section label. The
 * vocabulary is the surface's own established door ("All families →"): left-aligned, muted, trailing arrow.
 */
export function DiscoverHitRow({ hit }: { readonly hit: DiscoverHit }): ReactElement {
  const passages = groupEvidenceByPassage(hit.segments, hit.name);
  const rooms = new Set(hit.segments.map((segment) => segment.chatId)).size;
  return (
    <Stack gap="field" role="listitem">
      <ListRow
        clickable={true}
        onClick={(): void => selectCorpusCharacter(hit.characterId)}
        leading={<CharacterAvatar id={hit.characterId} name={hit.name} hash={hit.avatarHash} />}
        title={hit.name}
        subtitle={evidenceScent(hit.matchCount, passages.length, rooms)}
        // THE HONESTY LINE MUST SURVIVE THE COLUMN (P2-3). It clipped to "…— showin" at the 221px LIST pane
        // (scrollWidth 282 vs 213): a sentence whose whole job is to say what the list below does NOT show,
        // cut before it could say it. The Memories row already wraps its body for the same reason.
        subtitleWrap={true}
        actions={<RelevanceBadge relevance={hit.relevance} />}
      />
      <Stack className="pl-gutter" gap="row" data-testid={testId("corpusDiscoverEvidence")}>
        {passages.map((passage) => (
          <Stack gap="tight" key={passage.snippet}>
            <Text voice="gloss">“{passage.snippet}”</Text>
            <Row className="flex-wrap" gap="field">
              {passage.rooms.map((room) => (
                <RoomDoor key={room.chatId} room={room} />
              ))}
            </Row>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

/** One room a passage came from, as the door it is. The `title` tooltip fires only on a numbered room name,
 *  which is the one case the label cannot explain itself (P3-6 — see `roomNumberingHint`). */
function RoomDoor({ room }: { readonly room: EvidenceRoom }): ReactElement {
  return (
    <Button className="max-w-full justify-start" intent="ghost" onClick={(): void => openChat(room.chatId)} size="sm" title={roomNumberingHint(room.title)}>
      <Text as="span" className="min-w-0 truncate text-muted-foreground" voice="label">
        {room.title}
      </Text>
      {/* Decoration: the arrow says "this goes somewhere" to the eye, and repeating it in the accessible
          name would announce a glyph where the room's name belongs. */}
      <Text aria-hidden={true} as="span" className="shrink-0 text-muted-foreground" voice="label">
        →
      </Text>
    </Button>
  );
}

/** A memory (digest) hit — the room it happened in, the memory itself, and the door into that room.
 *
 * THE ROOM IS THE NAME, THE MEMORY IS THE BODY (side-eye re-pass U2). This row had it inverted: `title` was
 * the whole digest, so the row's primary line held 8030px of text inside a 221px column — 97% of it
 * invisible — and, because a clickable `ListRow`'s title IS its accessible name, the button announced 1154
 * characters (axe `label-content-name-mismatch`, WCAG 2.5.3: the spoken name has to contain the read label,
 * and nothing here could read it). Twenty rows all opened with the same bracketed header, which is why five
 * of them were visually indistinguishable.
 *
 * Swapped: the ROOM names the row (short, speakable, and the thing the click actually opens), and the digest
 * becomes the two-line clamped body — where two rows from ONE room still read apart, because the clamp shows
 * two lines of the memory instead of one clipped line of its header. No date is invented: `DigestSourceHit`
 * carries no timestamp of its own and says why in its own contract header — whatever date a room's title
 * holds is the room's authored name, which arrives here for free through the ONE title chain.
 *
 * The digest goes through the shared preview projection first, for the same reason the Scenes snippet does:
 * a digest is raw model prose, and its markdown would render as literal syntax in the body line. */
export function DigestHitRow({
  chatId,
  chatTitle,
  scopedCharacterName,
  text,
  relevance,
}: {
  readonly chatId: ChatId;
  readonly chatTitle: string | null;
  readonly scopedCharacterName: string | null;
  readonly text: string;
  readonly relevance: number;
}): ReactElement {
  return (
    <ListRow
      clickable={true}
      onClick={(): void => openChat(chatId)}
      leading={<Icon icon={MessagesSquare} size="sm" />}
      title={chatSubtitle(chatTitle, scopedCharacterName)}
      subtitle={snippetForDisplay(text)}
      subtitleWrap={true}
      actions={<RelevanceBadge relevance={relevance} />}
    />
  );
}

/**
 * An image hit — the picture it found, and the character wearing it when one does.
 *
 * WHAT THIS REPLACED (side-eye corpus re-pass U4): twenty rows with a generic glyph, no image, no button and
 * `cursor: auto`, in the exact ListRow geometry as the Memories rows that ARE doors — an image search that
 * showed no images and a dead end dressed as a live one. The old note here claimed `ImageSearchHit` "carries
 * no asset hash and no owning character"; the wire always carried `assetId`, the scan always joined `assets`,
 * and `characters.avatarAssetId` is the owning-character edge. Both now ride the hit (search's
 * `contract/results.ts`), so the row shows the blob and lands on the dossier — the same
 * `selectCorpusCharacter` door every other character row on this surface is.
 *
 * AN ASSET NOBODY WEARS STAYS A PREVIEW, and looks like one: no `clickable`, so no button, no pointer, no
 * hover — and the subtitle says WHY rather than leaving the reader to discover it by clicking. The
 * family-map precedent holds (a thing becomes a door when there is somewhere to land, not before); what
 * changed is that most of these do have somewhere to land, and a thumbnail with a dead click would be the
 * original defect wearing better clothes.
 */
export function ImageHitRow({
  hash,
  caption,
  characterId,
  characterName,
  relevance,
}: {
  readonly hash: string;
  readonly caption: string | null;
  readonly characterId: CharacterId | null;
  readonly characterName: string | null;
  readonly relevance: number;
}): ReactElement {
  if (characterId === null) {
    return (
      <ListRow
        leading={
          // No `alt`: the row's TITLE is already this image's caption, and naming the thumbnail with the
          // same words would announce it twice (`CharacterAvatar` leaves it empty for the same reason).
          //
          // THE SAME RUNG, AND THE SAME BOX, AS THE ROWS BESIDE IT (P3-7). This asked the CAS route for the
          // FULL-SIZE original (`blobUrl`) at the Avatar's default size, so the dead rows in a result list
          // both decoded a 1840x2752 PNG for a thumbnail and rendered LARGER than the live rows above them —
          // the C6 rung fix landed on `CharacterAvatar` and this row is the one that does not draw through
          // it. `sm` + 48 device pixels is exactly what that component asks for at this display size.
          <Avatar hueSeed={hash} shape="rounded" size="sm" src={blobIconUrl(hash, UNWORN_THUMB_WIDTH)}>
            <Icon icon={Images} size="sm" />
          </Avatar>
        }
        title={caption ?? "Uncaptioned image"}
        subtitle="No card uses this image — nothing to open"
        actions={<RelevanceBadge relevance={relevance} />}
      />
    );
  }
  return (
    <ListRow
      clickable={true}
      onClick={(): void => selectCorpusCharacter(characterId)}
      leading={<CharacterAvatar hash={hash} id={characterId} name={characterName ?? ""} />}
      title={characterName ?? "Untitled card"}
      subtitle={caption ?? "Uncaptioned image"}
      actions={<RelevanceBadge relevance={relevance} />}
    />
  );
}

/** Open the room a hit came from: the corpus's one cross-section destination, spelled exactly as chat's own
 *  callers spell it (`notification-bell.tsx`) — section first, then the room, so CONTENT is already showing
 *  chats when the active chat changes. */
function openChat(chatId: ChatId): void {
  setActiveSection("chats");
  selectChat(chatId);
}

// Quiet metadata (§6.3 P5): a relevance readout is a readout, not a pill — inline micro/mono/muted text,
// matching the similarity-tab PairRow score and the N3 message-metadata treatment.
//
// A WHOLE PERCENT, not two decimals of a unit nobody has: `relevance` is a cosine similarity, and the digit
// that would distinguish 0.8813 from 0.8809 is noise a reader cannot act on. The percent also reads
// higher-is-better without a legend, which the clamped distance it replaced never could.
function RelevanceBadge({ relevance }: { readonly relevance: number }): ReactElement {
  return (
    <Text voice="gloss" className="shrink-0 font-mono">
      {percent(relevance)}
    </Text>
  );
}
