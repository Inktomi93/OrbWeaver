// Diffs the two capture arms. Structure AND the identity-bearing BYTES: the classes below all live in
// `content`, so the old blanket content mask made every one of them invisible (see
// docs/history/design/st-message-shaping-atlas.md §Comparator masking, which defines this file's compare set).
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ORB_OUTPUT_DIR, ST_OUTPUT_DIR } from "./rig-paths.ts";

/** A leading `Name: ` speaker stamp — the shape both arms use to carry attribution inside content. */
const LEADING_LABEL = /^([^\n:]{1,40}): /;

/** An ST wire message/tool as generate-goldens.ts captured it. */
type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [k: string]: JsonValue };
type WireObject = { readonly [k: string]: JsonValue };

/** ST's Claude wire carries `content` as an array of typed blocks; ours carries a plain string. */
type WirePayload = {
  readonly messages?: readonly WireObject[];
  readonly tools?: readonly WireObject[];
  readonly system?: JsonValue;
  readonly [k: string]: JsonValue | undefined;
};
/** `generate-goldens.ts`'s output envelope (ST arm) — the captured body sits under `payload`. */
type StCapture = {
  readonly payload?: WirePayload;
  // biome-ignore lint/style/useNamingConvention: verbatim key from the ST arm's on-disk capture envelope.
  readonly captured_at?: string;
  readonly model?: string;
};
/** An `orbweaver-output/` file — the raw outbound body, no envelope. Its producer (`capture-orbweaver.ts`) is
 *  deleted, so every file here is historical (README "The ORB arm"). */
type OrbCapture = WirePayload;

/** ST's per-model sampling vocabulary vs ours. Compared as a normalized pair, never key-by-key: the two
 *  wires legitimately spell the same knob differently, and a raw key diff reports only that. */
const SAMPLING_KEYS = ["temperature", "top_p", "top_k", "stop_sequences", "stream"] as const;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

/** Flatten one wire message's content to the plain text a human would read, PRESERVING every byte that
 *  carries identity — name prefixes, merge separators, spliced placeholders. Block arrays are joined with
 *  a sentinel rather than "" so a stage-3 structural join stays distinguishable from a stage-2 `\n\n`. */
const BLOCK_JOIN = "␞"; // ␞ — cannot occur in prose, so it never collides with real content
function contentText(content: JsonValue | undefined): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return (content as readonly JsonValue[])
      .map((b) => {
        if (b !== null && typeof b === "object" && !Array.isArray(b)) {
          const block = b as { readonly [k: string]: JsonValue };
          const kind = block["type"];
          return typeof block["text"] === "string" ? block["text"] : `<${typeof kind === "string" ? kind : "block"}>`;
        }
        return JSON.stringify(b);
      })
      .join(BLOCK_JOIN);
  }
  return content === undefined ? "" : JSON.stringify(content);
}

/** The identity classes the atlas proved matter. Reported per message so a diff names WHAT differs, not
 *  just THAT something does. */
function identityOf(msg: WireObject): Record<string, string | number | boolean> {
  const text = contentText(msg["content"]);
  const leadingLabel = LEADING_LABEL.exec(text);
  return {
    role: typeof msg["role"] === "string" ? msg["role"] : "<none>",
    nameField: typeof msg["name"] === "string" ? msg["name"] : "<none>",
    // The `Name: ` stamp ST folds into content (mergeMessages) and we may emit as a prefix.
    inlineLabel: leadingLabel?.[1] ?? "<none>",
    blocks: Array.isArray(msg["content"]) ? (msg["content"] as readonly JsonValue[]).length : 1,
    // Stage-2 (textual) vs stage-3 (structural) joins are different facts; count both.
    blankLineJoins: text.split("\n\n").length - 1,
    blockJoins: text.split(BLOCK_JOIN).length - 1,
    // ST's strict splice. Matched by SHAPE, never by the literal — it is host-configurable
    // (`promptPlaceholder`, prompt-converters.js:4), so a hardcoded string would silently stop matching.
    looksLikePlaceholder: text.length > 0 && text.length < 40 && !text.includes("\n"),
    chars: text.length,
  };
}

function diffRow(label: string, st: unknown, orb: unknown): string | null {
  const a = JSON.stringify(st);
  const b = JSON.stringify(orb);
  return a === b ? null : `      ${label}: ST=${a} ORB=${b}`;
}

