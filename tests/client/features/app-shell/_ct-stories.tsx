// Story module for the app-shell CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// The stories compose the shell through its FRONT DOOR (@orb/client/features/app-shell) with plain
// text content in the section slots, and the Rail leaf via a relative package path (a story may reach
// feature internals the front door doesn't re-export).
//
// DATA PROVIDERS (Query + tRPC): required since AppShell reads the synced density pref via
// `useDensity` (a non-suspense `useQuery(settings.getUserSettings)` — the §11.0 sanctioned cross-cutting
// display read). The query is UNSTUBBED here (no backend in CT): the hook is designed to degrade — a
// pending/errored read falls back to `DEFAULT_APPEARANCE_SETTINGS.density`, so the shell renders
// immediately with the default density and never suspends. Without the provider AppShell throws
// "No QueryClient set" and renders nothing (the beforeMount chrome only stacks Toast/Tooltip/Theme).
// The Rail leaf alone needs no data layer (RailStory stays bare).
//
// SHELL.CSS (L6/J12): the rail is now ONE DOM list that shell.css's `@media` reflows — the desktop icon
// column vs the mobile bottom tab bar — with `[data-mobile="sheet"]` entries + the desktop-only chrome
// hidden (`display:none`, which also removes them from the a11y tree). The CT bootstrap imports the SAME
// ordered CSS front door as production, so even bare RailStory mounts receive that rule without this story
// maintaining an independent stylesheet roster. At the CT's desktop viewport (1280px > 48rem) the desktop
// icon column shows, matching production.

import { AppShell, YouSheet } from "@orb/client/features/app-shell";
import type { ContextRegionDef, ContextTabDef, ContributorRegistry, ResolvedContextTab } from "@orb/client/lib";
import { createContributorRegistry, defineContextRegion, defineContextTabs, notify, VOID_STATE } from "@orb/client/lib";
import type { ChromeEntry, ModalDefinition, SectionDefinition, SectionId } from "@orb/client/state";
import {
  assembleChrome,
  ChromeRegistryProvider,
  dockListPanel,
  NO_SELECTION_TITLE,
  selectCharacter,
  selectChat,
  selectCollectionMember,
  selectCorpusCharacter,
  selectDocumentFromList,
  useSectionListIsScreen,
} from "@orb/client/state";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Command, Crown, Drama, Eye, Flag, FlaskConical, Gauge, Icon, MessagesSquare, Settings, Users } from "@orb/ui/icons";
import { Heading } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { Toaster } from "@orb/ui/toast";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import { ListPaneHeader } from "../../../../packages/client/src/components/list-pane-header.tsx";
import { AppearanceBackgroundSection } from "../../../../packages/client/src/features/app-shell/components/appearance-background-section.tsx";
import { AppearanceEffectsSection } from "../../../../packages/client/src/features/app-shell/components/appearance-effects-section.tsx";
import { AppearanceReadingSection } from "../../../../packages/client/src/features/app-shell/components/appearance-reading-section.tsx";
import { AppearanceSizingSection } from "../../../../packages/client/src/features/app-shell/components/appearance-sizing-section.tsx";
import { ContextTabsPanel } from "../../../../packages/client/src/features/app-shell/components/context-tabs-panel.tsx";
import { CustomThemeStyle } from "../../../../packages/client/src/features/app-shell/components/custom-theme-style.tsx";
import { Rail } from "../../../../packages/client/src/features/app-shell/components/rail.tsx";
import { SectionContextHeader, SectionContextHost } from "../../../../packages/client/src/features/app-shell/components/section-context-host.tsx";
// The chats topbar identity passenger, reached the same way the Rail leaf is (a story may reach a feature
// internal the front door does not re-export). Same absolute file the app resolves, so the React/provider
// context is the one `CtDataProviders` mounts — the `tests/client/features/chat` stories reach it this way.
import { ChatHeaderSurface } from "../../../../packages/client/src/features/chat/components/chat-header.tsx";
import { useChatStyle } from "../../../../packages/client/src/features/chat/hooks/use-chat-style.ts";
import { useMessageAppearance } from "../../../../packages/client/src/features/chat/hooks/use-message-appearance.ts";
// THE ROOM'S ONE TRACK, the production string (#213 — features/chat/lib/chat-track.ts). Reached the same
// way `ChatHeaderSurface` is: the shell's centred-child FLIP counter is keyed on the `.orb-chat-track`
// marker this const carries, so a story that re-spelled the class would prove the spelling, not the rule.
import { CHAT_TRACK } from "../../../../packages/client/src/features/chat/lib/chat-track.ts";
import type { ModalSlotId } from "../../../../packages/client/src/state/modal-slot-ids.ts";
import { openModal, setActiveSection, useActiveSection, useContextTab } from "../../../../packages/client/src/state/shell-store.ts";
import {
  CtDataProviders,
  CtFakeModalRegistry,
  CtFakeSectionRegistry,
  CtRealSectionRegistry,
  CtStandInChromeRegistry,
} from "../../../support/browser/ct-data-providers.tsx";
import { CtToastSurface } from "../../lib/_ct-stories.tsx";
import { CT_META_RAIL_CROWNED_IDS } from "./_crowned-tabs.ts";

/** Lands the shell on a section before the assertions run. The BORN default is now `home` (owner
 *  decision H1 = D-1), but most shell CTs are about the FRAME's mechanics over a section that has panes —
 *  so they say which section they mean instead of leaning on whatever the default happens to be. The
 *  default-lands-on-home fact has its own assertions (shell-store.ct.tsx + app-root.ct.tsx). */
function LandOn({ section }: { readonly section: SectionId }): null {
  useEffect(() => {
    setActiveSection(section);
  }, [section]);
  return null;
}

/** The full shell with chats CONTENT+CONTEXT slots + a corpus LIST/CONTENT slot; other sections fall
 *  back. The chats `context` slot backs the CONTEXT-follows-section CT (§4.2 rule 1); the chats content
 *  slot carries one real focusable control so the "content behind an open sheet is inert" CT can prove
 *  the keyboard actually cannot reach back there (a bare `<p>` is unfocusable either way). */
export function AppShellStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry
        sections={{
          chats: {
            content: (
              <>
                <p>chats content pane</p>
                <button type="button">content control</button>
                {/* A CONTENT-placed modal opener (the newChat trigger placement is "surface"): the rail
                    foot carries no modal trigger since the theme modal retired (#866 S4), so the shell's
                    modal-behavior CTs drive this door instead. */}
                <button onClick={(): void => openModal("newChat")} type="button">
                  open new chat
                </button>
              </>
            ),
            context: <p>chats context pane</p>,
          },
          // Characters is a mobile-bar tab (Home · Chats · Characters · You after the H2 curation), so it
          // carries real content for the bar-navigation CT.
          characters: { content: <p>characters content pane</p> },
          corpus: { list: <p>corpus list pane</p>, content: <p>corpus content pane</p> },
        }}
      >
        <LandOn section="chats" />
        {/* The real "You" bottom-sheet body arrives via the modal registry (CtFakeSectionRegistry nests
            the real modal registry), so the mobile CT exercises the real sheet, not a placeholder. */}
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** The message plane's real query consumers beside the real shell. This visible CT-only snapshot keeps
 * #935's generated hook liveness test; the rated runtime contract reads mounted real MessageRows instead. */
