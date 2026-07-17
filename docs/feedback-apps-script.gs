/**
 * Guidr Feedback — Google Apps Script Web App
 *
 * Deploy this in script.google.com so the Guidr server can POST feedback rows
 * into a Google Sheet without us needing a database.
 *
 * ── ONE-TIME SETUP ─────────────────────────────────────────────────────────
 * 1. Create a Google Sheet. Rename the first tab to "Feedback".
 * 2. In the first row add headers (in this exact order):
 *      A: Timestamp   B: UID   C: Email   D: Category
 *      E: Rating   F: Message
 *    (Email is only filled in when the user opted in to be contacted.)
 * 3. In the Sheet menu → Extensions → Apps Script.
 * 4. Replace the default Code.gs contents with this file's contents.
 * 5. Click Deploy → New deployment → "Web app".
 *      - Description: "Guidr feedback ingest"
 *      - Execute as: "Me"
 *      - Who has access: "Anyone"  (we gate access via the shared secret below)
 * 6. Click Deploy and copy the Web app URL.
 * 7. In the Apps Script editor → "Project Settings" (gear icon) → "Script properties":
 *      Add a property:  GUIDR_SHARED_SECRET  =  (any long random string)
 *    Save the SAME string in Vercel as the env var GOOGLE_FEEDBACK_SECRET.
 * 8. In Vercel add: GOOGLE_FEEDBACK_WEBHOOK_URL = the Web app URL from step 6.
 *
 * ── WHY A SHARED SECRET ────────────────────────────────────────────────────
 * Apps Script Web Apps deployed as "Anyone" are reachable by the public
 * internet. A 32+ char random secret in a header means random scrapers /
 * bots can't append rows even if they find the URL.
 */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || "{}");

    // Auth: verify the shared secret matches the one stored in Script properties.
    var expected = PropertiesService.getScriptProperties().getProperty("GUIDR_SHARED_SECRET");
    if (!expected || body.secret !== expected) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: "Unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Feedback");
    if (!sheet) throw new Error("Sheet 'Feedback' not found");

    sheet.appendRow([
      new Date(),                       // A: Timestamp
      body.uid || "",                   // B: UID
      body.email || "",                 // C: Email (only when user opted in)
      body.category || "general",       // D: Category
      body.rating || "",                // E: Rating
      body.message || "",               // F: Message
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
