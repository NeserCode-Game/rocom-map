const PREFIX = "[rocom-map]";

type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, module: string, scene: string, method: string, data: unknown) {
  const timestamp = new Date().toISOString().slice(11, 23);
  const entry = `${PREFIX} ${timestamp} ${module}::${scene}::${method} ${JSON.stringify(data)}`;
  if (level === "error") {
    console.error(entry);
  } else if (level === "warn") {
    console.warn(entry);
  } else {
    console.log(entry);
  }
}

export const logger = {
  info: (module: string, scene: string, method: string, data: unknown) => log("info", module, scene, method, data),
  warn: (module: string, scene: string, method: string, data: unknown) => log("warn", module, scene, method, data),
  error: (module: string, scene: string, method: string, data: unknown) => log("error", module, scene, method, data),
};
