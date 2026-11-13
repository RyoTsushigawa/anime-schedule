// Everything the site can do, for the list behind "N Funktionen" in the "Mehr" menu (the number is counted
// from this list). One entry = something a person can see or use on its own; options of one setting count
// once, bug fixes and background jobs don't. Add a line here with every new feature.
const SITE_FEATURES = [
  ['Wochenplan', [
    'Guckplan live aus dem Google Sheet der Gruppe', 'Sendezeiten von AniList', 'Release-Zeit, Guck-Zeit oder beide',
    'Deutsche Stream-Links pro Serie', 'Alternative Quellen (AniWorld, SubsPlease, Nyaa, 0neko)', 'Bevorzugter Dienst und Prime-Link-Auswahl',
    'Wochen blättern und „Heute“', 'Angezeigte Tage wählen', 'Eigene Ansicht („Für“: nur die Serien einer Person)',
    'Wer schaut mit (Zuschauer)', 'Offene Folgen', 'Folge abhaken (AniList)', 'MyAnimeList-Verbindung', 'Auto-Abhaken beim Öffnen',
    'Drop-Button', 'Bewerten', 'Hinweise zu Pausen und unbestätigten Zeiten', 'Ersatz bei AniList-Ausfall (letzte gespeicherte Woche)',
    'Als App auf dem Startbildschirm, mit Offline-Kopie und „Neu laden“ bei Updates', 'Nachschlagen (auch mit Spitznamen)',
    'Wochenübersicht pro Person', 'Startet bald (Premieren der nächsten Season)', 'Finale- und „Fortsetzung angekündigt“-Hinweise',
    'Lange und doppelte Folgen', 'Pausen und Recaps im Plan', 'Plan-Check', 'Planänderungen', 'Seriendaten prüfen',
    'Folgennummern vergleichen', 'Falschen Link melden', 'Discord-Nachricht für jeden Tag (Formate, Kopieren)',
    'Spitznamen und Emotes', 'Täglicher Discord-Post um 9 Uhr, bei Änderungen aktualisiert und angepinnt',
    'Warnung im Bot-Kanal, wenn der Tagespost fehlschlägt',
  ]],
  ['Plan bearbeiten', [
    'Bearbeitungszugang (GitHub-Schlüssel)', 'Serien verschieben (einmalig oder dauerhaft), auch per Ziehen', 'Tag bearbeiten',
    'Serie überspringen, mit „Zeiten beibehalten“', 'Verspätungen für alle, mit Gründe-Liste', 'Nachholen: Folgen in den Plan legen',
    'Automatisch einplanen', 'Zeit pro Abend beim Nachholen', 'Pause überspringen, spätere Serien rücken auf', 'Link-Meldungen prüfen und korrigieren', 'Discord-Zustellung',
  ]],
  ['Abwesenheiten', [
    'Abwesenheits-Kalender (Tage, Zeiträume, ab/bis Uhrzeit)', 'Wiederkehrende Abwesenheiten', 'Wochenübersicht der Abwesenheiten',
    'Nach Person filtern', 'Wirkung auf den Plan (überspringen, aufrücken, Namen durchgestrichen)', 'Warum jemand fehlt',
  ]],
  ['Catch-up & Non-seasonal', [
    'Catch-up-Ansicht', 'Catch-up sortieren', 'Anpinnen', 'Mehrere auf einmal ändern und Folgen-Stepper', 'Non-seasonal (eigenes Tempo)',
    'Allein schauen', 'Lokale Liste mit Backup (Export und Import)',
  ]],
  ['Einstellungen & Werkzeuge', [
    'Hell / dunkel', 'Akzentfarben, auch die eigene Guckplan-Farbe', 'Dichte (bequem, kompakt, nur Text)', 'Schriftgröße', 'Hoher Kontrast',
    'Einstellungen exportieren und importieren', 'Datenstand', 'Sync-Verlauf', 'Listen-Check', 'Kontoverbindung prüfen',
    'AniList ↔ MAL vergleichen', 'Hilfe mit Themen und Tastenkürzeln', 'Patch-Notes mit „Letztes neues Feature“', 'Feedback-Link',
  ]],
  ['Season Preview', [
    'Trailer zu jeder Serie', 'Gemeinsam abstimmen (Ja / Vielleicht / Nein)', 'Stimmen mit Namen', 'Filter, die gemerkt werden',
    'Start-Leiste nach Startwoche', 'Cover (AniList, sonst MyAnimeList)', 'Entwürfe, wenn eine Stimme nicht ankam', '„Nächste offene Serie“',
    'Vorschläge für Fortsetzungen', 'Gruppencode', 'Automatische YouTube-Trailer-Playlist', 'Eigene alternative Videos',
  ]],
  ['Watch Planner', [
    'Abendplan aus den Stimmen', 'Ziehen oder Tippen zum Umstellen', 'Gespeicherte Varianten', 'Als Link teilen', 'Testmodus', 'Startwochen',
    'Abwesenheiten als belegte Zeiten',
  ]],
  ['Anime Wrapped', ['Season-Wrapped', 'Jahres-Wrapped', 'Ganze Gruppe', '„Wer ist wer?“', 'Karte als Bild speichern', 'Essen zur Season']],
  ['Tier-Liste & Awards', ['Tier-Liste mit „Für Discord kopieren“', 'Awards-Stimmzettel', 'Geheime Gruppenabstimmung mit „Auflösen“', 'Ruhmeshalle']],
  ['Spiele', ['Spieleseite mit dem heutigen Stand', 'Titel-Rätsel (täglich / endlos, normal / schwer, Hinweise)', 'Anime Cover Quiz',
    'Inhalts-Rätsel mit Archiv und Statistik', 'Anime-Quiz']],
  ['Sonstiges', ['Masterset Tracker', 'McRib bestellen']],
];
