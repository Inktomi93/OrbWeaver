import type { CodeEditorDiagnostic } from "@orb/ui/code-editor";
import { APPEARANCE_ATTRIBUTE_PREFIX } from "#lib";
import type { AttributeMatch, HookReference, OwnerCssHook, OwnerCssHookKind, OwnerCssRename } from "#owner-css";
import { scanHooks } from "#owner-css";

const SPELLING: Record<OwnerCssHookKind, (name: string) => string> = {
  slot: (name) => `[data-slot="${name}"]`,
  "shell-class": (name) => `.${name}`,
  token: (name) => name,
  "appearance-attribute": (name) => `[${name}]`,
};

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next.push(Math.min((next[j - 1] ?? 0) + 1, (row[j] ?? 0) + 1, (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    row = next;
  }
  return row[b.length] ?? 0;
}

const MIN_EDIT_LIMIT = 2;
const NAME_LENGTH_PER_EDIT = 3;

// A suggestion must be near enough to be a typo or a small rename, not just the least-bad name on a long list.
function closestName(name: string, candidates: readonly string[]): string | null {
  const limit = Math.max(MIN_EDIT_LIMIT, Math.floor(name.length / NAME_LENGTH_PER_EDIT));
  let best: { readonly name: string; readonly distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = editDistance(name, candidate);
    if (distance <= limit && (best === null || distance < best.distance)) {
      best = { name: candidate, distance };
    }
  }
  return best?.name ?? null;
}

function renameMessage(spelled: string, kind: OwnerCssHookKind, rename: OwnerCssRename): string {
  if (rename.to !== null) {
    return `\`${spelled}\` was renamed to \`${SPELLING[kind](rename.to)}\`. It still applies; update it to the new name.`;
  }
  if (rename.see !== undefined) {
    return `\`${spelled}\` was replaced by \`${SPELLING[kind](rename.see)}\`, whose value is not the same form, so the old name no longer matches. Rewrite it by hand.`;
  }
  return `\`${spelled}\` was removed from the theme surface and no longer matches anything.`;
}

// The partial operators (`^=`, `*=`, `$=`, `|=`) match a fragment, which no value list can judge.
const WHOLE_VALUE_OPERATORS = new Set(["=", "~="]);

interface ValueRule {
  readonly values: readonly string[];
  /** The attribute carries a space-separated list, so `=` takes any of its members together, or nothing. */
  readonly members: boolean;
}

// A selector that no value the attribute can carry satisfies. `~=` takes one whitespace-free word; `=` on a list
// takes members of it (the empty list too), and on a single-valued attribute takes exactly one value.
function neverMatches(found: AttributeMatch, rule: ValueRule): boolean {
  const fold = (value: string): string => (found.caseInsensitive ? value.toLowerCase() : value);
  const allowed = rule.values.map(fold);
  const text = found.text ?? "";
  if (found.operator === "~=") {
    return text === "" || /\s/u.test(text) || !allowed.includes(fold(text));
  }
  if (rule.members) {
    return !fold(text)
      .split(/\s+/u)
      .filter((member) => member !== "")
      .every((member) => allowed.includes(member));
  }
  return !allowed.includes(fold(text));
}

function attributeValueWarning(ref: HookReference, rule: ValueRule): CodeEditorDiagnostic[] {
  const found = ref.attribute;
  const list = rule.values.join(", ");
  if (found === undefined || found.operator === null) {
    const message = `\`${SPELLING[ref.kind](ref.name)}\` always carries a value, so a bare selector matches every element. Allowed values: ${list}.`;
    return [{ severity: "warning", message, from: ref.from, to: ref.to }];
  }
  if (!(WHOLE_VALUE_OPERATORS.has(found.operator) && neverMatches(found, rule))) {
    return [];
  }
  const message = `\`${found.text}\` is not a value \`${ref.name}\` can match with \`${found.operator}\`, so this selector may match nothing. Allowed values: ${list}.`;
  return [{ severity: "warning", message, from: found.from, to: found.to }];
}

function attributeValueRules(surface: readonly OwnerCssHook[]): ReadonlyMap<string, ValueRule> {
  return new Map(
    surface.filter((hook) => hook.kind === "appearance-attribute").map((hook) => [hook.name, { values: hook.values ?? [], members: hook.members === true }]),
  );
}

function valueRule(ref: HookReference, rules: ReadonlyMap<string, ValueRule>): ValueRule | undefined {
  return ref.kind === "appearance-attribute" ? rules.get(ref.name) : undefined;
}

/**
 * Warnings for a stylesheet that names a theme hook the surface does not offer: a recorded rename (still works),
 * a recorded retirement, or an unknown name with the closest current one. Custom properties the sheet declares
 * itself are its own, not hooks. Warnings only: nothing here rejects the CSS.
 */
export function themeCssHookWarnings(css: string, surface: readonly OwnerCssHook[], renames: readonly OwnerCssRename[]): CodeEditorDiagnostic[] {
  const refs = scanHooks(css);
  const declared = new Set(refs.filter((ref) => ref.declaration).map((ref) => ref.name));
  const names: Record<OwnerCssHookKind, string[]> = { slot: [], "shell-class": [], token: [], "appearance-attribute": [] };
  for (const hook of surface) {
    names[hook.kind].push(hook.name);
  }
  const attributeRules = attributeValueRules(surface);
  return refs.flatMap((ref) => {
    const rule = valueRule(ref, attributeRules);
    if (rule !== undefined) {
      return attributeValueWarning(ref, rule);
    }
    // `var(--x, fallback)` hands the author's own default to an unset property: the knob is theirs.
    if (ref.fallback || names[ref.kind].includes(ref.name) || (ref.kind === "token" && !ref.declaration && declared.has(ref.name))) {
      return [];
    }
    const spelled = SPELLING[ref.kind](ref.name);
    const rename = renames.find((row) => row.kind === ref.kind && row.name === ref.name && row.value === undefined);
    if (rename !== undefined) {
      const message = renameMessage(spelled, ref.kind, rename);
      return [{ severity: "warning" as const, message, from: ref.from, to: ref.to }];
    }
    // A declaration of an unknown custom property is the author's own variable, and an attribute outside the
    // appearance family is the author's own marker; neither is a stale hook.
    if (ref.declaration || (ref.kind === "appearance-attribute" && !ref.name.startsWith(APPEARANCE_ATTRIBUTE_PREFIX))) {
      return [];
    }
    const closest = closestName(ref.name, names[ref.kind]);
    const hint = closest === null ? "" : ` Closest current name: \`${SPELLING[ref.kind](closest)}\`.`;
    return [
      { severity: "warning" as const, message: `\`${spelled}\` is not part of the theme surface, so it may match nothing.${hint}`, from: ref.from, to: ref.to },
    ];
  });
}
