export const VERSION = '0.1.0';

export const SOURCE_DEFS = Object.freeze({
  latest: { id: 'latest', label: '最新更新', aliases: ['latest'], kind: 'list', mediaType: 'mixed' },
  hot: { id: 'hot', label: '热门内容', aliases: ['hot'], kind: 'list', mediaType: 'mixed' },
  movie: { id: 'movie', label: '电影', aliases: ['movies', 'movie'], kind: 'category', mediaType: 'movie' },
  series: { id: 'series', label: '剧集', aliases: ['series', 'tv'], kind: 'category', mediaType: 'series' },
  anime: { id: 'anime', label: '动漫', aliases: ['anime'], kind: 'category', mediaType: 'anime' },
  variety: { id: 'variety', label: '综艺', aliases: ['variety'], kind: 'category', mediaType: 'variety' },
  documentary: { id: 'documentary', label: '纪录片', aliases: ['documentary'], kind: 'category', mediaType: 'documentary' },
  search: { id: 'search', label: '搜索', aliases: ['search'], kind: 'search', mediaType: 'mixed' }
});

export const DEFAULTS = Object.freeze({
  apiBase: 'https://ddys.io/api/v1',
  siteBase: 'https://ddys.io',
  apiKey: '',
  publicBase: 'http://127.0.0.1:3219',
  davPath: '/dav',
  authToken: '',
  authUser: '',
  authPassword: '',
  authRealm: 'DDYS AList',
  userAgent: `ddys-alist/${VERSION}`,
  alistMountPath: '/DDYS',
  pageSize: 24,
  homeLimit: 24,
  exportPages: 1,
  webdavPages: 3,
  timeoutSeconds: 12,
  cacheMinutes: 10,
  enableCache: true,
  includeNfo: true,
  includeArtwork: true,
  includeResourceText: true,
  includeExternalStrm: true,
  includeUrlFiles: true,
  includeJsonFiles: true,
  includeRedirectFiles: true,
  proxyMedia: false,
  directOnly: false,
  cleanExport: false,
  sources: ['latest', 'hot', 'movie', 'series', 'anime', 'variety', 'documentary'],
  searchQueries: []
});

export function optionsFromEnv(env = process.env) {
  return {
    apiBase: env.DDYS_API_BASE,
    siteBase: env.DDYS_SITE_BASE,
    apiKey: env.DDYS_API_KEY,
    publicBase: env.DDYS_PUBLIC_BASE,
    davPath: env.DDYS_DAV_PATH,
    authToken: env.DDYS_AUTH_TOKEN,
    authUser: env.DDYS_AUTH_USER,
    authPassword: env.DDYS_AUTH_PASSWORD,
    authRealm: env.DDYS_AUTH_REALM,
    userAgent: env.DDYS_USER_AGENT,
    alistMountPath: env.DDYS_ALIST_MOUNT_PATH,
    pageSize: env.DDYS_PAGE_SIZE,
    homeLimit: env.DDYS_HOME_LIMIT,
    exportPages: env.DDYS_EXPORT_PAGES,
    webdavPages: env.DDYS_WEBDAV_PAGES,
    timeoutSeconds: env.DDYS_TIMEOUT_SECONDS,
    cacheMinutes: env.DDYS_CACHE_MINUTES,
    enableCache: env.DDYS_ENABLE_CACHE,
    includeNfo: env.DDYS_INCLUDE_NFO,
    includeArtwork: env.DDYS_INCLUDE_ARTWORK,
    includeResourceText: env.DDYS_INCLUDE_RESOURCE_TEXT,
    includeExternalStrm: env.DDYS_INCLUDE_EXTERNAL_STRM,
    includeUrlFiles: env.DDYS_INCLUDE_URL_FILES,
    includeJsonFiles: env.DDYS_INCLUDE_JSON_FILES,
    includeRedirectFiles: env.DDYS_INCLUDE_REDIRECT_FILES,
    proxyMedia: env.DDYS_PROXY_MEDIA,
    directOnly: env.DDYS_DIRECT_ONLY,
    cleanExport: env.DDYS_CLEAN_EXPORT,
    sources: env.DDYS_SOURCES,
    searchQueries: env.DDYS_SEARCH_QUERIES
  };
}

