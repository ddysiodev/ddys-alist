import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'package.json',
  'README.md',
  'README.en.md',
  'LICENSE',
  '.env.example',
  'Dockerfile',
  'docker-compose.yml',
  'assets/icon.png',
  'index.d.ts',
  '.github/workflows/build.yml',
  'docs/architecture.md',
  'examples/config.example.json',
  'tools/check.mjs',
  'tools/build-package.ps1',
  'tests/run.mjs',
  'cli/ddys-alist.mjs',
  'src/index.mjs',
  'src/server.mjs',
  'src/core/config.mjs',
  'src/core/client.mjs',
  'src/core/library.mjs',
  'src/core/nfo.mjs',
  'src/core/webdav.mjs',
  'src/core/http.mjs',
  'src/core/exporter.mjs'
];

const forbiddenDirs = new Set(['.git', '.wrangler', 'node_modules', 'dist', 'build', 'coverage', 'package', 'bin-output', 'obj']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(relative) {
  try {
    await fs.access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

async function read(relative) {
  return fs.readFile(path.join(root, relative), 'utf8');
}

async function listFiles(dir = root, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (forbiddenDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await listFiles(full, out);
    else out.push(full);
  }
  return out;
}

async function main() {
  for (const file of required) {
    assert(await exists(file), `Missing required file: ${file}`);
  }

  const pkg = JSON.parse(await read('package.json'));
  assert(pkg.name === 'ddys-alist', 'package name mismatch.');
  assert(pkg.version === '0.1.0', 'package version mismatch.');
  assert(pkg.type === 'module', 'package must be ESM.');
  assert(pkg.bin && pkg.bin['ddys-alist'], 'CLI bin missing.');

  const webdav = await read('src/core/webdav.mjs');
  for (const fragment of ['PROPFIND', 'OPTIONS', 'GET', 'HEAD', 'multistatus', 'Basic realm', 'Bearer', 'proxyResponse', '搜索']) {
    assert(webdav.includes(fragment), `WebDAV layer missing ${fragment}.`);
  }

  const exporter = await read('src/core/exporter.mjs');
  for (const fragment of ['exportLibrary', 'syncLibrary', '.ddys-alist.json', 'manifest.json', 'cleanOutputDir']) {
    assert(exporter.includes(fragment), `Exporter missing ${fragment}.`);
  }

  const library = await read('src/core/library.mjs');
  for (const fragment of ['buildMediaFiles', '.strm', '.url', 'metadata.json', 'resources.txt', 'poster.url', 'fanart.url', 'proxyFile', 'directOnly']) {
    assert(library.includes(fragment), `Library layer missing ${fragment}.`);
  }

  const nfo = await read('src/core/nfo.mjs');
  for (const fragment of ['<movie>', '<tvshow>', '<episodedetails>', 'escapeXml']) {
    assert(nfo.includes(fragment), `NFO layer missing ${fragment}.`);
  }

  const client = await read('src/core/client.mjs');
  for (const fragment of ['/latest', '/hot', '/movies', '/search', '/sources', '/related', 'Authorization', 'AbortController', 'movieArrayItems']) {
    assert(client.includes(fragment), `DDYS client missing ${fragment}.`);
  }

  const http = await read('src/core/http.mjs');
  for (const fragment of ['/alist/storage.json', '/openlist/storage.json', '/manifest.json', 'buildStorageExample', 'ddys-alist']) {
    assert(http.includes(fragment), `HTTP layer missing ${fragment}.`);
  }

  const readme = await read('README.md');
  for (const fragment of ['AList', 'OpenList', 'WebDAV', 'STRM', 'NFO', 'Infuse', 'Kodi', 'TVBox', 'ddys-alist']) {
    assert(readme.includes(fragment), `README missing ${fragment}.`);
  }
  assert(!readme.includes('## **开发打包**'), 'README contains unwanted developer packaging section.');

  const files = await listFiles();
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    assert(!relative.endsWith('.env'), 'Environment files must not be included.');
    assert(!relative.includes('/node_modules/'), 'node_modules must not be included.');
    assert(!relative.includes('/package/'), 'package directory must not be included.');
  }

  const allText = (await Promise.all(files
    .filter((file) => /\.(mjs|js|md|json|yml|yaml|ps1|env|Dockerfile)$/i.test(file) || path.basename(file) === 'Dockerfile')
    .map((file) => fs.readFile(file, 'utf8')))).join('\n');
  assert(!/ghp_[A-Za-z0-9_]+/.test(allText), 'GitHub token-like value found.');
  assert(!/github_pat_[A-Za-z0-9_]+/.test(allText), 'GitHub fine-grained token-like value found.');
  assert(!/npm_[A-Za-z0-9_]+/.test(allText), 'npm token-like value found.');
  assert(!/sk-[A-Za-z0-9]{20,}/.test(allText), 'OpenAI token-like value found.');

  console.log(JSON.stringify({ ok: true, package: 'ddys-alist', files: files.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
