# คู่มือเชื่อมต่อ Google Sheet API

## ขั้นตอนที่ 1: สร้าง Google Sheet

1. ไปที่ [Google Sheets](https://sheets.google.com)
2. สร้าง Spreadsheet ใหม่ (หรือเปิดอันที่มีอยู่)
3. ตั้งชื่อตามต้องการ เช่น "ระบบเตรียมการปรับย้ายกำลังพล"

## ขั้นตอนที่ 2: ติดตั้ง Apps Script

1. ใน Google Sheet ไปที่เมนู **Extensions > Apps Script**
2. ลบโค้ดเดิมใน `Code.gs` ทั้งหมด
3. คัดลอกโค้ดจากไฟล์ `Code.gs` ในโฟลเดอร์นี้ แล้ววางลงไป
4. กด **Ctrl+S** เพื่อบันทึก

## ขั้นตอนที่ 3: สร้าง Header อัตโนมัติ

1. ใน Apps Script Editor เลือกฟังก์ชัน **setupHeaders** จาก dropdown (ข้างปุ่ม Run)
2. กดปุ่ม **▶ Run**
3. ครั้งแรกจะขอสิทธิ์ — กด **Review Permissions** > เลือกบัญชี Google > **Allow**
4. รอจนมี popup แจ้ง "✅ สร้าง header เรียบร้อย!"
5. กลับไปดู Google Sheet จะเห็น header 21 คอลัมน์ (แถวแรก พื้นน้ำเงิน ตัวขาว)

## ขั้นตอนที่ 4: Deploy เป็น Web App

1. ใน Apps Script Editor ไปที่ **Deploy > New deployment**
2. คลิกไอคอน ⚙️ (gear) > เลือก **Web app**
3. ตั้งค่า:
   - **Description**: "Personnel API" (หรืออะไรก็ได้)
   - **Execute as**: **Me**
   - **Who has access**: **Anyone**
4. กด **Deploy**
5. **คัดลอก URL** ที่ขึ้นมา (จะเป็น `https://script.google.com/macros/s/xxxx/exec`)

## ขั้นตอนที่ 5: ตั้งค่าในโปรเจค

1. เปิดโฟลเดอร์ `personnel-app/`
2. สร้างไฟล์ `.env` (ไม่ใช่ `.env.example`)
3. ใส่เนื้อหา:
   ```
   VITE_SHEET_API_URL=https://script.google.com/macros/s/YOUR_URL_HERE/exec
   ```
   แทน `YOUR_URL_HERE` ด้วย URL จากขั้นตอนที่ 4

## ขั้นตอนที่ 6: ทดสอบ

1. ใน terminal:
   ```bash
   cd personnel-app
   npm run dev
   ```
2. เปิดเว็บ จะเห็นปุ่ม "🔄 Sheet" ที่แถบเมนู
3. กดปุ่ม "🔄 Sheet" เพื่อโหลดข้อมูลจาก Google Sheet
4. ถ้า Sheet ยังว่าง ข้อมูลจะเป็น array ว่าง — ให้กดปุ่ม reset เพื่อส่งข้อมูลจาก data.json ขึ้น Sheet

## ขั้นตอนที่ 7: Deploy ใหม่บน GitHub Pages (ถ้าต้องการ)

```bash
cd personnel-app
npm run build
git add -A
git commit -m "connect Google Sheet API"
git push
```

GitHub Actions จะ auto-deploy ให้

---

## แก้ปัญหาที่พบบ่อย

| ปัญหา | วิธีแก้ |
|--------|---------|
| "ยังไม่ได้ตั้งค่า VITE_SHEET_API_URL" | สร้างไฟล์ `.env` ตามขั้นตอนที่ 5 |
| CORS error | ตรวจสอบว่า Deploy แบบ "Anyone" ไม่ใช่ "Anyone with Google account" |
| "Sheet not found: data" | รัน `setupHeaders` อีกครั้ง หรือตรวจว่าชีตชื่อ "data" |
| ข้อมูลไม่อัปเดต | กด "🔄 Sheet" เพื่อ reload ข้อมูลใหม่จาก Sheet |
| Deploy ไม่อัปเดต | ต้อง Deploy > **New deployment** ทุกครั้งที่แก้โค้ด (ไม่ใช่ Manage deployments) |
