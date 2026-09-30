# POSA — Predictor of Obstructive Sleep Apnea

แอป React Native (Expo) ที่เป็นเวิร์กสเตชันให้แพทย์/บุคลากรห้องแล็บนอนหลับ อัปโหลดสัญญาณ ECG
ของผู้ป่วย รันโมเดลทำนายความเสี่ยง OSA (obstructive sleep apnea) แล้วดูผลตรวจได้

## ทีม

| บทบาท | ชื่อ |
|---|---|
| UI/UX Designer | Pisit Pipathanabenjakul |
| Researcher | Papangkorn Bennarong |
| ML Engineer | Worraprach Srirattananon |
| Mobile App Developer (ต่อ frontend↔backend, storage/database) | Panut Anan |

## Tech stack

- **แอป**: Expo / React Native, ระบบ routing แบบ file-based ของ `expo-router`
- **Backend**: [Supabase](https://supabase.com) — Postgres, Auth, Storage, Row Level Security
- **Auth**: Google OAuth ผ่าน Supabase Auth
- **ML**: CatBoost / XGBoost / CNN ensemble บน feature ที่แปลงมาจาก ECG (RRI, EDR, CPC,
  STFT/CWT) เทรนด้วย PhysioNet Apnea-ECG และ validate ภายนอกด้วย UCDDB

## เริ่มต้นใช้งาน

### 1. ติดตั้ง dependencies

```bash
npm install
```

### 2. ตั้งค่า environment variables

คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่าจริงจาก Supabase dashboard
(**Project Settings → Data API** สำหรับ URL, **Project Settings → API Keys** สำหรับ key):

```bash
cp .env.example .env
```

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
```

**ห้ามใช้ `service_role` key ตรงนี้เด็ดขาด** แอปใช้แค่ anon/publishable key คู่กับ
Row Level Security เท่านั้น — `service_role` เป็น key ที่ bypass RLS ทั้งหมด ห้ามอยู่ใน
โค้ดฝั่ง client เด็ดขาด **ห้าม commit ไฟล์ `.env`** เข้า git (ถูก ignore ไว้แล้ว) —
มีแค่ `.env.example` เท่านั้นที่ควร commit

### 3. รันแอป

```bash
npx expo start
```

## ตั้งค่า Backend (Supabase)

Migration ทั้งหมดอยู่ที่ `supabase/migrations/` ใช้
[Supabase CLI](https://supabase.com/docs/guides/cli) รันได้เลยผ่าน `npx supabase`
โดยไม่ต้องติดตั้งแยก:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Generate TypeScript types จาก schema จริงทุกครั้งที่มีการแก้ migration:

```bash
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

### ภาพรวม Schema

- `profiles` — บัญชีของแพทย์ (1:1 กับ `auth.users`) มี `consent_accepted` เก็บว่ายินยอมให้เก็บข้อมูลสุขภาพหรือยัง
- `patients` — ตัวตนผู้ป่วยแบบใช้ร่วมกัน (sex, date of birth, BMI) — ไม่ได้เป็นของแพทย์คนใดคนหนึ่ง
- `clinician_patients` — ตารางเชื่อม 1 แถวต่อความสัมพันธ์แพทย์↔ผู้ป่วย 1 คู่
  (subject code, notes) — นี่คือจุดที่ทำให้แพทย์หลายคนแชร์ประวัติผู้ป่วยคนเดียวกันได้ —
  แพทย์คนไหนก็ตามที่ผูกอยู่กับผู้ป่วยคนนั้น จะเห็นทุกการตรวจของผู้ป่วยคนนั้น ไม่ใช่แค่ที่ตัวเองอัปโหลด
- `ecg_uploads` — 1 แถวต่อการตรวจ ECG 1 ครั้ง ไฟล์เก็บใน Storage bucket แบบ private ชื่อ `ecg-files`
- `models` — ทะเบียนโมเดล ML (แพทย์อ่านได้อย่างเดียว เขียนได้แค่ผ่าน service-role)
- `predictions`, `prediction_minutes`, `sleep_sessions` — **ยังไม่ได้สร้าง** รอ output
  contract จากทีม ML (รูปแบบ label, มี confidence score ไหม, หน่วยเวลาที่ใช้)
- `audit_log` — บันทึกประวัติการใช้งาน เข้าถึงได้แค่ผ่าน service-role

ทุกตารางเปิด Row Level Security ตารางที่เป็นข้อมูลทางคลินิก/ประวัติ (`patients`, `ecg_uploads`)
ใช้ soft delete (`deleted_at`) แทนการลบจริง เพื่อรักษา audit trail

## หมายเหตุด้านความปลอดภัย

- RLS คือด่านความปลอดภัยตัวจริง — การกรองข้อมูลฝั่ง client เป็นแค่ความสะดวก ไม่ใช่การป้องกัน
- `service_role` key ไม่อยู่ในแอปเด็ดขาด ใช้แค่ anon/publishable key เท่านั้น
- ความลับ (service_role key, OAuth client secret, ข้อมูลผู้ป่วยจริง) ห้ามหลุดเข้า git
  ถ้าไม่แน่ใจ เช็คด้วย: `git log --all --full-history -- .env` ต้องได้ผลว่างเปล่า
- แอปต้องโชว์ข้อความ responsible-AI disclaimer และขอ consent แยกต่างหากจากการ login
  ก่อนจะเก็บข้อมูลสุขภาพใดๆ (ดู `src/components/login-screen.tsx`)

## สถานะโปรเจกต์

ดูสรุปสำหรับที่ประชุมทีมสำหรับความคืบหน้าปัจจุบัน สิ่งที่เหลือ และประเด็นที่ยังต้องตัดสินใจ
(การให้ผู้ป่วย login ดูผลตรวจแบบ read-only, การจับคู่ผู้ป่วยข้ามแพทย์, และ UI เลือกผู้ป่วยในหน้า Upload)