export function normalizeOptions(input = {}) {
  const options = { ...DEFAULTS, ...(input || {}) };
  options.apiBase = normalizeBaseUrl(options.apiBase, DEFAULTS.apiBase);
  options.siteBase = normalizeBaseUrl(options.siteBase, DEFAULTS.siteBase);
  options.publicBase = normalizeBaseUrl(options.publicBase, DEFAULTS.publicBase);
  options.davPath = normalizePath(options.davPath, DEFAULTS.davPath);
  options.apiKey = stringValue(options.apiKey);
  options.authToken = stringValue(options.authToken);
  options.authUser = stringValue(options.authUser);
  options.authPassword = stringValue(options.authPassword);
  options.authRealm = stringValue(options.authRealm) || DEFAULTS.authRealm;
  options.userAgent = stringValue(options.userAgent) || DEFAULTS.userAgent;
  options.alistMountPath = normalizePath(options.alistMountPath, DEFAULTS.alistMountPath);
  options.pageSize = clampInt(options.pageSize, DEFAULTS.pageSize, 1, 100);
  options.homeLimit = clampInt(options.homeLimit, DEFAULTS.homeLimit, 1, 100);
  options.exportPages = clampInt(options.exportPages, DEFAULTS.exportPages, 1, 100);
  options.webdavPages = clampInt(options.webdavPages, DEFAULTS.webdavPages, 1, 20);
  options.timeoutSeconds = clampInt(options.timeoutSeconds, DEFAULTS.timeoutSeconds, 3, 120);
  options.cacheMinutes = clampInt(options.cacheMinutes, DEFAULTS.cacheMinutes, 1, 1440);
  options.enableCache = toBool(options.enableCache, DEFAULTS.enableCache);
  options.includeNfo = toBool(options.includeNfo, DEFAULTS.includeNfo);
  options.includeArtwork = toBool(options.includeArtwork, DEFAULTS.includeArtwork);
  options.includeResourceText = toBool(options.includeResourceText, DEFAULTS.includeResourceText);
  options.includeExternalStrm = toBool(options.includeExternalStrm, DEFAULTS.includeExternalStrm);
  options.includeUrlFiles = toBool(options.includeUrlFiles, DEFAULTS.includeUrlFiles);
  options.includeJsonFiles = toBool(options.includeJsonFiles, DEFAULTS.includeJsonFiles);
  options.includeRedirectFiles = toBool(options.includeRedirectFiles, DEFAULTS.includeRedirectFiles);
  options.proxyMedia = toBool(options.proxyMedia, DEFAULTS.proxyMedia);
  options.directOnly = toBool(options.directOnly, DEFAULTS.directOnly);
  options.cleanExport = toBool(options.cleanExport, DEFAULTS.cleanExport);
  options.sources = normalizeSources(options.sources);
  options.searchQueries = normalizeList(options.searchQueries);
  return options;
}

export function describePublicOptions(options = {}) {
  const settings = normalizeOptions(options);
  return {
    apiBase: settings.apiBase,
    siteBase: settings.siteBase,
    publicBase: settings.publicBase,
    davPath: settings.davPath,
    alistMountPath: settings.alistMountPath,
    authEnabled: Boolean(settings.authToken || settings.authPassword),
    authUser: settings.authUser,
    pageSize: settings.pageSize,
    homeLimit: settings.homeLimit,
    exportPages: settings.exportPages,
    webdavPages: settings.webdavPages,
    cacheMinutes: settings.cacheMinutes,
    includeNfo: settings.includeNfo,
    includeArtwork: settings.includeArtwork,
    includeResourceText: settings.includeResourceText,
    includeExternalStrm: settings.includeExternalStrm,
    includeUrlFiles: settings.includeUrlFiles,
    includeJsonFiles: settings.includeJsonFiles,
    includeRedirectFiles: settings.includeRedirectFiles,
    proxyMedia: settings.proxyMedia,
    directOnly: settings.directOnly,
    sources: settings.sources,
    searchQueries: settings.searchQueries
  };
}

export function normalizeSources(value) {
  const values = normalizeList(value);
  const out = values.filter((item) => SOURCE_DEFS[item] && item !== 'search');
  return out.length ? [...new Set(out)] : [...DEFAULTS.sources];
}

export function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeList(item));
  }

  const text = stringValue(value);
  if (!text) return [];
  return [...new Set(text.split(/[,\n;]/u).map((item) => item.trim()).filter(Boolean))];
}

export function sourceLabel(sourceId) {
  return SOURCE_DEFS[sourceId]?.label || sourceId;
}

export function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['false', '0', 'no', 'off', 'disabled'].includes(text)) return false;
  if (['true', '1', 'yes', 'on', 'enabled'].includes(text)) return true;
  return fallback;
}

export function clampInt(value, fallback, min, max) {
  const number = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(number) || number === 0) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function normalizePath(value, fallback = '/') {
  let text = stringValue(value) || fallback;
  if (!text.startsWith('/')) text = `/${text}`;
  text = text.replace(/\/{2,}/gu, '/').replace(/\/+$/u, '');
  return text || '/';
}

export function normalizeBaseUrl(value, fallback) {
  const text = stringValue(value) || fallback;
  if (!/^https?:\/\//iu.test(text)) return fallback;
  return text.replace(/\/+$/u, '');
}

export function stringValue(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

export function safeJson(value) {
  return JSON.stringify(value, null, 2);
}
