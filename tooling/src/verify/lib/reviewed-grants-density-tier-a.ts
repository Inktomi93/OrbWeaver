// Reviewed grants: density-tier.
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_DENSITY_TIER_A: readonly ReviewedGateGrant[] = [
  {
    id: "density-tier:appearance-elevation-cards-box-in-box",
    policyId: "density-tier",
    subject: "packages/client/src/features/app-shell/components/appearance-elevation-cards.tsx",
    operation: "box-in-box",
    why: "the GLOW elevation ILLUSTRATION's two floating islands (#866 §7.8, owner-ruled diagram): bordered, rounded, filled cells INSIDE the bordered base frame — the nesting IS the depiction (glow separates by LINE + LIFT, so the island must be a bordered box floating over the base). CD2 fences real UI chrome from stacking boxes; a diagram's boxes are its ink, aria-hidden and pointer-inert.",
    endsWhen:
      "the glow elevation illustration stops depicting lift with bordered boxes nested inside the base frame — the diagram is redrawn, or the surface stops being an aria-hidden, pointer-inert illustration and becomes real UI chrome, which CD2 governs without exception.",
  },
  {
    id: "density-tier:rail-button-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/app-shell/components/rail-button.tsx",
    operation: "text-axis:size",
    why: '`size="label"` on the phone-bar control\'s own name is deliberate: `voice="label"` would pin the ink to `text-foreground` and break the muted/active colour states shell.css owns for this control — the file\'s own comment (rail-button.tsx) states the ruling.',
    endsWhen:
      '`voice="label"` stops pinning the ink to `text-foreground`, or shell.css stops owning the phone-bar control\'s muted/active colour states — either makes the closed voice expressible here.',
  },
  {
    id: "density-tier:section-context-host-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/app-shell/components/section-context-host.tsx",
    operation: "text-axis:size",
    why: 'the CONTEXT-band neutral "Details" fallback (`size="label" weight="medium" tone="muted"`) is a band-identity default, not prose or a directory entry — no closed voice combines label-step + medium weight + muted tone in that exact shape (spec §2.3\'s table is a fixed weight/tone per voice); a judgment call in the same class the spec rules non-forced for label+muted pairs.',
    endsWhen:
      "UI-Density-Law.md §2.3's closed voice table gains an arm at the label step with medium weight and muted tone — the exact shape the CONTEXT band's neutral fallback spells by hand today.",
  },
  {
    id: "density-tier:section-context-host-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/app-shell/components/section-context-host.tsx",
    operation: "text-axis:tone",
    why: 'the CONTEXT-band neutral "Details" fallback (`size="label" weight="medium" tone="muted"`) is a band-identity default, not prose or a directory entry — no closed voice combines label-step + medium weight + muted tone in that exact shape (spec §2.3\'s table is a fixed weight/tone per voice); a judgment call in the same class the spec rules non-forced for label+muted pairs.',
    endsWhen:
      "UI-Density-Law.md §2.3's closed voice table gains an arm at the label step with medium weight and muted tone — the exact shape the CONTEXT band's neutral fallback spells by hand today.",
  },
  {
    id: "density-tier:section-context-host-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/app-shell/components/section-context-host.tsx",
    operation: "text-axis:weight",
    why: 'the CONTEXT-band neutral "Details" fallback (`size="label" weight="medium" tone="muted"`) is a band-identity default, not prose or a directory entry — no closed voice combines label-step + medium weight + muted tone in that exact shape (spec §2.3\'s table is a fixed weight/tone per voice); a judgment call in the same class the spec rules non-forced for label+muted pairs.',
    endsWhen:
      "UI-Density-Law.md §2.3's closed voice table gains an arm at the label step with medium weight and muted tone — the exact shape the CONTEXT band's neutral fallback spells by hand today.",
  },
  {
    id: "density-tier:shell-topbar-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/app-shell/components/shell-topbar.tsx",
    operation: "text-axis:size",
    why: 'promoted-is-reserved: `size="title" weight="semibold"` is the shell topbar\'s PAGE title, not "the one item in a shelf" `promoted` names — the spec\'s §2.3 promoted definition is scoped to a single promoted item among siblings, never a page/topbar chrome title.',
    endsWhen:
      "§2.3 gains a page/chrome TITLE voice, or the `promoted` definition stops being scoped to one item among siblings — until then a topbar title has no closed voice to take.",
  },
  {
    id: "density-tier:shell-topbar-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/app-shell/components/shell-topbar.tsx",
    operation: "text-axis:weight",
    why: 'promoted-is-reserved: `size="title" weight="semibold"` is the shell topbar\'s PAGE title, not "the one item in a shelf" `promoted` names — the spec\'s §2.3 promoted definition is scoped to a single promoted item among siblings, never a page/topbar chrome title.',
    endsWhen:
      "§2.3 gains a page/chrome TITLE voice, or the `promoted` definition stops being scoped to one item among siblings — until then a topbar title has no closed voice to take.",
  },
  {
    id: "density-tier:login-local-form-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/auth/components/login-local-form.tsx",
    operation: "text-axis:size",
    why: "RATIFIED raw axes (#582, the #573 precedent): the SEMANTIC destructive tone IS the message — no voice carries a semantic color (every voice is foreground/muted/prose-ink by construction). The file's own comment states the ruling.",
    endsWhen:
      "a closed voice carries a SEMANTIC colour (every voice today is foreground/muted/prose-ink by construction), which is what would let the destructive message keep its meaning without a raw tone.",
  },
  {
    id: "density-tier:login-local-form-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/auth/components/login-local-form.tsx",
    operation: "text-axis:tone",
    why: "RATIFIED raw axes (#582, the #573 precedent): the SEMANTIC destructive tone IS the message — no voice carries a semantic color (every voice is foreground/muted/prose-ink by construction). The file's own comment states the ruling.",
    endsWhen:
      "a closed voice carries a SEMANTIC colour (every voice today is foreground/muted/prose-ink by construction), which is what would let the destructive message keep its meaning without a raw tone.",
  },
  {
    id: "density-tier:login-surface-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/auth/surfaces/login-surface.tsx",
    operation: "text-axis:size",
    why: 'four `size="label" tone="muted"` sites (form-field captions) — a label+muted pair is a real tone decision the spec explicitly rules judgment-not-forced (§2.3), and login-surface is one of the named ×4 sites in the density burn-down\'s recorded judgment set.',
    endsWhen: "§2.3 gains a label-step + muted-tone voice, retiring the judgment-not-forced class these form-field captions belong to.",
  },
  {
    id: "density-tier:login-surface-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/auth/surfaces/login-surface.tsx",
    operation: "text-axis:tone",
    why: 'four `size="label" tone="muted"` sites (form-field captions) — a label+muted pair is a real tone decision the spec explicitly rules judgment-not-forced (§2.3), and login-surface is one of the named ×4 sites in the density burn-down\'s recorded judgment set.',
    endsWhen: "§2.3 gains a label-step + muted-tone voice, retiring the judgment-not-forced class these form-field captions belong to.",
  },
  {
    id: "density-tier:character-facet-editor-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/character/components/character-facet-editor.tsx",
    operation: "text-axis:size",
    why: "RATIFIED raw axes (#573): the SEMANTIC warning tone is the message here — a warning line that painted itself muted or foreground would stop being a warning; no voice carries a semantic color, and a per-tone voice family would multiply the closed axis by six. The file's own comment states the ruling.",
    endsWhen:
      "a closed voice carries a SEMANTIC colour, so the warning line can keep being a warning without a raw tone — a per-tone voice family would multiply the closed axis by six and is the reason this stayed raw.",
  },
  {
    id: "density-tier:character-facet-editor-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/character/components/character-facet-editor.tsx",
    operation: "text-axis:tone",
    why: "RATIFIED raw axes (#573): the SEMANTIC warning tone is the message here — a warning line that painted itself muted or foreground would stop being a warning; no voice carries a semantic color, and a per-tone voice family would multiply the closed axis by six. The file's own comment states the ruling.",
    endsWhen:
      "a closed voice carries a SEMANTIC colour, so the warning line can keep being a warning without a raw tone — a per-tone voice family would multiply the closed axis by six and is the reason this stayed raw.",
  },
  {
    id: "density-tier:character-facet-row-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/character/components/character-facet-row.tsx",
    operation: "text-axis:size",
    why: "RATIFIED raw axes (#573): a facet row is a DIRECTORY entry, and `promoted` — the only voice at a name-of-an-item step — is the title step reserved for the ONE item a surface promotes above its siblings; taking it here would set every row of a flat list at 16px semibold. The body step at medium is one step under it, deliberately. The file's own comment states the ruling and is the precedent every later directory/strip-name row cites.",
    endsWhen:
      "§2.3 gains a DIRECTORY-ENTRY voice one step under `promoted`, or `promoted` stops being reserved for the single item a surface promotes above its siblings.",
  },
  {
    id: "density-tier:character-facet-row-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/character/components/character-facet-row.tsx",
    operation: "text-axis:weight",
    why: "RATIFIED raw axes (#573): a facet row is a DIRECTORY entry, and `promoted` — the only voice at a name-of-an-item step — is the title step reserved for the ONE item a surface promotes above its siblings; taking it here would set every row of a flat list at 16px semibold. The body step at medium is one step under it, deliberately. The file's own comment states the ruling and is the precedent every later directory/strip-name row cites.",
    endsWhen:
      "§2.3 gains a DIRECTORY-ENTRY voice one step under `promoted`, or `promoted` stops being reserved for the single item a surface promotes above its siblings.",
  },
  {
    id: "density-tier:character-overview-card-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/character/components/character-overview-card.tsx",
    operation: "text-axis:size",
    why: "RATIFIED raw axes (#573): this is INLINE EMPHASIS inside another voice's (`gloss`) run, not a voice of its own — every voice re-spells size and color, so one here would break the sentence it sits in. It carries `gloss`'s own micro step plus the weight and foreground ink that make the name stand out. The file's own comment states the ruling.",
    endsWhen:
      "§2.3 gains an INLINE-EMPHASIS arm that inherits its run's size and colour instead of re-spelling them — today every voice re-spells both, which is why one here would break the `gloss` sentence it sits in.",
  },
  {
    id: "density-tier:character-overview-card-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/character/components/character-overview-card.tsx",
    operation: "text-axis:weight",
    why: "RATIFIED raw axes (#573): this is INLINE EMPHASIS inside another voice's (`gloss`) run, not a voice of its own — every voice re-spells size and color, so one here would break the sentence it sits in. It carries `gloss`'s own micro step plus the weight and foreground ink that make the name stand out. The file's own comment states the ruling.",
    endsWhen:
      "§2.3 gains an INLINE-EMPHASIS arm that inherits its run's size and colour instead of re-spelling them — today every voice re-spells both, which is why one here would break the `gloss` sentence it sits in.",
  },
  {
    id: "density-tier:join-invite-dialog-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/chat/anchors/join-invite-dialog.tsx",
    operation: "text-axis:size",
    why: 'the invite dialog\'s host/member/mode lines (one `weight="semibold"` name line + three `size="label" tone="muted"` field-label lines) are explicitly named in the density burn-down\'s recorded judgment-not-forced set — label+muted pairs are real tone decisions, not vocabulary gaps (spec §2.3).',
    endsWhen: "§2.3 gains a label-step + muted-tone voice, retiring the judgment-not-forced class the invite dialog's field-label lines belong to.",
  },
  {
    id: "density-tier:join-invite-dialog-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/chat/anchors/join-invite-dialog.tsx",
    operation: "text-axis:tone",
    why: 'the invite dialog\'s host/member/mode lines (one `weight="semibold"` name line + three `size="label" tone="muted"` field-label lines) are explicitly named in the density burn-down\'s recorded judgment-not-forced set — label+muted pairs are real tone decisions, not vocabulary gaps (spec §2.3).',
    endsWhen: "§2.3 gains a label-step + muted-tone voice, retiring the judgment-not-forced class the invite dialog's field-label lines belong to.",
  },
  {
    id: "density-tier:join-invite-dialog-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/chat/anchors/join-invite-dialog.tsx",
    operation: "text-axis:weight",
    why: 'the invite dialog\'s host/member/mode lines (one `weight="semibold"` name line + three `size="label" tone="muted"` field-label lines) are explicitly named in the density burn-down\'s recorded judgment-not-forced set — label+muted pairs are real tone decisions, not vocabulary gaps (spec §2.3).',
    endsWhen: "§2.3 gains a label-step + muted-tone voice, retiring the judgment-not-forced class the invite dialog's field-label lines belong to.",
  },
  {
    id: "density-tier:chat-header-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/chat/components/chat-header.tsx",
    operation: "text-axis:size",
    why: 'line89\'s `size="title" weight="semibold"` is the chat header\'s PAGE title — promoted-is-reserved (explicitly named alongside shell-topbar.tsx): `promoted` is for one item in a shelf, not a page/topbar title. THE ROSTER-CHIP ROW IS GONE (shrunk 5→2 by lane cb-bracket-fix, #875 F6, 2026-08-30): the seat count\'s `size="micro" tone="muted" transform="caps"` was ratified as "one axis short of kicker … a compact badge digit", but the chip is a BUTTON\'S VISIBLE LABEL and 10.5px interactive text is under the readable floor the context rail beside it refuses to break — design-audit flagged the band mount as `undersized-ui-text` in every arm. It now takes `voice="interactiveKicker"`, the voice minted for exactly this case (the micro-caps instrument register at the 13px label step), so the axes are no longer spelled by hand. Hand-shrunk, not regenerated — a whole-tree regen bakes in whatever else the tree carries.',
    endsWhen:
      "§2.3 gains a page/chrome TITLE voice, or the `promoted` definition stops being scoped to one item among siblings — the same end condition shell-topbar.tsx carries.",
  },
  {
    id: "density-tier:chat-header-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/chat/components/chat-header.tsx",
    operation: "text-axis:weight",
    why: 'line89\'s `size="title" weight="semibold"` is the chat header\'s PAGE title — promoted-is-reserved (explicitly named alongside shell-topbar.tsx): `promoted` is for one item in a shelf, not a page/topbar title. THE ROSTER-CHIP ROW IS GONE (shrunk 5→2 by lane cb-bracket-fix, #875 F6, 2026-08-30): the seat count\'s `size="micro" tone="muted" transform="caps"` was ratified as "one axis short of kicker … a compact badge digit", but the chip is a BUTTON\'S VISIBLE LABEL and 10.5px interactive text is under the readable floor the context rail beside it refuses to break — design-audit flagged the band mount as `undersized-ui-text` in every arm. It now takes `voice="interactiveKicker"`, the voice minted for exactly this case (the micro-caps instrument register at the 13px label step), so the axes are no longer spelled by hand. Hand-shrunk, not regenerated — a whole-tree regen bakes in whatever else the tree carries.',
    endsWhen:
      "§2.3 gains a page/chrome TITLE voice, or the `promoted` definition stops being scoped to one item among siblings — the same end condition shell-topbar.tsx carries.",
  },
  {
    id: "density-tier:home-temp-chat-tile-body-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/chat/components/home-temp-chat-tile-body.tsx",
    operation: "text-axis:size",
    why: 'line119\'s `size="label" tone="muted"` is one of the density burn-down\'s explicitly named label+muted judgment sites. line121\'s nested `size="code"` span is a mono readout that does not byte-match `datumMono`\'s step — `datumMono` would change the rendered color (the span currently resolves `text-foreground`), which is a visual change, not a vocabulary fix.',
    endsWhen:
      "§2.3 gains a label-step + muted-tone voice, and `datumMono` (or a successor) byte-matches the mono readout's rendered colour so adopting it is a vocabulary fix rather than a visual change.",
  },
  {
    id: "density-tier:home-temp-chat-tile-body-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/chat/components/home-temp-chat-tile-body.tsx",
    operation: "text-axis:tone",
    why: 'line119\'s `size="label" tone="muted"` is one of the density burn-down\'s explicitly named label+muted judgment sites. line121\'s nested `size="code"` span is a mono readout that does not byte-match `datumMono`\'s step — `datumMono` would change the rendered color (the span currently resolves `text-foreground`), which is a visual change, not a vocabulary fix.',
    endsWhen:
      "§2.3 gains a label-step + muted-tone voice, and `datumMono` (or a successor) byte-matches the mono readout's rendered colour so adopting it is a vocabulary fix rather than a visual change.",
  },
  {
    id: "density-tier:new-chat-picker-surface-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx",
    operation: "text-axis:size",
    why: '`size="label" tone="muted"` is one of the density burn-down\'s explicitly named label+muted judgment sites (new-chat-picker-surface) — a real tone decision, not a vocabulary gap.',
    endsWhen: "§2.3 gains a label-step + muted-tone voice, retiring the judgment-not-forced class this site belongs to.",
  },
  {
    id: "density-tier:new-chat-picker-surface-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx",
    operation: "text-axis:tone",
    why: '`size="label" tone="muted"` is one of the density burn-down\'s explicitly named label+muted judgment sites (new-chat-picker-surface) — a real tone decision, not a vocabulary gap.',
    endsWhen: "§2.3 gains a label-step + muted-tone voice, retiring the judgment-not-forced class this site belongs to.",
  },
  {
    id: "density-tier:notification-inbox-row-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/notifications/components/notification-inbox-row.tsx",
    operation: "text-axis:size",
    why: 'the notification row\'s `weight` is a CONDITIONAL expression (`item.readAt === null ? "medium" : undefined`) keyed on unread state — a closed voice cannot express a per-instance conditional weight, so this is call-site logic, not a taste choice a voice would replace.',
    endsWhen:
      "a closed voice can express a per-instance CONDITIONAL step, or the unread state stops being carried by weight — until then this is call-site logic a voice cannot hold.",
  },
  {
    id: "density-tier:notification-inbox-row-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/notifications/components/notification-inbox-row.tsx",
    operation: "text-axis:weight",
    why: 'the notification row\'s `weight` is a CONDITIONAL expression (`item.readAt === null ? "medium" : undefined`) keyed on unread state — a closed voice cannot express a per-instance conditional weight, so this is call-site logic, not a taste choice a voice would replace.',
    endsWhen:
      "a closed voice can express a per-instance CONDITIONAL step, or the unread state stops being carried by weight — until then this is call-site logic a voice cannot hold.",
  },
];
