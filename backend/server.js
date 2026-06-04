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

import Patient from "./models/Patient.js";
import Chat from "./models/Chat.js";
import User from "./models/User.js";
import Consultation from "./models/Consultation.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "ai_doctor_secret_jwt_key_2026";

app.use(cors());
app.use(express.json());

// Setup Multer for image file uploads (OCR scanning)
const storage = multer.memoryStorage();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbJsonPath = path.join(__dirname, "data", "db.json");

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
      sugarTrend: "Uncontrolled (High)",
      sugarTrendClass: "trend-up"
    },
    reportSummary: "Patient reports mild shortness of breath and peripheral edema. Current lab results: serum creatinine 1.8 mg/dL (estimated GFR 38 mL/min/1.73m², reflecting Moderate CKD), HbA1c 8.2% (uncontrolled diabetes), and microalbuminuria. Currently taking Metformin 1000mg BID and Lisinopril 20mg QD. Scheduled for an elective contrast-enhanced CT scan next Tuesday."
  },
  {
    name: "Priya Patel",
    age: 34,
    gender: "Female",
    bloodGroup: "B+",
    riskBadge: "Medium Risk",
    riskClass: "risk-medium",
    vitals: {
      labels: ["May 30", "May 31", "Jun 1", "Jun 2", "Jun 3"],
      bpSystolic: [115, 120, 118, 122, 119],
      bpDiastolic: [75, 78, 76, 80, 77],
      sugar: [90, 95, 88, 92, 89]
    },
    latestVitals: {
      bp: "119/77",
      bpTrend: "Normal",
      bpTrendClass: "trend-down",
      sugar: 89,
      sugarTrend: "Normal (Fasting)",
      sugarTrendClass: "trend-down"
    },
    reportSummary: "Patient complains of rapid heart rate, heat intolerance, and fine hand tremors for 2 weeks. Normal renal and hepatic clearance. Blood labs show: TSH < 0.1 mIU/L (low/suppressed), Free T4 2.8 ng/dL (elevated). Currently taking no regular medications. Clinician suspects Acute Thyroiditis or early Graves' disease."
  },
  {
    name: "Kabir Kapoor",
    age: 9,
    gender: "Male",
    bloodGroup: "A-",
    riskBadge: "Low Risk",
    riskClass: "risk-low",
    vitals: {
      labels: ["May 30", "May 31", "Jun 1", "Jun 2", "Jun 3"],
      bpSystolic: [98, 100, 95, 102, 97],
      bpDiastolic: [60, 62, 58, 64, 61],
      sugar: [85, 90, 88, 92, 87]
    },
    latestVitals: {
      bp: "97/61",
      bpTrend: "Normal (Pediatric)",
      bpTrendClass: "trend-down",
      sugar: 87,
      sugarTrend: "Normal",
      sugarTrendClass: "trend-down"
    },
    reportSummary: "Bilateral tympanic membranes erythematous and bulging with purulent fluid. Diagnosed with acute suppurative otitis media. Weight 28 kg. No known drug allergies. Active kid, normal pediatric history."
  }
];

// Fallback Database Handlers
let dbFallback = false;

function ensureFallbackFile() {
  const dir = path.dirname(dbJsonPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(dbJsonPath)) {
    const initialData = {
      patients: SEED_PATIENTS.map((p, index) => ({
        _id: `fallback-pat-${index + 1}`,
        ...p,
        createdAt: new Date().toISOString()
      })),
      chats: [],
      users: [],
      consultations: []
    };
    fs.writeFileSync(dbJsonPath, JSON.stringify(initialData, null, 2), "utf-8");
  }
}

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/aidoctor";
mongoose.connect(mongoUri)
  .then(async () => {
    console.log("MongoDB database connected successfully.");
    
    // Drop conflicting legacy indexes on users collection if they exist (e.g. username_1)
    try {
      await mongoose.connection.db.collection("users").dropIndexes();
      console.log("Cleaned up legacy database indexes successfully.");
    } catch (e) {
      // Will fail silently if users collection doesn't exist yet, which is fine
    }

    // Seed MongoDB if empty
    const count = await Patient.countDocuments();
    if (count === 0) {
      console.log("Seeding patient collection in MongoDB...");
      await Patient.insertMany(SEED_PATIENTS);
    }
  })
  .catch((err) => {
    console.warn("⚠️ MongoDB Connection Failed. Enabling JSON File Database Fallback.");
    dbFallback = true;
    ensureFallbackFile();
  });

