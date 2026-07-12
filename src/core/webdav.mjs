import { createDdysClient } from './client.mjs';
import { normalizeOptions, sourceLabel } from './config.mjs';
import {
  buildMediaFiles,
  buildMovieDirectoryName,
  buildSourceRootEntries,
  listSourceMovies,
  parseSlugFromDirectoryName,
  sanitizeName,
  sourceDirectoryName,
  sourceIdFromDirectoryName,
  textFile
} from './library.mjs';
import { escapeXml } from './nfo.mjs';

const DAV_HEADERS = {
  dav: '1, 2',
  allow: 'OPTIONS, PROPFIND, GET, HEAD',
  'ms-author-via': 'DAV',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'OPTIONS, PROPFIND, GET, HEAD',
  'access-control-allow-headers': 'authorization, content-type, depth, range',
  'accept-ranges': 'bytes'
};

export function createWebDavHandler(options = {}, runtime = {}) {
  const settings = normalizeOptions(options);
  const client = runtime.client || createDdysClient(settings, runtime);
  return (request) => handleWebDavRequest(request, settings, { ...runtime, client });
}

export async function handleWebDavRequest(request, options = {}, runtime = {}) {
  const settings = normalizeOptions(options);
  const client = runtime.client || createDdysClient(settings, runtime);
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: DAV_HEADERS });
  }

  if (!isAuthorized(request, settings)) {
    return unauthorized(settings);
  }

  if (!['PROPFIND', 'GET', 'HEAD'].includes(method)) {
    return new Response('Method Not Allowed\n', { status: 405, headers: DAV_HEADERS });
  }

  let segments;
  try {
    segments = pathSegmentsForRequest(request, settings);
  } catch (error) {
    return new Response(`${error.message}\n`, { status: 400, headers: DAV_HEADERS });
  }

  const node = await resolveNode(segments, settings, client, request.signal);
  if (!node) {
    return new Response('Not Found\n', { status: 404, headers: DAV_HEADERS });
  }

  if (method === 'PROPFIND') {
    const depth = request.headers.get('depth') || 'infinity';
    const nodes = [node];
    if (node.kind === 'dir' && depth !== '0') {
      nodes.push(...await node.children());
    }
    const body = renderMultiStatus(nodes);
    return new Response(body, {
      status: 207,
      headers: { ...DAV_HEADERS, 'content-type': 'application/xml; charset=utf-8' }
    });
  }

  if (node.kind === 'dir') {
    const children = await node.children();
    const body = `${node.displayName}\n\n${children.map((child) => child.name + (child.kind === 'dir' ? '/' : '')).join('\n')}\n`;
    return new Response(method === 'HEAD' ? null : body, {
      status: 200,
      headers: { ...DAV_HEADERS, 'content-type': 'text/plain; charset=utf-8' }
    });
  }

  if (node.kind === 'redirect') {
    return new Response(null, {
      status: 302,
      headers: { ...DAV_HEADERS, location: node.redirectUrl, 'content-type': node.contentType || 'application/octet-stream' }
    });
  }

  if (node.kind === 'proxy') {
    return proxyResponse(node, request, runtime);
  }

  return new Response(method === 'HEAD' ? null : node.body, {
    status: 200,
    headers: {
      ...DAV_HEADERS,
      'content-type': node.contentType || 'application/octet-stream',
      'content-length': String(node.size ?? new TextEncoder().encode(node.body || '').length)
    }
  });
}

async function resolveNode(segments, settings, client, signal) {
  const rootPath = settings.davPath;
  if (segments.length === 0) {
    return dirNode('DDYS WebDAV', rootPath, async () => [
      ...buildSourceRootEntries(settings).map((entry) => dirNode(entry.name, joinDav(rootPath, sourceDirectoryName(entry.id)), () => resolveRootChild(entry.id, settings, client, signal))),
      textNode('README.txt', joinDav(rootPath, 'README.txt'), rootReadme(settings))
    ]);
  }

  const first = sourceIdFromDirectoryName(segments[0]);
  if (!first) {
    if (segments[0] === 'README.txt') return textNode('README.txt', joinDav(rootPath, 'README.txt'), rootReadme(settings));
    return null;
  }

  if (first === 'search') {
    return resolveSearchNode(segments, settings, client, signal);
  }
  return resolveSourceNode(first, segments.slice(1), settings, client, signal);
}

async function resolveRootChild(sourceId, settings, client, signal) {
  if (sourceId === 'search') {
    return searchRootChildren(settings);
  }
  const page = await listSourceMovies(client, sourceId, settings, { page: 1, signal });
  return sourceListChildren(sourceId, page, 1, settings);
}

