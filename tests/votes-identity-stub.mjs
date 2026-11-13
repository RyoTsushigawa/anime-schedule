// For the votes helper tests: "Wer ist wer" on the site and AniList's "who is this login?", without the network.
// A login token "tok-<name>" belongs to the AniList account <name>.
export const PROFILES = { MaRyo: [{ provider: 'anilist', name: 'RyoTsushigawa' }, { provider: 'anilist', name: 'MilkyWay95' }], Terra: [{ provider: 'anilist', name: 'TerraAni' }] };
const real = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (/wrapped-profiles\.json/.test(u)) return new Response(JSON.stringify(PROFILES));
  if (u === 'https://graphql.anilist.co') {
    const auth = String(new Headers(init.headers).get('Authorization') || '');
    const name = auth.startsWith('Bearer tok-') ? auth.slice(11) : null;
    return new Response(JSON.stringify(name ? { data: { Viewer: { name } } } : { errors: [{ message: 'Invalid token' }] }), { status: name ? 200 : 400 });
  }
  if (u === 'https://api.github.com/repos/RyoTsushigawa/anime-schedule') {
    const ok = String(new Headers(init.headers).get('Authorization')) === 'Bearer owner-key';
    return new Response(JSON.stringify(ok ? { permissions: { push: true } } : {}), { status: ok ? 200 : 401 });
  }
  return real(url, init);
};
