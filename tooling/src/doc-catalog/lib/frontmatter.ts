// The frontmatter reader + its schema check — PURE (source string in, Frontmatter out), which is what
// lets the corpus rules be unit-tested without a tree. Deliberately NOT a YAML parser: the authored
// schema is FLAT `key: value`, and a real YAML reader would happily accept nested
// shapes the catalog cannot represent.
import type { Frontmatter } from "../contract/types.ts";
import {
  ALLOWED_FRONTMATTER_KEYS,
  DATE_RE,
  FRONTMATTER_FENCE_LENGTH,
  FRONTMATTER_FIELD_RE,
  FRONTMATTER_LINE_OFFSET,
  INDENTED_YAML_RE,
  QUOTED_SCALAR_RE,
  REQUIRED_FRONTMATTER_KEYS,
  VALID_KINDS,
  VALID_STATUSES,
} from "./vocab.ts";

export function parseFrontmatter(source: string, path = "document.md"): Frontmatter {
  if (!source.startsWith("---\n")) {
    return { present: false, malformed: false, fields: {}, errors: [] };
  }
  const close = source.indexOf("\n---\n", FRONTMATTER_FENCE_LENGTH);
  if (close < 0) {
    return { present: true, malformed: true, fields: {}, errors: [`${path}: frontmatter has no closing --- fence`] };
  }
  const fields: Record<string, string> = {};
  const errors: string[] = [];
  for (const [index, raw] of source.slice(FRONTMATTER_FENCE_LENGTH, close).split("\n").entries()) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    if (INDENTED_YAML_RE.test(raw)) {
      errors.push(`${path}:${index + FRONTMATTER_LINE_OFFSET}: nested frontmatter is not allowed`);
      continue;
    }
    const match = FRONTMATTER_FIELD_RE.exec(line);
    if (match === null) {
      errors.push(`${path}:${index + FRONTMATTER_LINE_OFFSET}: frontmatter must be flat key: value YAML`);
      continue;
    }
    const [, key = "", value = ""] = match;
    if (key in fields) {
      errors.push(`${path}:${index + FRONTMATTER_LINE_OFFSET}: duplicate frontmatter key ${key}`);
    }
    fields[key] = value.replace(QUOTED_SCALAR_RE, "$2");
  }
  return { present: true, malformed: errors.length > 0, fields, errors };
}

/** Schema errors for a document's frontmatter. An absent block is DEBT (the ratchet's
 *  `missingFrontmatter` lane), not an error. */
export function frontmatterErrors(path: string, frontmatter: Frontmatter): readonly string[] {
  if (!frontmatter.present) {
    return [];
  }
  const errors = [...frontmatter.errors];
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    if (!(key in frontmatter.fields)) {
      errors.push(`${path}: missing frontmatter key ${key}`);
    }
  }
  for (const key of Object.keys(frontmatter.fields)) {
    if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
      errors.push(`${path}: unsupported frontmatter key ${key}`);
    }
  }
  const kind = frontmatter.fields["kind"];
  const status = frontmatter.fields["status"];
  const updated = frontmatter.fields["updated"];
  if (kind !== undefined && !VALID_KINDS.has(kind)) {
    errors.push(`${path}: invalid frontmatter kind ${kind}`);
  }
  if (status !== undefined && !VALID_STATUSES.has(status)) {
    errors.push(`${path}: invalid frontmatter status ${status}`);
  }
  if (updated !== undefined && !DATE_RE.test(updated)) {
    errors.push(`${path}: updated must be YYYY-MM-DD`);
  }
  return errors;
}
