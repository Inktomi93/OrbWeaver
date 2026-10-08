// Select diagnostics freeze the ordinary native shard before opt-in registrations can move its boundary.
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { runTool, UsageError } from "@orb/tooling/_shared/run-tool";
import type { NativeCtCase } from "../tooling/src/verify/contract/scoped-test.ts";
import { readNativeCtCases } from "../tooling/src/verify/lib/ct-listing.ts";

const DIAGNOSTIC_CASE_COUNT = 2;
const TEST_LIST_SEPARATOR = " › ";

function readCases(path: string): Exclude<ReturnType<typeof readNativeCtCases>, { readonly error: string }> {
  const read = readNativeCtCases({ status: 0, stdout: readFileSync(path, "utf8"), stderr: "" });
  if ("error" in read) {
    throw new Error(`${path}: ${read.error}`);
  }
  if (read.cases.length === 0) {
    throw new Error(`${path}: native CT case population is empty`);
  }
  return read;
}

function contextCases(ordinaryPath: string, optInPath: string): readonly NativeCtCase[] {
  const ordinary = readCases(ordinaryPath);
  const optIn = readCases(optInPath);
  if (ordinary.rootDir !== optIn.rootDir || ordinary.cases.some((row) => row.diagnosticOnly)) {
    throw new Error("ordinary CT shard must retain its native root and contain no diagnostic-only cases");
  }
  const diagnostics = optIn.cases.filter((row) => row.diagnosticOnly);
  if (diagnostics.length !== DIAGNOSTIC_CASE_COUNT) {
    throw new Error(`expected ${DIAGNOSTIC_CASE_COUNT} native diagnostic-only cases, got ${diagnostics.length}`);
  }
  const cases = [...ordinary.cases, ...diagnostics];
  if (new Set(cases.map(({ id }) => id)).size !== cases.length) {
    throw new Error("diagnostic context repeats a native case ID");
  }
  return cases;
}

function testListLine(row: NativeCtCase): string {
  const parts = [`[${row.project}]`, row.file, ...row.titlePath];
  if (parts.some((part) => part.includes("›") || /[\r\n]/u.test(part))) {
    throw new Error(`native test-list cannot represent case ${row.id} without ambiguous delimiters`);
  }
  return parts.join(TEST_LIST_SEPARATOR);
}

function verifyCases(expected: readonly NativeCtCase[], actual: readonly NativeCtCase[]): void {
  const byId = new Map(actual.map((row) => [row.id, row]));
  if (actual.length !== expected.length || expected.some((row) => JSON.stringify(byId.get(row.id)) !== JSON.stringify(row))) {
    throw new Error("native recollection differs from the complete selected context");
  }
}

interface ContextArguments {
  readonly mode: string;
  readonly ordinaryPath: string;
  readonly operands: readonly string[];
  readonly native: boolean;
}

function readArguments(): ContextArguments {
  const [mode, ordinaryPath, ...operands] = process.argv.slice(2);
  const native = mode === "create-native" || mode === "verify-native";
  if (mode === undefined || (mode !== "create" && mode !== "verify" && !native) || ordinaryPath === undefined || operands.length !== (native ? 1 : 2)) {
    throw new UsageError(
      "select-cpu-diagnostic-context requires create|verify <ordinary-report> <opt-in-report> <destination>, or create-native|verify-native <ordinary-report> <destination>",
    );
  }
  return { mode, ordinaryPath, operands, native };
}

await runTool(() => {
  const { mode, ordinaryPath, operands, native } = readArguments();
  const destination = operands.at(-1);
  if (destination === undefined) {
    throw new UsageError("select-cpu-diagnostic-context requires a destination");
  }
  const ordinary = readCases(ordinaryPath);
  const optInPath = operands[0];
  if (!native && optInPath === undefined) {
    throw new UsageError("select-cpu-diagnostic-context requires an opt-in report");
  }
  const expected = native ? ordinary.cases : contextCases(ordinaryPath, optInPath ?? "");
  if (native && expected.some((row) => row.diagnosticOnly)) {
    throw new Error("original native context must contain no diagnostic-only registrations");
  }
  if (mode === "create" || mode === "create-native") {
    writeFileSync(destination, `${expected.map(testListLine).join("\n")}\n`);
  } else {
    const actual = readCases(destination);
    if (native && actual.rootDir !== ordinary.rootDir) {
      throw new Error("original native context changed its native root");
    }
    verifyCases(expected, actual.cases);
  }
  const diagnosticCount = native ? 0 : DIAGNOSTIC_CASE_COUNT;
  process.stdout.write(
    `Select diagnostic context ${mode}: ${expected.length - diagnosticCount} ordinary + ${diagnosticCount} diagnostic-only native IDs, exactly once\n`,
  );
  return 0;
});
