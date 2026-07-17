/**
 * Drop-in replacement for `firebase-admin/firestore` that talks to the
 * Firestore REST API instead of gRPC.
 *
 * WHY: the real Admin SDK's Firestore client (@google-cloud/firestore) loads
 * its protocol schema through protobufjs, which generates code with
 * `new Function(...)` at runtime. Cloudflare Workers forbid runtime code
 * generation (EvalError: Code generation from strings disallowed), and
 * protobufjs has no non-eval fallback — so the real client can never run
 * there. Admin Auth (JWT/JWKS) and Messaging (plain HTTP) are unaffected and
 * still use the real firebase-admin.
 *
 * HOW IT'S WIRED: server code imports this module directly instead of
 * `firebase-admin/firestore`. (A webpack alias can't do it: Next externalizes
 * firebase-admin from the server bundle by default, so its imports never go
 * through webpack resolution.) This module only has to match the real
 * package's runtime behavior for the API surface the app uses:
 *
 *   collection/doc/get/set(+merge)/update/delete/add, where(== <)/limit
 *   queries, runTransaction (reads: doc + query), batch, FieldValue
 *   increment/arrayUnion/arrayRemove/serverTimestamp/delete, Timestamp.
 *
 * Auth: mints an OAuth2 access token from the service-account key in
 * FIREBASE_ADMIN_CREDENTIALS_JSON (or firebase-admin-credentials.json
 * locally), signing the assertion with WebCrypto — no extra dependencies.
 */

import * as fs from "fs";
import * as path from "path";

const FIRESTORE_HOST = "https://firestore.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

// ─────────────────────────────────────────────────────────────────────────────
// Credentials + OAuth token
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedKey: ServiceAccountKey | null | undefined;

function loadKey(): ServiceAccountKey | null {
  if (cachedKey !== undefined) return cachedKey;
  cachedKey = null;
  const fromEnv = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (fromEnv) {
    try {
      const parsed = JSON.parse(fromEnv);
      if (parsed.private_key && parsed.client_email && parsed.project_id) {
        cachedKey = parsed as ServiceAccountKey;
      }
    } catch {
      /* fall through */
    }
    return cachedKey;
  }
  try {
    const localPath = path.join(process.cwd(), "firebase-admin-credentials.json");
    if (fs.existsSync(localPath)) {
      cachedKey = JSON.parse(fs.readFileSync(localPath, "utf8")) as ServiceAccountKey;
    }
  } catch {
    /* no local file */
  }
  return cachedKey;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedToken: { token: string; expiresAtMs: number } | null = null;

async function getAccessToken(key: ServiceAccountKey): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAtMs - 60_000) {
    return cachedToken.token;
  }
  const iat = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        iss: key.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat,
        exp: iat + 3600,
      })
    )
  );
  const signingInput = `${header}.${claims}`;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(key.private_key) as unknown as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, enc.encode(signingInput));
  const assertion = `${signingInput}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
  });
  if (!res.ok) {
    throw new Error(`firestore-rest: token exchange failed (${res.status}) ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAtMs: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp + FieldValue sentinels
// ─────────────────────────────────────────────────────────────────────────────

export class Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }
  static fromMillis(ms: number): Timestamp {
    const seconds = Math.floor(ms / 1000);
    return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6));
  }
  static fromDate(d: Date): Timestamp {
    return Timestamp.fromMillis(d.getTime());
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.round(this.nanoseconds / 1e6);
  }
  toDate(): Date {
    return new Date(this.toMillis());
  }

  /** RFC 3339 string for the REST API. */
  toISO(): string {
    const base = new Date(this.seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "");
    return `${base}.${String(this.nanoseconds).padStart(9, "0")}Z`;
  }

  static fromISO(iso: string): Timestamp {
    const ms = Date.parse(iso);
    const frac = /\.(\d+)/.exec(iso);
    const seconds = Math.floor(ms / 1000);
    let nanos = 0;
    if (frac) nanos = Math.round(Number(`0.${frac[1]}`) * 1e9);
    return new Timestamp(seconds, nanos);
  }
}

type SentinelKind = "serverTimestamp" | "increment" | "arrayUnion" | "arrayRemove" | "delete";

class FieldValueSentinel {
  constructor(
    readonly kind: SentinelKind,
    readonly operand?: unknown
  ) {}
}