function compareMessages(stMessages: readonly WireObject[], orbMessages: readonly WireObject[]): string[] {
  const out: string[] = [];
  const n = Math.max(stMessages.length, orbMessages.length);
  for (let i = 0; i < n; i++) {
    const st = stMessages[i];
    const orb = orbMessages[i];
    if (st === undefined || orb === undefined) {
      out.push(`   [${i}] present on ${st === undefined ? "ORB" : "ST"} only`);
      continue;
    }
    const a = identityOf(st);
    const b = identityOf(orb);
    const rows = Object.keys(a)
      .map((k) => diffRow(k, a[k], b[k]))
      .filter((r): r is string => r !== null);
    if (rows.length > 0) {
      out.push(`   [${i}]`, ...rows);
    }
  }
  return out;
}

function compareTools(stTools: readonly WireObject[], orbTools: readonly WireObject[]): string[] {
  if (stTools.length !== orbTools.length) {
    return [`   tools: count ST=${stTools.length} ORB=${orbTools.length}`];
  }
  // ST emits Anthropic-native tools; we emit the OpenAI envelope. Normalize ST onto ours before diffing.
  const normalized = stTools.map((t) => ({
    function: { description: t["description"], name: t["name"], parameters: t["input_schema"] },
    type: "function",
  }));
  const a = JSON.stringify(normalized);
  const b = JSON.stringify(orbTools);
  return a === b ? [] : [`   tools: ST=${a}`, `          ORB=${b}`];
}

function runCompare(): void {
  if (!(fs.existsSync(ST_OUTPUT_DIR) && fs.existsSync(ORB_OUTPUT_DIR))) {
    console.error(`Missing capture dir (ST=${ST_OUTPUT_DIR} ORB=${ORB_OUTPUT_DIR}). Run a sweep first.`);
    process.exitCode = 2;
    return;
  }
  const stFiles = fs.readdirSync(ST_OUTPUT_DIR).filter((f) => f.endsWith(".json"));
  // A scope that matched nothing is an ERROR, not a clean result — a silent zero here reads as "parity".
  if (stFiles.length === 0) {
    console.error(`No ST captures in ${ST_OUTPUT_DIR} — nothing was compared.`);
    process.exitCode = 2;
    return;
  }
  let mismatches = 0;
  let missing = 0;

  for (const stFile of stFiles) {
    const stData = readJson<StCapture>(path.join(ST_OUTPUT_DIR, stFile));
    const fixtureId = stFile.replace(".json", "");
    const orbFiles = fs.readdirSync(ORB_OUTPUT_DIR).filter((f) => f.endsWith(`_${stFile}`));

    if (orbFiles.length === 0) {
      console.log(`[Missing] ${fixtureId} — no Orbweaver capture`);
      missing++;
      continue;
    }

    const orbPath = path.join(ORB_OUTPUT_DIR, orbFiles[0] as string);
    const orbData = readJson<OrbCapture>(orbPath);
    const st = stData.payload ?? {};

    const lines: string[] = [];

    // Both arms accumulate now (no wipe), so a pairing can straddle two sweeps. Say so rather than let a
    // stale arm masquerade as a parity result — the exact confusion that cost a full analysis pass.
    const stAge = stData.captured_at;
    const orbAge = fs.statSync(orbPath).mtime.toISOString();
    if (stAge !== undefined && Math.abs(Date.parse(stAge) - Date.parse(orbAge)) > 6 * 60 * 60 * 1000) {
      lines.push(`   [stale] arms captured >6h apart: ST=${stAge} ORB=${orbAge}`);
    }

    // The wire model, not the requested one — ST silently reverts a model it no longer lists, and four
    // goldens shipped mislabelled that way.
    const modelRow = diffRow("model", stData.model, st["model"]);
    if (modelRow !== null) {
      lines.push("   [requested vs sent]", modelRow);
    }

    // System PLACEMENT is a shaping fact: ST omits `system` entirely when use_sysprompt is off and folds
    // the card into the first user message instead.
    const stSystem = st["system"] !== undefined;
    const orbSystem = (orbData["messages"] ?? []).some((m) => m["role"] === "system");
    if (stSystem !== orbSystem) {
      lines.push(`   system placement: ST top-level system param=${stSystem} · ORB system-role message=${orbSystem}`);
    }

    for (const k of SAMPLING_KEYS) {
      const row = diffRow(`sampling.${k}`, st[k], orbData[k]);
      if (row !== null) {
        lines.push(row);
      }
    }

    lines.push(...compareTools(st.tools ?? [], orbData.tools ?? []));
    lines.push(...compareMessages(st.messages ?? [], orbData.messages ?? []));

    if (lines.length === 0) {
      console.log(`[Match] ${fixtureId}`);
    } else {
      console.log(`[Diff] ${fixtureId}`);
      for (const l of lines) {
        console.log(l);
      }
      mismatches++;
    }
  }

  console.log(`\n${stFiles.length} compared · ${mismatches} with differences · ${missing} unpaired.`);
}

runCompare();
