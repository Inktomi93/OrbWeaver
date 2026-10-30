import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { stripVTControlCharacters } from "node:util";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestError, TestResult, TestStep } from "@playwright/test/reporter";
import type { SurfaceCoverageInventory } from "../iso/surface-coverage.ts";
import { SURFACE_INVENTORY_ATTACHMENT, surfaceCoverageInventorySchema } from "../iso/surface-coverage.ts";
import { SURFACE_HTTP_ANNOTATION } from "../iso/surface-pass.ts";
import { nativeAttachmentExtension } from "./native-attachments.ts";
import { assertSurfaceRunOutput } from "./surface-data.ts";
import { writeSurfaceCaseAdmission } from "./surface-run.ts";

export const SURFACE_AGENT_ENTRY = "agent-entry.md";
export const SURFACE_AGENT_SUMMARY = "agent-summary.txt";
const CASE_DIRECTORY = "agent-cases";
const ERROR_PREVIEW_COUNT = 2;
const ERROR_PREVIEW_CHARACTERS = 800;

/** Validate destinations before synchronous native callbacks retain partial results. */
export async function prepareSurfaceAgentReport(root: string): Promise<string> {
  for (const path of [join(root, SURFACE_AGENT_ENTRY), join(root, SURFACE_AGENT_SUMMARY), join(root, CASE_DIRECTORY)]) {
    await assertSurfaceRunOutput(root, path);
  }
  await mkdir(join(root, CASE_DIRECTORY), { recursive: true, mode: 0o700 });
  return root;
}

/** Retain an entry even if preparation or collection never reaches the native reporter. */
export async function initializeSurfaceAgentEntry(root: string): Promise<void> {
  await prepareSurfaceAgentReport(root);
  await writeFile(
    join(root, SURFACE_AGENT_ENTRY),
    `# Surface E2E: startup incomplete\n\nRun: ${root}\n\nNo native collection or completed coverage is established. Preparation/build/server errors remain in failure.txt, build.log, configuration-failure.txt or native.log when those phases produced them. Native callbacks replace this entry with actual results.\n`,
    { mode: 0o600 },
  );
}

type Attachment = TestResult["attachments"][number];
type AttachmentRoute = Pick<Attachment, "name" | "contentType" | "path">;
type NativeResult = Pick<TestResult, "status" | "retry" | "duration" | "startTime" | "error" | "errors" | "annotations">;

interface CaseRoute {
  readonly file: string;
  readonly stepFile: string;
  readonly test: Pick<TestCase, "id" | "location" | "annotations" | "expectedStatus">;
  readonly titlePath: readonly string[];
  readonly project: string | undefined;
  readonly retry: number;
  readonly annotatedSteps: (Pick<TestStep, "annotations"> & { readonly titlePath: ReturnType<TestStep["titlePath"]> })[];
  readonly inventories: SurfaceCoverageInventory[];
  readonly inventoryErrors: string[];
  result: NativeResult | null;
  attachments: readonly AttachmentRoute[];
}

/** Encode a path argument so the advertised command also survives shell metacharacters across platforms. */
export function surfaceReadCommand(file: string): string {
  return `pnpm e2e:surface:read --file-base64=${Buffer.from(file).toString("base64url")}`;
}

function coverageCounts(inventories: readonly SurfaceCoverageInventory[]): string {
  const dispositions = new Map<string, number>();
  for (const inventory of inventories) {
    for (const observation of inventory.observations) {
      dispositions.set(observation.disposition, (dispositions.get(observation.disposition) ?? 0) + 1);
    }
  }
  return [...dispositions].map(([disposition, count]) => `${disposition}=${String(count)}`).join(", ") || "none";
}

function httpLines(route: CaseRoute): string[] {
  return (route.result?.annotations ?? [])
    .filter((annotation) => annotation.type === SURFACE_HTTP_ANNOTATION)
    .map((annotation) => `HTTP: ${annotation.description ?? "Summary unavailable"}`);
}

