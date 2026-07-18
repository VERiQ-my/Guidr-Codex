// The OpenNext handler is generated during `npm run deploy`.
import handler from "./.open-next/worker.js";

const worker = {
  fetch: handler.fetch,
};

export default worker;

// Retained for the Durable Object class already registered with this Worker.
export { ScanRunner } from "./workers/scan-do";
