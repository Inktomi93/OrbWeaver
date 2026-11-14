// How long a failed client read takes to say so: the query client retries it twice on its backoff before the surface shows the failure.
// A CT that fails a read waits this long for the failure state; the default expect timeout is shorter than the backoff on a quiet box.

export const READ_RETRIES_MS = 10_000;
