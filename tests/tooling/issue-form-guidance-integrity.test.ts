import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { expect, test as issueTest } from "../support/tool-fixtures.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const FORMS_DIR = join(ROOT, ".github", "ISSUE_TEMPLATE");

interface IssueForm {
  readonly filename: string;
  readonly name: string;
  readonly bodyIds: readonly string[];
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

function formFieldIds(body: readonly unknown[]): readonly string[] {
  return body.flatMap((item) => (isRecord(item) && typeof item["id"] === "string" ? [item["id"]] : []));
}

function issueForms(): readonly IssueForm[] {
  return readdirSync(FORMS_DIR)
    .filter((filename) => filename.endsWith(".yml") && filename !== "config.yml")
    .sort()
    .map((filename) => {
      const parsed = parseIssueTemplate(filename);
      const name = parsed["name"];
      const body = parsed["body"];
      if (typeof name !== "string" || !Array.isArray(body)) {
        throw new Error(`${filename} is not a GitHub issue form`);
      }

      const bodyIds = formFieldIds(body);
      if (bodyIds.length === 0) {
        throw new Error(`${filename} has no form field ids`);
      }
      return { filename, name, bodyIds };
    });
}

issueTest("issue ingress offers only the public bug forms, each with required fields", () => {
  const templates = readdirSync(FORMS_DIR)
    .filter((filename) => filename.endsWith(".yml"))
    .sort();
  expect(templates).toEqual(["app-report.yml", "bug.yml", "config.yml"]);
  const config = parseIssueTemplate("config.yml");
  // Blank issues stay off so every report carries a version line.
  expect(config["blank_issues_enabled"]).toBe(false);
  const forms = issueForms();
  expect(forms.map((form) => form.filename)).toEqual(["app-report.yml", "bug.yml"]);
  const bug = forms.find((form) => form.filename === "bug.yml");
  for (const id of ["version", "install", "what-happened"]) {
    expect(bug?.bodyIds).toContain(id);
  }
});
