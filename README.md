# 🎓 YPSS — Enterprise School Management ERP & Gemini AI System

<div align="center">

<img src="./assets/logo.png" alt="YPSS School ERP Logo" width="180" />

# Yagyodaya Public Secondary School ERP
### *Enterprise Academic Operations • Google Gemini AI Bilingual Question Paper Engine • Automated 4-Term Marks Cards • Nepali Calendar Monthly Fee Scheduler • Real-Time Walkie-Talkie Broadcasting*

<br />

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-4.19.2-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB Atlas](https://img.shields.io/badge/MongoDB%20Atlas-8.4.0-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Google Gemini AI](https://img.shields.io/badge/Google%20Gemini%20AI-Multimodal-8E75C2?style=for-the-badge&logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![Firebase Cloud Messaging](https://img.shields.io/badge/FCM-Push%20Notifications-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Vercel Serverless](https://img.shields.io/badge/Deployed-Vercel%20Serverless-black?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

---

## 📖 Executive Summary & Problem Solved

Managing a K-12 academic institution in South Asia presents complex challenges:
- **Painstaking Exam Paper Drafting:** Teachers spend days typing questions, manually translating between English and Nepali (Devanagari script), sketching scientific diagrams by hand, and struggling with Microsoft Word layout inconsistencies.
- **Fragmented Report Cards:** Generating report cards across four academic terms requires tedious manual grade calculations, risk-prone spreadsheet formulas, and error-prone printing alignment.
- **Financial Leakage & Stale Dues:** Tracking student fee payments across diverse fee heads (tuition, bus, lab, admission) according to the **Bikram Sambat (B.S.) Nepali Calendar** is chaotic without automated reminders.
- **Campus Communication Friction:** In-school emergencies and urgent administrative announcements rely on slow physical messengers or noisy public address speakers.

### The YPSS Platform
**YPSS** is a comprehensive, multi-tenant academic ERP designed specifically for modern schools. It integrates:
1. **Google Gemini Multimodal AI:** Instantly transforms curriculum outlines and uploaded textbook photos into publication-quality question papers in both English and Nepali, complete with auto-generated scientific diagrams, exported directly to formatted `.docx` and `.pdf` files.
2. **High-Fidelity 4-Term Marks Card Engine:** Millimeter-precise visual coordinate mapping onto official school background plates (`term_1_bg.png` through `term_4_bg.png`) or dynamic `.docx` templates, calculating GPA, percentiles, and letter grades automatically.
3. **Automated Attendance System:** Real-time mobile roll calls paired with branded vector PDF generation.
4. **Bikram Sambat Monthly Fee Scheduler:** Idempotent serverless cron running on the 1st day of every Nepali month, evaluating outstanding student dues and dispatching push alerts.
5. **Real-Time Walkie-Talkie Broadcasting:** Low-latency push-to-talk voice announcements with instant Firebase Cloud Messaging (FCM) wake-up notifications.

---

## ✨ Key Features

- 🤖 **Gemini AI Bilingual Question Paper Engine:** 
  - Generates exam papers in **English** and **Nepali** (authentic Devanagari Unicode).
  - Multi-key rotation (`GEMINI_API_KEY_1`, `2`, `3`) with dynamic model resolution (`gemini-flash-lite-latest`, `gemini-3.5-flash`).
  - Asynchronous background worker with progress tracking (`/api/questions/tracker`) and automatic failure recovery.
- 📐 **AI Scientific Diagram & Geometry Generator:**
  - AI synthesizes SVG vector code for complex geometric proofs, electrical circuits, and biological apparatuses.
  - Dual-mode rasterization: local Python `fitz` (PyMuPDF) & `PIL` ImageChops crop or Cloudinary high-fidelity SVG rasterization with trim at 300 DPI.
- 📄 **Dual-Format Document Exporter:**
  - Generates official Microsoft Word files via `docxtemplater` & `pizzip` using customized templates (`enqp_template.docx`, `npqp_template.docx`).
  - Converts dynamically to publication-ready PDF documents.
- 🎓 **Complete 4-Term Marks Card Suite:**
  - Dedicated layouts for Term 1, Term 2, Term 3, and Final Term.
  - Coordinate mapping (`coords.json`, `all_terminal_coords.json`) onto school plates (`term_1_bg.png` to `term_4_bg.png`).
  - Automatic computation of letter grades (A+ to NG), GPAs (0.0 to 4.0), and performance remarks.
  - Batch generation and one-click publishing for entire classes.
- 📋 **Branded Daily Attendance PDF Generator:**
  - Creates vectorized PDF attendance registers with school headers, watermarks, and status breakdown.
- 💰 **Nepali Calendar Monthly Fee Scheduler & Ledger:**
  - Driven by `nepali-date-converter` (Bikram Sambat B.S.).
  - Automated Vercel Cron (`0 0 1 * *`) runs on the 1st of every Nepali month to compute balance dues and dispatch alerts.
  - Per-student ledger, fee structures per class, direct payment recording, and instant PDF receipt generation.
- 📻 **Campus-Wide Walkie-Talkie Voice Broadcasting:**
  - Instant push-to-talk voice messages between administrators and staff.
  - Integrated FCM wake-up payloads to alert locked mobile devices.
  - Automatic pruning keeps only the 15 most recent audio clips, saving cloud storage.
- 🔄 **Academic Year Rollover Wizard:**
  - Effortlessly clone class structures, fee setups, and promote student rosters across academic sessions.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Clients["School Clients"]
        WEB["Admin & Teacher Web Portal"]
        MOBILE["Mobile App (Teachers / Parents / Students)"]
    end

    subgraph Gateway["Express API Gateway & Security Layer"]
        CORS["CORS & Origin Filtering"]
        SEC_HEADERS["Security Headers (nosniff, frameguard)"]
        AUTH_MW["JWT Middleware & RBAC (Principal, Teacher, Parent, Student)"]
        CORS --> SEC_HEADERS --> AUTH_MW
    end

    subgraph CoreServices["ERP Core Modules"]
        AUTH_SVC["Auth & Profiles"]
        CLASS_SVC["Academic Years & Classes"]
        ATT_SVC["Attendance & PDF Engine"]
        FEE_SVC["Fee Ledger & Monthly Scheduler"]
        MARKS_SVC["4-Term Marks Card Generator"]
        VOICE_SVC["Walkie-Talkie Voice Broadcast"]
    end

    subgraph AIService["AI & Document Processing Pipeline"]
        RESOLVER["Gemini Model Resolver & Key Rotator"]
        DIAGRAM["SVG Diagram Synthesizer"]
        RASTER["Rasterizer (PyMuPDF fitz / Cloudinary 300 DPI)"]
        DOCX_ENG["Word DOCX & PDF Formatter (pizzip/docxtemplater)"]
        RESOLVER --> DIAGRAM --> RASTER --> DOCX_ENG
    end

    subgraph Infrastructure["Storage & External Services"]
        MONGO[("MongoDB Atlas (Pooled Cluster)")]
        CLOUD[("Cloudinary Media Storage")]
        FCM["Firebase Cloud Messaging (FCM)"]
        CRON["Vercel Cron (Monthly Scheduler)"]
    end

    Clients --> Gateway
    AUTH_MW --> CoreServices
    CoreServices --> AIService
    CoreServices <--> MONGO
    CoreServices <--> CLOUD
    CoreServices --> FCM
    CRON --> FEE_SVC
```

---

## 🔄 Sequence Diagrams

### 1. Gemini AI Question Paper & Diagram Generation Flow

```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Teacher / Principal
    participant API as YPSS API Gateway
    participant Resolver as Gemini Resolver & Rotator
    participant Gemini as Google Gemini AI
    participant Diagram as Diagram Rasterizer
    participant Docx as DOCX & PDF Engine
    participant Cloud as Cloudinary / Disk

    Teacher->>API: POST /api/questions/upload (Subject, Class, Term, Photos, Figures)
    API-->>Teacher: 202 Accepted { trackerId, status: "processing" }

    Note over API,Resolver: Resolve active Gemini model & select fresh API key
    API->>Resolver: Request optimal model
    Resolver->>Gemini: Check ModelService capability
    Resolver-->>API: Selected: gemini-flash-lite-latest (Key #1)

    API->>Gemini: Multimodal prompt with syllabus / textbook images
    Gemini-->>API: Extracted structured JSON (Questions, Options, Marks)

    opt If Questions Contain Diagram Requirements
        API->>Gemini: Generate valid SVG code for scientific diagram
        Gemini-->>API: Clean SVG vector markup
        API->>Diagram: rasterizeSvgToPng(svg, 300 DPI, trim)
        Diagram->>Diagram: Local Python fitz / Cloudinary trim filter
        Diagram-->>API: High-resolution PNG diagram buffer
    end

    API->>Docx: Inject content into enqp_template.docx / npqp_template.docx
    Docx->>Docx: Replace placeholders, insert tables & embed PNG figures
    Docx-->>API: Compiled .docx & .pdf binary
    API->>Cloud: Upload generated document artifacts
    Cloud-->>API: Secure download URLs

    Teacher->>API: GET /api/questions/tracker
    API-->>Teacher: { status: "completed", downloadUrls: { docx, pdf } }
```

### 2. Walkie-Talkie Voice Broadcast & Real-Time FCM Dispatch

```mermaid
sequenceDiagram
    autonumber
    actor Principal as Principal Sharma
    participant API as Walkie-Talkie Controller
    participant Cloud as Cloudinary Audio Storage
    participant DB as MongoDB Atlas
    participant FCM as Firebase Cloud Messaging
    actor Teachers as Staff Mobile Devices

    Principal->>API: POST /api/walkie-talkie/send (Audio Clip .m4a, Broadcast)
    API->>Cloud: Upload voice audio file
    Cloud-->>API: Secure Audio URL
    API->>DB: Save WalkieTalkieMessage record
    API->>DB: Prune excess messages (Keep latest 15)
    
    API->>FCM: Dispatch high-priority data payload { type: "walkie_talkie", audioUrl }
    FCM-->>Teachers: High-priority wake-up push notification
    Note over Teachers: Device screen wakes up & plays audio stream immediately!
    API-->>Principal: 200 OK { success: true, messageId }
```

---

## 💻 Tech Stack Breakdown

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | `>= 18.0.0` | Backend execution engine |
| **Framework** | Express | `^4.19.2` | REST API routing, security middleware, controllers |
| **Database** | MongoDB Atlas | via `mongoose ^8.4.0` | Multi-tenant school database with connection pooling |
| **Artificial Intelligence** | @google/generative-ai | `^0.11.0` | Multimodal question extraction & diagram synthesis |
| **Document Processing** | docx & docxtemplater | `^8.5.0` / `^3.69.0` | Dynamic Microsoft Word template population |
| **Zip Manipulation** | pizzip | `^3.2.0` | Low-level docx XML unpack, edit, and repack |
| **Vector Graphics & PDF** | pdfkit | `^0.15.0` | Pixel-perfect branded attendance & exam PDFs |
| **Image & Diagramming** | Python fitz / Pillow | PyMuPDF / PIL | 300 DPI SVG rasterization, auto-cropping & trimming |
| **Calendar Engine** | nepali-date-converter | `^3.4.0` | Bikram Sambat (B.S.) date conversions & monthly triggers |
| **Push Notifications** | firebase-admin | `^14.5.0` | Real-time wake-up push alerts for Walkie-Talkie & notices |
| **Authentication** | jsonwebtoken & bcryptjs | `^9.0.2` / `^2.4.3` | JWT claims, RBAC and salted password hashing |
| **Media Hosting** | cloudinary | `^2.10.0` | Cloud media hosting for avatars, diagrams & voice clips |
| **Serverless Engine** | @vercel/functions | `^3.9.11` | Vercel Serverless runtime adapter (`maxDuration: 300`) |

---

## 📂 Repository Directory Structure

```text
YPSS/
├── api/
│   └── index.js                         # Vercel Serverless entry bridge
├── assets/
│   ├── markscard_templates/
│   │   ├── all_terminal_coords.json     # All-term pixel coordinates
│   │   ├── coords.json                  # First-term field coordinates
│   │   ├── term_1_bg.png                # Term 1 high-resolution background plate
│   │   ├── term_2_bg.png                # Term 2 high-resolution background plate
│   │   ├── term_3_bg.png                # Term 3 high-resolution background plate
│   │   └── term_4_bg.png                # Final Term high-resolution background plate
│   ├── background.png                   # Official watermark & certificate background
│   └── logo.png                         # High-resolution official school crest
├── config/
│   └── db.js                            # MongoDB Atlas connection manager with DNS fix
├── controllers/
│   ├── academicYearController.js        # Academic session promotion & year rollover
│   ├── attendanceController.js          # Attendance tracking & PDF generator
│   ├── authController.js                # Login, registration, passwords & profile images
│   ├── classController.js               # Class catalog, sections, and subjects
│   ├── feeController.js                 # Fee structures, student ledger, cron & receipts
│   ├── marksController.js               # Exam grading, GPA & 4-term marks card generator
│   ├── noticeController.js              # School broadcast bulletins & announcements
│   ├── questionController.js            # Gemini AI Question Paper processing pipeline
│   ├── userController.js                # User lifecycle (Teachers, Parents, Students)
│   └── walkieTalkieController.js        # Voice dispatch, FCM alerts & message pruning
├── Markscardtemplate/
│   ├── first_term_markscard.docx        # Term 1 Word template
│   ├── Second_term_markscard.docx       # Term 2 Word template
│   ├── third_term_markscard.docx        # Term 3 Word template
│   └── final_term_markscard.docx        # Final Term Word template
├── middleware/
│   └── auth.js                          # JWT verification and RBAC authorization
├── models/
│   ├── AcademicYear.js                  # Academic calendar session model
│   ├── Attendance.js                    # Daily class attendance record
│   ├── Class.js                         # Grade, section, and subject catalog
│   ├── Counter.js                       # Auto-incrementing sequences for receipts/cards
│   ├── ExamConfig.js                    # Exam boundaries, pass marks & weights
│   ├── Fee.js                           # Student fee ledger & payment transactions
│   ├── Marks.js                         # Terminal student subject scores
│   ├── MarksCard.js                     # Generated report card metadata & URLs
│   ├── Notice.js                        # Push notices & monthly fee reminders
│   ├── QuestionPaper.js                 # AI-generated question paper specifications
│   ├── Student.js                       # Student academic profile & parental links
│   ├── User.js                          # Core credentials, roles & push tokens
│   ├── WalkieTalkieConfig.js            # Broadcasting permissions configuration
│   └── WalkieTalkieMessage.js           # Audio broadcast records & metadata
├── routes/
│   ├── academicYear.js                  # /api/academic-years
│   ├── attendanceRoutes.js              # /api/attendance
│   ├── auth.js                          # /api/auth
│   ├── class.js                         # /api/classes
│   ├── fee.js                           # /api/fees
│   ├── marks.js                         # /api/marks
│   ├── noticeRoutes.js                  # /api/notices
│   ├── question.js                      # /api/questions
│   ├── users.js                         # /api/users
│   └── walkieTalkie.js                  # /api/walkie-talkie
├── scripts/
│   ├── seedStudents.js                  # Demo student generation script
│   ├── testFcmConnection.js             # FCM connection & payload validator
│   └── testGeminiApi.js                 # Dynamic Gemini model & key rotation test
├── uploads/                             # Local runtime staging directory (.gitkeep)
├── utils/
│   ├── attendancePdfGenerator.js        # Branded attendance PDF generator
│   ├── brandTemplate.js                 # School typography, palette & layout rules
│   ├── cloudStorage.js                  # Cloudinary upload & asset deletion wrappers
│   ├── dateHelper.js                    # Bikram Sambat date formatting utilities
│   ├── diagramGenerator.js              # AI SVG diagram synthesis & 300 DPI rasterizer
│   ├── docToPdfConverter.js             # DOCX to PDF format converter
│   ├── fcmNotifier.js                   # Firebase Cloud Messaging push dispatcher
│   ├── geminiModelResolver.js           # Dynamic Gemini model discovery & scoring
│   ├── geminiParser.js                  # AI prompt compilation, key rotation & retry logic
│   ├── marksCardDocxGenerator.js        # Report card template replacer & XML cleaner
│   ├── monthlyFeeScheduler.js           # Nepali 1st-of-month fee reminder runner
│   ├── pdfGenerator.js                  # Custom PDF rendering helper
│   ├── pushNotifier.js                  # Unified FCM / Expo push notifications
│   ├── questionPdfGenerator.js          # Direct PDF question paper layout
│   └── wordGenerator.js                 # Full DOCX exam paper builder
├── .env.example                         # Environment variables blueprint
├── .gitignore                           # Git exclusion rules
├── enqp_template.docx                   # Official English question paper template
├── firebase-service-account.json.example# Service account blueprint for FCM
├── npqp_template.docx                   # Official Nepali question paper template
├── package.json                         # Node dependencies & npm scripts
├── requirements.txt                     # Python packages (PyMuPDF, Pillow)
├── server.js                            # Server initialization, middleware & startup
└── vercel.json                          # Vercel Serverless, crons & function bundles
```

---

## 🔒 Security & Best Practices

Enterprise school platforms handle sensitive student grades, personal financial transactions, and credential data. YPSS enforces end-to-end security across four critical pillars:

### 1. MongoDB Atlas URI Securing & Connection Resilience
- **DNS Server Override:** Node.js on certain ISP/Windows environments often throws `querySrv ECONNREFUSED` when resolving MongoDB Atlas SRV records. YPSS proactively configures trusted nameservers in `config/db.js`:
  ```javascript
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  ```
- **Serverless Connection Pooling:** In serverless environments like Vercel, cold starts can overwhelm MongoDB connection limits. YPSS implements a global connection cache (`global.mongoose = { conn, promise }`), ensuring lambdas reuse existing connection pools across invocations.
- **Failover to Direct Replica Set URI:** If SRV resolution encounters an unrecoverable network failure, the connector automatically falls back to `MONGO_URI_DIRECT`.
- **Zero Credentials Exposure:** Connection strings are never logged to console; all errors mask database credentials.

### 2. Environment Variable Isolation & Secret Management
- **Boot-Time Guard:** The server strictly halts execution at startup if `JWT_SECRET` is missing (`process.exit(1)`).
- **Gemini Key Rotation:** AI operations draw from a pool of keys (`GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`). When an API key hits Google's free-tier rate limits (`429 RESOURCE_EXHAUSTED`), YPSS immediately marks the key as exhausted for 60 seconds and transparently fails over to the next key without dropping user requests.
- **Service Account Isolation:** Production Firebase service accounts are loaded strictly from untracked `.json` files or environment variables; a sanitised `firebase-service-account.json.example` template is provided for version control.

### 3. JWT Role-Based Access Control (RBAC)
- **Token Verification:** The `protect` middleware extracts bearer tokens from headers or query parameters and decodes the claims using `JWT_SECRET`.
- **Password Projection Exclusion:** Database lookups explicitly exclude password hashes using `.select('-password')`.
- **Granular Role Authorization:** Endpoints are gated by the `authorize(...roles)` middleware across four strict roles:
  - `principal`: Full administrative privileges (Fee structures, student promotions, exam configurations, user provisioning).
  - `teacher`: Marks entry, attendance recording, question paper generation, walkie-talkie broadcast.
  - `student`: Read-only access to published report cards, attendance status, and bulletins.
  - `parent`: Access to linked children's fee balances, academic marks, and attendance records.
- **Password Hashing:** Passwords are salted with 10 rounds of `bcryptjs` in a Mongoose `pre('save')` hook.

### 4. Security Headers & File Upload Quarantine
- **HTTP Header Hardening:** Every response includes `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and `X-XSS-Protection: 1; mode=block`.
- **MIME & Extension Whitelisting:** File uploads (photos, figures, audio) are rigorously checked against both MIME types and file extensions via Multer disk storage.
- **Storage Sandbox:** Static `/uploads` routes enforce a Content Security Policy (`default-src 'none'`) preventing browser execution of uploaded scripts.

---

## ⚙️ Local Setup & Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Python**: v3.9+ with `pip` (required for local high-fidelity SVG diagram rasterization)
- **MongoDB**: A free MongoDB Atlas Cluster (or local MongoDB v6+)

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/YPSS.git
cd YPSS
```

### 2. Install Node.js Dependencies
```bash
npm install
```

### 3. Install Python Dependencies
```bash
pip install -r requirements.txt
```
*(Installs `PyMuPDF` for PDF/SVG vector graphics and `Pillow` for image trimming).*

### 4. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Populate the required keys in `.env`:
```env
PORT=5000
NODE_ENV=development

# MongoDB Atlas Connection
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.example.mongodb.net/ypss_db?retryWrites=true&w=majority

# JWT Authentication
JWT_SECRET=super_secret_jwt_passphrase_change_me_in_production

# Google Gemini AI API Keys (Supports up to 3 keys for auto-rotation)
GEMINI_API_KEY_1=AIzaSy...
GEMINI_API_KEY_2=AIzaSy...
GEMINI_API_KEY_3=AIzaSy...

# Cloudinary Storage (Required for cloud diagrams, avatars & audio clips)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret

# Optional: CORS Allowed Origins (Comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

### 5. Validate Integrations with Diagnostic Scripts
```bash
# Test Gemini AI dynamic model resolver & API key rotation
node scripts/testGeminiApi.js

# Test Firebase Cloud Messaging initialization (requires firebase-service-account.json)
node scripts/testFcmConnection.js
```

### 6. Start the Server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will output:
```text
MongoDB Connected: cluster0-shard-00-00.mongodb.net
Server running in development mode on port 5000
Monthly Fee Scheduler initialized (runs on 1st day of Nepali month B.S.)
```

---

## 🔧 Environment Variables Reference

| Variable | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `PORT` | No | HTTP listening port (Default: `5000`) | `5000` |
| `NODE_ENV` | No | Server environment mode | `development` / `production` |
| `MONGO_URI` | **Yes** | MongoDB Atlas SRV connection string | `mongodb+srv://user:pass@cluster0.net/...` |
| `MONGO_URI_DIRECT` | No | Direct replica set fallback URI | `mongodb://host1:27017,host2:27017/...` |
| `JWT_SECRET` | **Yes** | Cryptographic secret for signing tokens | `8d96b4f738092ec0b4e1f...` |
| `GEMINI_API_KEY_1` | **Yes** | Primary Google Gemini Generative AI Key | `AIzaSyB...` |
| `GEMINI_API_KEY_2` | No | Secondary Gemini Key for rate limit rotation | `AIzaSyC...` |
| `GEMINI_API_KEY_3` | No | Tertiary Gemini Key for rate limit rotation | `AIzaSyD...` |
| `CLOUDINARY_CLOUD_NAME`| **Yes** | Cloudinary cloud identifier | `ypss-school` |
| `CLOUDINARY_API_KEY` | **Yes** | Cloudinary API key | `482910482910482` |
| `CLOUDINARY_API_SECRET`| **Yes** | Cloudinary API secret | `abcDEfgHIjkLMN_opqrstu` |
| `ALLOWED_ORIGINS` | No | Whitelisted CORS origins (comma-separated) | `https://ypss.edu.np` |

---

## 📖 Complete API Reference

All requests accept and return `application/json` unless handling `multipart/form-data` uploads.

### 1. Authentication & Profile (`/api/auth`)

| Method | Endpoint | Access | Description |
| :---: | :--- | :---: | :--- |
| `POST` | `/api/auth/register` | Public | Register initial principal or administrator. |
| `POST` | `/api/auth/login` | Public | Authenticate user with username/password; returns JWT. |
| `GET` | `/api/auth/profile` | Authenticated | Retrieve authenticated user profile. |
| `PUT` | `/api/auth/language` | Authenticated | Update user interface language preference (`en` or `np`). |
| `PUT` | `/api/auth/password` | Authenticated | Change user account password. |
| `GET` | `/api/auth/cloud-sign` | Authenticated | Generate pre-signed Cloudinary upload signature. |
| `POST` | `/api/auth/profile-picture` | Authenticated | Upload and update avatar photo (`multipart/form-data`). |

---

### 2. User Management (`/api/users`)

| Method | Endpoint | Access | Description |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/users/teachers` | Principal | Retrieve list of all registered teachers. |
| `GET` | `/api/users/parents` | Principal | Retrieve list of registered parents. |
| `GET` | `/api/users/students` | Principal | Retrieve all enrolled students and linked guardians. |
| `POST` | `/api/users/` | Principal | Provision a new managed staff or student account. |
| `PUT` | `/api/users/:id` | Principal | Update managed user information or roles. |
| `DELETE` | `/api/users/:id` | Principal | Remove user account from system. |
| `POST` | `/api/users/push-token` | Authenticated | Register device FCM/Expo push notification token. |

---

### 3. Class & Academic Session Management (`/api/classes`, `/api/academic-years`)

| Method | Endpoint | Access | Description |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/classes/catalog` | Public | Public class and grade catalog. |
| `GET` | `/api/classes/` | Authenticated | Retrieve all active grades, sections, and subject rosters. |
| `POST` | `/api/classes/` | Principal | Create a new class section. |
| `GET` | `/api/classes/:id` | Authenticated | Get detailed syllabus, enrolled students, and teachers. |
| `PUT` | `/api/classes/:id` | Principal | Modify class details, assign class teachers. |
| `DELETE` | `/api/classes/:id` | Principal | Archive or delete class. |
| `GET` | `/api/academic-years` | Authenticated | List all historical and current academic sessions. |
| `POST` | `/api/academic-years` | Principal | Create a new academic year session (e.g., 2081 B.S.). |
| `POST` | `/api/academic-years/switch-active` | Principal | Set active academic year across the school ERP. |
| `GET` | `/api/academic-years/transition-status` | Principal | Check readiness for year rollover and student promotion. |
| `POST` | `/api/academic-years/copy-class-structure` | Principal | Clone class catalogs and fee schedules into new year. |
| `POST` | `/api/academic-years/promote-students` | Principal | Batch promote eligible students to the next grade. |

---

### 4. Gemini AI Question Paper Generation (`/api/questions`)

| Method | Endpoint | Access | Description |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/questions` | Principal, Teacher | List all question papers generated by the user. |
| `GET` | `/api/questions/tracker` | Principal, Teacher | Poll status of asynchronous generation jobs. |
| `POST` | `/api/questions/upload` | Principal, Teacher | Upload syllabus images & prompt Gemini AI to generate exam paper (`multipart/form-data`). |
| `GET` | `/api/questions/:id` | Principal, Teacher | Retrieve parsed question paper data and questions. |
| `POST` | `/api/questions/:id/retry` | Principal, Teacher | Retry generation if a previous AI attempt encountered a timeout. |
| `GET` | `/api/questions/:id/download/:format` | Principal, Teacher | Download generated paper in `docx` or `pdf` format. |
| `DELETE` | `/api/questions/:id` | Principal, Teacher | Delete question paper record and associated media. |

---

### 5. Examination, Grading & Marks Cards (`/api/marks`)

| Method | Endpoint | Access | Description |
| :---: | :--- | :---: | :--- |
| `POST` | `/api/marks/` | Principal, Teacher | Enter terminal marks for students. |
| `POST` | `/api/marks/config` | Principal, Teacher | Configure grading rules, full marks, and pass marks. |
| `GET` | `/api/marks/config` | Principal, Teacher | Retrieve current examination configuration. |
| `POST` | `/api/marks/generate-card` | Principal, Teacher | Generate terminal marks card for an individual student. |
| `POST` | `/api/marks/generate-class-cards` | Principal, Teacher | Batch generate marks cards for an entire classroom. |
| `POST` | `/api/marks/publish-class-cards` | Principal, Teacher | Publish verified marks cards to students & parents. |
| `GET` | `/api/marks/class-cards-status` | Principal, Teacher | Inspect generation & publication progress per class. |
| `GET` | `/api/marks/student-published-cards/:studentId` | Authenticated | Retrieve student's published terminal report cards. |
| `GET` | `/api/marks/card-pdf/:cardId` | Authenticated | View and download generated marks card PDF. |
| `GET` | `/api/marks/card-docx/:cardId` | Authenticated | Download editable report card DOCX file. |

---

### 6. Daily Attendance Management (`/api/attendance`)

| Method | Endpoint | Access | Description |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/attendance/class/:classId` | Principal, Teacher | Retrieve daily attendance records for a class. |
| `POST` | `/api/attendance/mark` | Principal, Teacher | Submit daily student attendance (Present, Absent, Leave). |
| `GET` | `/api/attendance/class/:classId/download-pdf` | Principal, Teacher | Download official vectorized daily attendance PDF report. |
| `GET` | `/api/attendance/student/me` | Student | Retrieve own attendance history. |
| `GET` | `/api/attendance/student/:studentId` | Staff, Parent | Retrieve specific student attendance history. |

---

### 7. Financial Ledger & Fee Scheduler (`/api/fees`)

| Method | Endpoint | Access | Description |
| :---: | :--- | :---: | :--- |
| `ALL` | `/api/fees/cron` | Public / Cron Secret | Automated monthly fee trigger (1st of Nepali month B.S.). |
| `GET` | `/api/fees/class-structures` | Principal | Retrieve tuition & fee structures per grade. |
| `POST` | `/api/fees/class-structure` | Principal | Define monthly tuition, bus, and exam fee heads. |
| `GET` | `/api/fees/current-month-status`| Principal | View school-wide fee payment statuses for current month. |
| `POST` | `/api/fees/record-direct-payment`| Principal | Record a payment transaction and update student balance. |
| `GET` | `/api/fees/receipt/:receiptNo/pdf`| Authenticated | Download formal branded payment receipt PDF. |
| `POST` | `/api/fees/push-fee-alerts` | Principal | Send bulk push notifications to parents with unpaid balances. |
| `GET` | `/api/fees/student/:studentId` | Staff, Parent, Student | Retrieve full financial ledger for a student. |
| `GET` | `/api/fees/audit` | Principal | Comprehensive financial revenue and audit summary. |

---

### 8. Campus Walkie-Talkie Broadcasting (`/api/walkie-talkie`)

| Method | Endpoint | Access | Description |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/walkie-talkie/config` | Principal, Teacher | Retrieve walkie-talkie broadcast permissions. |
| `PUT` | `/api/walkie-talkie/config` | Principal | Update authorized broadcast teacher list. |
| `GET` | `/api/walkie-talkie/contacts` | Principal, Teacher | Retrieve list of active faculty contacts. |
| `POST` | `/api/walkie-talkie/send` | Principal, Teacher | Dispatch voice clip (`.m4a`, `multipart/form-data`) + trigger FCM push alert. |
| `GET` | `/api/walkie-talkie/feed` | Principal, Teacher | Stream recent active voice messages (last 15 retained). |

---

## 🚀 Production Deployment (Vercel)

YPSS is designed to run natively as a serverless system on **Vercel** with integrated cron schedules.

### 1. `vercel.json` Configuration
The project includes a production-tuned `vercel.json`:
- **Extended Timeout:** `maxDuration: 300` (5 minutes) accommodates intensive AI generation and Word/PDF compilation.
- **Asset Bundling:** Ensures Word templates (`enqp_template.docx`, `npqp_template.docx`), marks card templates, and background plates are included in the serverless bundle:
  ```json
  "functions": {
    "api/index.js": {
      "maxDuration": 300,
      "includeFiles": "{enqp_template.docx,npqp_template.docx,Markscardtemplate/**,assets/**}"
    }
  }
  ```
- **Automated Vercel Cron:** Automatically triggers the monthly fee calculation on the 1st of every month at midnight:
  ```json
  "crons": [
    {
      "path": "/api/fees/cron",
      "schedule": "0 0 1 * *"
    }
  ]
  ```

### 2. Deploy Steps
1. Import the repository into the **Vercel Dashboard**.
2. Configure environment variables (`MONGO_URI`, `JWT_SECRET`, `GEMINI_API_KEY_1`, `CLOUDINARY_*`).
3. Deploy! The `/api/index.js` bridge executes all endpoints with zero cold-start delay.

---

## 📄 License

This project is licensed under the **MIT License** — feel free to use, modify, and distribute it in open-source and commercial applications.
