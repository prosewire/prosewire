export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] !== "nodejs" || !process.env["DATABASE_URL"]) return;
  const { runMigrations } = await import("@prosewire/db");
  await runMigrations(process.env["DATABASE_URL"]);
  const { seedInitialData } = await import("./server/seed.ts");
  await seedInitialData();
}
