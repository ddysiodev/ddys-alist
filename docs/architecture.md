# Architecture

`ddys-alist` has five layers:

1. `src/core/client.mjs` talks to the DDYS API and normalizes movies, pagination, sources, related items, direct media flags, magnets, and headers.
2. `src/core/library.mjs` converts normalized DDYS data into AList/OpenList-friendly virtual files: STRM, URL, JSON, NFO, artwork, reports, redirect files, and proxy files.
3. `src/core/webdav.mjs` maps the virtual library to read-only WebDAV methods: `OPTIONS`, `PROPFIND`, `GET`, and `HEAD`.
4. `src/core/http.mjs` serves health checks, manifests, AList/OpenList storage examples, icon assets, diagnostics, and the WebDAV handler.
5. `src/core/exporter.mjs` writes the same virtual library to disk for media managers and manual import workflows.

## WebDAV Tree

```text
/dav/
  最新更新/
  热门内容/
  电影/
  剧集/
  动漫/
  综艺/
  纪录片/
  搜索/
    keyword/
```

The slug in `Title (Year) [slug]` is the stable lookup key for detail and source calls. Display names can change without breaking detail resolution as long as the slug suffix is kept.

## File Strategy

Each item directory can include:

- `movie.nfo` or `tvshow.nfo`
- episode NFO files for series-like resources
- `metadata.json`
- `resources.txt`
- `poster.url`, `fanart.url`
- redirectable poster/fanart files
- one `.strm` file per playable resource
- one `.url` and `.json` sidecar per resource
- optional direct media files that return 302 or proxy upstream bytes

## AList/OpenList Strategy

The project does not depend on AList/OpenList internal driver APIs. It exposes a standard WebDAV service and a helper response at `/alist/storage.json`, so users can mount it with the built-in WebDAV storage in AList/OpenList.

## Authentication

When `authPassword` is set, Basic auth requires that password and optionally the configured `authUser`. When `authToken` is set, Bearer auth and `?token=` are accepted. The service remains read-only; mutating WebDAV methods return `405`.

## Export Safety

`sync` uses clean export mode. It refuses to delete an existing output directory unless the directory contains `.ddys-alist.json` or `--force` is provided.
