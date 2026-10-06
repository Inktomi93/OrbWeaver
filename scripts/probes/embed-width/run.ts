// The embedding-width acceptance probe (work item 0507): drives a running local-auth stage over its real HTTP
// surface (tRPC, the chat import route, the login route) and reads the stage's own db read-only for the stored
// widths. Every step writes its raw responses to the archive directory; RESULTS.md cites them.
//
// Usage (see README.md):
//   node scripts/probes/embed-width/run.ts <verb> [args] --base http://127.0.0.1:<port> --db <stage db> --archive <dir>
// Verbs: seed · memory-on · utility · bind <embedder> · race <embedder> <embedder> · badkey <embedder> · member <embedder> · state <label>

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
  /** The editor's Purpose override (`declared.kind`): a model no curated row names is otherwise a chat model. */
  readonly purpose?: "embedding";
  readonly keyEnv?: string;
  readonly existing?: true;
}

const EMBEDDERS: Readonly<Record<string, EmbedderSpec>> = {
  "local-light-1024": { providerId: "local-light", model: "jinaai/jina-clip-v2", baseUrl: null, existing: true },
  "local-light-512": { providerId: "local-light", model: "jinaai/jina-clip-v2", baseUrl: null, dims: 512 },
  "ollama-nomic-768": { providerId: "ollama", model: "nomic-embed-text", baseUrl: OLLAMA_BASE_URL },
  "ollama-nomic-256": { providerId: "ollama", model: "nomic-embed-text", baseUrl: OLLAMA_BASE_URL, dims: 256 },
  "ollama-minilm-384": { providerId: "ollama", model: "all-minilm", baseUrl: OLLAMA_BASE_URL },
  // A width the model cannot make: the save must refuse it with the stated and measured widths.
  "ollama-minilm-1024": { providerId: "ollama", model: "all-minilm", baseUrl: OLLAMA_BASE_URL, dims: 1024 },
  "openai-3small-1536": { providerId: "openai", model: "text-embedding-3-small", baseUrl: null, keyEnv: "OPENAI_PROBE_KEY" },
  "openai-3small-512": { providerId: "openai", model: "text-embedding-3-small", baseUrl: null, dims: 512, keyEnv: "OPENAI_PROBE_KEY" },
  "openrouter-bge-768": {
    providerId: "openrouter",
    model: "baai/bge-base-en-v1.5",
    baseUrl: null,
    purpose: "embedding",
    dims: 768,
    keyEnv: "OPENROUTER_PROBE_KEY",
  },
};

