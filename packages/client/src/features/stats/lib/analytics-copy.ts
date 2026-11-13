// The Insights words a spec locates by, in one import-free module so a spec's node side can import them.

/** Prefixes a day label whose activity includes messages with approximate dates; the same mark estimates wear. */
export const APPROX_DATES_MARK = "~";

/** Explains the mark and the aggregates that count approximate messages without a per-bucket mark. */
export const APPROX_DATES_NOTE =
  "~ marks days with approximate dates. Imported chats can date messages long after the chat began. The rhythm, weekday and hour figures count those messages too.";

/** The accounting boundary notice every pane keeps visible: its lead, its summary and its disclosure's name. */
export const ACCOUNTING_IDENTITY_TEXT = "Partial accounting: not your provider bill";
export const ACCOUNTING_SUMMARY_TEXT = "Missing prices are omitted; some costs are estimates.";
export const ACCOUNTING_COVERAGE_NAME = "Accounting coverage";

/** The disclosure's paragraphs, in the order they read. The scope paragraph is the library's or one character's. */
export const ACCOUNTING_PRICES_TEXT =
  "Costs sum available compatible prices and omit missing prices. They may include provider-reported prices, configured-rate estimates or subscription-notional estimates, not invoice charges.";
export const ACCOUNTING_OMITTED_TEXT = "Prompt extraction and captioning costs are omitted. Background-work accounting is incomplete.";
export const ACCOUNTING_LIBRARY_TEXT =
  "Figures use retained message generations, image-generation records, observed embedding batches and compaction spend. Image costs may lack counted samples.";
export const ACCOUNTING_CHARACTER_TEXT = "Character costs cover recorded message generations only; image generation and compaction are library-level activity.";
export const ACCOUNTING_RETENTION_TEXT =
  "Deleted images can lose their cost records on Recompute. Image-generation history is included in backup and restore; embedding and compaction spend history are not.";
export const ACCOUNTING_AVERAGES_TEXT = "Generation averages do not cover every operation. Last active can include chat-setting changes, not just replies.";

/** The scope paragraph, by whether the pane is one character's. */
export function accountingScopeText(characterOnly: boolean): string {
  return characterOnly ? ACCOUNTING_CHARACTER_TEXT : ACCOUNTING_LIBRARY_TEXT;
}

/** The note under a character's name: its figures are aggregates, not a transcript. */
export const ANALYTICS_CHARACTER_IDENTITY_TEXT = "This character · Aggregate only";

/** The Rhythm figures' sentence names the busiest day after this lead. */
export const ANALYTICS_BUSIEST_DAY_LEAD = "Your busiest day was";

/** The analytics list's empty state before any rolled-up activity exists. */
export const ANALYTICS_NO_ACTIVITY_TEXT = "No characters have any rolled-up activity yet.";
