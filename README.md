# POSA — Predictor of Obstructive Sleep Apnea

แอป React Native (Expo) สำหรับแพทย์และบุคลากรห้องแล็บการนอนหลับ ใช้อัปโหลดสัญญาณ ECG ของผู้ป่วย
ดูผลการตรวจ เขียนรายงานและลงนาม แล้วส่งผลให้ผู้ป่วยดูผ่าน QR code หรือลิงก์ได้

> **สถานะ:** App uploads real WFDB recordings to Supabase and sends them to the local SE-ResNet50-1D inference service. Model results are persisted for clinician review.

ผู้ดูแลส่วน backend / database: Panut Anan ([@tonnow2005](https://github.com/tonnow2005), panuttonnow520@gmail.com)

## ทีม

| บทบาท | ชื่อ |
|---|---|
| UI/UX Designer | Pisit Pipathanabenjakul |
| Researcher | Papangkorn Bennarong |
| ML Engineer | Worraprach Srirattananon |
| Mobile App Developer (เชื่อม frontend↔backend, storage/database) | Panut Anan |

## Tech stack

- **แอป:** Expo SDK 57 / React Native และ routing แบบ file-based ของ `expo-router`
- **Backend:** [Supabase](https://supabase.com) ได้แก่ Postgres, Auth, Storage และ Row Level Security (RLS)
- **Login:** Google OAuth ผ่าน Supabase Auth
- **PDF:** `expo-print` บนมือถือ และ `html2pdf.js` บนเว็บ
- **QR:** `expo-camera` สำหรับสแกน และ `react-native-qrcode-svg` สำหรับสร้าง
- **ML:** Trained SE-ResNet50-1D checkpoint; per-minute inference on 100 Hz ECG.

## ฟีเจอร์

### ฝั่งแพทย์ (ต้อง login ด้วย Google)
- **หน้าแรกเลือกบทบาท:** "I'm a clinician" หรือ "I'm a patient"
- **Home:** รายการการตรวจจริงจาก Supabase ค้นหาและกรองได้ และ**ลบแบบ soft delete** พร้อมปุ่ม Undo
  (เฉพาะการตรวจที่ตัวเองอัปโหลด)
- **Upload:** อัปโหลดไฟล์ EDF, WFDB (`.hea` + `.dat`) หรือรูปภาพ ขึ้น Storage แบบ private
  อ่าน sampling rate และ lead จาก header ให้อัตโนมัติ ถ้ากรอกรหัสผู้ป่วยซ้ำ ระบบจะใช้ผู้ป่วยคนเดิม
- **Detail:** หน้าดูสัญญาณ ECG (เล่น, ซูม, เลือกช่วงเวลา, เลื่อนไป apnea event ก่อนหน้า/ถัดไป)
  ตอนนี้แสดงกราฟได้เฉพาะรายการตัวอย่าง (SAMPLE) ส่วนการตรวจจริงจะแสดงเมื่อเชื่อมต่อ API ของ ML แล้ว
- **Summary / Results:** ตัวเลขสรุปเดิม + แผงผลการนอน AHI (AI, HI), Events Breakdown
  (Obstructive / Central / Mixed / Hypopnoea) และ ODI (SpO₂ Baseline / Avg / Lowest) พร้อมคำอธิบายภาษาไทย
  ตอนนี้แสดง “—” จนกว่าจะเชื่อมผลวิเคราะห์ (ODI / SpO₂ ต้องมีเครื่องวัดออกซิเจนร่วมด้วย ECG อย่างเดียววัดไม่ได้)
- **Summary / Report:**
  - แพทย์เขียน **Clinician opinion** และ **Patient explanation** เอง แล้วบันทึกลงฐานข้อมูล
  - สถานะ Draft → Reviewed → Approved และย้อนกลับได้
  - **ลงนามอัตโนมัติ** ด้วยชื่อจากบัญชีที่ login พร้อมวันเวลา รายงานที่ Approved แล้วจะถูกล็อกไม่ให้แก้
  - **Export PDF / Print** ฉบับที่ยังไม่ Approved จะมีลายน้ำ DRAFT / REVIEWED
  - **ฉบับ Approved เก็บเป็น PDF ใน Supabase อัตโนมัติ** มีหลายเวอร์ชันได้ และดาวน์โหลดย้อนหลังได้
- **ลิงก์ Dashboard ผู้ป่วย:** สร้าง QR code และลิงก์ให้ผู้ป่วย อายุ 90 วัน
- **Deletion log:** ดูว่าใครลบหรือกู้คืนการตรวจไหน เมื่อไหร่ ของผู้ป่วยทุกคนที่ตัวเองผูกอยู่ รวมถึงที่หมอคนอื่นทำ
  (มีกล่องสรุปในหน้า Home และหน้าเต็มที่ `/activity`) แก้หรือลบ log ไม่ได้
- **เมนูบัญชี:** มุมขวาบน มีชื่อ, Deletion log และปุ่ม Sign out

### ฝั่งผู้ป่วย (ไม่ต้องมีบัญชี)
- **Scan QR** (ค่าเริ่มต้น) หรือ **Paste link** เพื่อเปิด Dashboard ของตัวเอง
- **Dashboard:** เห็นทุกคืนที่ตรวจ รวมถึงคืนที่อัปโหลดทีหลัง, **รูปสรุป**พร้อมแถบระดับความรุนแรงตาม AHI,
  **พารามิเตอร์ชุดเดียวกับหน้า Summary ของแพทย์** (คำอธิบายภาษาง่าย) และเห็น **ข้อความจากแพทย์**
  (Patient explanation) เฉพาะคืนที่แพทย์ Approve รายงานแล้ว
- ไม่แสดงชื่อ รหัสผู้ป่วย หรือความเห็นของแพทย์ (Clinician opinion) ให้ผู้ป่วยเห็น

## เริ่มต้นใช้งาน

### 1. ติดตั้ง dependencies

```bash
npm install
```

### 2. ตั้งค่า environment variables

คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่าจริงจาก Supabase dashboard
(**Project Settings → Data API** สำหรับ URL และ **Project Settings → API Keys** สำหรับ key)

```bash
cp .env.example .env
```

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
# ไม่บังคับ: แสดงเฉพาะบัญชีขององค์กรนี้ในหน้าเลือกบัญชี Google
EXPO_PUBLIC_ALLOWED_EMAIL_DOMAIN=
```

> **ห้ามใช้ `service_role` key ในแอปเด็ดขาด** แอปใช้แค่ anon/publishable key คู่กับ RLS
> และ**ห้าม commit `.env`** เข้า git (ไฟล์นี้ถูก ignore ไว้แล้ว) ให้ commit แค่ `.env.example`

### 3. ตั้งค่า Supabase Auth

- **Authentication → Providers → Google:** ใส่ Client ID / Secret จาก Google Cloud Console
- **Authentication → URL Configuration → Redirect URLs:** เพิ่ม `posaapp://auth/callback`
  (สำหรับมือถือ) และ `http://localhost:8081/**` (สำหรับเว็บตอนพัฒนา)

### 4. รันแอป

```bash
npx expo start        # เลือก w เพื่อเปิดบนเว็บ
npx expo start --web  # หรือเปิดบนเว็บเลย
```

ตรวจโค้ดก่อน commit ทุกครั้ง:

```bash
npx tsc --noEmit
npx expo lint
```

## Backend (Supabase)

Migration ทั้งหมดอยู่ใน `supabase/migrations/` (19 ไฟล์) รันผ่าน Supabase CLI ได้โดยไม่ต้องติดตั้งแยก

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

### ตาราง

| ตาราง | เก็บอะไร |
|---|---|
| `profiles` | บัญชีแพทย์ (1:1 กับ `auth.users`) มีชื่อสำหรับลงนาม และ `consent_accepted` |
| `patients` | ตัวตนผู้ป่วยแบบใช้ร่วมกัน (เพศ, BMI) ไม่มีชื่อจริง |
| `clinician_patients` | ความสัมพันธ์แพทย์↔ผู้ป่วย และรหัสผู้ป่วยที่แพทย์แต่ละคนตั้งเอง แพทย์ที่ผูกกับผู้ป่วยคนเดียวกันจะเห็นการตรวจของกันและกัน |
| `ecg_uploads` | 1 แถวต่อการตรวจ 1 ครั้ง มีไฟล์ใน bucket `ecg-files`, Hz, lead, อายุ (`age_years`) และ soft delete ด้วย `deleted_at` |
| `study_reports` | รายงานที่แพทย์เขียน (opinion, patient explanation), สถานะ และผู้ลงนามกับเวลา |
| `report_pdfs` | PDF ฉบับ Approved ที่เก็บใน bucket `report-pdfs` |
| `study_share_links` | ลิงก์ผลตรวจรายครั้ง (อายุ 30 วัน) |
| `patient_share_links` | ลิงก์ Dashboard ผู้ป่วย (อายุ 90 วัน) |
| `models` | ทะเบียนโมเดล ML (อ่านได้อย่างเดียว) |
| `audit_log` | ประวัติการลบและกู้คืน เขียนได้ผ่านฟังก์ชันฝั่ง server เท่านั้น |

**ยังไม่ได้สร้าง:** `predictions`, `prediction_minutes`, `sleep_sessions` เพราะรอ ML output contract

### ฟังก์ชันในฐานข้อมูล

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `handle_new_user` (trigger) | สร้าง profile พร้อมชื่อจาก Google ตอนสมัคร |
| `account_display_name` | ชื่อบัญชีสำหรับลงนาม (display name → ชื่อ Google → อีเมล) |
| `study_reports_sign_off` (trigger) | บังคับลำดับสถานะ, ลงชื่อและเวลา, ล็อกรายงานที่ Approved |
| `soft_delete_ecg_upload` / `restore_ecg_upload` | ลบหรือกู้คืนการตรวจ (เฉพาะคนที่อัปโหลด) และบันทึกลง `audit_log` |
| `get_shared_study` | ข้อมูลผลตรวจรายครั้งสำหรับผู้ป่วยที่ไม่ได้ login |
| `get_deletion_log` | อ่าน log การลบและกู้คืน เฉพาะผู้ป่วยที่หมอคนนั้นผูกอยู่ |
| `get_patient_dashboard` | ข้อมูล Dashboard ผู้ป่วย (คืนเป็น JSON เพื่อเพิ่มพารามิเตอร์ได้ภายหลัง) |
| `hook_restrict_signup_domain` | Auth hook จำกัดการสมัครเฉพาะ `@email.kmutnb.ac.th` **(สร้างไว้แล้วแต่ยังปิดอยู่)** |

**เปิดใช้การจำกัดโดเมน:** Dashboard → Authentication → Hooks → Before User Created → เลือก
`hook_restrict_signup_domain` และใส่ `EXPO_PUBLIC_ALLOWED_EMAIL_DOMAIN=email.kmutnb.ac.th` ใน `.env`

## โครงสร้างไฟล์หลัก

```
src/
  app/                 หน้าจอ (expo-router)
    _layout.tsx        ตัวกั้น login + เลือกบทบาท
    index.tsx          Home (รายการการตรวจ, ลบ/Undo)
    upload.tsx         อัปโหลดการตรวจ
    detail.tsx         ดูสัญญาณ ECG
    summary.tsx        รายงาน, ลงนาม, PDF
    activity.tsx       Deletion log
    p/[token].tsx      Dashboard ผู้ป่วย (ลิงก์)
    shared/[token].tsx ผลตรวจรายครั้ง (ลิงก์)
  components/          UI และหน้าจอฝั่งผู้ป่วย, report-export (PDF)
  lib/
    supabase.ts        Supabase client (ใช้แค่ publishable key)
    auth-context.tsx   Google login, session, สร้าง profile
    queries.ts         ฟังก์ชันอ่าน/เขียนข้อมูลทั้งหมด
supabase/migrations/   schema, RLS และฟังก์ชันทั้งหมด
```

## ความปลอดภัย

- **RLS คือด่านป้องกันตัวจริง** การกรองข้อมูลฝั่งแอปเป็นแค่ความสะดวก ไม่ใช่การป้องกัน
- **ผู้ป่วยไม่มีบัญชี** ลิงก์และ QR ใช้ token สุ่มยาว 64 ตัวอักษร (256 bit) มีวันหมดอายุ
  และข้อมูลส่งผ่านฟังก์ชันที่คัดเฉพาะข้อมูลที่ปลอดภัย ไม่มีรหัสผู้ป่วยหรือความเห็นของแพทย์
- **ลบแบบ soft delete** ข้อมูลและไฟล์ไม่ถูกลบจริง และทุกการลบหรือกู้คืนถูกบันทึกลง `audit_log`
- **ผู้ลงนามปลอมไม่ได้** ชื่อและเวลาลงนามมาจากบัญชีที่ login ผ่าน trigger ในฐานข้อมูล
- ความลับ (service_role key, OAuth secret, ข้อมูลผู้ป่วยจริง) ห้ามเข้า git
  ตรวจได้ด้วย `git log --all --full-history -- .env` ซึ่งต้องได้ผลว่าง
- ระบบเป็น**เครื่องมือเพื่อการศึกษาด้านวิศวกรรมชีวการแพทย์** ไม่ใช่เครื่องมือวินิจฉัย
  (แสดง disclaimer ในหน้า Login, หน้าผู้ป่วย และใน PDF)

## สิ่งที่ยังไม่ได้ทำ

- เชื่อมต่อโมเดล ML (ต้องตกลง output contract กับทีม ML ก่อน: label และ probability รายนาที, R-peaks, beat labels)
- ค่าจริงของ AHI / Events / ODI (UI พร้อมแล้ว รอผลจาก ML และสัญญาณ SpO₂) — นิยามทั้งหมดอยู่ที่ `src/components/sleep-results-data.ts`
- Tier 3: ปุ่มขอลบบัญชีหรือข้อมูล, Privacy Policy, บัญชีสำหรับ reviewer
- ทดสอบบนมือถือจริง (ตอนนี้ทดสอบบนเว็บเป็นหลัก)

## Local trained model inference

The app now sends uploaded WFDB records to a local FastAPI service. The service runs the SE-ResNet50-1D checkpoint on complete 60-second, 100 Hz ECG windows and saves per-minute probabilities and classes in Supabase. Only clinician-approved aggregate results are returned to patient links.

1. Apply `supabase/migrations/20261004000010_ml_predictions.sql` to the project database before using inference. This adds run/result tables and updates patient result RPCs.
2. Copy `inference/.env.example` to `inference/.env`. Set `POSA_MODEL_PATH` to the local `se_resnet50_epoch_05.pt`, and set the server-side `SUPABASE_URL`, publishable key, and **service role key**. Keep this file private; the service role key must never go in the Expo `.env`.
3. Create a Python environment and install `inference/requirements.txt`. Install a PyTorch build separately if the machine does not already provide one; CPU inference is supported.
4. Start the API from the repository root with `python -m uvicorn inference.service:app --host 0.0.0.0 --port 8010`.
5. Set `EXPO_PUBLIC_INFERENCE_API_URL=http://localhost:8010` in the app `.env` and start Expo. Use a device-visible host address instead of `localhost` when running the app on a physical phone.

The upload accepts one matching `.hea`/`.dat` pair at exactly 100 Hz. The ECG detail view displays the stored signal and model probability for each minute. Model outputs are research predictions, not a diagnosis.

To smoke-check the checkpoint on the first four records of the notebook's recreated held-out Test split, run:

`python -m inference.smoke_test --data-dir "D:/path/to/apnea-ecg-data" --model "D:/path/to/se_resnet50_epoch_05.pt"`

The script requires the matching 78-record annotation set used by the notebook. The currently configured dataset folder has a different record count, so it cannot verify the held-out split until the matching data folder is supplied.
