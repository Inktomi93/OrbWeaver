import { z } from "zod";

// Import before schema construction: even Zod's caught eval probe violates the production CSP.
// The client build groups this module with Zod so every consumer sees it configured; Node keeps its JIT.
z.config({ jitless: true });
