// The one retry ladder for reads and announces that recover a live stream after a drop.

const RECOVERY_RETRY_FIRST_MS = 250;
const RECOVERY_RETRY_SECOND_MS = 750;

/** Three attempts over about a second: enough to outlive a flap that survives the reconnect by a beat, short enough that nothing waits on it. */
export const RECOVERY_RETRY_BACKOFF_MS = [RECOVERY_RETRY_FIRST_MS, RECOVERY_RETRY_SECOND_MS] as const;
