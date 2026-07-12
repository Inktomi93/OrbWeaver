// SECTION_PLACEHOLDER_COPY — the ONE home for each rail section's honest "not built yet" placeholder
// copy (ux-flow-revamp J10 · ui-polish-punchlist §5). Lives BESIDE RAIL_SECTIONS (rail-slots.ts) in the
// app-shell FEATURE, keyed by `SectionId` as a `Record`, so a new section is a `tsc` error until it
// declares copy — the same one-home / derive-don't-respell discipline as SECTION_PANEL_DEFAULTS. The
// shell (app-shell.tsx) renders the active section's entry through a Weave-decorated <SectionPlaceholder>
// when no real CONTENT/LIST surface is route-composed for it, so three unbuilt hubs stop reading as one
// identical sparkle (the "snap agent sees no differences" root cause — punchlist §0).
//
// DISTINCTNESS IS LAW (gate `placeholder-copy-registry`, design-enforcement §3.2 + UI-Arch §4.3 voice
// table): every `SectionId` MUST carry a DISTINCT `(title, description)` pair. The gate reads this literal
// and fails on any duplicate; the companion vitest test pins full `SectionId` coverage + runtime
// distinctness (the rail-slots.test.ts freshness precedent). `chats`/`characters` carry copy too — they
// are ALWAYS route-composed with real content (home-page.tsx) so their entries never actually paint, but
// the `Record<SectionId, …>` forces them to exist (a 6th section can't skip its copy), and they stay
// distinct so the gate needs no per-key exemption.

import type { SectionId } from "#state";

/** One section's placeholder copy — title + a single sentence naming WHAT WILL LIVE HERE (punchlist §5). */
export interface SectionPlaceholderCopy {
  readonly title: string;
  readonly description: string;
}

export const SECTION_PLACEHOLDER_COPY: Record<SectionId, SectionPlaceholderCopy> = {
  // Never painted (always route-composed with real content) — present for Record completeness + distinctness.
  chats: {
    title: "Chats",
    description: "Your conversations live here — pick a thread on the left, or start a new one.",
  },
  characters: {
    title: "Characters",
    description: "Your cast lives here — browse the list, then open someone to see their card.",
  },
  // Presets is route-composed with real content (home-page.tsx: the library + tabbed editor) — this entry
  // exists for Record completeness + distinctness, and never actually paints.
  presets: {
    title: "Presets",
    description:
      "Your generation presets live here — pick one to tune sampling, reasoning, and prompts.",
  },
  // The three genuinely-unbuilt hubs (their real surfaces are later lanes) — each distinct + branded.
  corpus: {
    title: "Corpus",
    description: "Search across every thread, character, and scene — the web, searchable.",
  },
  refinery: {
    title: "Refinery",
    description: "Score → rewrite → analyze a character card without drifting from your original.",
  },
  analytics: {
    title: "Analytics",
    description: "Charts over your corpus land here — cast time, thread connections, drift.",
  },
};