function AppearanceHookSnapshot(): ReactElement {
  const message = useMessageAppearance();
  const chatStyle = useChatStyle();
  return <section aria-label="CT Appearance hook snapshot">{JSON.stringify({ ...message, chatStyle })}</section>;
}

/** #935's composed carrier graph: real AppShell carriers plus the two prop-threading hooks that AppShell
 * intentionally does not own. Both read the same settings query under one provider. */
export function AppearanceCarrierStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry sections={{ chats: { content: <p>carrier matrix</p> } }}>
        <LandOn section="chats" />
        <AppShell />
        <AppearanceHookSnapshot />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** The chat id the topbar-identity story seats. MINTED, never a hand-written literal — `typeIdSchema`
 *  validates the 26-char suffix at runtime, so a made-up string fails inside the real header's query key. */
const TOPBAR_IDENTITY_CHAT_ID = mintTypeId(ID_PREFIX.chat);
/** What the band prints as the room's name. NOT compared by any pin — the yield rule's condition is that a
 *  heading EXISTS in the band (`:has(… h2)`), not what it says — so this deliberately does not reach for the
 *  CT file's `TOPBAR_IDENTITY_ROOM.title` and mint a second spelling of one string to keep in sync. */
const TOPBAR_IDENTITY_ROOM_TITLE = "the room's name, as the band prints it";

/** THE TOPBAR YIELDS THE ROOM'S IDENTITY TO THE DOCKED CONTEXT PANE (#846 by relocation, #860) — the REAL
 *  chats identity cluster riding the shell's topbar LEAD, with both panes available so the CT can drive the
 *  pane states the rule keys on. The header passenger is the PRODUCTION `ChatHeaderSurface`, not a stand-in
 *  that re-spells its class names (a fixture that can agree with the bug). Its roster arrives from the
 *  `.ct.tsx`'s own `chat.getChat` route stub, and the `.ct.tsx` also seats the notifications bell — the
 *  `snap --isolated` stage renders the trail without it, 42px lighter than a real account's row. */
/** The REAL bracket as the context pane, carrying a band that NAMES the room — the condition the #846/#896
 *  topbar yield keys on (`shell.css`: `:has([data-slot="context-bracket-band"] h2)`). Opt-in, because this
 *  story backs ~200 other pins whose subject is the frame, not the band, and a `<p>` pane is the cheaper
 *  mount for them (swapping it wholesale broke 87 of them in one run). The band SLOT comes from the real
 *  `ContextBracket`, never a hand-written `data-slot`; only the heading is the story's, which is
 *  production's own shape (a section hands the bracket a `header`, and chat's renders an `h2`).
 *  A FUNCTION, not a const: its fixtures are declared further down this module. */
function bracketContextPane(): ReactElement {
  return (
    <ContextTabsPanel
      tabs={CTX_STRIP_TABS}
      railLabel="Chat"
      header={
        <Heading level={2} className="line-clamp-2">
          {TOPBAR_IDENTITY_ROOM_TITLE}
        </Heading>
      }
    />
  );
}

