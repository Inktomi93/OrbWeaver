// The `pnpm unwired` verbs. `ports` writes the restated-port targets the derive codemod reads; the bare verb runs
// both reference engines over every world and writes the unwired members.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { DELIBERATE } from "./deliberate.ts";
import type { Leg } from "./port-census.ts";
import { LEGS, portCensus } from "./port-census.ts";
import { scanUnwired } from "./scan.ts";
import { TEST_WORLDS } from "./worlds.ts";

const USAGE = "usage: pnpm unwired [--root=<dir>] [--out=<file>] | pnpm unwired ports [--root=<dir>] [--out=<file>] [--leg=<B|C|D|E|F>]";
const DEFAULT_PORTS_OUT = "reports/unwired/port-targets.json";
const DEFAULT_SCAN_OUT = "reports/unwired/unwired.json";

interface Args {
  readonly verb: "scan" | "ports";
  readonly root: string;
  readonly out: string | null;
  readonly leg: Leg | null;
}

function parseArgs(argv: readonly string[]): Args {
  const [first] = argv;
  const verb = first === "ports" ? "ports" : "scan";
  const flags = new Map<string, string>();
  for (const arg of verb === "ports" ? argv.slice(1) : argv) {
    const match = /^--(root|out|leg)=(.+)$/u.exec(arg);
    if (match === null) {
      throw new UsageError(`${arg}: unknown argument\n${USAGE}`);
    }
    flags.set(match[1] ?? "", match[2] ?? "");
  }
  const leg = flags.get("leg") ?? null;
  if (leg !== null && !(LEGS as readonly string[]).includes(leg)) {
    throw new UsageError(`--leg=${leg}: expected one of ${LEGS.join(", ")}`);
  }
  return { verb, root: resolve(flags.get("root") ?? process.cwd()), out: flags.get("out") ?? null, leg: leg as Leg | null };
}

function write(root: string, out: string, body: unknown): string {
  const path = resolve(root, out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 1)}\n`);
  return path;
}

const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

export async function runUnwired(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.verb === "ports") {
    const census = portCensus(args.root, log);
    const targets = args.leg === null ? census.targets : census.targets.filter((target) => target.leg === args.leg);
    const path = write(args.root, args.out ?? DEFAULT_PORTS_OUT, { worlds: census.worlds, targets });
    const counts = new Map<string, number>();
    for (const target of targets) {
      const key = `${target.leg} ${target.kind}`;
      counts.set(key, (counts.get(key) ?? 0) + target.members.length);
    }
    for (const [key, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
      log(`${key}: ${count}`);
    }
    log(`targets=${targets.length} written to ${path}`);
    return EXIT.clean;
  }
  const report = await scanUnwired({
    root: args.root,
    testWorlds: TEST_WORLDS.filter((config) => existsSync(join(args.root, config))),
    deliberate: DELIBERATE,
    log,
  });
  const path = write(args.root, args.out ?? DEFAULT_SCAN_OUT, report);
  for (const member of report.unwired) {
    process.stdout.write(`${member.kind}	${member.file}:${member.line}	${member.home}.${member.member}
`);
  }
  log(
    `scanned=${report.scanned} unwired=${report.unwired.length} deliberate=${report.deliberate.length} disagreements=${report.disagreements.length} written to ${path}`,
  );
  return EXIT.clean;
}
