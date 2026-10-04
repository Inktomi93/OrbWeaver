// The embedding-width acceptance probe (work item 0507): drives a running local-auth stage over its real HTTP
// surface (tRPC, the chat import route, the login route) and reads the stage's own db read-only for the stored
// widths. Every step writes its raw responses to the archive directory; RESULTS.md cites them.
//
// Usage (see README.md):
//   node scripts/probes/embed-width/run.ts <verb> [args] --base http://127.0.0.1:<port> --db <stage db> --archive <dir>
// Verbs: seed · memory-on · bind <embedder> · race <embedder> <embedder> · badkey <embedder> · member <embedder> · state <label>

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { EMBEDDER_REBUILD_KINDS, embedderRebuildState } from "../../../packages/client/src/lib/embedder-rebuild.ts";

/** The hosted keys, read once: the operator exports them for the run and the probe never prints them. */
function probeKey(name: string): string {
  // biome-ignore lint/style/noProcessEnv: the probe's only config is its operator-exported keys, read at this one site.
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set`);
  }
  return value;
}

interface Opts {
  readonly base: string;
  readonly db: string;
  readonly archive: string;
}

/** How long one rebuild may take before the probe calls it stuck. */
const SETTLE_TIMEOUT_MS = 900_000;
const POLL_MS = 1000;
/** A row created this long before a step started still belongs to it (clock skew between probe and stage). */
const SINCE_SLACK_MS = 1000;
/** The seed's import queues its work before the probe starts watching. */
const SEED_LOOKBACK_MS = 60_000;
/** The race waits up to this many polls for the first rebuild to start running. */
const RACE_POLLS = 200;
const RACE_POLL_MS = 100;
const TOP_HITS = 3;
const SEARCH_TOP_N = 5;
const ERROR_EXCERPT = 600;
const ROW_EXCERPT = 240;
const OLLAMA_BASE_URL = "http://127.0.0.1:18434/v1";
const ACTIVE = new Set(["queued", "running", "cancelling"]);

/** One embedder arm: how the probe creates its connection. `existing` reuses the seeded built-in row. */
interface EmbedderSpec {
  readonly providerId: string;
  readonly model: string;
  readonly baseUrl: string | null;
  readonly dims?: number;
  readonly keyEnv?: string;
  readonly existing?: true;
}

const EMBEDDERS: Readonly<Record<string, EmbedderSpec>> = {
  "local-light-1024": { providerId: "local-light", model: "jinaai/jina-clip-v2", baseUrl: null, existing: true },
  "local-light-512": { providerId: "local-light", model: "jinaai/jina-clip-v2", baseUrl: null, dims: 512 },
  "ollama-nomic-768": { providerId: "ollama", model: "nomic-embed-text", baseUrl: OLLAMA_BASE_URL },
  "ollama-nomic-256": { providerId: "ollama", model: "nomic-embed-text", baseUrl: OLLAMA_BASE_URL, dims: 256 },
  "ollama-minilm-384": { providerId: "ollama", model: "all-minilm", baseUrl: OLLAMA_BASE_URL },
  "openai-3small-1536": { providerId: "openai", model: "text-embedding-3-small", baseUrl: null, keyEnv: "OPENAI_PROBE_KEY" },
  "openai-3small-512": { providerId: "openai", model: "text-embedding-3-small", baseUrl: null, dims: 512, keyEnv: "OPENAI_PROBE_KEY" },
  "openrouter-bge-768": { providerId: "openrouter", model: "baai/bge-base-en-v1.5", baseUrl: null, keyEnv: "OPENROUTER_PROBE_KEY" },
};

const CARDS = [
  {
    handle: "maren-vos",
    name: "Maren Vos",
    description: "Maren Vos keeps the lighthouse on a storm-battered northern coast, trims the lamp wick every dusk and logs every ship.",
  },
  {
    handle: "ilyas-thorne",
    name: "Ilyas Thorne",
    description: "Ilyas Thorne is a desert botanist who grows cactus gardens under glass domes and maps underground water.",
  },
  {
    handle: "corvin-gearheart",
    name: "Corvin Gearheart",
    description: "Corvin Gearheart is a clockwork knight of brass and springs who must be wound with a silver key each dawn.",
  },
] as const;

const DOC_NAME = "Ostrel harbour tides";
const DOC_TEXT = [
  "At Ostrel harbour the low spring tide uncovers sheets of salt glass: brine pools that crystallise in the wind into thin panes.",
  "The harbour masters ring the fog bell three times when the salt glass is safe to walk on, and twice when the flood tide turns.",
  "Fishing boats moor on the eastern quay because the western channel silts up every autumn after the equinox storms.",
].join("\n\n");

const CHAT_TURNS = [
  "Maren, where did you hide the brass key to the lamp room?",
  "Under the third step of the spiral stairs, wrapped in oilcloth so the salt air cannot rust it.",
  "And the fog bell, does it still ring by hand?",
  "By hand, every quarter hour when the fog rolls in. My arms ache by morning.",
  "Tell me about the shipwreck you logged last winter.",
  "The schooner Gannet struck the north reef at midnight; we pulled six sailors from the surf.",
  "Did the lamp ever go out?",
  "Once, when the wick burned dry during the January gale. I relit it within a minute.",
  "Who brings your supplies?",
  "A ferryman named Ossian rows out every second Sunday with flour, oil and letters.",
  "What do you read on long nights?",
  "Old tide tables and a battered book of star charts my mother left me.",
  "Have you ever seen the green flash at sunset?",
  "Twice, both in late summer, just as the sun slipped under a flat calm sea.",
  "What is the hardest part of the job?",
  "Climbing the hundred and twelve steps with a can of lamp oil in each hand.",
  "Do the gulls bother you?",
  "They steal my bread from the window ledge, so I feed them crusts to keep the peace.",
  "What will you do when you retire?",
  "Plant a garden of sea kale and never climb a stair again.",
  "Is the lighthouse haunted?",
  "Only by the wind whistling through the broken pane on the gallery.",
  "Thank you for the tour, Maren.",
  "Mind the third step on your way down.",
];

const SEARCHES = [
  { over: "characters", query: "keeper of a lighthouse on a stormy coast", expect: "Maren Vos" },
  { over: "documents", query: "salt glass forms at low tide in the harbour", expect: DOC_NAME },
  { over: "segments", query: "where is the brass key to the lamp room hidden", expect: "brass key" },
] as const;

function parseOpts(argv: readonly string[]): { readonly opts: Opts; readonly positional: readonly string[] } {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg.startsWith("--")) {
      flags.set(arg.slice(2), argv[i + 1] ?? "");
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  const base = flags.get("base");
  const db = flags.get("db");
  const archiveDir = flags.get("archive");
  if (base === undefined || db === undefined || archiveDir === undefined) {
    throw new Error("--base, --db and --archive are required");
  }
  return { opts: { base, db, archive: archiveDir }, positional };
}

/** A tRPC caller as one principal: no cookie is the stage's loopback owner; a cookie is a logged-in member. */
class Trpc {
  private readonly opts: Opts;
  private readonly cookie: string | null;

  constructor(opts: Opts, cookie: string | null) {
    this.opts = opts;
    this.cookie = cookie;
  }

  private headers(json: boolean): Record<string, string> {
    return {
      ...(json ? { "content-type": "application/json" } : {}),
      ...(this.cookie === null ? {} : { cookie: this.cookie, "x-orb-csrf": "1" }),
    };
  }

  async query(proc: string, input?: unknown): Promise<unknown> {
    const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
    return await this.unwrap(proc, await fetch(`${this.opts.base}/api/trpc/${proc}${qs}`, { headers: this.headers(false) }));
  }

  async mutate(proc: string, input: unknown): Promise<unknown> {
    const res = await fetch(`${this.opts.base}/api/trpc/${proc}`, { method: "POST", headers: this.headers(true), body: JSON.stringify(input) });
    return await this.unwrap(proc, res);
  }

  /** A mutation whose refusal is the evidence: the error body, not a throw. */
  async attempt(proc: string, input: unknown): Promise<{ readonly ok: boolean; readonly body: unknown }> {
    const res = await fetch(`${this.opts.base}/api/trpc/${proc}`, { method: "POST", headers: this.headers(true), body: JSON.stringify(input) });
    const body: unknown = JSON.parse(await res.text());
    return { ok: res.ok, body };
  }

  private async unwrap(proc: string, res: Response): Promise<unknown> {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${proc} HTTP ${String(res.status)}: ${text.slice(0, ERROR_EXCERPT)}`);
    }
    return (JSON.parse(text) as { result: { data: unknown } }).result.data;
  }
}

