// The one projection from raw process arguments to what a file may hold. Selectors, routes and flag names stay, so a
// report still reads what the run did; the value an operator typed does not. The session socket and the parser keep
// the raw argv: those are the operation, and neither reaches a file.
import { splitFirstEq, splitPageSuffix, splitSelectorEq } from "../../floor/instrument/argv.ts";
import type { DiskSafeArgv, DiskSafeOp } from "../contract/disk-safe-argv.ts";

const PRIVATE_VALUE_MASK = "<private>";

type ValueMask = (value: string) => string;

const maskWhole: ValueMask = () => PRIVATE_VALUE_MASK;

function maskTail(split: (raw: string) => { readonly head: string; readonly tail: string } | null): ValueMask {
  return (value) => {
    const pair = split(value);
    return pair === null ? PRIVATE_VALUE_MASK : `${pair.head}=${PRIVATE_VALUE_MASK}`;
  };
}

/** The flags whose value is the operator's private text, each with the part of it that is provenance. */
const PRIVATE_VALUE_FLAGS: ReadonlyMap<string, ValueMask> = new Map([
  ["--debug-token", maskWhole],
  ["--fill", maskTail(splitSelectorEq)],
  ["--local-storage", maskTail(splitFirstEq)],
]);

/** A spelled `--flag=value` is an unknown flag the parser refuses, but a refused run still writes its index. */
function maskInlineValue(token: string): string {
  const flag = [...PRIVATE_VALUE_FLAGS.keys()].find((name) => token.startsWith(`${name}=`));
  return flag === undefined ? token : `${flag}=${PRIVATE_VALUE_MASK}`;
}

/** Mask every private value in `argv`. Idempotent, so a stored argv can be read back through it. */
export function diskSafeArgv(argv: readonly string[]): DiskSafeArgv {
  const projected: string[] = [];
  let mask: ValueMask | undefined;
  for (const token of argv) {
    projected.push(mask === undefined ? maskInlineValue(token) : mask(token));
    mask = mask === undefined ? PRIVATE_VALUE_FLAGS.get(splitPageSuffix(token).flag) : undefined;
  }
  return projected as unknown as DiskSafeArgv;
}

/** The one-line name of a session request: its masked arguments, or `fallback` for a request that carries none. */
export function diskSafeOp(argv: readonly string[], fallback: string): DiskSafeOp {
  return (diskSafeArgv(argv).join(" ") || fallback) as DiskSafeOp;
}
