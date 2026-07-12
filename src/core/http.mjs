import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDdysClient } from './client.mjs';
import { describePublicOptions, normalizeOptions, optionsFromEnv, safeJson } from './config.mjs';
import { createWebDavHandler } from './webdav.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function createFetchHandler(options = {}, runtime = {}) {
  const settings = normalizeOptions({ ...optionsFromEnv(runtime.env || process.env), ...options });
  const client = runtime.client || createDdysClient(settings, runtime);
  const webdav = createWebDavHandler(settings, { ...runtime, client });

  return async function handle(request) {
    const url = new URL(request.url);
    if (url.pathname === settings.davPath || url.pathname.startsWith(`${settings.davPath}/`)) {
      return webdav(request);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return htmlResponse(renderHome(settings));
    }
    if (url.pathname === '/healthz') {
      return jsonResponse({ ok: true, package: 'ddys-alist' });
    }
    if (url.pathname === '/manifest.json') {
      return jsonResponse(buildManifest(settings));
    }
    if (url.pathname === '/config.json') {
      return jsonResponse(describePublicOptions(settings));
    }
    if (url.pathname === '/alist/storage.json' || url.pathname === '/openlist/storage.json') {
      return jsonResponse(buildStorageExample(settings));
    }
    if (url.pathname === '/diagnostics') {
      const diagnostics = await client.diagnostics(request.signal);
      return jsonResponse({ ...diagnostics, webdav: describePublicOptions(settings) });
    }
    if (url.pathname === '/icon.png') {
      return new Response(await readFile(path.join(rootDir, 'assets', 'icon.png')), {
        status: 200,
        headers: corsHeaders('image/png')
      });
    }
    return new Response('Not Found\n', { status: 404, headers: corsHeaders('text/plain; charset=utf-8') });
  };
}

export async function startNodeServer(options = {}, runtime = {}) {
  const env = runtime.env || process.env;
  const settings = normalizeOptions({ ...optionsFromEnv(env), ...options });
  const host = options.host || env.DDYS_HOST || '127.0.0.1';
  const port = Number(options.port || env.DDYS_PORT || 3219);
  const handler = createFetchHandler(settings, runtime);

  const server = http.createServer(async (req, res) => {
    try {
      const request = nodeRequestToWebRequest(req);
      const response = await handler(request);
      await writeWebResponse(res, response);
    } catch (error) {
      const body = safeJson({ ok: false, error: error.message || String(error) });
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(body);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
  return { server, url, settings };
}

function nodeRequestToWebRequest(req) {
  const host = req.headers.host || '127.0.0.1';
  const url = new URL(req.url || '/', `http://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(', '));
    else if (value !== undefined) headers.set(key, String(value));
  }
  const init = { method: req.method || 'GET', headers };
  if (!['GET', 'HEAD'].includes(init.method.toUpperCase())) {
    init.body = req;
    init.duplex = 'half';
  }
  return new Request(url, init);
}

async function writeWebResponse(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  if (response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } else {
    res.end();
  }
}

function jsonResponse(value, status = 200) {
  return new Response(safeJson(value), { status, headers: corsHeaders('application/json; charset=utf-8') });
}

function htmlResponse(value) {
  return new Response(value, { status: 200, headers: corsHeaders('text/html; charset=utf-8') });
}

function corsHeaders(contentType = '') {
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'OPTIONS, PROPFIND, GET, HEAD',
    'access-control-allow-headers': 'authorization, content-type, depth, range',
    'accept-ranges': 'bytes'
  };
  if (contentType) headers['content-type'] = contentType;
  return headers;
}

function renderHome(settings) {
  const davUrl = `${settings.publicBase}${settings.davPath}`;
  const storageUrl = `${settings.publicBase}/alist/storage.json`;
  return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DDYS AList</title>
<body>
<h1>DDYS AList/OpenList</h1>
<p>WebDAV: <a href="${davUrl}">${davUrl}</a></p>
<p>AList/OpenList storage example: <a href="${storageUrl}">/alist/storage.json</a></p>
<p>Manifest: <a href="/manifest.json">/manifest.json</a></p>
<p>Health: <a href="/healthz">/healthz</a></p>
<p>Config: <a href="/config.json">/config.json</a></p>
</body>
</html>`;
}

function buildManifest(settings) {
  return {
    name: 'ddys-alist',
    version: '0.1.0',
    description: 'DDYS API virtual WebDAV storage for AList and OpenList',
    icon: `${settings.publicBase}/icon.png`,
    webdav: `${settings.publicBase}${settings.davPath}`,
    alist: `${settings.publicBase}/alist/storage.json`,
    openlist: `${settings.publicBase}/openlist/storage.json`,
    auth: {
      enabled: Boolean(settings.authToken || settings.authPassword),
      username: settings.authUser,
      passwordEnv: 'DDYS_AUTH_PASSWORD',
      tokenEnv: 'DDYS_AUTH_TOKEN'
    },
    features: [
      'readonly-webdav',
      'strm',
      'nfo',
      'url-files',
      'json-metadata',
      'redirect-media-files',
      'optional-proxy-media',
      'ddys-search-path'
    ]
  };
}

function buildStorageExample(settings) {
  return {
    driver: 'WebDav',
    mountPath: settings.alistMountPath,
    order: 0,
    remark: 'DDYS virtual media library',
    addition: {
      address: `${settings.publicBase}${settings.davPath}`,
      username: settings.authUser,
      password: settings.authPassword ? '<DDYS_AUTH_PASSWORD>' : '',
      root_folder_path: '/',
      tls_insecure_skip_verify: false
    },
    notes: [
      '在 AList/OpenList 后台新增 WebDAV 存储，地址填写 address。',
      '如果启用了 DDYS_AUTH_PASSWORD，请填写 username/password。',
      '本服务是只读虚拟媒体库，适合给 AList/OpenList、Infuse、Kodi、TVBox 和媒体库工具挂载。'
    ]
  };
}
