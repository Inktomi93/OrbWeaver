// The read-only, level-clamped member card VIEWER (D22 — @orb/contracts/chat/roster `MemberCardView`).
// Opened from a roster Cast row's "View character" action; it displays ONE roster character's card
// clamped server-side to the room's `memberCardVisibility` (the host always gets `full`). This is a
// DISPLAY, NOT the owner's card editor — no field is editable here, and macros arrive ALREADY rendered
// server-side (so the card text is shown as-is; no MacroTextarea, no raw-macro type-as-you-type surface).
//
// Clamped-away fields come back `null` (the server never sends a field above the viewer's level). A
// present section renders its content; an ABSENT section renders NOTHING except — when the section is
// clamped by visibility rather than simply empty on the card — a single quiet "hidden at this level"
// note per tier boundary, so a member SEES that more exists without leaking it. Markdown renders
// UNTRUSTED (the safe floor — a viewer looking at another owner's card gets no trusted-HTML escalation).
//
// The read is GATED on `open` (useQuery `enabled`) — never eager per roster row — and uses the plain
// (non-suspense) query so the thrown read error can be DISCRIMINATED: a transport NOT_FOUND (a
// non-participant, or a character no longer in the roster) is a TYPED gone-arm (the invite-dialog /
// dangling-pointer precedent), NEVER a swallowed catch; any other failure stays the transient Retry arm.

import { blobUrl } from "@orb/contracts/assets";
import type { MemberCardView, MemberCardVisibility } from "@orb/contracts/chat";
import { MEMBER_CARD_VISIBILITY_LEVELS } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { EmptyState } from "@orb/ui/empty-state";
import { BookOpen, Drama, EyeOff, Icon, Lock, ScrollText, SlidersHorizontal, Sparkles, Tag } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { Separator } from "@orb/ui/separator";
import { Heading, Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { testId } from "#lib";

export interface MemberCardViewerProps {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The transport-mapped domain NOT_FOUND — a stranger's chatId OR a character no longer in the roster
 *  (the `getChat`/dangling-pointer collapse). Discriminated by the code, never a bare catch. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return false;
  }
  return (error as { data?: { code?: string } }).data?.code === "NOT_FOUND";
}

