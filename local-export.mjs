// Portable downloads for Anime Schedule's browser-local tracking.
// XML follows the MyAnimeList list-export structure supported by import tools.
// Never substitute an AniList ID for a MyAnimeList ID.
const validId = id => Number.isSafeInteger(Number(id)) && Number(id) > 0;
const validProgress = count => Number.isSafeInteger(Number(count)) && Number(count) >= 0;
const escapeXml = text => String(text ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function exportRows(media, progress = {}) {
  const rows = new Map();
  for (const anime of media) {
    const id = Number(anime?.id);
    if (!validId(id) || rows.has(id)) continue;
    const watched = Number(progress[String(id)] ?? 0);
    const total = Number(anime.episodes) || 0;
    rows.set(id, {
      id,
      idMal: validId(anime.idMal) ? Number(anime.idMal) : null,
      title: String(anime.title?.romaji || anime.title?.english || ('AniList ' + id)),
      episodes: validProgress(total) ? total : 0,
      format: String(anime.format || 'TV'),
      progress: validProgress(watched) ? watched : 0
    });
  }
  return [...rows.values()].sort((a, b) => a.title.localeCompare(b.title, 'de'));
}

export function malImportXml(rows, person) {
  const usable = rows.filter(row => validId(row.idMal));
  const tags = (name, value) => '<' + name + '>' + escapeXml(value) + '</' + name + '>';
  const entries = usable.map(row => {
    const completed = row.episodes > 0 && row.progress >= row.episodes;
    const fields = [
      ['series_animedb_id', row.idMal],
      ['series_title', row.title],
      ['series_type', ({TV:'TV',TV_SHORT:'TV',MOVIE:'Movie',OVA:'OVA',ONA:'ONA',SPECIAL:'Special',MUSIC:'Music'})[row.format] || 'TV'],
      ['series_episodes', row.episodes],
      ['my_id', 0],
      ['my_watched_episodes', row.progress],
      ['my_start_date', '0000-00-00'],
      ['my_finish_date', '0000-00-00'],
      ['my_score', 0],
      ['my_status', completed ? 2 : row.progress ? 1 : 6],
      ['my_rewatching', 0],
      ['my_rewatching_ep', 0],
      // Do not replace an existing entry without the user's explicit decision.
      ['update_on_import', 0]
    ];
    return '  <anime>\n' + fields.map(([tag, value]) => '    ' + tags(tag, value)).join('\n') + '\n  </anime>';
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n<myanimelist>\n  <myinfo>\n    ' +
    tags('user_name', person) + '\n  </myinfo>\n' + entries.join('\n') + '\n</myanimelist>\n';
}

export function localBackup(person, showIds, progress, rows) {
  const safeProgress = {};
  for (const [id, value] of Object.entries(progress || {}))
    if (validId(id) && validProgress(value)) safeProgress[String(Number(id))] = Number(value);
  return {
    format: 'anime-schedule-local-tracker',
    version: 1,
    person,
    savedAt: new Date().toISOString(),
    shows: [...new Set((showIds || []).map(Number).filter(validId))],
    progress: safeProgress,
    media: rows.map(({ id, idMal, title, episodes, format }) => ({ id, idMal, title, episodes, format }))
  };
}

export const malImportInfo = rows => ({
  exported: rows.filter(row => validId(row.idMal)).length,
  omitted: rows.filter(row => !validId(row.idMal)).length
});

/** Verify a local backup before showing any restore controls.
 * An export contains AniList IDs, never MAL IDs, in shows/progress.
 * No local or connected account changes occur during parsing.
 */
export function parseLocalBackup(input) {
  const backup = typeof input === 'string' ? JSON.parse(input) : input;
  if (!backup || typeof backup !== 'object' || Array.isArray(backup) ||
      backup.format !== 'anime-schedule-local-tracker' || backup.version !== 1)
    throw new Error('Keine unterstützte Anime-Schedule-Backup-Datei.');
  if (typeof backup.person !== 'string' || !backup.person.trim() || backup.person.length > 120)
    throw new Error('Im Backup fehlt die Person.');
  if (!Array.isArray(backup.shows) || backup.shows.length > 50 ||
      !backup.progress || typeof backup.progress !== 'object' || Array.isArray(backup.progress) ||
      Object.keys(backup.progress).length > 5000)
    throw new Error('Das Backup enthält ungültige oder zu viele Einträge.');
  const shows = [];
  for (const id of backup.shows) {
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
      throw new Error('Ungültige Anime-ID in der Backup-Liste.');
    if (!shows.includes(id)) shows.push(id);
  }
  const progress = Object.create(null);
  for (const [id, count] of Object.entries(backup.progress)) {
    const numberId = Number(id);
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(numberId) ||
        typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > 10000)
      throw new Error('Ungültiger Episodenstand im Backup.');
    progress[id] = count;
  }
  return { person: backup.person, shows, progress };
}

/** Keep all existing data; advance episodes only when the backup is ahead. */
export function mergeLocalBackup(current, backup, targetPerson) {
  if (!targetPerson || backup.person !== targetPerson)
    throw new Error('Das Backup gehört zu ' + backup.person + ', nicht zu ' + targetPerson + '.');
  const existing = [...new Set((current.shows || []).filter(id => typeof id === 'number' && validId(id)))];
  const shows = [...new Set([...existing, ...backup.shows])];
  if (shows.length > 50)
    throw new Error('Zusammen wären es mehr als 50 manuell hinzugefügte Serien.');
  const progress = Object.create(null);
  for (const [id, count] of Object.entries(current.progress || {})) {
    if (/^[1-9][0-9]*$/.test(id) && validProgress(count)) progress[id] = Number(count);
  }
  let added = 0, advanced = 0;
  for (const [id, count] of Object.entries(backup.progress)) {
    if (!(id in progress)) { progress[id] = count; added++; }
    else if (count > progress[id]) { progress[id] = count; advanced++; }
  }
  return {
    shows, progress, addedShows: shows.length - existing.length,
    addedProgress: added, advancedProgress: advanced
  };
}
