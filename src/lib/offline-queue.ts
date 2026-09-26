"use client";

import { get, set, del, keys, createStore } from "idb-keyval";

const offlineStore = createStore("asset-tracker-offline", "mutation-queue");

export interface QueuedMutation {
  id: string;
  url: string;
  method: "POST" | "PUT" | "DELETE" | "PATCH";
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
  retryCount: number;
}

export async function enqueueMutation(
  mutation: Omit<QueuedMutation, "id" | "timestamp" | "retryCount">,
): Promise<string> {
  const id = crypto.randomUUID();
  const entry: QueuedMutation = {
    ...mutation,
    id,
    timestamp: Date.now(),
    retryCount: 0,
  };
  await set(id, entry, offlineStore);
  return id;
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const allKeys = await keys(offlineStore);
  const entries: QueuedMutation[] = [];
  for (const key of allKeys) {
    const entry = await get<QueuedMutation>(key, offlineStore);
    if (entry) entries.push(entry);
  }
  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getPendingCount(): Promise<number> {
  const allKeys = await keys(offlineStore);
  return allKeys.length;
}

export async function removeMutation(id: string): Promise<void> {
  await del(id, offlineStore);
}

export interface ReplayResult {
  succeeded: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

export async function replayQueue(): Promise<ReplayResult> {
  const pending = await getPendingMutations();
  const result: ReplayResult = { succeeded: 0, failed: 0, errors: [] };

  for (const mutation of pending) {
    try {
      const res = await fetch(mutation.url, {
        method: mutation.method,
        headers: mutation.headers,
        body: mutation.body,
      });

      if (res.ok || res.status < 500) {
        await removeMutation(mutation.id);
        result.succeeded++;
      } else {
        mutation.retryCount++;
        if (mutation.retryCount >= 3) {
          await removeMutation(mutation.id);
          result.failed++;
          result.errors.push({
            id: mutation.id,
            error: `Failed after 3 retries: ${res.status}`,
          });
        } else {
          await set(mutation.id, mutation, offlineStore);
          result.failed++;
        }
      }
    } catch (err) {
      result.failed++;
      result.errors.push({
        id: mutation.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
      break;
    }
  }

  return result;
}