export const FieldValue = {
  serverTimestamp: () => new FieldValueSentinel("serverTimestamp"),
  increment: (n: number) => new FieldValueSentinel("increment", n),
  arrayUnion: (...values: unknown[]) => new FieldValueSentinel("arrayUnion", values),
  arrayRemove: (...values: unknown[]) => new FieldValueSentinel("arrayRemove", values),
  delete: () => new FieldValueSentinel("delete"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Value codec (JS ⇄ Firestore REST Value JSON)
// ─────────────────────────────────────────────────────────────────────────────

type RestValue = Record<string, unknown>;

function encodeValue(v: unknown): RestValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    if (Number.isInteger(v) && Number.isSafeInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Timestamp) return { timestampValue: v.toISO() };
  if (v instanceof Date) return { timestampValue: Timestamp.fromDate(v).toISO() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (v instanceof Uint8Array) return { bytesValue: b64url(v) };
  if (typeof v === "object") return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
  throw new Error(`firestore-rest: cannot encode value of type ${typeof v}`);
}

function encodeFields(obj: Record<string, unknown>): Record<string, RestValue> {
  const out: Record<string, RestValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue; // Admin SDK skips undefined by default
    out[k] = encodeValue(v);
  }
  return out;
}

function decodeValue(v: RestValue): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return Timestamp.fromISO(v.timestampValue as string);
  if ("bytesValue" in v) return v.bytesValue;
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("arrayValue" in v) {
    const arr = (v.arrayValue as { values?: RestValue[] }).values || [];
    return arr.map(decodeValue);
  }
  if ("mapValue" in v) {
    return decodeFields((v.mapValue as { fields?: Record<string, RestValue> }).fields || {});
  }
  return null;
}

function decodeFields(fields: Record<string, RestValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Write encoding (documents + field transforms + masks)
// ─────────────────────────────────────────────────────────────────────────────

function escapeSegment(seg: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(seg) ? seg : `\`${seg.replace(/[`\\]/g, "\\$&")}\``;
}

function joinPath(segments: string[]): string {
  return segments.map(escapeSegment).join(".");
}

interface Transform {
  fieldPath: string;
  setToServerValue?: "REQUEST_TIME";
  increment?: RestValue;
  appendMissingElements?: { values: RestValue[] };
  removeAllFromArray?: { values: RestValue[] };
}

function toTransform(fieldPath: string, s: FieldValueSentinel): Transform {
  switch (s.kind) {
    case "serverTimestamp":
      return { fieldPath, setToServerValue: "REQUEST_TIME" };
    case "increment":
      return { fieldPath, increment: encodeValue(s.operand) };
    case "arrayUnion":
      return { fieldPath, appendMissingElements: { values: (s.operand as unknown[]).map(encodeValue) } };
    case "arrayRemove":
      return { fieldPath, removeAllFromArray: { values: (s.operand as unknown[]).map(encodeValue) } };
    default:
      throw new Error(`firestore-rest: ${s.kind} is not a transform`);
  }
}

/**
 * Walk `data`, separating plain values from FieldValue sentinels.
 * Returns encoded fields, the transforms, delete-paths, and (for merge)
 * the leaf paths of every plain value.
 */
function splitData(
  data: Record<string, unknown>,
  basePath: string[] = []
): {
  fields: Record<string, RestValue>;
  transforms: Transform[];
  deletePaths: string[];
  leafPaths: string[];
} {
  const fields: Record<string, RestValue> = {};
  const transforms: Transform[] = [];
  const deletePaths: string[] = [];
  const leafPaths: string[] = [];

  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const segs = [...basePath, k];
    if (v instanceof FieldValueSentinel) {
      if (v.kind === "delete") deletePaths.push(joinPath(segs));
      else transforms.push(toTransform(joinPath(segs), v));
      continue;
    }
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof Timestamp) &&
      !(v instanceof Date) &&
      !(v instanceof Uint8Array)
    ) {
      const nested = splitData(v as Record<string, unknown>, segs);
      transforms.push(...nested.transforms);
      deletePaths.push(...nested.deletePaths);
      if (Object.keys(nested.fields).length > 0 || nested.leafPaths.length === 0) {
        fields[k] = { mapValue: { fields: nested.fields } };
      }
      if (Object.keys(v as object).length === 0) {
        leafPaths.push(joinPath(segs)); // explicit empty map is a leaf
      } else {
        leafPaths.push(...nested.leafPaths);
      }
      continue;
    }
    fields[k] = encodeValue(v);
    leafPaths.push(joinPath(segs));
  }
  return { fields, transforms, deletePaths, leafPaths };
}

