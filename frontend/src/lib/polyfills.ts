import { Buffer } from 'buffer';

// The FastAuth SDK and near-api-js use a bare `Buffer` global, which only
// exists in Node. Expose the polyfill so browser code can call Buffer.from().
const globals = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
globals.Buffer ??= Buffer;
