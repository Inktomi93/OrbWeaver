// The display pass's notice copy: one notice for every regex script stopped this session, and one for a
// browser that cannot run display scripts at all.

/** Why the display pass stopped a script. */
export type DisplayStopReason = "slow" | "oversize";

export function displayScriptsStoppedTitle(count: number): string {
  return count === 1 ? "A regex script was stopped" : `${count} regex scripts were stopped`;
}

export function displayScriptsStoppedDescription(latestName: string, reason: DisplayStopReason, count: number): string {
  const what = reason === "slow" ? "ran too long on a message" : "made too much text from a message";
  const who = count === 1 ? `"${latestName}"` : `The latest, "${latestName}",`;
  return `${who} ${what}. Stopped scripts stay off until you reload the page, and messages show without them.`;
}

export const DISPLAY_SCRIPTS_UNAVAILABLE_TITLE = "Regex scripts cannot run here";
export const DISPLAY_SCRIPTS_UNAVAILABLE_DESCRIPTION = "This browser could not start them, so messages show without your on-screen regex scripts.";
