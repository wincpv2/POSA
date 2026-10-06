import { Platform } from 'react-native';
import { localDeviceStorage } from './supabase';
import type { RecordSummary, RecordTimeline, SignalMinute } from './inference';
import type { PredictionMinute, PredictionRun, RecentEcgUpload } from './queries';

const prefix = 'posa:offline:v1:';
const databaseName = 'posa-offline-cache-v1';
const storeName = 'records';

type CacheRow = { key: string; value: string };
export type CachedStudyReview = { run: PredictionRun; minutes: PredictionMinute[]; reportStatus: string };
let database: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Local browser storage is unavailable.'));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local ECG storage.'));
    request.onblocked = () => reject(new Error('Local ECG storage is busy. Close other POSA tabs and retry.'));
  }).catch((error) => {
    database = null;
    throw error;
  });
  return database;
}

async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS !== 'web') return localDeviceStorage.getItem(key);
  if (typeof window === 'undefined') return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve((request.result as CacheRow | undefined)?.value ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read local ECG storage.'));
  });
}

async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS !== 'web') return localDeviceStorage.setItem(key, value);
  if (typeof window === 'undefined') return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put({ key, value } satisfies CacheRow);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save local ECG data.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not save local ECG data.'));
  });
}

async function storageKeys(): Promise<string[]> {
  if (Platform.OS !== 'web') return [...await localDeviceStorage.getAllKeys()];
  if (typeof window === 'undefined') return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAllKeys();
    request.onsuccess = () => resolve(request.result.map(String));
    request.onerror = () => reject(request.error ?? new Error('Could not list local ECG data.'));
  });
}

async function storageRemove(keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (Platform.OS !== 'web') return localDeviceStorage.multiRemove(keys);
  if (typeof window === 'undefined') return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    keys.forEach((key) => store.delete(key));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear local ECG data.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not clear local ECG data.'));
  });
}

function studyPrefix(userId: string, uploadId: string) {
  return `${prefix}${userId}:${uploadId}:`;
}

function timelineKey(userId: string, uploadId: string, runId: string) {
  return `${studyPrefix(userId, uploadId)}timeline:${runId}`;
}

function signalKey(userId: string, uploadId: string, runId: string, mode: SignalMinute['mode'], minute: number) {
  return `${studyPrefix(userId, uploadId)}signal:${runId}:${mode}:${minute}`;
}

function reviewKey(userId: string, uploadId: string, runId: string) {
  return `${studyPrefix(userId, uploadId)}review:${runId}`;
}

function summaryKey(userId: string, uploadId: string, runId: string) {
  return `${studyPrefix(userId, uploadId)}summary:${runId}`;
}

function recentUploadsKey(userId: string) {
  return `${prefix}${userId}:recent-uploads`;
}

export async function readRecentUploadsCache(userId: string): Promise<RecentEcgUpload[] | null> {
  const value = await storageGet(recentUploadsKey(userId));
  return value ? JSON.parse(value) as RecentEcgUpload[] : null;
}

export function writeRecentUploadsCache(userId: string, uploads: RecentEcgUpload[]): Promise<void> {
  return storageSet(recentUploadsKey(userId), JSON.stringify(uploads));
}

export async function removeRecentUploadFromCache(userId: string, uploadId: string): Promise<void> {
  const uploads = await readRecentUploadsCache(userId);
  if (uploads) await writeRecentUploadsCache(userId, uploads.filter((upload) => upload.id !== uploadId));
}

export async function readStudyReviewCache(userId: string, uploadId: string, runId: string): Promise<CachedStudyReview | null> {
  const value = await storageGet(reviewKey(userId, uploadId, runId));
  return value ? JSON.parse(value) as CachedStudyReview : null;
}

export function writeStudyReviewCache(userId: string, uploadId: string, review: CachedStudyReview): Promise<void> {
  return storageSet(reviewKey(userId, uploadId, review.run.id), JSON.stringify(review));
}

export async function readRecordSummaryCache(userId: string, uploadId: string, runId: string): Promise<RecordSummary | null> {
  const value = await storageGet(summaryKey(userId, uploadId, runId));
  return value ? JSON.parse(value) as RecordSummary : null;
}

export function writeRecordSummaryCache(userId: string, uploadId: string, runId: string, summary: RecordSummary): Promise<void> {
  return storageSet(summaryKey(userId, uploadId, runId), JSON.stringify(summary));
}

export async function readTimelineCache(userId: string, uploadId: string, runId: string): Promise<RecordTimeline | null> {
  const value = await storageGet(timelineKey(userId, uploadId, runId));
  return value ? JSON.parse(value) as RecordTimeline : null;
}

export function writeTimelineCache(userId: string, timeline: RecordTimeline): Promise<void> {
  return storageSet(timelineKey(userId, timeline.uploadId, timeline.runId), JSON.stringify(timeline));
}

export async function readSignalCache(userId: string, uploadId: string, runId: string, mode: SignalMinute['mode'], minute: number): Promise<SignalMinute | null> {
  const value = await storageGet(signalKey(userId, uploadId, runId, mode, minute));
  return value ? JSON.parse(value) as SignalMinute : null;
}

export function writeSignalCache(userId: string, runId: string, signal: SignalMinute): Promise<void> {
  return storageSet(signalKey(userId, signal.uploadId, runId, signal.mode, signal.minuteIndex), JSON.stringify(signal));
}

export async function clearStudyOfflineCache(userId: string, uploadId: string): Promise<void> {
  const studyKeys = (await storageKeys()).filter((key) => key.startsWith(studyPrefix(userId, uploadId)));
  await storageRemove(studyKeys);
}

export async function clearUserOfflineCache(userId: string): Promise<void> {
  const userPrefix = `${prefix}${userId}:`;
  const userKeys = (await storageKeys()).filter((key) => key.startsWith(userPrefix));
  await storageRemove(userKeys);
}

export async function clearStaleStudyOfflineCache(userId: string, uploadId: string, runId: string): Promise<void> {
  const currentTimeline = timelineKey(userId, uploadId, runId);
  const currentSignals = `${studyPrefix(userId, uploadId)}signal:${runId}:`;
  const currentReview = reviewKey(userId, uploadId, runId);
  const currentSummary = summaryKey(userId, uploadId, runId);
  const staleKeys = (await storageKeys()).filter((key) => {
    if (!key.startsWith(studyPrefix(userId, uploadId))) return false;
    return key !== currentTimeline && key !== currentReview && key !== currentSummary && !key.startsWith(currentSignals);
  });
  await storageRemove(staleKeys);
}
