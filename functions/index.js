/**
 * Guidr Cloud Functions — server-authoritative aggregate counters.
 *
 * The home page reads a single `stats/global` doc for community totals.
 * To keep those counters tamper-proof, clients are NOT allowed to write
 * `stats/*` (see firestore.rules). Instead these triggers run with admin
 * privileges and increment the counters whenever the source documents are
 * created.
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// Keep triggers close to the Firestore database (asia-southeast1).
const REGION = "asia-southeast1";
const statsRef = () => db.doc("stats/global");

/** A new case was filed → bump totalCases (+ reportedNSRC if applicable). */
exports.onCaseCreated = onDocumentCreated(
  { document: "cases/{caseId}", region: REGION },
  async (event) => {
    const data = event.data && event.data.data();
    if (!data) return;

    const updates = { totalCases: FieldValue.increment(1) };
    if (data.reportedToNSRC === true) {
      updates.reportedNSRC = FieldValue.increment(1);
    }
    await statsRef().set(updates, { merge: true });
  }
);

/** A new user profile was created → bump totalUsers. */
exports.onUserCreated = onDocumentCreated(
  { document: "users/{uid}", region: REGION },
  async (event) => {
    if (!event.data) return;
    await statsRef().set(
      { totalUsers: FieldValue.increment(1) },
      { merge: true }
    );
  }
);
