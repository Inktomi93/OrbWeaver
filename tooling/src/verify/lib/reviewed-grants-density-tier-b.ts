// Reviewed grants: density-tier.
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_DENSITY_TIER_B: readonly ReviewedGateGrant[] = [
  {
    id: "density-tier:persona-account-foot-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/persona/components/persona-account-foot.tsx",
    operation: "text-axis:size",
    why: 'the retired account-surface\'s two ratified rows, moved WITH the anatomy (#866 S4 — the modal\'s facts became the switcher\'s foot): the `weight="semibold"` mono account handle does not byte-match `datumMono` (regular weight) — adopting it would change the rendered weight, not just the vocabulary; the `size="label" tone="muted"` mode note is a label+muted pair with no exact voice, explicitly in the density-pass judgment-call set (spec §2.3, tranche reports #567/#581/#582).',
    endsWhen:
      "`datumMono` (or a successor) byte-matches the account handle's rendered WEIGHT, and §2.3 gains a label-step + muted-tone voice for the mode note — both halves of this row have to end for the row to end.",
  },
  {
    id: "density-tier:persona-account-foot-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/persona/components/persona-account-foot.tsx",
    operation: "text-axis:tone",
    why: 'the retired account-surface\'s two ratified rows, moved WITH the anatomy (#866 S4 — the modal\'s facts became the switcher\'s foot): the `weight="semibold"` mono account handle does not byte-match `datumMono` (regular weight) — adopting it would change the rendered weight, not just the vocabulary; the `size="label" tone="muted"` mode note is a label+muted pair with no exact voice, explicitly in the density-pass judgment-call set (spec §2.3, tranche reports #567/#581/#582).',
    endsWhen:
      "`datumMono` (or a successor) byte-matches the account handle's rendered WEIGHT, and §2.3 gains a label-step + muted-tone voice for the mode note — both halves of this row have to end for the row to end.",
  },
  {
    id: "density-tier:persona-account-foot-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/persona/components/persona-account-foot.tsx",
    operation: "text-axis:weight",
    why: 'the retired account-surface\'s two ratified rows, moved WITH the anatomy (#866 S4 — the modal\'s facts became the switcher\'s foot): the `weight="semibold"` mono account handle does not byte-match `datumMono` (regular weight) — adopting it would change the rendered weight, not just the vocabulary; the `size="label" tone="muted"` mode note is a label+muted pair with no exact voice, explicitly in the density-pass judgment-call set (spec §2.3, tranche reports #567/#581/#582).',
    endsWhen:
      "`datumMono` (or a successor) byte-matches the account handle's rendered WEIGHT, and §2.3 gains a label-step + muted-tone voice for the mode note — both halves of this row have to end for the row to end.",
  },
  {
    id: "density-tier:persona-editor-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/persona/components/persona-editor.tsx",
    operation: "text-axis:size",
    why: "RATIFIED raw axes (#582, the #573 precedent): the SEMANTIC warning tone is the message — no voice carries a semantic color. The file's own comment states the ruling.",
    endsWhen: "a closed voice carries a SEMANTIC colour, so the warning line can keep being a warning without a raw tone.",
  },
  {
    id: "density-tier:persona-editor-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/persona/components/persona-editor.tsx",
    operation: "text-axis:tone",
    why: "RATIFIED raw axes (#582, the #573 precedent): the SEMANTIC warning tone is the message — no voice carries a semantic color. The file's own comment states the ruling.",
    endsWhen: "a closed voice carries a SEMANTIC colour, so the warning line can keep being a warning without a raw tone.",
  },
  {
    id: "density-tier:persona-row-name-column-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/persona/components/persona-row-name-column.tsx",
    operation: "text-axis:weight",
    why: "RATIFIED raw axes (#582, the character-facet-row precedent): a row's own NAME is a directory entry, one step under `promoted` (reserved for the single item a surface promotes above its siblings) — body step at medium, deliberately. The file's own comment states the ruling.",
    endsWhen: "§2.3 gains a DIRECTORY-ENTRY voice one step under `promoted` — the character-facet-row precedent's end condition, which this row cites.",
  },
  {
    id: "density-tier:persona-switch-list-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/persona/components/persona-switch-list.tsx",
    operation: "text-axis:weight",
    why: "RATIFIED raw axes (#582, the character-facet-row precedent): a switch row's own NAME is a directory entry, one step under `promoted` — body step at medium, deliberately (the persona-row-name-column ruling, same list one mount over).",
    endsWhen: "§2.3 gains a DIRECTORY-ENTRY voice one step under `promoted` — the persona-row-name-column ruling's end condition, one mount over.",
  },
  {
    id: "density-tier:persona-this-chat-section-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/persona/components/persona-this-chat-section.tsx",
    operation: "text-axis:size",
    why: 'the "Playing as" section label and the anchor persona\'s `size="label" tone="muted"` line are explicitly named in the density burn-down\'s recorded judgment-not-forced set (persona-this-chat-section) — label(+muted) pairs are real tone decisions, not vocabulary gaps.',
    endsWhen: "§2.3 gains a label-step + muted-tone voice, retiring the judgment-not-forced class these lines belong to.",
  },
  {
    id: "density-tier:persona-this-chat-section-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/persona/components/persona-this-chat-section.tsx",
    operation: "text-axis:tone",
    why: 'the "Playing as" section label and the anchor persona\'s `size="label" tone="muted"` line are explicitly named in the density burn-down\'s recorded judgment-not-forced set (persona-this-chat-section) — label(+muted) pairs are real tone decisions, not vocabulary gaps.',
    endsWhen: "§2.3 gains a label-step + muted-tone voice, retiring the judgment-not-forced class these lines belong to.",
  },
  {
    id: "density-tier:persona-panel-surface-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/persona/surfaces/persona-panel-surface.tsx",
    operation: "text-axis:weight",
    why: "the who-head's identity line (`weight=\"semibold\"`) is the switcher's ONE promoted datum — the persona you are playing as — semibold at body step, the account-handle judgment class (#866 S4; spec §2.3's promoted definition reserves the `promoted` voice for a shelf item among siblings, which a head strip is not).",
    endsWhen: "§2.3's `promoted` definition widens past a shelf item among siblings, or the who-head stops promoting exactly one identity datum.",
  },
  {
    id: "density-tier:macro-browser-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/preset/components/macro-browser.tsx",
    operation: "text-axis:size",
    why: 'the macro-syntax-error `tone="warning"` line is the semantic-color-tones precedent named by #573\'s ratify comments (macro-browser is one of the two named sites): the SEMANTIC tone is the message — no voice carries a semantic color.',
    endsWhen: "a closed voice carries a SEMANTIC colour — the macro-syntax-error line is one of #573's two named semantic-tone sites and ends with that class.",
  },
  {
    id: "density-tier:macro-browser-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/preset/components/macro-browser.tsx",
    operation: "text-axis:tone",
    why: 'the macro-syntax-error `tone="warning"` line is the semantic-color-tones precedent named by #573\'s ratify comments (macro-browser is one of the two named sites): the SEMANTIC tone is the message — no voice carries a semantic color.',
    endsWhen: "a closed voice carries a SEMANTIC colour — the macro-syntax-error line is one of #573's two named semantic-tone sites and ends with that class.",
  },
  {
    id: "density-tier:assembly-preview-size",
    policyId: "density-tier",
    subject: "packages/client/src/features/preset/components/prompt-assembly/assembly-preview.tsx",
    operation: "text-axis:size",
    why: 'line79\'s `tone="warning"` is the semantic-color-tones precedent named by #573\'s ratify comments (assembly-preview is the second named site): a semantic tone is the message, not a taste choice. line88\'s `size="body" weight="semibold" transform="caps"` section-header row has no exact voice match — no closed voice combines the body step with caps + semibold (the closest, `kicker`, is a micro-step voice, not body).',
    endsWhen:
      'a closed voice carries a SEMANTIC colour (the `tone="warning"` half), and §2.3 gains a body-step caps+semibold arm (the section-header half) — `kicker` is a micro-step voice, not body.',
  },
  {
    id: "density-tier:assembly-preview-tone",
    policyId: "density-tier",
    subject: "packages/client/src/features/preset/components/prompt-assembly/assembly-preview.tsx",
    operation: "text-axis:tone",
    why: 'line79\'s `tone="warning"` is the semantic-color-tones precedent named by #573\'s ratify comments (assembly-preview is the second named site): a semantic tone is the message, not a taste choice. line88\'s `size="body" weight="semibold" transform="caps"` section-header row has no exact voice match — no closed voice combines the body step with caps + semibold (the closest, `kicker`, is a micro-step voice, not body).',
    endsWhen:
      'a closed voice carries a SEMANTIC colour (the `tone="warning"` half), and §2.3 gains a body-step caps+semibold arm (the section-header half) — `kicker` is a micro-step voice, not body.',
  },
  {
    id: "density-tier:assembly-preview-transform",
    policyId: "density-tier",
    subject: "packages/client/src/features/preset/components/prompt-assembly/assembly-preview.tsx",
    operation: "text-axis:transform",
    why: 'line79\'s `tone="warning"` is the semantic-color-tones precedent named by #573\'s ratify comments (assembly-preview is the second named site): a semantic tone is the message, not a taste choice. line88\'s `size="body" weight="semibold" transform="caps"` section-header row has no exact voice match — no closed voice combines the body step with caps + semibold (the closest, `kicker`, is a micro-step voice, not body).',
    endsWhen:
      'a closed voice carries a SEMANTIC colour (the `tone="warning"` half), and §2.3 gains a body-step caps+semibold arm (the section-header half) — `kicker` is a micro-step voice, not body.',
  },
  {
    id: "density-tier:assembly-preview-weight",
    policyId: "density-tier",
    subject: "packages/client/src/features/preset/components/prompt-assembly/assembly-preview.tsx",
    operation: "text-axis:weight",
    why: 'line79\'s `tone="warning"` is the semantic-color-tones precedent named by #573\'s ratify comments (assembly-preview is the second named site): a semantic tone is the message, not a taste choice. line88\'s `size="body" weight="semibold" transform="caps"` section-header row has no exact voice match — no closed voice combines the body step with caps + semibold (the closest, `kicker`, is a micro-step voice, not body).',
    endsWhen:
      'a closed voice carries a SEMANTIC colour (the `tone="warning"` half), and §2.3 gains a body-step caps+semibold arm (the section-header half) — `kicker` is a micro-step voice, not body.',
  },
  {
    id: "density-tier:card-variants-elevated-radius",
    policyId: "density-tier",
    subject: "packages/ui/src/primitives/card/variants.ts",
    operation: "elevated-radius",
    why: "the Card primitive IS the elevated/floating step's implementation (D6, UI-Density-Law.md §2.1) — it must spell `rounded-card` once so no feature does. Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939).",
    endsWhen:
      "the Card primitive stops drawing the elevated radius, or the site moves: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:command-variants-elevated-radius",
    policyId: "density-tier",
    subject: "packages/ui/src/primitives/command/variants.ts",
    operation: "elevated-radius",
    why: "the command palette is a floating island over the whole surface, one of §2.1's elevated family. Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939).",
    endsWhen:
      "the command primitive stops drawing the elevated radius, or the site moves: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:macro-textarea-variants-elevated-radius",
    policyId: "density-tier",
    subject: "packages/ui/src/primitives/macro-textarea/variants.ts",
    operation: "elevated-radius",
    why: "the macro textarea's suggestion popup floats over the composer — an elevated surface by §2.1. Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939).",
    endsWhen:
      "the suggestion popup stops drawing the elevated radius, or the site moves: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:menu-variants-elevated-radius",
    policyId: "density-tier",
    subject: "packages/ui/src/primitives/menu/variants.ts",
    operation: "elevated-radius",
    why: "a menu is a floating island, named in D6's elevated family. Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939).",
    endsWhen:
      "the menu primitive stops drawing the elevated radius, or the site moves: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:popover-variants-elevated-radius",
    policyId: "density-tier",
    subject: "packages/ui/src/primitives/popover/variants.ts",
    operation: "elevated-radius",
    why: "a popover is the canonical floating island D6 demotes `rounded-card` TO. Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939).",
    endsWhen:
      "the popover primitive stops drawing the elevated radius, or the site moves: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:selection-bar-variants-elevated-radius",
    policyId: "density-tier",
    subject: "packages/ui/src/primitives/selection-bar/variants.ts",
    operation: "elevated-radius",
    why: "the selection bar floats over the list it acts on — an elevated surface by §2.1. Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939).",
    endsWhen: "the selection bar stops floating, or the site moves: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:toast-variants-elevated-radius",
    policyId: "density-tier",
    subject: "packages/ui/src/primitives/toast/variants.ts",
    operation: "elevated-radius",
    why: "a toast is a floating island, named in D6's elevated family. Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939).",
    endsWhen:
      "the toast primitive stops drawing the elevated radius, or the site moves: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:immersive-card-elevated-radius",
    policyId: "density-tier",
    subject: "packages/ui/src/content/immersive-card/immersive-card.tsx",
    operation: "elevated-radius",
    why: "the immersive card is the `elevated` opt-in itself (§2.1) — the surface D6's elevated step exists for. Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939), whose row was the `content/immersive-card/` DIRECTORY; this grant names the exact file, which the prefix row did not.",
    endsWhen:
      "the immersive card stops drawing the elevated radius, or the site moves: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:immersive-card-variants-elevated-radius",
    policyId: "density-tier",
    subject: "packages/ui/src/content/immersive-card/variants.ts",
    operation: "elevated-radius",
    why: "the immersive card is the `elevated` opt-in itself (§2.1) — the surface D6's elevated step exists for. Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939), whose row was the `content/immersive-card/` DIRECTORY; this grant names the exact file, which the prefix row did not.",
    endsWhen:
      "the immersive card's variant map stops drawing the elevated radius, or the site moves: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:composer-drop-target-elevated-radius",
    policyId: "density-tier",
    subject: "packages/client/src/features/chat/components/composer-drop-target.tsx",
    operation: "elevated-radius",
    why: "THE composer card — D6 names the composer in the elevated family. The `rounded-card` site moved here from composer.tsx (#376) when the card and its media drop affordance were extracted; the gate's own stale arm caught the old row the same run, so this is a MOVE, never a widened exemption. Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939).",
    endsWhen:
      "the composer card stops being an elevated surface, or the site moves again: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:message-bubble-class-elevated-radius",
    policyId: "density-tier",
    subject: "packages/client/src/lib/message-bubble-class.ts",
    operation: "elevated-radius",
    why: "THE chat bubble's box, single-homed here so the theme editor's preview paints the same one (a runtime cross-feature import is dep-cruiser RED, so lib/ is the shared home). The row skins consume it. Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939).",
    endsWhen:
      "the chat bubble stops being an elevated surface, or the class leaves this module: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:command-palette-surface-elevated-radius",
    policyId: "density-tier",
    subject: "packages/client/src/features/chat/surfaces/command-palette-surface.tsx",
    operation: "elevated-radius",
    why: "the chat command palette surface is a floating island over the room (§2.1's elevated family). Migrated from the retired gate-local ELEVATED_ALLOW path table (#1939).",
    endsWhen:
      "the palette stops floating, or the site moves into the command primitive: the grant is then consumed zero times and central reconciliation stales it.",
  },
  {
    id: "density-tier:surface-tier-writer",
    policyId: "density-tier",
    subject: "packages/ui/src/layout/surface.tsx",
    operation: "surface-tier-write",
    why: "the Surface primitive is the ONE writer of `data-surface-tier` — `tiers.css` resolves every density step from that attribute, and a second writer is a second density map. Born sealed: this is the only row, and a second one is a review event rather than an edit. Migrated from the retired gate-local TIER_WRITER path constant (#1939).",
    endsWhen:
      "the tier attribute stops being written at all, or the Surface primitive moves: the grant is then consumed zero times and central reconciliation stales it.",
  },
];
