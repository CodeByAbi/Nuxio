import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Redact anything that looks like a credential, wherever it appears in the
 * log object (top-level or nested under any key) — never log passwords,
 * tokens, or API/service-role keys, even by accident via a spread object.
 */
const REDACT_KEYS = ["password", "token", "key", "apiKey", "secret", "authorization", "cookie"];
const redactPaths = REDACT_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]);

const logger = pino({
  name: "nuxio",
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: redactPaths,
    censor: "[REDACTED]",
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
