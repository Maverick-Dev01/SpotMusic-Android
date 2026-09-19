export function rankSearchResults<T extends { name: string; artists: string }>(query: string, tracks: T[]): T[] {
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const wanted = normalize(query);
  const terms = new Set(wanted.split(' '));
  const score = (track: T) => {
    const title = normalize(track.name), artist = normalize(track.artists);
    const tokens = new Set(`${title} ${artist}`.split(' '));
    return (title === wanted || `${title} ${artist}` === wanted || `${artist} ${title}` === wanted ? 2 : 0)
      + [...terms].filter(term => tokens.has(term)).length / terms.size
      - Math.max(0, tokens.size - terms.size) * .01;
  };
  return [...tracks].sort((a, b) => score(b) - score(a));
}
