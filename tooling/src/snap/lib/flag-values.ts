// The per-flag VALUE validators: given a flag and the raw token it was handed, say what is wrong with it.
// Pure and ops-free by construction (nothing here reads FLAG_HANDLERS or a flag CLASS — that is the
// scanner's job in ops/parse.ts), which is why they live in lib/: ops/parse.ts was over the tooling-size
// cap once the session flags and the arms flags both landed on it (Core-Tooling-Law.md §4.3, "pure logic
// to lib/"). Every function reports by PUSHING onto `errors`; none throws and none returns a verdict, so a
// single argv pass collects every refusal instead of dying on the first.
import { parseViewport, splitFirstEq, splitLastEq, splitSelectorEq } from "../../_shared/argv.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { LIGHTHOUSE_DEVICE_SPELLINGS, LIGHTHOUSE_MODE_SPELLINGS, parseLighthouseDevice, parseLighthouseMode } from "./lighthouse-report.ts";
import { CROP_RE } from "./out-names.ts";
import { selectorRefusalForFlag } from "./selector-shape.ts";
import { parseShotScale } from "./shot-scale.ts";
import { NETWORK_PROFILE_SPELLINGS, NO_CPU_THROTTLE, parseNetworkProfile } from "./throttle.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

function validateInteger(raw: string, flag: string, min: number, errors: string[]): void {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    errors.push(`${flag} expects an integer >= ${min}, got ${JSON.stringify(raw)}`);
  }
}

function validateNumericFlag(flag: string, raw: string, errors: string[]): void {
  if (flag === "--pages" || flag === "--contexts" || flag === "--every" || flag === "--aria-depth") {
    validateInteger(raw, flag, 1, errors);
    return;
  }
  if (flag === "--watch" || flag === "--stream-settle") {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`${flag} expects a non-negative number, got ${JSON.stringify(raw)}`);
    }
  }
  if (flag === "--pause") {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`--pause expects a non-negative duration in milliseconds, got ${JSON.stringify(raw)}`);
    }
  }
  // A fractional TTL is legal (a 0.05-minute calibration drive); zero or less is a session that never
  // idles out — the strand class the TTL exists to end — so it is refused, never defaulted.
  if (flag === "--session-ttl" && !(Number.isFinite(Number(raw)) && Number(raw) > 0)) {
    errors.push(`--session-ttl expects a positive number of minutes, got ${JSON.stringify(raw)}`);
  }
}

