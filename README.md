# 🌟 AI-DOCTOR: Advanced Clinical Network & Triage Workspace

A state-of-the-art, secure MERN medical dashboard designed to bridge the gap between patient diagnostics and professional clinical workflows. Powered by Gemini Multimodal LLMs, real-time speech synthesis, and interactive medical diagnostics.

---

## 🚀 Interactive Application Workflow

```mermaid
graph TD
    %% Define styles
    classDef patient fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff;
    classDef doctor fill:#00d2ff,stroke:#00a3cc,stroke-width:2px,color:#fff;
    classDef ai fill:#a855f7,stroke:#9333ea,stroke-width:2px,color:#fff;
    classDef db fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff;

    %% Patient nodes
    P1[Patient Registration & baseline Vitals] --> P2[Empathetic AI Triage Chatbot]
    P1 --> P3[Local Multimodal Report Scanner]
    P3 --> P3_OCR[Local Tesseract.js OCR Engine - 100% Offline]
    P3_OCR --> P4[Local Clinical Rule-Based NLP Extraction]
    P4 --> P5[Local Bilingual Audio Summaries - Voice Synthesis]
    
    %% Doctor nodes
    D1[Specialist Login & Credentials Verification] --> D2[Active Patients Dashboard]
    D2 --> D3[Gemini Pharmacological Risk Analysis]
    D2 --> D4[Direct Chats / Consultations Approval]

    %% Database syncing
    P1 -.-> DB[(MongoDB & Fallback local JSON)]
    P2 -.-> DB
    D4 -.-> DB

    %% Apply styles
    class P1,P2,P3,P3_OCR,P4,P5 patient;
    class D1,D2,D3,D4 doctor;
    class P2,D3 ai;
    class DB db;
```

---

## ✨ Features

### 🩺 Patient Workspace
*   **🏥 Sympathetic Triage Bot**: A conversational interface that assesses patient symptoms in real-time, displaying dynamic color-coded urgency classifications (Low, Medium, or Emergency High).
*   **📑 Local Zero-API Lab Report Scanner & OCR**:
    *   **100% On-Device / In-Process OCR**: Recognizes text from prescription & lab report scans (PNG, JPG, JPEG) using local `Tesseract.js` paired with a pre-bundled fast English neural model (`eng.traineddata`). Zero external OCR APIs (No Google Cloud Vision, No Gemini Vision, No third-party network calls).
    *   **Local Clinical Rule-Based NLP Parser**: Extracts structured medical entities directly in Node.js:
        *   **Diagnosed Conditions**: Pattern-matched against 30+ canonical clinical conditions & ICD-aligned disease registries.
        *   **Prescribed Medications**: Detects 80+ common generic and branded pharmaceuticals with automated regex extraction of dosages (e.g., `500 mg`, `10 ml`), frequency patterns (`1-0-1`, `BID`, `TID`, `OD`, `at bedtime`), and course durations.
        *   **Abnormal Lab Markers**: Detects 17+ essential metabolic & biochemical markers (Fasting/Postprandial Blood Glucose, HbA1c, Lipid Profile, Creatinine, Urea, Uric Acid, Liver AST/ALT, Blood Pressure, Hemoglobin, etc.) and benchmarks them against standard clinical normal ranges to identify critical highs and lows.
    *   **Airgapped Privacy**: Sensitive patient diagnostic documents never leave the local server boundary.
*   **🔊 Local Bilingual Voice Translator & Synthesis**: Instantly compiles complex report details into plain English and fluent Hindi summaries locally without external LLM or translation APIs. Includes interactive speed rates and dynamic audio playbacks.
*   **📈 Demographics & Vitals Timeline**: Manage profiles with baseline details and add monthly logs to generate real-time vitals graphs dynamically inside the user panel.

