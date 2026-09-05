// The chat-feature component-PRESENCE ratchet (#18). A landed chat component is a user-facing surface;
// this test fails if one silently loses its coverage decision — either a NEW component lands with no CT
// and no annotated waiver, or a covered component's CT (direct OR the CT it's covered THROUGH) disappears.
// It is a coverage-DECISION ledger, not a coverage-percentage metric: every component under
// `features/chat/components/` must resolve to exactly one of —
//   • a direct `<name>.ct.tsx` (in components/ or surfaces/), OR
//   • `coveredBy: "<other>.ct"` — a sub-part exercised through a parent's real CT (the CT must exist), OR
//   • `deferred: "<reason>"` — an acknowledged gap, named so it can never rot into silence.
// Both directions bite (memory: gates die silently on rename): a stale ledger entry (its component or its
// covering CT gone) fails just as loudly as an unlisted component. When you add a chat component, you add
// a CT or a ledger line here — that decision is the ratchet.

import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe } from "vitest";
import { expect, test } from "../support/tool-fixtures.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
// This ledger lives under tests/tooling (a non-mirror exempt tree — it guards the whole chat feature, not
// one source file), so paths are REPO_ROOT-relative, not sibling-relative.
const REPO_ROOT = join(HERE, "..", "..");
const CHAT_TESTS_DIR = join(REPO_ROOT, "tests/client/features/chat");
const COMPONENTS_DIR = join(REPO_ROOT, "packages/client/src/features/chat/components");
// The five homes a chat component's CT can live in, under the chat CT tree.
// Every home a chat CT can live in. `hooks` is included because a component whose whole behaviour is
// driven through a hook (the slash strip through `use-slash-commands`) is covered by that hook's CT — and a
// `coveredBy` naming a CT this list can't see would read as DANGLING, which is a false red.
const CT_DIRS = ["components", "surfaces", "anchors", "hooks", "lib"].map((d) => join(CHAT_TESTS_DIR, d));
const TSX_SUFFIX = /\.tsx$/u;
const CT_SUFFIX = /\.ct\.tsx$/u;

/** The coverage decision for a component that has NO direct `<name>.ct.tsx`. */
type Waiver =
  | { readonly coveredBy: string; readonly why: string } // exercised through another component's real CT (basename, no extension)
  | { readonly deferred: string }; // an acknowledged, named gap

