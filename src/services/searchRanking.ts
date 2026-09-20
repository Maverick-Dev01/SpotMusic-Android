// Catalogue search returns the original recording buried under covers, karaoke and
// children's versions (a search for "Blinding Lights" puts The Weeknd seventh).
// There is no popularity signal here, so rank on what the text does reveal.
const VERSION_MARKERS = /\b(remix|nightcore|slowed|reverb|sped up|speed up|8d|cover|karaoke|instrumental|acapella|a cappella|tribute|originally performed|made famous by|in the style of|live|extended mix|mashup|bootleg|lofi|lo-fi|bass boosted|version|1 hour|10 hours|loop)\b/i;

// Labels that exist to publish covers of other artists' songs.
const COVER_FACTORY = /\b(kidz bop|rockabye baby|lullaby|lullabies|lullapop|karaoke|tribute band|the hit crew|ameritz|zzang|piano tribute|string quartet|8-bit|8 bit)\b/i;

export function rankSearchResults<T extends { name: string; artists: string; popularity?: number }>(query: string, tracks: T[]): T[] {
  const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const wanted = normalize(query);
  const terms = new Set(wanted.split(' ').filter(Boolean));
  const queryWantsVersion = VERSION_MARKERS.test(query);

  const score = (track: T) => {
    const title = normalize(track.name);
    const artist = normalize(track.artists);
    const tokens = new Set(`${title} ${artist}`.split(' ').filter(Boolean));

    let value = (title === wanted || `${title} ${artist}` === wanted || `${artist} ${title}` === wanted ? 2 : 0)
      + (terms.size ? [...terms].filter(term => tokens.has(term)).length / terms.size : 0);

    // Unless the query asked for an alternate take, push those below the original.
    if (!queryWantsVersion && VERSION_MARKERS.test(`${track.name} ${track.artists}`)) value -= 1.5;
    if (COVER_FACTORY.test(`${track.name} ${track.artists}`)) value -= 2.5;

    // Spotify's popularity is the only real measure of which recording people
    // actually listen to, so when it is there it outweighs the text heuristics:
    // scaled to 0-3 it can lift the original above an identically titled cover.
    if (typeof track.popularity === 'number' && Number.isFinite(track.popularity)) {
      value += Math.max(0, Math.min(100, track.popularity)) / 100 * 3;
    }

    return value;
  };

  // Sorting is stable, so entries that score the same keep the provider's own
  // relevance order. The previous tie-break subtracted a penalty per extra word,
  // which quietly ranked by how short the artist's name was.
  return [...tracks]
    .map((track, index) => ({ track, index, value: score(track) }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map(entry => entry.track);
}
