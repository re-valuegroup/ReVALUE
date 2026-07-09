import { supabase } from "./supabaseClient";

const camelToSnake = (s) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

// jsonb列など「中身のキーは変換しない」フィールド（オブジェクトの中まで潜らない）
const OPAQUE_KEYS = new Set(["instagram", "tiktok", "checklist"]);

function toDb(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[camelToSnake(k)] = v === "" ? null : v;
  }
  return out;
}

function fromDb(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v === null ? "" : v;
  }
  return out;
}

export async function fetchAll(table, orderBy = "created_at") {
  const { data, error } = await supabase.from(table).select("*").order(orderBy, { ascending: true });
  if (error) throw error;
  return (data || []).map(fromDb);
}

export async function upsertRow(table, obj, conflictField = "id") {
  const row = toDb(obj);
  const { data, error } = await supabase.from(table).upsert(row, { onConflict: conflictField }).select().single();
  if (error) throw error;
  return fromDb(data);
}

export async function deleteRow(table, id, idField = "id") {
  const { error } = await supabase.from(table).delete().eq(idField, id);
  if (error) throw error;
}

export async function bulkUpsert(table, rows, conflictField = "id") {
  if (!rows || rows.length === 0) return;
  const payload = rows.map(toDb);
  const { error } = await supabase.from(table).upsert(payload, { onConflict: conflictField });
  if (error) throw error;
}

export { toDb, fromDb };
