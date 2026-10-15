// A local Git process supplies smart-HTTP bytes only; production still clones, admits and parses the remote.
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PLUGIN_MAIN_ENTRY, PLUGIN_MANIFEST_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { MS_PER_SECOND } from "@orb/kit/time";
import { CORPUS_PLUGIN_MANIFEST } from "./corpus-plugin.ts";
import type { ServerHarnessOptions } from "./server.ts";

export const CORPUS_PLUGIN_GIT_URL = "https://git.example.test/ledger.git";

export interface CorpusPluginGit {
  readonly networkExecution: NonNullable<ServerHarnessOptions["networkExecution"]>;
  readonly advance: () => Promise<string>;
  readonly requests: readonly string[];
}

function git(directory: string, at: number, args: readonly string[], input?: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      {
        cwd: directory,
        encoding: "buffer",
        env: {
          ["GIT_CONFIG_NOSYSTEM"]: "1",
          ["GIT_CONFIG_GLOBAL"]: "/dev/null",
          ["GIT_AUTHOR_NAME"]: "Corpus author",
          ["GIT_AUTHOR_EMAIL"]: "corpus@example.test",
          ["GIT_COMMITTER_NAME"]: "Corpus author",
          ["GIT_COMMITTER_EMAIL"]: "corpus@example.test",
          ["GIT_AUTHOR_DATE"]: `${String(Math.floor(at / MS_PER_SECOND))} +0000`,
          ["GIT_COMMITTER_DATE"]: `${String(Math.floor(at / MS_PER_SECOND))} +0000`,
        },
      },
      (error, stdout) => {
        if (error === null) {
          resolve(stdout);
        } else {
          reject(error);
        }
      },
    );
    child.stdin?.end(input);
  });
}

/** Own one finite remote repository under the harness's temporary directory. No socket or live remote is opened. */
export async function createCorpusPluginGit(directory: string, at: number): Promise<CorpusPluginGit> {
  await mkdir(directory, { recursive: true });
  await git(directory, at, ["init", "--initial-branch=main"]);
  const manifest = pluginManifestSchema.parse({ ...CORPUS_PLUGIN_MANIFEST, id: "corpus-git-ledger" });
  await writeFile(join(directory, PLUGIN_MANIFEST_ENTRY), JSON.stringify(manifest));
  await writeFile(join(directory, PLUGIN_MAIN_ENTRY), "orb.host(1);");
  await git(directory, at, ["add", "--", PLUGIN_MANIFEST_ENTRY, PLUGIN_MAIN_ENTRY]);
  await git(directory, at, ["commit", "-m", "Native plugin source"]);
  const requests: string[] = [];
  const execute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== new URL(CORPUS_PLUGIN_GIT_URL).origin) {
      throw new Error("unscripted Git protocol origin");
    }
    requests.push(`${request.method} ${url.pathname}${url.search}`);
    if (request.method === "GET" && request.url === `${CORPUS_PLUGIN_GIT_URL}/info/refs?service=git-upload-pack`) {
      const refs = await git(directory, at, ["upload-pack", "--stateless-rpc", "--advertise-refs", "."]);
      const header = "# service=git-upload-pack\n";
      const prefix = Buffer.from(`${(Buffer.byteLength(header) + 4).toString(16).padStart(4, "0")}${header}0000`);
      return new Response(Uint8Array.from(Buffer.concat([prefix, refs])), { headers: { "content-type": "application/x-git-upload-pack-advertisement" } });
    }
    if (request.method === "POST" && request.url === `${CORPUS_PLUGIN_GIT_URL}/git-upload-pack`) {
      const bytes = await git(directory, at, ["upload-pack", "--stateless-rpc", "."], new Uint8Array(await request.arrayBuffer()));
      return new Response(Uint8Array.from(bytes), { headers: { "content-type": "application/x-git-upload-pack-result" } });
    }
    throw new Error("unscripted Git protocol request");
  };
  return {
    networkExecution: { fetch: execute, resolver: (): Promise<readonly string[]> => Promise.resolve(["93.184.215.14"]) },
    requests,
    advance: async (): Promise<string> => {
      await writeFile(join(directory, PLUGIN_MAIN_ENTRY), 'orb.host(1).log.info("Next native revision");');
      await git(directory, at, ["add", "--", PLUGIN_MAIN_ENTRY]);
      await git(directory, at, ["commit", "-m", "Next native plugin revision"]);
      return (await git(directory, at, ["rev-parse", "HEAD"])).toString("utf8").trim();
    },
  };
}
