/*
  PR-Einladung
  Erzeugt Einladung, Tagesordnung und Anwesenheitsliste für Personalratssitzungen.

  Grundsatz: Die App laeuft vollstaendig im Browser. Es gibt keinen Server und
  keine Netzwerkverbindung. Alle Inhalte - insbesondere Namen, E-Mail-Adressen
  und Tagesordnungspunkte - liegen ausschliesslich im localStorage dieses
  Browsers und stehen in keiner Programmdatei. Der Programmcode enthaelt
  bewusst keine echten Personen-, Orts- oder Dienststellendaten.
*/
(function () {
  "use strict";

  var STORAGE_KEY = "pr-einladung.v1";
  var DATEI_VERSION = 1;

  /* =====================================================================
     Voreinstellungen (neutral, ohne echte Daten)
     ===================================================================== */

  function defaultSettings() {
    return {
      organisation: "",
      gremium: "-Der Personalrat-",
      ort: "",
      verteiler: [
        "Die Personalratsmitglieder",
        "Die Gleichstellungsbeauftragte",
        "Die Schwerbehindertenvertretung",
        "JAV"
      ],
      vorsitzName: "",
      vorsitzFunktion: "Personalratsvorsitzende",
      einladungstext:
        "Hiermit lade ich Sie zur {nummer}. Sitzung des Personalrates, welche am:\n" +
        "{wochentag}, den {datum} um {uhrzeit}\n" +
        "im {raum} stattfindet, recht herzlich ein.",
      hinweistext:
        "Sollten Sie verhindert sein, bitte ich um unverzügliche Rückmeldung, " +
        "damit ein Ersatzmitglied geladen werden kann. Es ist hilfreich, wenn Sie " +
        "das Ersatzmitglied Ihrer Liste im Falle der Vertretungsnotwendigkeit " +
        "bereits in Kenntnis setzen.",
      vertraulichkeitAn: false,
      vertraulichkeit:
        "Die Sitzung des Personalrates ist nicht öffentlich. Die Beratungen und " +
        "Beschlüsse sind vertraulich zu behandeln.",
      standardTops: [
        "Begrüßung",
        "Feststellung der Ordnungsmäßigkeit der Ladung sowie der Beschlussfähigkeit",
        "Tagesordnung",
        "Protokollkontrolle vom {protokolldatum}"
      ],
      schlussTops: ["Mitteilungen", "Sonstiges"],
      bausteine: [
        "Anhörung wegen Kündigung während der Probezeit",
        "Anhörung zur Abmahnung",
        "Anhörung zur ordentlichen Kündigung",
        "Einstellung – ",
        "Eingruppierung – ",
        "Umsetzung / Versetzung – ",
        "Erhöhung der durchschnittlichen regelmäßigen Arbeitszeit – ",
        "Genehmigung von Mehrarbeit und Überstunden",
        "Bericht der Dienststellenleitung"
      ],
      ladungsfristTage: 7,
      dauerMinuten: 120,
      dateischema: "{datum}_{dokument}_{nummer}-Sitzung"
    };
  }

  function emptySession(nummer) {
    return {
      id: newId(),
      nummer: nummer || 1,
      datum: "",
      uhrzeit: "13:00",
      raum: "",
      letzteSitzung: "",
      gaesteZeilen: 3,
      tops: [{ titel: "", zusatz: "" }],
      eingeladen: null, // null = alle Stimmberechtigten
      absagen: [],
      vertretung: {}, // Ersatzmitglied-Id -> Id des vertretenen Mitglieds
      erstellt: new Date().toISOString(),
      geaendert: new Date().toISOString()
    };
  }

  var FUNKTIONEN = [
    "Mitglied",
    "Vorsitz",
    "Stellv. Vorsitz",
    "Schriftführung",
    "Ersatzmitglied",
    "Gleichstellungsbeauftragte",
    "Schwerbehindertenvertretung",
    "JAV",
    "Gast"
  ];

  /* Funktionen, die standardmaessig eingeladen werden. */
  var STANDARD_EINGELADEN = [
    "Mitglied", "Vorsitz", "Stellv. Vorsitz", "Schriftführung",
    "Gleichstellungsbeauftragte", "Schwerbehindertenvertretung", "JAV"
  ];

  /* =====================================================================
     Datenhaltung
     ===================================================================== */

  var store = loadStore();
  var saveTimer = null;

  function newId() {
    return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function loadStore() {
    var parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (e) {
      parsed = null;
    }
    return normalizeStore(parsed);
  }

  function normalizeStore(raw) {
    var s = raw && typeof raw === "object" ? raw : {};
    var out = {
      settings: Object.assign(defaultSettings(), s.settings || {}),
      members: Array.isArray(s.members) ? s.members.map(normalizeMember) : [],
      sessions: Array.isArray(s.sessions) ? s.sessions.map(normalizeSession) : [],
      vorlagen: Array.isArray(s.vorlagen) ? s.vorlagen : [],
      currentId: s.currentId || null
    };
    if (!out.sessions.length) out.sessions.push(emptySession(1));
    if (!out.currentId || !out.sessions.some(function (x) { return x.id === out.currentId; })) {
      out.currentId = out.sessions[0].id;
    }
    return out;
  }

  function normalizeMember(m) {
    return {
      id: m.id || newId(),
      name: m.name || "",
      funktion: FUNKTIONEN.indexOf(m.funktion) >= 0 ? m.funktion : "Mitglied",
      email: m.email || "",
      liste: m.liste || ""
    };
  }

  function normalizeSession(x) {
    var base = emptySession(1);
    var out = Object.assign(base, x || {});
    out.id = out.id || newId();
    out.tops = Array.isArray(x && x.tops) && x.tops.length
      ? x.tops.map(function (t) {
          return typeof t === "string"
            ? { titel: t, zusatz: "" }
            : { titel: t.titel || "", zusatz: t.zusatz || "" };
        })
      : [{ titel: "", zusatz: "" }];
    out.absagen = Array.isArray(out.absagen) ? out.absagen : [];
    out.eingeladen = Array.isArray(out.eingeladen) ? out.eingeladen : null;
    out.vertretung = out.vertretung && typeof out.vertretung === "object" && !Array.isArray(out.vertretung)
      ? out.vertretung : {};
    return out;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      setStatus("Speichern fehlgeschlagen. Ist der Browserspeicher voll oder der private Modus aktiv?");
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  }

  function touchSession() {
    var s = currentSession();
    if (s) s.geaendert = new Date().toISOString();
    scheduleSave();
  }

  function currentSession() {
    for (var i = 0; i < store.sessions.length; i++) {
      if (store.sessions[i].id === store.currentId) return store.sessions[i];
    }
    return store.sessions[0];
  }

  /* =====================================================================
     Hilfsfunktionen fuer Datum und Text
     ===================================================================== */

  var WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch",
                    "Donnerstag", "Freitag", "Samstag"];

  function parseISO(iso) {
    if (!iso) return null;
    var d = new Date(iso + "T12:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  /* 2026-07-01 -> 01.07.2026 */
  function datumLang(iso) {
    var d = parseISO(iso);
    if (!d) return "";
    return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear();
  }

  function wochentag(iso) {
    var d = parseISO(iso);
    return d ? WOCHENTAGE[d.getDay()] : "";
  }

  /* 13:00 -> 13.00 Uhr */
  function uhrzeitLang(hhmm) {
    if (!hhmm) return "";
    return hhmm.replace(":", ".") + " Uhr";
  }

  function tageBis(iso) {
    var d = parseISO(iso);
    if (!d) return null;
    var heute = new Date();
    heute.setHours(12, 0, 0, 0);
    return Math.round((d - heute) / 86400000);
  }

  /* Leere Pflichtangaben sichtbar machen, statt sie stumm wegzulassen. */
  function oder(wert, platzhalter) {
    var v = (wert || "").trim();
    return v ? v : "[" + platzhalter + "]";
  }

  function zeilen(text) {
    return String(text || "")
      .split("\n")
      .map(function (z) { return z.trim(); })
      .filter(Boolean);
  }

  function fuelle(vorlage, werte) {
    return String(vorlage || "").replace(/\{(\w+)\}/g, function (treffer, name) {
      return Object.prototype.hasOwnProperty.call(werte, name) ? werte[name] : treffer;
    });
  }

  /* =====================================================================
     Sitzungsbezogene Ableitungen
     ===================================================================== */

  function platzhalterWerte(s) {
    return {
      nummer: String(s.nummer || ""),
      wochentag: wochentag(s.datum) || "[Wochentag]",
      datum: datumLang(s.datum) || "[Datum]",
      uhrzeit: uhrzeitLang(s.uhrzeit) || "[Uhrzeit]",
      raum: oder(s.raum, "Raum"),
      protokolldatum: datumLang(s.letzteSitzung) || "[Datum der Vorsitzung]",
      organisation: oder(store.settings.organisation, "Dienststelle"),
      ort: oder(store.settings.ort, "Ort")
    };
  }

  /* Feste Punkte am Anfang, freie Punkte, feste Punkte am Ende. */
  function alleTops(s) {
    var w = platzhalterWerte(s);
    var out = [];
    store.settings.standardTops.forEach(function (t) {
      out.push({ titel: fuelle(t, w), zusatz: "" });
    });
    s.tops.forEach(function (t) {
      if ((t.titel || "").trim()) {
        out.push({ titel: fuelle(t.titel, w).trim(), zusatz: (t.zusatz || "").trim() });
      }
    });
    store.settings.schlussTops.forEach(function (t) {
      out.push({ titel: fuelle(t, w), zusatz: "" });
    });
    return out;
  }

  function istStandardEingeladen(m) {
    return STANDARD_EINGELADEN.indexOf(m.funktion) >= 0;
  }

  function eingeladenIds(s) {
    if (s.eingeladen) return s.eingeladen.slice();
    return store.members.filter(istStandardEingeladen).map(function (m) { return m.id; });
  }

  function eingeladenePersonen(s) {
    var ids = eingeladenIds(s);
    return store.members.filter(function (m) { return ids.indexOf(m.id) >= 0; });
  }

  /* Ids der abgesagten Mitglieder, fuer die ein eingeladenes Ersatzmitglied
     einspringt. */
  function ersetzteMitgliedIds(s) {
    var ids = eingeladenIds(s);
    var v = s.vertretung || {};
    return Object.keys(v)
      .filter(function (ersatzId) { return ids.indexOf(ersatzId) >= 0; })
      .map(function (ersatzId) { return v[ersatzId]; });
  }

  /* Personen fuer die Anwesenheitsliste: eingeladene Personen, jedoch ohne
     abgesagte Mitglieder, die bereits durch ein Ersatzmitglied vertreten
     sind. */
  function anwesenheitsPersonen(s) {
    var ersetzt = ersetzteMitgliedIds(s);
    return eingeladenePersonen(s).filter(function (m) {
      return !(s.absagen.indexOf(m.id) >= 0 && ersetzt.indexOf(m.id) >= 0);
    });
  }

  /* Funktionsbezeichnung, bei Ersatzmitgliedern ergaenzt um das vertretene
     Mitglied: z. B. "Ersatzmitglied (für Erika Musterfrau)". */
  function funktionMitVertretung(s, m) {
    var vertretenId = (s.vertretung || {})[m.id];
    if (vertretenId) {
      var vertreten = memberById(vertretenId);
      if (vertreten && (vertreten.name || "").trim()) {
        return m.funktion + " (für " + vertreten.name.trim() + ")";
      }
    }
    return m.funktion;
  }

  function memberById(id) {
    for (var i = 0; i < store.members.length; i++) {
      if (store.members[i].id === id) return store.members[i];
    }
    return null;
  }

  function dateiname(s, dokument) {
    var d = parseISO(s.datum);
    var iso = d
      ? d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
      : "ohne-Datum";
    var name = fuelle(store.settings.dateischema, {
      datum: iso,
      dokument: dokument,
      nummer: String(s.nummer || "")
    });
    return name.replace(/[\\/:*?"<>|]/g, "-");
  }

  /* =====================================================================
     Dokumentmodell
     Ein Dokument ist eine Liste von Bloecken. Aus demselben Modell entstehen
     sowohl die Word-Datei als auch die Druckansicht.
     ===================================================================== */

  function kopfBloecke(s) {
    var w = platzhalterWerte(s);
    var b = [];
    b.push({ typ: "kopf", links: w.organisation, rechts: w.ort + ", den " + w.datum });
    b.push({ typ: "p", text: store.settings.gremium || "" });
    b.push({ typ: "leer" });
    return b;
  }

  function unterschriftBloecke() {
    return [
      { typ: "leer" },
      { typ: "p", text: "gez." },
      { typ: "p", text: oder(store.settings.vorsitzName, "Name") },
      { typ: "p", text: oder(store.settings.vorsitzFunktion, "Funktion") }
    ];
  }

  function einladungsModell(s) {
    var w = platzhalterWerte(s);
    var b = kopfBloecke(s);

    b.push({ typ: "p", text: "An:" });
    store.settings.verteiler.forEach(function (v) {
      b.push({ typ: "listenpunkt", text: v });
    });
    b.push({ typ: "leer" });

    b.push({ typ: "p", text: "Einladung", fett: true });

    // Zeile 1 links, Zeile 2 zentriert und fett, weitere Zeilen zentriert.
    var satzZeilen = zeilen(fuelle(store.settings.einladungstext, w));
    satzZeilen.forEach(function (z, i) {
      if (i === 0) b.push({ typ: "p", text: z });
      else if (i === 1) b.push({ typ: "p", text: z, fett: true, ausrichtung: "center" });
      else b.push({ typ: "p", text: z, ausrichtung: "center" });
    });

    if ((store.settings.hinweistext || "").trim()) {
      b.push({ typ: "leer" });
      b.push({
        typ: "p",
        text: store.settings.hinweistext.trim(),
        kursiv: true,
        ausrichtung: "center"
      });
    }

    b.push({ typ: "leer" });
    b.push({ typ: "p", text: "Tagesordnung:", fett: true });

    alleTops(s).forEach(function (t, i) {
      b.push({ typ: "nummer", nummer: i + 1, text: t.titel });
      if (t.zusatz) b.push({ typ: "zusatz", text: t.zusatz });
    });

    if (store.settings.vertraulichkeitAn && (store.settings.vertraulichkeit || "").trim()) {
      b.push({ typ: "leer" });
      b.push({ typ: "p", text: store.settings.vertraulichkeit.trim(), kursiv: true });
    }

    return b.concat(unterschriftBloecke());
  }

  function anwesenheitsModell(s) {
    var w = platzhalterWerte(s);
    var b = kopfBloecke(s);

    b.push({ typ: "p", text: "Anwesenheitsliste", fett: true, gross: true });
    b.push({
      typ: "p",
      text: w.nummer + ". Sitzung des Personalrates am " + w.wochentag +
            ", den " + w.datum + ", " + w.uhrzeit + ", " + w.raum
    });
    b.push({ typ: "leer" });

    var reihen = [];
    var personen = anwesenheitsPersonen(s);
    personen.forEach(function (m, i) {
      reihen.push([String(i + 1), m.name || "", funktionMitVertretung(s, m), ""]);
    });
    var start = personen.length;
    for (var g = 0; g < (s.gaesteZeilen || 0); g++) {
      reihen.push([String(start + g + 1), "", "", ""]);
    }
    if (!reihen.length) reihen.push(["1", "", "", ""]);

    b.push({
      typ: "tabelle",
      kopf: ["Nr.", "Name", "Funktion", "Unterschrift"],
      breiten: [600, 3100, 2400, 2972],
      reihen: reihen
    });

    b.push({ typ: "leer" });
    b.push({ typ: "p", text: "Beginn der Sitzung: ______________   Ende der Sitzung: ______________" });
    b.push({ typ: "leer" });
    b.push({ typ: "p", text: "Die Beschlussfähigkeit wurde festgestellt: ja / nein" });

    return b.concat(unterschriftBloecke());
  }

  /* =====================================================================
     Word-Erzeugung (Office Open XML, ohne externe Bibliothek)
     ===================================================================== */

  function xmlEscape(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function wRun(text, opt) {
    opt = opt || {};
    var props = "";
    if (opt.fett) props += "<w:b/>";
    if (opt.kursiv) props += "<w:i/>";
    if (opt.gross) props += '<w:sz w:val="28"/>';
    var teile = String(text == null ? "" : text).split("\t");
    var inhalt = teile.map(function (t, i) {
      return (i ? "<w:tab/>" : "") + '<w:t xml:space="preserve">' + xmlEscape(t) + "</w:t>";
    }).join("");
    return "<w:r>" + (props ? "<w:rPr>" + props + "</w:rPr>" : "") + inhalt + "</w:r>";
  }

  function wPara(text, opt) {
    opt = opt || {};
    var pr = "";
    if (opt.tabRechts) pr += '<w:tabs><w:tab w:val="right" w:pos="9072"/></w:tabs>';
    if (opt.einzug) {
      pr += '<w:ind w:left="' + opt.einzug +
            (opt.haengend ? '" w:hanging="' + opt.haengend : "") + '"/>';
    }
    if (opt.ausrichtung) pr += '<w:jc w:val="' + opt.ausrichtung + '"/>';
    pr += '<w:spacing w:after="' + (opt.abstand == null ? 120 : opt.abstand) + '"/>';
    return "<w:p><w:pPr>" + pr + "</w:pPr>" + wRun(text, opt) + "</w:p>";
  }

  function wZelle(text, breite, kopf) {
    return "<w:tc><w:tcPr>" +
      '<w:tcW w:w="' + breite + '" w:type="dxa"/>' +
      (kopf ? '<w:shd w:val="clear" w:fill="EDEDED"/>' : "") +
      "</w:tcPr>" +
      wPara(text, { fett: !!kopf, abstand: 40 }) +
      "</w:tc>";
  }

  function wTabelle(block) {
    var raender =
      "<w:tblBorders>" +
      ["top", "left", "bottom", "right", "insideH", "insideV"].map(function (k) {
        return "<w:" + k + ' w:val="single" w:sz="6" w:space="0" w:color="808080"/>';
      }).join("") +
      "</w:tblBorders>";

    var xml = "<w:tbl><w:tblPr>" +
      '<w:tblW w:w="9072" w:type="dxa"/>' + raender +
      "</w:tblPr><w:tblGrid>" +
      block.breiten.map(function (b) { return '<w:gridCol w:w="' + b + '"/>'; }).join("") +
      "</w:tblGrid>";

    xml += "<w:tr><w:trPr><w:tblHeader/></w:trPr>" +
      block.kopf.map(function (t, i) { return wZelle(t, block.breiten[i], true); }).join("") +
      "</w:tr>";

    block.reihen.forEach(function (r) {
      xml += "<w:tr>" +
        r.map(function (t, i) { return wZelle(t, block.breiten[i], false); }).join("") +
        "</w:tr>";
    });

    return xml + "</w:tbl>" + wPara("", { abstand: 0 });
  }

  function bloeckeZuWord(bloecke) {
    return bloecke.map(function (b) {
      switch (b.typ) {
        case "kopf":
          return wPara(b.links + "\t" + b.rechts, { tabRechts: true });
        case "leer":
          return wPara("", { abstand: 0 });
        case "listenpunkt":
          return wPara("-\t" + b.text, { einzug: 1080, haengend: 360, abstand: 40 });
        case "nummer":
          return wPara(b.nummer + ".\t" + b.text, { einzug: 1080, haengend: 360, abstand: 60 });
        case "zusatz":
          return wPara(b.text, { einzug: 1080, abstand: 100 });
        case "tabelle":
          return wTabelle(b);
        default:
          return wPara(b.text, b);
      }
    }).join("");
  }

  function documentXml(bloecke) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      "<w:body>" + bloeckeZuWord(bloecke) +
      "<w:sectPr>" +
      '<w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417" ' +
      'w:header="708" w:footer="708" w:gutter="0"/>' +
      "</w:sectPr></w:body></w:document>";
  }

  function stylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      "<w:docDefaults><w:rPrDefault><w:rPr>" +
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
      '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="de-DE"/>' +
      "</w:rPr></w:rPrDefault></w:docDefaults>" +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
      '<w:name w:val="Normal"/></w:style></w:styles>';
  }

  function contentTypesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      "</Types>";
  }

  function packageRelsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>";
  }

  function documentRelsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>";
  }

  /* --- ZIP-Erzeugung (Methode "gespeichert", ohne Komprimierung) --- */

  var CRC_TABELLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) {
      c = CRC_TABELLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function zipBauen(dateien) {
    var enc = new TextEncoder();
    var teile = [];
    var zentral = [];
    var offset = 0;

    function u16(v) { return [v & 0xff, (v >>> 8) & 0xff]; }
    function u32(v) { return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]; }

    dateien.forEach(function (f) {
      var nameBytes = enc.encode(f.name);
      var daten = enc.encode(f.inhalt);
      var crc = crc32(daten);

      var lokal = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(daten.length), u32(daten.length),
        u16(nameBytes.length), u16(0)
      );
      teile.push(new Uint8Array(lokal), nameBytes, daten);

      zentral.push([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(daten.length), u32(daten.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
        u32(offset)
      ), nameBytes);

      offset += lokal.length + nameBytes.length + daten.length;
    });

    var zentralTeile = [];
    var zentralLaenge = 0;
    for (var i = 0; i < zentral.length; i += 2) {
      var kopf = new Uint8Array(zentral[i]);
      zentralTeile.push(kopf, zentral[i + 1]);
      zentralLaenge += kopf.length + zentral[i + 1].length;
    }

    var ende = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(dateien.length), u16(dateien.length),
      u32(zentralLaenge), u32(offset), u16(0)
    ));

    return new Blob(teile.concat(zentralTeile, [ende]), {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
  }

  function wordDatei(bloecke) {
    return zipBauen([
      { name: "[Content_Types].xml", inhalt: contentTypesXml() },
      { name: "_rels/.rels", inhalt: packageRelsXml() },
      { name: "word/document.xml", inhalt: documentXml(bloecke) },
      { name: "word/_rels/document.xml.rels", inhalt: documentRelsXml() },
      { name: "word/styles.xml", inhalt: stylesXml() }
    ]);
  }

  /* =====================================================================
     Druckansicht
     ===================================================================== */

  function htmlEscape(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function bloeckeZuHtml(bloecke) {
    return bloecke.map(function (b) {
      var stil = [];
      if (b.fett) stil.push("font-weight:700");
      if (b.kursiv) stil.push("font-style:italic");
      if (b.gross) stil.push("font-size:14pt");
      if (b.ausrichtung === "center") stil.push("text-align:center");
      var s = stil.length ? ' style="' + stil.join(";") + '"' : "";

      switch (b.typ) {
        case "kopf":
          return '<p class="kopf"><span>' + htmlEscape(b.links) + "</span>" +
                 "<span>" + htmlEscape(b.rechts) + "</span></p>";
        case "leer":
          return '<p class="leer">&nbsp;</p>';
        case "listenpunkt":
          return '<p class="einzug">–&nbsp;&nbsp;&nbsp;' + htmlEscape(b.text) + "</p>";
        case "nummer":
          return '<p class="nummer"><span class="n">' + b.nummer + ".</span>" +
                 htmlEscape(b.text) + "</p>";
        case "zusatz":
          return '<p class="zusatz">' + htmlEscape(b.text) + "</p>";
        case "tabelle":
          return "<table><thead><tr>" +
            b.kopf.map(function (t) { return "<th>" + htmlEscape(t) + "</th>"; }).join("") +
            "</tr></thead><tbody>" +
            b.reihen.map(function (r) {
              return "<tr>" + r.map(function (t) {
                return "<td>" + (htmlEscape(t) || "&nbsp;") + "</td>";
              }).join("") + "</tr>";
            }).join("") +
            "</tbody></table>";
        default:
          return "<p" + s + ">" + htmlEscape(b.text) + "</p>";
      }
    }).join("\n");
  }

  var DRUCK_CSS =
    "@page { size: A4; margin: 25mm 25mm 20mm 25mm; }" +
    "body { font: 11pt/1.45 Calibri, Carlito, Arial, sans-serif; color: #000; margin: 0; }" +
    "p { margin: 0 0 6pt; }" +
    "p.leer { margin: 0 0 10pt; }" +
    ".kopf { display: flex; justify-content: space-between; margin-bottom: 14pt; }" +
    ".einzug { margin-left: 18mm; margin-bottom: 2pt; }" +
    ".nummer { margin-left: 18mm; text-indent: -8mm; margin-bottom: 4pt; }" +
    ".nummer .n { display: inline-block; width: 8mm; }" +
    ".zusatz { margin-left: 18mm; margin-bottom: 6pt; }" +
    "table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; }" +
    "th, td { border: 1px solid #808080; padding: 5pt 6pt; text-align: left; font-size: 10.5pt; }" +
    "th { background: #ededed; }" +
    "td { height: 26pt; }";

  function drucken(bloecke, titel) {
    var w = window.open("", "_blank");
    if (!w) {
      setStatus("Der Browser hat das Druckfenster blockiert. Bitte Pop-ups für diese Seite erlauben.");
      return;
    }
    w.document.write(
      '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
      "<title>" + htmlEscape(titel) + "</title><style>" + DRUCK_CSS + "</style></head><body>" +
      bloeckeZuHtml(bloecke) +
      "<script>window.onload=function(){window.print();}<\/script></body></html>"
    );
    w.document.close();
  }

  /* =====================================================================
     E-Mail und Termindatei
     ===================================================================== */

  function mailBetreff(s) {
    var w = platzhalterWerte(s);
    return "Einladung zur " + w.nummer + ". Sitzung des Personalrates am " + w.datum;
  }

  function mailText(s) {
    var w = platzhalterWerte(s);
    var t = [];
    t.push("Sehr geehrte Damen und Herren,");
    t.push("");
    zeilen(fuelle(store.settings.einladungstext, w)).forEach(function (z) { t.push(z); });
    t.push("");
    if ((store.settings.hinweistext || "").trim()) {
      t.push(store.settings.hinweistext.trim());
      t.push("");
    }
    t.push("Tagesordnung:");
    alleTops(s).forEach(function (top, i) {
      t.push("  " + (i + 1) + ". " + top.titel);
      if (top.zusatz) t.push("     " + top.zusatz);
    });
    t.push("");
    if (store.settings.vertraulichkeitAn && (store.settings.vertraulichkeit || "").trim()) {
      t.push(store.settings.vertraulichkeit.trim());
      t.push("");
    }
    t.push("Mit freundlichen Grüßen");
    t.push(oder(store.settings.vorsitzName, "Name"));
    t.push(oder(store.settings.vorsitzFunktion, "Funktion"));
    return t.join("\n");
  }

  function mailEmpfaenger(s) {
    return eingeladenePersonen(s)
      .filter(function (m) { return s.absagen.indexOf(m.id) < 0; })
      .map(function (m) { return (m.email || "").trim(); })
      .filter(Boolean);
  }

  function icsText(s) {
    var d = parseISO(s.datum);
    if (!d) return null;
    var teile = (s.uhrzeit || "13:00").split(":");
    var start = new Date(d.getFullYear(), d.getMonth(), d.getDate(),
                         Number(teile[0]) || 0, Number(teile[1]) || 0);
    var ende = new Date(start.getTime() + (store.settings.dauerMinuten || 120) * 60000);

    function stempel(x) {
      return x.getFullYear() + pad(x.getMonth() + 1) + pad(x.getDate()) + "T" +
             pad(x.getHours()) + pad(x.getMinutes()) + "00";
    }
    /* Zeilen nach RFC 5545 umbrechen: hoechstens 75 Zeichen je Zeile,
       Folgezeilen mit einem fuehrenden Leerzeichen (das beim Einlesen
       wieder entfernt wird). Konservativ bei 74 Zeichen, damit auch
       Umlaute (in UTF-8 zwei Byte) die Grenze nicht ueberschreiten. */
    function falten(zeile) {
      var out = [];
      var rest = zeile;
      out.push(rest.slice(0, 74));
      rest = rest.slice(74);
      while (rest.length) {
        out.push(" " + rest.slice(0, 73));
        rest = rest.slice(73);
      }
      return out.join("\r\n");
    }
    function esc(v) {
      return String(v).replace(/\\/g, "\\\\").replace(/;/g, "\\;")
        .replace(/,/g, "\\,").replace(/\n/g, "\\n");
    }

    var w = platzhalterWerte(s);
    var beschreibung = alleTops(s).map(function (t, i) {
      return (i + 1) + ". " + t.titel;
    }).join("\n");

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PR-Einladung//DE",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + s.id + "@pr-einladung",
      "DTSTAMP:" + stempel(new Date()) + "Z",
      "DTSTART:" + stempel(start),
      "DTEND:" + stempel(ende),
      falten("SUMMARY:" + esc(w.nummer + ". Sitzung des Personalrates")),
      falten("LOCATION:" + esc(w.raum)),
      falten("DESCRIPTION:" + esc("Tagesordnung:\n" + beschreibung)),
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
  }

  /* =====================================================================
     Herunterladen
     ===================================================================== */

  function herunterladen(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* =====================================================================
     Verschluesselung (Web Crypto API: PBKDF2 + AES-GCM, ohne Bibliothek)
     ===================================================================== */

  var PBKDF2_ITERATIONEN = 200000;

  function zuBase64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function vonBase64(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function schluesselAbleiten(passwort, salt, iterationen) {
    var enc = new TextEncoder();
    return crypto.subtle
      .importKey("raw", enc.encode(passwort), "PBKDF2", false, ["deriveKey"])
      .then(function (basisSchluessel) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt, iterations: iterationen, hash: "SHA-256" },
          basisSchluessel,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );
      });
  }

  function verschluesseln(klartext, passwort) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return schluesselAbleiten(passwort, salt, PBKDF2_ITERATIONEN).then(function (schluessel) {
      var enc = new TextEncoder();
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, schluessel, enc.encode(klartext))
        .then(function (chiffre) {
          return {
            verschluesselt: true,
            kdf: "PBKDF2-SHA256",
            iterationen: PBKDF2_ITERATIONEN,
            salt: zuBase64(salt),
            iv: zuBase64(iv),
            daten: zuBase64(new Uint8Array(chiffre))
          };
        });
    });
  }

  /* Wirft bei falschem Passwort oder beschaedigter Datei (AES-GCM prueft
     die Unversehrtheit selbst mit, daher kein zusaetzlicher Check noetig). */
  function entschluesseln(paket, passwort) {
    var salt = vonBase64(paket.salt);
    var iv = vonBase64(paket.iv);
    return schluesselAbleiten(passwort, salt, paket.iterationen || PBKDF2_ITERATIONEN)
      .then(function (schluessel) {
        var chiffre = vonBase64(paket.daten);
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, schluessel, chiffre);
      })
      .then(function (klartextBuffer) {
        return new TextDecoder().decode(klartextBuffer);
      });
  }

  /* =====================================================================
     Passwort-Dialog (einfaches Modal, kein Bibliotheks-Overlay noetig)
     ===================================================================== */

  /* Gibt ein Promise zurueck, das mit {passwort} (String oder null bei
     "ohne Passwort"), oder mit null bei Abbruch aufgeloest wird. */
  function passwortDialog(optionen) {
    return new Promise(function (resolve) {
      el["pw-modal-title"].textContent = optionen.titel;
      el["pw-modal-hint"].textContent = optionen.hinweis || "";
      el["pw-modal-input"].value = "";
      el["pw-modal-confirm"].value = "";
      el["pw-modal-error"].hidden = true;
      el["pw-modal-confirm-wrap"].hidden = !optionen.bestaetigen;
      el["pw-modal-skip"].hidden = !optionen.erlaubeUeberspringen;
      el["pw-modal"].hidden = false;
      el["pw-modal-input"].focus();

      function fehler(text) {
        el["pw-modal-error"].hidden = false;
        el["pw-modal-error"].textContent = text;
      }

      function schliessen(ergebnis) {
        el["pw-modal"].hidden = true;
        el["pw-modal-ok"].removeEventListener("click", aufOk);
        el["pw-modal-skip"].removeEventListener("click", aufSkip);
        el["pw-modal-cancel"].removeEventListener("click", aufCancel);
        el["pw-modal"].removeEventListener("keydown", aufTaste);
        resolve(ergebnis);
      }

      function aufOk() {
        var pw = el["pw-modal-input"].value;
        if (!pw) { fehler("Bitte ein Passwort eingeben."); return; }
        if (optionen.bestaetigen && pw !== el["pw-modal-confirm"].value) {
          fehler("Die Passwörter stimmen nicht überein.");
          return;
        }
        schliessen({ passwort: pw });
      }
      function aufSkip() { schliessen({ passwort: null }); }
      function aufCancel() { schliessen(null); }
      function aufTaste(e) {
        if (e.key === "Enter") aufOk();
        if (e.key === "Escape") aufCancel();
      }

      el["pw-modal-ok"].addEventListener("click", aufOk);
      el["pw-modal-skip"].addEventListener("click", aufSkip);
      el["pw-modal-cancel"].addEventListener("click", aufCancel);
      el["pw-modal"].addEventListener("keydown", aufTaste);
    });
  }

  /* =====================================================================
     Sicherung: alle Daten in eine Datei und zurueck
     ===================================================================== */

  function sicherungErstellen() {
    passwortDialog({
      titel: "Sicherung erstellen",
      hinweis: "Mit Passwort wird die Datei verschlüsselt (AES-256) und ist ohne " +
        "das Passwort nicht lesbar. Ohne Passwort bleibt sie im Klartext lesbar.",
      bestaetigen: true,
      erlaubeUeberspringen: true
    }).then(function (antwort) {
      if (!antwort) return; // abgebrochen

      var paket = {
        programm: "PR-Einladung",
        dateiversion: DATEI_VERSION,
        gesichertAm: new Date().toISOString()
      };

      var weiter = antwort.passwort
        ? verschluesseln(JSON.stringify(store), antwort.passwort).then(function (verschluesseltesPaket) {
            Object.assign(paket, verschluesseltesPaket);
          })
        : Promise.resolve().then(function () { paket.daten = store; });

      weiter.then(function () {
        var heute = new Date();
        var name = "PR-Einladung_Sicherung_" + heute.getFullYear() + "-" +
          pad(heute.getMonth() + 1) + "-" + pad(heute.getDate()) +
          (antwort.passwort ? "_verschluesselt" : "") + ".json";
        herunterladen(
          new Blob([JSON.stringify(paket, null, 2)], { type: "application/json" }),
          name
        );
        setStatus("Sicherung erstellt: " + name + " — enthält " + store.members.length +
          " Personen, " + store.vorlagen.length + " Vorlagen und " +
          store.sessions.length + " Sitzungen." +
          (antwort.passwort ? " Verschlüsselt mit Passwort." : ""));
      });
    });
  }

  function sicherungEinlesen(datei) {
    datei.text().then(function (text) {
      var paket;
      try {
        paket = JSON.parse(text);
      } catch (e) {
        setStatus("Die Datei konnte nicht gelesen werden. Ist es eine Sicherungsdatei dieser App?");
        return;
      }

      function weiterMit(daten) {
        if (!daten || typeof daten !== "object") {
          setStatus("Die Datei enthält keine gültigen Daten.");
          return;
        }
        var frage = "Sicherung einlesen?\n\n" +
          "Vorhandene Daten in diesem Browser werden dabei ersetzt:\n" +
          "· " + store.members.length + " Personen\n" +
          "· " + store.vorlagen.length + " Vorlagen\n" +
          "· " + store.sessions.length + " Sitzungen";
        if (!confirm(frage)) return;

        store = normalizeStore(daten);
        persist();
        alleAnzeigen();
        setStatus("Sicherung eingelesen: " + store.members.length + " Personen, " +
          store.vorlagen.length + " Vorlagen, " + store.sessions.length + " Sitzungen.");
      }

      if (paket && paket.verschluesselt) {
        passwortDialog({
          titel: "Sicherung entschlüsseln",
          hinweis: "Bitte das Passwort eingeben, mit dem diese Sicherung erstellt wurde.",
          bestaetigen: false,
          erlaubeUeberspringen: false
        }).then(function (antwort) {
          if (!antwort) return; // abgebrochen
          entschluesseln(paket, antwort.passwort)
            .then(function (klartext) { weiterMit(JSON.parse(klartext)); })
            .catch(function () {
              setStatus("Falsches Passwort oder beschädigte Datei — Entschlüsseln fehlgeschlagen.");
            });
        });
      } else {
        weiterMit(paket && paket.daten ? paket.daten : paket);
      }
    });
  }

  /* =====================================================================
     Anzeige
     ===================================================================== */

  var el = {};

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    [
      "session-list", "btn-new-session", "member-tbody", "btn-add-member", "member-count",
      "vorlage-name", "btn-save-vorlage", "vorlage-list",
      "set-organisation", "set-gremium", "set-ort", "set-verteiler",
      "set-vorsitz-name", "set-vorsitz-funktion", "set-einladungstext", "set-hinweistext",
      "set-vertraulichkeit-an", "set-vertraulichkeit", "set-standard-tops", "set-schluss-tops",
      "set-bausteine", "set-frist", "set-dauer", "set-dateiname",
      "btn-export", "input-import",
      "s-nummer", "s-datum", "s-uhrzeit", "s-raum", "s-letzte", "s-gaeste",
      "frist-hinweis", "top-list", "btn-add-top", "baustein-select", "btn-add-baustein",
      "attendee-list", "absage-hinweis",
      "btn-docx-einladung", "btn-print-einladung", "btn-docx-anwesenheit",
      "btn-print-anwesenheit", "btn-mail", "btn-copy-mail", "btn-ics",
      "btn-delete-session", "status",
      "erste-schritte", "schritt-1", "schritt-2", "schritt-3",
      "pw-modal", "pw-modal-title", "pw-modal-hint", "pw-modal-input",
      "pw-modal-confirm", "pw-modal-confirm-wrap", "pw-modal-error",
      "pw-modal-ok", "pw-modal-skip", "pw-modal-cancel",
      "btn-open-settings", "settings-modal", "btn-close-settings"
    ].forEach(function (id) {
      el[id] = $(id);
    });
  }

  function setStatus(text) {
    el.status.textContent = text || "";
    if (text) {
      clearTimeout(setStatus._t);
      setStatus._t = setTimeout(function () { el.status.textContent = ""; }, 9000);
    }
  }

  function alleAnzeigen() {
    zeigeSitzungsliste();
    zeigeEinstellungen();
    zeigeMitglieder();
    zeigeVorlagen();
    zeigeSitzung();
    zeigeErsteSchritte();
  }

  /* Einstellungen & Standardtexte: eigenes Overlay statt Seitenleiste,
     damit die Seitenleiste kurz und uebersichtlich bleibt. */
  function oeffneEinstellungen() {
    el["settings-modal"].hidden = false;
    var erstesFeld = el["settings-modal"].querySelector("input, textarea, select");
    if (erstesFeld) erstesFeld.focus({ preventScroll: true });
  }

  function schliesseEinstellungen() {
    el["settings-modal"].hidden = true;
  }

  /* Kurzer Einstiegsfahrplan fuer den ersten Besuch. Verschwindet, sobald
     Mitglieder, Briefkopf und ein Sitzungstermin vorhanden sind. Beim
     allerersten, vollstaendig leeren Start werden die zugehoerigen
     Abschnitte automatisch aufgeklappt. */
  var ersteSchritteInitialGeprueft = false;

  function zeigeErsteSchritte() {
    var schritt1Erledigt = store.members.length > 0;
    var schritt2Erledigt = !!(store.settings.organisation || "").trim() &&
                           !!(store.settings.gremium || "").trim();
    var schritt3Erledigt = !!currentSession().datum;

    if (!ersteSchritteInitialGeprueft) {
      ersteSchritteInitialGeprueft = true;
      if (!schritt1Erledigt) document.getElementById("det-members").open = true;
      if (!schritt2Erledigt) oeffneEinstellungen();
    }

    var alleErledigt = schritt1Erledigt && schritt2Erledigt && schritt3Erledigt;
    el["erste-schritte"].hidden = alleErledigt;
    if (alleErledigt) return;

    el["schritt-1"].classList.toggle("done", schritt1Erledigt);
    el["schritt-2"].classList.toggle("done", schritt2Erledigt);
    el["schritt-3"].classList.toggle("done", schritt3Erledigt);
  }

  function zeigeSitzungsliste() {
    var liste = el["session-list"];
    liste.innerHTML = "";
    store.sessions
      .slice()
      .sort(function (a, b) { return (b.datum || "").localeCompare(a.datum || ""); })
      .forEach(function (s) {
        var li = document.createElement("li");
        if (s.id === store.currentId) li.className = "active";
        li.innerHTML =
          '<span class="title">' + htmlEscape(s.nummer || "?") + ". Sitzung" +
          '<span class="sub">' + (datumLang(s.datum) || "ohne Datum") + "</span></span>";
        li.addEventListener("click", function () {
          store.currentId = s.id;
          persist();
          zeigeSitzungsliste();
          zeigeSitzung();
        });
        liste.appendChild(li);
      });
  }

  function zeigeEinstellungen() {
    var t = store.settings;
    el["set-organisation"].value = t.organisation;
    el["set-gremium"].value = t.gremium;
    el["set-ort"].value = t.ort;
    el["set-verteiler"].value = t.verteiler.join("\n");
    el["set-vorsitz-name"].value = t.vorsitzName;
    el["set-vorsitz-funktion"].value = t.vorsitzFunktion;
    el["set-einladungstext"].value = t.einladungstext;
    el["set-hinweistext"].value = t.hinweistext;
    el["set-vertraulichkeit-an"].checked = !!t.vertraulichkeitAn;
    el["set-vertraulichkeit"].value = t.vertraulichkeit;
    el["set-standard-tops"].value = t.standardTops.join("\n");
    el["set-schluss-tops"].value = t.schlussTops.join("\n");
    el["set-bausteine"].value = t.bausteine.join("\n");
    el["set-frist"].value = t.ladungsfristTage;
    el["set-dauer"].value = t.dauerMinuten;
    el["set-dateiname"].value = t.dateischema;
    zeigeBausteine();
  }

  function zeigeBausteine() {
    var sel = el["baustein-select"];
    sel.innerHTML = "";
    store.settings.bausteine.forEach(function (b) {
      var o = document.createElement("option");
      o.value = b;
      o.textContent = b;
      sel.appendChild(o);
    });
  }

  function zeigeMitglieder() {
    var tb = el["member-tbody"];
    tb.innerHTML = "";
    el["member-count"].textContent = String(store.members.length);

    store.members.forEach(function (m) {
      var tr = document.createElement("tr");

      var tdName = document.createElement("td");
      var iName = document.createElement("input");
      iName.type = "text";
      iName.value = m.name;
      iName.placeholder = "Vorname Nachname";
      iName.addEventListener("input", function () {
        m.name = iName.value; scheduleSave(); zeigeTeilnehmende();
      });
      tdName.appendChild(iName);

      var tdFunk = document.createElement("td");
      var sFunk = document.createElement("select");
      FUNKTIONEN.forEach(function (f) {
        var o = document.createElement("option");
        o.value = f; o.textContent = f;
        if (f === m.funktion) o.selected = true;
        sFunk.appendChild(o);
      });
      sFunk.addEventListener("change", function () {
        m.funktion = sFunk.value; scheduleSave(); zeigeTeilnehmende();
      });
      tdFunk.appendChild(sFunk);

      var tdMail = document.createElement("td");
      var iMail = document.createElement("input");
      iMail.type = "email";
      iMail.value = m.email;
      iMail.placeholder = "name@dienststelle.de";
      iMail.addEventListener("input", function () { m.email = iMail.value; scheduleSave(); });
      tdMail.appendChild(iMail);

      var tdListe = document.createElement("td");
      var iListe = document.createElement("input");
      iListe.type = "text";
      iListe.value = m.liste;
      iListe.placeholder = "z. B. 1";
      iListe.title = "Mitglieder und ihre Ersatzmitglieder erhalten dieselbe Listenbezeichnung, z. B. „1“ oder „2“.";
      iListe.setAttribute("list", "listen-vorschlaege");
      iListe.addEventListener("input", function () {
        m.liste = iListe.value; scheduleSave(); zeigeTeilnehmende();
      });
      tdListe.appendChild(iListe);

      var tdWeg = document.createElement("td");
      var bWeg = document.createElement("button");
      bWeg.type = "button";
      bWeg.className = "icon";
      bWeg.title = "Person entfernen";
      bWeg.textContent = "×";
      bWeg.addEventListener("click", function () {
        if (!confirm("„" + (m.name || "diese Person") + "“ aus der Mitgliederliste entfernen?")) return;
        store.members = store.members.filter(function (x) { return x.id !== m.id; });
        persist(); zeigeMitglieder(); zeigeTeilnehmende(); zeigeErsteSchritte();
      });
      tdWeg.appendChild(bWeg);

      [tdName, tdFunk, tdMail, tdListe, tdWeg].forEach(function (td) { tr.appendChild(td); });
      tb.appendChild(tr);
    });

    zeigeListenVorschlaege();
  }

  /* Vorschlagsliste fuers Listenfeld: vorhandene Listenbezeichnungen plus 1 und 2. */
  function zeigeListenVorschlaege() {
    var dl = $("listen-vorschlaege");
    if (!dl) return;
    var werte = ["1", "2"];
    store.members.forEach(function (m) {
      if (m.liste && werte.indexOf(m.liste) < 0) werte.push(m.liste);
    });
    dl.innerHTML = werte.map(function (w) {
      return '<option value="' + htmlEscape(w) + '"></option>';
    }).join("");
  }

  function zeigeVorlagen() {
    var liste = el["vorlage-list"];
    liste.innerHTML = "";
    if (!store.vorlagen.length) {
      var leer = document.createElement("li");
      leer.className = "hint";
      leer.textContent = "Noch keine Vorlage gespeichert.";
      liste.appendChild(leer);
      return;
    }
    store.vorlagen.forEach(function (v) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="title">' + htmlEscape(v.name) +
        '<span class="sub">' + (v.members ? v.members.length : 0) + " Personen · " +
        datumLang((v.gespeichertAm || "").slice(0, 10)) + "</span></span>";

      var bLaden = document.createElement("button");
      bLaden.type = "button"; bLaden.className = "mini secondary"; bLaden.textContent = "Laden";
      bLaden.addEventListener("click", function () {
        if (!confirm("Vorlage „" + v.name + "“ laden?\n\nMitglieder, Verteiler und Standardtexte werden ersetzt. Gespeicherte Sitzungen bleiben erhalten.")) return;
        store.settings = Object.assign(defaultSettings(), v.settings || {});
        store.members = (v.members || []).map(normalizeMember);
        persist(); alleAnzeigen();
        setStatus("Vorlage „" + v.name + "“ geladen.");
      });

      var bWeg = document.createElement("button");
      bWeg.type = "button"; bWeg.className = "icon"; bWeg.textContent = "×";
      bWeg.title = "Vorlage löschen";
      bWeg.addEventListener("click", function () {
        if (!confirm("Vorlage „" + v.name + "“ löschen?")) return;
        store.vorlagen = store.vorlagen.filter(function (x) { return x.id !== v.id; });
        persist(); zeigeVorlagen();
      });

      li.appendChild(bLaden);
      li.appendChild(bWeg);
      liste.appendChild(li);
    });
  }

  function zeigeSitzung() {
    var s = currentSession();
    el["s-nummer"].value = s.nummer || "";
    el["s-datum"].value = s.datum || "";
    el["s-uhrzeit"].value = s.uhrzeit || "";
    el["s-raum"].value = s.raum || "";
    el["s-letzte"].value = s.letzteSitzung || "";
    el["s-gaeste"].value = s.gaesteZeilen == null ? 3 : s.gaesteZeilen;
    zeigeTops();
    zeigeTeilnehmende();
    zeigeFrist();
  }

  function zeigeFrist() {
    var s = currentSession();
    var hinweis = el["frist-hinweis"];
    var tage = tageBis(s.datum);
    var frist = Number(store.settings.ladungsfristTage) || 0;

    if (tage == null) {
      hinweis.hidden = false;
      hinweis.textContent = "Es ist noch kein Sitzungsdatum eingetragen.";
      return;
    }
    if (tage < 0) {
      hinweis.hidden = false;
      hinweis.textContent = "Der Sitzungstermin liegt in der Vergangenheit.";
      return;
    }
    if (tage < frist) {
      hinweis.hidden = false;
      hinweis.textContent = "Ladungsfrist: bis zur Sitzung sind es noch " + tage +
        (tage === 1 ? " Tag" : " Tage") + ". Vorgesehen sind " + frist +
        " Tage. Bitte prüfen, ob die Ladungsfrist eingehalten ist.";
      return;
    }
    hinweis.hidden = true;
  }

  function zeigeTops() {
    var s = currentSession();
    var liste = el["top-list"];
    liste.innerHTML = "";
    var vorlauf = store.settings.standardTops.length;

    s.tops.forEach(function (t, i) {
      var li = document.createElement("li");
      li.className = "top-row";

      var num = document.createElement("div");
      num.className = "num";
      num.textContent = (vorlauf + i + 1) + ".";

      var fields = document.createElement("div");
      fields.className = "fields";

      var iTitel = document.createElement("input");
      iTitel.type = "text";
      iTitel.value = t.titel;
      iTitel.placeholder = "Tagesordnungspunkt";
      iTitel.addEventListener("input", function () {
        t.titel = iTitel.value; touchSession();
      });

      var iZusatz = document.createElement("textarea");
      iZusatz.rows = 1;
      iZusatz.value = t.zusatz;
      iZusatz.placeholder = "Zusatz oder Erläuterung (optional)";
      iZusatz.addEventListener("input", function () {
        t.zusatz = iZusatz.value; touchSession();
      });

      fields.appendChild(iTitel);
      fields.appendChild(iZusatz);

      var tools = document.createElement("div");
      tools.className = "tools";
      tools.appendChild(werkzeug("↑", "Nach oben", function () { topVerschieben(i, -1); }));
      tools.appendChild(werkzeug("↓", "Nach unten", function () { topVerschieben(i, 1); }));
      tools.appendChild(werkzeug("×", "Punkt entfernen", function () { topEntfernen(i); }));

      li.appendChild(num);
      li.appendChild(fields);
      li.appendChild(tools);
      liste.appendChild(li);
    });
  }

  function werkzeug(zeichen, titel, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "icon";
    b.textContent = zeichen;
    b.title = titel;
    b.addEventListener("click", fn);
    return b;
  }

  function topVerschieben(i, delta) {
    var s = currentSession();
    var j = i + delta;
    if (j < 0 || j >= s.tops.length) return;
    var tmp = s.tops[i];
    s.tops[i] = s.tops[j];
    s.tops[j] = tmp;
    touchSession();
    zeigeTops();
  }

  function topEntfernen(i) {
    var s = currentSession();
    s.tops.splice(i, 1);
    if (!s.tops.length) s.tops.push({ titel: "", zusatz: "" });
    touchSession();
    zeigeTops();
  }

  function zeigeTeilnehmende() {
    var s = currentSession();
    var box = el["attendee-list"];
    box.innerHTML = "";

    if (!store.members.length) {
      var p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Noch keine Personen erfasst. Links unter „Mitglieder“ anlegen.";
      box.appendChild(p);
      el["absage-hinweis"].hidden = true;
      return;
    }

    var ids = eingeladenIds(s);

    store.members.forEach(function (m) {
      var zeile = document.createElement("div");
      zeile.className = "attendee";
      var abgesagt = s.absagen.indexOf(m.id) >= 0;
      if (abgesagt) zeile.classList.add("absent");

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = ids.indexOf(m.id) >= 0;
      cb.addEventListener("change", function () {
        var aktuell = eingeladenIds(s);
        if (cb.checked) {
          if (aktuell.indexOf(m.id) < 0) aktuell.push(m.id);
        } else {
          aktuell = aktuell.filter(function (x) { return x !== m.id; });
          // Wird ein Ersatzmitglied wieder ausgeladen, entfaellt seine Vertretung.
          if (s.vertretung && s.vertretung[m.id]) delete s.vertretung[m.id];
        }
        s.eingeladen = aktuell;
        touchSession();
        zeigeTeilnehmende();
      });

      var vertretenId = (s.vertretung || {})[m.id];
      var vertretenName = vertretenId && memberById(vertretenId)
        ? (memberById(vertretenId).name || "").trim() : "";

      var name = document.createElement("span");
      name.className = "name";
      name.innerHTML = htmlEscape(m.name || "(ohne Namen)") +
        ' <span class="role">' + htmlEscape(m.funktion) +
        (m.liste ? " · Liste " + htmlEscape(m.liste) : "") +
        (vertretenName ? " · vertritt " + htmlEscape(vertretenName) : "") + "</span>";

      var absage = document.createElement("span");
      absage.className = "absage";
      absage.textContent = abgesagt ? "Absage zurücknehmen" : "abgesagt";
      absage.title = "Absage vermerken";
      absage.addEventListener("click", function () {
        if (abgesagt) {
          s.absagen = s.absagen.filter(function (x) { return x !== m.id; });
          // Nimmt das Mitglied die Absage zurueck, entfallen Vertretungen fuer es.
          if (s.vertretung) {
            Object.keys(s.vertretung).forEach(function (ersatzId) {
              if (s.vertretung[ersatzId] === m.id) delete s.vertretung[ersatzId];
            });
          }
        } else {
          s.absagen.push(m.id);
        }
        touchSession();
        zeigeTeilnehmende();
      });

      zeile.appendChild(cb);
      zeile.appendChild(name);
      zeile.appendChild(absage);
      box.appendChild(zeile);
    });

    zeigeErsatzHinweis();
  }

  /* Bei Absagen das Ersatzmitglied derselben Liste vorschlagen und mit
     einem Klick einladen (Häkchen wird gesetzt, E-Mail-Adresse steht bereit). */
  function zeigeErsatzHinweis() {
    var s = currentSession();
    var box = el["absage-hinweis"];
    box.innerHTML = "";

    if (!s.absagen.length) { box.hidden = true; return; }
    box.hidden = false;

    s.absagen.forEach(function (id) {
      var m = memberById(id);
      if (!m) return;

      var zeile = document.createElement("div");
      zeile.className = "ersatz-zeile";

      var text = document.createElement("span");
      text.textContent = (m.name || "Ein Mitglied") + " hat abgesagt";
      zeile.appendChild(text);

      if (!m.liste) {
        text.textContent += " — für diese Person ist keine Liste hinterlegt, es kann kein Ersatzmitglied zugeordnet werden.";
        box.appendChild(zeile);
        return;
      }

      var eingeladen = eingeladenIds(s);
      var ersatz = store.members.filter(function (x) {
        return x.funktion === "Ersatzmitglied" && x.liste === m.liste;
      });
      var offen = ersatz.filter(function (x) { return eingeladen.indexOf(x.id) < 0; });

      if (!ersatz.length) {
        text.textContent += " — für Liste " + m.liste + " ist kein Ersatzmitglied erfasst.";
      } else if (!offen.length) {
        text.textContent += " — Ersatzmitglied aus Liste " + m.liste + " ist bereits eingeladen.";
      } else {
        text.textContent += " — Ersatz aus Liste " + m.liste + ":";
        offen.forEach(function (x) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "mini secondary";
          b.textContent = (x.name || "(ohne Namen)") + " einladen";
          if (!x.email) b.title = "Für diese Person ist noch keine E-Mail-Adresse hinterlegt.";
          b.addEventListener("click", function () {
            var aktuell = eingeladenIds(s);
            if (aktuell.indexOf(x.id) < 0) aktuell.push(x.id);
            s.eingeladen = aktuell;
            if (!s.vertretung) s.vertretung = {};
            s.vertretung[x.id] = m.id; // Ersatz x vertritt Mitglied m
            touchSession();
            zeigeTeilnehmende();
            setStatus((x.name || "Ersatzmitglied") + " wurde als Vertretung für " +
              (m.name || "das abgesagte Mitglied") + " eingeladen.");
          });
          zeile.appendChild(b);
        });
      }
      box.appendChild(zeile);
    });
  }

  /* =====================================================================
     Ereignisse
     ===================================================================== */

  function bindeSitzungsfelder() {
    function feld(id, schluessel, wandler) {
      el[id].addEventListener("input", function () {
        var s = currentSession();
        s[schluessel] = wandler ? wandler(el[id].value) : el[id].value;
        touchSession();
        if (id === "s-nummer" || id === "s-datum") zeigeSitzungsliste();
        if (id === "s-datum") { zeigeFrist(); zeigeErsteSchritte(); }
        if (id === "s-letzte") zeigeTops();
      });
    }
    feld("s-nummer", "nummer", Number);
    feld("s-datum", "datum");
    feld("s-uhrzeit", "uhrzeit");
    feld("s-raum", "raum");
    feld("s-letzte", "letzteSitzung");
    feld("s-gaeste", "gaesteZeilen", Number);
  }

  function bindeEinstellungen() {
    function text(id, schluessel, nachher) {
      el[id].addEventListener("input", function () {
        store.settings[schluessel] = el[id].value;
        scheduleSave();
        if (nachher) nachher();
      });
    }
    function liste(id, schluessel, nachher) {
      el[id].addEventListener("input", function () {
        store.settings[schluessel] = zeilen(el[id].value);
        scheduleSave();
        if (nachher) nachher();
      });
    }
    text("set-organisation", "organisation", zeigeErsteSchritte);
    text("set-gremium", "gremium", zeigeErsteSchritte);
    text("set-ort", "ort");
    liste("set-verteiler", "verteiler");
    text("set-vorsitz-name", "vorsitzName");
    text("set-vorsitz-funktion", "vorsitzFunktion");
    text("set-einladungstext", "einladungstext");
    text("set-hinweistext", "hinweistext");
    text("set-vertraulichkeit", "vertraulichkeit");
    liste("set-standard-tops", "standardTops", zeigeTops);
    liste("set-schluss-tops", "schlussTops");
    liste("set-bausteine", "bausteine", zeigeBausteine);
    text("set-dateiname", "dateischema");

    el["set-vertraulichkeit-an"].addEventListener("change", function () {
      store.settings.vertraulichkeitAn = el["set-vertraulichkeit-an"].checked;
      scheduleSave();
    });
    el["set-frist"].addEventListener("input", function () {
      store.settings.ladungsfristTage = Number(el["set-frist"].value) || 0;
      scheduleSave(); zeigeFrist();
    });
    el["set-dauer"].addEventListener("input", function () {
      store.settings.dauerMinuten = Number(el["set-dauer"].value) || 120;
      scheduleSave();
    });
  }

  function neueSitzung() {
    var letzte = store.sessions.slice().sort(function (a, b) {
      return (b.datum || "").localeCompare(a.datum || "");
    })[0];

    var s = emptySession((letzte && Number(letzte.nummer) ? Number(letzte.nummer) : 0) + 1);
    if (letzte) {
      s.raum = letzte.raum;
      s.uhrzeit = letzte.uhrzeit;
      s.letzteSitzung = letzte.datum || "";
      s.gaesteZeilen = letzte.gaesteZeilen;
    }
    store.sessions.push(s);
    store.currentId = s.id;
    persist();
    zeigeSitzungsliste();
    zeigeSitzung();
    setStatus("Neue Sitzung angelegt. Die Protokollkontrolle wurde auf den Termin der Vorsitzung gesetzt.");
  }

  function bindeErsteSchritte() {
    el["schritt-1"].addEventListener("click", function () {
      if (el["schritt-1"].classList.contains("done")) return;
      var details = document.getElementById("det-members");
      details.open = true;
      details.scrollIntoView({ behavior: "smooth", block: "start" });
      var erstesFeld = details.querySelector("input, textarea, select");
      if (erstesFeld) erstesFeld.focus({ preventScroll: true });
    });
    el["schritt-2"].addEventListener("click", function () {
      if (el["schritt-2"].classList.contains("done")) return;
      oeffneEinstellungen();
    });
    el["schritt-3"].addEventListener("click", function () {
      if (el["schritt-3"].classList.contains("done")) return;
      el["s-datum"].scrollIntoView({ behavior: "smooth", block: "center" });
      el["s-datum"].focus({ preventScroll: true });
    });
  }

  function bindeEinstellungenOverlay() {
    el["btn-open-settings"].addEventListener("click", oeffneEinstellungen);
    el["btn-close-settings"].addEventListener("click", schliesseEinstellungen);
    el["settings-modal"].addEventListener("click", function (e) {
      if (e.target === el["settings-modal"]) schliesseEinstellungen();
    });
    el["settings-modal"].addEventListener("keydown", function (e) {
      if (e.key === "Escape") schliesseEinstellungen();
    });
  }

  function bindeAktionen() {
    el["btn-new-session"].addEventListener("click", neueSitzung);

    el["btn-delete-session"].addEventListener("click", function () {
      var s = currentSession();
      if (!confirm("Sitzung " + s.nummer + " endgültig löschen?")) return;
      store.sessions = store.sessions.filter(function (x) { return x.id !== s.id; });
      if (!store.sessions.length) store.sessions.push(emptySession(1));
      store.currentId = store.sessions[0].id;
      persist();
      zeigeSitzungsliste();
      zeigeSitzung();
    });

    el["btn-add-member"].addEventListener("click", function () {
      store.members.push(normalizeMember({}));
      persist();
      zeigeMitglieder();
      zeigeTeilnehmende();
      zeigeErsteSchritte();
      var eingaben = el["member-tbody"].querySelectorAll('input[type="text"]');
      if (eingaben.length) eingaben[eingaben.length - 1].focus();
    });

    el["btn-add-top"].addEventListener("click", function () {
      currentSession().tops.push({ titel: "", zusatz: "" });
      touchSession();
      zeigeTops();
      var felder = el["top-list"].querySelectorAll('input[type="text"]');
      if (felder.length) felder[felder.length - 1].focus();
    });

    el["btn-add-baustein"].addEventListener("click", function () {
      var wert = el["baustein-select"].value;
      if (!wert) return;
      var s = currentSession();
      var letzte = s.tops[s.tops.length - 1];
      if (letzte && !letzte.titel.trim() && !letzte.zusatz.trim()) letzte.titel = wert;
      else s.tops.push({ titel: wert, zusatz: "" });
      touchSession();
      zeigeTops();
    });

    el["btn-save-vorlage"].addEventListener("click", function () {
      var name = (el["vorlage-name"].value || "").trim();
      if (!name) {
        setStatus("Bitte zuerst einen Namen für die Vorlage eingeben.");
        el["vorlage-name"].focus();
        return;
      }
      var vorhanden = store.vorlagen.filter(function (v) { return v.name === name; })[0];
      if (vorhanden && !confirm("Es gibt bereits eine Vorlage „" + name + "“. Überschreiben?")) return;

      var eintrag = {
        id: vorhanden ? vorhanden.id : newId(),
        name: name,
        gespeichertAm: new Date().toISOString(),
        settings: JSON.parse(JSON.stringify(store.settings)),
        members: JSON.parse(JSON.stringify(store.members))
      };
      if (vorhanden) {
        store.vorlagen = store.vorlagen.map(function (v) {
          return v.id === eintrag.id ? eintrag : v;
        });
      } else {
        store.vorlagen.push(eintrag);
      }
      el["vorlage-name"].value = "";
      persist();
      zeigeVorlagen();
      setStatus("Vorlage „" + name + "“ gespeichert (" + store.members.length + " Personen).");
    });

    el["btn-docx-einladung"].addEventListener("click", function () {
      var s = currentSession();
      herunterladen(wordDatei(einladungsModell(s)), dateiname(s, "Einladung") + ".docx");
      setStatus("Einladung als Word-Datei erstellt.");
    });

    el["btn-print-einladung"].addEventListener("click", function () {
      drucken(einladungsModell(currentSession()), "Einladung");
    });

    el["btn-docx-anwesenheit"].addEventListener("click", function () {
      var s = currentSession();
      herunterladen(wordDatei(anwesenheitsModell(s)), dateiname(s, "Anwesenheitsliste") + ".docx");
      setStatus("Anwesenheitsliste als Word-Datei erstellt.");
    });

    el["btn-print-anwesenheit"].addEventListener("click", function () {
      drucken(anwesenheitsModell(currentSession()), "Anwesenheitsliste");
    });

    el["btn-mail"].addEventListener("click", function () {
      var s = currentSession();
      var empfaenger = mailEmpfaenger(s);
      if (!empfaenger.length) {
        setStatus("Für die eingeladenen Personen ist keine E-Mail-Adresse hinterlegt.");
        return;
      }
      var url = "mailto:?bcc=" + encodeURIComponent(empfaenger.join(",")) +
        "&subject=" + encodeURIComponent(mailBetreff(s)) +
        "&body=" + encodeURIComponent(mailText(s));
      if (url.length > 1800) {
        setStatus("Der Text ist für das Mailprogramm zu lang. Bitte „Text kopieren“ verwenden und in eine neue Mail einfügen.");
        return;
      }
      window.location.href = url;
      setStatus("Mail an " + empfaenger.length + " Empfänger vorbereitet (Adressen im BCC-Feld).");
    });

    el["btn-copy-mail"].addEventListener("click", function () {
      var s = currentSession();
      var empfaenger = mailEmpfaenger(s);
      var alles =
        "Empfänger (BCC):\n" + (empfaenger.join("; ") || "(keine Adressen hinterlegt)") +
        "\n\nBetreff:\n" + mailBetreff(s) +
        "\n\n" + mailText(s);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(alles).then(function () {
          setStatus("Empfänger, Betreff und Text in die Zwischenablage kopiert.");
        }, function () {
          ersatzKopie(alles);
        });
      } else {
        ersatzKopie(alles);
      }
    });

    el["btn-ics"].addEventListener("click", function () {
      var s = currentSession();
      var text = icsText(s);
      if (!text) {
        setStatus("Für die Termindatei wird ein Sitzungsdatum benötigt.");
        return;
      }
      herunterladen(new Blob([text], { type: "text/calendar;charset=utf-8" }),
        dateiname(s, "Termin") + ".ics");
      setStatus("Termindatei erstellt. Sie kann der Mail angehängt werden.");
    });

    el["btn-export"].addEventListener("click", sicherungErstellen);

    el["input-import"].addEventListener("change", function (ev) {
      var datei = ev.target.files && ev.target.files[0];
      if (datei) sicherungEinlesen(datei);
      ev.target.value = "";
    });
  }

  function ersatzKopie(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      setStatus("Empfänger, Betreff und Text in die Zwischenablage kopiert.");
    } catch (e) {
      setStatus("Kopieren war nicht möglich. Bitte den Text von Hand markieren.");
    }
    document.body.removeChild(ta);
  }

  /* =====================================================================
     Start
     ===================================================================== */

  cacheEls();
  bindeSitzungsfelder();
  bindeEinstellungen();
  bindeAktionen();
  bindeErsteSchritte();
  bindeEinstellungenOverlay();
  alleAnzeigen();

  window.addEventListener("beforeunload", persist);
})();
