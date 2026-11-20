// Boots a scratch copy of a SillyTavern checkout on a scratch data root with an Orbweaver SillyTavern export placed as
// its default user, then prints what SillyTavern's own list routes read back. A local proof tool, kept out of CI and
// out of `pnpm test`.
//
// Usage: node scripts/st-export-boot.ts <export.zip> [<sillytavern checkout>] [--keep]
//
// The checkout's data/ and backups/ hold its owner's real SillyTavern data, so they are never copied or read. The copy
// installs from the checkout's own lockfile with install scripts off, binds 127.0.0.1 on a free port, and is deleted
// when the run ends (unless --keep).

import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve as resolvePath } from "node:path";
import process from "node:process";
import { unzipSync } from "fflate";

// Top-level checkout entries the copy leaves out: the owner's data, git, installed modules and server plugins.
const NOT_COPIED = new Set(["data", "backups", ".git", "node_modules", "plugins"]);
const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 500;
const PROFILE = "default-user";
const LOG_TAIL_CHARS = 4000;
const PATH_SEPARATORS = /[\\/]/u;

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const [zipPath, checkout = join(homedir(), "inktomi-stack", "SillyTavern")] = args.filter((arg) => arg !== "--keep");
if (zipPath === undefined) {
  console.error("usage: node scripts/st-export-boot.ts <export.zip> [<sillytavern checkout>] [--keep]");
  process.exit(2);
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address !== null ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

// Whether `target` sits inside `dir`, compared as resolved paths so a trailing slash or a `..` segment cannot pass.
function inside(dir: string, target: string): boolean {
  const rel = relative(dir, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

const source = resolvePath(checkout);
const work = await mkdtemp(join(tmpdir(), "st-export-boot-"));
const copy = join(work, "SillyTavern");
const dataRoot = join(work, "data");
let server: ReturnType<typeof spawn> | undefined;
try {
  await cp(source, copy, { recursive: true, filter: (entry) => !NOT_COPIED.has(relative(source, entry).split(PATH_SEPARATORS)[0] ?? "") });
  await mkdir(join(copy, "plugins"), { recursive: true });
  const install = spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: copy, stdio: "inherit" });
  if (install.status !== 0) {
    throw new Error(`npm ci --ignore-scripts failed with ${String(install.status)}`);
  }

  const profileDir = join(dataRoot, PROFILE);
  for (const [path, bytes] of Object.entries(unzipSync(new Uint8Array(await readFile(zipPath))))) {
    if (path.endsWith("/") || !path.startsWith(`data/${PROFILE}/`)) {
      continue;
    }
    // A zip entry names its own path; one that resolves outside the scratch profile is refused, never written.
    const target = resolvePath(work, path);
    if (!inside(profileDir, target)) {
      throw new Error(`the export holds an entry outside data/${PROFILE}/: ${path}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }

  const port = await freePort();
  server = spawn(
    process.execPath,
    [
      "server.js",
      "--port",
      String(port),
      "--listen",
      "false",
      "--listenAddressIPv4",
      "127.0.0.1",
      "--enableIPv6",
      "false",
      "--dataRoot",
      dataRoot,
      "--configPath",
      join(work, "config.yaml"),
      "--disableCsrf",
      "true",
      "--browserLaunchEnabled",
      "false",
    ],
    { cwd: copy, stdio: ["ignore", "pipe", "pipe"] },
  );
  const log: string[] = [];
  server.stdout?.on("data", (chunk: Buffer) => log.push(chunk.toString()));
  server.stderr?.on("data", (chunk: Buffer) => log.push(chunk.toString()));
  const base = `http://127.0.0.1:${String(port)}`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const up = await fetch(`${base}/`).then(
      (response) => response.ok,
      () => false,
    );
    if (up) {
      break;
    }
    if (Date.now() > deadline || server.exitCode !== null) {
      throw new Error(`SillyTavern did not answer on ${base}:\n${log.join("").slice(-LOG_TAIL_CHARS)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }

  const post = async (route: string, body: unknown = {}): Promise<{ status: number; json: unknown }> => {
    const response = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const text = await response.text();
    let json: unknown = text;
    try {
      json = JSON.parse(text);
    } catch {
      // A route that answers plain text is reported as that text.
    }
    return { status: response.status, json };
  };
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const field = (value: unknown, key: string): unknown => (typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined);

  const characters = await post("/api/characters/all");
  const avatars = list(characters.json).map((character) => String(field(character, "avatar")));
  const chats = await Promise.all(
    avatars.map(async (avatar) => [avatar, list((await post("/api/characters/chats", { avatar_url: avatar, simple: true })).json).length] as const),
  );
  const groups = await post("/api/groups/all");
  const settings = await post("/api/settings/get");
  const stored = JSON.parse(String(field(settings.json, "settings"))) as Record<string, unknown>;
  const extension = field(stored, "extension_settings");
  const worlds = list(field(settings.json, "world_names")).map(String);
  const firstWorld = worlds[0] === undefined ? null : await post("/api/worldinfo/get", { name: worlds[0] });
  const backgrounds = await post("/api/backgrounds/all");
  const personaAvatars = await post("/api/avatars/get");
  const galleryFolders = Object.values((field(field(extension, "gallery"), "folders") ?? {}) as Record<string, string>);
  const gallery = await Promise.all(galleryFolders.map(async (folder) => [folder, list((await post("/api/images/list", { folder })).json).length] as const));
  const attachments = list(field(extension, "attachments"));
  const files = await Promise.all(
    attachments.map(async (entry) => [String(field(entry, "url")), (await fetch(`${base}${String(field(entry, "url"))}`)).status] as const),
  );
  const groupChats = await Promise.all(
    list(groups.json).flatMap((group) =>
      list(field(group, "chats")).map(async (id) => [String(id), list((await post("/api/chats/group/get", { id })).json).length] as const),
    ),
  );

  console.log(
    JSON.stringify(
      {
        sillyTavern: spawnSync("git", ["-C", source, "log", "-1", "--format=%h %cs"], { encoding: "utf8" }).stdout.trim(),
        "POST /api/characters/all": { status: characters.status, avatars },
        "POST /api/characters/chats": Object.fromEntries(chats),
        "POST /api/groups/all": {
          status: groups.status,
          groups: list(groups.json).map((group) => ({
            id: field(group, "id"),
            name: field(group, "name"),
            members: field(group, "members"),
            chats: field(group, "chats"),
          })),
        },
        "POST /api/chats/group/get": Object.fromEntries(groupChats),
        "POST /api/settings/get": {
          status: settings.status,
          worlds,
          presets: field(settings.json, "openai_setting_names"),
          themes: list(field(settings.json, "themes")).map((theme) => field(theme, "name")),
          personas: field(field(stored, "power_user"), "personas"),
          tags: list(field(stored, "tags")).length,
          tagMap: Object.keys(field(stored, "tag_map") ?? {}).length,
          globalRegex: list(field(extension, "regex")).map((script) => field(script, "scriptName")),
          dataBank: attachments.map((entry) => field(entry, "name")),
          background: field(stored, "background"),
        },
        "POST /api/worldinfo/get":
          firstWorld === null
            ? null
            : {
                status: firstWorld.status,
                world: worlds[0],
                entries: Object.keys(field(firstWorld.json, "entries") ?? {}).length,
              },
        "POST /api/backgrounds/all": { status: backgrounds.status, files: list(field(backgrounds.json, "images") ?? backgrounds.json).length },
        "POST /api/avatars/get": { status: personaAvatars.status, avatars: personaAvatars.json },
        "POST /api/images/list": Object.fromEntries(gallery),
        "GET /user/files": Object.fromEntries(files),
      },
      null,
      2,
    ),
  );
} finally {
  server?.kill();
  if (!keep) {
    await rm(work, { recursive: true, force: true });
  }
}
