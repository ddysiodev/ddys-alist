import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDdysClient } from '../src/core/client.mjs';
import { normalizeOptions } from '../src/core/config.mjs';
import { exportLibrary } from '../src/core/exporter.mjs';
import { buildMediaFiles, buildMovieDirectoryName, sanitizeName } from '../src/core/library.mjs';
import { buildNfo } from '../src/core/nfo.mjs';
import { createWebDavHandler } from '../src/core/webdav.mjs';
import { createFetchHandler } from '../src/core/http.mjs';

const tests = [];

test('normalizes booleans, sources, and search queries', () => {
  const options = normalizeOptions({
    directOnly: '0',
    includeNfo: 'false',
    proxyMedia: 'true',
    sources: 'movie,series,unknown',
    searchQueries: 'matrix; akira'
  });
  assert.equal(options.directOnly, false);
  assert.equal(options.includeNfo, false);
  assert.equal(options.proxyMedia, true);
  assert.deepEqual(options.sources, ['movie', 'series']);
  assert.deepEqual(options.searchQueries, ['matrix', 'akira']);
});

test('sanitizes unsafe file names', () => {
  assert.equal(sanitizeName('a/b:c*? <x>', 'x'), 'a b c x');
});

test('builds escaped NFO metadata', () => {
  const nfo = buildNfo(movie('alpha', 'A & B <Movie>'), []);
  assert.match(nfo, /<movie>/u);
  assert.match(nfo, /A &amp; B &lt;Movie&gt;/u);
});

test('DDYS client reads latest and detail resources', async () => {
  const client = createDdysClient({}, { fetch: mockFetch });
  const latest = await client.latest(2);
  assert.equal(latest.length, 2);
  const movies = await client.movies('movie');
  assert.equal(movies.data.length, 1);
  assert.equal(movies.totalPages, 2);
  const bundle = await client.detailBundle('alpha');
  assert.equal(bundle.movie.title, 'Alpha');
  assert.equal(bundle.sourceGroups[0].items[0].isDirect, true);
  const grouped = await client.detailBundle('beta');
  assert.equal(grouped.sourceGroups[0].name, '线路一');
  assert.equal(grouped.sourceGroups[0].items[0].url, 'https://cdn.example/beta-01.m3u8');
});

test('WebDAV root PROPFIND lists stable source directories', async () => {
  const handler = createWebDavHandler({}, { fetch: mockFetch });
  const response = await handler(new Request('http://local/dav', { method: 'PROPFIND', headers: { depth: '1' } }));
  const body = await response.text();
  assert.equal(response.status, 207);
  assert.match(body, /最新更新/u);
  assert.match(body, /电影/u);
  assert.match(body, /搜索/u);
});

test('WebDAV enforces optional authorization', async () => {
  const handler = createWebDavHandler({ authToken: 'secret' }, { fetch: mockFetch });
  const denied = await handler(new Request('http://local/dav', { method: 'PROPFIND' }));
  assert.equal(denied.status, 401);
  const allowed = await handler(new Request('http://local/dav', { method: 'PROPFIND', headers: { authorization: 'Bearer secret' } }));
  assert.equal(allowed.status, 207);
});

test('WebDAV accepts Basic password auth and rejects malformed Basic auth', async () => {
  const handler = createWebDavHandler({ authUser: 'ddys', authPassword: 'secret' }, { fetch: mockFetch });
  const allowed = await handler(new Request('http://local/dav', {
    method: 'PROPFIND',
    headers: { authorization: `Basic ${Buffer.from('ddys:secret').toString('base64')}` }
  }));
  assert.equal(allowed.status, 207);

  const wrongUser = await handler(new Request('http://local/dav', {
    method: 'PROPFIND',
    headers: { authorization: `Basic ${Buffer.from('other:secret').toString('base64')}` }
  }));
  assert.equal(wrongUser.status, 401);

  const denied = await handler(new Request('http://local/dav', {
    method: 'PROPFIND',
    headers: { authorization: 'Basic not-valid-base64!' }
  }));
  assert.equal(denied.status, 401);
});