/** The cheap hosted chat model bound as Utility (`summarize`), so the memory rebuild writes digests too. */
const UTILITY = { providerId: "openrouter", model: "openai/gpt-4o-mini", keyEnv: "OPENROUTER_PROBE_KEY" } as const;

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
  // Digests exist only once a Utility model is bound. Their text is the model's, so a hit is judged by its chat.
  { over: "digests", query: "where Maren hides the key to the lamp room", expect: null },
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

  /** The stage's loopback owner, who alone may write deployment settings. */
  get isOwner(): boolean {
    return this.cookie === null;
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

  /** An SSE subscription, as the app's EventSource opens it: the open response, whose body the caller reads. */
  async subscribe(proc: string, input: unknown, signal: AbortSignal): Promise<Response> {
    const qs = `?input=${encodeURIComponent(JSON.stringify(input))}`;
    return await fetch(`${this.opts.base}/api/trpc/${proc}${qs}`, { headers: { ...this.headers(false), accept: "text/event-stream" }, signal });
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

interface BusEvent {
  readonly atMs: number;
  readonly type: string;
}

// A user-channel data frame's event type, wherever the SSE envelope nests the frame.
function userEventType(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const frame = value as { channel?: unknown; event?: { type?: unknown } };
  if (frame.channel === "user" && typeof frame.event?.type === "string") {
    return frame.event.type;
  }
  for (const child of Object.values(value)) {
    const found = userEventType(child);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** The caller's user-bus events while a step runs, read over the socket the app opens (`stream.connect`, then an
 *  attach to the `user` room). The step's evidence says whether its rebuild announced `corpusRecomputed`. */
class UserBus {
  readonly events: BusEvent[] = [];
  private readonly abort = new AbortController();
  private readonly started = Date.now();
  private reading: Promise<void> = Promise.resolve();

  static async open(trpc: Trpc): Promise<UserBus> {
    const bus = new UserBus();
    const socketId = crypto.randomUUID();
    const res = await trpc.subscribe("stream.connect", { socketId }, bus.abort.signal);
    if (!res.ok || res.body === null) {
      throw new Error(`stream.connect HTTP ${String(res.status)}`);
    }
    bus.reading = bus.read(res.body);
    await trpc.mutate("stream.attach", { socketId, ref: { channel: "user" } });
    return bus;
  }

  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    let buffered = "";
    try {
      for await (const chunk of body) {
        buffered += decoder.decode(chunk, { stream: true });
        const lines = buffered.split(/\r?\n/u);
        buffered = lines.pop() ?? "";
        // A keep-alive is a `data:` line with no JSON payload.
        for (const payload of lines.filter((l) => l.startsWith("data:")).map((l) => l.slice("data:".length).trim())) {
          if (!payload.startsWith("{")) {
            continue;
          }
          const type = userEventType(JSON.parse(payload));
          if (type !== null) {
            this.events.push({ atMs: Date.now() - this.started, type });
          }
        }
      }
    } catch (error) {
      if (!this.abort.signal.aborted) {
        throw error;
      }
    }
  }

  async close(): Promise<readonly BusEvent[]> {
    this.abort.abort();
    await this.reading;
    return this.events;
  }
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
    const scope = s.over === "segments" || s.over === "digests" ? { kind: "chat", chatId, scopedCharacterId } : { kind: "owner" };
    try {
      const result = (await trpc.query("search.search", { query: s.query, topN: SEARCH_TOP_N, over: s.over, scope })) as Record<string, unknown>;
      const rows = (Object.values(result).find(Array.isArray) ?? []) as unknown[];
      const top3 = rows.slice(0, TOP_HITS).map((row) => JSON.stringify(row));
      out.push({
        over: s.over,
        query: s.query,
        hits: rows.length,
        expectInTop3: top3.some((row) => row.includes(s.expect ?? chatId)),
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

interface ConnectionRow {
  readonly id: string;
  readonly label: string;
  readonly providerId: string;
  readonly model: string;
  readonly declared: unknown;
}

/** The connection for an arm: the seeded built-in row, the arm's row from an earlier step (so a refused write is
 *  retried on the same row), or a new row with its key stored as a credential. `badKey` makes a separate row. */
async function connectionFor(trpc: Trpc, name: string, badKey?: string): Promise<string> {
  const spec = EMBEDDERS[name];
  if (spec === undefined) {
    throw new Error(`unknown embedder ${name}; known: ${Object.keys(EMBEDDERS).join(", ")}`);
  }
  const rows = (await trpc.query("connection.list")) as ConnectionRow[];
  if (spec.existing === true) {
    const row = rows.find((r) => r.providerId === spec.providerId && r.model === spec.model && r.declared === null);
    if (row === undefined) {
      throw new Error(`no seeded ${spec.providerId} ${spec.model} row`);
    }
    return row.id;
  }
  const label = `probe ${name}${badKey === undefined ? "" : " bad key"}`;
  const earlier = rows.find((r) => r.label === label);
  if (earlier !== undefined) {
    return earlier.id;
  }
  if (spec.baseUrl !== null && trpc.isOwner) {
    await admitEndpoint(trpc, spec.baseUrl);
  }
  return await createConnection(trpc, {
    label,
    providerId: spec.providerId,
    model: spec.model,
    baseUrl: spec.baseUrl,
    declared: declaredFor(spec),
    keyEnv: spec.keyEnv,
    badKey,
  });
}

/** The row's `declared` block: its Purpose override and its stated width, or nothing when it states neither. */
function declaredFor(spec: EmbedderSpec): Record<string, unknown> | undefined {
  if (spec.purpose === undefined && spec.dims === undefined) {
    return;
  }
  return { ...(spec.purpose === undefined ? {} : { kind: spec.purpose }), ...(spec.dims === undefined ? {} : { embedding: { dims: spec.dims } }) };
}

/** A multi-user stage admits no private address: the owner admits the local server's exact authority, as the
 *  connection editor's Admit button does (`settings.updateAppSettings`). */
async function admitEndpoint(trpc: Trpc, baseUrl: string): Promise<void> {
  const authority = new URL(baseUrl).host;
  const settings = (await trpc.query("settings.getAppSettingsWithOverrides")) as { resolved: { privateEndpointAllowlist: string[] } };
  const entries = settings.resolved.privateEndpointAllowlist;
  if (!entries.includes(authority)) {
    await trpc.mutate("settings.updateAppSettings", { partial: { privateEndpointAllowlist: [...entries, authority] } });
  }
}

async function createConnection(
  trpc: Trpc,
  row: {
    readonly label: string;
    readonly providerId: string;
    readonly model: string;
    readonly baseUrl: string | null;
    readonly declared?: Record<string, unknown> | undefined;
    readonly keyEnv?: string | undefined;
    readonly badKey?: string | undefined;
  },
): Promise<string> {
  let credentialId: string | null = null;
  if (row.keyEnv !== undefined) {
    const key = row.badKey ?? probeKey(row.keyEnv);
    credentialId = ((await trpc.mutate("credentials.add", { provider: row.providerId, label: row.label, key })) as { id: string }).id;
  }
  const created = (await trpc.mutate("connection.create", {
    label: row.label,
    providerId: row.providerId,
    credentialId,
    baseUrl: row.baseUrl,
    model: row.model,
    allowBackground: true,
    ...(row.declared === undefined ? {} : { declared: row.declared }),
  })) as { id: string };
  return created.id;
}

/** Bind the cheap hosted chat model as Utility, then sweep memory so its digests exist before the moves. */
async function utility(opts: Opts, trpc: Trpc): Promise<void> {
  const label = `probe utility ${UTILITY.model}`;
  const connectionId = await createConnection(trpc, { label, providerId: UTILITY.providerId, model: UTILITY.model, baseUrl: null, keyEnv: UTILITY.keyEnv });
  const binding = await trpc.mutate("connection.setBinding", { task: "summarize", connectionId });
  const since = Date.now() - SINCE_SLACK_MS;
  const started = await trpc.mutate("workloads.start", { input: { kind: "memory-backfill", params: {} }, mode: "singular" });
  const settled = await settle(trpc, await viewer(trpc), since);
  await evidence(opts, trpc, "utility", { connectionId, binding, started, workloads: settled.rows });
}

interface Repoint {
  readonly preview: unknown;
  readonly write: { readonly ok: boolean; readonly body: unknown };
}

/** Re-point the caller's embed role as the pane does: read the confirm's preview, then write the binding. The save
 *  probes the embedder, so a refusal (unmakeable width, unreachable server, bad key) is an outcome, not a throw. */
async function repoint(trpc: Trpc, connectionId: string): Promise<Repoint> {
  const preview = await trpc.query("connection.embedSpaceChangePreview", { change: { kind: "bind", task: "embed", connectionId } });
  const write = await trpc.attempt("connection.setBinding", { task: "embed", connectionId });
  return { preview, write };
}

function requireAccepted(step: string, move: Repoint): void {
  if (!move.write.ok) {
    throw new Error(`${step}: the re-point was refused: ${JSON.stringify(move.write.body).slice(0, ERROR_EXCERPT)}`);
  }
}

/** What a refused write must leave as it was: the embed binding and every stored width and target. */
async function untouched(opts: Opts, trpc: Trpc): Promise<{ readonly bindings: unknown; readonly widths: unknown }> {
  return { bindings: await trpc.query("connection.listBindings"), widths: widths(opts) };
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
  const summary = { label, file, searches: record.searches, roleRowLineNow: record.roleRowLineNow, refused: extra["refused"], bus: extra["bus"] };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
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

/** One re-point. Accepted: wait for every rebuild. Refused: record the refusal and what it left in place. */
async function bind(opts: Opts, trpc: Trpc, name: string): Promise<void> {
  const me = await viewer(trpc);
  const connectionId = await connectionFor(trpc, name);
  const before = await untouched(opts, trpc);
  const bus = await UserBus.open(trpc);
  const since = Date.now() - SINCE_SLACK_MS;
  const move = await repoint(trpc, connectionId);
  const settled = await settle(trpc, me, since);
  const events = await bus.close();
  const outcome = move.write.ok ? {} : { refused: move.write.body, before, after: await untouched(opts, trpc) };
  await evidence(opts, trpc, `bind-${name}${move.write.ok ? "" : "-refused"}`, {
    connectionId,
    preview: move.preview,
    ...outcome,
    timeline: settled.timeline,
    workloads: settled.rows,
    bus: events,
  });
}

/** Two re-points in quick succession: the second lands while the first one's rebuild runs. */
async function race(opts: Opts, trpc: Trpc, first: string, second: string): Promise<void> {
  const me = await viewer(trpc);
  const a = await connectionFor(trpc, first);
  const b = await connectionFor(trpc, second);
  const bus = await UserBus.open(trpc);
  const since = Date.now() - SINCE_SLACK_MS;
  const firstRepoint = await repoint(trpc, a);
  requireAccepted(first, firstRepoint);
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
  requireAccepted(second, secondRepoint);
  const settled = await settle(trpc, me, since);
  await evidence(opts, trpc, `race-${first}-then-${second}`, {
    first: { connectionId: a, preview: firstRepoint.preview },
    second: { connectionId: b, preview: secondRepoint.preview },
    secondLandedWhile: sawRunning,
    timeline: settled.timeline,
    workloads: settled.rows,
    bus: await bus.close(),
  });
}

/** Re-point to the hosted embedder under a bad key (the save's probe refuses it, so the old index stays), then fix
 *  the key and re-point the same row. */
async function badkey(opts: Opts, trpc: Trpc, name: string): Promise<void> {
  const me = await viewer(trpc);
  const spec = EMBEDDERS[name];
  if (spec?.keyEnv === undefined) {
    throw new Error(`${name} takes no key`);
  }
  const before = await untouched(opts, trpc);
  const connectionId = await connectionFor(trpc, name, "sk-probe-deliberately-bad-key");
  const since = Date.now() - SINCE_SLACK_MS;
  const bad = await repoint(trpc, connectionId);
  const settledBad = await settle(trpc, me, since);
  const afterBad = await untouched(opts, trpc);
  const searchesBad = await searches(opts, trpc);
  const connection = (await trpc.query("connection.get", { connectionId })) as { credentialId: string };
  await trpc.mutate("credentials.replace", { credentialId: connection.credentialId, key: probeKey(spec.keyEnv) });
  const bus = await UserBus.open(trpc);
  const sinceFix = Date.now() - SINCE_SLACK_MS;
  const fixed = await repoint(trpc, connectionId);
  const settledFix = await settle(trpc, me, sinceFix);
  await evidence(opts, trpc, `badkey-${name}`, {
    connectionId,
    refused: bad.write.body,
    whileBad: { before, afterBad, searches: searchesBad, timeline: settledBad.timeline, workloads: settledBad.rows },
    fixWrite: fixed.write,
    afterFix: { timeline: settledFix.timeline, workloads: settledFix.rows },
    bus: await bus.close(),
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
  const move = await repoint(asMember, connectionId);
  requireAccepted("member", move);
  const settled = await settle(asMember, memberId, since);
  const after = widths(opts) as { targets: { owner_id: string }[] };
  const ownerRows = (await owner.query("workloads.list", { since })) as WorkloadRow[];
  await evidence(opts, asMember, `member-${name}`, {
    loginStatus: login.status,
    connectionId,
    preview: move.preview,
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
    utility: () => utility(opts, owner),
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
