import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { parseDocument } from "yaml";
import { expect, test as issueTest } from "../support/fixtures.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const FORMS_DIR = join(ROOT, ".github", "ISSUE_TEMPLATE");
const GUIDANCE_LINK_COUNT = 3;

interface IssueForm {
  readonly filename: string;
  readonly name: string;
  readonly bodyIds: readonly string[];
  readonly source: string;
  readonly roleOptions: readonly string[];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIssueTemplate(filename: string): Readonly<Record<string, unknown>> {
  const source = readFileSync(join(FORMS_DIR, filename), "utf8");
  const document = parseDocument(source, { prettyErrors: false });
  if (document.errors.length > 0) {
    throw new Error(`${filename} has invalid YAML: ${document.errors.map((error) => error.message).join("; ")}`);
  }

  const parsed = document.toJS();
  if (!isRecord(parsed)) {
    throw new Error(`${filename} must decode to an object`);
  }
  return parsed;
}

function readFormBody(body: readonly unknown[]): Pick<IssueForm, "bodyIds" | "roleOptions"> {
  const bodyIds: string[] = [];
  let roleOptions: readonly string[] = [];
  for (const item of body) {
    if (!isRecord(item)) {
      continue;
    }
    if (typeof item["id"] === "string") {
      bodyIds.push(item["id"]);
    }
    if (item["id"] !== "role" || !isRecord(item["attributes"]) || !Array.isArray(item["attributes"]["options"])) {
      continue;
    }
    roleOptions = item["attributes"]["options"].filter((option): option is string => typeof option === "string");
  }
  return { bodyIds, roleOptions };
}

function issueForms(): readonly IssueForm[] {
  return readdirSync(FORMS_DIR)
    .filter((filename) => filename.endsWith(".yml") && filename !== "config.yml")
    .sort()
    .map((filename) => {
      const source = readFileSync(join(FORMS_DIR, filename), "utf8");
      const parsed = parseIssueTemplate(filename);
      const name = parsed["name"];
      const body = parsed["body"];
      if (typeof name !== "string" || !Array.isArray(body)) {
        throw new Error(`${filename} is not a GitHub issue form`);
      }

      const { bodyIds, roleOptions } = readFormBody(body);
      if (bodyIds.length === 0) {
        throw new Error(`${filename} has no form field ids`);
      }
      return { filename, name, bodyIds, source, roleOptions };
    });
}

function expectClaudeGuidanceLink(path: string, target: string): void {
  expect(lstatSync(path).isSymbolicLink()).toBe(true);
  const resolved = realpathSync(path);
  expect(relative(ROOT, resolved).startsWith("..")).toBe(false);
  expect(resolved).toBe(join(ROOT, target));
}

issueTest("issue ingress has one work form and one program-or-evidence form", () => {
  const templates = readdirSync(FORMS_DIR)
    .filter((filename) => filename.endsWith(".yml"))
    .sort();
  expect(templates).toEqual(["bug.yml", "config.yml", "decision.yml", "program-or-evidence.yml", "work-item.yml"]);
  for (const filename of templates) {
    parseIssueTemplate(filename);
  }

  const forms = issueForms();
  expect(forms.map((form) => form.filename)).toEqual(["bug.yml", "decision.yml", "program-or-evidence.yml", "work-item.yml"]);

  const work = forms.find((form) => form.filename === "work-item.yml");
  expect(work?.source).toContain("Build");
  expect(work?.source).toContain("Operations");
  expect(work?.source).toContain("Documentation");

  const programOrEvidence = forms.find((form) => form.filename === "program-or-evidence.yml");
  expect(programOrEvidence?.bodyIds).toContain("role");
  expect(programOrEvidence?.roleOptions).toEqual(["Program", "Evidence"]);
  for (const id of ["evidence", "rederived", "disposition", "done"]) {
    expect(programOrEvidence?.bodyIds).toContain(id);
  }
});

issueTest("Codex guidance paths resolve to the one Claude-owned home inside the repository", () => {
  const paths = [
    [".Codex/agent-doctrine.md", ".claude/agent-doctrine.md"],
    [".Codex/rules", ".claude/rules"],
    [".Codex/agents", ".claude/agents"],
  ] as const;
  expect(paths).toHaveLength(GUIDANCE_LINK_COUNT);
  for (const [path, target] of paths) {
    expectClaudeGuidanceLink(join(ROOT, path), target);
  }
});
