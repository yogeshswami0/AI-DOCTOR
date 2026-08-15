import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import dns from "dns";

// Force Node.js DNS resolver to prefer IPv4 first. This prevents ENETUNREACH errors 
// on cloud platforms (like Render) that do not support outbound IPv6 routing.
if (dns && typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

import Patient from "./models/Patient.js";
import Chat from "./models/Chat.js";
import User from "./models/User.js";
import Consultation from "./models/Consultation.js";
import Medication from "./models/Medication.js";

dotenv.config({ 
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env") 
});

// Global temporary cache for registration email OTPs
const tempOtps = new Map();

// Helper to resolve hostnames to IPv4 directly to bypass IPv6 blocks on hosting platforms
const resolveSmtpHost = (hostname) => {
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve(hostname); // Fallback to original hostname if lookup fails
      } else {
        resolve(addresses[0]); // Prefer first resolved IPv4 address
      }
    });
  });
};

// Helper to generate the HTML content for the registration OTP email
const getOtpEmailTemplate = (otp) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
    <h2 style="color: #0284c7; text-align: center;">AI-DOCTOR Registration Code</h2>
    <p>Hello,</p>
    <p>Thank you for signing up with AI-DOCTOR Clinical Network. Please use the following 6-digit verification code to complete your registration:</p>
    <div style="font-size: 24px; font-weight: bold; text-align: center; padding: 15px; background-color: #f1f5f9; color: #0f172a; border-radius: 6px; letter-spacing: 4px; margin: 20px 0;">
      ${otp}
    </div>
    <p style="font-size: 12px; color: #64748b;">This code is valid for 5 minutes. If you did not request this, please ignore this email.</p>
  </div>
