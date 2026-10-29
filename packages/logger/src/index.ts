export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type LogFields = Record<string, unknown>;

export type Logger = {
  child(bindings: LogFields): Logger;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

type LogSink = {
  write(level: Exclude<LogLevel, "silent">, line: string): void;
};

type LoggerOptions = {
  bindings?: LogFields;
  level?: LogLevel;
  service: string;
  sink?: LogSink;
};

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};
const sensitiveFieldPattern = /(password|secret|token|authorization|apiKey|api_key|webhookUrl|webhook_url)/i;

const defaultSink: LogSink = {
  write(level, line) {
    const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  },
};

export function createLogger(options: LoggerOptions): Logger {
  const minLevel = options.level ?? resolveLogLevel(process.env.LOG_LEVEL);
  const sink = options.sink ?? defaultSink;
  const baseBindings = {
    service: options.service,
    ...(options.bindings ?? {}),
  };

  function shouldWrite(level: Exclude<LogLevel, "silent">): boolean {
    return levelPriority[level] >= levelPriority[minLevel];
  }

  function write(level: Exclude<LogLevel, "silent">, message: string, fields: LogFields = {}) {
    if (!shouldWrite(level)) {
      return;
    }

    const record = {
      timestamp: new Date().toISOString(),
      level,
      ...normalizeFields(baseBindings),
      ...normalizeFields(fields),
      message,
    };

    sink.write(level, JSON.stringify(record, jsonReplacer));
  }

  return {
    child(bindings) {
      return createLogger({
        ...options,
        bindings: {
          ...baseBindings,
          ...bindings,
        },
        level: minLevel,
        sink,
      });
    },
    debug(message, fields) {
      write("debug", message, fields);
    },
    info(message, fields) {
      write("info", message, fields);
    },
    warn(message, fields) {
      write("warn", message, fields);
    },
    error(message, fields) {
      write("error", message, fields);
    },
  };
}

function resolveLogLevel(value: string | undefined): LogLevel {
  if (value === "debug" || value === "info" || value === "warn" || value === "error" || value === "silent") {
    return value;
  }

  return "info";
}

function normalizeFields(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      if (sensitiveFieldPattern.test(key)) {
        return [key, "[redacted]"];
      }

      return [key, value instanceof Error ? serializeError(value) : value];
    }),
  );
}

function serializeError(error: Error): LogFields {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause ? { cause: error.cause instanceof Error ? serializeError(error.cause) : error.cause } : {}),
  };
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  return value;
}
