// The ONE assistant@depth-0-prefill warning copy (C11 rollup) — was hand-typed at each of the three
// `isAssistantPrefill` (`@orb/kit/injection`) consumer editors (character-advanced-tab, room-overrides-
// form, persona-editor) and had already drifted ("pick depth ≥ 1" vs "Use depth ≥ 1").

export const ASSISTANT_PREFILL_WARNING =
  "Assistant role at depth 0 is a response prefill — unsupported across providers. Use depth ≥ 1, or role system/user.";
