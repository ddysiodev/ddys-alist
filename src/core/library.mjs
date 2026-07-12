import { flattenResources } from './client.mjs';
import { SOURCE_DEFS, normalizeOptions, sourceLabel } from './config.mjs';
import { buildEpisodeNfo, buildNfo, inferNfoKind } from './nfo.mjs';

export async function listSourceMovies(client, sourceId, options = {}, params = {}) {
  const settings = normalizeOptions(options);
  const source = SOURCE_DEFS[sourceId];
  if (!source) throw new Error(`Unknown source: ${sourceId}`);
  if (sourceId === 'latest') {
    const data = await client.latest(settings.homeLimit, params.signal);
    return pageResult(data, 1, data.length || settings.homeLimit);
  }
  if (sourceId === 'hot') {
    const data = await client.hot(settings.homeLimit, params.signal);
    return pageResult(data, 1, data.length || settings.homeLimit);
  }
  if (sourceId === 'search') {
    return client.search(params.query || '', params.page || 1, settings.pageSize, params.signal);
  }
  return client.movies(source.mediaType, params.page || 1, settings.pageSize, params.signal);
}

export function buildMovieDirectoryName(movie) {
  const title = sanitizeName(movie.title || movie.slug || 'DDYS item', 'DDYS item');
  const year = readYear(movie.year);
  const slug = sanitizeSlug(movie.slug || title);
  const prefix = year ? `${title} (${year})` : title;
  return `${prefix} [${slug}]`;
}

export function parseSlugFromDirectoryName(segment) {
  const match = String(segment || '').match(/\[([^\]]+)\]\s*$/u);
  return match ? match[1] : '';
}

export function buildMediaFiles(bundle, options = {}) {
  const settings = normalizeOptions(options);
  const movie = bundle.movie;
  const allResources = flattenResources(bundle.sourceGroups || []);
  const playable = selectPlayableResources(allResources, movie, settings);
  const files = [];

  files.push(textFile('metadata.json', `${JSON.stringify({ movie, resources: allResources, related: bundle.related || [] }, null, 2)}\n`, 'application/json; charset=utf-8'));
  files.push(textFile('alist-readme.txt', buildAlistReadme(movie, playable, settings), 'text/plain; charset=utf-8'));

  if (settings.includeNfo) {
    const nfoName = inferNfoKind(movie) === 'tvshow' ? 'tvshow.nfo' : 'movie.nfo';
    files.push(textFile(nfoName, buildNfo(movie, allResources, settings), 'application/xml; charset=utf-8'));
  }

  if (settings.includeArtwork) {
    if (movie.poster) {
      files.push(textFile('poster.url', `${movie.poster}\n`, 'text/uri-list; charset=utf-8'));
      files.push(redirectFile('poster.jpg', movie.poster, 'image/jpeg'));
    }
    if (movie.fanart) {
      files.push(textFile('fanart.url', `${movie.fanart}\n`, 'text/uri-list; charset=utf-8'));
      files.push(redirectFile('fanart.jpg', movie.fanart, 'image/jpeg'));
    }
  }

  if (settings.includeResourceText) {
    files.push(textFile('resources.txt', buildResourceReport(movie, allResources), 'text/plain; charset=utf-8'));
  }

  const usedNames = new Set(files.map((file) => file.name.toLowerCase()));
  playable.forEach((resource, index) => {
    const baseName = `${String(index + 1).padStart(3, '0')} - ${resource.groupName ? `${resource.groupName} - ` : ''}${resource.name || 'Play'}`;
    const safeBase = sanitizeName(baseName, `play-${index + 1}`);
    const name = uniqueName(`${safeBase}.strm`, usedNames);
    files.push(textFile(name, `${resource.url}\n`, 'text/plain; charset=utf-8', { resource }));

    if (settings.includeUrlFiles) {
      const urlName = uniqueName(`${safeBase}.url`, usedNames);
      files.push(textFile(urlName, buildInternetShortcut(resource.url), 'application/internet-shortcut; charset=utf-8', { resource }));
    }

    if (settings.includeJsonFiles) {
      const jsonName = uniqueName(`${safeBase}.json`, usedNames);
      files.push(textFile(jsonName, `${JSON.stringify(resource, null, 2)}\n`, 'application/json; charset=utf-8', { resource }));
    }

    const directFile = buildDirectResourceFile(safeBase, resource, settings, usedNames);
    if (directFile) files.push(directFile);

    if (settings.includeNfo && inferNfoKind(movie) === 'tvshow') {
      const episodeName = uniqueName(`${name.replace(/\.strm$/iu, '')}.nfo`, usedNames);
      files.push(textFile(episodeName, buildEpisodeNfo(movie, resource, index + 1), 'application/xml; charset=utf-8', { resource }));
    }
  });

  if (playable.length === 0 && movie.url && settings.includeExternalStrm && !settings.directOnly) {
    files.push(textFile('DDYS page.strm', `${movie.url}\n`, 'text/plain; charset=utf-8'));
  }

  return files;
}

export function selectPlayableResources(resources = [], movie = {}, options = {}) {
  const settings = normalizeOptions(options);
  const selected = [];
  for (const resource of resources) {
    if (!resource.url) continue;
    if (settings.directOnly && !resource.isDirect) continue;
    if (!settings.includeExternalStrm && !resource.isDirect) continue;
    selected.push(resource);
  }
  if (selected.length === 0 && movie.url && settings.includeExternalStrm && !settings.directOnly) {
    selected.push({
      name: 'DDYS page',
      url: movie.url,
      isDirect: false,
      isMagnet: false,
      headers: {},
      groupName: 'External'
    });
  }
  return selected;
}