export function AppShellChatTopbarIdentityStory({ withBand = false }: { readonly withBand?: boolean } = {}): ReactElement {
  useEffect(() => {
    selectChat(TOPBAR_IDENTITY_CHAT_ID);
  }, []);
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry
        sections={{
          chats: {
            list: <p>chats list pane</p>,
            content: <p>chats content pane</p>,
            context: withBand ? bracketContextPane() : <p>chats context pane</p>,
            header: <ChatHeaderSurface chatId={TOPBAR_IDENTITY_CHAT_ID} />,
          },
        }}
      >
        <LandOn section="chats" />
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** ARRIVAL FOCUS + THE LIST-PANE PRIMARY (a11y #283). Corpus (a library section, list docked by default)
 *  carries a FOCUSABLE primary in its LIST pane — the stand-in for its "New …" create action, which lives
 *  in the band DOM-before `<main>`. The CT navigates to it through a real, KEYBOARD-activated rail button and
 *  asserts the section swap does not yank focus into `<main>` past that primary. chats is the landing
 *  section (its content pane is the barrier the CT waits on before navigating). */
export function AppShellListPrimaryStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry
        sections={{
          chats: { content: <p>chats content pane</p> },
          corpus: {
            // The pane's PRIMARY — a real focusable control inside the LIST panel (DOM-before `<main>`), the
            // same tab-order position the production `listHeader` band's create button occupies.
            list: (
              <button type="button" data-testid="list-primary">
                New corpus item
              </button>
            ),
            content: <p>corpus content pane</p>,
          },
        }}
      >
        <LandOn section="chats" />
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** THE NOTICE BAND (#193): the real shell + the real toast outlet, plus one control that raises a notice.
 *  The content pane carries a bottom-anchored stand-in for the composer, because the defect being retired
 *  is precisely "an overlay stack must cover the transcript OR the composer, and both are load-bearing" —
 *  a story with only a transcript could not tell a reflow from a lucky inset. */
export function AppShellNoticeBandStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtToastSurface>
        <CtFakeSectionRegistry
          sections={{
            chats: {
              content: (
                <div data-testid="band-content-pane" style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", minHeight: 0 }}>
                  <h1 data-testid="band-h1">Transcript</h1>
                  {/* The READING SURFACE: full-column-width and everything the composer does not take,
                      exactly like the real transcript. A narrow stand-in would let a right-aligned overlay
                      stack miss it by luck and make the non-overlap assertions vacuous. */}
                  <div data-testid="band-transcript" style={{ background: "#111", flex: "1 1 auto", minHeight: 0 }} />
                  <div data-testid="band-composer-standin" style={{ background: "#333", flex: "none", height: 96 }} />
                </div>
              ),
            },
          }}
        >
          <LandOn section="chats" />
          <AppShell />
          <button
            data-testid="raise-notice"
            onClick={(): void => {
              notify.error({ description: "The live connection dropped and could not be restarted.", title: "Lost the live connection" });
            }}
            type="button"
          >
            raise notice
          </button>
          {/* A notice long enough that THREE of them overflow the band's one-screen budget (shell.css's
              `max-block-size: min(14rem, 30dvh)`). The short notice above cannot: a burst of three fits
              inside the cap, so a "the band is at most N tall" assertion driven by it passes whether or
              not the cap bites at all. The burst arm needs a stack that genuinely exceeds the window. */}
          <button
            data-testid="raise-tall-notice"
            onClick={(): void => {
              notify.error({
                description:
                  "The live connection dropped while a turn was streaming and could not be restarted. The transcript kept everything that had already arrived, the composer is still yours, and the next send will open a fresh connection — nothing you wrote has been lost.",
                title: "Lost the live connection",
              });
            }}
            type="button"
          >
            raise tall notice
          </button>
        </CtFakeSectionRegistry>
      </CtToastSurface>
    </CtDataProviders>
  );
}

// ── THE MOBILE ONE-SHELL RULE (owner-ruled 2026-08-03) ───────────────────────────────────────────────
// One story per list-bearing section, mounted through the REAL shell over the REAL selection seam that
// section's definition declares (`CtFakeSectionRegistry` passes `REAL[id].selection` through whenever a
// story injects a `list`) — so the CT exercises the production store, the production `resolvePanelMode`
// arm and the production back affordance, with stand-in list/content bodies the way every other app-shell
// CT does. "Open a member" is fired through each section's OWN intent, never a store handle: that is the
// same call its rows make.

/** Fires the section's real "a member is now open" intent — the LIST-row act, without the row's data. */
function openMemberIn(section: SectionId): void {
  if (section === "chats") {
    selectChat(mintTypeId(ID_PREFIX.chat));
    return;
  }
  if (section === "characters") {
    selectCharacter(mintTypeId(ID_PREFIX.character));
    return;
  }
  if (section === "corpus") {
    selectCorpusCharacter(mintTypeId(ID_PREFIX.character));
    return;
  }
  if (section === "databank") {
    selectDocumentFromList(mintTypeId(ID_PREFIX.document));
    return;
  }
  selectCollectionMember("tags", "tag-ct-member");
}

/** The story's stand-in for a section's `useSelectionTitle`: the OPEN member's name, resolved REACTIVELY
 *  from the same seam the shell reads (`useSectionListIsScreen` is `true` exactly while nothing is open), so
 *  the CT can pin "the pushed topbar names the member, the roster topbar names the section" without a live
 *  backend behind a real name query. Module scope — a fresh closure per render would remount the title. */
const CT_MEMBER_TITLE = "Ashen Spire";
// One named hook per section rather than a factory: a function that RETURNS a hook is banned
// (`noComponentHookFactories`), and these are the exact shape a real section declares — a module-level
// hook the shell calls inside its keyed title component.
const useChatsStoryTitle = (): string | null => (useSectionListIsScreen("chats") ? null : CT_MEMBER_TITLE);
const useCharactersStoryTitle = (): string | null => (useSectionListIsScreen("characters") ? null : CT_MEMBER_TITLE);
const useCorpusStoryTitle = (): string | null => (useSectionListIsScreen("corpus") ? null : CT_MEMBER_TITLE);
const useConfigStoryTitle = (): string | null => (useSectionListIsScreen("config") ? null : CT_MEMBER_TITLE);
const useDatabankStoryTitle = (): string | null => (useSectionListIsScreen("databank") ? null : CT_MEMBER_TITLE);
const STORY_TITLES: Partial<Record<SectionId, () => string | null>> = {
  chats: useChatsStoryTitle,
  characters: useCharactersStoryTitle,
  corpus: useCorpusStoryTitle,
  config: useConfigStoryTitle,
  databank: useDatabankStoryTitle,
};

/** The shell on ONE list-bearing section at a mobile viewport, plus the one control the CT needs: the
 *  section's own open-a-member intent. Everything else — which screen shows, the back affordance, the topbar
 *  budget, what the toggle does — is the shell's, which is the whole point of the rule. */
export function AppShellMobileRuleStory({ section }: { readonly section: SectionId }): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry
        sections={{
          [section]: {
            list: <p>{section} list pane</p>,
            content: <p>{section} content pane</p>,
            ...(STORY_TITLES[section] === undefined ? {} : { selectionTitle: STORY_TITLES[section] }),
            // The section-owned topbar cluster, at the footprint the real chats header occupies (avatars +
            // name + member chip ≈ 180px). Without it the lead is one control wide and the P1 row-budget
            // measurement has nothing to squeeze — the defect only exists when the lead has a passenger.
            header: <div style={{ width: 180 }}>{section} topbar header</div>,
          },
        }}
      >
        <LandOn section={section} />
        <button type="button" onClick={(): void => openMemberIn(section)}>
          open a member
        </button>
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** `AppShellStory` + a `--width-shell-content`-capped probe in the chats CONTENT slot (the SAME
 *  `max-w-(--width-shell-content)` utility `chat-landing-surface.tsx`/`composer.tsx` use — real
 *  production wiring, not a re-implementation of the clamp formula) — for asserting the §11.1
 *  chatWidthPct root var reaches a real rendered `max-width`, not just the CSS custom property string. */
export function AppShellWidthProbeStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry
        sections={{
          chats: {
            content: (
              <div style={{ width: "100%" }}>
                <div className="w-full max-w-(--width-shell-content)" data-testid="width-probe" />
              </div>
            ),
          },
        }}
      >
        <LandOn section="chats" />
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** `AppShellStory` + the ROOM'S OWN TRACK carriers in the chats CONTENT slot: a transcript row and the
 *  composer, both wearing the production `CHAT_TRACK` string (`.orb-chat-track w-full
 *  max-w-(--width-shell-content)`, #213). The shell's centred-child FLIP counter (#1646, re-keyed to the
 *  marker family by #2442) is a CSS rule on that marker, so two boxes that resolve their horizontal
 *  placement exactly the way production's six carriers do is the whole fixture it needs — this file cannot
 *  route a real transcript (see app-shell.ct.tsx's #1677 header) and does not have to: the counter's
 *  subject is the TRACK, not the message.
 *
 *  The `data-slot` pair is real too, so the census reads the same two names the live-drive receipt did. */
export function AppShellChatTrackStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry
        sections={{
          chats: {
            content: (
              <div className="flex w-full flex-col">
                <div className={CHAT_TRACK} data-slot="message-row" data-testid="track-row">
                  transcript row
                </div>
                <div className={CHAT_TRACK} data-slot="composer" data-testid="track-composer">
                  composer
                </div>
              </div>
            ),
          },
        }}
      >
        <LandOn section="chats" />
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** Opens ONE modal id (via the store action) over the shell with a DELIBERATELY TALL body injected, so
 *  the no-window-scroll invariant CT can assert the DOCUMENT never scrolls (the shell-tier html/body
 *  `overflow: clip` lock + globals.css imported here) while the modal's own region absorbs the overflow.
 *  Registry-driven: the CT loops MODAL_SLOT_IDS, so a NEW modal is covered for free (registry-pairing
 *  keystone spirit). The tall body uses an inline height (a test story is not a compose-only feature). */
export function ModalScrollStory({
  modalId,
  includeThemePreview = false,
}: {
  readonly modalId: ModalSlotId;
  readonly includeThemePreview?: boolean;
}): ReactElement {
  useEffect(() => {
    openModal(modalId);
  }, [modalId]);
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry sections={{ chats: { content: <p>chats content pane</p> } }}>
        <LandOn section="chats" />
        {/* A fake modal registry injects a deliberately-tall body for every id (the inner provider wins
            over CtFakeSectionRegistry's real one), so the scroll invariant is exercised per placement.
            `flexShrink: 0` so the drawer's flex-column scroll region can't shrink this EMPTY probe to fit
            (real drawer content has intrinsic height that resists shrink; an empty div would not) — we
            want it to genuinely overflow so the scroll assertion measures a real scroll region. */}
        <CtFakeModalRegistry
          body={(): ReactElement => (
            <div data-testid="tall-modal-body" style={{ height: 3000, flexShrink: 0 }}>
              {/* Positioned modal content is the stacking adversary for the drawer's sticky header. It
                  stays pinned to the scrollport while the body moves, so the CT proves the header wins a
                  real overlap rather than merely carrying a non-auto computed z-index. */}
              <div
                data-testid="modal-stacking-probe"
                style={{ background: "var(--color-destructive)", height: 48, position: "sticky", top: 0, zIndex: "var(--z-base)" }}
              />
              {includeThemePreview ? (
                <ThemeScope tokens={{ accent: "oklch(0.66 0.16 42)", background: "oklch(0.92 0.03 88)" }}>
                  <div className="border border-border" data-testid="nested-theme-preview">
                    nested theme preview
                  </div>
                </ThemeScope>
              ) : null}
            </div>
          )}
        >
          <AppShell />
        </CtFakeModalRegistry>
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** A real `FileDropzone` inside the shell's chats CONTENT slot + a marker for what it imported — the
 *  stray-drop guard's counter-arm: the guard must swallow a drop that misses this zone while a drop ON it
 *  still imports. The zone is the production primitive, so the guard is tested against the real
 *  preventDefault behaviour it has to stay out of the way of. */
function DropZonePane(): ReactElement {
  const [imported, setImported] = useState<readonly string[]>([]);
  return (
    <div>
      <p>chats content pane</p>
      <FileDropzone multiple={true} instructions="Drop cards here" onFilesSelected={(result): void => setImported(result.accepted.map((file) => file.name))} />
      <p data-testid="imported">{imported.join(",")}</p>
    </div>
  );
}

/** The shell with a real import zone in CONTENT — for the stray-file-drop guard CT (both arms).
 *
 *  IT MOUNTS ITS OWN TOAST OUTLET. The guard's whole affordance is a toast ("Nothing imports from here —
 *  drop the file on an import zone.", `use-stray-file-drop-guard.ts`), so the outlet is part of what this
 *  story is FOR — it used to ride the CT harness's ambient `<Toaster />` and would have gone silently
 *  untestable the moment the harness stopped mounting one (#247). A story that asserts a toast paints owns
 *  the surface it paints on. */
export function AppShellDropGuardStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry sections={{ chats: { content: <DropZonePane /> } }}>
        <LandOn section="chats" />
        <AppShell />
        <Toaster />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** The Rail in isolation — a11y + keyboard nav over real <button>s, registry-driven. The persona identity
 *  is now a `rail.end` chrome widget (`personaChrome`, §E-6, no more `railFoot` prop); `CtStandInChromeRegistry`
 *  swaps a bare "Account" button for its data-backed body so the footer-slot a11y baseline stays covered
 *  without pulling the persona feature (and its queries) into this dataless mount. */
export function RailStory(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <CtStandInChromeRegistry>
        <Rail activeSection="chats" onSelectSection={(): void => undefined} onOpenModal={(): void => undefined} />
      </CtStandInChromeRegistry>
    </CtFakeSectionRegistry>
  );
}

/** The Rail standing in a `mobile:"sheet"` OVERFLOW section (corpus) — the state the bar used to render as
 *  four unlit tabs with `aria-current="page"` on a 0×0 node (#484). The section now TAKES the last standing
 *  tab's slot, so exactly one visible tab is current and the displaced one is a tap away in the You sheet. */
export function RailOverflowSectionStory(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <CtStandInChromeRegistry>
        <Rail activeSection="corpus" onSelectSection={(): void => undefined} onOpenModal={(): void => undefined} />
      </CtStandInChromeRegistry>
    </CtFakeSectionRegistry>
  );
}

/** The same swap from a DIFFERENT group (analytics is `insight`, corpus is `primary`) — the review found
 *  the defect on five sections across three groups, so the pin covers more than the one it was found on. */
export function RailAnalyticsSectionStory(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <CtStandInChromeRegistry>
        <Rail activeSection="analytics" onSelectSection={(): void => undefined} onOpenModal={(): void => undefined} />
      </CtStandInChromeRegistry>
    </CtFakeSectionRegistry>
  );
}

/** The OTHER HALF of the swap (#484): the You sheet while an overflow section holds a bar slot. The section
 *  on the bar drops out of "More" and the tab it displaced drops IN — nothing may become unreachable, which
 *  is why one derivation feeds both surfaces. Real sections (the stand-in chrome), real store. */
export function YouSheetSwapStory(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <CtStandInChromeRegistry>
        <LandOn section="corpus" />
        <YouSheet />
      </CtStandInChromeRegistry>
    </CtFakeSectionRegistry>
  );
}

