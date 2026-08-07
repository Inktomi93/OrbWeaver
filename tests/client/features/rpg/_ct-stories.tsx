// rpg takeover CT stories (Spine-Testing §7 — CT mounts ONLY from a non-test module). The takeover is the
// rpg feature's SELF-CONTAINED contributor (`makeRpgContextTabs`) rendered through the REAL chats
// `SectionContextHost` (the shell's one CONTEXT consumer) via `CtChatContributorSectionRegistry` — the same
// door→factory→mint→resolve path main.tsx wires, driven over the stubbed network (routeTrpc supplies
// `chat.getChat` with the rpg pointer + the `rpg.getGame`/`getTrackerView` reads). This proves the 4 game
// tabs render + `when`-gate on `chat.rpg !== null` (a CACHE-FIRST getChat read), a tab body renders real
// tracker data, an editable block fires its mutation, and the read-only pill shows + disables edits.
//
// The contributor registry is built INSIDE the data providers (via `useTRPC`/`useQueryClient`) because
// `makeRpgContextTabs` is injected the cross-domain read channel `{ trpc, queryClient }` at the door — the
// story mirrors that door assembly with the CT's own singletons.

import { useTRPC } from "@orb/client/data";
import { makeRpgContextTabs, makeRpgHudRegion, rpgTurnToolCallsSurface } from "@orb/client/features/rpg";
import type { ChatContextState, ContextRegionDef, ContextTabDef } from "@orb/client/lib";
import { bindNotify, createContributorRegistry } from "@orb/client/lib";
import { selectChat, useSectionRegistry } from "@orb/client/state";
import type { MessageView } from "@orb/contracts/chat";
import type { MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import { SectionContextHeader, SectionContextHost } from "../../../../packages/client/src/features/app-shell/components/section-context-host.tsx";
import { RpgFreshnessIndicator } from "../../../../packages/client/src/features/rpg/components/rpg-freshness-indicator.tsx";
import { RpgCardLightbox } from "../../../../packages/client/src/features/rpg/components/rpg-scene-cards.tsx";
import type { ArchivedCard } from "../../../../packages/client/src/features/rpg/lib/archived-cards.ts";
import { CtChatContributorSectionRegistry, CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";
import { CHAT_ID, makeMessageView } from "../chat/fixtures.ts";

/** Mounts the chats section's CONTEXT through the real host, with BOTH rpg contributions merged in — the tab
 *  contributors AND the whole-pane HUD region claim — built here with the CT's own trpc/queryClient (the
 *  door-injection both factories take). Bounded height so the band + two rails + viewport have real room. */
function RpgTakeoverHarness({ width, height }: { readonly width: number; readonly height: number }): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const contributors = createContributorRegistry<ContextTabDef<ChatContextState>>("chat-context", makeRpgContextTabs({ trpc, queryClient }));
  const regions = createContributorRegistry<ContextRegionDef<ChatContextState>>("chat-context-regions", [makeRpgHudRegion({ trpc, queryClient })]);
  return (
    <CtChatContributorSectionRegistry contextContributors={contributors} contextRegions={regions}>
      <RpgTakeoverInner width={width} height={height} />
    </CtChatContributorSectionRegistry>
  );
}

function RpgTakeoverInner({ width, height }: { readonly width: number; readonly height: number }): ReactElement {
  const registry = useSectionRegistry();
  const definition = registry.get("chats");
  // Mirror the REAL CONTEXT panel anatomy (app-shell.tsx + PanelChrome): the `.shell-panel` aside, its
  // `.shell-panel-header` BAND slot, and the `.shell-panel-body` + `.shell-region-fill` wrappers the host
  // renders inside. The classes are load-bearing, not decoration — shell.css puts the panel's padding, its
  // `container-type` (which the band's @container size steps interrogate) and the CLAIMED-pane edge rule on
  // exactly these boxes, so a bare div harness measures different pixels than prod.
  // Under the HUD-1 claim the band slot renders NOTHING — the claimant owns the pane's top edge and paints
  // its own band inside the body — so keeping the slot here is deliberate: the CT proves it stays empty
  // rather than assuming it was never mounted.
  return (
    <div style={{ height, width, display: "flex", flexDirection: "column" }}>
      <aside className="shell-panel" data-panel-mode="docked" data-panel-side="context" style={{ flex: "1 1 auto", minHeight: 0 }}>
        <header className="shell-panel-header">
          <SectionContextHeader key="chats-header" definition={definition} />
        </header>
        <div className="shell-panel-body">
          <div className="shell-region-fill">
            <SectionContextHost key="chats" definition={definition} />
          </div>
        </div>
      </aside>
    </div>
  );
}

/** The rpg takeover via the real host + the real self-contained rpg contributor, over the stubbed network.
 *  The `.ct.tsx` sets the routeTrpc stubs (`chat.getChat` with the rpg pointer, `rpg.getGame`, `getTrackerView`). */
export function RpgTakeoverStory({ width = 320, height = 640 }: { readonly width?: number; readonly height?: number } = {}): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  return (
    <CtDataProviders>
      <RpgTakeoverHarness width={width} height={height} />
    </CtDataProviders>
  );
}

