// Starts the TypeScript 7.1 native language server and loads every typecheck world up front.
// tsgo searches references only in projects it has loaded, and it loads a project only when one of its
// files is opened, so without this a find-references on a kit or contracts symbol misses every other world.
// Root `references` alone do not load projects (measured on 7.1.0-beta), so this opens one file per world.
// The root `tsconfig.json` is a solution file referencing every world, so files in worlds with other names
// (`tsconfig.node.json`, the test worlds, the router and showcase author configs) map to their real program.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

// LSP base-protocol framing: a header block ends with CRLF CRLF, and its length is four bytes.
const HEADER_END = "\r\n\r\n";
const HEADER_END_BYTES = 4;

const root = process.cwd();
const server = spawn(process.execPath, [join(root, "node_modules/@typescript/native/bin/tsc"), "--lsp", "--stdio"], {
  cwd: root,
  stdio: ["pipe", "pipe", "inherit"],
});
server.stdout.pipe(process.stdout);
server.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => server.kill("SIGTERM"));

// One file per world: every tracked tsconfig that compiles files, the set `scripts/typecheck.ts` checks. The
// file is one the config's own program includes, so opening it loads that world.
function worldFiles() {
  const ts = createRequire(join(root, "package.json"))("typescript");
  const configs = execFileSync("git", ["ls-files", "*tsconfig*.json"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  const files = [];
  for (const config of configs) {
    const parsed = ts.getParsedCommandLineOfConfigFile(join(root, config), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined });
    const file = parsed?.fileNames.find((name) => !(name.endsWith(".d.ts") || name.includes("/node_modules/")));
    if (file !== undefined) {
      files.push(file);
    }
  }
  return [...new Set(files)];
}

const preOpened = new Set();
const send = (message) => {
  const body = JSON.stringify(message);
  server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};

function openWorlds() {
  for (const file of worldFiles()) {
    const uri = pathToFileURL(file).href;
    preOpened.add(uri);
    const languageId = file.endsWith(".tsx") ? "typescriptreact" : "typescript";
    send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: { textDocument: { uri, languageId, version: 0, text: readFileSync(file, "utf8") } },
    });
  }
}

// A client open of a pre-opened file becomes a full-text change, and its close is dropped, so the world stays loaded.
function rewrite(message) {
  const uri = message.params?.textDocument?.uri;
  if (uri === undefined || !preOpened.has(uri)) {
    return message;
  }
  if (message.method === "textDocument/didOpen") {
    const { version, text } = message.params.textDocument;
    return { jsonrpc: "2.0", method: "textDocument/didChange", params: { textDocument: { uri, version }, contentChanges: [{ text }] } };
  }
  return message.method === "textDocument/didClose" ? undefined : message;
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf(HEADER_END);
    if (headerEnd === -1) {
      return;
    }
    const length = Number(/Content-Length: (\d+)/iu.exec(buffer.subarray(0, headerEnd).toString())?.[1]);
    if (buffer.length < headerEnd + HEADER_END_BYTES + length) {
      return;
    }
    const message = JSON.parse(buffer.subarray(headerEnd + HEADER_END_BYTES, headerEnd + HEADER_END_BYTES + length).toString());
    buffer = buffer.subarray(headerEnd + HEADER_END_BYTES + length);
    const forwarded = rewrite(message);
    if (forwarded !== undefined) {
      send(forwarded);
    }
    if (message.method === "initialized") {
      openWorlds();
    }
  }
});
process.stdin.on("end", () => server.stdin.end());
