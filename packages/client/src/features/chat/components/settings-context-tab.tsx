// The consolidated "This chat" CONTEXT tab body — everything a host bends for THIS chat,
// in ONE tab whose body is grouped sections (`Section` primitive, real h3 headings).
//
// THE PANE IS INSTRUMENT TIER, SO THE SECTIONS SPEAK IN THE KICKER VOICE (UI-Density-Law §2.3/§3.1 —
// "CONTEXT panel viewport (rpg tabs, meta tabs)" is named there explicitly; side-eye 08-01 F8). They shipped
// on `heading` — the FORM-tier h3, 16px/500 — inside the same pane where every rpg section names itself in
// micro-caps over a hairline, so the meta tabs wore settings-modal clothes in an instrument. `kicker` is the
// same `<h3>` (the document outline is unchanged) in the tier's own voice.
//
// D-1 (owner ruling 2026-07-31, `docs/history/design/context-panel-fidelity-findings.md` §2/§4): the merge had
// stacked FIVE unrelated concerns in one flat list ("a whole menu got garbled together"). The HOST-OPS trio
// — Background · Group behavior · Tool use — now sits under its own "Host controls" group, which is also
// exactly the permission line: everything above it any member may set, everything inside it is host-only.
//
// The former "Appearance overrides" tab and the separate "Injections" meta-tab were the same
// family ("what I'm bending for this chat"), so they merge here: "Field overrides" (the collapse-until-
// needed override rows), "Injections" (the manual prompt-injection list, folded in from its deleted tab),
// and "Background" (the per-chat decorative background). The host-only Group-behavior + Tool-use sections
// (Context-Panel-Program §1 CP-1) ride along below, each gated at SECTION granularity — the §8.1
// permission-OMIT, moved from tab-level so the tab strip stays slim without dropping a control.
//
// D-4 (databank-surface-spec): "Documents" — the per-chat databank rack + the D85 host visibility toggle —
// lands directly AFTER Injections. Same family ("extra content entering this room's prompt"), and it is
// member-READABLE, so it belongs above the host-only band rather than inside it.
//
// "WORLD BOOKS" LANDS DIRECTLY AFTER IT (#640) — the same family one step further, and member-readable for the
// same reason (`worldInfo.listForChat` is `requireChatMember`). It is also the WRITE surface that had no
// client affordance at all: `chat_books` rows were server-written only, so the automation rule-preset's
// lorebook picker had an empty list in every fresh room and nowhere to send the host.
//
// FOREIGN SECTIONS GRAFT INTO THE HOST-OPS BAND (#616, owner ruling 2026-08-24). The tab body is the
// house's one sectioned per-chat-configuration pane, so a foreign feature's per-chat knobs belong IN it —
// not in a tab of their own beside it. `sections` is the §6c `ChatSettingsSectionContribution` registry
// (assembled at `compose/authed-app.tsx`, threaded through `makeChatsSection`); this file renders each
// contribution in its own `<Section kicker>` at the end of the host band, and imports NOTHING from the
// contributing feature (`client-features-no-cross`). Automation's Rules is the first tenant — it shipped
// as a 5th host TAB and was retired to a section here in the same change.
//
// THE DRAFT TWIN IS GONE (chat-creation-draft-mode-replacement.md §4.9, R1). `DraftSettingsTab` rendered
// draft-config-store-backed copies of Field overrides / Injections / Group behavior for a room with no
// server row — and could not offer Background, Documents, Macro picks, Appearance or Tool use at all,
// because each needs a `chatId`. The room has one from the creation click, so this tab is the whole tab in
// every phase, and the four sections a pre-send room could not show are simply present.

import type { RoomOverrides } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Stack } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import type { ChatSettingsSectionContribution, ChatSettingsSectionState, ContributorRegistry } from "#lib";
import { ChatBooksSection } from "./chat-books-section.tsx";
import { DisclosureSection } from "./chat-context-disclosure-section.tsx";
import { ChatDocumentsSection } from "./chat-documents-section.tsx";
import { CommittedGroupConfigTab } from "./group-config-form.tsx";
import { InjectionsManager, InjectionsSkeleton } from "./injections-manager.tsx";
import { MacroPicksSection } from "./macro-picks-section.tsx";
import { OfferChoicesControl } from "./offer-choices-control.tsx";
import { CharactersCanReactControl, ReactionsEnabledControl } from "./reaction-toggles.tsx";
import { RegexHeading, RegexSection } from "./regex-section.tsx";
import { ChatBackgroundSection, RoomOverridesTab } from "./room-overrides-tab.tsx";
import { ToolRecurseControl } from "./tool-recurse-control.tsx";

