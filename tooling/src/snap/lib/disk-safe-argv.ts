// The one projection from raw process arguments to what a file may hold. Selectors, routes and flag names stay, so a
// report still reads what the run did; the value an operator typed does not. The session socket and the parser keep
// the raw argv: those are the operation, and neither reaches a file.
import { splitFirstEq, splitPageSuffix, splitSelectorEq } from "../../floor/instrument/argv.ts";
import type { DiskSafeArgv, DiskSafeOp, DiskSafeUrl, PrivateText } from "../contract/disk-safe-argv.ts";
import { PRIVATE_MASK } from "../contract/disk-safe-argv.ts";
import { isSensitiveEvidenceName } from "./har-redaction.ts";
import { privateText } from "./private-values.ts";

type ValueMask = (value: string) => string;

const maskWhole: ValueMask = () => PRIVATE_MASK;

// The schemes whose authority the URL parser reads after any run of `/` and `\`, so `http:\h` and `http:h` are `http://h/`.
const SPECIAL_SCHEMES: ReadonlySet<string> = new Set(["ftp:", "file:", "http:", "https:", "ws:", "wss:"]);
// The URL parser drops these anywhere in its input, so `ht<TAB>tp:` is `http:` and `to<TAB>ken` is `token`.
const PARSER_DROPPED = /[\t\n\r]/gu;

// Private only as whole URL pair names: `?key=` is the usual API-key spelling and `?code=` an OAuth code. The shared
// predicate stays without them, because it also judges JSON keys, where `code` and `key` are ordinary fields.
const URL_ONLY_SENSITIVE_NAMES: ReadonlySet<string> = new Set(["key", "code"]);

function sensitiveUrlPairName(name: string): boolean {
  return URL_ONLY_SENSITIVE_NAMES.has(name.toLowerCase()) || isSensitiveEvidenceName(name);
}

function sensitivePairName(encoded: string): boolean {
  // URLSearchParams decodes as the query parser does, and leaves a malformed escape as written instead of throwing.
  const name = encoded.replace(PARSER_DROPPED, "");
  return sensitiveUrlPairName([...new URLSearchParams(`${name}=`).keys()][0] ?? name);
}

function maskPairs(section: string): string {
  return section
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      return eq >= 0 && sensitivePairName(pair.slice(0, eq)) ? `${pair.slice(0, eq)}=${PRIVATE_MASK}` : pair;
    })
    .join("&");
}

/** The query and the fragment (`#access_token=…`), each sensitive pair's value masked and every other byte kept. */
function maskQueryAndFragment(url: string): string {
  const hash = url.indexOf("#");
  const beforeHash = hash < 0 ? url : url.slice(0, hash);
  const fragment = hash < 0 ? "" : `#${maskPairs(url.slice(hash + 1))}`;
  const query = beforeHash.indexOf("?");
  return query < 0 ? `${beforeHash}${fragment}` : `${beforeHash.slice(0, query + 1)}${maskPairs(beforeHash.slice(query + 1))}${fragment}`;
}

const LAST_STRIPPED_CODE = 0x20;

/** How many leading characters the URL parser strips: C0 controls and the space. */
function strippedLeadLength(raw: string): number {
  let length = 0;
  while (length < raw.length && raw.charCodeAt(length) <= LAST_STRIPPED_CODE) {
    length += 1;
  }
  return length;
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
  const lead = strippedLeadLength(raw);
  // The query is masked even where the parser reads `raw` only against a base: navigation resolves it, token and all.
  return `${raw.slice(0, lead)}${maskQueryAndFragment(maskUserinfo(raw.slice(lead)))}` as DiskSafeUrl;
}

// What the parser skips between a scheme and its authority, and what ends the authority, per scheme kind.
const SPECIAL_SKIPPED = "/\\\t\n\r";
const PLAIN_SKIPPED = "/\t\n\r";
const SPECIAL_AUTHORITY_END = "/\\?#";
const PLAIN_AUTHORITY_END = "/?#";

/**
 * Mask the userinfo the URL parser reads in `url`, in the operator's spelling. A value the parser cannot read alone, a
 * file path among them, has no authority, so an `@` in a package path stays.
 */
function maskUserinfo(url: string): string {
  const parsed = URL.parse(url);
  if (parsed === null || (parsed.username === "" && parsed.password === "")) {
    return url;
  }
  const special = SPECIAL_SCHEMES.has(parsed.protocol);
  const skipped = special ? SPECIAL_SKIPPED : PLAIN_SKIPPED;
  const authorityEnd = special ? SPECIAL_AUTHORITY_END : PLAIN_AUTHORITY_END;
  let start = url.indexOf(":") + 1;
  while (start < url.length && skipped.includes(url.charAt(start))) {
    start += 1;
  }
  let end = start;
  while (end < url.length && !authorityEnd.includes(url.charAt(end))) {
    end += 1;
  }
  // The last `@` before the path ends the userinfo, as the URL parser reads it.
  const at = url.lastIndexOf("@", end - 1);
  return at < start ? url : `${url.slice(0, start)}${PRIVATE_MASK}${url.slice(at)}`;
}

/** Whether `raw` names userinfo the URL parser would send: snap refuses it, so a credential is never an argument. */
export function urlCarriesCredentials(raw: string): boolean {
  const parsed = URL.parse(raw.slice(strippedLeadLength(raw)));
  return parsed !== null && (parsed.username !== "" || parsed.password !== "");
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
  for (const [name, value] of [...parsed.searchParams, ...new URLSearchParams(parsed.hash.slice(1))]) {
    if (sensitiveUrlPairName(name)) {
      privateText(value).reveal();
    }
  }
}

/**
 * Reveal `--base-credentials-env`'s `user:password` for the browser's basic-auth answer, noting the password and the
 * base64 pair the browser sends, so a trace or HAR that records the header is scrubbed by value.
 */
export function revealBasicCredentials(credentials: PrivateText): { readonly username: string; readonly password: string } {
  const pair = credentials.reveal();
  const colon = pair.indexOf(":");
  const password = pair.slice(colon + 1);
  privateText(password).reveal();
  privateText(Buffer.from(pair).toString("base64")).reveal();
  return { username: pair.slice(0, colon), password };
}

function maskTail(split: (raw: string) => { readonly head: string; readonly tail: string } | null): ValueMask {
  return (value) => {
    const pair = split(value);
    return pair === null ? PRIVATE_MASK : `${pair.head}=${PRIVATE_MASK}`;
  };
}

/** The flags whose value is a URL snap navigates or probes. Parse refuses userinfo on each; argv masks each. */
export const URL_VALUE_FLAGS = ["--base", "--fixture-base", "--fixture-server"] as const;

/** The flags whose value is the operator's private text, each with the part of it that is provenance. */
const PRIVATE_VALUE_FLAGS: ReadonlyMap<string, ValueMask> = new Map([
  ...URL_VALUE_FLAGS.map((flag): readonly [string, ValueMask] => [flag, diskSafeUrl]),
  ["--debug-token", maskWhole],
  ["--fill", maskTail(splitSelectorEq)],
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
