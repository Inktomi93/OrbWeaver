// The server's own clock as an e2e spec may read it: the Date header the server stamps on its health answer.
// A signup invite's lifetime is measured on the server clock at mint (D259), so a spec sets its expiry against
// this instant rather than the runner's wall clock (Spine-Testing §3). The header has whole-second resolution.

/** The instant the server answered, in epoch milliseconds. */
export async function serverNow(baseUrl: string): Promise<number> {
  const response = await fetch(new URL("/healthz", baseUrl));
  const stamped = Date.parse(response.headers.get("date") ?? "");
  if (Number.isNaN(stamped)) {
    throw new Error(`the server at ${baseUrl} answered /healthz without a Date header`);
  }
  return stamped;
}
