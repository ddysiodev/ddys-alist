#!/usr/bin/env node
import process from 'node:process';
import { createDdysClient } from '../src/core/client.mjs';
import { describePublicOptions, normalizeOptions, optionsFromEnv, VERSION } from '../src/core/config.mjs';
import { exportLibrary, syncLibrary } from '../src/core/exporter.mjs';
import { startNodeServer } from '../src/core/http.mjs';

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.positionals[0] || 'help';
  if (parsed.options.help || command === 'help') {
    console.log(helpText());
    return;
  }
  if (command === 'version' || command === '--version') {
    console.log(VERSION);
    return;
  }

  const config = configFromOptions(parsed.options);
  if (command === 'serve') {
    const { url, settings } = await startNodeServer(config);
    console.log(JSON.stringify({ ok: true, url, webdav: `${url}${settings.davPath}` }, null, 2));
    return;
  }

  if (command === 'export') {
    const result = await exportLibrary({ ...config, outputDir: parsed.options.out || parsed.options.outDir });
    console.log(JSON.stringify({ ok: true, outputDir: result.outputDir, files: result.files }, null, 2));
    return;
  }

  if (command === 'sync') {
    const result = await syncLibrary({
      ...config,
      outputDir: parsed.options.out || parsed.options.outDir,
      forceClean: Boolean(parsed.options.force)
    });
    console.log(JSON.stringify({ ok: true, outputDir: result.outputDir, files: result.files }, null, 2));
    return;
  }

  if (command === 'doctor' || command === 'diag') {
    const settings = normalizeOptions({ ...optionsFromEnv(), ...config });
    const client = createDdysClient(settings);
    const diagnostics = await client.diagnostics();
    console.log(JSON.stringify({ ...diagnostics, webdav: describePublicOptions(settings) }, null, 2));
    return;
  }

  if (command === 'routes') {
    const settings = normalizeOptions({ ...optionsFromEnv(), ...config });
    console.log(JSON.stringify({
      webdav: `${settings.publicBase}${settings.davPath}`,
      alistStorageExample: `${settings.publicBase}/alist/storage.json`,
      latest: `${settings.publicBase}${settings.davPath}/最新更新/`,
      hot: `${settings.publicBase}${settings.davPath}/热门内容/`,
      movies: `${settings.publicBase}${settings.davPath}/电影/`,
      search: `${settings.publicBase}${settings.davPath}/搜索/keyword/`
    }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function configFromOptions(options) {
  const config = {};
  const map = {
    apiBase: 'apiBase',
    siteBase: 'siteBase',
    apiKey: 'apiKey',
    publicBase: 'publicBase',
    davPath: 'davPath',
    authToken: 'authToken',
    authUser: 'authUser',
    authPassword: 'authPassword',
    alistMountPath: 'alistMountPath',
    pageSize: 'pageSize',
    homeLimit: 'homeLimit',
    exportPages: 'exportPages',
    webdavPages: 'webdavPages',
    timeoutSeconds: 'timeoutSeconds',
    cacheMinutes: 'cacheMinutes',
    out: 'outputDir',
    outDir: 'outputDir'
  };
  for (const [optionName, configName] of Object.entries(map)) {
    if (options[optionName] !== undefined) config[configName] = options[optionName];
  }
  if (options.source?.length) config.sources = options.source;
  if (options.sources) config.sources = options.sources;
  if (options.search?.length) config.searchQueries = options.search;
  if (options.searches) config.searchQueries = options.searches;
  if (options.clean) config.cleanExport = true;
  if (options.directOnly) config.directOnly = true;
  if (options.noNfo) config.includeNfo = false;
  if (options.noArtwork) config.includeArtwork = false;
  if (options.noResourceText) config.includeResourceText = false;
  if (options.noExternalStrm) config.includeExternalStrm = false;
  if (options.noUrlFiles) config.includeUrlFiles = false;
  if (options.noJsonFiles) config.includeJsonFiles = false;
  if (options.noRedirectFiles) config.includeRedirectFiles = false;
  if (options.proxyMedia) config.proxyMedia = true;
  if (options.host) config.host = options.host;
  if (options.port) config.port = options.port;
  return config;
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }
    const [rawName, inlineValue] = arg.replace(/^--?/, '').split(/=(.*)/s, 2);
    const name = toCamel(rawName);
    if (['help', 'clean', 'force', 'directOnly', 'noNfo', 'noArtwork', 'noResourceText', 'noExternalStrm', 'noUrlFiles', 'noJsonFiles', 'noRedirectFiles', 'proxyMedia'].includes(name)) {
      options[name] = true;
      continue;
    }
    const value = inlineValue !== undefined ? inlineValue : argv[++index];
    if (value === undefined) throw new Error(`Missing value for --${rawName}.`);
    if (['source', 'search'].includes(name)) {
      if (!options[name]) options[name] = [];
      options[name].push(value);
    } else {
      options[name] = value;
    }
  }
  return { options, positionals };
}

function toCamel(value) {
  return String(value || '').replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function helpText() {
  return [
    'ddys-alist',
    '',
    'Usage:',
    '  ddys-alist serve --host 0.0.0.0 --port 3219 --auth-user ddys --auth-password PASSWORD',
    '  ddys-alist export --out ./library --source movie --source series --search matrix',
    '  ddys-alist sync --out ./library --clean --force',
    '  ddys-alist doctor',
    '  ddys-alist routes',
    '  ddys-alist version',
    '',
    'Options:',
    '  --api-base URL          DDYS API base URL',
    '  --site-base URL         DDYS site base URL',
    '  --public-base URL       public service base URL',
    '  --dav-path PATH         WebDAV path, default /dav',
    '  --alist-mount-path PATH AList/OpenList mount path hint, default /DDYS',
    '  --auth-token TOKEN      require Bearer token auth or Basic password auth',
    '  --auth-user USER        Basic auth username',
    '  --auth-password PASS    Basic auth password',
    '  --source NAME           latest, hot, movie, series, anime, variety, documentary',
    '  --sources LIST          comma-separated source list',
    '  --search QUERY          add search export/query directory',
    '  --export-pages N        pages per paged source for export',
    '  --webdav-pages N        visible WebDAV pagination depth',
    '  --direct-only           only emit direct playable media URLs as STRM',
    '  --no-nfo                omit NFO files',
    '  --no-artwork            omit poster/fanart url and redirect entries',
    '  --no-resource-text      omit resources.txt',
    '  --no-external-strm      omit non-direct STRM entries',
    '  --no-url-files          omit .url files',
    '  --no-json-files         omit per-resource .json files',
    '  --no-redirect-files     omit direct media redirect/proxy files',
    '  --proxy-media           proxy direct media files instead of returning 302 redirects'
  ].join('\n');
}