/** EDITSNAP-OK — the SAME takeover with `notify` bound to a DOM sink. The hand doors refuse as DATA on a
 *  RESOLVED mutation (no throw, no sticky error, no `errorToast`), so the toast the mutation factory raises
 *  is the ONLY observable a refusal has; `bindNotify` is main.tsx-only, so the CT harness leaves `notify` a
 *  no-op unless a story binds it (the `PersonaThisChatStory` precedent). */
export function RpgTakeoverNotifyStory(): ReactElement {
  const [notified, setNotified] = useState<string>("");
  useEffect(() => {
    selectChat(CHAT_ID);
    bindNotify({
      info: (m): void => setNotified(m),
      success: (m): void => setNotified(m),
      error: (m): void => setNotified(m),
    });
  }, []);
  return (
    <CtDataProviders>
      <RpgTakeoverHarness width={320} height={640} />
      <p data-testid="rpg-notified">{notified}</p>
    </CtDataProviders>
  );
}

/** The SAME takeover at HUD-1 §7.1's stated budget reference — a 30rem × 900px docked context panel (the
 *  panel's `clamp(17rem, 30vw, 30rem)` ceiling, at a full-height desktop window). The vertical-budget rule
 *  is written against exactly this geometry, so the CT that pins it must mount exactly this geometry: a
 *  ratio measured in the 320×640 story would be answering a different question. */
export function RpgTakeoverReferenceStory(): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  return (
    <CtDataProviders>
      <RpgTakeoverHarness width={480} height={900} />
    </CtDataProviders>
  );
}

/** The SAME takeover at the context panel's own FLOOR — `clamp(17rem, 30vw, 30rem)`'s 17rem/272px arm, the
 *  width a ~900px-wide window docks to. The rail's narrow-wrap rule is written against exactly this width
 *  (six cells on one row here is what clipped four captions to three characters), so the CT that pins it
 *  mounts exactly this width. */
export function RpgTakeoverFloorStory(): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  return (
    <CtDataProviders>
      <RpgTakeoverHarness width={272} height={640} />
    </CtDataProviders>
  );
}

// The freshness indicator in isolation — a pure component (no providers/network), so every honest state mounts
// directly. This proves the label datum + a11y model per state without driving a live turn over SSE. Since EFF-3
// the input is the room's EFFECTIVE delivery, not the raw knob — the arm that used to lie ("folded" on a wire
// that cannot fold, showing "Live" while rounding a beat behind) is the `RpgFreshnessGuardedStory` below.

/** The host picked the two-call arm, idle — the accepted one-beat lag surfaced ("As of last beat"). */
export function RpgFreshnessCheapIdleStory(): ReactElement {
  return <RpgFreshnessIndicator delivery={{ path: "tool-round", fallbackReason: null }} pending={false} />;
}

/** The two-call arm with the post-commit round's window open — the transient "Updating…" (pulse aria-hidden).
 *  (`cheap` claimed "Live" from D108's inline-tools shape, which D109 replaced with a dedicated round.) */
export function RpgFreshnessCheapStory(): ReactElement {
  return <RpgFreshnessIndicator delivery={{ path: "tool-round", fallbackReason: null }} pending={true} />;
}

/** The fold actually ran (R1) — the reply records its own state, so there is no post-commit call to wait on: a
 *  minimal "Live" affordance, never a fake lag label. `pending` is true to prove it does NOT flip to "Updating…". */
export function RpgFreshnessFoldedStory(): ReactElement {
  return <RpgFreshnessIndicator delivery={{ path: "folded", fallbackReason: null }} pending={false} />;
}

/** THE EFF-3 ARM: a `folded` game on a wire that goes mute under tool attachment. It rounds a beat behind, and
 *  before EFF-3 this exact room rendered "Live" (D112 (4)'s KNOWN GAP). The label is the lag; the title carries
 *  the reason. `pending` true proves the fallback arm still opens the honest transient. */
