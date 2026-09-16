import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Vercel builds without env — use placeholder so build succeeds; runtime with
// missing env will show the Forensic Vault onboarding (page.tsx catches query failure).
const rawDatabaseUrl = process.env.DATABASE_URL;
const databaseUrl = rawDatabaseUrl ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder_build";

if (!rawDatabaseUrl) {
  console.warn("[db] DATABASE_URL missing — using placeholder; add DATABASE_URL in Vercel env to enable ledger (see .env.example)");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

// Pool tuning: production defaults to 20 connections (Vercel / serverless burst),
// development defaults to 10 (lower local Postgres load). DB_POOL_MAX env still
// wins if set. 30 s idle timeout avoids churn on bursty agent cycles, 5 s
// connect timeout fails fast on network blips. maxUses recycles connections
// before pg server timeout; keepAlive keeps TCP alive through idle periods.
const defaultPoolMax = process.env.NODE_ENV === "production" ? 20 : 10;
const configuredPoolSize = Number(process.env.DB_POOL_MAX ?? String(defaultPoolMax));
const poolSize = Number.isFinite(configuredPoolSize) ? Math.min(30, Math.max(2, configuredPoolSize)) : defaultPoolMax;

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    max: poolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Recycle each connection after ~7500 uses to bound memory growth and pick up DNS/credential rotation.
    maxUses: 7500,
    keepAlive: true,
    query_timeout: 20_000,
    statement_timeout: 20_000,
    application_name: "recoup-ai",
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_STRICT !== "false" } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
