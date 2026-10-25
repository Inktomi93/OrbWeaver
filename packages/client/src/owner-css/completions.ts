// The theme editor's autocomplete, read straight off the generated surface: each context offers only the hooks
// of the kind that fits it.
import type { CodeEditorCompletionOption, CodeEditorCompletionRule } from "@orb/ui/code-editor";
import { OWNER_CSS_SURFACE } from "../../owner-css-surface.ts";
import type { OwnerCssHookKind } from "./hook.ts";

const optionsOf = (kind: OwnerCssHookKind, detail: string): readonly CodeEditorCompletionOption[] =>
  OWNER_CSS_SURFACE.filter((hook) => hook.kind === kind).map((hook) => ({ label: hook.name, detail }));

export const OWNER_CSS_COMPLETIONS: readonly CodeEditorCompletionRule[] = [
  { trigger: /\[data-slot[~|^$*]?=["']([\w-]*)$/u, options: optionsOf("slot", "data-slot") },
  { trigger: /var\(\s*(--[\w-]*)$/u, options: optionsOf("token", "token") },
  { trigger: /\.(shell-[\w-]*)$/u, options: optionsOf("shell-class", "shell class") },
];
