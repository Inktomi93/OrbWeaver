// The one projection from raw process arguments to what a file may hold. Selectors, routes and flag names stay, so a
// report still reads what the run did; the value an operator typed does not. The session socket and the parser keep
// the raw argv: those are the operation, and neither reaches a file.
import { splitFirstEq, splitPageSuffix, splitSelectorEq } from "../../floor/instrument/argv.ts";
import type { DiskSafeArgv, DiskSafeOp, DiskSafeUrl } from "../contract/disk-safe-argv.ts";
import { PRIVATE_MASK } from "../contract/disk-safe-argv.ts";
import { isSensitiveEvidenceName } from "./har-redaction.ts";
import { privateText } from "./private-values.ts";

type ValueMask = (value: string) => string;

const maskWhole: ValueMask = () => PRIVATE_MASK;

const SCHEME_AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\//iu;
// The last `@` before the path ends the userinfo, as the URL parser reads it.
const USERINFO = /^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/iu;

function sensitivePairName(encoded: string): boolean {
  // URLSearchParams decodes as the query parser does, and leaves a malformed escape as written instead of throwing.
  return isSensitiveEvidenceName([...new URLSearchParams(`${encoded}=`).keys()][0] ?? encoded);
}

/** The query between the first `?` and the fragment, each sensitive pair's value masked and every other byte kept. */
function maskQuery(url: string): string {
  const start = url.indexOf("?");
  if (start < 0) {
    return url;
  }
  const hash = url.indexOf("#", start);
  const end = hash < 0 ? url.length : hash;
  const pairs = url.slice(start + 1, end).split("&");
  const masked = pairs.map((pair) => {
    const eq = pair.indexOf("=");
    return eq >= 0 && sensitivePairName(pair.slice(0, eq)) ? `${pair.slice(0, eq)}=${PRIVATE_MASK}` : pair;
  });
  return `${url.slice(0, start + 1)}${masked.join("&")}${url.slice(end)}`;
}

function decodedUserinfo(encoded: string): string {
  // the encoded form is still noted, because spellingsOf adds every encoding of the decoded one; a malformed escape is
  // noted as written. Ends if a caller needs to know the escape was malformed.
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

/**
 * Mask a URL's userinfo and its sensitive query values, keeping the operator's spelling of everything else. The only
 * mint of {@link DiskSafeUrl}. Idempotent, so a stored binding can be read back through it.
 */
export function diskSafeUrl(raw: string): DiskSafeUrl {
  // A file path has no authority, so nothing in it is userinfo; an `@` in a package path stays.
  if (!SCHEME_AUTHORITY.test(raw)) {
    return raw as DiskSafeUrl;
  }
  return maskQuery(raw.replace(USERINFO, `$1${PRIVATE_MASK}@`)) as DiskSafeUrl;
}

/**
 * Note what `url` carries in private before it reaches the browser: the password, the basic-auth pair a browser sends
 * for it, and each sensitive query value. Page text, evidence and traces that echo them are then scrubbed by value.
 */
export function noteUrlSecrets(url: string): void {
  const parsed = URL.parse(url);
  if (parsed === null) {
    return;
  }
  const password = decodedUserinfo(parsed.password);
  if (password !== "") {
    privateText(password).reveal();
    privateText(Buffer.from(`${decodedUserinfo(parsed.username)}:${password}`).toString("base64")).reveal();
  }
  for (const [name, value] of parsed.searchParams) {
    if (isSensitiveEvidenceName(name)) {
      privateText(value).reveal();
    }
  }
}

function maskTail(split: (raw: string) => { readonly head: string; readonly tail: string } | null): ValueMask {
  return (value) => {
    const pair = split(value);
    return pair === null ? PRIVATE_MASK : `${pair.head}=${PRIVATE_MASK}`;
  };
}

/** The flags whose value is the operator's private text, each with the part of it that is provenance. */
const PRIVATE_VALUE_FLAGS: ReadonlyMap<string, ValueMask> = new Map([
  ["--base", diskSafeUrl],
  ["--debug-token", maskWhole],
  ["--fill", maskTail(splitSelectorEq)],
  ["--fixture-base", diskSafeUrl],
  ["--local-storage", maskTail(splitFirstEq)],
]);

/** A spelled `--flag=value` is an unknown flag the parser refuses, but a refused run still writes its index. */
function maskInlineValue(token: string): string {
  const flag = [...PRIVATE_VALUE_FLAGS.keys()].find((name) => token.startsWith(`${name}=`));
  return flag === undefined ? token : `${flag}=${PRIVATE_MASK}`;
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

/** An op read back from a stored row. It goes through the projection again, so a hand-edited or older row cannot carry a value. */
export function storedDiskSafeOp(text: string): DiskSafeOp {
  return diskSafeOp(text.split(" "), text);
}