/** The Rail whose chrome carries a `topbar.trail` widget curated `mobile:"sheet"` and declaring a waiting
 *  count — the notifications inbox's exact shape (#214 residue, side-eye home re-score 2026-08-18). The
 *  bell leaves the phone's chrome for the You sheet, so the tab that HOSTS the sheet is where its unread
 *  signal has to appear; a phone otherwise shows nothing anywhere. The entry is a stand-in so the pin is on
 *  the SEAM (a curated widget's badge reaches the tab), never on the notifications feature. */
export function RailSheetBadgeStory(): ReactElement {
  const chrome = createContributorRegistry<ChromeEntry>("chrome", [
    {
      id: "fake-trail-overflow",
      label: "Fake trail widget",
      zone: "topbar.trail",
      mobile: "sheet",
      useBadge: (): number => 3,
      behavior: { kind: "widget", body: (presentation): ReactElement => <div data-testid="trail-sheet-lens">trail:{presentation}</div> },
    },
    {
      id: "fake-hidden-overflow",
      label: "Fake hidden widget",
      zone: "topbar.trail",
      mobile: "sheet",
      // A gated entry may not badge: `useVisible` is the same door its affordance obeys everywhere else.
      useVisible: (): boolean => false,
      useBadge: (): number => 9,
      behavior: { kind: "widget", body: (): ReactElement => <div data-testid="hidden-sheet-lens">hidden</div> },
    },
  ]);
  return (
    <CtFakeSectionRegistry>
      <ChromeRegistryProvider value={chrome}>
        <Rail activeSection="chats" onSelectSection={(): void => undefined} onOpenModal={(): void => undefined} />
      </ChromeRegistryProvider>
    </CtFakeSectionRegistry>
  );
}

/** The Rail with the BRAND cell ACTIVE (home-section-spec §4.1) — the glyph is home's rail affordance, so
 *  it must carry `aria-current="page"` when home is the active section, exactly as any rail button does. */
export function RailBrandActiveStory(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <CtStandInChromeRegistry>
        <Rail activeSection="home" onSelectSection={(): void => undefined} onOpenModal={(): void => undefined} />
      </CtStandInChromeRegistry>
    </CtFakeSectionRegistry>
  );
}

/** The Rail wired to the REAL `setActiveSection` + a probe of the shell store — so the glyph CT asserts
 *  the STORE ACTION FIRED, never a rendered echo. */
export function RailBrandNavStory(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <CtStandInChromeRegistry>
        <LandOn section="chats" />
        <RailWithStore />
      </CtStandInChromeRegistry>
    </CtFakeSectionRegistry>
  );
}

function RailWithStore(): ReactElement {
  const activeSection = useActiveSection();
  return (
    <>
      <output>section={activeSection}</output>
      <Rail activeSection={activeSection} onSelectSection={setActiveSection} onOpenModal={openModal} />
    </>
  );
}

/** AN OUTSIDE-THE-SHELL LIST DOCK, INSIDE THE REAL SHELL (#391). `dockListPanel` is the `#state` door a
 *  FEATURE uses to un-collapse the LIST — it cannot reach `useShellLayout`'s own seams (a feature may never
 *  import another feature), and that write moves CONTEXT between regime channels exactly as a topbar list
 *  toggle does (#383). So the CT needs the door fired against the REAL shell frame, not a hand-rolled store
 *  poke. The `characters` slots are the shape the ruling names (list docked + context collapsed, both
 *  available).
 *
 *  IT USED TO FIRE THE CHARACTER HERO'S "N chats ›" INTENT (`revealChatsProjection`), which was the door's
 *  one production caller. #501 re-pointed that intent at the CONTEXT Chats tab (the LIST pane stays the
 *  library now), so the story drives `dockListPanel` DIRECTLY: the invariant under test was never about the
 *  character screen — it is "anything that docks the LIST owes CONTEXT the carry, whoever fired it". */
export function AppShellChatsProjectionIntentStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry
        sections={{
          characters: {
            content: (
              <button data-testid="reveal-chats-projection" onClick={(): void => dockListPanel()} type="button">
                Dock the list
              </button>
            ),
            list: <p>characters list pane</p>,
            context: <p>characters context pane</p>,
          },
        }}
      >
        <LandOn section="characters" />
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** THE LIST LANDMARK IS NAMED BY ITS OWN BAND (#493). The shell's `aria-label` is derived from the ACTIVE
 *  SECTION, so it could only ever describe the section — and the Characters LIST pane swaps its whole
 *  contents to a character's CHATS when one is opened, at which point "Characters list" was a lie. The
 *  landmark points at the band's heading now; this story is the band, with a caller-chosen title/accent so
 *  one CT can walk both arms of the swap. */
export function AppShellNamedListBandStory({
  title,
  accent,
  count,
}: {
  readonly title: string;
  readonly accent?: string;
  /** A live census in the band — the half of the landmark's name that used to run into the noun (#1349). */
  readonly count?: number;
}): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry
        sections={{
          chats: {
            content: <p>chats content pane</p>,
            list: <p>chats list pane</p>,
            listHeader: <ListPaneHeader title={title} {...(accent === undefined ? {} : { accent })} {...(count === undefined ? {} : { count })} />,
          },
        }}
      >
        <LandOn section="chats" />
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** The REAL shell landed on a caller-chosen section (real registry) — for the LIST-pane CAPABILITY CT
 *  (home declares `panels.list = "unavailable"`, so its topbar renders NO list toggle; chats still does). */
export function AppShellOnSectionStory({ section }: { readonly section: SectionId }): ReactElement {
  useEffect(() => {
    setActiveSection(section);
  }, [section]);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <AppShell />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The YouSheet projection in isolation (§E-5): a custom chrome registry with a fake `rail.end` widget
 *  whose `body("sheet")` renders a marker + a `mobile:"sheet"` overflow section — proof the sheet is a
 *  BLIND PROJECTION over the resolved chrome list (a widget's sheet lens + an overflow section both appear),
 *  not a second hand-maintained derivation. */
export function YouSheetProjectionStory(): ReactElement {
  const chrome = createContributorRegistry<ChromeEntry>("chrome", [
    {
      id: "fake-identity",
      label: "Fake identity",
      zone: "rail.end",
      mobile: "sheet",
      behavior: { kind: "widget", body: (presentation): ReactElement => <div data-testid="sheet-lens">lens:{presentation}</div> },
    },
    {
      // A TOPBAR MODAL curated off the phone row — the ⌘K palette's shape (#1789). The sheet's projection
      // rule is by BEHAVIOR KIND, not by id: a row-shaped entry (modal/section) joins the row group, a
      // widget renders its own lens in the block below it.
      id: "command",
      label: "Jump to…",
      icon: Command,
      zone: "topbar.trail",
      mobile: "sheet",
      behavior: { kind: "modal", modalId: "command" },
    },
    {
      // A TOPBAR widget curated off the phone row — the notifications inbox's shape (side-eye leg-4 P2).
      id: "fake-trail-overflow",
      label: "Fake trail widget",
      zone: "topbar.trail",
      mobile: "sheet",
      behavior: { kind: "widget", body: (presentation): ReactElement => <div data-testid="trail-sheet-lens">trail:{presentation}</div> },
    },
    {
      id: "fake-overflow",
      label: "Fake overflow section",
      zone: "rail.nav",
      mobile: "sheet",
      order: 0,
      behavior: { kind: "section", sectionId: "analytics" },
    },
  ]);
  return (
    // The section registry wrapper supplies the real modal registry (ModalHost's own read); the story's
    // CHROME registry is nested INSIDE it so it wins, and it is the ONLY source of the sheet's rows —
    // #1789 deleted the sheet's own `useModalRegistry()` lookup for the command row.
    <CtFakeSectionRegistry>
      <ChromeRegistryProvider value={chrome}>
        <YouSheet />
      </ChromeRegistryProvider>
    </CtFakeSectionRegistry>
  );
}

/** A `topbar.trail`-placed modal definition, the shape the command palette declares — the story input for
 *  the #1789 projection pins. Its `trigger.order` is deliberately NOT set: the stories drive relative order
 *  through the WIDGET's own `order`, so the pin reads the registry's sort rather than a lens's JSX. */
const TRAIL_MODAL: ModalDefinition = {
  id: "command",
  title: "Jump to…",
  trigger: { placement: "topbar.trail", label: "Jump to…", icon: Command },
  body: { planned: "ct" },
};

/** A fake `topbar.trail` WIDGET, so a trail story always has a second control to order the chip against
 *  (and a barrier the assertions can wait on before reading the zone's rendered sequence). */
function trailWidget(order?: number): ChromeEntry {
  return {
    id: "fake-trail-widget",
    label: "Fake trail widget",
    zone: "topbar.trail",
    ...(order === undefined ? {} : { order }),
    behavior: {
      kind: "widget",
      body: (): ReactElement => (
        <button data-testid="fake-trail-widget" type="button">
          Fake trail widget
        </button>
      ),
    },
  };
}

/**
 * THE TOPBAR TRAIL AS A LENS OVER THE CHROME REGISTRY (#1789). The shell used to render the ⌘K chip from
 * its OWN `useModalRegistry()` lookup, ahead of the registry's widgets — so the trail's contents and their
 * order came from two places and the registry could not answer for either. This story hands the shell a
 * chrome registry the caller composes, so a CT can vary the two things a lookup made unobservable: whether
 * the zone HAS a modal entry at all, and where that entry sorts among the widgets.
 *
 * The MODAL registry stays the real one (nested outside), so the lookup the fix deletes would still find
 * the command modal — which is exactly what makes `includeCommand={false}` a mechanism proof rather than a
 * fence: on the pre-fix source the chip renders from that lookup no matter what this registry says.
 */
export function AppShellTrailProjectionStory({
  includeCommand = true,
  widgetOrder,
}: {
  readonly includeCommand?: boolean;
  readonly widgetOrder?: number;
}): ReactElement {
  const chrome = createContributorRegistry<ChromeEntry>(
    "chrome",
    assembleChrome({ sections: [], modals: includeCommand ? [TRAIL_MODAL] : [], widgets: [trailWidget(widgetOrder)] }),
  );
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry sections={{ chats: { content: <p>chats content pane</p> } }}>
        <LandOn section="chats" />
        <ChromeRegistryProvider value={chrome}>
          <AppShell />
        </ChromeRegistryProvider>
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** A minimal fake SectionDefinition for exercising `SectionContextHeader` (N4) in isolation — real
 *  rail/placeholder vocabulary, a caller-supplied `context` arm. */
function fakeHeaderSection(context: SectionDefinition["context"]): SectionDefinition {
  return {
    id: "chats",
    rail: { label: "Chats", icon: MessagesSquare, group: "primary", mobile: "tab" },
    panelDefaults: { list: "docked", context: "docked" },
    placeholder: { title: "Chats", description: "Fake section for the header-channel CT." },
    content: { planned: "ct" },
    context,
    useSelectionTitle: NO_SELECTION_TITLE,
  };
}

// Minted at MODULE scope (like every production section) so `useResolved` has a stable identity.
const FAKE_HEADER_CONTEXT = defineContextTabs<void>({
  useContextState: () => VOID_STATE,
  tabs: [{ id: "t", label: "T", body: (): ReactNode => null }],
  header: (): ReactNode => <span>Fake identity</span>,
});

/** The definition-owned CONTEXT header channel (N4): a fake section mints a `header` through
 *  `defineContextTabs`; the shell renders it blind (no per-section switch) — in the BRACKET's head band via
 *  `SectionContextHost` since #860, while the shell's own band slot (`SectionContextHeader`) stays empty. */
export function SectionContextHeaderChannelStory(): ReactElement {
  return (
    <CtDataProviders>
      <div data-testid="band-slot">
        <SectionContextHeader definition={fakeHeaderSection(FAKE_HEADER_CONTEXT)} />
      </div>
      <div style={{ width: 291, height: 320 }} data-testid="body-slot">
        <SectionContextHost definition={fakeHeaderSection(FAKE_HEADER_CONTEXT)} />
      </div>
    </CtDataProviders>
  );
}

/** A section supplying NO header (a `none` context) falls back to the neutral "Details" band label. */
export function SectionContextHeaderDefaultStory(): ReactElement {
  return (
    <CtDataProviders>
      <SectionContextHeader definition={fakeHeaderSection({ kind: "none" })} />
    </CtDataProviders>
  );
}

// ── The CONTEXT BRACKET as the generic pane renders it (context-tabs-panel.tsx → context-bracket.tsx) ──
// Mounts the real ContextTabsPanel inside a FIXED-size container the `.ct.tsx` sets, so the rail's track
// sizing resolves against a KNOWN width and the foot rail has a real pane bottom to be pinned to. Since #208
// the cell is icon+label at every width, so the widths exist to exercise the rail's SLACK: 291px = the real
// default panel (tracks at their `max-content` minimum, the row may scroll), 600px = a wide host (the `1fr`
// maximum, equal cells filling the row). A `showTrackers` flag adds the 5th tab (the CP-1 ceiling); a fake
// icon-LESS contributor tab proves a tab with no glyph still reads as the same cell; `withBand`/`withDismiss`
// seat the head band and the floating pane's own way out (#860).

/** A resolved-tab builder that fills the §4.11 defaults (strip "meta", no badge, enabled) so a story only
 *  spells the axis it exercises — mirrors `resolveContextTabs`'s own defaulting. */
function resolvedTab(partial: Partial<ResolvedContextTab> & Pick<ResolvedContextTab, "id" | "label" | "node">): ResolvedContextTab {
  return { strip: "meta", crown: false, badge: null, disabledReason: null, defaultTab: false, ...partial };
}

const CTX_STRIP_TABS: readonly ResolvedContextTab[] = [
  resolvedTab({ id: "members", label: "Members", icon: Users, node: <div data-testid="ctx-body-members">members</div> }),
  resolvedTab({ id: "settings", label: "Settings", icon: Settings, node: <div>settings</div> }),
  resolvedTab({ id: "preview", label: "Preview", icon: Eye, node: <div>preview</div> }),
  resolvedTab({ id: "injections", label: "Injections", icon: FlaskConical, node: <div>injections</div> }),
];
const CTX_TRACKERS_TAB: ResolvedContextTab = resolvedTab({ id: "trackers", label: "Trackers", icon: MessagesSquare, node: <div>trackers</div> });
// A contributor that set NO icon — must keep its word label at every container width (can't compress).
const CTX_ICONLESS_TAB: ResolvedContextTab = resolvedTab({ id: "iconless", label: "Iconless", node: <div>iconless</div> });

export interface ContextTabStripStoryProps {
  /** The container width (px) the rail's tracks resolve against. */
  readonly width: number;
  /** The container HEIGHT (px) — the pane the foot rail is pinned to the bottom of. @defaultValue 480 */
  readonly height?: number;
  /** Add the 5th (Trackers) tab — the CP-1 ceiling headroom pin. @defaultValue false */
  readonly showTrackers?: boolean;
  /** Append an icon-LESS tab — proves it keeps its word unconditionally. @defaultValue false */
  readonly withIconless?: boolean;
  /** Seat a head band (the section's `header`). @defaultValue false */
  readonly withBand?: boolean;
  /** Seat the floating pane's own way out (overlay mode) — a dismiss the story counts. @defaultValue false */
  readonly withDismiss?: boolean;
}

export function ContextTabStripStory({
  width,
  height = 480,
  showTrackers = false,
  withIconless = false,
  withBand = false,
  withDismiss = false,
}: ContextTabStripStoryProps): ReactElement {
  const [dismissed, setDismissed] = useState(0);
  const tabs: ResolvedContextTab[] = [...CTX_STRIP_TABS];
  if (showTrackers) {
    tabs.push(CTX_TRACKERS_TAB);
  }
  if (withIconless) {
    tabs.push(CTX_ICONLESS_TAB);
  }
  return (
    <div style={{ width, height }} data-testid="ctx-strip-container" data-dismissed={dismissed}>
      <ContextTabsPanel
        tabs={tabs}
        railLabel="Chat"
        {...(withBand ? { header: <p data-testid="ctx-band-content">Example — Midnight Run</p> } : {})}
        {...(withDismiss ? { dismissLabel: "Close Chats details", onDismiss: (): void => setDismissed((n) => n + 1) } : {})}
      />
    </div>
  );
}

// ── Tab STATES in the bracket — the §4.6 badge + the PHASE-locked cell, over BOTH rails ─────────────────
// The set deliberately MIXES `strip` values: since #860 the bracket is the ONE composition for every pane,
// so a `game` tab lands in the state rail above the viewport (named "Game state") and a `meta` tab in the
// foot rail (named by the section) — the generic pane no longer flattens rail membership into one strip.
// The state vocabulary: the badge (dot + count, never on the active tab) and the LOCKED cell (padlock +
// reason on `title`, NOT `aria-disabled` — it OPENS onto its reason, RV-7, in every pane).

const CTX_TAB_STATE_TABS: readonly ResolvedContextTab[] = [
  resolvedTab({ id: "rpg.status", label: "Status", icon: Gauge, node: <div data-testid="ctx-body-status">status</div>, strip: "game" }),
  // A tab carrying a boolean badge (the 6px changed-dot).
  resolvedTab({ id: "rpg.scene", label: "Scene", icon: Drama, node: <div data-testid="ctx-body-scene">scene</div>, strip: "game", badge: true }),
  // A tab carrying a COUNT badge (the pending-proposals idiom).
  resolvedTab({ id: "rpg.game", label: "Game", icon: Crown, node: <div data-testid="ctx-body-game">game</div>, strip: "game", badge: 3 }),
  // A PHASE-disabled tab (the locked-tab pattern — the Map/MA-3 shape).
  resolvedTab({
    id: "rpg.map",
    label: "Map",
    icon: Flag,
    node: <div data-testid="ctx-body-map">map</div>,
    strip: "game",
    disabledReason: "Maps unlock with the map arc (MA-3)",
  }),
  resolvedTab({ id: "members", label: "Members", icon: Users, node: <div data-testid="ctx-body-members">members</div>, strip: "meta" }),
  resolvedTab({ id: "settings", label: "Settings", icon: Settings, node: <div data-testid="ctx-body-settings">settings</div>, strip: "meta" }),
];

/** The bracket at a fixed size — TWO rails over a mixed-`strip` set, badges + a locked cell. */
export function ContextTabStatesStory({ width = 291, height = 560 }: { readonly width?: number; readonly height?: number }): ReactElement {
  return (
    <div style={{ width, height }} data-testid="ctx-strip-container">
      <ContextTabsPanel tabs={CTX_TAB_STATE_TABS} railLabel="Chat" />
    </div>
  );
}

// A production-shaped game set: the META `members` tab is FIRST in declared order (chat's own tab, before
// the rpg contributor game tabs), and `rpg.status` carries the §4.1 `defaultTab` flag. This is exactly the
// shape that regresses without the flag — a fresh panel (no stored contextTab) would land on `members`.
const CTX_DEFAULT_TAB_TABS: readonly ResolvedContextTab[] = [
  resolvedTab({ id: "members", label: "Members", icon: Users, node: <div data-testid="ctx-body-members">members</div>, strip: "meta" }),
  resolvedTab({ id: "rpg.status", label: "Status", icon: Gauge, node: <div data-testid="ctx-body-status">status</div>, strip: "game", defaultTab: true }),
  resolvedTab({ id: "rpg.scene", label: "Scene", icon: Drama, node: <div data-testid="ctx-body-scene">scene</div>, strip: "game" }),
];

/** THE OWNERSHIP AXIS, IN A REAL PANE SURFACE (#875 F1/F2 — the framebuffer arm of context-bracket.ct).
 *
 *  The bracket's two rails and its band are painted with ALPHA fills over the pane's own `sidebar`
 *  surface, so a decode is only honest if the surface UNDER them is the production one. This story is the
 *  `ContextTabStatesStory` set (two rails, a locked cell) mounted on `bg-sidebar` — what `.shell-panel`
 *  paints — with a bare strip of that same surface beside the column to sample the "pane" reading from.
 *  `paneWidth` exists because a story hard-wired to one width measures the docked pane at every viewport
 *  ([[ct-viewport-under-48rem-hits-mobile-shell-arm]]). */
export function ContextOwnershipStory({ paneWidth = 384, height = 700 }: { readonly paneWidth?: number; readonly height?: number }): ReactElement {
  return (
    <div className="flex bg-sidebar" style={{ width: paneWidth + PANE_PROBE_WIDTH, height }}>
      {/* The pane's own background, unpainted — the decode's zero point. */}
      <div data-testid="ctx-pane-surface" style={{ width: PANE_PROBE_WIDTH, height }} />
      <div style={{ width: paneWidth, height }} data-testid="ctx-strip-container">
        <ContextTabsPanel tabs={CTX_TAB_STATE_TABS} railLabel="Chat" header={<p data-testid="ctx-band-content">Example — Midnight Run</p>} />
      </div>
    </div>
  );
}

/** Wide enough that the ring/median sample is the surface and not its neighbours' edge pixels. */
const PANE_PROBE_WIDTH = 24;

/** The crowned flag for one meta cell, off the ONE declared set (`_crowned-tabs.ts`) the node parity pin
 *  checks against the live definitions — so this story can never disagree with the product about which
 *  cells wear the crown. */
function isCrowned(id: string): boolean {
  return CT_META_RAIL_CROWNED_IDS.includes(id);
}

/** The LIVE meta roster of a host's game room, in the order the CONTRIBUTOR REGISTRIES produce it, and
 *  with the CROWN SET THE PRODUCT ACTUALLY HAS (corrected #898, 2026-08-30).
 *
 *  IT USED TO CROWN `Game` ALONE, and that single wrong datum is what made a no-op fix look green: three
 *  meta cells carry `crown: true` live — `Preview` (`chats-section.tsx:98`), `Game`
 *  (`rpg-context-section.tsx`) and `Activity` (`activity-context-tab.tsx:28`) — so a partition on the flag
 *  cannot move anything, while a fixture crowning one cell made it look like it could. THE DURABLE RULE:
 *  a fixture's AXIS DATA (here, which cells are crowned) is not decoration — it is the thing under test,
 *  and it must be derived from the live definitions or checked against them. Hand-declaring it is how a
 *  green CT certifies an arrangement the product has never rendered.
 *
 *  THE RULE NOW HAS AN ENFORCER (#1629). The crowned ids moved to `_crowned-tabs.ts` — one home, spelled
 *  once — and `tests/client/lib/registry-contracts.dom.test.ts` derives the LIVE crowned set from the three OWNING definitions
 *  (`chatContextTabs`, `makeRpgContextTabs`, `automationActivityTab`) and asserts the two are equal. A
 *  definition that gains or loses a crown now REDS that pin instead of quietly re-greening this story. The
 *  Activity cell also takes its REAL id here: the door mints it as `automation.activity`, and `activity`
 *  was a fourth hand-typed datum with nothing checking it. */
const CTX_META_RAIL_TABS: readonly ResolvedContextTab[] = [
  resolvedTab({ id: "members", label: "Members", icon: Users, node: <div>members</div> }),
  resolvedTab({ id: "settings", label: "This chat", icon: Settings, node: <div>this chat</div> }),
  resolvedTab({ id: "preview", label: "Preview", icon: Eye, node: <div>preview</div>, crown: isCrowned("preview") }),
  resolvedTab({ id: "rpg.game", label: "Game", icon: Crown, node: <div>game</div>, crown: isCrowned("rpg.game") }),
  resolvedTab({ id: "automation.activity", label: "Activity", icon: FlaskConical, node: <div>activity</div>, crown: isCrowned("automation.activity") }),
];

/** The meta rail at its live roster and crown set — and at a width the five cells cannot fit,
 *  so the same mount answers the OVERFLOW question (#875 F7/F8): does the rail SAY it is scrollable?
 *  `paneWidth` is a prop because a story hard-wired to one width measures the pane at every viewport
 *  ([[ct-viewport-under-48rem-hits-mobile-shell-arm]]) — the pin drives both ends of it. */
export function ContextMetaRailStory({ paneWidth = 291, withTrail = false }: { readonly paneWidth?: number; readonly withTrail?: boolean }): ReactElement {
  return (
    <div style={{ width: paneWidth, height: 480 }} data-testid="ctx-strip-container">
      <ContextTabsPanel
        tabs={CTX_META_RAIL_TABS}
        railLabel="Chat"
        {...(withTrail
          ? {
              // The host's rail-trail actions — a glyph button that is NOT a cell (#878 F17). A `Button`
              // rather than a raw element: the trail is a real control in production (chat's add-member
              // popover, the character kebab) and the pin measures its box against the track's.
              actions: (
                <Button aria-label="Fake trail" intent="ghost" size="icon" type="button">
                  <Icon icon={Crown} size="sm" />
                </Button>
              ),
            }
          : {})}
      />
    </div>
  );
}

/** The §4.1 preferred-default landing: `members` is the declared-order first, but `rpg.status` flags
 *  `defaultTab`, so a fresh panel (no stored contextTab) must land on Status, not Members. */
export function ContextDefaultTabStory({ width = 291 }: { readonly width?: number }): ReactElement {
  return (
    <div style={{ width, height: 480 }} data-testid="ctx-strip-container">
      <ContextTabsPanel tabs={CTX_DEFAULT_TAB_TABS} railLabel="Chat" />
    </div>
  );
}

/** CustomThemeStyle in isolation — the owner's custom-CSS injection (Layer 1). The css prop is injected
 *  unlayered + last-in-<head>; the probes prove it wins: `.shell-rail` (shell.css already styles it) and
 *  `.bg-primary` (a `@layer utilities` class reading `var(--color-primary)`, which a `:root` redefine in
 *  the injected CSS overrides). */
export function CustomThemeStyleStory({ css }: { readonly css: string }): ReactElement {
  return (
    <div>
      <CustomThemeStyle css={css} />
      <div className="shell-rail" data-testid="rail-probe" style={{ width: 20, height: 20 }} />
      <div className="bg-primary" data-testid="primary-probe" style={{ width: 20, height: 20 }} />
      <div className="text-reading-plate-foreground" data-testid="plate-ink-probe">
        plate ink
      </div>
    </div>
  );
}

// ── The HEAD-BAND REGION CLAIM through the REAL path (HUD-1 §3.1/§3.2, re-shaped by #860) ────────────
// A FAKE claimant (no rpg import — the mechanism is generic) mounted through the REAL path: a
// `defineContextTabs` mint carrying a `regions` contributor registry → `resolveContextTabs` → the
// `SectionContextHost`/`SectionContextHeader` pair. The claimant supplies ONLY the head band; the bracket
// (rails, viewport, ground) is the shell's in every case, and its cells write the shared `contextTab` seam.

const REGION_TABS: readonly ContextTabDef<void>[] = [
  { id: "members", label: "Members", strip: "meta", body: (): ReactNode => <div data-testid="ctx-body-members">members</div> },
  {
    id: "fake.status",
    label: "Status",
    strip: "game",
    defaultTab: (): boolean => true,
    body: (): ReactNode => <div data-testid="ctx-body-status">status</div>,
  },
  { id: "fake.scene", label: "Scene", strip: "game", body: (): ReactNode => <div data-testid="ctx-body-scene">scene</div> },
];

/** A store PROBE beside the pane — reads `contextTab` straight from `#state`, so a click assertion
 *  proves the shared seam was WRITTEN, not that the bracket re-rendered its own local state. */
function ContextTabStoreProbe(): ReactElement {
  return <p data-testid="ctx-tab-store">{useContextTab() ?? "unset"}</p>;
}

function regionSection(regions: ContributorRegistry<ContextRegionDef<void>>): SectionDefinition {
  return {
    id: "chats",
    rail: { label: "Chats", icon: MessagesSquare, group: "primary", mobile: "tab" },
    panelDefaults: { list: "docked", context: "docked" },
    placeholder: { title: "Chats", description: "Fake section for the region-claim CT." },
    content: { planned: "ct" },
    context: defineContextTabs<void>({
      useContextState: () => VOID_STATE,
      tabs: REGION_TABS,
      // The section's OWN band — what a claim must REPLACE, never sit beside ("never a second head").
      header: (): ReactNode => <p data-testid="section-band">Section identity</p>,
      railLabel: "Chat",
      regions,
    }),
    useSelectionTitle: NO_SELECTION_TITLE,
  };
}

// Minted at MODULE scope (like every production section) so `useResolved` has a stable identity.
const CLAIMING_REGIONS = createContributorRegistry<ContextRegionDef<void>>("ct-regions-claiming", [
  defineContextRegion<void>({ id: "fake.hud", claims: () => true, band: () => <p data-testid="fake-band">Fake waystone</p> }),
]);
const IDLE_REGIONS = createContributorRegistry<ContextRegionDef<void>>("ct-regions-idle", [
  defineContextRegion<void>({ id: "fake.hud", claims: () => false, band: () => <p data-testid="fake-band">Fake waystone</p> }),
]);
const CLAIMED_SECTION = regionSection(CLAIMING_REGIONS);
const UNCLAIMED_SECTION = regionSection(IDLE_REGIONS);

/** A CLAIMING region takes the head band: the shell's bracket renders around it, the section's own band
 *  does not render. */
export function ContextRegionClaimStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 291, height: 400 }}>
        <ContextTabStoreProbe />
        <SectionContextHost definition={CLAIMED_SECTION} />
      </div>
    </CtDataProviders>
  );
}