async function resolveSourceNode(sourceId, rest, settings, client, signal) {
  const sourcePath = joinDav(settings.davPath, sourceDirectoryName(sourceId));
  if (rest.length === 0) {
    return dirNode(sourceLabel(sourceId), sourcePath, async () => {
      const page = await listSourceMovies(client, sourceId, settings, { page: 1, signal });
      return sourceListChildren(sourceId, page, 1, settings);
    });
  }

  let pageNumber = 1;
  let index = 0;
  const parsedPage = parsePage(rest[0]);
  if (parsedPage) {
    pageNumber = parsedPage;
    index = 1;
  }

  if (rest.length === index) {
    const pagePath = joinDav(sourcePath, `page-${pageNumber}`);
    return dirNode(`${sourceLabel(sourceId)} page ${pageNumber}`, pagePath, async () => {
      const page = await listSourceMovies(client, sourceId, settings, { page: pageNumber, signal });
      return sourceListChildren(sourceId, page, pageNumber, settings);
    });
  }

  const itemSegment = rest[index];
  const slug = parseSlugFromDirectoryName(itemSegment);
  if (!slug) return null;
  const itemPath = joinDav(sourcePath, ...(pageNumber > 1 ? [`page-${pageNumber}`] : []), itemSegment);
  const bundle = await client.detailBundle(slug, signal);
  if (!bundle.movie.slug) bundle.movie.slug = slug;
  const files = buildMediaFiles(bundle, settings).map((file) => withPath(file, joinDav(itemPath, file.name)));
  if (rest.length === index + 1) {
    return dirNode(bundle.movie.title || itemSegment, itemPath, async () => files);
  }
  return files.find((file) => file.name === rest[index + 1]) || null;
}

async function resolveSearchNode(segments, settings, client, signal) {
  const searchPath = joinDav(settings.davPath, sourceDirectoryName('search'));
  if (segments.length === 1) {
    return dirNode(sourceLabel('search'), searchPath, async () => searchRootChildren(settings));
  }

  const query = segments[1];
  let pageNumber = 1;
  let index = 2;
  const parsedPage = parsePage(segments[2]);
  if (parsedPage) {
    pageNumber = parsedPage;
    index = 3;
  }
  const queryPath = joinDav(searchPath, sanitizeName(query, 'query'));

  if (segments.length === 2 || segments.length === 3 && parsedPage) {
    const path = pageNumber > 1 ? joinDav(queryPath, `page-${pageNumber}`) : queryPath;
    return dirNode(`搜索 ${query}`, path, async () => {
      const page = await listSourceMovies(client, 'search', settings, { query, page: pageNumber, signal });
      return sourceListChildren('search', page, pageNumber, settings, query);
    });
  }

  const itemSegment = segments[index];
  const slug = parseSlugFromDirectoryName(itemSegment);
  if (!slug) return null;
  const itemPath = joinDav(queryPath, ...(pageNumber > 1 ? [`page-${pageNumber}`] : []), itemSegment);
  const bundle = await client.detailBundle(slug, signal);
  if (!bundle.movie.slug) bundle.movie.slug = slug;
  const files = buildMediaFiles(bundle, settings).map((file) => withPath(file, joinDav(itemPath, file.name)));
  if (segments.length === index + 1) {
    return dirNode(bundle.movie.title || itemSegment, itemPath, async () => files);
  }
  return files.find((file) => file.name === segments[index + 1]) || null;
}

function sourceListChildren(sourceId, page, pageNumber, settings, query = '') {
  const base = sourceId === 'search'
    ? joinDav(settings.davPath, sourceDirectoryName('search'), sanitizeName(query, 'query'), ...(pageNumber > 1 ? [`page-${pageNumber}`] : []))
    : joinDav(settings.davPath, sourceDirectoryName(sourceId), ...(pageNumber > 1 ? [`page-${pageNumber}`] : []));
  const children = page.data.map((movie) => {
    const name = buildMovieDirectoryName(movie);
    return dirNode(movie.title || name, joinDav(base, name), async () => []);
  });
  const nextPage = pageNumber + 1;
  if (page.totalPages > pageNumber && nextPage <= settings.webdavPages) {
    children.push(dirNode(`page-${nextPage}`, joinDav(sourceId === 'search' ? joinDav(settings.davPath, sourceDirectoryName('search'), sanitizeName(query, 'query')) : joinDav(settings.davPath, sourceDirectoryName(sourceId)), `page-${nextPage}`), async () => []));
  }
  return children;
}

function searchRootChildren(settings) {
  const base = joinDav(settings.davPath, sourceDirectoryName('search'));
  const queryDirs = settings.searchQueries.map((query) => dirNode(query, joinDav(base, sanitizeName(query, 'query')), async () => []));
  return [
    ...queryDirs,
    textNode('README.txt', joinDav(base, 'README.txt'), `Create a URL path like ${settings.davPath}/${sourceDirectoryName('search')}/keyword/ to browse DDYS search results.\n`)
  ];
}

function dirNode(displayName, path, children) {
  const name = path.split('/').filter(Boolean).at(-1) || displayName;
  return { kind: 'dir', name, displayName, path, size: 0, children };
}

