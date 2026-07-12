# ddys-alist

`ddys-alist` is an independent AList/OpenList adapter for the DDYS API. It exposes a read-only WebDAV virtual media library, so AList and OpenList can mount DDYS through their built-in WebDAV storage without recompiling either project.

## Features

- AList/OpenList WebDAV mount, default path `/dav`
- Home directories for latest, hot, movies, series, anime, variety, documentaries, and search
- Stable item directories: `Title (Year) [slug]`
- Resource files: `.strm`, `.url`, `.json`, and direct media entries
- Media metadata: `movie.nfo`, `tvshow.nfo`, episode NFO, and `metadata.json`
- Artwork URL files and redirectable artwork entries
- Direct media 302 redirects or optional proxy streaming
- Bearer token or Basic username/password authentication
- Cache, pagination, category browsing, and search directories
- Offline STRM/NFO export
- Docker, docker compose, static checks, tests, and Release ZIP

## Run

```bash
node cli/ddys-alist.mjs serve --host 0.0.0.0 --port 3219
```

WebDAV URL:

```text
http://127.0.0.1:3219/dav
```

AList/OpenList storage example:

```text
http://127.0.0.1:3219/alist/storage.json
```

## Docker

```bash
docker compose up -d
```

Important environment variables:

```text
DDYS_API_BASE=https://ddys.io/api/v1
DDYS_SITE_BASE=https://ddys.io
DDYS_PUBLIC_BASE=http://127.0.0.1:3219
DDYS_DAV_PATH=/dav
DDYS_ALIST_MOUNT_PATH=/DDYS
DDYS_AUTH_USER=ddys
DDYS_AUTH_PASSWORD=
DDYS_PROXY_MEDIA=false
```

## AList/OpenList

Create a WebDAV storage in AList/OpenList:

- Driver: WebDAV
- Mount path: `/DDYS`
- Address: `http://your-service:3219/dav`
- Username: `DDYS_AUTH_USER`
- Password: `DDYS_AUTH_PASSWORD`

Leave username and password empty if `DDYS_AUTH_PASSWORD` is not configured.

## Checks

```bash
node tools/check.mjs
node tests/run.mjs
```

## License

MIT