// Every chat component WITHOUT its own `.ct.tsx`, with the reason. `coveredBy` names the CT (basename)
// that mounts the real parent and drives this sub-part through it; that CT must exist (verified below).
const WAIVERS: Readonly<Record<string, Waiver>> = {
  // Sub-parts driven through a parent's real CT.
  // (`message-wire-trigger` USED to sit here, covered by variant-wire-viewer.ct. WIREBTN deleted the
  //  component: the wire trace is a kebab item on `message-actions-row` now, whose `open` state must live
  //  outside the menu popup — so there is nothing left to split out, and nothing left to waive.)
  "message-row-divider": {
    coveredBy: "message-row",
    why: "the context-boundary divider is a size-cap split of message-row-parts (one renderer, one consumer); message-row.ct drives the divider's show/label/compact-summary arms on real rows.",
  },
  "chat-list-row": {
    coveredBy: "chat-list-surface",
    why: "the row is the list surface's split-out unit (projection L0); chat-list-surface.ct drives portrait/snippet/star/game-marker arms and the RowToggleAction star mutation on real rows.",
  },
  "home-hearth-room": {
    coveredBy: "home-recents-tile-body",
    why: "the focal hearth hero is composed inside the recents tile; home-recents-tile-body.ct (ChatRecentsTileStory mounts the REAL HomeSurface) drives the hero card end-to-end, incl. the sub-minute 'just now' stamp arm.",
  },
  "home-also-open-tile-body": {
    coveredBy: "home-recents-tile-body",
    why: "ChatRecentsTileStory mounts chatAlsoOpenTile alongside recents through the real HomeSurface; home-recents-tile-body.ct exercises the also-open list rows next to the hero.",
  },
  "chats-with-character-pane": {
    deferred:
      "REAL coverage lives OUTSIDE this checker's chat glob: tests/client/features/character/components/character-chats-projection-shell.ct.tsx mounts this pane through the characters section's CONTEXT Chats tab (#501 — it was the LIST pane's projection until the library stayed docked) and drives the rows, the departed-seat semantics, the avatar-stack upgrade, the accname collision and the empty state's primary. This checker only resolves chat-dir CTs, so citing it as coveredBy reads as dangling (see header); recorded here instead.",
  },
  "assembly-preview-diagnostics": {
    coveredBy: "assembly-preview-panel",
    why: "the Diagnostics drawer is the panel's split-out half (component-size cap); assembly-preview-panel.ct drives the drawer's BUILD + SHAPE traces and collapsed-by-default arm.",
  },
  "message-choices-block": {
    coveredBy: "message-content",
    why: "MessageContent renders the choices block; the message-content choices CTs drive render + click-send + the disabled arms.",
  },
  "card-block": {
    coveredBy: "message-content",
    why: "CardBlock is the shared card mount extracted from MessageContent; message-content.ct drives tierA/tierB, CSP media policy, srcdoc rendering, raw/expand/collapse, and truncated-card arms. ghost-message-row.ct separately drives the same mount during streaming.",
  },
  "member-row": { coveredBy: "members-panel", why: "MembersPanel renders MemberRow; the members-panel CT drives its rows end-to-end." },
  "member-row-menu": { coveredBy: "members-panel", why: "buildMenuItems is exercised via the real row menu in members-panel.ct." },
  "talkativeness-popover": { coveredBy: "members-panel", why: "the Talkativeness… popover (commit/re-seed/snap-back) is driven through members-panel.ct." },
  "message-row-parts": { coveredBy: "message-row", why: "the row parts render only inside MessageRow; message-row.ct mounts the real row." },
  "message-row-bubble": { coveredBy: "message-row", why: "the bubble is a message-row-parts sub-part, covered through message-row.ct." },
  "message-row-header": {
    coveredBy: "message-row",
    why: "the header (speaker name · timestamp · action cluster) is a #288 concept-split of message-row-parts — pure (args) => ReactNode helpers with no state, rendered only inside MessageRow; message-row.ct drives the real header slots (message-attribution / message-name-row / message-metadata-timestamp) and the name+actions structure on real rows.",
  },
  "composer-utility-menu": {
    coveredBy: "composer-guided-cluster",
    why: "the ✨ utility menu renders inside the cluster; composer-guided-cluster.ct drives its Simple-send item + the menu.",
  },
  "chat-list-filter-exits": {
    coveredBy: "chat-list-surface",
    why: "the exits row is a #541 size-cap extraction of chat-list-surface.tsx's own zero-result block (a component file may only export components, so the button row moved whole); it renders only inside that surface's empty state, and chat-list-surface.ct drives its every arm — the per-axis exit list under 2- and 3-axis narrowing, the live click-through (clear month re-derives the sentence, clear search restores rows), and the accname disambiguation from the inset glyphs.",
  },
  "composer-drop-target": {
    coveredBy: "composer",
    why: "the drop target IS the composer card (a #376 size-cap extraction of composer.tsx's own surface, rendering `data-slot=composer`), so it exists only as Composer's root and cannot be mounted standalone without re-creating the drag seam it wraps; composer.ct drives its every arm on the real card — the FILE-drag arm (data-drag-over + the affordance's copy and its span-the-surface geometry), the depth-counter disarm on dragleave, the TEXT-drag refusal, image/mp4 drops riding the send, and the mixed-batch refusal-by-name.",
  },
  "composer-send-control": {
    coveredBy: "composer",
    why: "the row-2 Send/Stop control renders only inside Composer; composer.ct drives it end-to-end — the #54 honest-refusal gate (aria-disabled + title, no chat.send fires), the disabled/empty send arms, and Stop/stopping/second-click.",
  },
  "rename-chat-dialog": { coveredBy: "chat-options-menu", why: "the rename dialog opens from the options menu; chat-options-menu.ct drives it." },
  "add-member-popover": {
    coveredBy: "members-panel",
    why: "#490 gave the add-member door ONE home: it anchors on the CONTEXT panel's CAST header (the character-bar twin is gone — two simultaneously-visible doors for one action), and members-panel.ct drives it.",
  },
  "chat-content": { coveredBy: "chat-room-surface", why: "ChatContent is the room-surface body; chat-room-surface.ct mounts it." },
  "tool-recurse-control": {
    coveredBy: "settings-context-tab",
    why: "the host-only Tool-use cap control renders inside CommittedSettingsTab; settings-context-tab.ct drives it end-to-end (host sees + edits → setToolRecurseLimit fires; member sees no section).",
  },
  "host-display-scripts-control": {
    coveredBy: "settings-context-tab",
    why: "the host-only 'share my display scripts' switch (D121-E) renders at the foot of the REGEX section's `On screen` group (#1742 moved it out of the retired `Host controls › Appearance` disclosure, which held nothing else); settings-context-tab.ct drives it end-to-end through that section (host sees + toggles → setHostDisplayScripts fires; member sees no control), the tool-recurse-control precedent.",
  },
  "regex-tier-group": {
    coveredBy: "regex-section",
    why: "one tier group of the room's Regex section (#1742) — a size-cap split of regex-section.tsx that renders only inside it; regex-section.ct drives the group's kicker count, its `off here` state, the empty-tier arm, the dedup subtraction and the chat tier's order/attach affordances on real rows.",
  },
  "regex-tier-row": {
    coveredBy: "regex-section",
    why: "one ROW of a tier group (same split): regex-section.ct drives the rank numeral, the `+N` chip, the `OFF` and `previous host` marks, the row switch's off-everywhere toast + Undo, and the kebab's two items through the real section.",
  },
  "regex-on-screen-group": {
    coveredBy: "regex-section",
    why: "the display-leg roster + the moved broadcast switch (#1742) renders only as the Regex section's last group; regex-section.ct drives the provenance words, the yours-only switch and the switched-off arm, and settings-context-tab.ct drives the broadcast switch through the tab.",
  },
  "add-chat-script-dialog": {
    coveredBy: "regex-section",
    why: "the `Attach a script` dialog opens from the Regex section's chat tier (the AddChatBookDialog grammar); regex-section.ct opens it from the real section and drives the filter, the already-attached mark and the multi-select commit.",
  },
  "offer-choices-control": {
    coveredBy: "settings-context-tab",
    why: "the host-only per-room 'Offer choices' switch (B1) renders inside CommittedSettingsTab's Host controls group; settings-context-tab.ct drives it end-to-end (host sees + toggles → setOfferChoices fires; the never-pinned room seats from the host's per-user default; member sees no control), the host-display-scripts-control precedent.",
  },
  "row-reaction-picker": {
    coveredBy: "reaction-picker",
    why: "the row's picker MOUNT (split out of message-actions-row under the component-size cap): reaction-picker.ct's B7 segment describe drives it through the REAL row (NarratorActionsDoorsStory/StandardLabeledDoorsStory mount MessageActionsRow → RowReactionPicker → the picker), pinning the narrator gate and the segment claim's wire round-trip; message-reactions.ct's doors arms open it too.",
  },
  "reaction-toggles": {
    coveredBy: "settings-context-tab",
    why: "the two host-only B7 reaction switches (the plane's master + the react-tool opt-in) render inside CommittedSettingsTab's Reactions section; settings-context-tab.ct drives both end-to-end (host sees + toggles → setReactionsEnabled/setCharactersCanReact fire; the never-pinned room seats from the host's per-user defaults through the ONE contracts resolvers; member sees neither), the offer-choices-control precedent.",
  },
  "chat-list-header": { coveredBy: "chat-list-surface", why: "the list header renders inside the list surface; chat-list-surface.ct covers it." },
  "chat-list-character-filter": {
    coveredBy: "chat-list-surface",
    why: "#490 split the faces strip + 'Filtered: X ✕' chip out of the list SURFACE under the 450-line cap; they render inside it and chat-list-surface.ct drives both (face tap scopes the list, the chip clears it).",
  },
  "chat-list-row-menu": { coveredBy: "chat-list-surface", why: "the per-row menu is driven through the real list rows in chat-list-surface.ct." },
  // #1718's three filter parts (undecided since c545899ab — verified against the base commit's own copy of
  // this ledger, so this is a repair of an existing gap rather than this change's own debt). All three
  // render ONLY inside chat-list-surface.tsx and are driven through its CT.
  "chat-list-filter-field": {
    coveredBy: "chat-list-surface",
    why: "the list's search field is a size-cap split of chat-list-surface.tsx and renders only inside it; chat-list-surface.ct drives typing, the narrowed rows and the clear-search exit.",
  },
  "chat-list-month-filter": {
    coveredBy: "chat-list-surface",
    why: "the month bound is the same split (it renders only inside the list surface); chat-list-surface.ct drives the month narrowing and the clear-month exit that re-derives the empty state's sentence.",
  },
  "chat-list-phone-filters": {
    coveredBy: "chat-list-surface",
    why: "the phone Filters row (#1718 — ONE trigger naming both bounds in force) renders only inside the list surface at the coarse arm; chat-list-surface.ct drives its trigger name and the sheet it opens.",
  },
  "appearance-chat-style-cards": {
    coveredBy: "appearance-message-style-section",
    why: "appearance-message-style-section.ct drives the real style-card grid's persisted selection, every mode's name/gloss/preview anatomy, and the pressed-state transition that patches chatStyle.",
  },
  "chat-context-band": {
    coveredBy: "chats-section",
    why: "chats-section.ct drives the real context band's whole room title, members/memory/preset chips, readable and coarse-pointer floors, and members-chip navigation in both directions.",
  },

  // chat-summary-row has a dedicated logic test (the row's derivation), not a CT — named here so the
  // ledger stays exhaustive.
  "chat-summary-row": { deferred: "covered by tests/client/features/chat/lib/chat-summary-row.test.ts (row-derivation logic; no interactive behavior)." },

  // Acknowledged CT gaps — real surfaces without a CT yet. Named so the gap is loud, never silent. When
  // one gains a CT, delete its line (the ratchet fails on a stale waiver).
  "room-overrides-tab": { deferred: "the context-panel Overrides tab wrapper — CT gap; the form itself is room-overrides-form.ct." },
  "chats-topbar-header": { deferred: "the chats-section topbar header — CT gap." },

  // Slash-command parts — driven through their real hosts, never mounted standalone.
  "composer-slash-strip": {
    coveredBy: "use-slash-commands",
    why: "the strip IS the hook's rendered output; use-slash-commands.ct drives offer→completion and the unknown-command refusal notice through the real composer.",
  },
  "slash-new-chat-mount": {
    coveredBy: "command-palette-surface",
    why: "an invisible runner mount, rendered by each command host; command-palette-surface.ct picks the contributed command and asserts its runner fired.",
  },
};

