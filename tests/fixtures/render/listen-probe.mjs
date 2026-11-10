import { Server } from 'node:net';

// Preloaded before Vite or the renderer: observe the real SSR process, including
// listeners opened during createServer and the broken-import cleanup path.
const originalListen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  console.error('SSR_LISTEN_ATTEMPT', new Error('net.Server.listen called').stack);
  return Reflect.apply(originalListen, this, args);
};
console.error('SSR_LISTEN_PROBE_READY');