### 🥼 Doctor Specialist Workspace
*   **👥 Active Patient Catalog**: Visualizes patient status with dynamic risk-category colors, latest vital entries (BP & blood sugar), and medical histories.
*   **🛡️ Gemini Clinical Risk Assessment**: Runs multi-factor risk analyses on patient reports and logs using Gemini LLMs to output comprehensive risk sheets.
*   **💬 Full-Duplex Live Consultation Rooms**: Powered by real-time WebSockets (Socket.io) replacing legacy HTTP polling. Instant message exchange, dynamic typing indicators, and real-time online presence detection.
*   **📎 Interactive Media & Document Sharing**: Drag-and-drop exchange of clinical files up to 25MB:
    *   **Medical Scans & Images**: Interactive inline thumbnails with full-screen Lightbox zoom, rotation, and high-res view.
    *   **PDF & Lab Reports**: Formatted document preview cards with file size indicators and in-browser viewing.
    *   **Voice Notes & Audio Dictation**: In-chat microphone recorder and embedded audio player for voice clinical notes.
    *   **Video Streams**: Embedded responsive video player for clinical demonstrations.
*   **🔔 Real-Time WebSocket Notifications**: Instant push alerts for incoming consultation requests and approvals.

---

## 🎨 Visual Design Aesthetics
*   **Glassmorphic Design**: Curated color schemes tailored to roles (Vibrant Teal for patients, Cyber Cyan for doctors) over sleek, frosted dark interfaces with subtle glow backgrounds.
*   **Responsive Flow Layouts**: Adapts to various viewport sizes using double-column models and clean grids.
*   **Interactive Micro-Animations**: Smooth hover-states, dynamic pulsing status dots, audio soundwaves, and interactive graph points that render on hover.

---

## 🛠️ Technology Stack
*   **Frontend**: React.js, Vite, Socket.io-client, Chart.js, HTML5 canvas, Vanilla CSS.
*   **Backend**: Node.js, Express.js, Socket.io (Full-Duplex WebSockets).
*   **Database**: MongoDB (Mongoose schemas) with auto-switching local file fallback storage.
*   **Local OCR & Medical NLP**: Tesseract.js (^5.1.1) with pre-bundled offline `eng.traineddata`, regex & clinical threshold NLP parser (zero external API dependencies).
*   **AI Engine**: Gemini Multi-Modal APIs (Triage conversation & Doctor risk analysis).
*   **Audio Core**: HTML5 Web Speech Synthesis API & MediaRecorder Voice Notes.

---

## ⚙️ Development Setup

### 1. Prerequisites
Ensure you have Node.js installed on your machine.

### 2. Installation
Install core packages in the root, frontend, and backend directories:
```bash
# Root setup
npm install

# Backend setup
cd backend && npm install

# Frontend setup
cd ../frontend && npm install
```

### 3. Environment Setup
Configure your API keys. Create a `.env` file in the root or `backend` folder:
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Running the Servers
Start both the React development environment and Express backend concurrently:
```bash
# From root directory
npm run dev
```
-   **Frontend Client**: http://localhost:5173
-   **Backend REST Server**: http://localhost:5000

---

## 📊 Live Vitals Plotting Logic
Monthly vital entries logged via the patient edit profile update endpoints automatically populate two metrics:
1.  **Blood Pressure (mmHg)**: Charted on the left Y-axis.
2.  **Blood Sugar (mg/dL)**: Charted on the right Y-axis.

Whenever new vital arrays are saved, the risk levels are recalculated dynamically:
*   🔴 **High Risk**: Systolic BP $\ge$ 140 mmHg OR Sugar $\ge$ 180 mg/dL.
*   🟡 **Medium Risk**: Systolic BP $\ge$ 130 mmHg OR Sugar $\ge$ 120 mg/dL.
*   🟢 **Low Risk**: Standard vital thresholds.

---

## official platform website
https://ai-doctor-1fy2.onrender.com

## 🔒 License & Configuration
© 2026 AI-DOCTOR Secure Medical Network. All rights reserved.
Developer : YOGESH SWAMI