export function buildResourceReport(movie, resources = []) {
  const lines = [
    movie.title || movie.slug || 'DDYS item',
    movie.url || '',
    ''
  ];
  if (!resources.length) {
    lines.push('No resource URLs returned by the API.');
  }
  resources.forEach((resource, index) => {
    lines.push(`${index + 1}. ${resource.groupName ? `[${resource.groupName}] ` : ''}${resource.name || 'Resource'}`);
    lines.push(`   URL: ${resource.url}`);
    if (resource.isDirect) lines.push('   Type: direct media');
    else if (resource.isMagnet) lines.push('   Type: magnet');
    else lines.push('   Type: external');
    if (resource.headers && Object.keys(resource.headers).length) {
      lines.push(`   Headers: ${JSON.stringify(resource.headers)}`);
    }
  });
  return `${lines.join('\n')}\n`;
}

export function buildSourceRootEntries(options = {}) {
  const settings = normalizeOptions(options);
  const entries = settings.sources.map((id) => ({ id, name: sourceLabel(id) }));
  entries.push({ id: 'search', name: sourceLabel('search') });
  return entries;
}

export function sanitizeName(value, fallback = 'item') {
  const text = String(value || '')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/u, '');
  return (text || fallback).slice(0, 140);
}

export function sanitizeSlug(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 100) || 'item';
}

export function sourceDirectoryName(sourceId) {
  return sanitizeName(sourceLabel(sourceId), sourceId);
}

export function sourceIdFromDirectoryName(segment) {
  const normalized = String(segment || '').toLowerCase();
  for (const [id, def] of Object.entries(SOURCE_DEFS)) {
    const names = [id, def.label, ...(def.aliases || [])].map((item) => String(item || '').toLowerCase());
    if (names.includes(normalized)) return id;
  }
  return '';
}

export function textFile(name, body, contentType = 'text/plain; charset=utf-8', extra = {}) {
  return {
    kind: 'file',
    name,
    contentType,
    size: new TextEncoder().encode(body).length,
    body,
    ...extra
  };
}

export function redirectFile(name, url, contentType = 'application/octet-stream') {
  return {
    kind: 'redirect',
    name,
    contentType,
    size: 0,
    redirectUrl: url
  };
}

export function proxyFile(name, url, contentType = 'application/octet-stream', headers = {}) {
  return {
    kind: 'proxy',
    name,
    contentType,
    size: 0,
    proxyUrl: url,
    proxyHeaders: headers
  };
}

function buildDirectResourceFile(baseName, resource, settings, usedNames) {
  if (!settings.includeRedirectFiles || !resource.url) return null;
  const extension = resourceExtension(resource.url);
  if (!extension) return null;
  const name = uniqueName(`${baseName}.${extension}`, usedNames);
  if (resource.isDirect && /^https?:\/\//iu.test(resource.url)) {
    const type = contentTypeForExtension(extension);
    return settings.proxyMedia
      ? proxyFile(name, resource.url, type, resource.headers || {})
      : redirectFile(name, resource.url, type);
  }
  return textFile(name, `${resource.url}\n`, 'text/plain; charset=utf-8', { resource });
}

function resourceExtension(url) {
  const text = String(url || '').trim();
  if (/^magnet:\?/iu.test(text)) return 'magnet';
  if (/^ed2k:/iu.test(text)) return 'ed2k';
  let pathname = text;
  try {
    pathname = new URL(text).pathname;
  } catch {
    pathname = text.split(/[?#]/u)[0];
  }
  const match = pathname.match(/\.([a-z0-9]{2,6})$/iu);
  const ext = match ? match[1].toLowerCase() : '';
  if (['m3u8', 'mp4', 'm4v', 'mkv', 'mov', 'flv', 'avi', 'ts', 'webm', 'mpd'].includes(ext)) return ext;
  return '';
}

function contentTypeForExtension(extension) {
  return {
    m3u8: 'application/vnd.apple.mpegurl',
    mpd: 'application/dash+xml',
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    mkv: 'video/x-matroska',
    mov: 'video/quicktime',
    flv: 'video/x-flv',
    avi: 'video/x-msvideo',
    ts: 'video/mp2t',
    webm: 'video/webm'
  }[extension] || 'application/octet-stream';
}

function buildInternetShortcut(url) {
  return `[InternetShortcut]\nURL=${url}\n`;
}

function buildAlistReadme(movie, resources, settings) {
  return [
    movie.title || movie.slug || 'DDYS item',
    '',
    'This directory is generated by ddys-alist for AList/OpenList WebDAV mounting.',
    'STRM files are the safest playback entry for media managers.',
    settings.proxyMedia ? 'Direct media files are proxied by ddys-alist.' : 'Direct media files redirect to the original URL.',
    `Resources: ${resources.length}`,
    ''
  ].join('\n');
}

function pageResult(data, page, perPage) {
  return {
    data,
    total: data.length,
    page,
    perPage,
    totalPages: 1
  };
}

function uniqueName(name, usedNames) {
  let candidate = name;
  const ext = candidate.includes('.') ? candidate.replace(/^.*(\.[^.]+)$/u, '$1') : '';
  const stem = ext ? candidate.slice(0, -ext.length) : candidate;
  let index = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${stem} ${index}${ext}`;
    index += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function readYear(value) {
  const match = String(value || '').match(/\d{4}/u);
  return match ? match[0] : '';
}
