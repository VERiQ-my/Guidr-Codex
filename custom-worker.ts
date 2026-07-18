// The OpenNext handler is generated during `npm run deploy`.
// @ts-expect-error .open-next is build output.
import handler from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
};

// Retained for the Durable Object class already registered with this Worker.
export { ScanRunner } from "./workers/scan-do";