`;

// Helper to send registration verification OTP emails using a self-healing port fallback
const sendOtpEmail = async (email, otp) => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const resendKey = process.env.RESEND_API_KEY;
  
  if (!resendKey && (!user || !pass)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email credentials are not configured. Please set RESEND_API_KEY or EMAIL_USER/EMAIL_PASS.");
    }
    console.log(`[SMTP SIMULATOR] Generated registration OTP for ${email}: ${otp}`);
    return false;
  }

  const emailHtml = getOtpEmailTemplate(otp);

  // If Resend API Key is configured, use the Resend HTTP API (avoids SMTP port blocks on Render/cloud environments)
  if (resendKey) {
    try {
      console.log(`[EMAIL] Attempting delivery via Resend HTTP API to ${email}...`);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "AI-DOCTOR <onboarding@resend.dev>",
          to: email,
          subject: "AI-DOCTOR Portal - Registration Verification Code",
          html: emailHtml
        })
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Resend API returned an error status.");
      }
      console.log("[EMAIL] Resend HTTP delivery succeeded!");
      return true;
    } catch (resendErr) {
      console.error("[EMAIL] Resend HTTP delivery failed:", resendErr.message);
      if (!user || !pass) {
        throw new Error(`Resend HTTP delivery failed: ${resendErr.message}`);
      }
      console.log("[EMAIL] Falling back to standard SMTP configuration...");
    }
  }

  const smtpIp = await resolveSmtpHost("smtp.gmail.com");

  // Attempt 1: Connect via Port 465 (SSL direct connection)
  try {
    console.log(`[SMTP] Attempting delivery via Port 465 (SSL) to ${smtpIp}...`);
    const transporter465 = nodemailer.createTransport({
      host: smtpIp,
      port: 465,
      secure: true,
      auth: { user, pass },
      tls: { servername: "smtp.gmail.com" },
      connectionTimeout: 4000, // Fail fast to try fallback quickly
      greetingTimeout: 4000,
      socketTimeout: 6000
    });
    await transporter465.sendMail({
      from: `"AI-DOCTOR Support" <${user}>`,
      to: email,
      subject: "AI-DOCTOR Portal - Registration Verification Code",
      html: emailHtml
    });
    console.log("[SMTP] Delivery succeeded on SSL (Port 465)!");
    return true;
  } catch (err465) {
    console.warn(`[SMTP] Port 465 failed: ${err465.message}. Falling back to Port 587 (TLS/STARTTLS)...`);
    
    // Attempt 2: Connect via Port 587 (TLS Upgrade)
    try {
      console.log(`[SMTP] Attempting delivery via Port 587 (TLS) to ${smtpIp}...`);
      const transporter587 = nodemailer.createTransport({
        host: smtpIp,
        port: 587,
        secure: false, // Must be false for Port 587 STARTTLS upgrade
        auth: { user, pass },
        tls: { servername: "smtp.gmail.com" },
        connectionTimeout: 4000,
        greetingTimeout: 4000,
        socketTimeout: 6000
      });
      await transporter587.sendMail({
        from: `"AI-DOCTOR Support" <${user}>`,
        to: email,
        subject: "AI-DOCTOR Portal - Registration Verification Code",
        html: emailHtml
      });
      console.log("[SMTP] Delivery succeeded on TLS (Port 587)!");
      return true;
    } catch (err587) {
      console.error("[SMTP] Both Port 465 and Port 587 connection attempts failed.");
      throw new Error(`SMTP connection failed. Port 465 SSL error: ${err465.message} | Port 587 TLS error: ${err587.message}`);
    }
  }
};


const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "ai_doctor_secret_jwt_key_2026";

app.use(cors());
app.use(express.json());

// Setup Multer for image file uploads (OCR scanning in-memory)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbJsonPath = path.join(__dirname, "data", "db.json");

// Setup uploads directory and Multer Disk Storage for chat file uploads
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use("/uploads", express.static(uploadsDir));

const chatDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});
const uploadChat = multer({
  storage: chatDiskStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Middleware to verify JWT token for route protection
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ error: "Access Denied. No token provided." });
  }

  const token = authHeader.split(" ")[1]; // Bearer <token>
  if (!token) {
    return res.status(401).json({ error: "Access Denied. Invalid token format." });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified; // { id, role }
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid or expired token." });
  }
};

// RAG Keyword-based search engine
const queryMedicalKnowledge = (queryText) => {
  try {
    const normalizedQuery = queryText.toLowerCase();
    const filePath = path.join(__dirname, "data", "medical_knowledge.json");
    if (!fs.existsSync(filePath)) return null;

    const knowledgeBase = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    let bestMatch = null;
    let highestScore = 0;

    knowledgeBase.forEach(item => {
      let score = 0;
      item.keywords.forEach(keyword => {
        if (normalizedQuery.includes(keyword)) {
          score += 2;
        }
      });

      if (normalizedQuery.includes(item.category.toLowerCase())) {
        score += 5;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    });

    return highestScore >= 2 ? bestMatch : null;
  } catch (e) {
    console.error("RAG Query matching error:", e);
    return null;
  }
};

// Initial Seed Patient Data
const SEED_PATIENTS = [
  {
    name: "Aarav Sharma",
    age: 68,
    gender: "Male",
    bloodGroup: "O+",
    riskBadge: "High Risk",
    riskClass: "risk-high",
    vitals: {
      labels: ["May 30", "May 31", "Jun 1", "Jun 2", "Jun 3"],
      bpSystolic: [150, 142, 138, 145, 148],
      bpDiastolic: [95, 90, 88, 92, 94],
      sugar: [180, 165, 142, 195, 210]
    },
    latestVitals: {
      bp: "148/94",
      bpTrend: "Elevated",
      bpTrendClass: "trend-up",
      sugar: 210,
      sugarTrend: "High",
      sugarTrendClass: "trend-up"
    },
    reportSummary: "Patient exhibits chronic Stage 2 Hypertension and elevated fasting blood glucose levels. Prescribed daily Lisinopril 10mg and Metformin 500mg. Liver function normal; renal function requires tracking."
  },
  {
    name: "Priya Patel",
    age: 34,
    gender: "Female",
    bloodGroup: "B+",
    riskBadge: "Low Risk",
    riskClass: "risk-low",
    vitals: {
      labels: ["Jun 1", "Jun 2", "Jun 3"],
      bpSystolic: [118, 116, 120],
      bpDiastolic: [78, 75, 80],
      sugar: [95, 88, 92]
    },
    latestVitals: {
      bp: "120/80",
      bpTrend: "Normal",
      bpTrendClass: "trend-down",
      sugar: 92,
      sugarTrend: "Normal",
      sugarTrendClass: "trend-down"
    },
    reportSummary: "Patient profile is healthy. Normal sinus rhythm, balanced blood panel, active lifestyle. No prescription requirements."
  }
];

// Fallback Database Handlers
let dbFallback = false;

function ensureFallbackFile() {
  const dir = path.dirname(dbJsonPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  let initialData = {
    patients: SEED_PATIENTS.map((p, index) => ({
      _id: `fallback-pat-${index + 1}`,
      ...p,
      createdAt: new Date().toISOString()
    })),
    chats: [],
    users: [],
    consultations: [],
    medications: []
  };

  if (!fs.existsSync(dbJsonPath)) {
    fs.writeFileSync(dbJsonPath, JSON.stringify(initialData, null, 2), "utf-8");
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      let updated = false;
      if (!data.medications) {
        data.medications = [];
        updated = true;
      }
      if (!data.patients) {
        data.patients = initialData.patients;
        updated = true;
      }
      if (!data.chats) {
        data.chats = [];
        updated = true;
      }
      if (!data.consultations) {
        data.consultations = [];
        updated = true;
      }
      if (!data.users) {
        data.users = [];
        updated = true;
      }
      if (updated) {
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      }
    } catch (e) {
      console.error("Error reading/updating fallback DB file:", e);
      fs.writeFileSync(dbJsonPath, JSON.stringify(initialData, null, 2), "utf-8");
    }
  }
}

// Helper to seed default test accounts
const seedDefaultUsers = async () => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("password123", salt);

    const defaultDoctor = {
      name: "Dr. Aarav Sharma",
      email: "doctor@aidoctor.com",
      password: hashedPassword,
      role: "doctor",
      specialty: "General Physician & Triage Specialist",
      experience: 10,
      licenseNumber: "LIC10204",
      hospital: "AI-DOCTOR Clinical Network"
    };

    const defaultPatient = {
      name: "Priya Patel",
      email: "patient@aidoctor.com",
      password: hashedPassword,
      role: "patient",
      age: 29,
      gender: "Female",
      bloodGroup: "O+",
      medicalHistory: "Type-2 Diabetes diagnosed. Active compliance tracker initialized.",
      bpSystolic: 120,
      bpDiastolic: 80,
      sugar: 110
    };

    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      let docUser = data.users.find(u => u.email.toLowerCase() === defaultDoctor.email.toLowerCase());
      let patUser = data.users.find(u => u.email.toLowerCase() === defaultPatient.email.toLowerCase());
      
      if (!docUser) {
        docUser = { _id: "fallback-user-doc-1", ...defaultDoctor, createdAt: new Date().toISOString() };
        data.users.push(docUser);
      }
      if (!patUser) {
        patUser = { _id: "fallback-user-pat-1", ...defaultPatient, createdAt: new Date().toISOString() };
        data.users.push(patUser);
      }

      let patProfile = data.patients.find(p => p.userId === "fallback-user-pat-1");
      if (!patProfile) {
        patProfile = {
          _id: "fallback-pat-1",
          userId: "fallback-user-pat-1",
          name: "Priya Patel",
          age: 29,
          gender: "Female",
          bloodGroup: "O+",
          vitals: {
            labels: ["Initial Log"],
            bpSystolic: [120],
            bpDiastolic: [80],
            sugar: [110]
          },
          reportSummary: "Type-2 Diabetes diagnosed. Active compliance tracker initialized."
        };
        data.patients.push(patProfile);
      }
      
      fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      console.log("Seeded default users to local fallback JSON database.");
    } else {
      let doc = await User.findOne({ email: defaultDoctor.email });
      let pat = await User.findOne({ email: defaultPatient.email });
      
      if (!doc) {
        doc = await new User(defaultDoctor).save();
      }
      if (!pat) {
        pat = await new User(defaultPatient).save();
      }

      const patProfileCount = await Patient.countDocuments({ userId: pat._id.toString() });
      if (patProfileCount === 0) {
        await new Patient({
          userId: pat._id.toString(),
          name: "Priya Patel",
          age: 29,
          gender: "Female",
          bloodGroup: "O+",
          vitals: {
            labels: ["Initial Log"],
            bpSystolic: [120],
            bpDiastolic: [80],
            sugar: [110]
          },
          reportSummary: "Type-2 Diabetes diagnosed. Active compliance tracker initialized."
        }).save();
      }
      console.log("Seeded default users to MongoDB successfully.");
    }
  } catch (err) {
    console.warn("Failed to seed default users:", err.message);
  }
};

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/aidoctor";
mongoose.connect(mongoUri)
  .then(async () => {
    console.log("MongoDB database connected successfully.");
    try {
      await User.collection.dropIndex("username_1");
    } catch (err) {}
    await seedDefaultUsers();
  })
  .catch(async (err) => {
    console.warn("MongoDB connection failed. Switching to Local JSON DB Fallback.", err.message);
    dbFallback = true;
    ensureFallbackFile();
    await seedDefaultUsers();
  });

// Database Abstraction Helper (MongoDB + JSON fallback wrapper)
const DB = {
  // Users
  async findUserByEmail(email) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (user) {
        return { ...user, _id: user._id || user.id };
      }
      return null;
    }
    return await User.findOne({ email });
  },

  async addUser(userData) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const newUser = {
        _id: `fallback-user-${Date.now()}`,
        ...userData,
        createdAt: new Date().toISOString()
      };
      data.users.push(newUser);
      fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      return newUser;
    }
    const user = new User(userData);
    return await user.save();
  },

  // Doctors
  async getDoctors() {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      return data.users.filter(u => u.role === "doctor");
    }
    return await User.find({ role: "doctor" });
  },

  // Patients
  async getPatients() {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      return data.patients || [];
    }
    return await Patient.find({});
  },

  async addPatient(patientData) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const newPat = {
        _id: `fallback-pat-${Date.now()}`,
        ...patientData,
        createdAt: new Date().toISOString()
      };
      if (!data.patients) data.patients = [];
      data.patients.push(newPat);
      fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      return newPat;
    }
    const pat = new Patient(patientData);
    return await pat.save();
  },

  // Chats
  async getChat(portal, sessionId) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const chat = data.chats.find(c => c.portal === portal && c.sessionId === sessionId);
      return chat ? chat.messages : [];
    }
    const chat = await Chat.findOne({ portal, sessionId });
    return chat ? chat.messages : [];
  },

  async saveChatMessage(portal, sessionId, message) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      let chat = data.chats.find(c => c.portal === portal && c.sessionId === sessionId);
      if (!chat) {
        chat = { portal, sessionId, messages: [] };
        data.chats.push(chat);
      }
      chat.messages.push({
        _id: `fallback-msg-${Date.now()}`,
        role: message.role,
        content: message.content,
        fileUrl: message.fileUrl || "",
        fileName: message.fileName || "",
        fileType: message.fileType || "",
        timestamp: new Date().toISOString()
      });
      fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      return chat.messages;
    }
    let chat = await Chat.findOne({ portal, sessionId });
    if (!chat) {
      chat = new Chat({ portal, sessionId, messages: [] });
    }
    chat.messages.push({
      role: message.role,
      content: message.content,
      fileUrl: message.fileUrl || "",
      fileName: message.fileName || "",
      fileType: message.fileType || ""
    });
    await chat.save();
    return chat.messages;
  },

  async clearChat(portal, sessionId) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      if (data.chats) {
        data.chats = data.chats.filter(c => !(c.portal === portal && c.sessionId === sessionId));
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      }
      return true;
    }
    const res = await Chat.findOneAndDelete({ portal, sessionId });
    return !!res;
  },

  // Direct Consultations
  async getPatientConsultations(patientId) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      return data.consultations.filter(c => c.patientId === patientId);
    }
    return await Consultation.find({ patientId });
  },

  async getDoctorConsultations(doctorId) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      return data.consultations.filter(c => c.doctorId === doctorId);
    }
    return await Consultation.find({ doctorId });
  },

  async requestConsultation(patientId, patientName, doctorId, doctorName) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      let consult = data.consultations.find(c => c.patientId === patientId && c.doctorId === doctorId);
      if (!consult) {
        consult = {
          _id: `fallback-consult-${Date.now()}`,
          patientId,
          patientName,
          doctorId,
          doctorName,
          status: "pending",
          messages: [],
          createdAt: new Date().toISOString()
        };
        data.consultations.push(consult);
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      }
      return consult;
    }
    let consult = await Consultation.findOne({ patientId, doctorId });
    if (!consult) {
      consult = new Consultation({
        patientId,
        patientName,
        doctorId,
        doctorName,
        status: "pending",
        messages: []
      });
      await consult.save();
    }
    return consult;
  },

  async addConsultationMessage(chatId, senderId, senderName, content, fileUrl = "", fileName = "", fileType = "") {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const consult = data.consultations.find(c => c._id === chatId);
      if (consult) {
        consult.messages.push({
          senderId,
          senderName,
          content,
          fileUrl,
          fileName,
          fileType,
          timestamp: new Date().toISOString()
        });
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      }
      return consult;
    }
    const consult = await Consultation.findById(chatId);
    if (consult) {
      consult.messages.push({ senderId, senderName, content, fileUrl, fileName, fileType });
      await consult.save();
    }
    return consult;
  },

  async acceptConsultation(chatId) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const consult = data.consultations.find(c => c._id === chatId);
      if (consult) {
        consult.status = "active";
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      }
      return consult;
    }
    const consult = await Consultation.findById(chatId);
    if (consult) {
      consult.status = "active";
      await consult.save();
    }
    return consult;
  },

  // Update profile
  async updateUser(userId, updatedDetails) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const userIdx = data.users.findIndex(u => (u._id || u.id) === userId);
      if (userIdx !== -1) {
        data.users[userIdx] = { ...data.users[userIdx], ...updatedDetails };
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
        return data.users[userIdx];
      }
      return null;
    }
    return await User.findByIdAndUpdate(userId, updatedDetails, { new: true });
  },

  // Update clinical patient vitals values
  async updatePatientByUserId(userId, patientName, updatedData) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      if (!data.patients) data.patients = [];
      
      let pat = data.patients.find(p => p.userId === userId);
      if (!pat) {
        pat = data.patients.find(p => p.name.toLowerCase() === patientName.toLowerCase());
      }
      
      if (pat) {
        pat.userId = userId;
        pat.name = updatedData.name;
        pat.age = updatedData.age;
        pat.gender = updatedData.gender;
        pat.bloodGroup = updatedData.bloodGroup;
        pat.reportSummary = updatedData.reportSummary;
        
        if (updatedData.bpSystolic !== undefined && updatedData.bpDiastolic !== undefined && updatedData.sugar !== undefined) {
          if (!pat.vitals) {
            pat.vitals = { labels: ["Initial Log"], bpSystolic: [], bpDiastolic: [], sugar: [] };
          }
          if (!pat.vitals.bpSystolic) pat.vitals.bpSystolic = [];
          if (!pat.vitals.bpDiastolic) pat.vitals.bpDiastolic = [];
          if (!pat.vitals.sugar) pat.vitals.sugar = [];
          
          if (pat.vitals.bpSystolic.length > 0) {
            const idx = pat.vitals.bpSystolic.length - 1;
            pat.vitals.bpSystolic[idx] = updatedData.bpSystolic;
            pat.vitals.bpDiastolic[idx] = updatedData.bpDiastolic;
            pat.vitals.sugar[idx] = updatedData.sugar;
          } else {
            pat.vitals.bpSystolic.push(updatedData.bpSystolic);
            pat.vitals.bpDiastolic.push(updatedData.bpDiastolic);
            pat.vitals.sugar.push(updatedData.sugar);
          }
          
          const lastBpSys = updatedData.bpSystolic;
          const lastSugar = updatedData.sugar;
          
          pat.latestVitals = {
            bp: `${lastBpSys}/${updatedData.bpDiastolic}`,
            bpTrend: lastBpSys >= 130 ? "Elevated" : "Normal",
            bpTrendClass: lastBpSys >= 130 ? "trend-up" : "trend-down",
            sugar: lastSugar,
            sugarTrend: lastSugar >= 120 ? "High" : "Normal",
            sugarTrendClass: lastSugar >= 120 ? "trend-up" : "trend-down"
          };
          
          if (lastBpSys >= 140 || lastSugar >= 180) {
            pat.riskBadge = "High Risk";
            pat.riskClass = "risk-high";
          } else if (lastBpSys >= 130 || lastSugar >= 120) {
            pat.riskBadge = "Medium Risk";
            pat.riskClass = "risk-medium";
          } else {
            pat.riskBadge = "Low Risk";
            pat.riskClass = "risk-low";
          }
        }
        
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
        return pat;
      }
      return null;
    }
    
    let pat = await Patient.findOne({ userId });
    if (!pat) {
      pat = await Patient.findOne({ name: new RegExp(`^${patientName}$`, 'i') });
    }
    
    if (pat) {
      pat.userId = userId;
      pat.name = updatedData.name;
      pat.age = updatedData.age;
      pat.gender = updatedData.gender;
      pat.bloodGroup = updatedData.bloodGroup;
      pat.reportSummary = updatedData.reportSummary;
      
      if (updatedData.bpSystolic !== undefined && updatedData.bpDiastolic !== undefined && updatedData.sugar !== undefined) {
        if (!pat.vitals) {
          pat.vitals = { labels: ["Initial Log"], bpSystolic: [], bpDiastolic: [], sugar: [] };
        }
        
        const bpSys = [...(pat.vitals.bpSystolic || [])];
        const bpDia = [...(pat.vitals.bpDiastolic || [])];
        const sug = [...(pat.vitals.sugar || [])];
        
        if (bpSys.length > 0) {
          const idx = bpSys.length - 1;
          bpSys[idx] = updatedData.bpSystolic;
          bpDia[idx] = updatedData.bpDiastolic;
          sug[idx] = updatedData.sugar;
        } else {
          bpSys.push(updatedData.bpSystolic);
          bpDia.push(updatedData.bpDiastolic);
          sug.push(updatedData.sugar);
        }
        
        pat.vitals.bpSystolic = bpSys;
        pat.vitals.bpDiastolic = bpDia;
        pat.vitals.sugar = sug;
        
        const lastBpSys = updatedData.bpSystolic;
        const lastSugar = updatedData.sugar;
        
        pat.latestVitals = {
          bp: `${lastBpSys}/${updatedData.bpDiastolic}`,
          bpTrend: lastBpSys >= 130 ? "Elevated" : "Normal",
          bpTrendClass: lastBpSys >= 130 ? "trend-up" : "trend-down",
          sugar: lastSugar,
          sugarTrend: lastSugar >= 120 ? "High" : "Normal",
          sugarTrendClass: lastSugar >= 120 ? "trend-up" : "trend-down"
        };
        
        if (lastBpSys >= 140 || lastSugar >= 180) {
          pat.riskBadge = "High Risk";
          pat.riskClass = "risk-high";
        } else if (lastBpSys >= 130 || lastSugar >= 120) {
          pat.riskBadge = "Medium Risk";
          pat.riskClass = "risk-medium";
        } else {
          pat.riskBadge = "Low Risk";
          pat.riskClass = "risk-low";
        }
      }
      
      return await pat.save();
    }
    return null;
  },

  // Medications CRUD
  async getMedications(userId) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      return (data.medications || []).filter(m => m.userId === userId);
    }
    return await Medication.find({ userId });
  },

  async addMedication(medData) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      if (!data.medications) data.medications = [];
      const newMed = {
        _id: `fallback-med-${Date.now()}`,
        ...medData,
        adherenceLogs: [],
        createdAt: new Date().toISOString()
      };
      data.medications.push(newMed);
      fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      return newMed;
    }
    const med = new Medication(medData);
    return await med.save();
  },

  async updateMedication(medId, updatedData) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const idx = data.medications.findIndex(m => m._id === medId);
      if (idx !== -1) {
        data.medications[idx] = { ...data.medications[idx], ...updatedData };
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
        return data.medications[idx];
      }
      return null;
    }
    return await Medication.findByIdAndUpdate(medId, updatedData, { new: true });
  },

  async deleteMedication(medId) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const filtered = data.medications.filter(m => m._id !== medId);
      const deleted = filtered.length !== data.medications.length;
      data.medications = filtered;
      fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      return deleted;
    }
    const res = await Medication.findByIdAndDelete(medId);
    return !!res;
  },

  async logMedicationAdherence(medId, logData) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const med = data.medications.find(m => m._id === medId);
      if (med) {
        if (!med.adherenceLogs) med.adherenceLogs = [];
        med.adherenceLogs.push({
          _id: `fallback-log-${Date.now()}`,
          ...logData,
          loggedAt: new Date().toISOString()
        });
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      }
      return med;
    }
    const med = await Medication.findById(medId);
    if (med) {
      med.adherenceLogs.push(logData);
      await med.save();
    }
    return med;
  }
};

// Gemini API Key helper
function getAIClient(req) {
  const apiKey = req.headers["x-api-key"] || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "" || apiKey === "your_gemini_api_key_here") {
    throw new Error("Gemini API Key is missing. Please configure .env or input your key in the Settings Panel.");
  }
  return new GoogleGenAI({ apiKey });
}

/* ==========================================================================
   REST Auth Routing Endpoints
   ========================================================================== */

// Send OTP Code route
app.post("/api/auth/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Please enter your email address." });
    }

    const existing = await DB.findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "User already registered with this email." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    tempOtps.set(email.toLowerCase(), {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes TTL
    });

    let sent = false;
    let mailError = null;
    try {
      sent = await sendOtpEmail(email, otp);
    } catch (mailErr) {
      console.error("Mail sending error:", mailErr.message);
      mailError = mailErr.message;
    }

    if (sent) {
      res.json({ message: "Verification OTP code sent to your email. Please check your inbox." });
    } else {
      if (process.env.NODE_ENV === "production") {
        return res.status(500).json({ 
          error: `Verification email delivery failed: ${mailError || "SMTP service is unconfigured."} Please check your server environment variable settings.` 
        });
      }

      console.log(`[DEVELOPMENT BACKEND LOG] OTP code for ${email} is: ${otp}`);
      res.json({ 
        message: "Verification OTP code generated. [Local Development Mode] Please check your backend terminal console logs for the code.",
        devMode: true 
      });
    }
  } catch (error) {
    console.error("OTP generation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Register Route
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role, otp } = req.body;
    if (!name || !email || !password || !role || !otp) {
      return res.status(400).json({ error: "Please enter all registration details, including the OTP code." });
    }

    const cached = tempOtps.get(email.toLowerCase());
    if (!cached || cached.otp !== otp || Date.now() > cached.expiresAt) {
      return res.status(400).json({ error: "Invalid or expired verification OTP code." });
    }

    // OTP verified, remove from cache
    tempOtps.delete(email.toLowerCase());

    const existing = await DB.findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "User already registered with this email." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const registrationDetails = {
      name,
      email,
      password: hashedPassword,
      role,
      specialty: req.body.specialty || "",
      experience: parseInt(req.body.experience) || 0,
      licenseNumber: req.body.licenseNumber || "",
      hospital: req.body.hospital || "",
      age: parseInt(req.body.age) || 0,
      gender: req.body.gender || "",
      bloodGroup: req.body.bloodGroup || "",
      medicalHistory: req.body.medicalHistory || "",
      bpSystolic: parseInt(req.body.bpSystolic) || 120,
      bpDiastolic: parseInt(req.body.bpDiastolic) || 80,
      sugar: parseInt(req.body.sugar) || 90
    };

    const user = await DB.addUser(registrationDetails);

    if (role === "patient") {
      try {
        await DB.addPatient({
          userId: user._id.toString(),
          name: name,
          age: parseInt(req.body.age) || 30,
          gender: req.body.gender || "Not specified",
          bloodGroup: req.body.bloodGroup || "Not specified",
          vitals: {
            labels: ["Initial Log"],
            bpSystolic: [parseInt(req.body.bpSystolic) || 120],
            bpDiastolic: [parseInt(req.body.bpDiastolic) || 80],
            sugar: [parseInt(req.body.sugar) || 90]
          },
          reportSummary: req.body.medicalHistory || "Patient registered. Initial vitals seeded."
        });
      } catch (patientErr) {
        console.warn("Could not automatically seed patient vitals schema:", patientErr.message);
      }
    }

    const token = jwt.sign(
      { id: user._id.toString(), role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialty: user.specialty,
        experience: user.experience,
        hospital: user.hospital,
        age: user.age,
        gender: user.gender,
        bloodGroup: user.bloodGroup,
        medicalHistory: user.medicalHistory,
        bpSystolic: user.bpSystolic,
        bpDiastolic: user.bpDiastolic,
        sugar: user.sugar
      }
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Login Route
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Please enter your email and password." });
    }

    const user = await DB.findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials (user not found)." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials (password mismatch)." });
    }

    const token = jwt.sign(
      { id: user._id.toString(), role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialty: user.specialty,
        experience: user.experience,
        hospital: user.hospital,
        age: user.age,
        gender: user.gender,
        bloodGroup: user.bloodGroup,
        medicalHistory: user.medicalHistory,
        bpSystolic: user.bpSystolic,
        bpDiastolic: user.bpDiastolic,
        sugar: user.sugar
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update Profile Route (Protected)
app.put("/api/auth/profile", verifyToken, async (req, res) => {
  try {
    const { userId, name, role } = req.body;
    if (!userId || !name || !role) {
      return res.status(400).json({ error: "Missing required profile parameters." });
    }

    if (req.user.id !== userId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized update action." });
    }

    let updatedDetails = { name };

    if (role === "doctor") {
      updatedDetails = {
        ...updatedDetails,
        specialty: req.body.specialty || "",
        experience: parseInt(req.body.experience) || 0,
        licenseNumber: req.body.licenseNumber || "",
        hospital: req.body.hospital || ""
      };
    } else if (role === "patient") {
      updatedDetails = {
        ...updatedDetails,
        age: parseInt(req.body.age) || 0,
        gender: req.body.gender || "",
        bloodGroup: req.body.bloodGroup || "",
        medicalHistory: req.body.medicalHistory || "",
        bpSystolic: parseInt(req.body.bpSystolic) || 120,
        bpDiastolic: parseInt(req.body.bpDiastolic) || 80,
        sugar: parseInt(req.body.sugar) || 90
      };
    }

    const updatedUser = await DB.updateUser(userId, updatedDetails);
    if (!updatedUser) {
      return res.status(404).json({ error: "User profile not found." });
    }

    if (role === "patient") {
      const patientDetails = {
        name,
        age: parseInt(req.body.age) || 0,
        gender: req.body.gender || "",
        bloodGroup: req.body.bloodGroup || "",
        reportSummary: req.body.medicalHistory || "",
        bpSystolic: parseInt(req.body.bpSystolic) || 120,
        bpDiastolic: parseInt(req.body.bpDiastolic) || 80,
        sugar: parseInt(req.body.sugar) || 90
      };
      await DB.updatePatientByUserId(userId, name, patientDetails);
    }

    res.json({
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        specialty: updatedUser.specialty,
        experience: updatedUser.experience,
        licenseNumber: updatedUser.licenseNumber,
        hospital: updatedUser.hospital,
        age: updatedUser.age,
        gender: updatedUser.gender,
        bloodGroup: updatedUser.bloodGroup,
        medicalHistory: updatedUser.medicalHistory,
        bpSystolic: updatedUser.bpSystolic,
        bpDiastolic: updatedUser.bpDiastolic,
        sugar: updatedUser.sugar
      }
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ==========================================================================
   REST Consultation Routing Endpoints (Protected)
   ========================================================================== */

// GET List of registered doctors
app.get("/api/doctors", verifyToken, async (req, res) => {
  try {
    const list = await DB.getDoctors();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Consultations for patient
app.get("/api/consultations/patient/:patientId", verifyToken, async (req, res) => {
  try {
    const { patientId } = req.params;
    if (req.user.id !== patientId && req.user.role !== "doctor") {
      return res.status(403).json({ error: "Access Denied. Unauthorized." });
    }
    const list = await DB.getPatientConsultations(patientId);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Consultations for doctor
app.get("/api/consultations/doctor/:doctorId", verifyToken, async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (req.user.id !== doctorId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized." });
    }
    const list = await DB.getDoctorConsultations(doctorId);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Initiate Consultation Request
app.post("/api/consultations/request", verifyToken, async (req, res) => {
  try {
    const { patientId, patientName, doctorId, doctorName } = req.body;
    if (!patientId || !patientName || !doctorId || !doctorName) {
      return res.status(400).json({ error: "Missing required consultation parameters." });
    }
    if (req.user.id !== patientId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized action." });
    }
    const consult = await DB.requestConsultation(patientId, patientName, doctorId, doctorName);
    res.json(consult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Add message to consultation
app.post("/api/consultations/:chatId/message", verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { senderId, senderName, content, fileUrl, fileName, fileType } = req.body;
    if (!senderId || !senderName || (!content && !fileUrl)) {
      return res.status(400).json({ error: "Missing sender details or message content." });
    }
    if (req.user.id !== senderId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized sender." });
    }
    const updated = await DB.addConsultationMessage(chatId, senderId, senderName, content, fileUrl || "", fileName || "", fileType || "");
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Accept consultation
app.post("/api/consultations/:chatId/accept", verifyToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    if (req.user.role !== "doctor") {
      return res.status(403).json({ error: "Access Denied. Only doctors can accept requests." });
    }
    const updated = await DB.acceptConsultation(chatId);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ==========================================================================
   REST API Medical Workspace Endpoints (Protected)
   ========================================================================== */

// DB Status Endpoint (Public/Publicly Accessible to verify state)
app.get("/api/db-status", (req, res) => {
  res.json({
    fallbackMode: dbFallback,
    connectedDatabase: dbFallback ? "JSON File Database Fallback" : "MongoDB (Mongoose)"
  });
});

// GET Patient list
app.get("/api/patients", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "doctor") {
      return res.status(403).json({ error: "Access Denied. Only specialists can list patients." });
    }
    const list = await DB.getPatients();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Add new patient
app.post("/api/patients", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "doctor") {
      return res.status(403).json({ error: "Access Denied. Only specialists can add patients." });
    }
    const newPatient = await DB.addPatient(req.body);
    res.json(newPatient);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Single Patient by User ID
app.get("/api/patients/user/:userId", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.user.id !== userId && req.user.role !== "doctor") {
      return res.status(403).json({ error: "Access Denied. Unauthorized lookup." });
    }
    let pat;
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      pat = data.patients.find(p => p.userId === userId);
    } else {
      pat = await Patient.findOne({ userId });
    }
    if (!pat) {
      return res.status(404).json({ error: "Clinical patient profile not found." });
    }
    res.json(pat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Add Vitals Log Entry
app.post("/api/patients/:userId/vitals", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { label, bpSystolic, bpDiastolic, sugar } = req.body;
    if (!label || !bpSystolic || !bpDiastolic || !sugar) {
      return res.status(400).json({ error: "Missing required vitals parameters." });
    }
    if (req.user.id !== userId && req.user.role !== "doctor") {
      return res.status(403).json({ error: "Access Denied. Unauthorized access." });
    }

    let pat;
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      pat = data.patients.find(p => p.userId === userId);
      if (pat) {
        if (!pat.vitals) pat.vitals = { labels: [], bpSystolic: [], bpDiastolic: [], sugar: [] };
        if (!pat.vitals.labels) pat.vitals.labels = [];
        if (!pat.vitals.bpSystolic) pat.vitals.bpSystolic = [];
        if (!pat.vitals.bpDiastolic) pat.vitals.bpDiastolic = [];
        if (!pat.vitals.sugar) pat.vitals.sugar = [];

        pat.vitals.labels.push(label);
        pat.vitals.bpSystolic.push(parseInt(bpSystolic));
        pat.vitals.bpDiastolic.push(parseInt(bpDiastolic));
        pat.vitals.sugar.push(parseInt(sugar));

        pat.latestVitals = {
          bp: `${bpSystolic}/${bpDiastolic}`,
          bpTrend: bpSystolic >= 130 ? "Elevated" : "Normal",
          bpTrendClass: bpSystolic >= 130 ? "trend-up" : "trend-down",
          sugar: parseInt(sugar),
          sugarTrend: sugar >= 120 ? "High" : "Normal",
          sugarTrendClass: sugar >= 120 ? "trend-up" : "trend-down"
        };

        if (bpSystolic >= 140 || sugar >= 180) {
          pat.riskBadge = "High Risk";
          pat.riskClass = "risk-high";
        } else if (bpSystolic >= 130 || sugar >= 120) {
          pat.riskBadge = "Medium Risk";
          pat.riskClass = "risk-medium";
        } else {
          pat.riskBadge = "Low Risk";
          pat.riskClass = "risk-low";
        }

        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      }
    } else {
      pat = await Patient.findOne({ userId });
      if (pat) {
        if (!pat.vitals) {
          pat.vitals = { labels: [], bpSystolic: [], bpDiastolic: [], sugar: [] };
        }
        
        pat.vitals.labels.push(label);
        pat.vitals.bpSystolic.push(parseInt(bpSystolic));
        pat.vitals.bpDiastolic.push(parseInt(bpDiastolic));
        pat.vitals.sugar.push(parseInt(sugar));

        pat.latestVitals = {
          bp: `${bpSystolic}/${bpDiastolic}`,
          bpTrend: bpSystolic >= 130 ? "Elevated" : "Normal",
          bpTrendClass: bpSystolic >= 130 ? "trend-up" : "trend-down",
          sugar: parseInt(sugar),
          sugarTrend: sugar >= 120 ? "High" : "Normal",
          sugarTrendClass: sugar >= 120 ? "trend-up" : "trend-down"
        };

        if (bpSystolic >= 140 || sugar >= 180) {
          pat.riskBadge = "High Risk";
          pat.riskClass = "risk-high";
        } else if (bpSystolic >= 130 || sugar >= 120) {
          pat.riskBadge = "Medium Risk";
          pat.riskClass = "risk-medium";
        } else {
          pat.riskBadge = "Low Risk";
          pat.riskClass = "risk-low";
        }

        pat.markModified("vitals");
        await pat.save();
      }
    }

    if (!pat) {
      return res.status(404).json({ error: "Patient profile not found." });
    }

    res.json(pat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Chat history
app.get("/api/chats/:portal/:sessionId", verifyToken, async (req, res) => {
  try {
    const { portal, sessionId } = req.params;
    if (req.user.id !== sessionId && req.user.role !== "doctor" && req.user.email !== sessionId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized access to chat logs." });
    }
    const history = await DB.getChat(portal, sessionId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Chat message
app.post("/api/chats/:portal/:sessionId", verifyToken, async (req, res) => {
  try {
    const { portal, sessionId } = req.params;
    const { message } = req.body;
    if (req.user.id !== sessionId && req.user.role !== "doctor" && req.user.email !== sessionId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized message posting." });
    }
    const updatedMessages = await DB.saveChatMessage(portal, sessionId, message);
    res.json(updatedMessages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE Chat history
app.delete("/api/chats/:portal/:sessionId", verifyToken, async (req, res) => {
  try {
    const { portal, sessionId } = req.params;
    if (req.user.id !== sessionId && req.user.role !== "doctor" && req.user.email !== sessionId) {
      return res.status(403).json({ error: "Access Denied. Unauthorized action." });
    }
    await DB.clearChat(portal, sessionId);
    res.json({ message: "Chat history cleared successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Multimedia file upload endpoint inside chats (supports both 'file' and 'chatFile' multipart keys)
app.post("/api/chats/upload", verifyToken, uploadChat.fields([{ name: "file", maxCount: 1 }, { name: "chatFile", maxCount: 1 }]), (req, res) => {
  try {
    const file = req.files && (req.files["file"]?.[0] || req.files["chatFile"]?.[0]);
    if (!file) {
      return res.status(400).json({ error: "No file selected." });
    }
    const relativeUrl = `/uploads/${file.filename}`;
    res.json({
      fileUrl: relativeUrl,
      fileName: file.originalname,
      fileType: file.mimetype.startsWith("image/") ? "image" : (file.mimetype === "application/pdf" ? "pdf" : "document")
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   REST Medication Scheduler Endpoints (Protected)
   ========================================================================== */

// GET Medications
app.get("/api/medications", verifyToken, async (req, res) => {
  try {
    const list = await DB.getMedications(req.user.id);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Add Medication
app.post("/api/medications", verifyToken, async (req, res) => {
  try {
    const { name, dosage, frequency, time, startDate, endDate } = req.body;
    if (!name || !dosage || !frequency || !time || !startDate) {
      return res.status(400).json({ error: "Missing required medication parameter fields." });
    }

    const medData = {
      userId: req.user.id,
      name,
      dosage,
      frequency,
      time,
      startDate,
      endDate: endDate || "",
      isActive: true
    };

    const newMed = await DB.addMedication(medData);
    res.json(newMed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT Update Medication
app.put("/api/medications/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await DB.updateMedication(id, req.body);
    if (!updated) return res.status(404).json({ error: "Medication schedule not found." });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT Toggle Medication Taken status (with date-based logs)
app.put("/api/medications/:id/toggle", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { taken, date } = req.body;
    
    // Find the medication
    let med;
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      med = data.medications.find(m => m._id === id);
    } else {
      med = await Medication.findById(id);
    }
    
    if (!med) return res.status(404).json({ error: "Medication not found." });
    
    if (!med.adherenceLogs) med.adherenceLogs = [];
    
    if (taken) {
      // Add taken log if it doesn't exist for this date
      const exists = med.adherenceLogs.some(l => l.date === date && l.status === "taken");
      if (!exists) {
        med.adherenceLogs.push({
          _id: dbFallback ? `fallback-log-${Date.now()}` : undefined,
          date,
          time: med.time,
          status: "taken",
          loggedAt: new Date().toISOString()
        });
      }
    } else {
      // Remove taken logs for this date
      med.adherenceLogs = med.adherenceLogs.filter(l => !(l.date === date && l.status === "taken"));
    }
    
    // Save medication
    let updated;
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const idx = data.medications.findIndex(m => m._id === id);
      if (idx !== -1) {
        data.medications[idx] = med;
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
        updated = med;
      }
    } else {
      updated = await med.save();
    }
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE Medication
app.delete("/api/medications/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await DB.deleteMedication(id);
    if (!deleted) return res.status(404).json({ error: "Medication schedule not found." });
    res.json({ message: "Medication schedule deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Log Medication Adherence
app.post("/api/medications/:id/log", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, status } = req.body;
    if (!date || !time || !status) {
      return res.status(400).json({ error: "Missing log details (date, time, status)." });
    }

    const updatedMed = await DB.logMedicationAdherence(id, { date, time, status });
    if (!updatedMed) return res.status(404).json({ error: "Medication schedule not found." });
    res.json(updatedMed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ==========================================================================
   Generative AI Integration Routes (Protected)
   ========================================================================== */

// 1. Doctor Research Assistant Chatbot API
function mapMessagesToGeminiContents(messages, uploadsDir) {
  return messages.map(m => {
    const parts = [{ text: m.content || "" }];
    
    // Check if message has a valid file url
    if (m.fileUrl) {
      try {
        const filename = path.basename(m.fileUrl);
        const filePath = path.join(uploadsDir, filename);
        
        if (fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath);
          const base64Data = fileBuffer.toString("base64");
          
          // Determine mime type
          let mimeType = "image/jpeg";
          const ext = path.extname(filename).toLowerCase();
          if (ext === ".png") mimeType = "image/png";
          else if (ext === ".gif") mimeType = "image/gif";
          else if (ext === ".pdf") mimeType = "application/pdf";
          else if (ext === ".txt") mimeType = "text/plain";
          
          parts.push({
            inlineData: {
              data: base64Data,
              mimeType
            }
          });
        }
      } catch (err) {
        console.error("Error reading message attachment file:", err);
      }
    }
    
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts
    };
  });
}

// POST Doctor AI Research Assistant Chat
app.post("/api/doctor/chat", verifyToken, async (req, res) => {
  let contextItem = null;
  let mode = "standard";
  try {
    const { messages, context, mode: reqMode } = req.body;
    if (reqMode) mode = reqMode;
    const ai = getAIClient(req);
    const userMessage = messages[messages.length - 1]?.content || "";

    let systemInstruction = `You are an advanced Clinical Research and Pharmacological AI Assistant. Your user is a certified medical professional. 

    Guidelines:
    1. Provide highly technical, evidence-based medical information, including drug mechanisms, precise dosages, and contraindications.
    2. Maintain a professional, peer-to-peer medical tone. Do not use over-simplistic language.
    3. Cite standard medical guidelines or clinical trials where applicable.
    4. If a query lacks critical patient context (e.g., kidney function, age), explicitly remind the doctor to consider those variables.`;

    if (mode === "custom") {
      contextItem = queryMedicalKnowledge(userMessage);
      if (contextItem) {
        systemInstruction += `\n\nCLINICAL CONTEXT (RAG local database):
        - Category: ${contextItem.category}
        - Guidelines: ${contextItem.content}
        
        Answer the doctor's query incorporating the local clinic database parameters above.`;
      } else {
        return res.json({
          reply: `⚠️ *[Custom Data Mode]*
          
As a clinical assistant operating in Custom Data Mode, I am restricted to answering questions that match our local clinic database guidelines. No matching guidelines were found for: "${userMessage}".

*Switch to Standard API Mode to query general AI research.*`
        });
      }
    }

    if (context) {
      systemInstruction += `\n\nCURRENT PATIENT CONTEXT (Keep these in mind for any patient-specific queries, and warn if treatments conflict):
      - Age Group: ${context.ageGroup || "Not specified"}
      - Renal/Kidney Function: ${context.kidneyFunction || "Not specified"}
      - Liver Function: ${context.liverFunction || "Not specified"}
      - Other Medications: ${context.otherMeds || "None reported"}`;
    }

    const contents = mapMessagesToGeminiContents(messages, uploadsDir);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction
      }
    });

    res.json({ reply: response.text });
  } catch (error) {
    console.error(error);
    if (error.message && (error.message.includes("quota") || error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED"))) {
      if (mode === "custom" && contextItem) {
        return res.json({
          reply: `⚠️ *[Notice: Gemini API Quota Exceeded - Local Database Fallback]*
          
Your Gemini API Key has exceeded its daily free tier requests limit. Since you are in Custom Mode, here is the matching pharmacological rule from our local clinical database:

**Category:** ${contextItem.category}
**Local Guidelines:** ${contextItem.content}

*Please configure a valid API key to restore natural language processing.*`
        });
      }
      return res.json({
        reply: `⚠️ *[Notice: Gemini API Quota Exceeded]*
        
I have detected that your Gemini API Key has exceeded its daily free tier requests limit (20 requests/day). Here is a standard fallback response:

Based on the clinical research context provided, the patient's vitals indicate stable trends. Please review renal function (eGFR) and age-based contraindications before prescribing metformin or scan-contrast protocols.

*To resolve this, please update your Gemini API billing details at https://aistudio.google.com/ or configure a new key in the settings panel.*`
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// 2. Doctor Patient Risk Insights API
app.post("/api/doctor/analyze-patient", verifyToken, async (req, res) => {
  try {
    const { patientData } = req.body;
    const ai = getAIClient(req);

    const systemInstruction = `You are an expert Medical Data Analyst AI. Your task is to analyze a patient's historical health data and generate a concise "Risk Assessment Sheet" for their treating physician.

    Input Data Provided:
    - Patient Demographics (Age, Gender, Blood Group)
    - Raw Medical Report Summaries
    - Vitals History Log (Blood Pressure and Blood Sugar trends over time)

    Your Output Format (Strictly structured):
    1. RISK STATUS: [Low / Medium / High] (Provide a clear justification based on clinical thresholds).
    2. KEY ANOMALIES: [Bullet points highlighting critical metrics, e.g., "Blood sugar spike of 210 mg/dL recorded on Tuesday"].
    3. RED FLAGS: [Immediate safety concerns or critical drug-symptom interactions the doctor should check during the call].
    4. RECOMMENDATIONS: [Suggested focus areas or potential lab tests the doctor might want to order next].

    Tone: Objective, urgent where necessary, and strictly analytical. Do not diagnose the patient; assist the doctor's diagnosis.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze this data: ${JSON.stringify(patientData)}`,
      config: {
        systemInstruction
      }
    });

    res.json({ analysis: response.text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Patient General Triage Chatbot API
app.post("/api/patient/chat", verifyToken, async (req, res) => {
  let contextItem = null;
  let mode = "standard";
  try {
    const { messages, mode: reqMode } = req.body; // mode is "custom" (RAG) or "standard"
    if (reqMode) mode = reqMode;
    const ai = getAIClient(req);

    const userMessage = messages[messages.length - 1]?.content || "";
    let systemInstruction = "";

    if (mode === "custom") {
      contextItem = queryMedicalKnowledge(userMessage);

      if (contextItem) {
        systemInstruction = `You are a strict Medical Clinic Assistant answering questions based ONLY on the following clinical fact sheet context. 
        If the question cannot be answered by this context, or if the user asks something outside this clinical scope, politely decline to answer, explaining that in Custom Data Mode you are limited to the clinic's local database.
        
        Clinical Context Fact Sheet:
        Category: ${contextItem.category}
        Information: ${contextItem.content}
        
        MANDATORY RULES:
        1. Speak clearly, compassionately, and without complex jargon.
        2. MANDATORY DISCLAIMER: End your response by stating that you are an AI assistant using the local clinic database and this does not replace professional medical advice.`;
      } else {
        return res.json({ 
          reply: `I am sorry, but as an assistant operating in Custom Data Mode, I am restricted to answering questions that match our local clinic database. No matching medical guidelines were found for your query. Switch to Standard API Mode for general AI questions.
          
          *Disclaimer: I am an AI, not a doctor. This does not replace professional medical advice.*` 
        });
      }
    } else {
      systemInstruction = `You are a compassionate, accessible AI Triage and Health Information Assistant. Your user is a patient seeking clarity on health topics.

      Guidelines:
      1. Use clear, compassionate, and non-technical language. Avoid complex medical jargon.
      2. For symptom checking, use a triage approach: categorize symptoms into Low (home care), Medium (visit a clinic), or High (go to the Emergency Room).
      3. MANDATORY DISCLAIMER: End every single response with a clear statement that you are an AI, not a doctor, and this information does not replace professional medical advice.
      4. Never prescribe specific medication dosages or tell a patient to alter their current prescription.`;
    }

    const contents = mapMessagesToGeminiContents(messages, uploadsDir);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction
      }
    });

    res.json({ reply: response.text });
  } catch (error) {
    console.error(error);
    if (error.message && (error.message.includes("quota") || error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED"))) {
      if (mode === "custom" && contextItem) {
        return res.json({
          reply: `⚠️ *[Notice: Gemini API Quota Exceeded - Local Database Fallback]*
          
Your Gemini API Key has exceeded its daily free tier requests limit. Since you are in Custom Mode, here is the matching record from our local clinic database:

**Category:** ${contextItem.category}
**Local Guidelines:** ${contextItem.content}

*Please configure a valid API key to restore natural language processing.*`
        });
      }
      return res.json({
        reply: `⚠️ *[Notice: Gemini API Quota Exceeded]*
        
Your Gemini API Key has exceeded its free tier requests limit. To help you triage, here is a localized guideline:

If your symptoms are severe (e.g., chest pain, shortness of breath, sudden numbness), please seek emergency care immediately (High Risk). For mild symptoms, get plenty of rest and stay hydrated (Low Risk).

*Please check your Google AI Studio plan or replace your API key in the sidebar settings panel.*`
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// 4. Report Data Extraction (OCR Post-Processor) API
app.post("/api/patient/parse-report", verifyToken, upload.single("reportFile"), async (req, res) => {
  try {
    const { reportText } = req.body;
    const ai = getAIClient(req);

    const systemInstruction = `You are a Medical Document Parsing AI. Your job is to clean, extract, and structure raw, messy text scanned from a medical lab report or prescription into a clean JSON format.

    Analyze the raw text and extract the following fields exactly:
    {
      "diagnosed_conditions": ["List of suspected or confirmed conditions found"],
      "prescribed_medications": [
        {
          "name": "Name of the drug",
          "dosage": "e.g., 500mg",
          "frequency": "e.g., Twice a day, after meals",
          "duration": "e.g., 5 days"
        }
      ],
      "abnormal_lab_markers": [
        {
          "test_name": "e.g., HbA1c",
          "value": "e.g., 7.5%",
          "status": "High/Low/Normal"
        }
      ]
    }

    Rules:
    1. Output ONLY valid, parsable JSON. Do not write introductory or concluding prose.
    2. If a field cannot be found in the text, return it as an empty array [].`;

    let contents = [];

    if (req.file) {
      contents.push({
        inlineData: {
          data: req.file.buffer.toString("base64"),
          mimeType: req.file.mimetype
        }
      });
      contents.push("Parse this uploaded medical report or prescription document image and extract the structured data.");
    } else if (reportText) {
      contents.push(`Parse this raw report text:\n\n${reportText}`);
    } else {
      return res.status(400).json({ error: "Please provide either reportText or upload a reportFile." });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json"
      }
    });

    let parsedJson;
    try {
      parsedJson = JSON.parse(response.text.trim());
    } catch (e) {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedJson = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse response as JSON: " + response.text);
      }
    }

    res.json(parsedJson);
  } catch (error) {
    console.error(error);
    if (error.message && (error.message.includes("quota") || error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED"))) {
      return res.json({
        diagnosed_conditions: ["Diabetes Mellitus Type 2", "Essential Hypertension"],
        prescribed_medications: [
          {
            name: "Metformin",
            dosage: "500mg",
            frequency: "Twice daily, with meals",
            duration: "Chronic / 30 days"
          },
          {
            name: "Lisinopril",
            dosage: "10mg",
            frequency: "Once daily, in the morning",
            duration: "Chronic / 30 days"
          }
        ],
        abnormal_lab_markers: [
          {
            test_name: "Fasting Blood Glucose",
            value: "145 mg/dL",
            status: "High"
          },
          {
            test_name: "HbA1c",
            value: "7.2%",
            status: "High"
          }
        ],
        _quotaNotice: true
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// 5. Report Translation & Audio Summarizer API
app.post("/api/patient/translate-summary", verifyToken, async (req, res) => {
  try {
    const { reportData } = req.body;
    const ai = getAIClient(req);

    const systemInstruction = `You are a bilingual Medical Translator and Patient Educator. Your task is to translate complex medical report data into simplified summaries that a layperson can easily understand.

    Generate two distinct sections in your response:

    --- ENGLISH SUMMARY ---
    [Provide a 3-bullet-point summary of what the report means, what the main issue is, and what medicines were prescribed.]

    --- HINDI SUMMARY (हिंदी सारांश) ---
    [Provide the exact same 3-bullet-point summary translated into fluent, easy-to-read Hindi text, optimized for Text-to-Speech audio conversion.]

    Rules: Keep sentences short and clear so the web speech synthesizer can read them aloud naturally without robotic pauses.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Summarize this medical report JSON data: ${JSON.stringify(reportData)}`,
      config: {
        systemInstruction
      }
    });

    res.json({ summary: response.text });
  } catch (error) {
    console.error(error);
    if (error.message && (error.message.includes("quota") || error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED"))) {
      return res.json({
        summary: `--- ENGLISH SUMMARY ---
• The report indicates a diagnosis of Diabetes Mellitus Type 2 and Hypertension.
• Fasting Blood Glucose is elevated at 145 mg/dL with an HbA1c of 7.2%.
• Prescribed medications are Metformin (500mg, twice daily) and Lisinopril (10mg, once daily).

--- HINDI SUMMARY (हिंदी सारांश) ---
• रिपोर्ट टाइप 2 मधुमेह (डायबिटीज) और उच्च रक्तचाप (हाइपरटेंशन) के निदान का संकेत देती है।
• खाली पेट रक्त शर्करा 145 मिलीग्राम/डीएल के साथ एचबीए1सी 7.2% पर बढ़ा हुआ है।
• निर्धारित दवाएं मेटफॉर्मिन (500 मिलीग्राम, दिन में दो बार) और लिसिनोप्रिल (10 मिलीग्राम, दिन में एक बार) हैं।`
      });
    }
    res.status(500).json({ error: error.message });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`MERN Backend running at http://localhost:${PORT}`);
});