interface RestWrite {
  update?: { name: string; fields: Record<string, RestValue> };
  delete?: string;
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: Transform[];
  currentDocument?: { exists: boolean };
}

function buildSetWrite(
  docName: string,
  data: Record<string, unknown>,
  options?: { merge?: boolean },
  precondition?: { exists: boolean }
): RestWrite {
  const { fields, transforms, deletePaths, leafPaths } = splitData(data);
  const write: RestWrite = { update: { name: docName, fields } };
  if (options?.merge) {
    write.updateMask = { fieldPaths: [...leafPaths, ...deletePaths] };
  } else if (deletePaths.length > 0) {
    throw new Error("firestore-rest: FieldValue.delete() requires merge or update");
  }
  if (transforms.length > 0) write.updateTransforms = transforms;
  if (precondition) write.currentDocument = precondition;
  return write;
}

function buildUpdateWrite(docName: string, data: Record<string, unknown>): RestWrite {
  // Admin update(): keys are field paths; nested objects replace that subtree.
  const fields: Record<string, RestValue> = {};
  const transforms: Transform[] = [];
  const maskPaths: string[] = [];

  const setDeep = (root: Record<string, RestValue>, segs: string[], value: RestValue) => {
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const existing = cur[segs[i]];
      if (existing && "mapValue" in existing) {
        cur = (existing.mapValue as { fields: Record<string, RestValue> }).fields;
      } else {
        const next: Record<string, RestValue> = {};
        cur[segs[i]] = { mapValue: { fields: next } };
        cur = next;
      }
    }
    cur[segs[segs.length - 1]] = value;
  };

  for (const [key, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const segs = key.split(".");
    const fieldPath = joinPath(segs);
    if (v instanceof FieldValueSentinel) {
      if (v.kind === "delete") maskPaths.push(fieldPath);
      else transforms.push(toTransform(fieldPath, v));
      continue;
    }
    maskPaths.push(fieldPath);
    setDeep(fields, segs, encodeValue(v));
  }

  const write: RestWrite = {
    update: { name: docName, fields },
    updateMask: { fieldPaths: maskPaths },
    currentDocument: { exists: true },
  };
  if (transforms.length > 0) write.updateTransforms = transforms;
  return write;
}

// ─────────────────────────────────────────────────────────────────────────────
// REST client core
// ─────────────────────────────────────────────────────────────────────────────

class RestClient {
  readonly projectId: string;
  private key: ServiceAccountKey;

  constructor(key: ServiceAccountKey) {
    this.key = key;
    this.projectId = key.project_id;
  }

  get dbPath(): string {
    return `projects/${this.projectId}/databases/(default)`;
  }
  docName(docPath: string): string {
    return `${this.dbPath}/documents/${docPath}`;
  }

