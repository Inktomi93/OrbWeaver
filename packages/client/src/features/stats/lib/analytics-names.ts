// The accessible names the Insights leaderboard list prints, in one import-free module so a spec's node side can import them.

/** The Insights context pane's per-model tab, and the list of models inside it. */
export const ANALYTICS_MODELS_NAME = "Models";

/** The Insights context pane's calendar tab. */
export const ANALYTICS_TIME_NAME = "Time";

/** The character leaderboard's list. */
export const ANALYTICS_LEADERBOARD_NAME = "Character leaderboard";

/** The Insights headings and chart names a spec locates a figure by. */
export const ANALYTICS_ALL_TIME_HEADING = "All-time totals";
export const ANALYTICS_ACTIVITY_HEADING = "Activity";
export const ANALYTICS_RHYTHM_HEADING = "Rhythm";
export const ANALYTICS_GENERATIONS_HEADING = "Generations";
export const ANALYTICS_GENERATIONS_BY_MODEL_NAME = "Generations by model";
export const ANALYTICS_REPLY_SPEED_HEADING = "Reply speed (all models)";
export const ANALYTICS_TURNS_PER_DAY_NAME = "Assistant turns per day";
export const ANALYTICS_TOKENS_PER_DAY_NAME = "Output tokens per day";

/** A leaderboard sort segment, named for the order it picks. */
export function analyticsSortName(sort: string): string {
  return `Sort by ${sort}`;
}
