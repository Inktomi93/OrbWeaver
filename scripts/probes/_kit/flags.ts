// Shared argv idioms for the browser probes (scripts/probes/*). Each probe OWNS its flag
// table + parse loop — the vocabularies differ (snap's --press/--wait-for vs record's
// --wheel/--pause) and a shared table would force a lowest-common-denominator. What _kit
// centralizes is the three idioms every neo probe re-rolled by hand: the two `key=value`
// splits (FIRST vs LAST `=` — they are NOT interchangeable, see below), and the "WxH"
// viewport parse. Repeatable flags are just `array.push` in the probe loop; the positional
// route is just `!token.startsWith("--")` — neither earns a helper.

export type EqSplit = { readonly head: string; readonly tail: string };

export type Viewport = { readonly width: number; readonly height: number };

/**
 * Split on the LAST `=` — for `--fill "sel=value"` / `--key "sel=KeyName"`: SELECTORS
 * contain `=` (`[data-testid=x] input`), values rarely do. First-`=` splitting silently
 * mangled every attribute selector (neo lesson, snap.ts/record.ts/perf-meter.ts all carry
 * the same fix comment). No `=` → the whole string is `head`, `tail` is "".
 */
export function splitLastEq(raw: string): EqSplit {
  const eq = raw.lastIndexOf("=");
  if (eq === -1) {
    return { head: raw, tail: "" };
  }
  return { head: raw.slice(0, eq), tail: raw.slice(eq + 1) };
}

/**
 * Split on the FIRST `=` — for `--ls "key={json}"`: localStorage KEYS never contain `=`,
 * but persisted-store VALUES are JSON that often does (`{"state":{"a":"b=c"}}`). The
 * mirror-image constraint of `splitLastEq`. Returns null when there is no `=` or the key
 * would be empty (a seed without a key/value is a caller mistake — the probe skips it).
 */
export function splitFirstEq(raw: string): EqSplit | null {
  const eq = raw.indexOf("=");
  if (eq <= 0) {
    return null;
  }
  return { head: raw.slice(0, eq), tail: raw.slice(eq + 1) };
}

/** Parse `--viewport "WxH"` (e.g. "1920x1080"). Null on anything malformed or non-positive. */
export function parseViewport(raw: string): Viewport | null {
  const [w, h] = raw.split("x").map(Number);
  if (w && h && Number.isFinite(w) && Number.isFinite(h)) {
    return { width: w, height: h };
  }
  return null;
}
