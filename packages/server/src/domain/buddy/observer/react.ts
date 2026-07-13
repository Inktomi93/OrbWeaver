// domain/buddy/observer/react — one normalized BuddySignal in → at most one quip + mood shift + stat/bond
// growth out. CAS write is optimistic (bounded retry on lost race); react() never throws into the bus.

import type { CompanionStats, Mood, StatName } from "@orb/contracts/buddy";
import { STAT_MAX } from "@orb/contracts/buddy";
import { getLog } from "#foundation/observability";
import type { BuddyObserverEnv } from "../contract/observer-env";
import type { BuddySignal, BuddySignalKind } from "../contract/signals";
import { casReact, insertQuip, loadBuddy, sweepQuips } from "../persistence/queries";
import { formOf, moodForSignal, resolveMood, stageOf, statForSignal } from "../substrate/mood";
import { cannedQuip } from "./canned";

type ReactorDeps = Pick<BuddyObserverEnv, "db" | "now" | "newQuipId" | "summarize" | "emit">;

const COOLDOWN_MS = 90_000;
const BYPASS_COOLDOWN: ReadonlySet<BuddySignalKind> = new Set<BuddySignalKind>([
  "workload:failed",
  "trace:error-spike",
]);
const MAX_CAS_ATTEMPTS = 3;
const QUIP_KEEP = 20;
const STAT_NUDGE = 2;
const BOND_PER_REACTION = 1;
const QUIP_MAX_TOKENS = 60;
const QUIP_TEMPERATURE = 0.9;
const QUIP_MAX_LEN = 160;

function nudgeStats(stats: CompanionStats, stat: StatName | null): CompanionStats {
  if (stat === null) {
    return stats;
  }
  return { ...stats, [stat]: Math.min(STAT_MAX, stats[stat] + STAT_NUDGE) };
}

const QUIP_SYSTEM_LEAD =
  "You are a tiny ASCII companion living on the corner of a roleplay app's screen. Speak ONE very short " +
  "line (a few words) reacting to what just happened, fully in character. No quotes, no preamble.";

function quipSystemPrompt(name: string, personality: string, mood: Mood): string {
  return `${QUIP_SYSTEM_LEAD}\nYour name is ${name}. You are ${personality}. Right now you feel ${mood}.`;
}

async function generateQuip(
  deps: ReactorDeps,
  signal: BuddySignal,
  soul: { readonly name: string; readonly personality: string },
  mood: Mood,
): Promise<{ readonly text: string; readonly fromCanned: boolean }> {
  try {
    const res = await deps.summarize(
      [
        {
          systemPrompt: quipSystemPrompt(soul.name, soul.personality, mood),
          userPrompt: signal.description,
        },
      ],
      { maxTokens: QUIP_MAX_TOKENS, temperature: QUIP_TEMPERATURE },
    );
    const text = (res.items[0]?.text ?? "").trim().slice(0, QUIP_MAX_LEN);
    if (text.length > 0) {
      return { text, fromCanned: false };
    }
  } catch {
    // vLLM breaker open / summarize threw → canned fallback below.
  }
  return { text: cannedQuip(mood), fromCanned: true };
}

/** React to ONE signal, fire-and-forget; never throws into the caller's bus emit. */
export async function react(deps: ReactorDeps, signal: BuddySignal): Promise<void> {
  try {
    await reactInner(deps, signal);
  } catch (err) {
    getLog().warn(
      { err, kind: signal.kind, userId: signal.userId },
      "buddy observer: react failed (swallowed — the reactor never throws into the loop)",
    );
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the CAS loop + the throttle/dedup re-checks after a lost race are one cohesive reaction step; splitting them hides the retry contract.
async function reactInner(deps: ReactorDeps, signal: BuddySignal): Promise<void> {
  const bypass = BYPASS_COOLDOWN.has(signal.kind);
  let row = await loadBuddy(deps.db, signal.userId);

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    if (row === null || !row.reactionsEnabled) {
      return;
    }
    if (row.lastSignalKey === signal.dedupKey) {
      return;
    }
    const now = deps.now();
    if (!bypass && row.lastReactionAt !== null && now - row.lastReactionAt < COOLDOWN_MS) {
      return;
    }

    const nextMood = resolveMood(row.mood, moodForSignal(signal.kind), row.lastReactionAt, now);
    const nextStats = nudgeStats(row.stats, statForSignal(signal.kind));
    // biome-ignore lint/performance/noAwaitInLoops: the CAS retry is inherently sequential — each attempt recomputes against the reload from the prior lost race.
    const won = await casReact(deps.db, {
      userId: signal.userId,
      expectedUpdatedAt: row.updatedAt,
      mood: nextMood,
      stats: nextStats,
      bondDelta: BOND_PER_REACTION,
      lastSignalKey: signal.dedupKey,
      now,
    });
    if (won) {
      await afterReact(deps, signal, {
        prevMood: row.mood,
        nextMood,
        prevStats: row.stats,
        nextStats,
        name: row.name,
        personality: row.personality,
        at: now,
      });
      return;
    }
    // biome-ignore lint/performance/noAwaitInLoops: the reload is the retry's whole point — it must observe the winner's write before recomputing.
    row = await loadBuddy(deps.db, signal.userId);
  }
  getLog().debug(
    { kind: signal.kind, userId: signal.userId },
    "buddy observer: CAS retries exhausted — reaction dropped",
  );
}

async function afterReact(
  deps: ReactorDeps,
  signal: BuddySignal,
  outcome: {
    readonly prevMood: Mood;
    readonly nextMood: Mood;
    readonly prevStats: CompanionStats;
    readonly nextStats: CompanionStats;
    readonly name: string;
    readonly personality: string;
    readonly at: number;
  },
): Promise<void> {
  const { text, fromCanned } = await generateQuip(
    deps,
    signal,
    { name: outcome.name, personality: outcome.personality },
    outcome.nextMood,
  );
  const quipId = deps.newQuipId();
  await insertQuip(deps.db, {
    id: quipId,
    userId: signal.userId,
    text,
    signalKind: signal.kind,
    mood: outcome.nextMood,
    fromCanned,
    generatedAt: outcome.at,
  });
  await sweepQuips(deps.db, signal.userId, QUIP_KEEP);
  deps.emit({
    type: "quip",
    userId: signal.userId,
    quipId,
    text,
    mood: outcome.nextMood,
    signalKind: signal.kind,
    fromCanned,
    at: outcome.at,
  });

  if (outcome.nextMood !== outcome.prevMood) {
    deps.emit({
      type: "moodChanged",
      userId: signal.userId,
      mood: outcome.nextMood,
      at: outcome.at,
    });
  }

  const prevStage = stageOf(outcome.prevStats);
  const nextStage = stageOf(outcome.nextStats);
  const prevForm = formOf(outcome.prevStats).title;
  const nextForm = formOf(outcome.nextStats).title;
  if (nextStage !== prevStage || nextForm !== prevForm) {
    deps.emit({
      type: "evolved",
      userId: signal.userId,
      stage: nextStage,
      formTitle: nextForm,
      at: outcome.at,
    });
  }
}