// The Group-behavior form's initially-visible control rows (reply-mode + 2 switches + Advanced trigger).
const GROUP_SECTION_SKELETON_ROWS = 4;

// The Macro-picks empty state's prose lines at the pane's width (#823) — see the fallback for why it is the
// shape this section reserves for.
const MACRO_PICKS_SKELETON_ROWS = 3;

// A section-heading with an at-a-glance kicker-count chip — the label plus a small soft
// badge when the count is non-zero (a "0" chip is noise). Rendered as the Section's `heading` ReactNode, so
// its content lands INSIDE the <h3>; the count rides the heading's accessible name ("Injections 3"). Only
// phrasing content here (a Badge is an inline span) — never a Row/div, which is illegal inside a heading.
//
// `size="inline"` (#829, not `sm`) — the count's arrival is a PAINT, not a layout: `sm` is `inline-flex`
// with its own type axes, so on arrival it more than doubled the kicker's line box (13.125px → 30.25px,
// #821), shoving every section below by that much on THREE kickers (Injections/Documents/World books). The
// `inline` arm inherits the kicker's own font-size/line-height instead of establishing a flex box, so the
// line box is identical whether the badge is absent or present.
function HeadingWithCount({ label, count, unit }: { readonly label: string; readonly count: number; readonly unit?: string }): ReactNode {
  return (
    <>
      {label}
      {count > 0 ? (
        <>
          {" "}
          <Badge intent="neutral" size="inline" tone="soft">
            {count}
            {unit}
          </Badge>
        </>
      ) : null}
    </>
  );
}

// Count the SET override fields (exactly the three `RoomOverrides` slots) — a stored field is only ever
// present when non-empty (empty omits on save, `fromRoomOverridesForm`), so truthiness IS "overridden".
function countSetOverrides(overrides: RoomOverrides): number {
  const set = (value: string | undefined): number => (value !== undefined && value !== "" ? 1 : 0);
  return set(overrides.mainPrompt) + set(overrides.postHistory) + set(overrides.scenario);
}

// EVERY SECTION IN THIS PANE IS A DISCLOSURE, AND THE CLOSED PANE IS THE INDEX (#830 — the #821 residue).
// With the injection rows collapsed the tab STILL settled at 2,836px desktop over fourteen sections (Host
// controls' eight alone are 1,880px), so Documents and World books were still below the fold and a host at the
// top of the pane had fourteen competing destinations and no map of them. The side-eye §7 verdict named the
// two candidate affordances — "a section index or a collapse-all" — and this is the collapse-all arm,
// because it is also the index: a closed section is its kicker, and the kicker already carries the count
// chip, so "DOCUMENTS 1 / WORLD BOOKS 2 / HOST CONTROLS" reads as the map WITHOUT spending a second navigation
// element on a pane the same review praised as chrome-clean. Height becomes the host's choice, not the
// pane's, which is the property an anchor list cannot buy.
//
// THE TRIGGER IS THE KICKER, NOT A ROW OF ITS OWN. It renders INSIDE the `<h3>` the `Section` kicker slot
// already spells (the document outline and the `heading` role are unchanged), and its accessible name
// COMPUTES from that same content — so it can never disagree with the visible label (WCAG 2.5.3) and a
// section reads "Documents 1" to a screen reader exactly as it reads to an eye. `size="control"` pins the
// pointer-conditional `--spacing-control-sm` floor (44px coarse / 32px fine), so fourteen new press targets
// arrive at the tap floor rather than as text-height hairlines.
//
// THE LABEL WEARS `interactiveKicker`, NOT `kicker` — the voice minted for exactly this ("a kicker that is
// itself the visible label of a control"). MEASURED, not assumed: shipping the trigger in the plain `kicker`
// voice put SIX new `undersized-ui-text` P2s on the mobile design-audit — `kicker` is `text-micro` (10.5px)
// and the rule's functional floor for INTERACTIVE text is 11px. `interactiveKicker` keeps the band's whole
// instrument register (uppercase, tracked, muted) at the readable label step, so the pane's voice is
// unchanged and the section names are legible as the controls they now are. The voice is spelled on a span
// INSIDE the trigger rather than left to inherit, because the Badge's `size="inline"` arm deliberately
// inherits its parent's type (#829) — an unspelled label would take `CollapsibleTrigger`'s own box type and
// take the chip with it.
//
// WHICH SECTIONS OPEN THEMSELVES: exactly ONE — Field overrides. It is the pane's teaching opening (the
// review's cold-read verdict: "Empty fields inherit from the character or preset. Saved automatically." is
// what tells a first-timer what this pane is for), it is the idiom every section below it now wears, and
// it is the only section whose height is FIXED — three rows, 202px desktop / 225px mobile, whatever the
// room holds. Everything else is data-driven, and MEASURED (isolated stage, non-game room "Example —
// Midnight Run", 2 content-bearing injections): opening Injections too puts its 309px desktop / 327px
// mobile between the host and the map, which pushes Documents (762) and World books (830) back below a
// 740px mobile fold — the exact #830 symptom, re-created by a default. A map whose own entries can be
// shoved off-screen by one entry's contents is not a map, so the rule is: the index is always whole, and
// every data-driven section — the racks, the host band, and every grafted §6c contribution — opens on
// demand. The count chips carry what a closed section is worth knowing ("Injections 2", "Documents 1").
//
// The host band's own children are the exception INSIDE the exception: they open by default, so ONE press
// on "Host controls" reaches all eight knobs rather than eight more doors behind a door.
const OPEN_BY_DEFAULT = true;
const CLOSED_BY_DEFAULT = false;

