// Shared, deliberately conservative English vocabulary for the anime-title Wordle.
// Being in an anime title alone does not make a transliteration, name or invented
// compound a suitable English answer. Extend this list with common English words.
export const COMMON_WORDS = new Set(`
ABOUT ABOVE ACTING ACTION ACTORS ADVENTURE AGAIN AFTER AGAINST AGENTS ALIEN ALIVE ALMOST ALONE ALONG
ALWAYS ANIMAL ANIMALS ANIME ANOTHER ANSWER ANYONE APPEAR APPLE ARENA ARMOR ARROWS ARTIST ASHES
ATTACK AWAKE AWAY BACKUP BAKERY BATTLE BEAST BEASTS BEAUTY BEFORE BEGIN BEHIND BELIEVE BELOW
BETTER BEYOND BLACK BLADES BLIND BLOOD BLOODY BLUE BODIES BOTTLE BOTTLES BRAIN BRAVE BREAK
BRIDGE BRIGHT BROKEN BROTHER BROTHERS BUILD BUNNY BURNING BUSINESS BUTTER CANDLE CANDY CAPTAIN
CASTLE CHAINS CHANCE CHANGE CHAOS CHAPTER CHARM CHASE CHEF CHILD CHILDREN CHOICE CHOSEN CHRONIC
CIRCLE CITY CLASS CLOUD CLOUDS CLOVER COFFEE COLOR COMBAT COMEDY COMING COMPANY CONTROL COOKIE
COUNCIL COURAGE CRASH CRAZY CRIMES CROSS CROWN CRYSTAL CURSE CURSED CUTE DANGER DARKER DARKNESS
DATING DAUGHTER DEATH DEMON DEMONS DESERT DESIGN DESTINY DETECTIVE DEVIL DEVILS DIAMOND DIARIES
DINNER DISASTER DOCTOR DRAGON DREAM DREAMS DREAMING DRESS DRINK DRIVER EARTH EIGHT ELDER EMBER
EMPIRE ENEMY ENERGY ENGINE ENGLISH ENOUGH ESCAPE EVERY EVERYONE FACING FAIRY FALLEN FALLING
FAMILY FAMOUS FANTASY FARMER FATHER FIGHT FIGHTER FIGHTERS FINAL FINALE FINDER FINDING FIRE
FIREFLY FIRST FLAMES FLOWER FLOWERS FLYING FORCE FOREST FOREVER FORGOTTEN FRIEND FRIENDS FUTURE
GAMES GARDEN GHOST GHOSTS GIRLS GLASS GLORY GOLDEN GOBLIN GOBLINS GODDESS GOODBYE GREAT
GREEN GROWING GUARD GUARDIAN GUESS GUILTY HAPPY HARBOR HEART HEARTS HEAVEN HERO HEROES HIDDEN
HIGHER HISTORY HOLIDAY HOME HONEST HONOR HORROR HOTEL HOUSE HUMAN HUMANS HUNTER HUNTERS ICE
IDEAL INSIDE INHUMANS INVASION ISLAND JOKER JOURNEY JUDGE JUSTICE KNIGHT KNIGHTS LADIES LADY
LATER LEADER LEGACY LEGEND LEGENDS LETTER LIGHT LIGHTS LITTLE LIVING LONELY LOOKING LOST
LOVER LOVERS LUCKY MAGIC MAGICAL MAIDEN MAIDENS MAJOR MASTER MEADOW MEMORY MERCY METAL
MIDNIGHT MIGHTY MIRROR MISSING MISSION MODERN MONSTER MONSTERS MOON MORNING MOTHER MOUNTAIN
MURDER MYSTERY NATION NATURAL NATURE NEARBY NEVER NIGHT NIGHTS NINJA NOBLE NORMAL NORTH
NUMBER OCEAN OFFICER ONCE ORDER OTHER OTHERS OUTSIDE OVERLORD PALACE PAPER PARADISE PART
PEACE PEEPS PEOPLE PERFECT PHANTOM PIRATE PIRATES PLANET PLANTS PLAYER PLAYERS PLEASE POISON
POLICE POTION POTIONS POWER POWERS PRINCE PRINCESS PRISON PRIVATE PROMISE PROTECT PSYCHIC
PUZZLE QUEEN QUEST QUIET RABBIT RACING RAILROAD RAIN RAINBOW RAMPARTS REBORN RECIPE RED
RETURN RETURNER REVENGE RIDDLE RIDER RIDERS RISING RIVAL RIVALS ROBOT ROBOTS ROMANCE ROYAL
RULES RUNNER SAINT SCHOOL SCIENCE SECRET SECRETS SEASON SECOND SHADOW SHADOWS SHIELD SHINE
SHINING SHIP SISTER SISTERS SKIES SLEEP SLEEPING SMILE SNOW SOLDIER SOLDIERS SOUL SOULS
SPACE SPARK SPIRIT SPIRITS SPECIAL SPEED SPELL SPELLS SPIDER STAR STARS STORM STORY STRANGE
STREET STRONG STUDENT STUDENTS SUMMER SUMMON SUMMONER SUNLIGHT SUPER SWORD SWORDS SYSTEM
TALES TEACHER TEARS TEMPLE THIEF THINGS THIRSTY THREE THRONE TIGER TIME TIMES TOWER
TRAIN TRAVEL TREASURE TRIAL TRICK TRUTH TWILIGHT UNDER UNKNOWN UNTIL VALLEY VAMPIRE VAMPIRES
VICTORY VILLAGE VILLAIN VILLAINS VIOLET VISION VOICE WARRIOR WARRIORS WATER WEAPON WEAPONS
WEDDING WELCOME WEST WHITE WILDERNESS WINTER WITCH WITCHES WIZARD WIZARDS WONDER WONDERFUL
WORLD WORLDS WRITER YOUNGER YOUTH ZOMBIE ZOMBIES`.trim().split(/\s+/));

