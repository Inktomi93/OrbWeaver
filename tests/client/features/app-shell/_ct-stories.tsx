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
// SHELL.CSS (L6/J12): the rail renders BOTH layouts — the desktop icon column + the mobile bottom tab
// bar — and shell.css's `@media` shows exactly one (`display:none` on the other, which also removes it
// from the a11y tree). AppShell imports shell.css itself, but the bare RailStory does not, so import it
// HERE too — otherwise both blocks render and every section name resolves to TWO buttons. At the CT's
// desktop viewport (1280px > 48rem) this hides the mobile bar, matching production.

import { AppShell } from "@orb/client/features/app-shell";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { CustomThemeStyle } from "../../../../packages/client/src/features/app-shell/components/custom-theme-style";
import { Rail } from "../../../../packages/client/src/features/app-shell/components/rail";
import "../../../../packages/client/src/features/app-shell/surfaces/shell.css";
import type { ModalSlotId } from "../../../../packages/client/src/state/shell-store";
import { openModal } from "../../../../packages/client/src/state/shell-store";
import "../../../../packages/client/src/styles/globals.css";
import {
  CtChatContributorSectionRegistry,
  CtDataProviders,
  CtFakeModalRegistry,
  CtFakeSectionRegistry,
} from "../../../support/ct/ct-data-providers";

/** The full shell with chats CONTENT+CONTEXT slots + a corpus LIST/CONTENT slot; other sections fall
 *  back. The chats `context` slot backs the CONTEXT-follows-section CT (§4.2 rule 1). */
export function AppShellStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry
        sections={{
          chats: {
            content: <p>chats content pane</p>,
            context: <p>chats context pane</p>,
          },
          corpus: { list: <p>corpus list pane</p>, content: <p>corpus content pane</p> },
        }}
      >
        {/* The real "You" bottom-sheet body arrives via the modal registry (CtFakeSectionRegistry nests
            the real modal registry), so the mobile CT exercises the real sheet, not a placeholder. */}
        <AppShell />
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** The REAL shell + the REAL `chats` section (`ChatContent`, landing by default) — end-to-end proof that
 *  `useListDocked` (chat-content.tsx) agrees with `resolvePanel`'s auto-overlay derivation at every width
 *  (the M10-correction verifier gap): mounting through the real `useShellLayout` viewport-publish effect,
 *  not a hand-fed store write. */
export function AppShellRealChatsStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtChatContributorSectionRegistry>
        <AppShell />
      </CtChatContributorSectionRegistry>
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
export function ModalScrollStory({ modalId }: { readonly modalId: ModalSlotId }): ReactElement {
  useEffect(() => {
    openModal(modalId);
  }, [modalId]);
  return (
    <CtDataProviders>
      <CtFakeSectionRegistry sections={{ chats: { content: <p>chats content pane</p> } }}>
        {/* A fake modal registry injects a deliberately-tall body for every id (the inner provider wins
            over CtFakeSectionRegistry's real one), so the scroll invariant is exercised per placement.
            `flexShrink: 0` so the drawer's flex-column scroll region can't shrink this EMPTY probe to fit
            (real drawer content has intrinsic height that resists shrink; an empty div would not) — we
            want it to genuinely overflow so the scroll assertion measures a real scroll region. */}
        <CtFakeModalRegistry
          body={(): ReactElement => (
            <div data-testid="tall-modal-body" style={{ height: 3000, flexShrink: 0 }} />
          )}
        >
          <AppShell />
        </CtFakeModalRegistry>
      </CtFakeSectionRegistry>
    </CtDataProviders>
  );
}

/** The Rail in isolation — a11y + keyboard nav over real <button>s, registry-driven. `railFoot` is a
 *  route-composed slot (production: `PersonaPanelSurface`); this story stands in a bare named button so
 *  the avatar slot stays part of the a11y-baseline assertion without pulling in the persona feature. */
export function RailStory(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <Rail
        activeSection="chats"
        onSelectSection={(): void => undefined}
        onOpenModal={(): void => undefined}
        railFoot={<button type="button">Account</button>}
      />
    </CtFakeSectionRegistry>
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
    </div>
  );
}