export function RpgFreshnessGuardedStory(): ReactElement {
  return <RpgFreshnessIndicator delivery={{ path: "tool-round", fallbackReason: "local-engine-fold-guard" }} pending={false} />;
}

/** No model write path at all — nothing delivers state, so the pill renders NOTHING (the band's Read-only pill
 *  is the honest word; a freshness claim beside it would be the lie again). */
export function RpgFreshnessNoneStory(): ReactElement {
  // Wrapped: the component renders null, and a mount root with no element in it is not something the CT can
  // hold a locator on — the wrapper is the anchor the "nothing here" assertion counts children against.
  return (
    <div data-testid="freshness-slot">
      <RpgFreshnessIndicator delivery={{ path: "none", fallbackReason: null }} pending={true} />
    </div>
  );
}

// The archived-card LIGHTBOX in isolation — a pure component (Dialog + the sandboxed ImmersiveCard, no
// providers/network), mounted OPEN so the sandbox frame the archive really renders is assertable. The card
// arrives with its ORIGIN ROW's resolved render policy already stamped (`collectArchivedCards`), which is the
// fact under test: the archive is a second lens on transcript content, so it must inherit that verdict.

const LIGHTBOX_CARD_KEY = "msg_1-0";

// The lightbox is mounted OPEN and never closed by the CT — dismissal is Dialog's, not this story's job.
const NOOP = (): void => undefined;

/** One archived card, open in the lightbox, carrying an external `<img>` and the given media verdict. */
export function RpgCardLightboxStory({ allowExternalMedia }: { readonly allowExternalMedia: boolean }): ReactElement {
  const card: ArchivedCard = {
    key: LIGHTBOX_CARD_KEY,
    messageId: castId<MessageId>("msg_1"),
    title: "A sealed letter",
    html: '<p>Read me</p><img src="https://evil.test/tracker.png" alt="">',
    origin: "fence",
    createdAt: 1_700_000_000_000,
    allowExternalMedia,
  };
  return <RpgCardLightbox cards={[card]} openKey={LIGHTBOX_CARD_KEY} onOpenChange={NOOP} />;
}

// ── The per-row "what this turn did" disclosure (TOOLCALLS-INVISIBLE, arm A) ────────────────────────────
// Mounted through the REAL `message-footer` contribution the door registers, so the CT exercises the same
// `when` → `body` path `main.tsx` wires rather than the component in isolation. The `.ct.tsx` stubs
// `rpg.listTurnToolCalls` with a REAL folded turn's call set (applied + salvaged + dropped together — the
// mixed row is the one worth proving).

/** The message the disclosure hangs off — an assistant row whose selected variant is the recorded one. */
const TOOL_CALLS_MESSAGE = makeMessageView({
  id: castId<MessageId>("msg_ct_folded"),
  selectedVariantId: castId<MessageVariantId>("mv_ct_folded"),
});

/** A SECOND swipe of the same slot — no record was written for it. Proves the applicability gate is keyed to
 *  the VARIANT, not the message: swiping to an unrecorded variant must render nothing at all. */
const TOOL_CALLS_OTHER_VARIANT = makeMessageView({
  id: castId<MessageId>("msg_ct_folded"),
  selectedVariantId: castId<MessageVariantId>("mv_ct_other"),
});

/** Renders the rpg `message-footer` contribution exactly as the row does: `when` first, then `body`.
 *  Returns `ReactNode` (not `ReactElement`) because that is what a contribution's `body` returns — the row
 *  mounts it the same way. */
function RenderFooterContribution({ message }: { readonly message: MessageView }): ReactNode {
  if (rpgTurnToolCallsSurface.anchor !== "message-footer") {
    return null;
  }
  return rpgTurnToolCallsSurface.when?.({ message }) === false ? null : rpgTurnToolCallsSurface.body({ message });
}

/** The recorded variant's row. */
export function TurnToolCallsDisclosureStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 480 }}>
        <RenderFooterContribution message={TOOL_CALLS_MESSAGE} />
      </div>
    </CtDataProviders>
  );
}

/** The SAME slot swiped to a variant with no record — the applicability gate's negative arm. */
export function TurnToolCallsOtherVariantStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 480 }}>
        <RenderFooterContribution message={TOOL_CALLS_OTHER_VARIANT} />
      </div>
    </CtDataProviders>
  );
}

/** A USER row — `when` refuses it outright (a user turn calls no tools). */
export function TurnToolCallsUserRowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 480 }}>
        <RenderFooterContribution message={makeMessageView({ role: "user", selectedVariantId: castId<MessageVariantId>("mv_ct_folded") })} />
      </div>
    </CtDataProviders>
  );
}