function validatePerfTapeFlagValue(flag: string, raw: string, errors: string[]): void {
  if (flag !== "--wheel" && flag !== "--wheel-burst") {
    return;
  }
  const { head, tail } = splitLastEq(raw);
  if (flag === "--wheel" && (head === "" || !Number.isFinite(Number(tail)))) {
    errors.push(`--wheel expects selector=finiteDeltaY, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--wheel-burst") {
    const [dy = "", count = ""] = tail.split(":");
    if (head === "" || !Number.isFinite(Number(dy)) || !Number.isInteger(Number(count)) || Number(count) < 1) {
      errors.push(`--wheel-burst expects selector=finiteDeltaY:positiveIntegerCount, got ${JSON.stringify(raw)}`);
    }
  }
}

/** The load-emulation arms REFUSE on a bad value instead of falling back to "no throttle": a run whose
 *  argv asked for 4× CPU and silently measured at 1× is a false rest-state receipt (#826). */
function validateLoadFlagValue(flag: string, raw: string, errors: string[]): void {
  if (flag === "--cpu-throttle" && !(Number.isFinite(Number(raw)) && Number(raw) >= NO_CPU_THROTTLE)) {
    errors.push(`--cpu-throttle expects a rate >= ${NO_CPU_THROTTLE} (1 = off, 4 = the standard load arm), got ${JSON.stringify(raw)}`);
  }
  if (flag === "--network" && parseNetworkProfile(raw) === null) {
    errors.push(`--network expects one of ${NETWORK_PROFILE_SPELLINGS.join(" | ")}, got ${JSON.stringify(raw)}`);
  }
}

/** The two MCP-retiring arms refuse a bad value rather than silently running the default arm: a run that
 *  asked for `--lighthouse mobile` and audited desktop is the same false-receipt class as a throttle flag
 *  that no-ops (#1198). */
function validateLighthouseFlagValue(flag: string, raw: string, errors: string[]): void {
  if (flag === "--lighthouse" && parseLighthouseDevice(raw) === null) {
    errors.push(`--lighthouse expects ${LIGHTHOUSE_DEVICE_SPELLINGS.join(" | ")}, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--lighthouse-mode" && parseLighthouseMode(raw) === null) {
    errors.push(`--lighthouse-mode expects ${LIGHTHOUSE_MODE_SPELLINGS.join(" | ")}, got ${JSON.stringify(raw)}`);
  }
}

function validateEvidenceFlagValue(flag: string, raw: string, errors: string[]): void {
  if (flag === "--viewport" && parseViewport(raw) === null) {
    errors.push(`--viewport expects positive WxH, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--crop" && !CROP_RE.test(raw)) {
    errors.push(`--crop expects WxH or WxH+X+Y, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--local-storage" && splitFirstEq(raw) === null) {
    errors.push(`--local-storage expects key=value with a non-empty key, got ${JSON.stringify(raw)}`);
  }
  // A rejected --scale must REFUSE, never fall back to the css default: a run that asked for device
  // pixels and silently produced CSS pixels is the same false-receipt class as the load-arm flags above.
  if (flag === "--scale" && parseShotScale(raw) === null) {
    errors.push(`--scale expects css | device | a number >= 1, got ${JSON.stringify(raw)}`);
  }
}

function validatePairFlagValue(flag: string, raw: string, errors: string[]): void {
  const split = splitLastEq(raw);
  // --fill splits on the FIRST '=' — its value is a JS literal that often contains '=' itself
  // (`--fill 'input=const a = 1;'`); LAST-'=' would misparse the selector and refuse.
  if (flag === "--fill" && splitSelectorEq(raw) === null) {
    errors.push(`--fill expects sel=value with a non-empty selector, got ${JSON.stringify(raw)}`);
  }
  // `--key Tab` (no '=') is the BARE-KEY form — a key name, not a selector. Only the pair form owes a
  // non-empty selector.
  if (flag === "--key" && raw.includes("=") && split.head === "") {
    errors.push(`--key expects selector=Key with a non-empty selector (or a bare key name), got ${JSON.stringify(raw)}`);
  }
  if (flag === "--expect-text" && (!raw.includes("=") || split.head === "")) {
    errors.push(`--expect-text expects selector=text, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--expect-count" && (!raw.includes("=") || split.head === "" || !Number.isInteger(Number(split.tail)) || Number(split.tail) < 0)) {
    errors.push(`--expect-count expects selector=nonNegativeInteger, got ${JSON.stringify(raw)}`);
  }
  if ((flag === "--upload" || flag === "--drop-files") && (!raw.includes("=") || split.head === "" || split.tail.trim() === "")) {
    errors.push(`${flag} expects selector=path[,path...] with a non-empty selector and at least one path, got ${JSON.stringify(raw)}`);
  }
  validateCascadePair(flag, raw, split, errors);
}

/** `--panel <name>=<mode>` (the same `<a>=<b>` shape --fill/--key/--expect-text use — a panel NAME never
 *  carries `=`) and `--focus <on|off>`, the one nav verb whose value is a bare boolean rather than a
 *  selector/pair. Own function so validatePairFlagValue and validateFlagValue's dispatch both stay under
 *  the biome cognitive-complexity cap. */
function validateShellNavFlagValue(flag: string, raw: string, errors: string[]): void {
  if (flag === "--panel") {
    const { head, tail } = splitLastEq(raw);
    if (head === "" || tail === "") {
      errors.push(`--panel expects name=mode, got ${JSON.stringify(raw)}`);
    }
  }
  if (flag === "--focus" && raw !== "on" && raw !== "off") {
    errors.push(`--focus expects on|off, got ${JSON.stringify(raw)}`);
  }
}

function validateCascadePair(flag: string, raw: string, split: { readonly head: string; readonly tail: string }, errors: string[]): void {
  if (flag !== "--cascade") {
    return;
  }
  if (!raw.includes("=") || split.head === "" || !/^(?:--[A-Za-z0-9_-]+|-?[A-Za-z][A-Za-z0-9-]*)$/u.test(split.tail)) {
    errors.push(`--cascade expects selector=css-property, got ${JSON.stringify(raw)}`);
  }
}

/** REFUSE a selector that can never match rather than letting it time out as a false "not rendered"
 *  (#550 — the whole reason lib/selector-shape.ts exists). */
export function validateSelectorFlagValue(flag: string, raw: string, errors: string[]): void {
  const refusal = selectorRefusalForFlag(flag, raw);
  if (refusal !== null) {
    errors.push(refusal);
  }
}

export function validateFlagValue(flag: string, raw: string, errors: string[]): void {
  if (raw === "" && flag !== "--debug-token") {
    errors.push(`${flag} requires a non-empty value`);
    return;
  }
  validateNumericFlag(flag, raw, errors);
  validateLoadFlagValue(flag, raw, errors);
  validateLighthouseFlagValue(flag, raw, errors);
  validateEvidenceFlagValue(flag, raw, errors);
  validatePerfTapeFlagValue(flag, raw, errors);
  validatePairFlagValue(flag, raw, errors);
  validateShellNavFlagValue(flag, raw, errors);
  validateSelectorFlagValue(flag, raw, errors);
}
