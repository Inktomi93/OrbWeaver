// Engine two: the TypeScript 7 language server (`tsc --lsp --stdio`) asked textDocument/references for each member
// engine one found unused. A second compiler, so one engine's resolution gap cannot report a wired member.
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnNicedDuplex } from "../floor/process/proc.ts";
import type { ReferenceKind } from "./classify.ts";
import { classifyReference, parseAlone } from "./classify.ts";
import type { MemberReferences } from "./language-service.ts";

/** What the language server found for one member. */
export interface ServerReferences {
  readonly key: string;
  readonly counts: Readonly<Record<ReferenceKind, number>>;
  readonly uses: readonly string[];
}

interface Location {
  readonly uri: string;
  readonly range: { readonly start: { readonly line: number; readonly character: number } };
}

interface Message {
  readonly id?: number;
  readonly method?: string;
  readonly result?: unknown;
  readonly error?: { readonly message: string };
}

const HEADER_END = "\r\n\r\n";
const LENGTH = /Content-Length: (\d+)/iu;

/** A minimal JSON-RPC client over the server's stdio: requests by id, and a null answer to every server request. */
class Connection {
  readonly #pending = new Map<number, (message: Message) => void>();
  readonly #write: (text: string) => void;
  #buffer = Buffer.alloc(0);
  #next = 0;

  constructor(stdout: NodeJS.ReadableStream, write: (text: string) => void) {
    this.#write = write;
    stdout.on("data", (chunk: Buffer) => this.#receive(chunk));
  }

  #receive(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (let end = this.#buffer.indexOf(HEADER_END); end >= 0; end = this.#buffer.indexOf(HEADER_END)) {
      const length = Number(LENGTH.exec(this.#buffer.subarray(0, end).toString())?.[1] ?? Number.NaN);
      if (Number.isNaN(length) || this.#buffer.length < end + HEADER_END.length + length) {
        return;
      }
      const body = this.#buffer.subarray(end + HEADER_END.length, end + HEADER_END.length + length);
      this.#buffer = this.#buffer.subarray(end + HEADER_END.length + length);
      this.#dispatch(JSON.parse(body.toString()) as Message);
    }
  }

  #dispatch(message: Message): void {
    if (message.id === undefined) {
      return;
    }
    if (message.method !== undefined) {
      this.send({ jsonrpc: "2.0", id: message.id, result: null });
      return;
    }
    this.#pending.get(message.id)?.(message);
    this.#pending.delete(message.id);
  }

  send(message: object): void {
    const text = JSON.stringify(message);
    this.#write(`Content-Length: ${Buffer.byteLength(text)}${HEADER_END}${text}`);
  }

  request(method: string, params: object): Promise<Message> {
    const id = ++this.#next;
    return new Promise((settle) => {
      this.#pending.set(id, settle);
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }
}

/** Ask the language server about each member. The server loads a project only once one of its files is open, and a
 *  reference in an unloaded project is invisible, so `primeFiles` opens one repository-relative file per world first. */
export async function serverReferences(
  root: string,
  serverBin: string,
  members: readonly MemberReferences[],
  primeFiles: readonly string[],
): Promise<readonly ServerReferences[]> {
  const child = spawnNicedDuplex(serverBin, ["--lsp", "--stdio"], { cwd: root });
  const { stdin, stdout } = child;
  if (stdin === null || stdout === null) {
    child.killGroup("SIGKILL");
    throw new Error("the language server opened no stdio pipes");
  }
  const connection = new Connection(stdout, (text) => stdin.write(text));
  const rootUri = pathToFileURL(root).href;
  try {
    await connection.request("initialize", { processId: process.pid, rootUri, capabilities: {}, workspaceFolders: [{ uri: rootUri, name: "root" }] });
    connection.send({ jsonrpc: "2.0", method: "initialized", params: {} });
    const opened = new Set<string>();
    const parsed: ParsedFiles = new Map();
    const found: ServerReferences[] = [];
    const open = (file: string): string => {
      const uri = pathToFileURL(join(root, file)).href;
      if (!opened.has(uri)) {
        connection.send({
          jsonrpc: "2.0",
          method: "textDocument/didOpen",
          params: { textDocument: { uri, languageId: "typescript", version: 1, text: readFileSync(join(root, file), "utf8") } },
        });
        opened.add(uri);
      }
      return uri;
    };
    for (const file of primeFiles) {
      open(file);
    }
    for (const member of members) {
      const uri = open(member.file);
      const answer = await connection.request("textDocument/references", {
        textDocument: { uri },
        position: { line: member.line - 1, character: member.character },
        context: { includeDeclaration: false },
      });
      if (answer.error !== undefined) {
        throw new Error(`${member.key}: the language server refused references: ${answer.error.message}`);
      }
      found.push(classifyLocations(root, parsed, member.key, (answer.result ?? []) as readonly Location[]));
    }
    return found;
  } finally {
    child.killGroup("SIGTERM");
  }
}

type ParsedFiles = Map<string, ReturnType<typeof parseAlone>>;

function classifyLocations(root: string, parsed: ParsedFiles, key: string, locations: readonly Location[]): ServerReferences {
  const counts: Record<ReferenceKind, number> = { use: 0, builder: 0, plumbing: 0, test: 0, external: 0 };
  const uses: string[] = [];
  for (const location of locations) {
    const path = fileURLToPath(location.uri);
    const file = relative(root, path);
    if (file.includes("node_modules")) {
      counts.external++;
      continue;
    }
    const source = parsed.get(path) ?? parseAlone(path, readFileSync(path, "utf8"));
    parsed.set(path, source);
    const kind = classifyReference(source, source.getPositionOfLineAndCharacter(location.range.start.line, location.range.start.character), file);
    counts[kind]++;
    if (kind === "use") {
      uses.push(`${file}:${location.range.start.line + 1}`);
    }
  }
  return { key, counts, uses };
}
