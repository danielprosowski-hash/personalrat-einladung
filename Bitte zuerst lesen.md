# PR-Einladung – Bitte zuerst lesen

Werkzeug für den Personalrat: aus wenigen Angaben entstehen die Einladung mit
Tagesordnung, die passenden E-Mails und die Anwesenheitsliste.

## Starten

Zwei Wege, dieselbe App:

- **Online**: [danielprosowski-hash.github.io/personalrat-einladung](https://danielprosowski-hash.github.io/personalrat-einladung/)
  im Browser öffnen. Kein Installieren nötig.
- **Lokal**: Datei `index.html` doppelklicken. Öffnet sich im
  Standardbrowser, funktioniert auch ganz ohne Internetzugang.

Beide Varianten speichern die Daten nur im jeweiligen Browser (siehe unten).
Wer online und lokal nutzt, muss die Daten einmal über „Daten sichern“ /
„Daten laden“ zwischen beiden übertragen – es sind zwei getrennte
Speicherorte.

## Wichtig: Wo liegen die Daten?

Alle Angaben – Mitglieder, E-Mail-Adressen, Tagesordnungen, gespeicherte
Vorlagen – werden **ausschließlich im lokalen Speicher dieses Browsers**
abgelegt (`localStorage`). Es gibt keinen Server, keine Cloud, keine
Übertragung an Dritte. Das bedeutet aber auch:

- Die Daten sind an **diesen einen Browser auf diesem einen Rechner**
  gebunden.
- Wird der Browser-Speicher geleert (z. B. „Browserdaten löschen“), sind auch
  die Angaben in der App weg.
- Auf einem anderen Rechner oder in einem anderen Browser stehen die Daten
  nicht automatisch zur Verfügung.

## Auf einen anderen Rechner übertragen (Sicherungsdatei)

Über den Knopf **„Daten sichern“** (unten in der Seitenleiste) wird eine
einzige Datei erzeugt, z. B. `PR-Einladung_Sicherung_2026-07-01.json`. Sie
enthält alles: Mitglieder, alle gespeicherten Vorlagen, alle Sitzungen und die
Einstellungen.

Vor dem Erstellen fragt die App nach einem **Passwort**:

- **Mit Passwort** wird die Datei mit AES-256 verschlüsselt. Ohne das
  Passwort ist der Inhalt für niemanden lesbar — auch nicht durch Öffnen der
  Datei in einem Texteditor. Das Passwort wird nirgends gespeichert; ohne
  Passwort gibt es keinen Weg, die Datei wieder zu entschlüsseln. Gut
  merken oder in einem Passwort-Manager ablegen.
- **„Ohne Passwort“** erzeugt die Datei wie bisher im Klartext.

Beim Einlesen einer verschlüsselten Sicherung fragt die App automatisch nach
dem Passwort.

Diese Datei auf den anderen Rechner kopieren (USB-Stick, verschlüsselter
Cloud-Speicher der Dienststelle o. Ä.) und dort über **„Daten laden“**
einlesen. Die App fragt vor dem Einlesen noch einmal nach, weil die
vorhandenen Daten auf dem Zielrechner dabei ersetzt werden.

Empfehlung: Diese Sicherungsdatei regelmäßig erstellen, auch als Schutz
gegen Datenverlust auf dem eigenen Rechner — am besten mit Passwort, gerade
wenn sie auf einem USB-Stick oder Netzlaufwerk der Dienststelle liegt. Da sie
(im unverschlüsselten Fall) echte Namen und E-Mail-Adressen enthält, gehört
sie **nicht** in ein öffentliches GitHub-Repository – sie ist über die
`.gitignore` bereits davon ausgeschlossen.

## Listen und Ersatzmitglieder

Jede Person bekommt in der Mitgliederliste ein Feld „Liste“ (z. B. „1“ oder
„2“). Ordentliche Mitglieder und ihre Ersatzmitglieder erhalten **dieselbe**
Listenbezeichnung. Für Ersatzmitglieder unbedingt auch die E-Mail-Adresse
eintragen — nur so kann die App sie mit einem Klick mit einladen.

Meldet sich jemand ab: bei „Teilnehmende“ auf „abgesagt“ klicken. Die App
zeigt darunter automatisch das passende Ersatzmitglied derselben Liste an,
mit einem Knopf „… einladen“. Ein Klick reicht, die Person ist danach
angehakt und wird bei „E-Mail“ und in der Anwesenheitsliste berücksichtigt.

## Vorlage speichern

Wenn Mitgliederliste, Verteiler und Standardtexte einmal eingerichtet sind:
Unter „Vorlagen“ einen Namen vergeben und auf „Als Vorlage speichern“
klicken. Eine neue Sitzung übernimmt automatisch die zuletzt genutzten
Angaben; eine Vorlage lässt sich zusätzlich jederzeit erneut laden, falls
mehrere Zusammensetzungen nebeneinander gebraucht werden (z. B. nach einer
Wahlperiode).

## Word-Datei statt Drucken/PDF für offizielle Dokumente

Für die Einladung als Word-Datei sind keine Browser-Zusätze im Dokument –
sie enthält nur das, was in der App eingetragen wurde. Genau deshalb ist sie
der richtige Weg für alles, was unterschrieben, ausgehängt oder weitergegeben
wird.

Der Weg über „Drucken / PDF“ nutzt dagegen den Druckdialog des Browsers.
Browser wie Safari oder Chrome fügen dort **standardmäßig eine eigene
Kopf-/Fußzeile** mit Webadresse, Datum und Seitenzahl ein – das lässt sich
nicht aus der App heraus abschalten. Vor dem Speichern als PDF oder dem
Drucken im Druckdialog die Option **„Kopf- und Fußzeilen“** (bzw. „Headers
and Footers“) abwählen, sonst erscheint die Webadresse auf dem Ausdruck.

## Ordnerinhalt

| Datei | Zweck |
| --- | --- |
| `index.html` | Startet die App |
| `app.js`, `styles.css` | Programmcode und Gestaltung |
| `Einladung.pdf` | Eigene, echte Vorlage – bleibt lokal, wird nicht mit hochgeladen |

Erstellt von Daniel Prosowski.
