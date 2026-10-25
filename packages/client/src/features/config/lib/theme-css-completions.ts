// The theme editor's autocomplete, read straight off the generated surface: each context offers only the hooks
// of the kind that fits it.
import type { CodeEditorCompletionOption, CodeEditorCompletionRule } from "@orb/ui/code-editor";
import { APPEARANCE_ATTRIBUTE_PREFIX } from "#lib";
import type { OwnerCssHookKind } from "#owner-css";
import { OWNER_CSS_SURFACE } from "../../../../owner-css-surface.ts";

const optionsOf = (kind: OwnerCssHookKind, detail: string): readonly CodeEditorCompletionOption[] =>
  OWNER_CSS_SURFACE.filter((hook) => hook.kind === kind).map((hook) => ({ label: hook.name, detail }));

// `[data-appearance-<key>="` offers the values that key's variants match.
const appearanceValues = (match: RegExpExecArray): readonly CodeEditorCompletionOption[] =>
  (OWNER_CSS_SURFACE.find((hook) => hook.kind === "appearance-attribute" && hook.name === match[1])?.values ?? []).map((value) => ({
    label: value,
    detail: "value",
  }));

export const OWNER_CSS_COMPLETIONS: readonly CodeEditorCompletionRule[] = [
  { trigger: /\[data-slot[~|^$*]?=["']([\w-]*)$/u, options: optionsOf("slot", "data-slot") },
  { trigger: /var\(\s*(--[\w-]*)$/u, options: optionsOf("token", "token") },
  { trigger: /\.(shell-[\w-]*)$/u, options: optionsOf("shell-class", "shell class") },
  { trigger: new RegExp(`\\[(${APPEARANCE_ATTRIBUTE_PREFIX}[\\w-]+)[~|^$*]?=["']([\\w-]*)$`, "u"), options: appearanceValues },
  { trigger: new RegExp(`\\[(${APPEARANCE_ATTRIBUTE_PREFIX}[\\w-]*)$`, "u"), options: optionsOf("appearance-attribute", "appearance") },
];
