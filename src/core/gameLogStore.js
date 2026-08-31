const DB_NAME = "hyperion_orbit_logs";
const DB_VERSION = 1;
const STORE_NAME = "events";
export const GAME_LOG_LIMIT = 100_000;

let databasePromise = null;
let writesSincePrune = 0;

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("IndexedDB indisponible"));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      if (!store.indexNames.contains("userTimestamp")) {
        store.createIndex("userTimestamp", ["userId", "timestamp"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Ouverture IndexedDB impossible"));
  });
  return databasePromise;
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Transaction IndexedDB impossible"));
    transaction.onabort = () => reject(transaction.error || new Error("Transaction IndexedDB annulée"));
  });
}

async function pruneUserLogs(userId) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const index = transaction.objectStore(STORE_NAME).index("userTimestamp");
  const range = IDBKeyRange.bound([userId, 0], [userId, Number.MAX_SAFE_INTEGER]);
  let kept = 0;
  index.openCursor(range, "prev").onsuccess = (event) => {
    const cursor = event.target.result;
    if (!cursor) return;
    kept += 1;
    if (kept > GAME_LOG_LIMIT) cursor.delete();
    cursor.continue();
  };
  await transactionDone(transaction);
}

export async function appendGameLog(userId, entry) {
  if (!userId) return;
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).add({
    userId: String(userId),
    timestamp: Number(entry.timestamp) || Date.now(),
    type: String(entry.type || "info"),
    text: String(entry.text || ""),
  });
  await transactionDone(transaction);
  writesSincePrune += 1;
  if (writesSincePrune >= 100) {
    writesSincePrune = 0;
    await pruneUserLogs(String(userId));
  }
}

export async function readGameLogs(userId, { query = "", page = 0, pageSize = 100 } = {}) {
  if (!userId) return { entries: [], hasNext: false };
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const index = transaction.objectStore(STORE_NAME).index("userTimestamp");
  const range = IDBKeyRange.bound([String(userId), 0], [String(userId), Number.MAX_SAFE_INTEGER]);
  const normalizedQuery = String(query).trim().toLocaleLowerCase("fr-FR");
  const offset = Math.max(0, Number(page) || 0) * pageSize;
  const entries = [];
  let matchingIndex = 0;

  await new Promise((resolve, reject) => {
    const request = index.openCursor(range, "prev");
    request.onerror = () => reject(request.error || new Error("Lecture IndexedDB impossible"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || entries.length > pageSize) return resolve();
      const entry = cursor.value;
      if (!normalizedQuery || entry.text.toLocaleLowerCase("fr-FR").includes(normalizedQuery)) {
        if (matchingIndex >= offset) entries.push(entry);
        matchingIndex += 1;
      }
      cursor.continue();
    };
  });

  return { entries: entries.slice(0, pageSize), hasNext: entries.length > pageSize };
}