  async request(method: string, url: string, body?: unknown): Promise<unknown> {
    const token = await getAccessToken(this.key);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      let status = "";
      let message = "";
      try {
        const err = (await res.json()) as { error?: { status?: string; message?: string } };
        status = err.error?.status || "";
        message = err.error?.message || "";
      } catch {
        /* non-JSON error body */
      }
      const e = new Error(
        `firestore-rest: ${method} failed (${res.status} ${status}) ${message}`
      ) as Error & { code?: string; httpStatus?: number };
      e.code = status || String(res.status);
      e.httpStatus = res.status;
      throw e;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async getDoc(docPath: string, transaction?: string): Promise<RestDocument | null> {
    const qs = transaction ? `?transaction=${encodeURIComponent(transaction)}` : "";
    try {
      return (await this.request(
        "GET",
        `${FIRESTORE_HOST}/${this.docName(docPath)}${qs}`
      )) as RestDocument;
    } catch (err) {
      if ((err as { httpStatus?: number }).httpStatus === 404) return null;
      throw err;
    }
  }

  async runQuery(
    parentDocPath: string | null,
    structuredQuery: Record<string, unknown>,
    transaction?: string
  ): Promise<Array<{ document?: RestDocument }>> {
    const parent = parentDocPath ? this.docName(parentDocPath) : `${this.dbPath}/documents`;
    const body: Record<string, unknown> = { structuredQuery };
    if (transaction) body.transaction = transaction;
    return (await this.request("POST", `${FIRESTORE_HOST}/${parent}:runQuery`, body)) as Array<{
      document?: RestDocument;
    }>;
  }

  async commit(writes: RestWrite[], transaction?: string): Promise<void> {
    const body: Record<string, unknown> = { writes };
    if (transaction) body.transaction = transaction;
    await this.request("POST", `${FIRESTORE_HOST}/${this.dbPath}/documents:commit`, body);
  }

  async beginTransaction(retryTransaction?: string): Promise<string> {
    const body = retryTransaction
      ? { options: { readWrite: { retryTransaction } } }
      : { options: { readWrite: {} } };
    const res = (await this.request(
      "POST",
      `${FIRESTORE_HOST}/${this.dbPath}/documents:beginTransaction`,
      body
    )) as { transaction: string };
    return res.transaction;
  }

  async rollback(transaction: string): Promise<void> {
    await this.request("POST", `${FIRESTORE_HOST}/${this.dbPath}/documents:rollback`, {
      transaction,
    }).catch(() => {});
  }

  async listCollectionIds(parentDocPath: string): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const body: Record<string, unknown> = { pageSize: 300 };
      if (pageToken) body.pageToken = pageToken;
      const res = (await this.request(
        "POST",
        `${FIRESTORE_HOST}/${this.docName(parentDocPath)}:listCollectionIds`,
        body
      )) as { collectionIds?: string[]; nextPageToken?: string };
      ids.push(...(res.collectionIds || []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return ids;
  }
}

interface RestDocument {
  name: string;
  fields?: Record<string, RestValue>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API classes (mirroring firebase-admin/firestore)
// ─────────────────────────────────────────────────────────────────────────────

function autoId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < 20; i++) id += chars[bytes[i] % 62];
  return id;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- mirrors the real SDK's DocumentData */
export type DocumentData = { [field: string]: any };

export class DocumentSnapshot {
  constructor(
    readonly ref: DocumentReference,
    private readonly _fields: Record<string, RestValue> | null
  ) {}

  get exists(): boolean {
    return this._fields !== null;
  }
  get id(): string {
    return this.ref.id;
  }
  data(): DocumentData | undefined {
    if (this._fields === null) return undefined;
    return decodeFields(this._fields);
  }
  get(field: string): unknown {
    const d = this.data();
    return d ? field.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], d) : undefined;
  }
}

/** Snapshot from a query result — always exists, data() never undefined. */
export class QueryDocumentSnapshot extends DocumentSnapshot {
  data(): DocumentData {
    return super.data() as DocumentData;
  }
}

export class QuerySnapshot {
  constructor(readonly docs: QueryDocumentSnapshot[]) {}
  get empty(): boolean {
    return this.docs.length === 0;
  }
  get size(): number {
    return this.docs.length;
  }
  forEach(cb: (doc: QueryDocumentSnapshot) => void): void {
    this.docs.forEach(cb);
  }
}

const OPS: Record<string, string> = {
  "==": "EQUAL",
  "!=": "NOT_EQUAL",
  "<": "LESS_THAN",
  "<=": "LESS_THAN_OR_EQUAL",
  ">": "GREATER_THAN",
  ">=": "GREATER_THAN_OR_EQUAL",
  "array-contains": "ARRAY_CONTAINS",
  "array-contains-any": "ARRAY_CONTAINS_ANY",
  in: "IN",
  "not-in": "NOT_IN",
};

interface FilterSpec {
  field: string;
  op: string;
  value: unknown;
}

export class Query {
  constructor(
    protected readonly db: Firestore,
    protected readonly parentDocPath: string | null,
    protected readonly collectionId: string,
    protected readonly filters: FilterSpec[] = [],
    protected readonly limitCount?: number
  ) {}

  where(field: string, op: string, value: unknown): Query {
    if (!OPS[op]) throw new Error(`firestore-rest: unsupported operator "${op}"`);
    return new Query(
      this.db,
      this.parentDocPath,
      this.collectionId,
      [...this.filters, { field, op, value }],
      this.limitCount
    );
  }

  limit(n: number): Query {
    return new Query(this.db, this.parentDocPath, this.collectionId, this.filters, n);
  }

  buildStructuredQuery(): Record<string, unknown> {
    const q: Record<string, unknown> = {
      from: [{ collectionId: this.collectionId }],
    };
    if (this.filters.length > 0) {
      const fieldFilters = this.filters.map((f) => ({
        fieldFilter: {
          field: { fieldPath: joinPath(f.field.split(".")) },
          op: OPS[f.op],
          value: encodeValue(f.value),
        },
      }));
      q.where =
        fieldFilters.length === 1
          ? fieldFilters[0]
          : { compositeFilter: { op: "AND", filters: fieldFilters } };
    }
    if (this.limitCount !== undefined) q.limit = this.limitCount;
    return q;
  }

