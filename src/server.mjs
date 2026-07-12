import { startNodeServer } from './core/http.mjs';
import { fileURLToPath } from 'node:url';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startNodeServer().then(({ url, settings }) => {
    console.log(JSON.stringify({ ok: true, url, webdav: `${url}${settings.davPath}` }, null, 2));
  }).catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  });
}