/** A NON-claiming region contributor is ignored — the section's own band renders (§3.3). */
export function ContextRegionNoClaimStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 291, height: 400 }}>
        <SectionContextHost definition={UNCLAIMED_SECTION} />
      </div>
    </CtDataProviders>
  );
}

/** The shell's BAND slot over a tabs pane: `SectionContextHeader` renders NOTHING (the bracket owns the
 *  pane's head, claimed or not) — never the neutral "Details" fallback. `claimed` picks the section. */
export function ContextRegionHeaderStory({ claimed = true }: { readonly claimed?: boolean }): ReactElement {
  return (
    <CtDataProviders>
      <div data-testid="band-slot">
        <SectionContextHeader definition={claimed ? CLAIMED_SECTION : UNCLAIMED_SECTION} />
      </div>
    </CtDataProviders>
  );
}

// ── The four APP-SHELL-owned appearance SECTIONS (SET-SEAMS stage 1) ──────────────────────────────
// app-shell PAINTS these knobs (the shell scope tokens, the content-width clamp, `data-elevation`/
// `data-reduced-motion`, the reading scope, the glass/texture effects, the background layers), so under §6
// it owns their editors. Each is self-owned: its own cache-first read, its own autosave session and its own
// KEY-MINIMAL `updateUserSettingsSection("appearance")` write. Mounted bare (no `SaveStatusHostContext`) so
// the DEGRADED save-status arm renders inline.

