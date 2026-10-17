// Central reviewed grants for primitive access, non-relational identifiers and factory boundaries.
// reviewed-grants.ts owns aggregation; network-egress grants live in reviewed-grants-depcruise-to-egress.ts.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_NO_TO_FACTORY: readonly ReviewedGateGrant[] = [
  {
    id: "persistence-boundary:durable-local",
    policyId: "persistence-boundary",
    subject: "packages/client/src/state/durable-local.ts",
    operation: "raw-storage:localStorage",
    why: "the two persist factories' SHARED half — the per-user durable-local namespace. Its only raw-storage touch is the last-bound-userId POINTER a cold boot mints store keys against; store blobs move through each store's own persist storage and never through this. Boot machinery, the same carve-out class as the composition root.",
    endsWhen: "key minting stops needing a pre-store pointer (the bound user is known before any store is created), which would make this read unnecessary.",
  },
  {
    id: "persistence-boundary:main-preload-guard",
    policyId: "persistence-boundary",
    subject: "packages/client/src/main.tsx",
    operation: "raw-storage:sessionStorage",
    why: "the composition root's `vite:preloadError` reload-once guard: a redeploy rotates hashed chunk names and an old tab that lazy-imports a stale hash white-screens, so the soft reload is guarded by a tab-scoped flag that stops a reload loop. Boot machinery, and it runs in a window listener before the app's stores exist.",
    endsWhen: "chunk-hash rotation stops white-screening an open tab (a service worker or a version handshake owns it), which retires the guard.",
  },
  {
    id: "persistence-boundary:probe-mode",
    policyId: "persistence-boundary",
    subject: "packages/client/src/lib/probe-mode.ts",
    operation: "raw-storage:localStorage",
    why: "the dev-only probe flag seeded by `pnpm snap --probe` BEFORE the app boots — deterministic-render instrumentation, not app state, and read once before React mounts. A store door cannot serve it because no store exists yet at that point.",
    endsWhen: "probe mode is delivered by something other than pre-boot storage (a query parameter or a build flag), at which point this read disappears.",
  },
  {
    id: "persistence-boundary:session-resume",
    policyId: "persistence-boundary",
    subject: "packages/client/src/data/session-resume.ts",
    operation: "raw-storage:sessionStorage",
    why: "the OIDC re-auth resume snapshot: TAB-scoped by requirement (a sibling tab must not inherit another tab's redirect round trip) and written across a full-document navigation, so it cannot ride a store door at all. Session machinery, not a device-local preference.",
    endsWhen: "the IdP round trip stops requiring a full-document navigation, so the resume target can live in memory.",
  },
  {
    id: "render-error-via-battery:persona-panel-surface",
    policyId: "render-error-via-battery",
    subject: "packages/client/src/features/persona/surfaces/persona-panel-surface.tsx",
    operation: "custom-render-error",
    why: "the persona avatar degrades to its own loading placeholder rather than a Couldn't-load card with a Retry: it is a decorative slot, not a read the user retries.",
    endsWhen: "the avatar becomes a retryable read, or the surface moves.",
  },
  {
    id: "render-error-via-battery:rpg-context-section",
    policyId: "render-error-via-battery",
    subject: "packages/client/src/features/rpg/lib/rpg-context-section.tsx",
    operation: "custom-render-error",
    why: "the rpg context pane needs a CONSOLIDATED, ANNOUNCED failure: the pane's live region reports 'Loaded chat.' on success, and `QueryErrorState` is a plain stack with no `role=\"alert\"`, so the game-tab body renders `RpgErrorState` — the pane's single announced region. One row covers both of this file's arms, because they are one licensed act at one subject.",
    endsWhen: "the pane drops its announced-failure intent, or `QueryErrorState` gains a live region the pane can use.",
  },
  {
    id: "render-error-via-battery:rpg-hud-band",
    policyId: "render-error-via-battery",
    subject: "packages/client/src/features/rpg/components/rpg-hud-band.tsx",
    operation: "custom-render-error",
    why: "the decorative HUD band collapses to `() => null` on a failed read so the pane has exactly ONE announced error surface (the body's) rather than two contradictory ones.",
    endsWhen: "the band becomes a retryable read of its own, or the pane stops owning a single announced failure.",
  },
  {
    id: "render-error-via-battery:add-model-on-key-dialog",
    policyId: "render-error-via-battery",
    subject: "packages/client/src/features/credentials/components/add-model-on-key-dialog.tsx",
    operation: "custom-render-error",
    why: "a failed or empty catalog is the picker's typed arm, never an error boundary for the dialog: the arm re-renders `ModelPicker` in its failed-catalog source so a model can still be named by id where policy permits it, instead of replacing the whole form with a Couldn't-load card.",
    endsWhen: "the typed-id fallback moves off `QueryBoundary`'s failed-read arm, or the picker itself grows its own retry-and-fallback surface.",
  },
  {
    id: "scrubber-home:member-visibility-stamp",
    policyId: "scrubber-home",
    subject: "packages/server/src/domain/chat/substrate/member-visibility.ts",
    operation: "hidden-span-scrubber-construction",
    why: "THE producer stamp — the one place a stateful per-slot scrubber may be constructed (§3.6, 808ba09cc6), because scrub state cannot survive a replay→live handoff and a cold scrubber mid-`<lie>` forwards the secret's tail.",
    endsWhen:
      "the producer stamp moves or stops constructing a scrubber; the row is then consumed zero times and reds, which is the legacy mode-A arm owned centrally.",
  },
  {
    id: "seed-theme-ink-contrast:meter-border",
    policyId: "seed-theme-ink-contrast",
    subject: "packages/ui/src/charts/meter/variants.ts",
    operation: "ink:border",
    why: "the gauge RAIL stroke (`track: text-border`, three species) — `--color-border` is a translucent LINE token that has no opaque colour to judge as text at all, and the rail is aria-hidden geometry under WCAG 1.4.11.",
    endsWhen: "a `track` slot typesets, or border stops being the rail's colour; either way this identity stops being reported and the row reds STALE.",
  },
  {
    id: "seed-theme-ink-contrast:meter-muted",
    policyId: "seed-theme-ink-contrast",
    subject: "packages/ui/src/charts/meter/variants.ts",
    operation: "ink:muted",
    why: "the UNFILLED segment (`filled:false -> segment: text-muted`) — a SURFACE token deliberately one ramp step from the panel, which is the whole point of an empty segment (its own header, #685/#693) and is 1.4.11 geometry, not text.",
    endsWhen: "a segment carries a label; the ink is then text duty, judged at 4.5:1, and this row licenses a finding whose reason no longer holds.",
  },
  {
    id: "seed-theme-ink-contrast:meter-track-1",
    policyId: "seed-theme-ink-contrast",
    subject: "packages/ui/src/charts/meter/variants.ts",
    operation: "ink:track-1",
    why: "`RING_STROKE` feeds `currentColor` to the RingGauge arc stroke on aria-hidden decorative geometry (its own header, #697) — WCAG 1.4.11's 3:1 applies, not 4.5:1 text, and palette-contrast.suite.test.ts already enforces that floor per seed.",
    endsWhen:
      "this kit typesets with a track token — the ink then stops being decorative geometry, the class is judged at 4.5:1, and this row licenses a finding whose reason no longer holds. A track slot that stops being painted at all consumes the row zero times and reds STALE.",
  },
  {
    id: "seed-theme-ink-contrast:meter-track-2",
    policyId: "seed-theme-ink-contrast",
    subject: "packages/ui/src/charts/meter/variants.ts",
    operation: "ink:track-2",
    why: "`RING_STROKE` feeds `currentColor` to the RingGauge arc stroke on aria-hidden decorative geometry (its own header, #697) — WCAG 1.4.11's 3:1 applies, not 4.5:1 text, and palette-contrast.suite.test.ts already enforces that floor per seed.",
    endsWhen:
      "this kit typesets with a track token — the ink then stops being decorative geometry, the class is judged at 4.5:1, and this row licenses a finding whose reason no longer holds. A track slot that stops being painted at all consumes the row zero times and reds STALE.",
  },
  {
    id: "seed-theme-ink-contrast:meter-track-3",
    policyId: "seed-theme-ink-contrast",
    subject: "packages/ui/src/charts/meter/variants.ts",
    operation: "ink:track-3",
    why: "`RING_STROKE` feeds `currentColor` to the RingGauge arc stroke on aria-hidden decorative geometry (its own header, #697) — WCAG 1.4.11's 3:1 applies, not 4.5:1 text, and palette-contrast.suite.test.ts already enforces that floor per seed.",
    endsWhen:
      "this kit typesets with a track token — the ink then stops being decorative geometry, the class is judged at 4.5:1, and this row licenses a finding whose reason no longer holds. A track slot that stops being painted at all consumes the row zero times and reds STALE.",
  },
  {
    id: "seed-theme-ink-contrast:meter-track-4",
    policyId: "seed-theme-ink-contrast",
    subject: "packages/ui/src/charts/meter/variants.ts",
    operation: "ink:track-4",
    why: "`RING_STROKE` feeds `currentColor` to the RingGauge arc stroke on aria-hidden decorative geometry (its own header, #697) — WCAG 1.4.11's 3:1 applies, not 4.5:1 text, and palette-contrast.suite.test.ts already enforces that floor per seed.",
    endsWhen:
      "this kit typesets with a track token — the ink then stops being decorative geometry, the class is judged at 4.5:1, and this row licenses a finding whose reason no longer holds. A track slot that stops being painted at all consumes the row zero times and reds STALE.",
  },
  {
    id: "seed-theme-ink-contrast:meter-track-5",
    policyId: "seed-theme-ink-contrast",
    subject: "packages/ui/src/charts/meter/variants.ts",
    operation: "ink:track-5",
    why: "`RING_STROKE` feeds `currentColor` to the RingGauge arc stroke on aria-hidden decorative geometry (its own header, #697) — WCAG 1.4.11's 3:1 applies, not 4.5:1 text, and palette-contrast.suite.test.ts already enforces that floor per seed.",
    endsWhen:
      "this kit typesets with a track token — the ink then stops being decorative geometry, the class is judged at 4.5:1, and this row licenses a finding whose reason no longer holds. A track slot that stops being painted at all consumes the row zero times and reds STALE.",
  },
  {
    id: "seed-theme-ink-contrast:meter-track-6",
    policyId: "seed-theme-ink-contrast",
    subject: "packages/ui/src/charts/meter/variants.ts",
    operation: "ink:track-6",
    why: "`RING_STROKE` feeds `currentColor` to the RingGauge arc stroke on aria-hidden decorative geometry (its own header, #697) — WCAG 1.4.11's 3:1 applies, not 4.5:1 text, and palette-contrast.suite.test.ts already enforces that floor per seed.",
    endsWhen:
      "this kit typesets with a track token — the ink then stops being decorative geometry, the class is judged at 4.5:1, and this row licenses a finding whose reason no longer holds. A track slot that stops being painted at all consumes the row zero times and reds STALE.",
  },
  {
    id: "seed-theme-ink-contrast:switch-readonly-glyph",
    policyId: "seed-theme-ink-contrast",
    subject: "packages/ui/src/primitives/switch/variants.ts",
    operation: "ink:background",
    why: "`readOnlyIcon` is the readonly LOCK GLYPH painted ON the switch thumb: `text-background` inverts against the thumb's own `bg-foreground` fill, measuring ~13:1 on the surface it actually sits on. An INVERTED pair ink — the `-foreground` suffix rule cannot see it because the inversion runs the other way (the INK is `background`) — and a glyph, judged at 1.4.11's 3:1.",
    endsWhen:
      "this slot paints a text run, or the thumb stops declaring its own fill; the grounds table then judges it correctly and the row is no longer needed.",
  },
  {
    id: "selection-store-via-factory:create-drill-selection-store",
    policyId: "selection-store-via-factory",
    subject: "packages/client/src/state/create-drill-selection-store.ts",
    operation: "raw-gated-store-mint",
    why: "the drill FACTORY itself composes the raw `createGatedStore` door on purpose — that composition IS the seal every per-section selection store mints through.",
    endsWhen:
      "the factory stops composing the door, or moves — either stales this row, where the legacy `/create-` FILENAME pattern would have exempted any future file with that prefix for free.",
  },
  {
    id: "selection-store-via-factory:create-kinded-selection-store",
    policyId: "selection-store-via-factory",
    subject: "packages/client/src/state/create-kinded-selection-store.ts",
    operation: "raw-gated-store-mint",
    why: "the kinded-selection factory, the same composition one shape over, named as its OWN row so a THIRD factory is judged rather than auto-exempt.",
    endsWhen: "the kinded factory stops composing the door, or moves.",
  },
  {
    id: "selection-store-via-factory:message-selection-store",
    policyId: "selection-store-via-factory",
    subject: "packages/client/src/state/message-selection-store.ts",
    operation: "raw-gated-store-mint",
    why: "the ONE `*-selection-store.ts` that is not a single-id drill: message selection is a bulk multi-select (presence in a Set keyed by message id), a shape the drill factory does not model.",
    endsWhen: "the drill factory models bulk selection and this store migrates onto it.",
  },
];
