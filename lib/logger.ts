export const logger = {
  info: (event: string, detail?: unknown) => { if (process.env.NODE_ENV !== "production") globalThis.console.info(event, detail); },
  warn: (event: string, detail?: unknown) => { if (process.env.NODE_ENV !== "production") globalThis.console.warn(event, detail); },
  error: (event: string, detail?: unknown) => { if (process.env.NODE_ENV !== "production") globalThis.console.error(event, detail); },
};
