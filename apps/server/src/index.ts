import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';
import { parseKeepAliveUrl, startKeepAlive } from './services/keep-alive.ts';

const DEFAULT_PORT = 8080;

function readPort(value: string | undefined): number {
  const port = Number(value ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${String(value)}`);
  }
  return port;
}

const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
const app = createApp(existsSync(webDist) ? { staticDir: webDist } : {});
const port = readPort(process.env.PORT);

app.listen(port, () => {
  console.log(`Tailex server listening on http://localhost:${String(port)}`);
});

const keepAliveUrl = process.env.KEEP_ALIVE_URL;
if (keepAliveUrl) {
  startKeepAlive(parseKeepAliveUrl(keepAliveUrl));
}
