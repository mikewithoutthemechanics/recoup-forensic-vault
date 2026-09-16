import { pool } from "@/db";
import { logEvent, logger } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = performance.now();
  try {
    // Task-required check: pool.query('select 1') proves the pg Pool is live
    await pool.query("select 1");
    const databaseLatencyMs = Math.round((performance.now() - started) * 10) / 10;
    const uptime = Math.round(process.uptime());

    logEvent("health.check", {
      ok: true,
      db: "up",
      latencyMs: databaseLatencyMs,
      poolTotal: pool.totalCount,
    });

    return Response.json(
      {
        // Task-required minimal shape {ok, db, uptime} plus enriched fields
        ok: true,
        db: "up",
        uptime,
        // Enriched / backward-compatible fields
        status: "ready",
        database: { status: "up", latencyMs: databaseLatencyMs },
        pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
        uptimeSeconds: uptime,
        timestamp: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const uptime = Math.round(process.uptime());
    logger.error("health.check failed", {
      ok: false,
      db: "down",
      uptime,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        ok: false,
        db: "down",
        uptime,
        status: "not_ready",
        database: { status: "down" },
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
