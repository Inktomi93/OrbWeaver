// Composition-owned handles injected into the dev-only agent bridge. Kept separate from the install door
// so the exhaustive bridge inventory can remain readable without pushing agent-bridge.ts past the client cap.

import type { ChatId } from "@orb/kit/ids";
import type { CssMergeTraceSnapshot } from "@orb/ui/lib";
import type { OrbPluginLogReader } from "./agent-plugin-bridge.ts";

export interface QuerySummary {
  readonly key: unknown;
  readonly status: string;
  readonly fetch: string;
  readonly stale: boolean;
  readonly updatedAt: number;
}

export interface ShellSnapshot {
  readonly section: string | null;
  readonly panels: ReadonlyArray<{ side: string | null; mode: string | null }>;
  readonly chatOpen: boolean;
  readonly focus: boolean;
}

/** Loud outcome of a `__orb.nav.*` action — never a silent no-op. */
export type NavResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface OrbNavCapabilities {
  readonly sections: readonly string[];
  readonly modalSlots: readonly string[];
  readonly configGroups: readonly string[];
  readonly contextTabs: readonly string[];
  readonly contextTabNames: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly contextTabsPublished: boolean;
  readonly chatPositions: readonly string[];
}

export type SeedProfile = "d20" | "freeform";

export interface OrbSeedHandle {
  readonly game: (args: { profile: SeedProfile; title?: string }) => Promise<{ readonly chatId: ChatId }>;
  readonly richGame: (profile?: SeedProfile) => Promise<{ readonly chatId: ChatId }>;
}

interface OrbRpgSnapshot {
  readonly chatId: ChatId | null;
  readonly game: unknown;
  readonly tracker: unknown;
  readonly journal: readonly unknown[];
  readonly turnToolCalls: readonly unknown[];
}

export type OrbRpgReader = () => Promise<OrbRpgSnapshot>;

export interface OrbCssHandle {
  readonly read: () => CssMergeTraceSnapshot;
  readonly reset: () => void;
}

export interface OrbAgentHandles {
  readonly nav: OrbNavHandle;
  readonly seed: OrbSeedHandle;
  readonly rpg: OrbRpgReader;
  readonly pluginLog: OrbPluginLogReader;
  readonly css: OrbCssHandle;
  readonly durableLocalUserId: () => string | null;
}

/** Dev-only SPA-navigation bridge. The composition tier builds this handle from production state actions. */
export interface OrbNavHandle {
  readonly capabilities: () => OrbNavCapabilities;
  readonly section: (id: string) => NavResult;
  readonly openModal: (slot: string) => NavResult;
  readonly openConfig: (group: string, sub?: string) => NavResult;
  readonly contextTab: (name: string) => Promise<NavResult>;
  readonly openChat: (idOrTitleOrPosition: string) => Promise<NavResult>;
  readonly openCharacter: (idOrName: string) => Promise<NavResult>;
  readonly closeModal: () => NavResult;
  /** Write one side panel's mode ("list" | "context", "docked" | "collapsed") through the SAME regime-routed
   *  channel the topbar's own toggle writes, then verify the panel's RENDERED mode actually landed there
   *  before reporting `ok:true` — a store write that lands in a channel the current regime does not read is
   *  a silent no-op, and a section with no such pane can never resolve `docked` at all. */
  readonly panel: (name: string, mode: string) => Promise<NavResult>;
  /** Flip the shell's ONE focus flag — hides every panel when `true`, restores the section's own saved
   *  layout when `false`. Regime-free (see `shell-store.ts`'s `setFocusMode`), so this can never no-op. */
  readonly focus: (on: boolean) => NavResult;
}