function archive(opts: Opts, name: string, value: unknown): string {
  mkdirSync(opts.archive, { recursive: true });
  const file = path.join(opts.archive, `${new Date().toISOString().replaceAll(":", "-")}-${name}.json`);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

/** The stage db, read-only: per vector table, the stored widths by generation, plus the owner's targets. */
function widths(opts: Opts): unknown {
  const script = [
    "import sqlite3, json, sys",
    "c = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)",
    "out = {}",
    "for t in ['character_embeddings', 'document_chunks', 'chat_segments', 'chat_digests']:",
    "    out[t] = [dict(zip(['owner_id', 'generation_id', 'model', 'dim', 'blob_dim', 'rows'], r)) for r in c.execute(",
    "        f'select g.owner_id, v.generation_id, v.model, v.dim, length(v.embedding) / 4, count(*) from {t} v'",
    "        ' left join embed_generations g on g.id = v.generation_id group by 1, 2, 3, 4, 5')]",
    "out['targets'] = [dict(zip(['owner_id', 'task', 'generation_id', 'epoch'], r)) for r in c.execute('select * from embed_generation_targets')]",
    "out['space_state'] = [dict(zip(['owner_id', 'scope', 'active', 'candidate', 'epoch'], r)) for r in c.execute(",
    "    'select owner_id, scope, active_generation_id, candidate_generation_id, candidate_epoch from embed_space_state')]",
    "print(json.dumps(out))",
  ].join("\n");
  return JSON.parse(execFileSync("python3", ["-c", script, opts.db], { encoding: "utf8" }));
}

const MAREN_CHAT_SQL = [
  "import sqlite3, sys",
  "c = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)",
  "print(c.execute(\"select cp.chat_id from chat_participants cp join characters c on c.id = cp.character_id where c.name = 'Maren Vos' limit 1\").fetchone()[0])",
].join("\n");

const MAREN_ID_SQL = [
  "import sqlite3, sys",
  "c = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)",
  "print(c.execute(\"select id from characters where name = 'Maren Vos' order by created_at limit 1\").fetchone()[0])",
].join("\n");

interface WorkloadRow {
  readonly id: string;
  readonly kind: string;
  readonly status: Parameters<typeof embedderRebuildState>[0][number]["status"];
  readonly ownerId: string | null;
  readonly createdAt: number;
  readonly params: unknown;
  readonly error: string | null;
}

/** Whether the caller's search is paused for a rebuild: the read the role row judges first. */
async function spaceStatus(trpc: Trpc): Promise<{ readonly paused: boolean }> {
  return (await trpc.query("search.spaceStatus")) as { readonly paused: boolean };
}

async function rebuildRows(trpc: Trpc): Promise<WorkloadRow[]> {
  const perKind = await Promise.all(EMBEDDER_REBUILD_KINDS.map(async (kind) => (await trpc.query("workloads.list", { kind })) as WorkloadRow[]));
  return perKind.flat();
}

/** Poll until no workload is active, recording each change in what the role row would say. */
async function settle(trpc: Trpc, viewerId: string, since: number): Promise<{ readonly timeline: unknown[]; readonly rows: WorkloadRow[] }> {
  const timeline: unknown[] = [];
  const started = Date.now();
  let lastLine: string | null | undefined;
  for (;;) {
    const all = (await trpc.query("workloads.list", { since })) as WorkloadRow[];
    const line = embedderRebuildState(await rebuildRows(trpc), viewerId, await spaceStatus(trpc));
    if (line !== lastLine) {
      timeline.push({
        atMs: Date.now() - started,
        roleRowLine: line,
        active: all.filter((row) => ACTIVE.has(row.status)).map((row) => `${row.kind}:${row.status}`),
      });
      lastLine = line;
    }
    if (!all.some((row) => ACTIVE.has(row.status)) && Date.now() - started > 2 * POLL_MS) {
      return { timeline, rows: all };
    }
    if (Date.now() - started > SETTLE_TIMEOUT_MS) {
      throw new Error(`workloads still active after ${String(SETTLE_TIMEOUT_MS)} ms: ${JSON.stringify(all.filter((row) => ACTIVE.has(row.status)))}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** Each search the cell owes, with whether its expected hit is in the top three. */
async function searches(opts: Opts, trpc: Trpc): Promise<unknown[]> {
  const out: unknown[] = [];
  // Verbatim segments are searched within one chat, the way recall reads them.
  const chatId = execFileSync("python3", ["-c", MAREN_CHAT_SQL, opts.db], { encoding: "utf8" }).trim();
  const scopedCharacterId = execFileSync("python3", ["-c", MAREN_ID_SQL, opts.db], { encoding: "utf8" }).trim();
  for (const s of SEARCHES) {
    const scope = s.over === "segments" ? { kind: "chat", chatId, scopedCharacterId } : { kind: "owner" };
    try {
      const result = (await trpc.query("search.search", { query: s.query, topN: SEARCH_TOP_N, over: s.over, scope })) as Record<string, unknown>;
      const rows = (Object.values(result).find(Array.isArray) ?? []) as unknown[];
      const top3 = rows.slice(0, TOP_HITS).map((row) => JSON.stringify(row));
      out.push({
        over: s.over,
        query: s.query,
        hits: rows.length,
        expectInTop3: top3.some((row) => row.includes(s.expect)),
        top: top3.map((row) => row.slice(0, ROW_EXCERPT)),
      });
    } catch (error) {
      out.push({ over: s.over, query: s.query, refused: String(error).slice(0, ERROR_EXCERPT) });
    }
  }
  return out;
}

async function viewer(trpc: Trpc): Promise<string> {
  return ((await trpc.query("sessions.me")) as { userId: string }).userId;
}

/** The connection for an arm: the seeded built-in row, or a new row (with its key stored as a credential). */
async function connectionFor(trpc: Trpc, name: string, keyOverride?: string): Promise<string> {
  const spec = EMBEDDERS[name];
  if (spec === undefined) {
    throw new Error(`unknown embedder ${name}; known: ${Object.keys(EMBEDDERS).join(", ")}`);
  }
  if (spec.existing === true) {
    const rows = (await trpc.query("connection.list")) as { id: string; providerId: string; model: string; declared: unknown }[];
    const row = rows.find((r) => r.providerId === spec.providerId && r.model === spec.model && r.declared === null);
    if (row === undefined) {
      throw new Error(`no seeded ${spec.providerId} ${spec.model} row`);
    }
    return row.id;
  }
  let credentialId: string | null = null;
  if (spec.keyEnv !== undefined) {
    const key = keyOverride ?? probeKey(spec.keyEnv);
    credentialId = ((await trpc.mutate("credentials.add", { provider: spec.providerId, label: `probe ${name}`, key })) as { id: string }).id;
  }
  const created = (await trpc.mutate("connection.create", {
    label: `probe ${name}`,
    providerId: spec.providerId,
    credentialId,
    baseUrl: spec.baseUrl,
    model: spec.model,
    allowBackground: true,
    ...(spec.dims === undefined ? {} : { declared: { embedding: { dims: spec.dims } } }),
  })) as { id: string };
  return created.id;
}

/** Re-point the caller's embed role as the pane does: read the confirm's preview, then write the binding. */
async function repoint(trpc: Trpc, connectionId: string): Promise<{ readonly preview: unknown; readonly binding: unknown }> {
  const preview = await trpc.query("connection.embedSpaceChangePreview", { change: { kind: "bind", task: "embed", connectionId } });
  const binding = await trpc.mutate("connection.setBinding", { task: "embed", connectionId });
  return { preview, binding };
}

async function evidence(opts: Opts, trpc: Trpc, label: string, extra: Record<string, unknown>): Promise<void> {
  const me = await viewer(trpc);
  const record = {
    label,
    viewer: me,
    ...extra,
    bindings: await trpc.query("connection.listBindings"),
    widths: widths(opts),
    searches: await searches(opts, trpc),
    spaceStatus: await spaceStatus(trpc),
    roleRowLineNow: embedderRebuildState(await rebuildRows(trpc), me, await spaceStatus(trpc)),
  };
  const file = archive(opts, label, record);
  process.stdout.write(`${JSON.stringify({ label, file, searches: record.searches, roleRowLineNow: record.roleRowLineNow })}\n`);
}

async function seed(opts: Opts, trpc: Trpc): Promise<void> {
  const created: unknown[] = [];
  for (const card of CARDS) {
    created.push(await trpc.mutate("character.create", { input: card }));
  }
  created.push(await trpc.mutate("databank.createFromText", { name: DOC_NAME, text: DOC_TEXT }));
  const header = { user_name: "Visitor", character_name: "Maren Vos", create_date: "2026-10-04@00h00m00s", chat_metadata: {} };
  const lines = [JSON.stringify(header)];
  CHAT_TURNS.forEach((mes, i) => {
    const isUser = i % 2 === 0;
    lines.push(
      JSON.stringify({
        name: isUser ? "Visitor" : "Maren Vos",
        is_user: isUser,
        is_system: false,
        mes,
        send_date: `2026-10-04T00:${String(i).padStart(2, "0")}:00Z`,
      }),
    );
  });
  const form = new FormData();
  form.append("file", new File([`${lines.join("\n")}\n`], "maren-lighthouse.jsonl", { type: "application/jsonl" }));
  const res = await fetch(`${opts.base}/api/import/chat`, { method: "POST", body: form, headers: { "x-orb-csrf": "1" } });
  created.push({ importChat: res.status, body: await res.json() });
  const settled = await settle(trpc, await viewer(trpc), Date.now() - SEED_LOOKBACK_MS);
  archive(opts, "seed", { created, settled });
  await memoryOn(opts, trpc);
}

/** Memory is off for a fresh account: switch it on, then run the whole-corpus sweep that records memory complete
 *  (the import queued only the free segment pass, which never claims the scope). */
async function memoryOn(opts: Opts, trpc: Trpc): Promise<void> {
  const setting = await trpc.mutate("settings.updateUserSettingsSection", { section: "memory", patch: { enabled: true } });
  const since = Date.now() - SINCE_SLACK_MS;
  const started = await trpc.mutate("workloads.start", { input: { kind: "memory-backfill", params: {} }, mode: "singular" });
  const settled = await settle(trpc, await viewer(trpc), since);
  await evidence(opts, trpc, "seed-state", { memorySetting: setting, started, workloads: settled.rows });
}

async function bind(opts: Opts, trpc: Trpc, name: string): Promise<void> {
  const me = await viewer(trpc);
  const connectionId = await connectionFor(trpc, name);
  const since = Date.now() - SINCE_SLACK_MS;
  const { preview } = await repoint(trpc, connectionId);
  const settled = await settle(trpc, me, since);
  await evidence(opts, trpc, `bind-${name}`, { connectionId, preview, timeline: settled.timeline, workloads: settled.rows });
}

/** Two re-points in quick succession: the second lands while the first one's rebuild runs. */
async function race(opts: Opts, trpc: Trpc, first: string, second: string): Promise<void> {
  const me = await viewer(trpc);
  const a = await connectionFor(trpc, first);
  const b = await connectionFor(trpc, second);
  const since = Date.now() - SINCE_SLACK_MS;
  const firstRepoint = await repoint(trpc, a);
  // Wait until the first rebuild is running, so the second move lands inside it.
  let sawRunning: unknown = null;
  for (let i = 0; i < RACE_POLLS && sawRunning === null; i += 1) {
    const rows = (await trpc.query("workloads.list", { since })) as WorkloadRow[];
    const running = rows.filter((row) => row.status === "running");
    if (running.length > 0) {
      sawRunning = running.map((row) => `${row.kind}:${row.status}`);
    } else {
      await new Promise((resolve) => setTimeout(resolve, RACE_POLL_MS));
    }
  }
  const secondRepoint = await repoint(trpc, b);
  const settled = await settle(trpc, me, since);
  await evidence(opts, trpc, `race-${first}-then-${second}`, {
    first: { connectionId: a, preview: firstRepoint.preview },
    second: { connectionId: b, preview: secondRepoint.preview },
    secondLandedWhile: sawRunning,
    timeline: settled.timeline,
    workloads: settled.rows,
  });
}

/** Re-point to the hosted embedder under a bad key, then fix the key and make one write. */
async function badkey(opts: Opts, trpc: Trpc, name: string): Promise<void> {
  const me = await viewer(trpc);
  const spec = EMBEDDERS[name];
  if (spec?.keyEnv === undefined) {
    throw new Error(`${name} takes no key`);
  }
  const before = widths(opts);
  const connectionId = await connectionFor(trpc, name, "sk-probe-deliberately-bad-key");
  const since = Date.now() - SINCE_SLACK_MS;
  const bad = await trpc.attempt("connection.setBinding", { task: "embed", connectionId });
  const settledBad = await settle(trpc, me, since);
  const afterBad = widths(opts);
  const searchesBad = await searches(opts, trpc);
  const connection = (await trpc.query("connection.get", { connectionId })) as { credentialId: string };
  await trpc.mutate("credentials.replace", { credentialId: connection.credentialId, key: probeKey(spec.keyEnv) });
  // The first write after the fix: an edit to one card re-embeds it, which resolves the binding and moves the target.
  const maren = execFileSync("python3", ["-c", MAREN_ID_SQL, opts.db], { encoding: "utf8" }).trim();
  const sinceFix = Date.now() - SINCE_SLACK_MS;
  const write = await trpc.attempt("character.update", {
    characterId: maren,
    input: { description: `${CARDS[0].description} She polishes the lens at noon (${String(Date.now())}).` },
  });
  const settledFix = await settle(trpc, me, sinceFix);
  await evidence(opts, trpc, `badkey-${name}`, {
    connectionId,
    badBindingWrite: bad,
    whileBad: { before, afterBad, searches: searchesBad, timeline: settledBad.timeline, workloads: settledBad.rows },
    fixWrite: write,
    afterFix: { timeline: settledFix.timeline, workloads: settledFix.rows },
  });
}

/** The member re-points their OWN embedder; the owner's targets must not move. */
async function member(opts: Opts, owner: Trpc, name: string): Promise<void> {
  const login = await fetch(`${opts.base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-orb-csrf": "1" },
    body: new URLSearchParams({ handle: "member", password: "member-dev-pass" }).toString(),
    redirect: "manual",
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const asMember = new Trpc(opts, cookie);
  const memberId = await viewer(asMember);
  const ownerTargetsBefore = (widths(opts) as { targets: { owner_id: string }[] }).targets;
  const connectionId = await connectionFor(asMember, name);
  const since = Date.now() - SINCE_SLACK_MS;
  const { preview } = await repoint(asMember, connectionId);
  const settled = await settle(asMember, memberId, since);
  const after = widths(opts) as { targets: { owner_id: string }[] };
  const ownerRows = (await owner.query("workloads.list", { since })) as WorkloadRow[];
  await evidence(opts, asMember, `member-${name}`, {
    loginStatus: login.status,
    connectionId,
    preview,
    timeline: settled.timeline,
    memberWorkloads: settled.rows,
    ownerVisibleWorkloadsSince: ownerRows.map((row) => ({ kind: row.kind, ownerId: row.ownerId, status: row.status })),
    targetsBefore: ownerTargetsBefore,
    targetsAfter: after.targets,
  });
}

async function main(): Promise<void> {
  const { opts, positional } = parseOpts(process.argv.slice(2));
  const owner = new Trpc(opts, null);
  const [verb = "", a = "", b = ""] = positional;
  const verbs: Readonly<Record<string, () => Promise<void>>> = {
    seed: () => seed(opts, owner),
    "memory-on": () => memoryOn(opts, owner),
    bind: () => bind(opts, owner, a),
    race: () => race(opts, owner, a, b),
    badkey: () => badkey(opts, owner, a),
    member: () => member(opts, owner, a),
    state: () => evidence(opts, owner, `state-${a === "" ? "now" : a}`, {}),
  };
  const run = verbs[verb];
  if (run === undefined) {
    throw new Error(`unknown verb "${verb}"; known: ${Object.keys(verbs).join(", ")}`);
  }
  await run();
}

await main();