function componentBasenames(): readonly string[] {
  return readdirSync(COMPONENTS_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.replace(TSX_SUFFIX, ""));
}

function ctBasenames(): ReadonlySet<string> {
  const names = new Set<string>();
  for (const dir of CT_DIRS) {
    if (!existsSync(dir)) {
      continue;
    }
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".ct.tsx")) {
        names.add(f.replace(CT_SUFFIX, ""));
      }
    }
  }
  return names;
}

describe("chat component-presence ratchet", () => {
  const components = componentBasenames();
  const cts = ctBasenames();

  test("there are chat components AND CTs to guard (the ratchet isn't a no-op)", () => {
    expect(components.length).toBeGreaterThan(20);
    expect(cts.size).toBeGreaterThan(10);
  });

  test("every landed chat component resolves to a direct CT or an annotated waiver", () => {
    const undecided = components.filter((name) => !cts.has(name) && WAIVERS[name] === undefined);
    // A component here means: it landed with no CT and no ledger decision. Add a `<name>.ct.tsx` OR a
    // WAIVERS entry (coveredBy an existing CT, or deferred with a reason).
    expect(undecided, "chat components with NO coverage decision — add a CT or a WAIVERS entry").toEqual([]);
  });

  test("no stale waiver: every waived component still exists", () => {
    const known = new Set(components);
    const orphaned = Object.keys(WAIVERS).filter((name) => !known.has(name));
    // A waiver for a component that no longer exists — delete the line from WAIVERS.
    expect(orphaned, "WAIVERS entries whose component was removed — delete them").toEqual([]);
  });

  test("no redundant waiver: a component with its OWN CT must not also be waived", () => {
    const redundant = Object.keys(WAIVERS).filter((name) => cts.has(name));
    // The component gained a direct CT — remove its now-redundant WAIVERS line.
    expect(redundant, "WAIVERS entries for components that now have their own CT — delete them").toEqual([]);
  });

  test("every `coveredBy` names a CT that actually exists (the coverage-through is real)", () => {
    const dangling = Object.entries(WAIVERS)
      .filter(([, w]) => "coveredBy" in w)
      .filter(([, w]) => !cts.has((w as { readonly coveredBy: string }).coveredBy))
      .map(([name, w]) => `${name} → ${(w as { readonly coveredBy: string }).coveredBy}`);
    // A `coveredBy` pointing at a CT that no longer exists — the sub-part lost its coverage-through.
    expect(dangling, "coveredBy targets whose CT disappeared — the sub-part is now uncovered").toEqual([]);
  });
});
