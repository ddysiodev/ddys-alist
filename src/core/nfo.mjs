export function buildNfo(movie, resources = [], options = {}) {
  const kind = inferNfoKind(movie);
  const tags = Array.isArray(movie.tags) ? movie.tags : [];
  const actors = splitPeople(movie.actor);
  const directors = splitPeople(movie.director);
  const resourceNotes = resources.length
    ? `<tag>DDYS resources: ${escapeXml(String(resources.length))}</tag>`
    : '';

  if (kind === 'tvshow') {
    return compactXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<tvshow>
  <title>${escapeXml(movie.title)}</title>
  <originaltitle>${escapeXml(movie.title)}</originaltitle>
  <year>${escapeXml(readYear(movie.year))}</year>
  <plot>${escapeXml(movie.overview)}</plot>
  <outline>${escapeXml(movie.remarks)}</outline>
  <premiered>${escapeXml(movie.date)}</premiered>
  <rating>${escapeXml(movie.score ?? '')}</rating>
  <studio>${escapeXml(movie.region)}</studio>
  ${tags.map((tag) => `<genre>${escapeXml(tag)}</genre>`).join('\n  ')}
  ${directors.map((name) => `<director>${escapeXml(name)}</director>`).join('\n  ')}
  ${actors.map((name) => `<actor><name>${escapeXml(name)}</name></actor>`).join('\n  ')}
  ${movie.poster ? `<thumb>${escapeXml(movie.poster)}</thumb>` : ''}
  ${movie.fanart || movie.poster ? `<fanart><thumb>${escapeXml(movie.fanart || movie.poster)}</thumb></fanart>` : ''}
  <uniqueid type="ddys" default="true">${escapeXml(movie.slug)}</uniqueid>
  ${resourceNotes}
</tvshow>`);
  }

  return compactXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<movie>
  <title>${escapeXml(movie.title)}</title>
  <originaltitle>${escapeXml(movie.title)}</originaltitle>
  <year>${escapeXml(readYear(movie.year))}</year>
  <plot>${escapeXml(movie.overview)}</plot>
  <outline>${escapeXml(movie.remarks)}</outline>
  <premiered>${escapeXml(movie.date)}</premiered>
  <rating>${escapeXml(movie.score ?? '')}</rating>
  <country>${escapeXml(movie.region)}</country>
  ${tags.map((tag) => `<genre>${escapeXml(tag)}</genre>`).join('\n  ')}
  ${directors.map((name) => `<director>${escapeXml(name)}</director>`).join('\n  ')}
  ${actors.map((name) => `<actor><name>${escapeXml(name)}</name></actor>`).join('\n  ')}
  ${movie.poster ? `<thumb>${escapeXml(movie.poster)}</thumb>` : ''}
  ${movie.fanart || movie.poster ? `<fanart><thumb>${escapeXml(movie.fanart || movie.poster)}</thumb></fanart>` : ''}
  <uniqueid type="ddys" default="true">${escapeXml(movie.slug)}</uniqueid>
  ${resourceNotes}
</movie>`);
}

export function buildEpisodeNfo(movie, resource, episodeIndex = 1) {
  return compactXml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<episodedetails>
  <title>${escapeXml(resource.name || movie.title)}</title>
  <showtitle>${escapeXml(movie.title)}</showtitle>
  <season>1</season>
  <episode>${escapeXml(String(episodeIndex))}</episode>
  <plot>${escapeXml(movie.overview)}</plot>
  <aired>${escapeXml(movie.date)}</aired>
  ${movie.poster ? `<thumb>${escapeXml(movie.poster)}</thumb>` : ''}
  <uniqueid type="ddys" default="true">${escapeXml(`${movie.slug}-${episodeIndex}`)}</uniqueid>
</episodedetails>`);
}

export function inferNfoKind(movie = {}) {
  const text = `${movie.typeName || ''} ${(movie.tags || []).join(' ')} ${movie.remarks || ''}`.toLowerCase();
  if (/(series|tv|show|episode|season|anime|variety|drama|剧|番|综艺|动漫|动画)/iu.test(text)) return 'tvshow';
  return 'movie';
}

export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function readYear(value) {
  const match = String(value || '').match(/\d{4}/u);
  return match ? match[0] : '';
}

function splitPeople(value) {
  return String(value || '')
    .split(/[\/,;|]/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function compactXml(value) {
  return `${String(value)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
    .join('\n')}\n`;
}
