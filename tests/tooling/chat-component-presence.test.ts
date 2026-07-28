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
import { expect, test } from "../support/fixtures";

const HERE = dirname(fileURLToPath(import.meta.url));
// This ledger lives under tests/tooling (a non-mirror exempt tree — it guards the whole chat feature, not
// one source file), so paths are REPO_ROOT-relative, not sibling-relative.
const REPO_ROOT = join(HERE, "..", "..");
const CHAT_TESTS_DIR = join(REPO_ROOT, "tests/client/features/chat");
const COMPONENTS_DIR = join(REPO_ROOT, "packages/client/src/features/chat/components");
// The three homes a chat component's CT can live in (components / surfaces / anchors), under the chat CT tree.
// Every home a chat CT can live in. `hooks` is included because a component whose whole behaviour is
// driven through a hook (the slash strip through `use-slash-commands`) is covered by that hook's CT — and a
// `coveredBy` naming a CT this list can't see would read as DANGLING, which is a false red.
const CT_DIRS = ["components", "surfaces", "anchors", "hooks"].map((d) => join(CHAT_TESTS_DIR, d));
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
  "message-choices-block": {
    coveredBy: "message-content",
    why: "MessageContent renders the choices block; the message-content choices CTs drive render + click-send + the disabled arms.",
  },
  "member-row": { coveredBy: "members-panel", why: "MembersPanel renders MemberRow; the members-panel CT drives its rows end-to-end." },
  "member-row-menu": { coveredBy: "members-panel", why: "buildMenuItems is exercised via the real row menu in members-panel.ct." },
  "talkativeness-popover": { coveredBy: "members-panel", why: "the Talkativeness… popover (commit/re-seed/snap-back) is driven through members-panel.ct." },
  "message-row-parts": { coveredBy: "message-row", why: "the row parts render only inside MessageRow; message-row.ct mounts the real row." },
  "message-row-bubble": { coveredBy: "message-row", why: "the bubble is a message-row-parts sub-part, covered through message-row.ct." },
  "greeting-actions-row": { coveredBy: "message-row", why: "the draft greeting actions render inside a MessageRow greeting slot (message-row.ct)." },
  "composer-utility-menu": {
    coveredBy: "composer-guided-cluster",
    why: "the ✨ utility menu renders inside the cluster; composer-guided-cluster.ct drives its Simple-send item + the menu.",
  },
  "rename-chat-dialog": { coveredBy: "chat-options-menu", why: "the rename dialog opens from the options menu; chat-options-menu.ct drives it." },
  "add-member-popover": { coveredBy: "chat-cast-bar", why: "the add-member popover anchors on the cast bar; chat-cast-bar.ct drives it." },
  "chat-content": { coveredBy: "chat-room-surface", why: "ChatContent is the room-surface body; chat-room-surface.ct mounts it." },
  "tool-recurse-control": {
    coveredBy: "settings-context-tab",
    why: "the host-only Tool-use cap control renders inside CommittedSettingsTab; settings-context-tab.ct drives it end-to-end (host sees + edits → setToolRecurseLimit fires; member sees no section).",
  },
  "chat-list-header": { coveredBy: "chat-list-surface", why: "the list header renders inside the list surface; chat-list-surface.ct covers it." },
  "chat-list-row-menu": { coveredBy: "chat-list-surface", why: "the per-row menu is driven through the real list rows in chat-list-surface.ct." },

  // chat-summary-row has a dedicated logic test (the row's derivation), not a CT — named here so the
  // ledger stays exhaustive.
  "chat-summary-row": { deferred: "covered by tests/client/features/chat/lib/chat-summary-row.test.ts (row-derivation logic; no interactive behavior)." },

  // Acknowledged CT gaps — real surfaces without a CT yet. Named so the gap is loud, never silent. When
  // one gains a CT, delete its line (the ratchet fails on a stale waiver).
  "room-overrides-tab": { deferred: "the context-panel Overrides tab wrapper — CT gap; the form itself is room-overrides-form.ct." },
  "committed-members-tab": { deferred: "the context-panel Members tab wrapper — CT gap; the panel itself is members-panel.ct." },
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