/** The Sizing & motion appearance section — `getUserSettings` + the appearance section-patch stubbed
 *  per-test via routeTrpc. */
export function AppearanceSizingSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720, padding: 16 }}>
        <AppearanceSizingSection sectionId="appearance-sizing" />
      </div>
    </CtDataProviders>
  );
}

/** The Reading typography appearance section. */
export function AppearanceReadingSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720, padding: 16 }}>
        <AppearanceReadingSection sectionId="appearance-reading" />
      </div>
    </CtDataProviders>
  );
}

/** The Effects appearance section. */
export function AppearanceEffectsSectionStory({ width = 720 }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width, padding: 16 }}>
        <AppearanceEffectsSection sectionId="appearance-effects" />
      </div>
    </CtDataProviders>
  );
}

/** The Background appearance section. */
export function AppearanceBackgroundSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720, padding: 16 }}>
        <AppearanceBackgroundSection sectionId="appearance-background" />
      </div>
    </CtDataProviders>
  );
}

// #1194's COMMIT-TALLY STORY IS DELETED (#2412, 2026-09-18) — a `<Profiler>` around the Background section
// tallying onto `globalThis.__ctCommits` measured NOTHING here: playwright-ct runs the PRODUCTION React
// build, whose `<Profiler>` never calls `onRender`, so the tally sat at 0 and the CT's two assertions on it
// compared 0 to 0. The pin now samples RENDERED GEOMETRY per animation frame off the plain
// `AppearanceBackgroundSectionStory` above (the #1873 pattern, `tests/client/features/chat/_ct-stories.tsx`).
// Do not re-add a commit tally to a CT; it cannot fail.