test('WebDAV stays read-only for mutating methods', async () => {
  const handler = createWebDavHandler({}, { fetch: mockFetch });
  const response = await handler(new Request('http://local/dav', { method: 'PUT', body: 'x' }));
  assert.equal(response.status, 405);
});

test('WebDAV GET returns STRM body for a media resource', async () => {
  const handler = createWebDavHandler({}, { fetch: mockFetch });
  const item = encodeURIComponent(buildMovieDirectoryName(movie('alpha', 'Alpha')));
  const file = encodeURIComponent('001 - Online - 1080P.strm');
  const response = await handler(new Request(`http://local/dav/${encodeURIComponent('最新更新')}/${item}/${file}`, { method: 'GET' }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'https://cdn.example/alpha.m3u8\n');
});

test('WebDAV HEAD returns file headers without a body', async () => {
  const handler = createWebDavHandler({}, { fetch: mockFetch });
  const item = encodeURIComponent(buildMovieDirectoryName(movie('alpha', 'Alpha')));
  const file = encodeURIComponent('001 - Online - 1080P.strm');
  const response = await handler(new Request(`http://local/dav/${encodeURIComponent('最新更新')}/${item}/${file}`, { method: 'HEAD' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '31');
  assert.equal(await response.text(), '');
});

test('media files include AList-friendly sidecar and direct entries', async () => {
  const client = createDdysClient({}, { fetch: mockFetch });
  const bundle = await client.detailBundle('alpha');
  const files = buildMediaFiles(bundle);
  const names = files.map((file) => file.name);
  assert(names.includes('metadata.json'));
  assert(names.includes('alist-readme.txt'));
  assert(names.includes('001 - Online - 1080P.strm'));
  assert(names.includes('001 - Online - 1080P.url'));
  assert(names.includes('001 - Online - 1080P.json'));
  assert(names.includes('001 - Online - 1080P.m3u8'));
});

test('HTTP handler exposes AList and OpenList helper manifests', async () => {
  const handler = createFetchHandler({ publicBase: 'http://local', authUser: 'ddys', authPassword: 'secret' }, { fetch: mockFetch });
  const storage = await handler(new Request('http://local/alist/storage.json'));
  assert.equal(storage.status, 200);
  const storageJson = await storage.json();
  assert.equal(storageJson.driver, 'WebDav');
  assert.equal(storageJson.addition.address, 'http://local/dav');
  const manifest = await handler(new Request('http://local/manifest.json'));
  assert.equal(manifest.status, 200);
  const manifestJson = await manifest.json();
  assert.equal(manifestJson.name, 'ddys-alist');
  assert.equal(manifestJson.version, '0.1.1');
});

test('WebDAV search path returns query results', async () => {
  const handler = createWebDavHandler({}, { fetch: mockFetch });
  const response = await handler(new Request(`http://local/dav/${encodeURIComponent('搜索')}/matrix/`, { method: 'PROPFIND', headers: { depth: '1' } }));
  const body = await response.text();
  assert.equal(response.status, 207);
  assert.match(body, /Alpha/u);
});

test('WebDAV accepts localized page directory names', async () => {
  const handler = createWebDavHandler({}, { fetch: mockFetch });
  const response = await handler(new Request(`http://local/dav/${encodeURIComponent('电影')}/${encodeURIComponent('第2页')}/`, { method: 'PROPFIND', headers: { depth: '1' } }));
  assert.equal(response.status, 207);
  assert.match(await response.text(), /Alpha/u);
});

test('export writes STRM, NFO, resources, and manifest', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ddys-alist-'));
  try {
    const result = await exportLibrary({ outputDir: tmp, sources: ['movie'], exportPages: 1 }, { fetch: mockFetch });
    assert.equal(result.ok, true);
    const itemDir = path.join(tmp, '电影', buildMovieDirectoryName(movie('alpha', 'Alpha')));
    assert.equal(await read(path.join(itemDir, '001 - Online - 1080P.strm')), 'https://cdn.example/alpha.m3u8\n');
    assert.match(await read(path.join(itemDir, 'metadata.json')), /"title": "Alpha"/u);
    assert.match(await read(path.join(itemDir, 'movie.nfo')), /<movie>/u);
    assert.match(await read(path.join(itemDir, 'resources.txt')), /cdn\.example/u);
    assert.match(await read(path.join(tmp, 'manifest.json')), /"ok": true/u);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('export direct-only omits external STRM entries', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ddys-alist-'));
  try {
    await exportLibrary({ outputDir: tmp, sources: ['movie'], directOnly: true }, { fetch: mockFetch });
    const itemDir = path.join(tmp, '电影', buildMovieDirectoryName(movie('alpha', 'Alpha')));
    const names = await fs.readdir(itemDir);
    assert(names.includes('001 - Online - 1080P.strm'));
    assert(!names.some((name) => name.includes('Cloud')));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('clean export refuses to remove unmarked directories', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ddys-alist-'));
  try {
    await fs.writeFile(path.join(tmp, 'keep.txt'), 'keep', 'utf8');
    await assert.rejects(
      exportLibrary({ outputDir: tmp, sources: ['movie'], clean: true }, { fetch: mockFetch }),
      /Refusing to clean unmarked directory/u
    );
    assert.equal(await read(path.join(tmp, 'keep.txt')), 'keep');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

for (const entry of tests) {
  await entry.fn();
}

console.log(JSON.stringify({ ok: true, tests: tests.length }, null, 2));

function test(name, fn) {
  tests.push({ name, fn });
}

async function read(file) {
  return fs.readFile(file, 'utf8');
}

function movie(slug, title, extra = {}) {
  return {
    slug,
    title,
    poster: '/poster.jpg',
    fanart: '/fanart.jpg',
    year: '2024',
    type_name: 'movie',
    category: 'Action',
    region: 'US',
    actor: 'Actor A / Actor B',
    director: 'Director A',
    intro: 'Overview',
    remarks: 'HD',
    url: `/movie/${slug}`,
    score: '8.5',
    ...extra
  };
}

async function mockFetch(url) {
  const parsed = new URL(url);
  const pathName = parsed.pathname;
  const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

  if (pathName.endsWith('/latest')) {
    return json({ data: [movie('alpha', 'Alpha'), movie('beta', 'Beta', { type_name: 'series' })] });
  }
  if (pathName.endsWith('/hot')) {
    return json({ data: [movie('alpha', 'Alpha')] });
  }
  if (pathName.endsWith('/movies')) {
    const type = parsed.searchParams.get('type');
    const data = type === 'series'
      ? [movie('beta', 'Beta', { type_name: 'series' })]
      : [movie('alpha', 'Alpha')];
    return json({ data: { items: data, pagination: { total: data.length, currentPage: Number(parsed.searchParams.get('page') || 1), pageSize: 24, pages: 2 } } });
  }
  if (pathName.endsWith('/search')) {
    return json({ data: [movie('alpha', 'Alpha')], meta: { total: 1, page: 1, per_page: 24, total_pages: 1 } });
  }
  if (pathName.endsWith('/movies/alpha')) {
    return json({ data: movie('alpha', 'Alpha') });
  }
  if (pathName.endsWith('/movies/beta')) {
    return json({ data: movie('beta', 'Beta', { type_name: 'series' }) });
  }
  if (pathName.endsWith('/movies/alpha/sources')) {
    return json({
      data: {
        play: [
          { name: '1080P', url: 'https://cdn.example/alpha.m3u8' },
          { name: 'Cloud', url: 'https://drive.example/alpha' }
        ],
        download: [
          { name: 'Magnet', url: 'magnet:?xt=urn:btih:1234567890123456789012345678901234567890' }
        ]
      }
    });
  }
  if (pathName.endsWith('/movies/beta/sources')) {
    return json({ data: [{ name: '线路一', items: [{ name: 'EP01', url: 'https://cdn.example/beta-01.m3u8' }] }] });
  }
  if (pathName.endsWith('/related')) {
    return json({ data: [] });
  }
  return new Response(JSON.stringify({ message: `missing fixture ${pathName}` }), { status: 404 });
}
