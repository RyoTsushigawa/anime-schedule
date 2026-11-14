export const CALENDAR_YEAR = 2026;
export function calendarState(now = new Date(), year = CALENDAR_YEAR) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Berlin',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(now).map(p=>[p.type,p.value]));
  const y=Number(parts.year), month=Number(parts.month), day=Number(parts.day);
  const available=y>year?24:y<year||month<12?0:Math.min(day,24);
  return {available,today:y===year&&month===12&&day<=24?day:null};
}
export function readOpened(storage, year = CALENDAR_YEAR) {
  try {const v=JSON.parse(storage.getItem('advent-opened-'+year)||'[]');return new Set(Array.isArray(v)?v.filter(n=>Number.isInteger(n)&&n>=1&&n<=24):[]);} catch {return new Set();}
}
export function writeOpened(storage, opened, year = CALENDAR_YEAR) {
  try {storage.setItem('advent-opened-'+year,JSON.stringify([...opened]));return true;} catch {return false;}
}
