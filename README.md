# ddys-alist

`ddys-alist` 是低端影视 API 的 AList/OpenList 独立适配器。它启动一个只读 WebDAV 虚拟媒体库，AList/OpenList 通过内置 WebDAV 存储挂载，不需要修改或重新编译 AList/OpenList。

## 功能

- AList/OpenList WebDAV 挂载：默认 `/dav`
- 首页目录：最新更新、热门内容、电影、剧集、动漫、综艺、纪录片、搜索
- 影片目录：稳定 `标题 (年份) [slug]` 命名
- 资源文件：`.strm`、`.url`、`.json`、直链媒体入口
- 媒体信息：`movie.nfo`、`tvshow.nfo`、分集 NFO、`metadata.json`
- 海报和背景图：`poster.url`、`fanart.url`、可跳转图片文件
- 播放策略：直链 302 跳转，可选代理直出
- 鉴权：Bearer token 或 Basic 用户名/密码
- 缓存、分页、分类、搜索关键词目录
- 离线导出 STRM/NFO 媒体库
- Docker、docker compose、自检、测试、Release ZIP

## 快速运行

```bash
node cli/ddys-alist.mjs serve --host 0.0.0.0 --port 3219
```

打开：

```text
http://127.0.0.1:3219
```

WebDAV 地址：

```text
http://127.0.0.1:3219/dav
```

AList/OpenList 挂载示例：

```text
http://127.0.0.1:3219/alist/storage.json
```

## Docker

```bash
docker compose up -d
```

常用环境变量：

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

## AList/OpenList 挂载

在 AList/OpenList 后台新增 WebDAV 存储：

- 驱动：WebDAV
- 挂载路径：`/DDYS`
- 地址：`http://你的服务地址:3219/dav`
- 用户名：`DDYS_AUTH_USER`
- 密码：`DDYS_AUTH_PASSWORD`

没有设置 `DDYS_AUTH_PASSWORD` 时可以留空用户名和密码。

## WebDAV 目录

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
    关键词/
```

影片目录示例：

```text
影片名 (2026) [slug]/
  movie.nfo
  metadata.json
  resources.txt
  poster.url
  fanart.url
  001 - Online - 1080P.strm
  001 - Online - 1080P.url
  001 - Online - 1080P.json
  001 - Online - 1080P.m3u8
```

`.strm` 是最通用入口，适合 AList/OpenList、Infuse、Kodi、TVBox、Emby、Jellyfin、Plex 等读取。直链媒体文件默认返回 302 跳转；设置 `DDYS_PROXY_MEDIA=true` 后会由 `ddys-alist` 代理响应。

## 搜索

WebDAV 可以直接访问：

```text
/dav/搜索/matrix/
```

也可以用环境变量预设搜索目录：

```text
DDYS_SEARCH_QUERIES=matrix,akira
```

## 离线导出

```bash
node cli/ddys-alist.mjs export --out ./DDYS --source movie --source series --search matrix
node cli/ddys-alist.mjs sync --out ./DDYS --force
```

导出的目录同样包含 STRM、NFO、URL、JSON 和资源说明文件。

## 检查

```bash
node tools/check.mjs
node tests/run.mjs
```

## License

MIT
