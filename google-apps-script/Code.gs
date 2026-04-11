/**
 * Google Apps Script — Web App API สำหรับระบบเตรียมการปรับย้ายกำลังพล
 *
 * วิธีติดตั้ง:
 * 1. เปิด Google Sheet ที่ต้องการ
 * 2. ไปที่ Extensions > Apps Script
 * 3. ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดนี้
 * 4. ตั้งชื่อชีตแรกว่า "data" (หรือแก้ค่า SHEET_NAME ด้านล่าง)
 * 5. แถวแรกของชีตต้องเป็น header (ชื่อคอลัมน์)
 * 6. Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. คัดลอก URL ที่ได้ไปใส่ในไฟล์ googleSheetApi.js
 */

const SHEET_NAME = 'data';

// ══════════════════════════════════════════════════════
//  CORS headers
// ══════════════════════════════════════════════════════
function createJsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════
//  GET — อ่านข้อมูลทั้งหมด
// ══════════════════════════════════════════════════════
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return createJsonOutput({ success: false, error: 'Sheet not found: ' + SHEET_NAME });

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return createJsonOutput({ success: true, data: [] });

    const headers = data[0].map(h => String(h).trim());
    const rows = [];

    for (let i = 1; i < data.length; i++) {
      const row = {};
      for (let j = 0; j < headers.length; j++) {
        const val = data[i][j];
        row[headers[j]] = (val === '' || val === null || val === undefined) ? '' : val;
      }
      row._row = i + 1; // เก็บเลขแถวจริงใน Sheet (1-based)
      rows.push(row);
    }

    return createJsonOutput({ success: true, data: rows });
  } catch (err) {
    return createJsonOutput({ success: false, error: err.message });
  }
}

// ══════════════════════════════════════════════════════
//  POST — สร้าง / แก้ไข / ลบ
// ══════════════════════════════════════════════════════
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return createJsonOutput({ success: false, error: 'Sheet not found' });

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(h => String(h).trim());

    switch (action) {
      case 'update':
        return handleUpdate(sheet, headers, body);
      case 'delete':
        return handleDelete(sheet, body);
      case 'add':
        return handleAdd(sheet, headers, body);
      case 'batch_update':
        return handleBatchUpdate(sheet, headers, body);
      case 'reset':
        return handleReset(sheet, headers, body);
      default:
        return createJsonOutput({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return createJsonOutput({ success: false, error: err.message });
  }
}

// ── UPDATE — แก้ไขแถว ──
function handleUpdate(sheet, headers, body) {
  const rowNum = body._row;
  const updates = body.updates;

  if (!rowNum) return createJsonOutput({ success: false, error: 'Missing _row' });

  for (const [key, value] of Object.entries(updates)) {
    const colIdx = headers.indexOf(key);
    if (colIdx === -1) continue;
    sheet.getRange(rowNum, colIdx + 1).setValue(value === null ? '' : value);
  }

  return createJsonOutput({ success: true, action: 'update', _row: rowNum });
}

// ── DELETE — ลบแถว ──
function handleDelete(sheet, body) {
  const rowNum = body._row;
  if (!rowNum || rowNum < 2) return createJsonOutput({ success: false, error: 'Invalid _row' });

  sheet.deleteRow(rowNum);
  return createJsonOutput({ success: true, action: 'delete', _row: rowNum });
}

// ── ADD — เพิ่มแถวใหม่ ──
function handleAdd(sheet, headers, body) {
  const rowData = body.data;
  const newRow = headers.map(h => {
    const val = rowData[h];
    return (val === null || val === undefined) ? '' : val;
  });

  sheet.appendRow(newRow);
  const lastRow = sheet.getLastRow();

  return createJsonOutput({ success: true, action: 'add', _row: lastRow });
}

// ── BATCH UPDATE — อัปเดตหลายแถวพร้อมกัน ──
function handleBatchUpdate(sheet, headers, body) {
  const items = body.items; // [{ _row, updates }, ...]
  let count = 0;

  for (const item of items) {
    const rowNum = item._row;
    const updates = item.updates;
    if (!rowNum) continue;

    for (const [key, value] of Object.entries(updates)) {
      const colIdx = headers.indexOf(key);
      if (colIdx === -1) continue;
      sheet.getRange(rowNum, colIdx + 1).setValue(value === null ? '' : value);
    }
    count++;
  }

  return createJsonOutput({ success: true, action: 'batch_update', count });
}

// ── RESET — เขียนข้อมูลใหม่ทั้งหมด ──
function handleReset(sheet, headers, body) {
  const rows = body.data;

  // ลบข้อมูลเดิม (เก็บ header)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  // เขียนข้อมูลใหม่
  if (rows && rows.length > 0) {
    const values = rows.map(row => headers.map(h => {
      const val = row[h];
      return (val === null || val === undefined) ? '' : val;
    }));
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }

  return createJsonOutput({ success: true, action: 'reset', count: rows ? rows.length : 0 });
}
