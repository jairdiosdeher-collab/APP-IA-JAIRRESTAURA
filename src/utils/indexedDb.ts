import { StoredDocumentRecord, AnalysisHistoryLog } from '../types';

const DB_NAME = 'JairRestauraIADeEstudioDB';
const DB_VERSION = 2;
const STORE_DOCUMENTS = 'documents';
const STORE_HISTORY = 'analysis_history';
const STORE_PROGRESS = 'course_progress';
const STORE_AUDIO_PROGRESS = 'audio_reading_progress';

export interface CourseProgressRecord {
  documentId: string;
  completedUnitIds: string[];
  earnedXp: number;
  updatedAt: string;
}

export type AudiobookMode =
  | 'full-document'
  | 'current-page'
  | 'current-chapter'
  | 'summary-only'
  | 'key-concepts'
  | 'important-questions'
  | 'study-mode'
  | 'ai-tutor';

export interface AudioReadingProgressRecord {
  documentId: string;
  documentTitle: string;
  audiobookMode: AudiobookMode;
  chunkIndex: number;
  totalChunks: number;
  chapterNumber: number;
  chapterTitle: string;
  pageNumber: number;
  totalPages: number;
  elapsedSeconds: number;
  percentCompleted: number;
  rate: number;
  voicePreset: string;
  updatedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        const docStore = db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
        docStore.createIndex('processedAt', 'processedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const histStore = db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
        histStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PROGRESS)) {
        db.createObjectStore(STORE_PROGRESS, { keyPath: 'documentId' });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO_PROGRESS)) {
        const audioStore = db.createObjectStore(STORE_AUDIO_PROGRESS, {
          keyPath: 'documentId',
        });
        audioStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGetAllDocuments(): Promise<StoredDocumentRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCUMENTS, 'readonly');
    const store = tx.objectStore(STORE_DOCUMENTS);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = (req.result as StoredDocumentRecord[]) || [];
      list.sort(
        (a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()
      );
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function idbSaveDocument(doc: StoredDocumentRecord): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCUMENTS, 'readwrite');
    const store = tx.objectStore(STORE_DOCUMENTS);
    store.put(doc);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDeleteDocument(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCUMENTS, 'readwrite');
    const store = tx.objectStore(STORE_DOCUMENTS);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClearAllDocuments(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCUMENTS, 'readwrite');
    const store = tx.objectStore(STORE_DOCUMENTS);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAllHistory(): Promise<AnalysisHistoryLog[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HISTORY, 'readonly');
    const store = tx.objectStore(STORE_HISTORY);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = (req.result as AnalysisHistoryLog[]) || [];
      list.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function idbAddHistoryLog(log: AnalysisHistoryLog): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    const store = tx.objectStore(STORE_HISTORY);
    store.put(log);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClearAllHistory(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    const store = tx.objectStore(STORE_HISTORY);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetCourseProgress(
  documentId: string
): Promise<CourseProgressRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROGRESS, 'readonly');
    const store = tx.objectStore(STORE_PROGRESS);
    const req = store.get(documentId);
    req.onsuccess = () => resolve((req.result as CourseProgressRecord) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAllCourseProgress(): Promise<CourseProgressRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROGRESS, 'readonly');
    const store = tx.objectStore(STORE_PROGRESS);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as CourseProgressRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSaveCourseProgress(
  record: CourseProgressRecord
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROGRESS, 'readwrite');
    const store = tx.objectStore(STORE_PROGRESS);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbSaveAudioReadingProgress(
  record: AudioReadingProgressRecord
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO_PROGRESS, 'readwrite');
    const store = tx.objectStore(STORE_AUDIO_PROGRESS);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAudioReadingProgress(
  documentId: string
): Promise<AudioReadingProgressRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO_PROGRESS, 'readonly');
    const store = tx.objectStore(STORE_AUDIO_PROGRESS);
    const req = store.get(documentId);
    req.onsuccess = () => resolve((req.result as AudioReadingProgressRecord) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetLatestAudioReadingProgress(): Promise<AudioReadingProgressRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO_PROGRESS, 'readonly');
    const store = tx.objectStore(STORE_AUDIO_PROGRESS);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = (req.result as AudioReadingProgressRecord[]) || [];
      if (list.length === 0) {
        resolve(null);
        return;
      }
      list.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      resolve(list[0]);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function idbDeleteAudioReadingProgress(documentId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO_PROGRESS, 'readwrite');
    const store = tx.objectStore(STORE_AUDIO_PROGRESS);
    store.delete(documentId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
