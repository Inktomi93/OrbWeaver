// domain/buddy/observer/canned — the mood-keyed fallback quips (vLLM breaker open / summarize threw /
// empty output). ONE line per `Mood`, exhaustive (`Record<Mood, …>` — a new mood fails `tsc`), so the
// reactor ALWAYS has a quip to speak even with the engine down (mirrors `substrate/soul.ts`'s canned soul).
// Pure — a lookup, no I/O. The reactor stamps `fromCanned:true` on a row this produced.

import type { Mood } from "@orb/contracts/buddy";

const CANNED_QUIP: Record<Mood, string> = {
  content: "*settles in contentedly*",
  working: "*rolls up its little sleeves*",
  queasy: "*looks a bit green around the gills*",
  excited: "*bounces on the spot*",
  sleepy: "*yawns and blinks slowly*",
  proud: "*puffs up its chest*",
  anxious: "*fidgets nervously*",
  playful: "*does a little wiggle*",
  curious: "*tilts its head, intrigued*",
  grumpy: "*grumbles under its breath*",
};

/** The fallback quip for a mood — always defined (exhaustive over `Mood`). */
export function cannedQuip(mood: Mood): string {
  return CANNED_QUIP[mood];
}