function caseLines(route: CaseRoute): string[] {
  const lines: string[] = [];
  lines.push(
    `### ${route.result?.status ?? "no end result"}: ${route.titlePath.join(" / ")}`,
    "",
    `Expected: ${route.test.expectedStatus}; retry: ${String(route.retry)}; native errors: ${String(route.result?.errors.length ?? 0)}.`,
    `Complete case: ${route.file}`,
    `Read: \`${surfaceReadCommand(route.file)}\``,
    `Complete step events: ${route.stepFile}`,
    `Read: \`${surfaceReadCommand(route.stepFile)}\``,
    "",
  );
  lines.push(...httpLines(route));
  for (const error of route.result?.errors ?? []) {
    const headline = stripVTControlCharacters(error.message ?? error.value ?? "Native error has no message").split(/\r?\n/u)[0];
    lines.push(`- Native error: ${headline}`);
    if (error.location !== undefined) {
      lines.push(`  Location: ${error.location.file}:${String(error.location.line)}:${String(error.location.column)}`);
    }
  }
  lines.push("Full native errors, annotations, checkpoint metrics and ordered coverage rows are in the complete case above.", "");
  if (route.inventories.length === 0) {
    lines.push("Surface inventory unavailable/incomplete; absence is not an empty coverage pass.", "");
  } else {
    lines.push(`Coverage observation rows: ${coverageCounts(route.inventories)}. These include repeated checkpoints, not unique covered subjects.`, "");
  }
  lines.push(...route.inventoryErrors.map((error) => `Inventory unavailable: ${error}`), "");
  return lines;
}

// Native callbacks cannot be awaited; synchronous writes retain completed events after an outer kill.
// biome-ignore lint/style/noDefaultExport: Playwright loads a reporter module through its default class export.
export default class SurfaceIndexReporter implements Reporter {
  private readonly root: string;
  private readonly nativeJson: string;
  private readonly htmlDirectory: string;
  private readonly blobDirectory: string;
  private readonly cases = new Map<string, CaseRoute>();
  private readonly attachmentFiles = new WeakMap<Buffer, string>();
  private readonly errors: TestError[] = [];
  private selected: readonly { readonly id: string; readonly titlePath: readonly string[] }[] = [];
  private configuredProjects: readonly string[] = [];
  private selectedProjects: readonly string[] = [];
  private collectionAvailable = false;
  private selectionLimited = true;
  private outcome: FullResult["status"] | null = null;
  private nextAttachment = 0;
  private lastCaseCompletedAt: number | null = null;

  constructor(options: { readonly runRoot: string; readonly nativeJson: string; readonly htmlDirectory: string; readonly blobDirectory: string }) {
    this.root = options.runRoot;
    this.nativeJson = options.nativeJson;
    this.htmlDirectory = options.htmlDirectory;
    this.blobDirectory = options.blobDirectory;
    mkdirSync(join(this.root, CASE_DIRECTORY), { recursive: true, mode: 0o700 });
  }

  onBegin(config: FullConfig, suite: Suite): void {
    const tests = suite.allTests();
    this.collectionAvailable = true;
    this.selected = tests.map((test) => ({ id: test.id, titlePath: test.titlePath() }));
    this.configuredProjects = config.projects.map((project) => project.name);
    this.selectedProjects = [...new Set(tests.map((test) => test.parent.project()?.name ?? "unavailable"))];
    const args = process.argv.slice(2);
    if (args[0] === "test") {
      args.shift();
    }
    this.selectionLimited =
      args.some((argument) => !argument.startsWith("--config=")) || this.configuredProjects.some((name) => !this.selectedProjects.includes(name));
    this.writeEntry();
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    writeSurfaceCaseAdmission(this.root, test.id, this.lastCaseCompletedAt);
    this.route(test, result);
    this.writeEntry();
  }

