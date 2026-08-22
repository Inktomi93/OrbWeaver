// The Claude role-manifest parser — PURE (string in, ClaudeAgent out), so the whole frontmatter
// contract is unit-testable without a tree. Deliberately a one-line-per-key mini-parser rather than a
// YAML dep: the agent frontmatter grammar is fixed (scalars, JSON strings, flat `[a, b]` lists) and a
// full YAML reader would silently ACCEPT shapes the Codex renderer cannot express.
import type { ClaudeAgent } from "../contract/types.ts";

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u;
const QUOTE_EDGES = /^['"]|['"]$/gu;

function requiredString(record: Readonly<Record<string, unknown>>, key: string, filename: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${filename}: frontmatter.${key} must be a non-empty string`);
  }
  return value;
}

export function parseFrontmatter(source: string, filename: string): Readonly<Record<string, unknown>> {
  const record: Record<string, unknown> = {};
  for (const line of source.split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      throw new Error(`${filename}: frontmatter entries must be one-line key/value pairs`);
    }
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (key in record) {
      throw new Error(`${filename}: duplicate frontmatter key ${key}`);
    }
    if (raw.startsWith('"')) {
      record[key] = JSON.parse(raw);
    } else if (raw.startsWith("[") && raw.endsWith("]")) {
      record[key] = raw
        .slice(1, -1)
        .split(",")
        .map((value) => value.trim().replace(QUOTE_EDGES, ""));
    } else {
      record[key] = raw;
    }
  }
  return record;
}

export function parseClaudeAgent(filename: string, source: string): ClaudeAgent {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (match === null) {
    throw new Error(`${filename}: expected YAML frontmatter followed by an agent body`);
  }
  const frontmatter = match[1];
  const body = match[2];
  if (frontmatter === undefined || body === undefined) {
    throw new Error(`${filename}: frontmatter parser did not capture both required sections`);
  }

  const record = parseFrontmatter(frontmatter, filename);
  const skillsValue = record["skills"];
  const skills = Array.isArray(skillsValue)
    ? skillsValue.map((skill: unknown) => {
        if (typeof skill !== "string" || skill.trim() === "") {
          throw new Error(`${filename}: every frontmatter.skills entry must be a non-empty string`);
        }
        return skill;
      })
    : [];

  return {
    body: body.trimEnd(),
    description: requiredString(record, "description", filename),
    effort: requiredString(record, "effort", filename),
    name: requiredString(record, "name", filename),
    skills,
  };
}
