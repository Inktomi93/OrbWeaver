// pnpm's native workspace configuration owns the heap default; explicit Node startup options keep precedence.
import { readFileSync } from "node:fs";
import process from "node:process";
import { parse } from "yaml";
import { z } from "zod";
import { exportProcessEnv, inheritedProcessEnv, processEnvValue } from "./process-env.ts";

const NODE_OPTIONS = "NODE_OPTIONS";
const WORKSPACE = new URL("../../../../pnpm-workspace.yaml", import.meta.url);
const workspaceSchema = z.object({ nodeOptions: z.string().min(1) });
const HEAP_OPTION = /^--max[-_](?:old[-_]space[-_]size(?:[-_]percentage)?|heap[-_]size)(?:=|$)/u;

function optionWords(text: string): string[] {
  const words: string[] = [];
  let word = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text.charAt(index);
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === "\\" && quoted) {
      word += text.charAt(++index);
      continue;
    }
    if (/\s/u.test(character) && !quoted) {
      words.push(word);
      word = "";
      continue;
    }
    word += character;
  }
  if (quoted) {
    throw new Error("Node heap startup has unterminated NODE_OPTIONS quotes");
  }
  if (word !== "") {
    words.push(word);
  }
  return words.filter((entry) => entry !== "");
}

function hasHeapOption(words: readonly string[]): boolean {
  return words.some((word) => HEAP_OPTION.test(word));
}

/** Establish the child environment before any runtime receipt captures its native startup context. */
export function ensureNodeHeapEnvironment(): boolean {
  const options = processEnvValue(NODE_OPTIONS) ?? "";
  if (hasHeapOption(process.execArgv) || hasHeapOption(optionWords(options))) {
    return false;
  }
  const configured = workspaceSchema.parse(parse(readFileSync(WORKSPACE, "utf8"))).nodeOptions;
  if (!hasHeapOption(optionWords(configured))) {
    throw new Error("pnpm-workspace.yaml nodeOptions must supply the native Node heap default");
  }
  exportProcessEnv(NODE_OPTIONS, [options, configured].filter(Boolean).join(" "));
  return true;
}

/** Replace the cold entry before operational imports; same PID retains terminal and supervisor signals. */
export function reexecWithNodeHeapFloor(argv: readonly string[]): void {
  if (!ensureNodeHeapEnvironment()) {
    return;
  }
  if (process.execve === undefined) {
    throw new Error(`native Node heap reexec is unavailable; use pnpm or start Node with NODE_OPTIONS=${JSON.stringify(processEnvValue(NODE_OPTIONS))}`);
  }
  process.execve(process.execPath, [process.execPath, ...process.execArgv, ...argv], inheritedProcessEnv());
}
