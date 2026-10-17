import { readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";

export const NATIVE_QUERY_MUTATIONS = ["file-retarget", "directory-retarget", "dangling", "disappear", "appear", "authored-alias-retarget"] as const;
export const NATIVE_QUERY_TRIGGER = "// changed input selects a fresh worker";

function mutateQueryFileSystem(root: string, mode: (typeof NATIVE_QUERY_MUTATIONS)[number]): void {
  const directory = mode === "directory-retarget";
  let linkName = directory ? "linked" : "dep.ts";
  if (mode === "authored-alias-retarget") {
    linkName = "authored-alias.txt";
  }
  const link = join(root, linkName);
  if (mode === "appear") {
    writeFileSync(join(root, "missing.ts"), "export const value=1;\n");
  } else {
    unlinkSync(link);
    if (mode !== "disappear") {
      let target = directory ? "second" : "second/dep.ts";
      if (mode === "dangling") {
        target = "missing-target.ts";
      }
      symlinkSync(target, link);
    }
  }
}

/** The copied worker's real native query runs exactly once after the closed filesystem intervention. */
export function installNativeQueryMutation(root: string, mode: (typeof NATIVE_QUERY_MUTATIONS)[number]): () => void {
  const original = Project.prototype.getLanguageService;
  const observed = new Set<ReturnType<Project["getLanguageService"]>>();
  const restores: (() => void)[] = [];
  let changed = false;
  const mutate = (): void => {
    if (changed || !readFileSync(join(root, "consumer.ts"), "utf8").includes(NATIVE_QUERY_TRIGGER)) {
      return;
    }
    changed = true;
    mutateQueryFileSystem(root, mode);
    writeFileSync(join(root, ".cache/native-query-mutation.json"), JSON.stringify({ changed }));
  };
  Object.defineProperty(Project.prototype, "getLanguageService", {
    value(this: Project): ReturnType<Project["getLanguageService"]> {
      const service = original.call(this);
      if (!observed.has(service)) {
        observed.add(service);
        const create = service.compilerObject.createReadonlyReferencePass;
        Object.defineProperty(service.compilerObject, "createReadonlyReferencePass", {
          value: (...args: Parameters<typeof create>): ReturnType<typeof create> => {
            const pass = create.apply(service.compilerObject, args);
            const find = pass.findReferences;
            const descriptor = Object.getOwnPropertyDescriptor(pass, "findReferences");
            Object.defineProperty(pass, "findReferences", {
              configurable: true,
              value: (...query: Parameters<typeof find>): ReturnType<typeof find> => {
                mutate();
                return find.apply(pass, query);
              },
            });
            restores.push(() => {
              if (descriptor === undefined) {
                Reflect.deleteProperty(pass, "findReferences");
              } else {
                Object.defineProperty(pass, "findReferences", descriptor);
              }
            });
            return pass;
          },
        });
        restores.push(() => Object.defineProperty(service.compilerObject, "createReadonlyReferencePass", { value: create }));
      }
      return service;
    },
  });
  return () => {
    Object.defineProperty(Project.prototype, "getLanguageService", { value: original });
    for (const restore of restores.toReversed()) {
      restore();
    }
    restores.length = 0;
    observed.clear();
  };
}

/** Only the independent fixture copy changes; its worker/helper bytes remain visible to native startup observation. */
export function instrumentNativeQueryWorker(implementation: string, root: string, mode: (typeof NATIVE_QUERY_MUTATIONS)[number]): void {
  const worker = join(implementation, "tooling/src/floor/compiler/semantic-inventory-worker.ts");
  const original = readFileSync(worker, "utf8");
  const anchor = "const partition = extractInventoryPartition(request);";
  if (original.split(anchor).length !== 2) {
    throw new Error("native query fault fixture no longer matches its actual worker extraction call");
  }
  const helper = new URL("./native-query-mutation.ts", import.meta.url).href;
  writeFileSync(
    worker,
    `import {installNativeQueryMutation} from ${JSON.stringify(helper)};\n${original.replace(
      anchor,
      `const releaseQueryMutation=installNativeQueryMutation(${JSON.stringify(root)},${JSON.stringify(mode)});\nlet partition:ReturnType<typeof extractInventoryPartition>;\ntry{partition=extractInventoryPartition(request);}finally{releaseQueryMutation();}`,
    )}`,
  );
}
