/**
 * Google Sheet API Service
 * เชื่อมต่อกับ Google Apps Script Web App สำหรับ CRUD
 *
 * ตั้งค่า: ใส่ URL ของ Apps Script Web App ที่ deploy แล้ว
 */

const API_URL = import.meta.env.VITE_SHEET_API_URL || '';

// ── helpers ──────────────────────────────────────────
async function request(method, body) {
  if (!API_URL) throw new Error('ยังไม่ได้ตั้งค่า VITE_SHEET_API_URL');

  const opts = { method, redirect: 'follow' };

  if (method === 'POST') {
    opts.headers = { 'Content-Type': 'text/plain' };
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(API_URL, opts);
  const json = await res.json();

  if (!json.success) throw new Error(json.error || 'API error');
  return json;
}

// ══════════════════════════════════════════════════════
//  CRUD Functions
// ══════════════════════════════════════════════════════

/** ดึงข้อมูลทั้งหมดจาก Google Sheet */
export async function fetchAll() {
  const json = await request('GET');
  return json.data || [];
}

/** อัปเดตแถว — ส่ง _row (เลขแถวใน Sheet) กับ updates */
export async function updateRow(_row, updates) {
  return request('POST', { action: 'update', _row, updates });
}

/** ลบแถว */
export async function deleteRow(_row) {
  return request('POST', { action: 'delete', _row });
}

/** เพิ่มแถวใหม่ */
export async function addRow(data) {
  return request('POST', { action: 'add', data });
}

/** อัปเดตหลายแถวพร้อมกัน */
export async function batchUpdate(items) {
  return request('POST', { action: 'batch_update', items });
}

/** เขียนข้อมูลใหม่ทั้งหมด (reset) */
export async function resetSheet(data) {
  return request('POST', { action: 'reset', data });
}

/** ตรวจสอบว่ามี API URL หรือยัง */
export function isConfigured() {
  return !!API_URL;
}
