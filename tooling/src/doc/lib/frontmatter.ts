// The frontmatter READER — the write half is `frontmatter-write.ts`. Deliberately NOT a YAML parser: the
// authored schema is FLAT `key: value`, and a real YAML reader would happily accept nested shapes the
// governed trees do not use.
import type { Frontmatter } from "../contract/types.ts";

const FRONTMATTER_FENCE_LENGTH = 4;
const FRONTMATTER_LINE_OFFSET = 2;
const FRONTMATTER_FIELD_RE = /^([a-z][a-z-]*):\s*(.*?)\s*$/u;
const INDENTED_YAML_RE = /^\s+/u;
const QUOTED_SCALAR_RE = /^(["'])(.*)\1$/u;

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
