import { Queue, Worker } from "bullmq";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "@prosewire/db";

const redisUrl = new URL(process.env["REDIS_URL"] ?? "redis://localhost:6379");
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || "6379"),
  ...(redisUrl.password ? { password: redisUrl.password } : {}),
};

const queue = new Queue("prosewire-publishing", { connection });
await queue.upsertJobScheduler(
  "publish-scheduled-posts",
  { every: 30_000 },
  { name: "publish-scheduled", data: {} },
);

const worker = new Worker(
  "prosewire-publishing",
  async (job) => {
    if (job.name !== "publish-scheduled") return;
    const now = new Date();
    const published = await getDb()
      .update(schema.post)
      .set({ status: "published", publishedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.post.status, "scheduled"),
          isNotNull(schema.post.scheduledAt),
          lte(schema.post.scheduledAt, now),
        ),
      )
      .returning({ id: schema.post.id, title: schema.post.title });
    if (published.length) process.stdout.write(`Published ${String(published.length)} scheduled post(s).\n`);
  },
  { connection },
);

worker.on("failed", (job, error) => {
  process.stderr.write(`Job ${job?.id ?? "unknown"} failed: ${error.message}\n`);
});

async function shutdown(): Promise<void> {
  await worker.close();
  await queue.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
process.stdout.write("Prosewire publishing worker is ready.\n");
