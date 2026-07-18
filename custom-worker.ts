// The OpenNext handler is generated during `npm run deploy`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore OpenNext generates this module after Next.js type checking.
import handler from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
};

// Retained for the Durable Object class already registered with this Worker.
export { ScanRunner } from "./workers/scan-do";