  async get(): Promise<QuerySnapshot> {
    return this.db._runQuery(this);
  }

  get _parentDocPath(): string | null {
    return this.parentDocPath;
  }
}

export class CollectionReference extends Query {
  constructor(db: Firestore, parentDocPath: string | null, collectionId: string) {
    super(db, parentDocPath, collectionId);
  }

  get id(): string {
    return this.collectionId;
  }
  get path(): string {
    return this.parentDocPath ? `${this.parentDocPath}/${this.collectionId}` : this.collectionId;
  }

  doc(id?: string): DocumentReference {
    const docId = id ?? autoId();
    if (docId.includes("/")) {
      throw new Error("firestore-rest: collection().doc() takes a plain id, not a path");
    }
    return new DocumentReference(this.db, `${this.path}/${docId}`);
  }

  async add(data: Record<string, unknown>): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

export class DocumentReference {
  constructor(
    readonly firestore: Firestore,
    readonly path: string
  ) {}

  get id(): string {
    const segs = this.path.split("/");
    return segs[segs.length - 1];
  }

  get parent(): CollectionReference {
    const segs = this.path.split("/");
    const collectionId = segs[segs.length - 2];
    const parentDocPath = segs.length > 2 ? segs.slice(0, -2).join("/") : null;
    return new CollectionReference(this.firestore, parentDocPath, collectionId);
  }

  collection(collectionId: string): CollectionReference {
    return new CollectionReference(this.firestore, this.path, collectionId);
  }

  async get(): Promise<DocumentSnapshot> {
    const doc = await this.firestore._client.getDoc(this.path);
    return new DocumentSnapshot(this, doc?.fields ?? (doc ? {} : null));
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    await this.firestore._client.commit([
      buildSetWrite(this.firestore._client.docName(this.path), data, options),
    ]);
  }

  async create(data: Record<string, unknown>): Promise<void> {
    await this.firestore._client.commit([
      buildSetWrite(this.firestore._client.docName(this.path), data, undefined, { exists: false }),
    ]);
  }

  async update(data: Record<string, unknown>): Promise<void> {
    await this.firestore._client.commit([
      buildUpdateWrite(this.firestore._client.docName(this.path), data),
    ]);
  }

  async delete(): Promise<void> {
    await this.firestore._client.commit([{ delete: this.firestore._client.docName(this.path) }]);
  }
}

export class Transaction {
  private writes: RestWrite[] = [];

  constructor(
    private readonly db: Firestore,
    private readonly txId: string
  ) {}

  async get(ref: DocumentReference): Promise<DocumentSnapshot>;
  async get(query: Query): Promise<QuerySnapshot>;
  async get(refOrQuery: DocumentReference | Query): Promise<DocumentSnapshot | QuerySnapshot> {
    if (this.writes.length > 0) {
      throw new Error("firestore-rest: all transaction reads must come before writes");
    }
    if (refOrQuery instanceof DocumentReference) {
      const doc = await this.db._client.getDoc(refOrQuery.path, this.txId);
      return new DocumentSnapshot(refOrQuery, doc?.fields ?? (doc ? {} : null));
    }
    return this.db._runQuery(refOrQuery, this.txId);
  }

  set(ref: DocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }): this {
    this.writes.push(buildSetWrite(this.db._client.docName(ref.path), data, options));
    return this;
  }

  update(ref: DocumentReference, data: Record<string, unknown>): this {
    this.writes.push(buildUpdateWrite(this.db._client.docName(ref.path), data));
    return this;
  }

  delete(ref: DocumentReference): this {
    this.writes.push({ delete: this.db._client.docName(ref.path) });
    return this;
  }

  create(ref: DocumentReference, data: Record<string, unknown>): this {
    this.writes.push(
      buildSetWrite(this.db._client.docName(ref.path), data, undefined, { exists: false })
    );
    return this;
  }

  _pendingWrites(): RestWrite[] {
    return this.writes;
  }
}

export class WriteBatch {
  private writes: RestWrite[] = [];

  constructor(private readonly db: Firestore) {}

  set(ref: DocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }): this {
    this.writes.push(buildSetWrite(this.db._client.docName(ref.path), data, options));
    return this;
  }
  update(ref: DocumentReference, data: Record<string, unknown>): this {
    this.writes.push(buildUpdateWrite(this.db._client.docName(ref.path), data));
    return this;
  }
  delete(ref: DocumentReference): this {
    this.writes.push({ delete: this.db._client.docName(ref.path) });
    return this;
  }

  async commit(): Promise<void> {
    if (this.writes.length === 0) return;
    await this.db._client.commit(this.writes);
  }
}