// Restrict both *answers* and *guesses* to English words really present as
// complete tokens in a supplied English anime title. We never guess from romaji.
export function englishTitleWords(title) {
  const tokens = String(title || '').normalize('NFKD').match(/[A-Za-z]+/g) || [];
  return [...new Set(tokens.map(w => w.toUpperCase()).filter(w =>
    w.length >= 5 && w.length <= 8 && COMMON_WORDS.has(w)))];
}
export function titleEntries(items, from) {
  const words = new Map();
  for (const entry of items || []) {
    const title = typeof entry === 'string' ? entry : entry?.title;
    if (!title) continue;
    const source = typeof entry === 'string' ? from : entry.from || from;
    for (const word of englishTitleWords(title))
      if (!words.has(word)) words.set(word, {word, title, from:source});
  }
  return [...words.values()];
}
export function approvedDailyEntries(items) {
  return (items || []).filter(entry => entry && typeof entry.word === 'string' &&
    englishTitleWords(entry.title).includes(entry.word.toUpperCase()))
    .map(entry => ({...entry, word:entry.word.toUpperCase()}));
}
export function scoreGuess(guess, answer) {
  const result = Array(answer.length).fill('miss'), left = {};
  for (let i=0;i<answer.length;i++) {
    if(guess[i]===answer[i]) result[i]='hit';
    else left[answer[i]]=(left[answer[i]]||0)+1;
  }
  for (let i=0;i<answer.length;i++)
    if(result[i]!=='hit' && left[guess[i]]) {result[i]='near';left[guess[i]]--;}
  return result;
}
export function hardHintError(candidate, previous, answer) {
  const required = {};
  for (const guess of previous) {
    const marks = scoreGuess(guess,answer), tally={};
    for (let i=0;i<guess.length;i++) {
      if(marks[i]==='hit' && candidate[i]!==guess[i])
        return `Position ${i+1} muss ${guess[i]} bleiben.`;
      if(marks[i]==='near' && candidate[i]===guess[i])
        return `${guess[i]} darf nicht wieder an Position ${i+1} stehen.`;
      if(marks[i]!=='miss') tally[guess[i]]=(tally[guess[i]]||0)+1;
    }
    for (const [letter,n] of Object.entries(tally))
      required[letter]=Math.max(required[letter]||0,n);
  }
  for (const [letter,n] of Object.entries(required))
    if([...candidate].filter(c=>c===letter).length<n)
      return `Verwende ${letter} mindestens ${n}×.`;
  return '';
}
export function hashWord(text) {
  let x=2166136261;
  for (const c of String(text)) {x^=c.charCodeAt(0);x=Math.imul(x,16777619);}
  return x>>>0;
}
export function pickEntry(pool,index,seed) {
  if (!pool.length) throw new Error('Keine passenden englischen Titelwörter gefunden.');
  // Stable rotation with no repeated word until a full cycle has finished.
  const sorted=[...pool].sort((a,b)=>hashWord(seed+':'+a.word)-hashWord(seed+':'+b.word) ||
    a.word.localeCompare(b.word));
  return sorted[index%sorted.length];
}
