import { IS_DEMO } from "../config";
import { createDemoStore } from "./demo-store";
import { createSupabaseStore } from "./supabase-store";
import type { DataStore } from "./types";

let instance: DataStore | null = null;

export function store(): DataStore {
  if (!instance) instance = IS_DEMO ? createDemoStore() : createSupabaseStore();
  return instance;
}

export { StoreError } from "./types";
export type { DataStore } from "./types";
