import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Redact anything that looks like a credential, wherever it appears in the
 * log object — never log passwords, tokens, or API/service-role keys, even
 * by accident via a spread object. Pino's built-in `redact.paths` only
 * matches a fixed nesting depth (e.g. `*.token` catches one level, not
 * three), so instead we walk the whole log object recursively at any depth
 * via the `formatters.log` hook below.
 */
const SENSITIVE_KEY_PATTERN = /^(password|token|key|apiKey|secret|authorization|cookie)$/i;

function redactDeep(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, seen));
  }
  if (value !== null && typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactDeep(nested, seen);
    }
    return result;
  }
  return value;
}

const logger = pino({
  name: "nuxio",
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    log(object: Record<string, unknown>): Record<string, unknown> {
      return redactDeep(object, new WeakSet<object>()) as Record<string, unknown>;
    },
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
});

/** Scoped logger for a given module, e.g. `childLogger("transaction-service")`. */
export function childLogger(module: string): pino.Logger {
  return logger.child({ module });
}

export default logger;
