type Args = unknown[];

export const logger = {
  log: (...a: Args) => {
    if (process.env.NODE_ENV !== "production") console.log(...a);
  },
  warn: (...a: Args) => console.warn(...a),
  error: (...a: Args) => console.error(...a),
};
