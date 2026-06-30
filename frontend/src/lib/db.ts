/**
 * IndexedDB wrapper — mogumogu-db
 *
 * Stores:
 *   auth     : session data (JWT token, userUUID, loginId, webhookToken)
 *   settings : key-value store (geminiKey, feedbackCache)
 */

const DB_NAME = 'mogumogu-db';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('auth')) {
        db.createObjectStore('auth', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function dbPut(storeName: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function dbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// ---------------------------------------------------------------------------
// Auth session
// ---------------------------------------------------------------------------

export interface AuthSession {
  id: 'session';
  token: string;
  userUUID: string;
  loginId: string;
  webhookToken: string;
}

export async function getSession(): Promise<AuthSession | undefined> {
  return dbGet<AuthSession>('auth', 'session');
}

export async function saveSession(data: Omit<AuthSession, 'id'>): Promise<void> {
  return dbPut('auth', { id: 'session', ...data });
}

export async function clearSession(): Promise<void> {
  return dbDelete('auth', 'session');
}

// ---------------------------------------------------------------------------
// Gemini API key
// ---------------------------------------------------------------------------

export async function getGeminiKey(): Promise<string | undefined> {
  const row = await dbGet<{ id: string; value: string }>('settings', 'geminiKey');
  return row?.value;
}

export async function saveGeminiKey(key: string): Promise<void> {
  return dbPut('settings', { id: 'geminiKey', value: key });
}

export async function clearGeminiKey(): Promise<void> {
  return dbDelete('settings', 'geminiKey');
}

// ---------------------------------------------------------------------------
// Daily feedback cache (仕様: 1日1回のみ生成)
// ---------------------------------------------------------------------------

export interface FeedbackCache {
  date: string;   // YYYY-MM-DD Asia/Tokyo
  message: string;
}

export async function getFeedbackCache(): Promise<FeedbackCache | undefined> {
  const row = await dbGet<{ id: string; value: FeedbackCache }>('settings', 'feedbackCache');
  return row?.value;
}

export async function saveFeedbackCache(cache: FeedbackCache): Promise<void> {
  return dbPut('settings', { id: 'feedbackCache', value: cache });
}