const MAX_TX_ATTEMPTS = 5;

export class Firestore {
  readonly _client: RestClient;

  constructor(key: ServiceAccountKey) {
    this._client = new RestClient(key);
  }

  /** Accepted for compatibility (preferRest etc.); REST is the only transport here. */
  settings(_settings: Record<string, unknown>): void {}

  collection(collectionPath: string): CollectionReference {
    const segs = collectionPath.split("/").filter(Boolean);
    if (segs.length % 2 === 0) {
      throw new Error(`firestore-rest: "${collectionPath}" is not a collection path`);
    }
    const collectionId = segs[segs.length - 1];
    const parentDocPath = segs.length > 1 ? segs.slice(0, -1).join("/") : null;
    return new CollectionReference(this, parentDocPath, collectionId);
  }

  doc(docPath: string): DocumentReference {
    const segs = docPath.split("/").filter(Boolean);
    if (segs.length % 2 !== 0) {
      throw new Error(`firestore-rest: "${docPath}" is not a document path`);
    }
    return new DocumentReference(this, segs.join("/"));
  }

  batch(): WriteBatch {
    return new WriteBatch(this);
  }

  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    let lastTxId: string | undefined;
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_TX_ATTEMPTS; attempt++) {
      const txId = await this._client.beginTransaction(lastTxId);
      lastTxId = txId;
      const tx = new Transaction(this, txId);
      try {
        const result = await fn(tx);
        await this._client.commit(tx._pendingWrites(), txId);
        return result;
      } catch (err) {
        lastErr = err;
        const code = (err as { code?: string; httpStatus?: number }).code;
        const httpStatus = (err as { httpStatus?: number }).httpStatus;
        const retriable = code === "ABORTED" || httpStatus === 409;
        if (!retriable) {
          await this._client.rollback(txId);
          throw err;
        }
        // brief backoff before retrying a contended transaction
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  /**
   * Delete a document and everything under it (sub-collections, recursively),
   * mirroring the Admin SDK's recursiveDelete. Descendant doc paths are
   * gathered depth-first, then deleted in chunked commits.
   */
  async recursiveDelete(ref: DocumentReference): Promise<void> {
    const toDelete: string[] = [];
    const gather = async (docPath: string): Promise<void> => {
      const collectionIds = await this._client.listCollectionIds(docPath);
      for (const collectionId of collectionIds) {
        const results = await this._client.runQuery(docPath, {
          from: [{ collectionId }],
          select: { fields: [{ fieldPath: "__name__" }] },
        });
        const prefix = `${this._client.dbPath}/documents/`;
        for (const r of results) {
          if (!r.document) continue;
          const childPath = (r.document as RestDocument).name.slice(prefix.length);
          await gather(childPath);
        }
      }
      toDelete.push(docPath);
    };
    await gather(ref.path);

    for (let i = 0; i < toDelete.length; i += 250) {
      await this._client.commit(
        toDelete.slice(i, i + 250).map((p) => ({ delete: this._client.docName(p) }))
      );
    }
  }

  async _runQuery(query: Query, transaction?: string): Promise<QuerySnapshot> {
    const results = await this._client.runQuery(
      query._parentDocPath,
      query.buildStructuredQuery(),
      transaction
    );
    const prefix = `${this._client.dbPath}/documents/`;
    const docs = results
      .filter((r) => r.document)
      .map((r) => {
        const name = (r.document as RestDocument).name;
        const path = name.startsWith(prefix) ? name.slice(prefix.length) : name;
        return new QueryDocumentSnapshot(
          new DocumentReference(this, path),
          (r.document as RestDocument).fields || {}
        );
      });
    return new QuerySnapshot(docs);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Module entry point — mirrors firebase-admin/firestore's getFirestore()
// ─────────────────────────────────────────────────────────────────────────────

let singleton: Firestore | null = null;

/**
 * The `app` argument is accepted for signature compatibility but ignored:
 * credentials are loaded from FIREBASE_ADMIN_CREDENTIALS_JSON (or the local
 * firebase-admin-credentials.json), same as firebase-admin.ts does.
 */
export function getFirestore(_app?: unknown): Firestore {
  if (singleton) return singleton;
  const key = loadKey();
  if (!key) {
    throw new Error(
      "firestore-rest: no service-account credentials (set FIREBASE_ADMIN_CREDENTIALS_JSON)"
    );
  }
  singleton = new Firestore(key);
  return singleton;
}
