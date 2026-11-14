// Everything the site can do, for the list behind "N Funktionen" in the "Mehr" menu (the number is counted
// from this list). One entry = something a person can see or use on its own; options of one setting count
// once, bug fixes and background jobs don't. Add a line here with every new feature.
const SITE_FEATURES = [
  ['Wochenplan', [
    'Guckplan live aus dem Google Sheet der Gruppe', 'Sendezeiten von AniList', 'Release-Zeit, Guck-Zeit oder beide',
    'Deutsche Stream-Links pro Serie', 'Alternative Quellen (AniWorld, SubsPlease, Nyaa, 0neko)', 'Bevorzugter Dienst und Prime-Link-Auswahl',
    'Wochen blättern und „Heute“', 'Angezeigte Tage wählen', 'Eigene Ansicht („Für“: nur die Serien einer Person)',
    'Wer schaut mit (Zuschauer)', 'Offene Folgen', 'Gesehene ausblenden (eigene Ansicht)', 'Leere Tage ausblenden', 'Stream-Links eines Tages kopieren', 'Folge abhaken (AniList)', 'MyAnimeList-Verbindung', 'Auto-Abhaken beim Öffnen',
    'Drop-Button (auf Wunsch immer sichtbar)', 'Bewerten', 'Hinweise zu Pausen und unbestätigten Zeiten', 'Ersatz bei AniList-Ausfall (letzte gespeicherte Woche)',
    'Als App auf dem Startbildschirm, mit Offline-Kopie und „Neu laden“ bei Updates', 'Nachschlagen (auch mit Spitznamen), letzte Suchen löschbar',
    'Wochenübersicht pro Person', 'Startet bald (Premieren der nächsten Season)', 'Finale- und „Fortsetzung angekündigt“-Hinweise',
    'Lange und doppelte Folgen', 'Doppelfolgen und lange Folgen automatisch erkannt (zwei Slots)', 'Beendete Serien verschwinden still aus dem Plan', 'Pausen und Recaps im Plan', 'Der Abend auf einen Blick (von–bis, Anzahl Folgen)', '„Erst ab …“, wenn eine Folge nach unserer Guckzeit erscheint', 'Plan-Check', 'Planänderungen', 'Seriendaten prüfen',
    'Folgennummern vergleichen', 'Falschen Link melden', 'Discord-Nachricht für jeden Tag (Formate, Kopieren)',
    'Spitznamen und Emotes', 'Täglicher Discord-Post um 9 Uhr, bei Änderungen aktualisiert und angepinnt', 'Im Discord-Post: gestern an der Börse und offene Season-Preview-Stimmen',
    'Warnung im Bot-Kanal, wenn der Tagespost fehlschlägt',
  ]],
  ['Plan bearbeiten', [
    'Bearbeitungszugang (GitHub-Schlüssel)', 'Serien verschieben (einmalig, bis zu einer Woche oder dauerhaft), auch per Ziehen', 'Warnungen beim Verschieben: Überschneidung, vor der Ausstrahlung', 'Tag bearbeiten',
    'Serie überspringen, mit „Zeiten beibehalten“', 'Verspätungen für alle, mit Gründe-Liste', 'Nachholen: Folgen in den Plan legen',
    'Automatisch einplanen', 'Zeit pro Abend beim Nachholen', 'Pause überspringen, spätere Serien rücken auf', 'Link-Meldungen prüfen und korrigieren', 'Bearbeiter-Zugang für vertraute Leute (ohne den GitHub-Schlüssel)', 'Discord-Zustellung',
  ]],
  ['Abwesenheiten', [
    'Abwesenheits-Kalender (Tage, Zeiträume, ab/bis Uhrzeit)', 'Optionaler Grund für eine Abwesenheit', 'Wiederkehrende Abwesenheiten', 'Wochenübersicht der Abwesenheiten',
    'Nach Person filtern', 'Wirkung auf den Plan (überspringen, aufrücken, Namen durchgestrichen)', 'Warum jemand fehlt', 'Vor dem Speichern: welche Serien betroffen sind', 'Überlappende Wiederholungen markiert', 'Gelöschte Abwesenheit rückgängig machen',
  ]],
  ['Catch-up & Non-seasonal', [
    'Catch-up-Ansicht', 'Catch-up sortieren', 'Anpinnen', '„Später“ für einzelne Serien, einzeln zurückholen', 'Mehrere auf einmal ändern und Folgen-Stepper', 'Non-seasonal (eigenes Tempo)',
    'Allein schauen', 'Lokale Liste mit Backup (Export und Import)',
  ]],
  ['Einstellungen & Werkzeuge', [
    'Hell / dunkel', 'Akzentfarben, auch die eigene Guckplan-Farbe', 'Dichte (bequem, kompakt, nur Text)', 'Schriftgröße', 'Hoher Kontrast',
    'Einstellungen exportieren und importieren', 'Datenstand', 'Sync-Verlauf', 'Listen-Check (auch Fremdeinträge aus dem Guckplan entfernen)', 'Kontoverbindung prüfen',
    'AniList ↔ MAL vergleichen', 'Ausgewählte Einträge von AniList auf MyAnimeList übernehmen', 'Hilfe mit Themen und Tastenkürzeln, immer erreichbar über das ? neben dem Namen', 'Willkommen beim ersten Besuch: drei kurze Schritte', 'Patch-Notes mit „Letztes neues Feature“', 'Feedback-Link',
  ]],
  ['Season Preview', [
    'Trailer zu jeder Serie', 'Gemeinsam abstimmen (Ja / Vielleicht / Nein)', 'Stimmen mit Namen', 'Filter, die gemerkt werden',
    'Start-Leiste nach Startwoche', 'Cover (AniList, sonst MyAnimeList)', 'Entwürfe, wenn eine Stimme nicht ankam', '„Nächste offene Serie“',
    'Vorschläge für Fortsetzungen', 'Gruppencode', 'Automatische YouTube-Trailer-Playlist', 'Gesamtlänge der Trailer an der Playlist', 'Eigene alternative Videos',
  ]],
  ['Watch Planner', [
    'Abendplan aus den Stimmen', 'Ziehen oder Tippen zum Umstellen', 'Gespeicherte Varianten', 'Als Link teilen', 'Testmodus', 'Startwochen',
    'Abwesenheiten als belegte Zeiten',
  ]],
  ['Anime Wrapped', ['Season-Wrapped', 'Jahres-Wrapped', 'Ganze Gruppe', '„Wer ist wer?“', 'Karte als Bild speichern', 'Essen zur Season', 'Börse und Awards im Rückblick']],
  ['Tier-Liste & Awards', ['Tier-Liste mit „Für Discord kopieren“', 'Awards mit 22 Kategorien wie bei den Crunchyroll Awards', 'Eurovision-Punkte: 12, 10 und 8 pro Kategorie',
    'Nominierte durchsuchen (auch Figuren von AniList)', 'Ceddl of the Year: Kandidaten über die Season sammeln', 'Geheime Gruppenabstimmung mit „Auflösen“',
    'Abstimmungsschluss zum Start der nächsten Season', 'Kategorien bewusst auslassen',
    'Punktevergabe-Show: Wertung für Wertung, „… und unsere 12 Punkte gehen an …“', 'Ruhmeshalle']],
  ['Anime-Börse', ['Aktien auf die Season-Anime mit Spielgeld, die ganze Season täglich von 8 bis 22 Uhr handelbar', 'Tägliche Kurse aus AniList und euren eigenen Bewertungen', 'Drops lassen den Kurs fallen, je früher desto stärker',
    'Kurs-Graphen pro Serie und für dein Depot', 'Wall-Street-Regeln: Ordergebühr, T+1, Leerverkäufe, Circuit Breaker', 'Rangliste nach Depotwert', 'Limit-Orders (kaufen oder verkaufen, sobald ein Schlusskurs dein Limit erreicht)', 'Nur für dich: Bestätigung über AniList oder PIN (auch bei den Awards)']],
  ['Spiele', ['Spieleseite mit dem heutigen Stand und kurzer Erklärung je Spiel', 'Titel-Rätsel (täglich / endlos, normal / schwer / extrem, Hinweise)', 'Anime Cover Quiz',
    'Inhalts-Rätsel mit Archiv und Statistik', 'Anime-Quiz']],
  ['Sonstiges', ['Masterset Tracker', 'McRib bestellen']],
];
// What's coming: approved in the feature challenge (FEATURE_BACKLOG.md) but not built yet. Move a line up to
// SITE_FEATURES when it's live.
const SITE_PLANNED = [];
