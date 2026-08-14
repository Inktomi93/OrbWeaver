import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test as issueTest } from "../support/fixtures.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const FORMS_DIR = join(ROOT, ".github", "ISSUE_TEMPLATE");
const FORM_NAME_RE = /^name:\s*(.+)$/mu;
const FORM_BODY_RE = /^body:\s*$/mu;
const FORM_BODY_ID_RE = /^\s{4}id:\s*([a-z][a-z-]*)$/gmu;
const ROLE_OPTIONS_RE = /id:\s*role\n(?:.|\n)*?options:\n((?:\s{8}- .+\n)+)/mu;
const GUIDANCE_LINK_COUNT = 3;

interface IssueForm {
  readonly filename: string;
  readonly name: string;
  readonly bodyIds: readonly string[];
  readonly source: string;
}

function issueForms(): readonly IssueForm[] {
  return readdirSync(FORMS_DIR)
    .filter((filename) => filename.endsWith(".yml") && filename !== "config.yml")
    .sort()
    .map((filename) => {
      const source = readFileSync(join(FORMS_DIR, filename), "utf8");
      const name = FORM_NAME_RE.exec(source)?.[1];
      const bodyIds = [...source.matchAll(FORM_BODY_ID_RE)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
      if (name === undefined || !FORM_BODY_RE.test(source) || bodyIds.length === 0) {
        throw new Error(`${filename} is not a parseable GitHub issue form`);
      }
      return { filename, name, bodyIds, source };
    });
}

function expectClaudeGuidanceLink(path: string, target: string): void {
  expect(lstatSync(path).isSymbolicLink()).toBe(true);
  const resolved = realpathSync(path);
  expect(relative(ROOT, resolved).startsWith("..")).toBe(false);
  expect(resolved).toBe(join(ROOT, target));
}

function roleOptions(form: IssueForm): readonly string[] {
  const options = ROLE_OPTIONS_RE.exec(form.source)?.[1];
  if (options === undefined) {
    throw new Error("Program or evidence form is missing role options");
  }
  return [...options.matchAll(/^\s{8}- (.+)$/gmu)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

issueTest("issue ingress has one work form and one program-or-evidence form", () => {
  const forms = issueForms();
  expect(forms.map((form) => form.filename)).toEqual(["bug.yml", "decision.yml", "program-or-evidence.yml", "work-item.yml"]);

  const work = forms.find((form) => form.filename === "work-item.yml");
  expect(work?.source).toContain("Build");
  expect(work?.source).toContain("Operations");
  expect(work?.source).toContain("Documentation");

  const programOrEvidence = forms.find((form) => form.filename === "program-or-evidence.yml");
  expect(programOrEvidence?.bodyIds).toContain("role");
  expect(programOrEvidence === undefined ? [] : roleOptions(programOrEvidence)).toEqual(["Program", "Evidence"]);
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
