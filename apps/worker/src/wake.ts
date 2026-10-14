import { requestWorkerWake } from "@prosewire/jobs/worker-wake";

// A deployment-owned recovery job must fail visibly rather than treating a
// missing endpoint or failed wake as a successful scheduled run.
if (!process.env["PROSEWIRE_WORKER_WAKE_URL"])
  throw new Error("Recovery job requires PROSEWIRE_WORKER_WAKE_URL");
await requestWorkerWake();
console.info("Worker recovery wake accepted");
