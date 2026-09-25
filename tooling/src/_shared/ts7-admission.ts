// The whole-program typecheck host pool: every scripts/ts7.ts run that builds a program takes one of
// `ts7RunnersHostWide` host slots, so checkouts that each size a multi-GB typecheck to the machine cannot
// exhaust its memory together. An advisory caller asks with `ORB_TS7_ADMISSION=try` and is told "busy".
import { basename } from "node:path";
import { readConcurrencyProfile, readStageBudgets } from "./concurrency-profile.ts";
import type { HostSlotDeps, HostSlotLease } from "./host-slots.ts";
import { acquireHostSlot, tryAcquireHostSlot } from "./host-slots.ts";
import { processEnvValue } from "./process-env.ts";

/** The env switch an advisory caller sets on its ts7 child. Spelled ONCE; the edit hook imports it. */
export const TS7_ADMISSION_ENV = "ORB_TS7_ADMISSION";

/** `queue` waits for a slot in arrival order (the default); `try` takes a free slot or exits busy. */
export const TS7_ADMISSION_MODES = ["queue", "try"] as const;
export type Ts7AdmissionMode = (typeof TS7_ADMISSION_MODES)[number];

/** The exit a `try` run takes when every slot is held: EX_TEMPFAIL, apart from tsc's own exits and the
 *  wrapper's abnormal-child exit, so a caller can tell "skipped" from a verdict. */
export const TS7_SLOT_BUSY_EXIT = 75;

/** tsc flags that answer without building a program (compared case-insensitively, as tsc does); a run
 *  carrying one takes no slot. */
const NO_PROGRAM_FLAGS: ReadonlySet<string> = new Set(["--version", "-v", "--help", "-h", "-?", "--all", "--init", "--showconfig"]);

/** The host pool's name: its directory is `<runtime>/orb-ts7-slots/`. */
export const TS7_POOL_NAME = "ts7";

/** PURE: which admission mode a raw env value names. An unknown value refuses rather than silently
 *  queueing, because a caller that asked to be told "busy" and is made to wait instead hangs its user. */
export function ts7AdmissionModeFor(raw: string | undefined): Ts7AdmissionMode {
  const value = (raw ?? "").trim();
  if (value === "" || value === "queue") {
    return "queue";
  }
  if (value === "try") {
    return "try";
  }
  throw new Error(
    `${TS7_ADMISSION_ENV}="${raw ?? ""}" is not an admission mode — leave it unset (queue for a host typecheck slot) or set it to "try" (take a free slot or exit ${String(TS7_SLOT_BUSY_EXIT)}).`,
  );
}

/** PURE: does this tsc argv build a program? */
export function buildsProgram(args: readonly string[]): boolean {
  return !args.some((arg) => NO_PROGRAM_FLAGS.has(arg.toLowerCase()));
}

/** PURE: the label a slot file records — the program and the checkout, so an operator reading the pool
 *  sees which typecheck holds it. */
export function ts7SlotLabel(args: readonly string[], cwd: string): string {
  const at = args.findIndex((arg) => arg === "-p" || arg.toLowerCase() === "--project");
  const program = at === -1 ? "tsconfig.json" : (args[at + 1] ?? "tsconfig.json");
  return `ts7 -p ${program} in ${basename(cwd)}`;
}

/** What a ts7 run may do: build no program and take no slot, run under a lease it must release, or stand
 *  down because every slot is held (a `try` caller only). */
export type Ts7Admission =
  | { readonly kind: "unpooled" }
  | { readonly kind: "admitted"; readonly lease: HostSlotLease }
  | { readonly kind: "busy"; readonly slots: number };

export interface Ts7AdmissionOptions {
  readonly label: string;
  /** The box switch and admission mode come from here; absent means the ambient process environment. */
  readonly env?: NodeJS.ProcessEnv;
  readonly deps?: HostSlotDeps;
}

/** THE DOOR scripts/ts7.ts calls before it spawns the compiler. */
export async function admitTs7Run(args: readonly string[], options: Ts7AdmissionOptions): Promise<Ts7Admission> {
  const read = (key: string): string | undefined => (options.env === undefined ? processEnvValue(key) : options.env[key]);
  const mode = ts7AdmissionModeFor(read(TS7_ADMISSION_ENV));
  if (!buildsProgram(args)) {
    return { kind: "unpooled" };
  }
  const slots = readConcurrencyProfile(options.env).ts7RunnersHostWide;
  const pool = { name: TS7_POOL_NAME, label: options.label, slots };
  if (mode === "try") {
    const lease = tryAcquireHostSlot(pool, options.deps);
    return lease === null ? { kind: "busy", slots } : { kind: "admitted", lease };
  }
  const lease = await acquireHostSlot({ ...pool, waitBaseMs: readStageBudgets(options.env).ts7HostWaitMs }, options.deps);
  return { kind: "admitted", lease };
}