export function MemberCardViewer({ chatId, characterId, open, onOpenChange }: MemberCardViewerProps): ReactElement {
  const trpc = useTRPC();
  const card = useQuery({
    ...trpc.chat.getMemberCard.queryOptions({ chatId, characterId }),
    // Gated: the key is built (and the server hit) ONLY while the dialog is open — never eager per row.
    enabled: open,
    // A card that vanished from the roster shouldn't retry a NOT_FOUND into a spinner; the transient
    // arm keeps the default retry. `retry` here is the read-level guard; the render arm decides copy.
    retry: (_count, error): boolean => !isNotFound(error),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup size="lg" data-testid={testId("memberCardViewer")}>
        <Stack gap="block" className="min-h-0">
          <MemberCardBody isError={card.isError} error={card.error} data={card.data} onRetry={(): void => void card.refetch()} />
          <Row justify="end" className="shrink-0">
            <DialogClose render={<Button intent="ghost">Close</Button>} />
          </Row>
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}

/** The load/gone/error/loaded dispatch. NOT_FOUND is its OWN typed arm (never the transient Retry). */
function MemberCardBody({
  isError,
  error,
  data,
  onRetry,
}: {
  readonly isError: boolean;
  readonly error: unknown;
  readonly data: MemberCardView | undefined;
  readonly onRetry: () => void;
}): ReactElement {
  if (isError) {
    if (isNotFound(error)) {
      return (
        <>
          <DialogTitle>Card unavailable</DialogTitle>
          <EmptyState
            icon={<Icon icon={EyeOff} size="lg" />}
            title="This card isn't available"
            description="This character has left the chat, or you no longer have access to it."
          />
        </>
      );
    }
    return (
      <>
        <DialogTitle>Character card</DialogTitle>
        <QueryErrorState label="this character card" onRetry={onRetry} />
      </>
    );
  }
  if (data === undefined) {
    return (
      <>
        <DialogTitle>Character card</DialogTitle>
        <SkeletonRows count={5} shape="line" />
      </>
    );
  }
  return <MemberCard card={data} />;
}

const VISIBILITY_LABEL: Record<MemberCardVisibility, string> = {
  "name-avatar": "Name & avatar only",
  sheet: "Card sheet",
  "sheet+lore": "Card sheet + lore",
  full: "Full card",
};

/** Whether the viewer's clamp level is AT LEAST `level` — the canonical left→right lattice (the clamp's
 *  own `rank` mirror, `MEMBER_CARD_VISIBILITY_LEVELS`). Drives which TIER is populated vs withheld; a
 *  field being `null` is NOT a reliable clamp signal (a sheet-visible card may carry an empty description). */
function atLeast(visibility: MemberCardVisibility, level: MemberCardVisibility): boolean {
  return MEMBER_CARD_VISIBILITY_LEVELS.indexOf(visibility) >= MEMBER_CARD_VISIBILITY_LEVELS.indexOf(level);
}

/** The rendered card — the always-present name/avatar hero, then the sheet / lore / full tiers, each
 *  section shown only when its field is present (non-null AND non-blank). At each TIER boundary above the
 *  viewer's level a single "hidden at this level" note appears in place of the withheld tier. */
function MemberCard({ card }: { readonly card: MemberCardView }): ReactElement {
  return (
    <Stack gap="block" className="min-h-0 overflow-y-auto">
      {/* The name renders exactly ONCE (side-eye P2): the visible name text IS the `DialogTitle` — a real
          `<h2>` that carries the accessible dialog name — sitting beside the avatar in the hero Row. No
          duplicate span beneath the title. */}
      <Row gap="row" align="center">
        <Avatar size="lg" fallbackDelay={0} hueSeed={card.characterId} {...(card.avatarHash === null ? {} : { src: blobUrl(card.avatarHash) })}>
          {initialsFor(card.name)}
        </Avatar>
        <Stack gap="field" className="min-w-0">
          <DialogTitle className="truncate">{card.name}</DialogTitle>
          <Row gap="field" align="center">
            <Badge size="sm" intent="neutral" tone="soft">
              <Icon icon={Lock} size="xs" />
              {VISIBILITY_LABEL[card.visibility]}
            </Badge>
          </Row>
        </Stack>
      </Row>

      <SheetTier card={card} />
      <LoreTier card={card} />
      <FullTier card={card} />
    </Stack>
  );
}

/** The `>= sheet` tier — gated on the viewer's clamp LEVEL (not a field null: a sheet-visible card may
 *  legitimately carry an empty description). Below `sheet` ⇒ one hidden-tier note; at/above, each field
 *  renders only when present-and-non-blank (a blank sheet field is omitted, not flagged as withheld). */
function SheetTier({ card }: { readonly card: MemberCardView }): ReactElement {
  if (!atLeast(card.visibility, "sheet")) {
    return <HiddenTierNote label="Card details" description="The host limited this card to its name and avatar." />;
  }
  return (
    <Stack gap="block">
      <ProseSection icon={ScrollText} title="Description" text={card.description} />
      <ProseSection icon={Drama} title="Personality" text={card.personality} />
      <ProseSection icon={ScrollText} title="Scenario" text={card.scenario} />
      <GreetingsSection greetings={card.greetings} />
      <ProseSection icon={Sparkles} title="Example messages" text={card.exampleMessages} />
      <TagsSection tags={card.tags} />
      <ProseSection icon={BookOpen} title="Creator's notes" text={card.creatorNotes} />
    </Stack>
  );
}

/** The `>= sheet+lore` tier. Only meaningful once the sheet tier itself is visible — a card clamped to
 *  `name-avatar` already showed one hidden note (the sheet gate), so don't stack a second. */
function LoreTier({ card }: { readonly card: MemberCardView }): ReactElement | null {
  if (!atLeast(card.visibility, "sheet")) {
    return null;
  }
  if (!atLeast(card.visibility, "sheet+lore")) {
    return <HiddenTierNote label="Lore" description="This card's world-info lore isn't shared at this level." />;
  }
  if (card.lore === null || card.lore.length === 0) {
    return null;
  }
  return (
    <SectionShell icon={BookOpen} title="Lore">
      <Stack gap="row">
        {keyedEntries(card.lore).map(({ key, text }) => (
          <Bubble key={key}>
            <Markdown trust="untrusted" mode="static">
              {text}
            </Markdown>
          </Bubble>
        ))}
      </Stack>
    </SectionShell>
  );
}

/** A positional string array (openings / lore — server-rendered, no stable id) → suppression-free React
 *  keys: an index prefix guarantees uniqueness even for duplicate entries, and the array is a read-only
 *  static render (order never reshuffles), so the index is a legitimate stable identity here. */
function keyedEntries(entries: readonly string[]): readonly { readonly key: string; readonly text: string }[] {
  return entries.map((text, index) => ({ key: `${index}:${text}`, text }));
}

/** The `== full` tier — the prompt-steering internals. Same "already showed a note" suppression as lore. */
function FullTier({ card }: { readonly card: MemberCardView }): ReactElement | null {
  if (!atLeast(card.visibility, "sheet")) {
    return null;
  }
  if (!atLeast(card.visibility, "full")) {
    return <HiddenTierNote label="Prompt internals" description="The card's system prompt and prompt-steering fields aren't shared at this level." />;
  }
  const hasDepth = card.authorsNoteDepth !== null;
  return (
    <Stack gap="block">
      <ProseSection icon={SlidersHorizontal} title="System prompt" text={card.systemPrompt} />
      <ProseSection icon={SlidersHorizontal} title="Post-history instructions" text={card.postHistoryInstructions} />
      {hasDepth ? (
        <SectionShell icon={SlidersHorizontal} title="Author's note depth">
          <Text tone="muted">{card.authorsNoteDepth} messages from the end</Text>
        </SectionShell>
      ) : null}
    </Stack>
  );
}

/** A single prose field: rendered untrusted-Markdown when present-and-non-blank, else the section is
 *  omitted entirely (an absent-on-the-card field is not "hidden" — the tier note covers real clamping).
 *  NO per-field bubble (side-eye P3): the heading + spacing carry the structure; boxing a lone prose block
 *  inside the already-elevated dialog reads as a recessed well. Bubbles are reserved for REPEATED-item
 *  sections (openings/lore) where the box disambiguates list members. */
function ProseSection({ icon, title, text }: { readonly icon: typeof ScrollText; readonly title: string; readonly text: string | null }): ReactElement | null {
  if (text === null || text.trim() === "") {
    return null;
  }
  return (
    <SectionShell icon={icon} title={title}>
      <Markdown trust="untrusted" mode="static">
        {text}
      </Markdown>
    </SectionShell>
  );
}

function GreetingsSection({ greetings }: { readonly greetings: readonly string[] | null }): ReactElement | null {
  const present = (greetings ?? []).filter((g) => g.trim() !== "");
  if (present.length === 0) {
    return null;
  }
  return (
    <SectionShell icon={Sparkles} title={present.length === 1 ? "Opening" : "Openings"}>
      <Stack gap="row">
        {keyedEntries(present).map(({ key, text }) => (
          <Bubble key={key}>
            <Markdown trust="untrusted" mode="static">
              {text}
            </Markdown>
          </Bubble>
        ))}
      </Stack>
    </SectionShell>
  );
}

function TagsSection({ tags }: { readonly tags: readonly string[] | null }): ReactElement | null {
  if (tags === null || tags.length === 0) {
    return null;
  }
  return (
    <SectionShell icon={Tag} title="Tags">
      <Row gap="field" align="center" className="flex-wrap">
        {tags.map((tag) => (
          <Badge key={tag} size="sm" intent="neutral" tone="soft">
            {tag}
          </Badge>
        ))}
      </Row>
    </SectionShell>
  );
}

/** The "hidden at this visibility level" affordance — a subtle, quiet note (never an empty box, never a
 *  crash) telling the viewer a tier of the card exists but isn't shared with them. One per clamped tier. */
function HiddenTierNote({ label, description }: { readonly label: string; readonly description: string }): ReactElement {
  return (
    <Stack gap="row" data-testid={testId("memberCardHiddenNote")}>
      <Separator />
      <Row gap="field" align="center">
        <Icon icon={EyeOff} size="sm" className="text-muted-foreground" />
        <Stack gap="field" className="min-w-0">
          <Text as="span" size="label" weight="medium" tone="muted">
            {label} hidden
          </Text>
          <Text size="micro" tone="muted">
            {description}
          </Text>
        </Stack>
      </Row>
    </Stack>
  );
}

function SectionShell({ icon, title, children }: { readonly icon: typeof ScrollText; readonly title: string; readonly children: ReactNode }): ReactElement {
  return (
    <Stack gap="field" data-slot="member-card-section">
      {/* A REAL `<h3>` (side-eye P2 a11y): section titles land in the ARIA heading tree so an SR user
          navigates the card by heading. Visual style is UNCHANGED — the label size/weight/muted/caps
          skin is preserved via the Heading overrides; only the element rank changes. */}
      <Row gap="field" align="center">
        <Icon icon={icon} size="sm" className="text-muted-foreground" />
        <Heading level={3} size="label" weight="medium" tone="muted" transform="caps">
          {title}
        </Heading>
      </Row>
      {children}
    </Stack>
  );
}

function Bubble({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <Stack gap="row" className="rounded-card bg-ai-bubble p-block">
      {children}
    </Stack>
  );
}
