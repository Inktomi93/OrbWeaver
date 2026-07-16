// The world-info entry editor model — the flat EntryFormValues the button-gated entry form binds, plus
// the two round-trip mappers. The wire shape nests per-entry behaviour in a loose `metadata` blob
// (scopeMode/inject/position + preserved unknown ST keys); the form flattens it, and the save mapper
// re-nests it while spreading the entry's existing metadata first so unknown ST-imported keys ride
// through untouched. `scopeMode: "auto"` means "no override" — the mapper drops the key so the book
// stays on the heuristic.

import type { EntryMetadata, EntryView, UpdateEntryInput } from "@orb/contracts/world-info";
import type { MessageRole } from "@orb/kit/message-role";
import type { EntryPosition, EntryScopeMode } from "@orb/kit/world-info";

/** The flat, editor-facing shape of one lore entry (every contract field, the metadata blob unpacked). */
export interface EntryFormValues {
  readonly title: string;
  /** Author-facing memo (= ST `comment`) — never injected. `""` maps to `null` on save. */
  readonly description: string;
  /** What the model actually sees when the entry fires. */
  readonly content: string;
  /** Keyword triggers (case-insensitive whole-word) — fires the entry when `scopeMode` resolves to keyword. */
  readonly keys: readonly string[];
  readonly enabled: boolean;
  /** Higher sorts first + injects earlier; also the entry-list display order. `null` = empty input ⇒ 0. */
  readonly priority: number | null;
  /** Bypass the per-turn WI token budget (must-have lore). */
  readonly ignoreBudget: boolean;
  /** auto (derive from keys) · always (force, ignore keys) · keyword (force, needs a key match). */
  readonly scopeMode: EntryScopeMode;
  /** Which WI anchor bucket an always-scope, system-half entry joins (ST worldInfoBefore/After). */
  readonly position: EntryPosition;
  /** Opt in to at-depth injection (splice into the chat history instead of the system half). */
  readonly injectEnabled: boolean;
  readonly injectDepth: number | null;
  readonly injectRole: MessageRole;
}

/** The starter values for a freshly-created entry's editor (before the first server round-trip). */
export const NEW_ENTRY_FORM: EntryFormValues = {
  title: "",
  description: "",
  content: "",
  keys: [],
  enabled: true,
  priority: 0,
  ignoreBudget: false,
  scopeMode: "auto",
  position: "before",
  injectEnabled: false,
  injectDepth: 0,
  injectRole: "user",
};

/** Seed the form from a loaded entry view — unpack the typed `metadata` fields into flat controls. */
export function entryFormFromEntity(entry: EntryView): EntryFormValues {
  const metadata = entry.metadata;
  const inject = metadata?.inject;
  return {
    title: entry.title,
    description: entry.description ?? "",
    content: entry.content,
    keys: entry.keys ?? [],
    enabled: entry.enabled,
    priority: entry.priority,
    ignoreBudget: entry.ignoreBudget,
    scopeMode: metadata?.scopeMode ?? "auto",
    position: metadata?.position ?? "before",
    injectEnabled: inject !== undefined,
    injectDepth: inject?.depth ?? 0,
    injectRole: inject?.role ?? "user",
  };
}

/** Re-nest the flat form into the `updateEntry` input, PRESERVING any unknown metadata keys on `base`. */
export function entryUpdateInputFromForm(values: EntryFormValues, base: EntryMetadata | null): UpdateEntryInput {
  return {
    title: values.title,
    description: values.description.trim() === "" ? null : values.description,
    content: values.content,
    keys: [...values.keys],
    enabled: values.enabled,
    priority: values.priority ?? 0,
    ignoreBudget: values.ignoreBudget,
    metadata: buildMetadata(values, base),
  };
}

/** Merge the three typed behaviour fields back onto the entry's existing (loose) metadata blob. `auto`
 *  scope + a disabled inject OMIT their keys so the read path falls back to its defaults, never a pinned
 *  literal; every OTHER (unknown, ST-imported) key on `base` rides through untouched (rebuilt without the
 *  three managed keys rather than deleted — noDelete). */
function buildMetadata(values: EntryFormValues, base: EntryMetadata | null): Record<string, unknown> {
  const metadata: Record<string, unknown> = { position: values.position };
  for (const [key, value] of Object.entries(base ?? {})) {
    if (key !== "scopeMode" && key !== "inject" && key !== "position") {
      metadata[key] = value;
    }
  }
  if (values.scopeMode !== "auto") {
    metadata["scopeMode"] = values.scopeMode;
  }
  if (values.injectEnabled) {
    metadata["inject"] = { depth: values.injectDepth ?? 0, role: values.injectRole };
  }
  return metadata;
}