// The disclosure wrapper itself lives in ./chat-context-disclosure-section.tsx (extracted at the
// `component-size` cap); the defaults above are this tab's law and stay here with their reasons.

// The Injections section reads `listChatInjections` NON-suspending (the same query the body suspends on, so
// one fetch serves both) and spends that one read TWICE: the heading's count chip paints immediately and
// fills in when the list lands (the chat-list-header count precedent — no chip until it resolves / when
// empty), and the boundary's fallback RESERVES that many collapsed rows.
//
// WHAT THE CACHED COUNT CAN AND CANNOT DO (#821 — the review's premise, re-derived against the tree). On a
// RE-OPEN the count is genuinely free and the reserve is exact: react-query still holds the room's list, so
// `data` is populated on the first paint of the fallback. On the room's FIRST open it is not — both
// consumers of this key mount together and one batched request resolves them at the same instant, so `data`
// is `undefined` and the reserve falls back to a single row. That is why the collapse in
// `injections-manager.tsx` is the fix and this is the refinement: one collapsed row's worth of unreserved
// height is ~70px, where one LINE's worth of it was ~830px.
function InjectionsSection({ chatId, isHost }: { readonly chatId: ChatId; readonly isHost: boolean }): ReactElement {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.chat.listChatInjections.queryOptions({ chatId }));
  return (
    <DisclosureSection defaultOpen={CLOSED_BY_DEFAULT} kicker={<HeadingWithCount count={data?.length ?? 0} label="Injections" />} sectionId="injections">
      <QueryBoundary
        fallback={<InjectionsSkeleton count={data?.length ?? 1} isHost={isHost} />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="injections" onRetry={retry} />}
      >
        <InjectionsManager chatId={chatId} isHost={isHost} />
      </QueryBoundary>
    </DisclosureSection>
  );
}

// The Documents count, on the same non-suspending shared-cache idiom as Injections above. It counts the
// rows THIS VIEWER received, which is the only honest number: a member's payload is already filtered to the
// visible set, and a chip saying "there are N more you cannot see" would leak the host's hidden count.
function DocumentsHeading({ chatId }: { readonly chatId: ChatId }): ReactNode {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.databank.listActiveForChat.queryOptions({ chatId }));
  return <HeadingWithCount count={data?.length ?? 0} label="Documents" />;
}

// The World books count, on the same non-suspending shared-cache idiom as the two above (#640). Every viewer
// receives the same rows — `worldInfo.listForChat` is member-read and NOT owner-filtered (the room's books
// are room-public prompt content) — so unlike Documents there is no hidden subset for the chip to leak.
function LorebooksHeading({ chatId }: { readonly chatId: ChatId }): ReactNode {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.worldInfo.listForChat.queryOptions({ chatId }));
  return <HeadingWithCount count={data?.length ?? 0} label="World books" />;
}

export interface CommittedSettingsTabProps {
  readonly chatId: ChatId;
  readonly roomOverrides: RoomOverrides;
  readonly isHost: boolean;
  readonly background: ThemeBackground | null;
  /** The group-level gate — host of a group chat (was the whole Group tab's `when`). */
  readonly showGroup: boolean;
  /** §6c — the SECTION contributors a foreign feature grafts into this tab (automation's Rules is the
   *  first; #616). Omitted ⇒ the tab is byte-identical to a build with no contributors, which is what
   *  lets a CT mount the tab body alone. The door always wires it (`makeChatsSection`). */
  readonly sections?: ContributorRegistry<ChatSettingsSectionContribution>;
}

