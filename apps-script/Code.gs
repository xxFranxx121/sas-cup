/**
 * SAS CUP 2026 · Receptor de inscripciones
 * ------------------------------------------------------------
 * Guarda cada inscripción en una Google Sheet y los archivos
 * (logo, foto y comprobante) en una carpeta de Google Drive.
 *
 * Cómo instalarlo: ver GUIA.md en esta misma carpeta.
 */

// Mail que recibe un aviso por cada inscripción nueva.
// Dejalo vacío ("") si no querés recibir mails.
const NOTIFY_EMAIL = "";

const SHEET_NAME = "Inscripciones";
const HEADERS = [
  "Fecha",
  "Equipo",
  "Instagram",
  "Delegado",
  "WhatsApp",
  "Logo",
  "Foto del equipo",
  "Comprobante seña",
  "Carpeta",
  "Estado seña",
];

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/[a-z0-9.+-]+|application\/pdf|application\/octet-stream)$/i;

/**
 * PASO 1: ejecutá esta función UNA vez desde el editor (botón ▶ Ejecutar).
 * Crea la planilla y la carpeta de Drive y guarda sus IDs.
 */
function setup() {
  const props = PropertiesService.getScriptProperties();

  let ss;
  const savedSheetId = props.getProperty("SHEET_ID");
  if (savedSheetId) {
    ss = SpreadsheetApp.openById(savedSheetId);
  } else {
    ss = SpreadsheetApp.create("Inscripciones SAS CUP 2026");
    props.setProperty("SHEET_ID", ss.getId());
  }

  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet
      .getRange(1, 1, 1, HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#0b1a3a")
      .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, HEADERS.length, 170);

    // Desplegable para marcar la seña como verificada
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Pendiente", "Verificada", "Rechazada"], true)
      .build();
    sheet.getRange(2, HEADERS.length, 500, 1).setDataValidation(rule);
  }

  let folderId = props.getProperty("FOLDER_ID");
  if (!folderId) {
    const folder = DriveApp.createFolder("Inscripciones SAS CUP 2026");
    folderId = folder.getId();
    props.setProperty("FOLDER_ID", folderId);
  }

  Logger.log("✅ Listo");
  Logger.log("Planilla: " + ss.getUrl());
  Logger.log("Carpeta:  " + DriveApp.getFolderById(folderId).getUrl());
}

/** Responde a la página cuando envía el formulario. */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    // Honeypot: los bots completan este campo oculto
    if (body.website) return json({ ok: true });

    const teamName = clean(body.teamName, 60);
    const delegateName = clean(body.delegateName, 80);
    const whatsapp = clean(body.whatsapp, 20);
    const instagram = clean(body.instagram, 40).replace(/^@+/, "");
    const files = body.files || {};

    if (!teamName || !delegateName || !/^\+549\d{10}$/.test(whatsapp)) {
      return json({ ok: false, error: "Faltan datos obligatorios." });
    }
    if (!files.logo || !files.receipt) {
      return json({ ok: false, error: "Faltan el logo o el comprobante." });
    }

    const props = PropertiesService.getScriptProperties();
    const sheetId = props.getProperty("SHEET_ID");
    const rootId = props.getProperty("FOLDER_ID");
    if (!sheetId || !rootId) {
      return json({ ok: false, error: "El receptor no está configurado (ejecutá setup)." });
    }

    const now = new Date();
    const stamp = Utilities.formatDate(now, "America/Argentina/Buenos_Aires", "yyyy-MM-dd HH.mm");
    const folder = DriveApp.getFolderById(rootId).createFolder(stamp + " · " + teamName);

    const logoUrl = saveFile(folder, files.logo, "Logo - " + teamName);
    const photoUrl = files.photo ? saveFile(folder, files.photo, "Foto - " + teamName) : "";
    const receiptUrl = saveFile(folder, files.receipt, "Comprobante - " + teamName);

    lock.waitLock(20000);
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(SHEET_NAME);
    sheet.appendRow([
      now,
      teamName,
      instagram ? "https://instagram.com/" + instagram : "",
      delegateName,
      "https://wa.me/" + whatsapp.replace("+", ""),
      logoUrl,
      photoUrl,
      receiptUrl,
      folder.getUrl(),
      "Pendiente",
    ]);
    SpreadsheetApp.flush();
    lock.releaseLock();

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: "🏆 Nueva inscripción SAS CUP 2026: " + teamName,
        htmlBody:
          "<h2>" + escapeHtml(teamName) + "</h2>" +
          "<p><b>Delegado:</b> " + escapeHtml(delegateName) + "<br>" +
          "<b>WhatsApp:</b> <a href='https://wa.me/" + whatsapp.replace("+", "") + "'>" + whatsapp + "</a><br>" +
          (instagram ? "<b>Instagram:</b> @" + escapeHtml(instagram) + "<br>" : "") +
          "<b>Comprobante:</b> <a href='" + receiptUrl + "'>ver</a><br>" +
          "<b>Carpeta:</b> <a href='" + folder.getUrl() + "'>abrir</a></p>",
      });
    }

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: "Error interno." });
  } finally {
    try { lock.releaseLock(); } catch (_) { }
  }
}

/** Permite comprobar que el Web App está publicado abriendo la URL. */
function doGet() {
  return json({ ok: true, service: "SAS CUP 2026 inscripciones" });
}

/* ---------- Helpers ---------- */
function saveFile(folder, file, baseName) {
  if (!file || !file.data) return "";
  const type = String(file.type || "application/octet-stream");
  if (!ALLOWED_TYPES.test(type)) throw new Error("Tipo de archivo no permitido: " + type);

  const bytes = Utilities.base64Decode(file.data);
  if (bytes.length > MAX_FILE_BYTES) throw new Error("Archivo demasiado grande");

  const ext = (String(file.name || "").match(/\.[a-z0-9]{2,5}$/i) || [""])[0];
  const blob = Utilities.newBlob(bytes, type, baseName + ext);
  return folder.createFile(blob).getUrl();
}

function clean(value, max) {
  return String(value || "").replace(/[\u0000-\u001F]/g, "").trim().slice(0, max);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
