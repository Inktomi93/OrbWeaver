// `ChildProcess#pid` is `number | undefined`; a spawned child that has a pid is the fixture's contract.

/** The pid of a spawned child. A child that failed to spawn has none, which is a fixture break. */
export function spawnedPid(child: { readonly pid?: number | undefined }): number {
  if (child.pid === undefined) {
    throw new Error("The child process did not spawn: it has no pid");
  }
  return child.pid;
}