  onStepEnd(test: TestCase, result: TestResult, step: TestStep): void {
    const route = this.route(test, result);
    if (step.annotations.length > 0) {
      route.annotatedSteps.push({ titlePath: step.titlePath(), annotations: step.annotations });
    }
    appendFileSync(
      route.stepFile,
      `${JSON.stringify({
        titlePath: step.titlePath(),
        category: step.category,
        startTime: step.startTime,
        duration: step.duration,
        error: step.error,
        location: step.location,
        params: step.params,
        subtitle: step.subtitle,
        annotations: step.annotations,
        attachments: step.attachments.map((attachment) => this.retainAttachment(attachment)),
      })}\n`,
      { mode: 0o600 },
    );
    if (step.error !== undefined || step.annotations.length > 0) {
      this.writeCase(route);
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.lastCaseCompletedAt = Date.now();
    writeSurfaceCaseAdmission(this.root, test.id, this.lastCaseCompletedAt);
    const route = this.route(test, result);
    route.test.expectedStatus = test.expectedStatus;
    const { status, retry, duration, startTime, error, errors, annotations } = result;
    route.result = { status, retry, duration, startTime, ...(error === undefined ? {} : { error }), errors, annotations };
    route.attachments = result.attachments.map((attachment) => this.retainAttachment(attachment));
    for (const attachment of result.attachments.filter((item) => item.name === SURFACE_INVENTORY_ATTACHMENT)) {
      try {
        const body = attachment.body ?? (attachment.path === undefined ? undefined : readFileSync(attachment.path));
        if (body === undefined) {
          throw new Error("Native inventory attachment has no retained body");
        }
        route.inventories.push(surfaceCoverageInventorySchema.parse(JSON.parse(body.toString("utf8"))));
      } catch (inventoryError) {
        route.inventoryErrors.push(String(inventoryError));
      }
    }
    this.writeCase(route);
    this.writeEntry();
  }

  onError(error: TestError): void {
    this.errors.push(error);
    writeFileSync(join(this.root, "native-errors.json"), JSON.stringify(this.errors, null, 2), { mode: 0o600 });
    this.writeEntry();
  }

  onEnd(result: FullResult): void {
    this.outcome = result.status;
    this.writeEntry();
  }

  private route(test: TestCase, result: TestResult): CaseRoute {
    const key = JSON.stringify([test.id, result.retry]);
    const existing = this.cases.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const number = String(this.cases.size);
    const route: CaseRoute = {
      file: join(this.root, CASE_DIRECTORY, `${number}.json`),
      stepFile: join(this.root, CASE_DIRECTORY, `${number}.steps.jsonl`),
      test: { id: test.id, location: test.location, annotations: test.annotations, expectedStatus: test.expectedStatus },
      titlePath: test.titlePath(),
      project: test.parent.project()?.name,
      retry: result.retry,
      annotatedSteps: [],
      inventories: [],
      inventoryErrors: [],
      result: null,
      attachments: [],
    };
    this.cases.set(key, route);
    this.writeCase(route);
    return route;
  }

  private retainAttachment(attachment: Attachment): AttachmentRoute {
    let path = attachment.path;
    if (path === undefined && attachment.body !== undefined) {
      path = this.attachmentFiles.get(attachment.body);
      if (path === undefined) {
        path = join(this.root, CASE_DIRECTORY, `attachment-${String(this.nextAttachment++)}.${nativeAttachmentExtension(attachment.contentType)}`);
        writeFileSync(path, attachment.body, { mode: 0o600 });
        this.attachmentFiles.set(attachment.body, path);
      }
    }
    return { name: attachment.name, contentType: attachment.contentType, ...(path === undefined ? {} : { path }) };
  }

  private writeCase(route: CaseRoute): void {
    writeFileSync(route.file, JSON.stringify(route, null, 2), { mode: 0o600 });
  }

  private selectionCaption(): string {
    if (!this.collectionAvailable) {
      return "Native collection unavailable; no coverage claim.";
    }
    return this.selectionLimited
      ? "SELECTION-LIMITED. Unselected projects/cases are not claimed exercised."
      : "Full native collection selected; not a total content census.";
  }

  private writeEntry(): void {
    const completed = [...this.cases.values()].filter((route) => route.result !== null);
    const unexpected = completed.filter((route) => route.result?.status !== route.test.expectedStatus && route.result?.status !== "skipped");
    const missing = this.selected.filter((test) => !completed.some((route) => route.test.id === test.id));
    const unselected = this.configuredProjects.filter((project) => !this.selectedProjects.includes(project));
    const lines = [
      `# Surface E2E: ${this.outcome ?? "incomplete / native runner has not finalized"}`,
      "",
      `Run: ${this.root}`,
      "",
      `${String(completed.length)} completed native results; ${String(unexpected.length)} unexpected; ${String(missing.length)} selected cases without an end result.`,
      this.selectionCaption(),
      `Configured projects: ${this.configuredProjects.join(", ") || "unavailable"}. Unselected projects: ${unselected.join(", ") || "none established"}.`,
      "",
      "## Read first",
      "",
      "Unexpected native cases are first below. Each command prints a complete retained native result, not a diagnosis or score. Step JSONL retains public locations, parameters, annotations and original attachment paths. Raw axe/vitals/geometry/inventory attachments are unchanged.",
      `Native JSON (finalization required): ${this.nativeJson}`,
      `Native blob (finalization required): ${this.blobDirectory}`,
      `Optional native HTML: ${this.htmlDirectory}`,
      "",
      "No source ownership or root cause is inferred. Observed checkpoints do not establish completed operations; exclusions/skips do not establish exercised coverage.",
      "",
      "## Native cases",
      "",
    ];
    const ordered = [...unexpected, ...[...this.cases.values()].filter((route) => !unexpected.includes(route))];
    lines.push(...ordered.flatMap(caseLines));
    lines.push(
      "## Selected cases without completed results",
      "",
      ...missing.map((test) => `- ${test.titlePath.join(" / ")}`),
      "",
      "## Global native errors",
      "",
      ...this.errors.map((error) => error.message ?? error.value ?? "Native error has no message"),
    );
    writeFileSync(join(this.root, SURFACE_AGENT_ENTRY), `${lines.join("\n")}\n`, { mode: 0o600 });
    const summary = [
      `Native E2E: ${this.outcome ?? "incomplete"}; completed=${String(completed.length)} unexpected=${String(unexpected.length)} selected-without-end=${String(missing.length)} global-errors=${String(this.errors.length)}`,
      ...completed.flatMap((route) => httpLines(route).map((line) => `${route.titlePath.join(" / ")}: ${line}`)),
      ...unexpected.flatMap((route) => {
        const errors = route.result?.errors ?? [];
        const location = route.test.location;
        return [
          `${route.result?.status}: ${route.titlePath.join(" / ")}; errors=${String(errors.length)}`,
          `Native test definition: ${location.file}:${String(location.line)}:${String(location.column)}`,
          ...errors.slice(0, ERROR_PREVIEW_COUNT).flatMap((error) => {
            const message = error.message ?? error.value ?? "Native error has no message";
            return [
              error.location === undefined
                ? "Native error location unavailable; retained native error details remain in the complete case."
                : `Native error location: ${error.location.file}:${String(error.location.line)}:${String(error.location.column)}`,
              message.slice(0, ERROR_PREVIEW_CHARACTERS),
              `Preview omitted characters: ${String(Math.max(0, message.length - ERROR_PREVIEW_CHARACTERS))}`,
            ];
          }),
          `Additional errors not expanded here: ${String(Math.max(0, errors.length - ERROR_PREVIEW_COUNT))}; complete case: ${route.file}; complete steps: ${route.stepFile}`,
        ];
      }),
      "All unexpected case routes are listed above; original error details remain in the complete case files.",
    ];
    writeFileSync(join(this.root, SURFACE_AGENT_SUMMARY), `${summary.join("\n")}\n`, { mode: 0o600 });
  }
}
