/**
 * Analysis worker: a second Railway service from this repo, `node worker/index.ts`, same
 * DATABASE_URL, no public domain. Polls the outbox; SIGTERM finishes the current batch and exits.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../server/utils/schema.ts";
import { BATCH_SIZE, jsonLog as log, outboxStats, processBatch, pruneProcessed } from "./process.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const POLL_MS = Number(process.env.WORKER_POLL_MS) || 2_000;
const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS) || 60_000;

const db = drizzle(url, { schema });
let stopping = false;
let wake: (() => void) | null = null;
let processedSinceBeat = 0;

function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  log("info", "stopping after current batch", { signal });
  wake?.();
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      wake = null;
      resolve();
    }
    wake = done;
  });
}

const heartbeat = setInterval(async () => {
  try {
    await pruneProcessed(db);
    log("info", "heartbeat", { processed: processedSinceBeat, ...(await outboxStats(db)) });
    processedSinceBeat = 0;
  } catch (err) {
    log("error", "heartbeat failed", { error: err instanceof Error ? err.message : String(err) });
  }
}, HEARTBEAT_MS);

log("info", "worker started", { pollMs: POLL_MS });

while (!stopping) {
  let full = false;
  try {
    const result = await processBatch(db, { log });
    processedSinceBeat += result.processed;
    if (result.claimed) log("info", "batch done", { ...result });
    full = result.claimed === BATCH_SIZE;
  } catch (err) {
    // Connection or claim failure: the batch rolled back, so just wait and try again.
    log("error", "batch failed", { error: err instanceof Error ? err.message : String(err) });
  }
  if (!full && !stopping) await sleep(POLL_MS);
}

clearInterval(heartbeat);
await db.$client.end();
log("info", "worker stopped");
