import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { argv, cwd, stdout } from "node:process";

const root = cwd();
const auditDir = path.resolve(root, argv[2] ?? "docs/reviews/repository-audit-2026-08-13");
const configPath = path.join(auditDir, argv[3] ?? "LANES.json");
const manifestPath = path.join(auditDir, argv[4] ?? "MANIFEST.json");
const validateOnly = argv.includes("--validate-only");
const writeLanesOption = argv.find((value) => value.startsWith("--write-lanes="));
const writeLaneIds = writeLanesOption === undefined ? null : new Set(writeLanesOption.slice("--write-lanes=".length).split(","));
// Selected lane assignments are rolling snapshots. Rewriting the global manifest here would silently
// change the audit denominator whenever the owner commits concurrent work.
const writeManifest = !validateOnly && writeLaneIds === null;
const config = JSON.parse(readFileSync(configPath, "utf8"));
const binaryExtensions = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".pdf",
  ".png",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
const splitZero = (value) => value.split("\0").filter(Boolean);
const matchesPrefix = (file, prefix) => file === prefix || file.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
const matchesAny = (file, prefixes) => prefixes.some((prefix) => matchesPrefix(file, prefix));
const matchesLane = (file, lane) =>
  matchesAny(file, lane.prefixes ?? []) ||
  (lane.directories ?? []).includes(path.dirname(file)) ||
  (lane.exactFiles ?? []).includes(file) ||
  (lane.patterns ?? []).some((pattern) => new RegExp(pattern, "u").test(file));
const getFileState = (stat, binary) => {
  if (stat.isSymbolicLink()) {
    return "symlink";
  }
  return binary ? "binary" : "present";
};

const allFiles = [...new Set(splitZero(git("ls-files", "-co", "--exclude-standard", "-z")))].sort();
const scopedFiles = allFiles.filter(
  (file) => (config.includePrefixes === undefined || matchesAny(file, config.includePrefixes)) && !matchesAny(file, config.excludePrefixes ?? []),
);
const deletedFiles = new Set(splitZero(git("ls-files", "-d", "-z")));

const describeFile = (file) => {
  if (deletedFiles.has(file)) {
    return { path: file, state: "deleted", lines: null, bytes: null, sha256: null };
  }
  const absolute = path.join(root, file);
  const stat = lstatSync(absolute);
  const content = stat.isSymbolicLink() ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute);
  const binary = !stat.isSymbolicLink() && binaryExtensions.has(path.extname(file).toLowerCase());
  let lines = binary ? null : 0;
  if (!binary && content.length > 0) {
    for (const byte of content) {
      if (byte === 10) {
        lines += 1;
      }
    }
    if (content.at(-1) !== 10) {
      lines += 1;
    }
  }
  return {
    path: file,
    state: getFileState(stat, binary),
    lines,
    bytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
};

const lanes = new Map(config.lanes.map((lane) => [lane.id, { ...lane, files: [] }]));
const unknownWriteLaneIds = writeLaneIds === null ? [] : [...writeLaneIds].filter((laneId) => !lanes.has(laneId));
if (unknownWriteLaneIds.length > 0) {
  throw new Error(`Unknown --write-lanes ids: ${unknownWriteLaneIds.join(", ")}`);
}
const unassigned = [];
const multiplyAssigned = [];

for (const file of scopedFiles) {
  const matchedOwners = config.lanes.filter((lane) => matchesLane(file, lane));
  const carveOutOwners = matchedOwners.filter((lane) => lane.carveOut === true);
  const owners = carveOutOwners.length > 0 ? carveOutOwners : matchedOwners;
  if (owners.length === 0) {
    unassigned.push(file);
  } else if (owners.length > 1) {
    multiplyAssigned.push({ file, owners: owners.map((lane) => lane.id) });
  } else {
    lanes.get(owners[0].id).files.push(describeFile(file));
  }
}

if (unassigned.length > 0 || multiplyAssigned.length > 0) {
  throw new Error(JSON.stringify({ unassigned, multiplyAssigned }, null, 2));
}

const shared = config.sharedFiles.map(describeFile);
const displayMetric = (file, metric) => {
  if (file.state === "deleted") {
    return "DELETED";
  }
  return file[metric] ?? "BINARY";
};
const status = git("status", "--short").trimEnd().split("\n").filter(Boolean);
const commit = git("rev-parse", "HEAD").trim();
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commit,
  workingTreeStatus: status,
  includePrefixes: config.includePrefixes ?? null,
  excludePrefixes: config.excludePrefixes ?? [],
  sharedFiles: shared,
  lanes: [...lanes.values()].map((lane) => ({
    id: lane.id,
    title: lane.title,
    prefixes: lane.prefixes ?? [],
    directories: lane.directories ?? [],
    exactFiles: lane.exactFiles ?? [],
    patterns: lane.patterns ?? [],
    carveOut: lane.carveOut ?? false,
    fileCount: lane.files.length,
    lineCount: lane.files.reduce((sum, file) => sum + (file.lines ?? 0), 0),
    byteCount: lane.files.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
    files: lane.files,
  })),
};

if (writeManifest) {
  mkdirSync(path.join(auditDir, "lanes"), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (!validateOnly) {
  for (const lane of manifest.lanes) {
    if (writeLaneIds !== null && !writeLaneIds.has(lane.id)) {
      continue;
    }
    const laneDir = path.join(auditDir, "lanes", lane.id);
    mkdirSync(laneDir, { recursive: true });
    const rows = [
      `# ${lane.title}`,
      `# Snapshot: ${commit}`,
      `# Owned: ${lane.fileCount} files, ${lane.lineCount} lines, ${lane.byteCount} bytes`,
      "# kind\tlines\tbytes\tsha256\tpath",
      ...lane.files.map((file) => `OWNED\t${displayMetric(file, "lines")}\t${displayMetric(file, "bytes")}\t${displayMetric(file, "sha256")}\t${file.path}`),
      ...shared.map((file) => `SHARED\t${displayMetric(file, "lines")}\t${displayMetric(file, "bytes")}\t${displayMetric(file, "sha256")}\t${file.path}`),
      "",
    ];
    writeFileSync(path.join(laneDir, "assignment.txt"), rows.join("\n"));
  }
}

stdout.write(
  `${JSON.stringify(
    {
      commit,
      manifestWritten: writeManifest,
      lanes: manifest.lanes
        .filter(({ id }) => writeLaneIds === null || writeLaneIds.has(id))
        .map(({ id, fileCount, lineCount, byteCount }) => ({
          id,
          fileCount,
          lineCount,
          byteCount,
        })),
    },
    null,
    2,
  )}\n`,
);
