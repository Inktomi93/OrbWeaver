---
kind: design
status: active
updated: 2026-08-30
---

# Context bracket — one panel chrome for chats, game rooms and characters

**Owner-ruled 2026-08-30 (#860, "I'm good with the mockup").** The live canvas (clickable, both pages) is the
Claude Design artifact `https://claude.ai/code/artifact/8f56d796-d30f-4917-8058-c133acebe457`; these files are
its source of truth in the repo — `build.mjs` assembles the seven `*.dc.html` artboards, `canvas.json` lays
them out, the `*.png` are the default-state renders at true size (384×800 docked · 430×860 phone · the
1440 system sheet). Re-seed the canvas from these, never edit the artifact by hand.

## The ruling

The RPG room's head-and-foot split (decision 6, the OSRS bracket — `Context-Panel-Program.md` §4) is the
INTENDED shape of the context panel; normal rooms and the Characters section never adopted it (side-eye
#845 measured the fork: the same meta tabs at y=56 as a head `tablist` in a normal room, at y=754 as a foot
`toolbar` in a game room). Every section's context pane becomes ONE column:

| Slot | Contents | Rule |
| - | - | - |
| **Head — the artifact band** | Room: title (2 lines allowed) + chips (members · memory · preset). Game: the **Waystone** + the when-line + cues + the pool orbs (arcs for ceilinged pools, a disc for gold). Character: portrait · name · handle line · chips (Own look · chats · tokens). | One slot, three contents — never a second head. The band owns the name's budget: chips go BELOW the name, never beside it. |
| **Top rail — lenses (optional)** | The game-state tabs (Status · Inventory · Scene · Quests · Journal · Map). | APPLICABILITY, not hiding (§4.1): present only when a lens applies. A normal room has none today; a future lens (Trackers, Scene-lite) slots in here. |
| **Viewport** | The selected view. | Scrolls internally; short bodies take their natural height (the dead-zone rule). |
| **Ground** | The residual span. | Zero on a tall body, so the foot never jumps. |
| **Foot rail — the meta tabs, pinned** | Chat: Members · This chat · Preview · Activity (+ Game, host). Character: Overview · Links · Look · History · Trust. | The **kicker sits ON TOP of its rail** (its rule is the rail's top edge) — the live "CHAT" line dangling under the cells is defect #861. Icon + caption always (#208); `aria-current` + arrows, one tab stop (#112). The rail that owns the selection is raised and names it; the other recedes. |

Rulings that survive with a changed INPUT (record in the ledger with the build):

- `Context-Panel-Program.md` §4.1 "the takeover is APPLICABILITY, not a mode toggle" — survives: what
  applicability gates is the GAME top rail and its tabs, not the bracket. The bracket is the panel's chrome in
  EVERY room.
- HUD-1 §5.1 "ONE STRIP, ALWAYS" (`context-tabs-panel.tsx` header) — survives as *one META strip, always, at
  the FOOT*. The generic panel's head strip ("Detail") retires; `ContextRegionHost`'s column is the one
  composition.
- Owner decision 6 (2026-08-01) "the admin rail is pinned to the pane's foot" — becomes universal.
- #845 closed as-designed = this program's provenance. #846 is resolved by relocation (the room's name lives
  in the head band; the held topbar-side fix `f092a119f` is superseded — keep its measured furniture table and
  its bell-seated CT premise). #850's GAME STATE selected state and #861 fold in.

## What the mock decided that the build must honour

- The RPG **stat-profile editor and HOST CONSOLE leave Status** for the Game tab (the host's one admin home,
  §4.3): Status is a read (roster · pools · conditions · whose turn). This is what makes the phone arm fit.
- The locked **Map** cell carries a padlock and OPENS onto its reason (RV-7) — never a dead click.
- Characters: the Options junk drawer splits into **Look** (theme + background; swatch + `Custom`/`Inherit`,
  no raw oklch) · **History** (snapshots, `Snapshot now`) · **Trust**; the "Field" tab is renamed
  **Overview** (Origin · Activity · Tags).
- Phone: the same column at 430; cells 52px; the band is the sheet's title.
- Light theme: tokens only (the `dark` tweak on every artboard flips the same palette `theme.css` ships).

## Coupled sites for the build lane

`packages/client/src/features/app-shell/components/context-tabs-panel.tsx` (retire the head strip) ·
`features/rpg/components/rpg-hud.tsx` + `rpg-hud-rail.tsx` (kicker on top; the generic band slot) ·
`features/rpg/components/rpg-takeover-header.tsx` (the Waystone band = the shared head slot) ·
`features/chat/lib/chats-section.tsx` + `features/rpg/lib/rpg-context-section.tsx` (rosters unchanged) ·
the Characters section's context definition (head content + the five-tab roster) · the CONTENT header row
(the title leaves it) · CT pins: `rpg-context-section.ct.tsx` (#112 arrows, `aria-current`, the ≤347px
chrome pin), `app-shell.ct.tsx` (#846, bell-seated), the #208 icon+label pins · `shell.css` `.ctx-tab-strip`.
Unchanged: D62 pane mechanics, CP-1's roster, `contextTab` as the one selection seam, the Waystone itself.