function textNode(name, path, body, contentType = 'text/plain; charset=utf-8') {
  return withPath(textFile(name, body, contentType), path);
}

function withPath(file, path) {
  return { ...file, path, displayName: file.name };
}

function renderMultiStatus(nodes) {
  const responses = nodes.map((node) => renderResponse(node)).join('');
  return `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">${responses}</D:multistatus>\n`;
}

function renderResponse(node) {
  const isDir = node.kind === 'dir';
  const contentLength = isDir ? '' : `<D:getcontentlength>${Number(node.size || 0)}</D:getcontentlength>`;
  const contentType = isDir ? '' : `<D:getcontenttype>${escapeXml(node.contentType || 'application/octet-stream')}</D:getcontenttype>`;
  return `
<D:response>
  <D:href>${escapeXml(encodeHref(node.path, isDir))}</D:href>
  <D:propstat>
    <D:prop>
      <D:displayname>${escapeXml(node.displayName || node.name)}</D:displayname>
      <D:resourcetype>${isDir ? '<D:collection/>' : ''}</D:resourcetype>
      <D:getlastmodified>${new Date(0).toUTCString()}</D:getlastmodified>
      ${contentLength}
      ${contentType}
    </D:prop>
    <D:status>HTTP/1.1 200 OK</D:status>
  </D:propstat>
</D:response>`;
}

function pathSegmentsForRequest(request, settings) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/u, '') || '/';
  const root = settings.davPath;
  if (pathname !== root && !pathname.startsWith(`${root}/`)) {
    throw new Error(`Path must be under ${root}.`);
  }
  const tail = pathname.slice(root.length).replace(/^\/+/u, '');
  if (!tail) return [];
  return tail.split('/').map((segment) => decodeURIComponent(segment));
}

function isAuthorized(request, settings) {
  if (!settings.authToken && !settings.authPassword) return true;
  const url = new URL(request.url);
  if (settings.authToken && url.searchParams.get('token') === settings.authToken) return true;
  const authorization = request.headers.get('authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    return Boolean(settings.authToken && token === settings.authToken);
  }
  if (authorization.toLowerCase().startsWith('basic ')) {
    const decoded = decodeBase64(authorization.slice(6).trim());
    if (!decoded.includes(':')) return false;
    const [username = '', password = ''] = decoded.split(/:(.*)/s, 2);
    if (settings.authPassword) {
      return password === settings.authPassword && (!settings.authUser || username === settings.authUser);
    }
    return Boolean(settings.authToken && password === settings.authToken);
  }
  return false;
}

function unauthorized(settings) {
  return new Response('Unauthorized\n', {
    status: 401,
    headers: {
      ...DAV_HEADERS,
      'www-authenticate': `Basic realm="${settings.authRealm}", Bearer`
    }
  });
}

function decodeBase64(value) {
  try {
    if (typeof atob === 'function') return atob(value);
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function encodeHref(path, isDir) {
  const encoded = path.split('/').map((segment, index) => index === 0 ? '' : encodeURIComponent(segment)).join('/');
  return `${encoded || '/'}${isDir && !encoded.endsWith('/') ? '/' : ''}`;
}

function joinDav(...parts) {
  return parts
    .flatMap((part) => String(part || '').split('/'))
    .filter(Boolean)
    .join('/')
    .replace(/^/u, '/');
}

function parsePage(segment) {
  const match = String(segment || '').match(/^(?:page-|第)?(\d+)(?:页)?$/iu);
  if (!match) return 0;
  const page = Number.parseInt(match[1], 10);
  return Number.isFinite(page) && page > 0 ? page : 0;
}

function rootReadme(settings) {
  return [
    'DDYS AList/OpenList virtual WebDAV library',
    '',
    `WebDAV root: ${settings.davPath}`,
    `Public base: ${settings.publicBase}`,
    `AList/OpenList mount path: ${settings.alistMountPath}`,
    'Directories: 最新更新, 热门内容, 电影, 剧集, 动漫, 综艺, 纪录片, 搜索',
    `Search path example: ${settings.davPath}/${sourceDirectoryName('search')}/keyword/`,
    ''
  ].join('\n');
}

async function proxyResponse(node, request, runtime = {}) {
  const fetchImpl = runtime.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return new Response('Proxy fetch is unavailable.\n', { status: 500, headers: DAV_HEADERS });
  }

  const headers = new Headers(node.proxyHeaders || {});
  const range = request.headers.get('range');
  if (range) headers.set('range', range);

  try {
    const upstream = await fetchImpl(node.proxyUrl, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      signal: request.signal
    });
    const responseHeaders = { ...DAV_HEADERS };
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders[key] = value;
    }
    if (!responseHeaders['content-type']) responseHeaders['content-type'] = node.contentType || 'application/octet-stream';
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (error) {
    return new Response(`Proxy failed: ${error.message || String(error)}\n`, { status: 502, headers: DAV_HEADERS });
  }
}
