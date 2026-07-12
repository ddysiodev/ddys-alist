import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createDdysClient } from './client.mjs';
import { normalizeOptions } from './config.mjs';
import { buildMediaFiles, buildMovieDirectoryName, listSourceMovies, sanitizeName, sourceDirectoryName } from './library.mjs';

const MARKER_FILE = '.ddys-alist.json';

export async function exportLibrary(options = {}, runtime = {}) {
  const settings = normalizeOptions(options);
  const outputDir = path.resolve(options.outputDir || options.outDir || 'ddys-library');
  const clean = Boolean(options.clean ?? settings.cleanExport);
  const client = runtime.client || createDdysClient(settings, runtime);
  const outputs = [];

  if (clean) {
    await cleanOutputDir(outputDir, Boolean(options.forceClean));
  }
  await fs.mkdir(outputDir, { recursive: true });
  await writeJson(path.join(outputDir, MARKER_FILE), {
    package: 'ddys-alist',
    version: '0.1.0',
    generatedAt: new Date().toISOString()
  });

  for (const sourceId of settings.sources) {
    outputs.push(...await exportSource(client, settings, sourceId, outputDir, runtime.signal));
  }
  for (const query of settings.searchQueries) {
    outputs.push(...await exportSearch(client, settings, query, outputDir, runtime.signal));
  }

  const manifest = {
    ok: true,
    generatedAt: new Date().toISOString(),
    outputDir,
    files: outputs.length,
    sources: settings.sources,
    searchQueries: settings.searchQueries
  };
  await writeJson(path.join(outputDir, 'manifest.json'), manifest);
  return { ...manifest, outputs };
}

export async function syncLibrary(options = {}, runtime = {}) {
  return exportLibrary({ ...options, clean: true }, runtime);
}

async function exportSource(client, settings, sourceId, outputDir, signal) {
  const outputs = [];
  const sourceDir = path.join(outputDir, sourceDirectoryName(sourceId));
  await fs.mkdir(sourceDir, { recursive: true });
  const maxPages = sourceId === 'latest' || sourceId === 'hot' ? 1 : settings.exportPages;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await listSourceMovies(client, sourceId, settings, { page: pageNumber, signal });
    outputs.push(...await exportMovieList(client, settings, page.data, pageNumber > 1 ? path.join(sourceDir, `page-${pageNumber}`) : sourceDir, signal));
    if (page.totalPages <= pageNumber) break;
  }
  return outputs;
}

async function exportSearch(client, settings, query, outputDir, signal) {
  const outputs = [];
  const searchDir = path.join(outputDir, sourceDirectoryName('search'), sanitizeName(query, 'query'));
  await fs.mkdir(searchDir, { recursive: true });
  for (let pageNumber = 1; pageNumber <= settings.exportPages; pageNumber += 1) {
    const page = await listSourceMovies(client, 'search', settings, { query, page: pageNumber, signal });
    outputs.push(...await exportMovieList(client, settings, page.data, pageNumber > 1 ? path.join(searchDir, `page-${pageNumber}`) : searchDir, signal));
    if (page.totalPages <= pageNumber) break;
  }
  return outputs;
}

async function exportMovieList(client, settings, movies, baseDir, signal) {
  const outputs = [];
  await fs.mkdir(baseDir, { recursive: true });
  for (const movie of movies) {
    const bundle = await client.detailBundle(movie.slug, signal);
    if (!bundle.movie.slug) bundle.movie.slug = movie.slug;
    const mergedMovie = { ...movie, ...bundle.movie, slug: bundle.movie.slug || movie.slug };
    const files = buildMediaFiles({ ...bundle, movie: mergedMovie }, settings);
    const itemDir = path.join(baseDir, buildMovieDirectoryName(mergedMovie));
    await fs.mkdir(itemDir, { recursive: true });
    for (const file of files) {
      if (file.kind === 'redirect' || file.kind === 'proxy') continue;
      const target = path.join(itemDir, file.name);
      await fs.writeFile(target, file.body, 'utf8');
      outputs.push(target);
    }
  }
  return outputs;
}

async function cleanOutputDir(outputDir, forceClean) {
  try {
    const marker = path.join(outputDir, MARKER_FILE);
    await fs.access(marker);
  } catch {
    if (!forceClean) {
      try {
        await fs.access(outputDir);
        throw new Error(`Refusing to clean unmarked directory: ${outputDir}`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  await fs.rm(outputDir, { recursive: true, force: true });
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