// Database Repository abstraction (Extended for Auth & Consultations)
const DB = {
  // Users
  async findUserByEmail(email) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      if (!data.users) data.users = [];
      return data.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
    }
    return await User.findOne({ email: email.toLowerCase() });
  },

  async addUser(userData) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      if (!data.users) data.users = [];
      const newU = {
        _id: `fallback-user-${Date.now()}`,
        ...userData,
        email: userData.email.toLowerCase(),
        createdAt: new Date().toISOString()
      };
      data.users.push(newU);
      fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      return newU;
    }
    const newU = new User(userData);
    return await newU.save();
  },

  async getDoctors() {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      if (!data.users) data.users = [];
      return data.users.filter(u => u.role === "doctor");
    }
    return await User.find({ role: "doctor" }).select("-password");
  },

  // Patients
  async getPatients() {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      return data.patients;
    }
    return await Patient.find().sort({ createdAt: -1 });
  },

  async addPatient(patientData) {
    const bpSystolic = patientData.vitals?.bpSystolic || [120];
    const sugar = patientData.vitals?.sugar || [90];
    const lastBp = bpSystolic[bpSystolic.length - 1];
    const lastSugar = sugar[sugar.length - 1];
    
    let riskBadge = "Low Risk";
    let riskClass = "risk-low";
    let bpTrend = "Normal";
    let bpTrendClass = "trend-down";
    let sugarTrend = "Normal";
    let sugarTrendClass = "trend-down";

    if (lastBp >= 140 || lastSugar >= 180) {
      riskBadge = "High Risk";
      riskClass = "risk-high";
    } else if (lastBp >= 130 || lastSugar >= 120) {
      riskBadge = "Medium Risk";
      riskClass = "risk-medium";
    }

    if (lastBp >= 130) { bpTrend = "Elevated"; bpTrendClass = "trend-up"; }
    if (lastSugar >= 120) { sugarTrend = "High"; sugarTrendClass = "trend-up"; }

    const cleanData = {
      ...patientData,
      riskBadge,
      riskClass,
      latestVitals: {
        bp: `${lastBp}/${patientData.vitals?.bpDiastolic?.[0] || 80}`,
        bpTrend,
        bpTrendClass,
        sugar: lastSugar,
        sugarTrend,
        sugarTrendClass
      }
    };

    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const newPatient = {
        _id: `fallback-pat-${Date.now()}`,
        ...cleanData,
        createdAt: new Date().toISOString()
      };
      data.patients.push(newPatient);
      fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      return newPatient;
    }
    const newPat = new Patient(cleanData);
    return await newPat.save();
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
      content: message.content
    });
    await chat.save();
    return chat.messages;
  },

  // Consultations
  async getPatientConsultations(patientId) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      if (!data.consultations) data.consultations = [];
      return data.consultations.filter(c => c.patientId === patientId);
    }
    return await Consultation.find({ patientId });
  },

  async getDoctorConsultations(doctorId) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      if (!data.consultations) data.consultations = [];
      return data.consultations.filter(c => c.doctorId === doctorId);
    }
    return await Consultation.find({ doctorId });
  },

  async requestConsultation(patientId, patientName, doctorId, doctorName) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      if (!data.consultations) data.consultations = [];
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

  async addConsultationMessage(chatId, senderId, senderName, content) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      const consult = data.consultations.find(c => c._id === chatId);
      if (consult) {
        consult.messages.push({
          senderId,
          senderName,
          content,
          timestamp: new Date().toISOString()
        });
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
      }
      return consult;
    }
    const consult = await Consultation.findById(chatId);
    if (consult) {
      consult.messages.push({ senderId, senderName, content });
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

  async updateUser(userId, updatedDetails) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      if (!data.users) data.users = [];
      const userIndex = data.users.findIndex(u => u._id === userId);
      if (userIndex !== -1) {
        data.users[userIndex] = { ...data.users[userIndex], ...updatedDetails };
        fs.writeFileSync(dbJsonPath, JSON.stringify(data, null, 2), "utf-8");
        return data.users[userIndex];
      }
      return null;
    }
    return await User.findByIdAndUpdate(userId, { $set: updatedDetails }, { new: true });
  },

  async updatePatientByUserId(userId, patientName, updatedData) {
    if (dbFallback) {
      const data = JSON.parse(fs.readFileSync(dbJsonPath, "utf-8"));
      if (!data.patients) data.patients = [];
      
      // Try finding by userId first
      let pat = data.patients.find(p => p.userId === userId);
      // Fallback: try by name (case-insensitive)
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
        
        // Handle vitals updating
        if (updatedData.bpSystolic !== undefined && updatedData.bpDiastolic !== undefined && updatedData.sugar !== undefined) {
          if (!pat.vitals) {
            pat.vitals = { labels: ["Initial Log"], bpSystolic: [], bpDiastolic: [], sugar: [] };
          }
          if (!pat.vitals.bpSystolic) pat.vitals.bpSystolic = [];
          if (!pat.vitals.bpDiastolic) pat.vitals.bpDiastolic = [];
          if (!pat.vitals.sugar) pat.vitals.sugar = [];
          
          if (pat.vitals.bpSystolic.length > 0) {
            // Update last element
            const idx = pat.vitals.bpSystolic.length - 1;
            pat.vitals.bpSystolic[idx] = updatedData.bpSystolic;
            pat.vitals.bpDiastolic[idx] = updatedData.bpDiastolic;
            pat.vitals.sugar[idx] = updatedData.sugar;
          } else {
            pat.vitals.bpSystolic.push(updatedData.bpSystolic);
            pat.vitals.bpDiastolic.push(updatedData.bpDiastolic);
            pat.vitals.sugar.push(updatedData.sugar);
          }
          
          // Re-calculate latestVitals and riskBadge
          const lastBpSys = updatedData.bpSystolic;
          const lastBpDia = updatedData.bpDiastolic;
          const lastSugar = updatedData.sugar;
          
          pat.latestVitals = {
            bp: `${lastBpSys}/${lastBpDia}`,
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
    
    // Try finding by userId first
    let pat = await Patient.findOne({ userId });
    // Fallback: try by name (case-insensitive)
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
        const lastBpDia = updatedData.bpDiastolic;
        const lastSugar = updatedData.sugar;
        
        pat.latestVitals = {
          bp: `${lastBpSys}/${lastBpDia}`,
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

// Register Route
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "Please enter all registration details." });
    }

    const existing = await DB.findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "User already registered with this email." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Map role-specific details directly into schema values
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

    // If registering a patient, automatically create a patient profile in the vitals directory!
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
      { id: user._id, role: user.role },
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
      { id: user._id, role: user.role },
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

// Update Profile Route
app.put("/api/auth/profile", async (req, res) => {
  try {
    const { userId, name, role } = req.body;
    if (!userId || !name || !role) {
      return res.status(400).json({ error: "Missing required profile parameters." });
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

    // Sync with Clinical Patient profile if patient
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
   REST Consultation Routing Endpoints
   ========================================================================== */

// GET List of registered doctors
app.get("/api/doctors", async (req, res) => {
  try {
    const list = await DB.getDoctors();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Consultations for patient
app.get("/api/consultations/patient/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;
    const list = await DB.getPatientConsultations(patientId);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Consultations for doctor
app.get("/api/consultations/doctor/:doctorId", async (req, res) => {
  try {
    const { doctorId } = req.params;
    const list = await DB.getDoctorConsultations(doctorId);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Initiate Consultation Request
app.post("/api/consultations/request", async (req, res) => {
  try {
    const { patientId, patientName, doctorId, doctorName } = req.body;
    if (!patientId || !patientName || !doctorId || !doctorName) {
      return res.status(400).json({ error: "Missing required consultation parameters." });
    }
    const consult = await DB.requestConsultation(patientId, patientName, doctorId, doctorName);
    res.json(consult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Add message to consultation
app.post("/api/consultations/:chatId/message", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { senderId, senderName, content } = req.body;
    if (!senderId || !senderName || !content) {
      return res.status(400).json({ error: "Missing sender details or message content." });
    }
    const updated = await DB.addConsultationMessage(chatId, senderId, senderName, content);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Accept consultation
app.post("/api/consultations/:chatId/accept", async (req, res) => {
  try {
    const { chatId } = req.params;
    const updated = await DB.acceptConsultation(chatId);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ==========================================================================
   REST API Medical Workspace Endpoints
   ========================================================================== */

// DB Status Endpoint
app.get("/api/db-status", (req, res) => {
  res.json({
    fallbackMode: dbFallback,
    connectedDatabase: dbFallback ? "JSON File Database Fallback" : "MongoDB (Mongoose)"
  });
});

// GET Patient list
app.get("/api/patients", async (req, res) => {
  try {
    const list = await DB.getPatients();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Add new patient
app.post("/api/patients", async (req, res) => {
  try {
    const newPatient = await DB.addPatient(req.body);
    res.json(newPatient);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Single Patient by User ID
app.get("/api/patients/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
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

// POST Add Vitals Log Entry (With Month Labels)
app.post("/api/patients/:userId/vitals", async (req, res) => {
  try {
    const { userId } = req.params;
    const { label, bpSystolic, bpDiastolic, sugar } = req.body;
    if (!label || !bpSystolic || !bpDiastolic || !sugar) {
      return res.status(400).json({ error: "Missing required vitals parameters." });
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

        // Update latest values
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

// GET Chat history (AI Chat logs)
app.get("/api/chats/:portal/:sessionId", async (req, res) => {
  try {
    const { portal, sessionId } = req.params;
    const history = await DB.getChat(portal, sessionId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Chat message (AI Chat logs)
app.post("/api/chats/:portal/:sessionId", async (req, res) => {
  try {
    const { portal, sessionId } = req.params;
    const { message } = req.body;
    const updatedMessages = await DB.saveChatMessage(portal, sessionId, message);
    res.json(updatedMessages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1. Doctor Research Assistant Chatbot API
app.post("/api/doctor/chat", async (req, res) => {
  try {
    const { messages, context } = req.body;
    const ai = getAIClient(req);

    let systemInstruction = `You are an advanced Clinical Research and Pharmacological AI Assistant. Your user is a certified medical professional. 

Guidelines:
1. Provide highly technical, evidence-based medical information, including drug mechanisms, precise dosages, and contraindications.
2. Maintain a professional, peer-to-peer medical tone. Do not use over-simplistic language.
3. Cite standard medical guidelines or clinical trials where applicable.
4. If a query lacks critical patient context (e.g., kidney function, age), explicitly remind the doctor to consider those variables.`;

    if (context) {
      systemInstruction += `\n\nCURRENT PATIENT CONTEXT (Keep these in mind for any patient-specific queries, and warn if treatments conflict):
- Age Group: ${context.ageGroup || "Not specified"}
- Renal/Kidney Function: ${context.kidneyFunction || "Not specified"}
- Liver Function: ${context.liverFunction || "Not specified"}
- Other Medications: ${context.otherMeds || "None reported"}`;
    }

    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

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
    res.status(500).json({ error: error.message });
  }
});

// 2. Doctor Patient Risk Insights API
app.post("/api/doctor/analyze-patient", async (req, res) => {
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
app.post("/api/patient/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    const ai = getAIClient(req);

    const systemInstruction = `You are a empathetic, accessible AI Triage and Health Information Assistant. Your user is a patient seeking clarity on health topics.

Guidelines:
1. Use clear, compassionate, and non-technical language. Avoid complex medical jargon.
2. For symptom checking, use a triage approach: categorize symptoms into Low (home care), Medium (visit a clinic), or High (go to the Emergency Room).
3. MANDATORY DISCLAIMER: End every single response with a clear statement that you are an AI, not a doctor, and this information does not replace professional medical advice.
4. Never prescribe specific medication dosages or tell a patient to alter their current prescription.`;

    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

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
    res.status(500).json({ error: error.message });
  }
});

// 4. Report Data Extraction (OCR Post-Processor) API
app.post("/api/patient/parse-report", upload.single("reportFile"), async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

// 5. Report Translation & Audio Summarizer API
app.post("/api/patient/translate-summary", async (req, res) => {
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
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`MERN Backend running at http://localhost:${PORT}`);
});
