---
kind: work
status: open
updated: 2026-10-12
priority: P2
---

# Client and UI law holds: loading, data, skins and tokens

## What

Text-only QueryBoundary fallbacks instead of shape-matched skeletons; hand-rolled useQuery ladders with their own error rows (world-info book-attachments and others); painted cards through className on layout primitives instead of @orb/ui card or a tv() variant; status colours forced into className because the Text primitive declares tone before voice so a voice colour wins; hand-spelled title typography where voice=promoted exists; a raw negative z-index glow held in module constants the z-index gate cannot see; component skins in client globals.css and shell.css; an ESLint keystone exemption wider than the law's named exemptions; a validated login and signup form outside the form factory; a raw duration value in the collapsible primitive; a raw fetch in lib/agent-plugin-bridge.ts; per-surface staleTime retunes; and duplicated raw-hex console styles. Fix each, fixing the Text primitive first, and widen the gates that miss them.

## Why

Each is a written client or UI rule that the tree breaks without a gate noticing.

## Done when

Each source site is fixed; Text tone wins over voice colour; affected component and surface CTs pass. Gate extension acceptance cases are recorded for the owning lane.

## Evidence

Source standardization only, by owner direction. Gate extensions belong to the gate rebuild.

- Loading fallback: `packages/client/src/features/chat/components/assembly-preview-panel.tsx` had a text-only fallback.
- ClassName skin: `packages/client/src/features/rpg/components/rpg-status-tab.tsx` painted a Stack as a card.
- Z-index constant: `packages/client/src/features/chat/components/home-hearth-room.tsx` hid `before:-z-10` in GLOW.
- Duration: `packages/ui/src/primitives/collapsible/variants.ts` used `duration-[0.01ms]`.
- StaleTime: `packages/client/src/features/chat/hooks/use-send-availability.ts` tuned freshness in a surface hook.
- Keystone exemption: `eslint.config.js` remains with its owning lane.

The UI law explicitly permits the two-field login form. Signup uses the saved-form factory without persisting credentials.

Text status tones follow voice colours. The default tone preserves voice ink and the recipe's default axis stamp.
Affected CT coverage passed through retained passing runs and focused correction runs. The tone, reservation, attachment retry, connection lifecycle and modal header cases passed.
UI, client and browser test-program typechecks passed. Commit checks are bypassed by owner direction; whole-tree verification remains with the landing lane.
The owning lane runs side-eye after landing. Dialog RESTRICTIONS cleanup remains with the lane that owns `eslint.config.js`.