/** The committed-chat "This chat" tab: Field overrides + Injections always present; Background is host-only;
 *  Group behavior only for a host of a group chat; Tool use only for a host (the §8.1 permission-omit,
 *  moved from tab-level to section-level). */
export function CommittedSettingsTab({ chatId, roomOverrides, isHost, background, showGroup, sections }: CommittedSettingsTabProps): ReactElement {
  return (
    <Stack gap="section">
      <DisclosureSection
        defaultOpen={OPEN_BY_DEFAULT}
        kicker={<HeadingWithCount count={countSetOverrides(roomOverrides)} label="Field overrides" unit=" set" />}
        sectionId="field-overrides"
      >
        <RoomOverridesTab chatId={chatId} roomOverrides={roomOverrides} isHost={isHost} />
      </DisclosureSection>
      <InjectionsSection chatId={chatId} isHost={isHost} />
      {/* Documents (D-4) — the per-chat databank rack, placed directly AFTER Injections because it is the
          same family ("extra content entering this room's prompt") and, unlike the host-only band below, it
          is member-READABLE: `listActiveForChat` is member-gated by design, so a member sees the rows and
          simply gets no visibility toggle, no detach and no add (the §8.1 permission-OMIT at ROW level). */}
      <DisclosureSection defaultOpen={CLOSED_BY_DEFAULT} kicker={<DocumentsHeading chatId={chatId} />} sectionId="documents">
        <QueryBoundary
          fallback={<SkeletonRows count={2} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's documents" onRetry={retry} />}
          reserveKey="chat.context.documents"
        >
          <ChatDocumentsSection chatId={chatId} isHost={isHost} />
        </QueryBoundary>
      </DisclosureSection>
      {/* World books (#640) — the per-chat world-info rack, directly after Documents because it is the SAME
          family one step further ("extra content entering this room's prompt", here as keyword-fired
          entries) and, like Documents, member-READABLE: `worldInfo.listForChat` is `requireChatMember`, so a
          member sees the rows and simply gets no attach and no detach (the §8.1 permission-OMIT at ROW
          level). It is also the door the automation rule-preset lorebook picker points at: a rule may only
          write into a book attached HERE, so this is where a room with none goes to get one. */}
      <DisclosureSection defaultOpen={CLOSED_BY_DEFAULT} kicker={<LorebooksHeading chatId={chatId} />} sectionId="lorebooks">
        <QueryBoundary
          fallback={<SkeletonRows count={2} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's world books" onRetry={retry} />}
          reserveKey="chat.context.lorebooks"
        >
          <ChatBooksSection chatId={chatId} isHost={isHost} />
        </QueryBoundary>
      </DisclosureSection>
      {/* REGEX (#1742) — "what regex runs in this room, in run order, and every lever that changes it", the
          sibling of Injections and World books it was designed as (`docs/design/mocks/regex-section/DESIGN.md`,
          owner-approved 2026-09-05). It sits with the member-readable racks and NOT in the host band for the
          Documents/World books reason: the room's own tier is member-READABLE (`regex.listForChat` is
          `requireChatMember` — the attached scripts are room-public prompt content), so a member sees the
          rows and simply gets no switches, no attach and no detach (the §8.1 permission-OMIT at row level).
          The host's HALF is host-gated in the verb, not here: `chat.listEffectiveRegex` refuses a member,
          which is why the body reads two different procs by role.

          IT ABSORBED `Host controls › Appearance` (§2). That disclosure held exactly one control — the
          display-script broadcast switch — i.e. a regex control under an appearance name, three doors deep in
          the host band. It now closes the section's `On screen` group, where the display leg's own roster is,
          and the section count of this tab is unchanged. */}
      <DisclosureSection defaultOpen={CLOSED_BY_DEFAULT} kicker={<RegexHeading chatId={chatId} isHost={isHost} />} sectionId="regex">
        <QueryBoundary
          fallback={<SkeletonRows count={3} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's regex" onRetry={retry} />}
          reserveKey="chat.context.regex"
        >
          <RegexSection chatId={chatId} isHost={isHost} />
        </QueryBoundary>
      </DisclosureSection>
      {/* Macro picks (#24) — the per-chat user-macro INPUT picks. NOT host-gated: the picks are room play
          state any member may set (`setUserMacroValues` is member-gated, the `setVariables` sibling), so it
          sits with Field overrides/Injections rather than in the host-only band below. */}
      <DisclosureSection defaultOpen={CLOSED_BY_DEFAULT} kicker="Macro picks" sectionId="macro-picks">
        <QueryBoundary
          // A THREE-LINE PARAGRAPH IS WHAT THIS SECTION SETTLES TO (#823). Its production default is the
          // empty state — no preset in the app declares a user-macro input or a ChoiceBlock until an author
          // writes one — and that empty state is a 65px gloss paragraph, not rows of controls. Two
          // `control-lg` bars reserved 137px desktop / 169px mobile for it, so the section SHRANK on settle
          // and everything below jumped upward, which reads as a glitch rather than as loading (side-eye
          // 2026-08-30 §5-P3). The `datum` arm is the text-height shape: three bars at a text line's height
          // for three lines of prose.
          fallback={<SkeletonRows count={MACRO_PICKS_SKELETON_ROWS} shape="datum" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="the macro picks" onRetry={retry} />}
          reserveKey="chat.context.macroPicks"
        >
          <MacroPicksSection chatId={chatId} />
        </QueryBoundary>
      </DisclosureSection>
      {/* THE HOST-OPS GROUP (D-1). Rendered only for a host, so the group's own name is never an empty
          promise — and the three §8.1 permission-OMITs inside it keep their individual gates (Group behavior
          also needs a group chat). A member's tab simply ends after Macro picks. */}
      {isHost ? <HostControls chatId={chatId} background={background} showGroup={showGroup} sections={sections} /> : null}
    </Stack>
  );
}

/** The host-ops trio under one name (D-1): the per-chat Background, the Group-behavior form, and the
 *  tool-round cap. Grouped rather than merged — each keeps its own section, its own read and its own
 *  boundary; what changes is that they read as ONE band of host knobs instead of three more entries in a
 *  five-concern list. */
function HostControls({
  chatId,
  background,
  showGroup,
  sections,
}: {
  readonly chatId: ChatId;
  readonly background: ThemeBackground | null;
  readonly showGroup: boolean;
  readonly sections: ContributorRegistry<ChatSettingsSectionContribution> | undefined;
}): ReactElement {
  // The §6c SECTION seam's projection — the committed room, resolved once for every contributor.
  const state: ChatSettingsSectionState = { chatId };
  return (
    // THE BAND IS THE PANE'S BIGGEST SINGLE TERM (1,880px across eight sections), so it is the one section
    // whose default posture is CLOSED while its own children stay open: one press opens the host's knobs
    // and every one of them is already there, rather than eight more doors behind the door (#830).
    <DisclosureSection defaultOpen={CLOSED_BY_DEFAULT} kicker="Host controls" sectionId="host-controls">
      <Stack gap="section">
        <DisclosureSection defaultOpen={OPEN_BY_DEFAULT} kicker="Background" sectionId="background">
          <ChatBackgroundSection chatId={chatId} background={background} />
        </DisclosureSection>
        {showGroup ? (
          <DisclosureSection defaultOpen={OPEN_BY_DEFAULT} kicker="Group behavior" sectionId="group-behavior">
            <QueryBoundary
              // Shape-matched skeleton for the Group-behavior form's initially-visible rows (the reply-mode
              // toggle-group, the two switch fields, the Advanced accordion trigger) — never a spinner/text
              // void (house loading law, UIP-309 / UI-Arch §4.3 rule 7). Same idiom every panel section uses.
              fallback={<SkeletonRows count={GROUP_SECTION_SKELETON_ROWS} shape="line" />}
              renderError={(_error, retry): ReactElement => <QueryErrorState label="group settings" onRetry={retry} />}
              reserveKey="chat.context.groupBehavior"
            >
              <CommittedGroupConfigTab chatId={chatId} />
            </QueryBoundary>
          </DisclosureSection>
        ) : null}
        {/* `Appearance` IS GONE (#1742). It held one control — the display-tier broadcast switch (D121-E) —
            which is a REGEX control, and it now sits at the foot of the Regex section's `On screen` group
            beside the display scripts it governs. Its posture key and `reserveKey` retired with it: an
            unknown persisted section id is dropped on the store's next write
            (`chat-context-section-open-store.ts`), and the reservation gate's arm B forbids reusing the
            literal. Do NOT re-add a display-script control here without re-opening §2 of the design. */}
        {/* Storytelling (B1) — the room's standing offer-choices posture. Sits in the host band and NOT with
            Field overrides/Injections above it because, unlike those, it is not something a member may set:
            it changes what the model is told for everyone in the room. Reads the same getChat this tab
            already loaded plus the host's own settings default (the inherit seam), so the QueryBoundary
            matches its two neighbours' exactly. */}
        <DisclosureSection defaultOpen={OPEN_BY_DEFAULT} kicker="Storytelling" sectionId="storytelling">
          <QueryBoundary
            fallback={<SkeletonRows count={1} shape="line" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the offer-choices setting" onRetry={retry} />}
            reserveKey="chat.context.storytelling"
          >
            <OfferChoicesControl chatId={chatId} />
          </QueryBoundary>
        </DisclosureSection>
        {/* Reactions (B7) — the plane's master switch + the react-tool opt-in, SIDE BY SIDE (owner ask:
            one place for both reactions knobs). Host band for the same reason as its neighbours: both
            reach every member (one gates their writes, one the room's prompt). */}
        <DisclosureSection defaultOpen={OPEN_BY_DEFAULT} kicker="Reactions" sectionId="reactions">
          <QueryBoundary
            fallback={<SkeletonRows count={2} shape="line" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the reaction settings" onRetry={retry} />}
            reserveKey="chat.context.reactions"
          >
            <ReactionsEnabledControl chatId={chatId} />
            <CharactersCanReactControl chatId={chatId} />
          </QueryBoundary>
        </DisclosureSection>
        {/* Tool use — reads getChat (already loaded for this tab) for the current cap; the QueryBoundary
            matches the getChat suspense. */}
        <DisclosureSection defaultOpen={OPEN_BY_DEFAULT} kicker="Tool use" sectionId="tool-use">
          <QueryBoundary
            fallback={<SkeletonRows count={1} shape="line" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the tool round limit" onRetry={retry} />}
            reserveKey="chat.context.toolUse"
          >
            <ToolRecurseControl chatId={chatId} />
          </QueryBoundary>
        </DisclosureSection>
        {/* THE GRAFTED SECTIONS (§6c, #616) — a foreign feature's host-only section, rendered LAST so the
            band's own knobs keep their order and a contributor can never wedge itself between them. The
            HOST spells the `<Section kicker>`: a contribution carries a name and a body, never chrome, so
            a grafted section reads in this pane's voice by construction. Zero contributors renders
            nothing at all (no empty Section, no gap).

            THE SILENT-CONTRIBUTOR COLLAPSE, the section-anchor form of the property the flank column and the
            above-composer band already carry (chat-room-surface.tsx). A contributor whose applicability is
            DATA — plugin panels: does this person have a plugin that registered one? — cannot answer in the
            seam's SYNC `when` (it sees only `{chatId}`), so it mounts everywhere and renders null where it
            does not apply. Without this, every such contributor would spend a HEADING on every room: a
            "Plugin panels" kicker over nothing. The body rides a `display:contents` wrapper, so it adds no
            box of its own and this pane's spacing is unchanged, and the Section hides itself when that
            wrapper has no element children. It cannot hide a live contribution: any rendered node makes the
            wrapper non-empty.

            SO A GRAFT'S PANEL IS `keepMounted` (#830). Every section here is now a disclosure, and a CLOSED
            Base UI panel is REMOVED from the DOM — which would take the graft-body wrapper with it and leave
            `has-[…:empty]` nothing to match, i.e. an orphan "Plugin panels" kicker on every room. Kept
            mounted (hidden, zero height) the wrapper is still there to be asked, and the collapse still
            hides the whole Section, trigger included. Grafted sections start CLOSED: a contribution's body
            is data-driven (automation's Rules measured 704px desktop / 1,296px mobile with three rules —
            the §5-P3 term that becomes payable the moment it rises into the viewport). */}
        {(sections?.list() ?? [])
          .filter((section) => section.when?.(state) ?? true)
          .map((section) => (
            <DisclosureSection
              className="has-[[data-slot=chat-settings-graft-body]:empty]:hidden"
              defaultOpen={CLOSED_BY_DEFAULT}
              keepMounted={true}
              key={section.id}
              kicker={section.kicker}
              sectionId={`graft:${section.id}`}
            >
              <Stack className="contents" data-slot="chat-settings-graft-body">
                {section.body(state)}
              </Stack>
            </DisclosureSection>
          ))}
      </Stack>
    </DisclosureSection>
  );
}
