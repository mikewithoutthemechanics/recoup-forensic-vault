// src/lib/observability.ts — pino-like simple console logger for Recoup
// Levels mirror pino: trace < debug < info < warn < error < fatal
// Default level is controlled by LOG_LEVEL env (default: info in prod, debug in dev)

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const LOG_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

const CURRENT_LEVEL = LEVEL_ORDER[LOG_LEVEL] ?? LEVEL_ORDER.info;

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= CURRENT_LEVEL;
}

function formatArgs(level: LogLevel, message: string, data?: unknown): unknown[] {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (data !== undefined) {
    // Structured log line — JSON-friendly for aggregators
    return [prefix, message, typeof data === "string" ? data : JSON.stringify(data, null, 0)];
  }
  return [prefix, message];
}

function doLog(level: LogLevel, message: string, data?: unknown): void {
  if (!shouldLog(level)) return;
  const args = formatArgs(level, message, data);
  switch (level) {
    case "trace":
    case "debug":
      console.debug(...args);
      break;
    case "info":
      console.info(...args);
      break;
    case "warn":
      console.warn(...args);
      break;
    case "error":
    case "fatal":
      console.error(...args);
      break;
  }
}

export const logger = {
  trace: (msg: string, data?: unknown) => doLog("trace", msg, data),
  debug: (msg: string, data?: unknown) => doLog("debug", msg, data),
  info: (msg: string, data?: unknown) => doLog("info", msg, data),
  warn: (msg: string, data?: unknown) => doLog("warn", msg, data),
  error: (msg: string, data?: unknown) => doLog("error", msg, data),
  fatal: (msg: string, data?: unknown) => doLog("fatal", msg, data),
  child: (bindings: Record<string, unknown>) => {
    // pino child logger — binds context to every subsequent line
    const prefix = Object.entries(bindings)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(" ");
    return {
      trace: (msg: string, data?: unknown) => doLog("trace", `[${prefix}] ${msg}`, data),
      debug: (msg: string, data?: unknown) => doLog("debug", `[${prefix}] ${msg}`, data),
      info: (msg: string, data?: unknown) => doLog("info", `[${prefix}] ${msg}`, data),
      warn: (msg: string, data?: unknown) => doLog("warn", `[${prefix}] ${msg}`, data),
      error: (msg: string, data?: unknown) => doLog("error", `[${prefix}] ${msg}`, data),
      fatal: (msg: string, data?: unknown) => doLog("fatal", `[${prefix}] ${msg}`, data),
    };
  },
  level: LOG_LEVEL,
};

/**
 * Structured product event logger — use for business/ops events.
 * Emits a single JSON-friendly info line that can be shipped to any aggregator.
 */
export function logEvent(event: string, data?: Record<string, unknown>): void {
  logger.info(event, {
    event,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

export default logger;
