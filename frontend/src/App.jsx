import React, { useState, useEffect, useRef } from "react";
import "./App.css";

// Basic markdown-to-HTML formatter
function formatMarkdown(text) {
  if (!text) return "";
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^#### (.*?)$/gm, "<h4>$1</h4>")
    .replace(/^### (.*?)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*?)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*?)$/gm, "<h1>$1</h1>")
    .replace(/^\s*-\s+(.*?)$/gm, "<li>$1</li>")
    .replace(/^\s*\*\s+(.*?)$/gm, "<li>$1</li>");
  
  formatted = formatted.replace(/(<li>.*?<\/li>)+/gs, "<ul>$&</ul>");
  formatted = formatted.replace(/\n/g, "<br>");
  return formatted;
}

export default function App() {
  // User Session Authentication States
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("ai_doctor_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [authMode, setAuthMode] = useState("login"); // login, register
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "patient",
    specialty: "",
    experience: "",
    licenseNumber: "",
    hospital: "",
    age: "",
    gender: "Male",
    bloodGroup: "O+",
    medicalHistory: "",
    bpSystolic: "120",
    bpDiastolic: "80",
    sugar: "90"
  });
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Settings & DB API state
  const [apiKey, setApiKey] = useState(sessionStorage.getItem("gemini_api_key") || "");
  const [dbStatus, setDbStatus] = useState({ fallbackMode: false, connectedDatabase: "Connecting..." });
  
  // Dashboard Tabs (Role-specific)
  const [doctorTab, setDoctorTab] = useState("vitals"); // vitals, directChats
  const [patientTab, setPatientTab] = useState("triage"); // triage, consultations

  // Doctor: Patient Vitals states
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [riskAssessment, setRiskAssessment] = useState("");
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const [showRiskPanel, setShowRiskPanel] = useState(false);
  
  // Doctor new patient form
  const [showNewPatForm, setShowNewPatForm] = useState(false);
  const [newPatient, setNewPatient] = useState({
    name: "",
    age: "",
    gender: "Male",
    bloodGroup: "O+",
    bpSystolic: "120",
    bpDiastolic: "80",
    sugar: "90",
    reportSummary: ""
  });

  // Doctor AI Chat states
  const [doctorChat, setDoctorChat] = useState([]);
  const [docChatInput, setDocChatInput] = useState("");
  const [isDocChatLoading, setIsDocChatLoading] = useState(false);
  const [showDocContext, setShowDocContext] = useState(false);
  const [docContext, setDocContext] = useState({
    ageGroup: "Adult",
    kidneyFunction: "Normal",
    otherMeds: ""
  });

  // Doctor: Direct Consultations & Notifications
  const [doctorConsults, setDoctorConsults] = useState([]);
  const [selectedDocConsult, setSelectedDocConsult] = useState(null);
  const [docConsultInput, setDocConsultInput] = useState("");
  const [isDocConsultLoading, setIsDocConsultLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Patient: AI Triage states
  const [patientChat, setPatientChat] = useState([]);
  const [patChatInput, setPatChatInput] = useState("");
  const [isPatChatLoading, setIsPatChatLoading] = useState(false);
  const [triageStatus, setTriageStatus] = useState({ text: "Ready", className: "risk-low" });

  // Patient: Direct Consults with Doctors
  const [doctorDirectory, setDoctorDirectory] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [patientConsults, setPatientConsults] = useState([]);
  const [activeConsultation, setActiveConsultation] = useState(null);
  const [patConsultInput, setPatConsultInput] = useState("");
  const [isPatConsultLoading, setIsPatConsultLoading] = useState(false);

  // OCR Document Parser states
  const [ocrTab, setOcrTab] = useState("image"); // image, text
  const [ocrText, setOcrText] = useState("");
  const [ocrFile, setOcrFile] = useState(null);
  const [ocrFileName, setOcrFileName] = useState("");
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [parsedReport, setParsedReport] = useState(null);

  // Translation & Speech states
  const [isTransLoading, setIsTransLoading] = useState(false);
  const [englishSummary, setEnglishSummary] = useState("");
  const [hindiSummary, setHindiSummary] = useState("");
  const [transTab, setTransTab] = useState("english"); // english, hindi
  const [speechState, setSpeechState] = useState({ playing: false, text: "", lang: "" });
  const [ttsRate, setTtsRate] = useState(1.0);
  
  // Settings Modal states
  const [showSettings, setShowSettings] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey);

  // Toasts
  const [toasts, setToasts] = useState([]);

  // Edit Profile Modal states
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editProfileForm, setEditProfileForm] = useState({
    name: "",
    specialty: "",
    experience: "",
    licenseNumber: "",
    hospital: "",
    age: "",
    gender: "Male",
    bloodGroup: "O+",
    medicalHistory: "",
    bpSystolic: "",
    bpDiastolic: "",
    sugar: ""
  });
  const [isProfileUpdating, setIsProfileUpdating] = useState(false);
  
  // Patient Vitals Tracking states
  const [patientProfile, setPatientProfile] = useState(null);
  const [vitalsForm, setVitalsForm] = useState({
    label: "",
    bpSystolic: "120",
    bpDiastolic: "80",
    sugar: "90"
  });
  const [isVitalsLogging, setIsVitalsLogging] = useState(false);

  // Refs for Patient Vitals chart
  const patientCanvasRef = useRef(null);
  const patientChartInstanceRef = useRef(null);

  // Refs
  const docChatEndRef = useRef(null);
  const patChatEndRef = useRef(null);
  const docConsultEndRef = useRef(null);
  const patConsultEndRef = useRef(null);
  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  // Trigger Toasts Helper
  const triggerToast = (msg, type = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // 1. Initial Load: DB Status and Patient list (for Doctors) or Doctor Directory (for Patients)
  useEffect(() => {
    fetchDbStatus();
    if (user) {
      if (user.role === "doctor") {
        fetchPatients();
        fetchDoctorConsultations();
      } else if (user.role === "patient") {
        fetchDoctorDirectory();
        fetchPatientConsultations();
        fetchPatientProfile(user.id);
      }
    }
  }, [user]);

  // LIVE POLLING LOOP: Poll the database every 5 seconds for incoming messages & consultation requests
  useEffect(() => {
    if (!user) return;
    
    const pollInterval = setInterval(async () => {
      if (user.role === "doctor") {
        try {
          const res = await fetch(`/api/consultations/doctor/${user.id}`);
          const list = await res.json();
          
          // Check if list count or messages changed
          if (JSON.stringify(list) !== JSON.stringify(doctorConsults)) {
            setDoctorConsults(list);
          }
          
          // If a consultation is active, keep messages updated
          if (selectedDocConsult) {
            const updated = list.find(c => c._id === selectedDocConsult._id);
            if (updated && JSON.stringify(updated.messages) !== JSON.stringify(selectedDocConsult.messages)) {
              setSelectedDocConsult(updated);
            }
          }
        } catch (err) {
          console.warn("Polling error:", err);
        }
      } else if (user.role === "patient") {
        try {
          const res = await fetch(`/api/consultations/patient/${user.id}`);
          const list = await res.json();
          
          if (JSON.stringify(list) !== JSON.stringify(patientConsults)) {
            setPatientConsults(list);
          }
          
          // Keep active consultation details updated
          if (selectedDoctor) {
            const active = list.find(c => c.doctorId === selectedDoctor._id);
            if (active && (!activeConsultation || JSON.stringify(active.messages) !== JSON.stringify(activeConsultation.messages))) {
              setActiveConsultation(active);
            }
          }
        } catch (err) {
          console.warn("Polling error:", err);
        }
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [user, doctorConsults, patientConsults, selectedDocConsult, selectedDoctor, activeConsultation]);

  const fetchDbStatus = async () => {
    try {
      const res = await fetch("/api/db-status");
      const data = await res.json();
      setDbStatus(data);
    } catch (e) {
      setDbStatus({ fallbackMode: true, connectedDatabase: "Offline (JSON Backup Active)" });
    }
  };

  // Doctor side loaders
  const fetchPatients = async (selectFirst = false) => {
    try {
      const res = await fetch("/api/patients");
      const list = await res.json();
      setPatients(list);
      if (selectFirst && list.length > 0) {
        handlePatientSelect(list[0]);
      }
    } catch (e) {
      triggerToast("Error fetching patient profiles", "error");
    }
  };

  const fetchDoctorConsultations = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/consultations/doctor/${user.id}`);
      const list = await res.json();
      setDoctorConsults(list);
    } catch (e) {
      console.error(e);
    }
  };

  // Patient side loaders
  const fetchDoctorDirectory = async () => {
    try {
      const res = await fetch("/api/doctors");
      const list = await res.json();
      setDoctorDirectory(list);
    } catch (e) {
      triggerToast("Error fetching doctors directory", "error");
    }
  };

  const fetchPatientConsultations = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/consultations/patient/${user.id}`);
      const list = await res.json();
      setPatientConsults(list);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPatientProfile = async (userId) => {
    try {
      const res = await fetch(`/api/patients/user/${userId}`);
      const data = await res.json();
      if (res.ok) {
        setPatientProfile(data);
      }
    } catch (e) {
      console.error("Error fetching patient clinical profile", e);
    }
  };

  const handleLogVitalsSubmit = async (e) => {
    e.preventDefault();
    if (!user || !vitalsForm.label) return;
    setIsVitalsLogging(true);

    try {
      const res = await fetch(`/api/patients/${user.id}/vitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vitalsForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log vitals entry.");

      setPatientProfile(data);
      triggerToast("Monthly vitals entry logged successfully!", "success");
      setVitalsForm({
        label: "",
        bpSystolic: "120",
        bpDiastolic: "80",
        sugar: "90"
      });
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsVitalsLogging(false);
    }
  };

  // Refreshes a selected consultation details
  const refreshActiveConsultation = async (chatId) => {
    try {
      if (user.role === "doctor") {
        const res = await fetch(`/api/consultations/doctor/${user.id}`);
        const list = await res.json();
        setDoctorConsults(list);
        const active = list.find(c => c._id === chatId);
        if (active) setSelectedDocConsult(active);
      } else {
        const res = await fetch(`/api/consultations/patient/${user.id}`);
        const list = await res.json();
        setPatientConsults(list);
        const active = list.find(c => c._id === chatId);
        if (active) setActiveConsultation(active);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Re-create icons when UI updates
  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  // Scroll Chats to End
  useEffect(() => {
    docChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [doctorChat]);

  useEffect(() => {
    patChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [patientChat]);

  useEffect(() => {
    docConsultEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedDocConsult?.messages]);

  useEffect(() => {
    patConsultEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConsultation?.messages]);

  // Load Patient Chats when selected (Doctor Hub)
  useEffect(() => {
    if (user && user.role === "doctor" && selectedPatient && doctorTab === "vitals") {
      fetchChatHistory("doctor", selectedPatient._id);
    }
  }, [selectedPatient, doctorTab]);

  // Load Patient Triage Chat based on Logged-in Patient Email (Patient Hub)
  useEffect(() => {
    if (user && user.role === "patient" && patientTab === "triage") {
      fetchChatHistory("patient", user.email);
    }
  }, [user, patientTab]);

  const fetchChatHistory = async (portal, sessionId) => {
    try {
      const res = await fetch(`/api/chats/${portal}/${sessionId}`);
      const history = await res.json();
      if (portal === "doctor") {
        setDoctorChat(history);
      } else {
        setPatientChat(history);
        if (history.length > 0) {
          const lastAssistantMsg = [...history].reverse().find(m => m.role === "assistant");
          const lastUserMsg = [...history].reverse().find(m => m.role === "user");
          if (lastAssistantMsg) {
            updateTriageBadge(lastUserMsg?.content || "", lastAssistantMsg.content);
          }
        }
      }
    } catch (e) {
      console.error("Error loading chat history", e);
    }
  };

  // 2. Chart.js Render Engine via Effect
  useEffect(() => {
    if (user && user.role === "doctor" && selectedPatient && canvasRef.current && doctorTab === "vitals") {
      renderVitalsChart(selectedPatient);
    }
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [selectedPatient, user, doctorTab]);

  // Patient Chart Render Engine
  useEffect(() => {
    if (user && user.role === "patient" && patientProfile && patientCanvasRef.current && showEditProfile) {
      renderPatientVitalsChart(patientProfile);
    }
    return () => {
      if (patientChartInstanceRef.current) {
        patientChartInstanceRef.current.destroy();
        patientChartInstanceRef.current = null;
      }
    };
  }, [patientProfile, user, showEditProfile]);

  const renderPatientVitalsChart = (patient) => {
    if (patientChartInstanceRef.current) {
      patientChartInstanceRef.current.destroy();
    }

    const ctx = patientCanvasRef.current.getContext("2d");
    patientChartInstanceRef.current = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: patient.vitals?.labels || [],
        datasets: [
          {
            label: "Systolic BP",
            data: patient.vitals?.bpSystolic || [],
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.05)",
            borderWidth: 3,
            tension: 0.35,
            fill: true,
            yAxisID: "y-bp"
          },
          {
            label: "Blood Sugar",
            data: patient.vitals?.sugar || [],
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.05)",
            borderWidth: 3,
            tension: 0.35,
            fill: true,
            yAxisID: "y-sugar"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          "y-bp": {
            type: "linear",
            position: "left",
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: { color: "#94a3b8", font: { family: "Inter", size: 10 } },
            title: { display: true, text: "BP (mmHg)", color: "#10b981", font: { family: "Outfit", size: 10, weight: 600 } }
          },
          "y-sugar": {
            type: "linear",
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: { color: "#94a3b8", font: { family: "Inter", size: 10 } },
            title: { display: true, text: "Sugar (mg/dL)", color: "#f59e0b", font: { family: "Outfit", size: 10, weight: 600 } }
          },
          x: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: { color: "#94a3b8", font: { family: "Inter", size: 10 } }
          }
        }
      }
    });
  };

  const renderVitalsChart = (patient) => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = canvasRef.current.getContext("2d");
    chartInstanceRef.current = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: patient.vitals?.labels || [],
        datasets: [
          {
            label: "Systolic BP",
            data: patient.vitals?.bpSystolic || [],
            borderColor: "#00d2ff",
            backgroundColor: "rgba(0, 210, 255, 0.05)",
            borderWidth: 3,
            tension: 0.35,
            fill: true,
            yAxisID: "y-bp"
          },
          {
            label: "Blood Sugar",
            data: patient.vitals?.sugar || [],
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.05)",
            borderWidth: 3,
            tension: 0.35,
            fill: true,
            yAxisID: "y-sugar"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          "y-bp": {
            type: "linear",
            position: "left",
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: { color: "#94a3b8", font: { family: "Inter", size: 10 } },
            title: { display: true, text: "BP (mmHg)", color: "#00d2ff", font: { family: "Outfit", size: 10, weight: 600 } }
          },
          "y-sugar": {
            type: "linear",
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: { color: "#94a3b8", font: { family: "Inter", size: 10 } },
            title: { display: true, text: "Sugar (mg/dL)", color: "#f59e0b", font: { family: "Outfit", size: 10, weight: 600 } }
          },
          x: {
            grid: { color: "rgba(255, 255, 255, 0.04)" },
            ticks: { color: "#94a3b8", font: { family: "Inter", size: 10 } }
          }
        }
      }
    });
  };

  const handlePatientSelect = (patient) => {
    setSelectedPatient(patient);
    setShowRiskPanel(false);
    setRiskAssessment("");
    
    setDocContext({
      ageGroup: patient.age >= 65 ? "Geriatric" : (patient.age < 18 ? "Pediatric" : "Adult"),
      kidneyFunction: patient.name.includes("Aarav") ? "Moderate Impairment (eGFR 30-59)" : "Normal",
      otherMeds: patient.name.includes("Aarav") ? "Metformin, Lisinopril" : ""
    });
  };

  // Auth Operations
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!authForm.email || !authForm.password || (authMode === "register" && !authForm.name)) {
      triggerToast("Please fill in all details.", "error");
      return;
    }

    setIsAuthLoading(true);
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed.");

      setUser(data.user);
      localStorage.setItem("ai_doctor_user", JSON.stringify(data.user));
      localStorage.setItem("ai_doctor_token", data.token);
      triggerToast(`Welcome, ${data.user.name}!`, "success");
      
      // Reset forms
      setAuthForm({
        name: "",
        email: "",
        password: "",
        role: "patient",
        specialty: "",
        experience: "",
        licenseNumber: "",
        hospital: "",
        age: "",
        gender: "Male",
        bloodGroup: "O+",
        medicalHistory: "",
        bpSystolic: "120",
        bpDiastolic: "80",
        sugar: "90"
      });
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    stopSpeech();
    setUser(null);
    setSelectedPatient(null);
    setSelectedDoctor(null);
    setDoctorDirectory([]);
    setPatientConsults([]);
    setActiveConsultation(null);
    setPatients([]);
    setDoctorChat([]);
    setPatientChat([]);
    setDoctorConsults([]);
    setSelectedDocConsult(null);
    setParsedReport(null);
    setEnglishSummary("");
    setHindiSummary("");
    localStorage.removeItem("ai_doctor_user");
    localStorage.removeItem("ai_doctor_token");
    triggerToast("Logged out successfully.", "info");
  };

  // Settings Actions
  const handleSaveSettings = () => {
    setApiKey(tempApiKey);
    sessionStorage.setItem("gemini_api_key", tempApiKey);
    triggerToast("API Key configuration updated successfully.", "success");
    setShowSettings(false);
  };

  const handleClearSettings = () => {
    setTempApiKey("");
    setApiKey("");
    sessionStorage.removeItem("gemini_api_key");
    triggerToast("API Key cleared for this browser session.", "info");
  };

  const handleOpenEditProfile = () => {
    if (!user) return;
    setEditProfileForm({
      name: user.name || "",
      specialty: user.specialty || "",
      experience: user.experience || "",
      licenseNumber: user.licenseNumber || "",
      hospital: user.hospital || "",
      age: user.age || "",
      gender: user.gender || "Male",
      bloodGroup: user.bloodGroup || "O+",
      medicalHistory: user.medicalHistory || "",
      bpSystolic: user.bpSystolic || "",
      bpDiastolic: user.bpDiastolic || "",
      sugar: user.sugar || ""
    });
    setShowEditProfile(true);
  };

  const handleProfileUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setIsProfileUpdating(true);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          role: user.role,
          ...editProfileForm
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile.");

      // Update active user state and localStorage
      const updatedUser = { ...user, ...data.user };
      setUser(updatedUser);
      localStorage.setItem("ai_doctor_user", JSON.stringify(updatedUser));
      
      triggerToast("Profile updated successfully!", "success");
      setShowEditProfile(false);

      // If doctor is logged in, refresh patient listings (since names/etc. could change)
      if (user.role === "doctor") {
        fetchPatients();
      } else if (user.role === "patient") {
        fetchPatientProfile(user.id);
      }
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsProfileUpdating(false);
    }
  };

  // Add Patient Action (Doctor Vitals Sidebar)
  const handleAddPatient = async (e) => {
    e.preventDefault();
    if (!newPatient.name || !newPatient.age || !newPatient.sugar) {
      triggerToast("Please fill in patient demographics.", "error");
      return;
    }

    try {
      const patientData = {
        name: newPatient.name,
        age: parseInt(newPatient.age),
        gender: newPatient.gender,
        bloodGroup: newPatient.bloodGroup,
        vitals: {
          labels: ["Record 1"],
          bpSystolic: [parseInt(newPatient.bpSystolic)],
          bpDiastolic: [parseInt(newPatient.bpDiastolic)],
          sugar: [parseInt(newPatient.sugar)]
        },
        reportSummary: newPatient.reportSummary || "No report records registered."
      };

      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      triggerToast(`Added profile: ${data.name}`, "success");
      setShowNewPatForm(false);
      setNewPatient({
        name: "",
        age: "",
        gender: "Male",
        bloodGroup: "O+",
        bpSystolic: "120",
        bpDiastolic: "80",
        sugar: "90",
        reportSummary: ""
      });
      fetchPatients();
    } catch (err) {
      triggerToast(`Failed to add patient: ${err.message}`, "error");
    }
  };

  // RISK ASSESSMENT REQUEST
  const handleGenerateRisk = async () => {
    if (!selectedPatient) return;
    setShowRiskPanel(true);
    setIsRiskLoading(true);
    setRiskAssessment("");

    try {
      const patientData = {
        demographics: {
          name: selectedPatient.name,
          age: selectedPatient.age,
          gender: selectedPatient.gender,
          bloodGroup: selectedPatient.bloodGroup
        },
        rawReportSummary: selectedPatient.reportSummary,
        vitalsHistoryLog: {
          dates: selectedPatient.vitals.labels,
          bpSystolic: selectedPatient.vitals.bpSystolic,
          bpDiastolic: selectedPatient.vitals.bpDiastolic,
          sugar: selectedPatient.vitals.sugar
        }
      };

      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["x-api-key"] = apiKey;

      const res = await fetch("/api/doctor/analyze-patient", {
        method: "POST",
        headers,
        body: JSON.stringify({ patientData })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate risk assessment sheet.");

      setRiskAssessment(data.analysis);
    } catch (err) {
      triggerToast(err.message, "error");
      setRiskAssessment(`### Analysis Error\n\n${err.message}`);
    } finally {
      setIsRiskLoading(false);
    }
  };

  // DOCTOR PHARMACOLOGICAL CHAT SUBMIT
  const handleDocChatSubmit = async (e) => {
    e.preventDefault();
    const query = docChatInput.trim();
    if (!query) return;

    setDocChatInput("");
    const userMsg = { role: "user", content: query };
    
    let updatedHistory = [...doctorChat, userMsg];
    setDoctorChat(updatedHistory);
    
    try {
      await fetch(`/api/chats/doctor/${selectedPatient._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg })
      });
    } catch (err) {
      console.warn("Failed to persist message to db", err);
    }

    setIsDocChatLoading(true);

    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["x-api-key"] = apiKey;

      const res = await fetch("/api/doctor/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: updatedHistory,
          context: docContext
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const assistantMsg = { role: "assistant", content: data.reply };
      setDoctorChat(prev => [...prev, assistantMsg]);

      await fetch(`/api/chats/doctor/${selectedPatient._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: assistantMsg })
      });
    } catch (err) {
      triggerToast(err.message, "error");
      setDoctorChat(prev => [...prev, { role: "assistant", content: `**Connection Error:** ${err.message}` }]);
    } finally {
      setIsDocChatLoading(false);
    }
  };

  // PATIENT SYMPTOM TRIAGE CHAT SUBMIT (Keyed by Patient Email)
  const handlePatChatSubmit = async (e) => {
    e.preventDefault();
    const query = patChatInput.trim();
    if (!query) return;

    setPatChatInput("");
    const userMsg = { role: "user", content: query };
    
    let updatedHistory = [...patientChat, userMsg];
    setPatientChat(updatedHistory);

    try {
      await fetch(`/api/chats/patient/${user.email}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg })
      });
    } catch (err) {
      console.warn(err);
    }

    setIsPatChatLoading(true);

    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["x-api-key"] = apiKey;

      const res = await fetch("/api/patient/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: updatedHistory })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      updateTriageBadge(query, data.reply);

      const assistantMsg = { role: "assistant", content: data.reply };
      setPatientChat(prev => [...prev, assistantMsg]);

      await fetch(`/api/chats/patient/${user.email}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: assistantMsg })
      });
    } catch (err) {
      triggerToast(err.message, "error");
      setPatientChat(prev => [...prev, { role: "assistant", content: `**System Error:** ${err.message}. Please consult clinical support.` }]);
    } finally {
      setIsPatChatLoading(false);
    }
  };

  const updateTriageBadge = (userMsg, assistantMsg) => {
    const fullText = (userMsg + " " + assistantMsg).toLowerCase();
    let text = "Ready";
    let className = "risk-low";

    if (fullText.includes("emergency room") || fullText.includes("go to the emergency") || fullText.includes("go to the er") || fullText.includes("call 911") || fullText.includes("cardiac") || fullText.includes("high (go to the emergency")) {
      text = "Emergency (High)";
      className = "risk-high";
    } else if (fullText.includes("visit a clinic") || fullText.includes("consult a physician") || fullText.includes("medium (visit a clinic")) {
      text = "Clinic Visit (Medium)";
      className = "risk-medium";
    }

    setTriageStatus({ text, className });
  };

  // PATIENT DIRECT MESSAGE / CONSULT TO DOCTOR
  const handleSelectDoctor = (doctor) => {
    setSelectedDoctor(doctor);
    const consult = patientConsults.find(c => c.doctorId === doctor._id);
    if (consult) {
      setActiveConsultation(consult);
    } else {
      setActiveConsultation(null);
    }
  };

  const handleRequestConsultation = async () => {
    if (!selectedDoctor || !user) return;
    setIsPatConsultLoading(true);

    try {
      const res = await fetch("/api/consultations/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: user.id,
          patientName: user.name,
          doctorId: selectedDoctor._id,
          doctorName: selectedDoctor.name
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActiveConsultation(data);
      fetchPatientConsultations();
      triggerToast("Consultation request initialized successfully.", "success");
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsPatConsultLoading(false);
    }
  };

  const handlePatConsultMessageSubmit = async (e) => {
    e.preventDefault();
    const query = patConsultInput.trim();
    if (!query || !activeConsultation) return;

    setPatConsultInput("");
    setIsPatConsultLoading(true);

    try {
      const res = await fetch(`/api/consultations/${activeConsultation._id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: user.id,
          senderName: user.name,
          content: query
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActiveConsultation(data);
      refreshActiveConsultation(data._id);
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsPatConsultLoading(false);
    }
  };

  // DOCTOR DIRECT MESSAGE / CONSULT REPLY
  const handleDocConsultMessageSubmit = async (e) => {
    e.preventDefault();
    const query = docConsultInput.trim();
    if (!query || !selectedDocConsult) return;

    setDocConsultInput("");
    setIsDocConsultLoading(true);

    try {
      const res = await fetch(`/api/consultations/${selectedDocConsult._id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: user.id,
          senderName: user.name,
          content: query
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSelectedDocConsult(data);
      refreshActiveConsultation(data._id);
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsDocConsultLoading(false);
    }
  };

  const handleAcceptConsultation = async (chatId) => {
    try {
      const res = await fetch(`/api/consultations/${chatId}/accept`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSelectedDocConsult(data);
      fetchDoctorConsultations();
      triggerToast("Consultation request accepted.", "success");
    } catch (err) {
      triggerToast(err.message, "error");
    }
  };

  // DOCTOR HEADER NOTIFICATION SELECTION
  const handleSelectNotification = (req) => {
    setDoctorTab("directChats");
    setSelectedDocConsult(req);
    setShowNotifications(false);
    triggerToast(`Opened consultation for ${req.patientName}.`, "info");
  };

  // Derive Doctor Pending Requests list and count
  const pendingRequests = user && user.role === "doctor" ? doctorConsults.filter(c => c.status === "pending") : [];
  const pendingCount = pendingRequests.length;

  // OCR LAB REPORT PARSING
  const handleOcrFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setOcrFile(file);
      setOcrFileName(`Selected File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    } else {
      setOcrFile(null);
      setOcrFileName("");
    }
  };

  const handleOcrDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setOcrFile(files[0]);
      setOcrFileName(`Selected File: ${files[0].name} (${(files[0].size / 1024).toFixed(1)} KB)`);
    }
  };

  const handleReportParsing = async () => {
    if (ocrTab === "text" && !ocrText.trim()) {
      triggerToast("Please paste raw report text first.", "error");
      return;
    }
    if (ocrTab === "image" && !ocrFile) {
      triggerToast("Please select a lab report image file first.", "error");
      return;
    }

    setIsOcrLoading(true);
    setParsedReport(null);
    setEnglishSummary("");
    setHindiSummary("");

    try {
      const formData = new FormData();
      if (ocrTab === "image") {
        formData.append("reportFile", ocrFile);
      } else {
        formData.append("reportText", ocrText);
      }

      const headers = {};
      if (apiKey) headers["x-api-key"] = apiKey;

      const res = await fetch("/api/patient/parse-report", {
        method: "POST",
        headers,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process lab report.");

      setParsedReport(data);
      triggerToast("Structured report JSON generated successfully.", "success");
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsOcrLoading(false);
    }
  };

  // TRANSLATE AND GENERATE AUDIO SUMMARIES
  const handleReportTranslation = async () => {
    if (!parsedReport) return;

    setIsTransLoading(true);
    setEnglishSummary("");
    setHindiSummary("");

    setTimeout(() => {
      document.getElementById("translator-panel")?.scrollIntoView({ behavior: "smooth" });
    }, 100);

    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["x-api-key"] = apiKey;

      const res = await fetch("/api/patient/translate-summary", {
        method: "POST",
        headers,
        body: JSON.stringify({ reportData: parsedReport })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const text = data.summary;
      let eng = "";
      let hin = "";

      if (text.includes("--- HINDI SUMMARY") || text.includes("--- HINDI SUMMARY (हिंदी सारांश) ---")) {
        const parts = text.split(/--- HINDI SUMMARY.*?---/i);
        eng = parts[0].replace(/--- ENGLISH SUMMARY ---/gi, "").trim();
        hin = parts[1] ? parts[1].trim() : "";
      } else {
        const parts = text.split(/( हिंदी सारांश|HINDI SUMMARY)/i);
        eng = parts[0].trim();
        hin = parts[2] ? parts[2].trim() : "";
      }

      setEnglishSummary(eng || text);
      setHindiSummary(hin || "हिंदी सारांश उपलब्ध नहीं है।");
    } catch (err) {
      triggerToast(`Translation failed: ${err.message}`, "error");
    } finally {
      setIsTransLoading(false);
    }
  };

  // SPEECH SYNTHESIS ENGINE
  const speakText = (text, lang) => {
    stopSpeech();

    if (!window.speechSynthesis) {
      triggerToast("Your browser does not support Speech Synthesis.", "error");
      return;
    }

    const cleanText = text
      .replace(/[*\-#`\[\]\(\)]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = ttsRate;

    utterance.onstart = () => {
      setSpeechState({ playing: true, text, lang });
    };

    utterance.onend = () => {
      setSpeechState({ playing: false, text: "", lang: "" });
    };

    utterance.onerror = () => {
      setSpeechState({ playing: false, text: "", lang: "" });
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeech = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeechState({ playing: false, text: "", lang: "" });
  };

  const handleTtsRateChange = (e) => {
    const val = parseFloat(e.target.value);
    setTtsRate(val);
    if (speechState.playing) {
      const currentText = speechState.text;
      const currentLang = speechState.lang;
      stopSpeech();
      setTimeout(() => speakText(currentText, currentLang), 100);
    }
  };

  return (
    <div className="App">
      <div className="glow-bg glow-1"></div>
      <div className="glow-bg glow-2"></div>

      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          <div className="logo-icon"><i data-lucide="activity"></i></div>
          <div className="logo-text">
            <span className="logo-main">AI-DOCTOR</span>
            <span className="logo-sub">Clinical Network</span>
          </div>
        </div>

        <div className="header-actions" style={{ position: "relative" }}>
          {/* DB Connection Indicator */}
          <div className="conn-indicator" title={dbStatus.connectedDatabase}>
            <span className={`conn-dot ${dbStatus.fallbackMode ? 'conn-fallback' : 'conn-mongo'}`}></span>
            <span>{dbStatus.fallbackMode ? 'Local JSON DB' : 'MongoDB Connected'}</span>
          </div>

          {/* DOCTOR PENDING REQUESTS NOTIFICATION BELL */}
          {user && user.role === "doctor" && (
            <div>
              <button 
                className={`btn-notification ${pendingCount > 0 ? 'bell-active' : ''}`} 
                onClick={() => setShowNotifications(!showNotifications)}
                title="Incoming Consultation Requests"
              >
                <i data-lucide="bell"></i>
                {pendingCount > 0 && <span className="notification-badge">{pendingCount}</span>}
              </button>
              
              {showNotifications && (
                <div className="notification-dropdown">
                  <div className="notification-header">Incoming Consultation Requests</div>
                  <div className="notification-list">
                    {pendingRequests.length > 0 ? (
                      pendingRequests.map(req => (
                        <div 
                          key={req._id} 
                          className="notification-item" 
                          onClick={() => handleSelectNotification(req)}
                        >
                          <div className="notification-item-title">{req.patientName}</div>
                          <div className="notification-item-desc">Is requesting a consultation...</div>
                        </div>
                      ))
                    ) : (
                      <div className="notification-empty">No pending requests</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {user && (
            <div className="conn-indicator">
              <span style={{ fontWeight: 600, color: "white" }}>{user.name}</span>
              <span className={`badge ${user.role === 'doctor' ? 'badge-doctor' : 'badge-patient'}`} style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem", marginLeft: "6px" }}>
                {user.role}
              </span>
            </div>
          )}

          {user && (
            <button className="btn btn-secondary" onClick={handleOpenEditProfile}>
              <i data-lucide="user"></i>
              <span>Edit Profile</span>
            </button>
          )}

          <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>
            <i data-lucide="settings"></i>
            <span>API Settings</span>
          </button>

          {user && (
            <button className="btn btn-primary" onClick={handleSignOut}>
              <i data-lucide="log-out"></i>
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </header>

      {/* Toast alerts container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <i data-lucide={t.type === "error" ? "alert-circle" : (t.type === "info" ? "info" : "check-circle")}></i>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      <main className="app-main">
        {/* =========================================
            AUTH GATEWAY (WITH EXTENDED PROFILE INPUTS)
            ========================================= */}
        {!user ? (
          <section style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1, padding: "1rem 0" }}>
            <div className="card" style={{ width: "520px", maxWidth: "90%", padding: "2.5rem 2rem", boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
              <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                <h1 style={{ fontFamily: "var(--font-family-display)", fontSize: "2rem", fontWeight: 800, marginBottom: "0.5rem", background: "linear-gradient(135deg, #fff, var(--color-doctor-primary))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  {authMode === "login" ? "Sign In Portal" : "Register Workspace"}
                </h1>
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                  {authMode === "login" ? "Access your personalized MERN clinical workspace." : "Create your detailed role profile to connect."}
                </p>
              </div>

              <form onSubmit={handleAuthSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {authMode === "register" && (
                  <div className="form-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Dr. Aarav Sharma or Priya Patel"
                      value={authForm.name}
                      onChange={e => setAuthForm({...authForm, name: e.target.value})}
                    />
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Email Address</label>
                    <input 
                      type="email" 
                      required 
                      placeholder="name@example.com"
                      value={authForm.email}
                      onChange={e => setAuthForm({...authForm, email: e.target.value})}
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Password</label>
                    <input 
                      type="password" 
                      required 
                      placeholder="••••••••"
                      value={authForm.password}
                      onChange={e => setAuthForm({...authForm, password: e.target.value})}
                    />
                  </div>
                </div>

                {authMode === "register" && (
                  <div className="form-group">
                    <label>Register Role</label>
                    <select 
                      value={authForm.role}
                      onChange={e => setAuthForm({...authForm, role: e.target.value})}
                    >
                      <option value="patient">Patient Profile</option>
                      <option value="doctor">Medical Specialist</option>
                    </select>
                  </div>
                )}

                {/* DYNAMIC REGISTER DETAILS FOR DOCTOR */}
                {authMode === "register" && authForm.role === "doctor" && (
                  <div className="card-inner" style={{ marginTop: 0, padding: "1rem", background: "rgba(0,0,0,0.15)", borderStyle: "dashed" }}>
                    <h4 style={{ fontSize: "0.85rem", color: "var(--color-doctor-primary)", marginBottom: "0.75rem", fontFamily: "var(--font-family-display)" }}>Specialist Credentials</h4>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Specialty / Field</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. Cardiology, General Physician"
                          value={authForm.specialty}
                          onChange={e => setAuthForm({...authForm, specialty: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Experience (Years)</label>
                        <input 
                          type="number" 
                          required
                          placeholder="e.g. 12"
                          value={authForm.experience}
                          onChange={e => setAuthForm({...authForm, experience: e.target.value})}
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>License Number / NPI</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. LIC98242"
                          value={authForm.licenseNumber}
                          onChange={e => setAuthForm({...authForm, licenseNumber: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Clinic / Hospital Name</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. City General Hospital"
                          value={authForm.hospital}
                          onChange={e => setAuthForm({...authForm, hospital: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* DYNAMIC REGISTER DETAILS FOR PATIENT */}
                {authMode === "register" && authForm.role === "patient" && (
                  <div className="card-inner" style={{ marginTop: 0, padding: "1rem", background: "rgba(0,0,0,0.15)", borderStyle: "dashed" }}>
                    <h4 style={{ fontSize: "0.85rem", color: "var(--color-patient-primary)", marginBottom: "0.75rem", fontFamily: "var(--font-family-display)" }}>Medical Demographics</h4>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Age</label>
                        <input 
                          type="number" 
                          required
                          placeholder="e.g. 28"
                          value={authForm.age}
                          onChange={e => setAuthForm({...authForm, age: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Gender</label>
                        <select 
                          value={authForm.gender} 
                          onChange={e => setAuthForm({...authForm, gender: e.target.value})}
                        >
                          <option>Male</option>
                          <option>Female</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Blood Group</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. O+"
                          value={authForm.bloodGroup}
                          onChange={e => setAuthForm({...authForm, bloodGroup: e.target.value})}
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>BP (Systolic)</label>
                        <input 
                          type="number" 
                          required
                          placeholder="e.g. 120"
                          value={authForm.bpSystolic}
                          onChange={e => setAuthForm({...authForm, bpSystolic: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>BP (Diastolic)</label>
                        <input 
                          type="number" 
                          required
                          placeholder="e.g. 80"
                          value={authForm.bpDiastolic}
                          onChange={e => setAuthForm({...authForm, bpDiastolic: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Sugar (mg/dL)</label>
                        <input 
                          type="number" 
                          required
                          placeholder="e.g. 90"
                          value={authForm.sugar}
                          onChange={e => setAuthForm({...authForm, sugar: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Medical History / Diagnoses</label>
                      <textarea 
                        rows="2" 
                        placeholder="Describe existing conditions (e.g. Hypertension, thyroiditis, drug allergies...)"
                        style={{ width: "100%", background: "var(--bg-main)", border: "1px solid var(--border-color)", color: "white", padding: "0.4rem", borderRadius: "4px", outline: "none", fontSize: "0.8rem", fontFamily: "var(--font-family-body)", resize: "vertical" }}
                        value={authForm.medicalHistory}
                        onChange={e => setAuthForm({...authForm, medicalHistory: e.target.value})}
                      />
                    </div>
                  </div>
                )}

                <button 
                  type="submit" 
                  className={`btn ${authForm.role === 'doctor' || authMode === 'login' ? 'btn-doctor' : 'btn-patient'} btn-block mt-2`} 
                  disabled={isAuthLoading}
                >
                  {isAuthLoading ? (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <span className="spinner spinner-patient" style={{ width: "12px", height: "12px", borderWidth: "2px", margin: 0 }}></span>
                      <span>Authenticating Credentials...</span>
                    </div>
                  ) : (
                    authMode === "login" ? "Sign In" : "Register Account"
                  )}
                </button>
              </form>

              <div style={{ marginTop: "1.25rem", textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {authMode === "login" ? (
                  <p>
                    Don't have an account?{" "}
                    <span style={{ color: "var(--color-doctor-primary)", cursor: "pointer", fontWeight: 600 }} onClick={() => setAuthMode("register")}>
                      Register here
                    </span>
                  </p>
                ) : (
                  <p>
                    Already have an account?{" "}
                    <span style={{ color: "var(--color-doctor-primary)", cursor: "pointer", fontWeight: 600 }} onClick={() => setAuthMode("login")}>
                      Sign in here
                    </span>
                  </p>
                )}
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* =========================================
                DOCTOR PORTAL WORKSPACE
                ========================================= */}
            {user.role === "doctor" && (
              <section id="view-doctor">
                {/* Tab selector */}
                <div className="tabs-control" style={{ maxWidth: "450px", marginBottom: "1.5rem" }}>
                  <button className={`tab-btn ${doctorTab === 'vitals' ? 'active' : ''}`} onClick={() => setDoctorTab("vitals")}>
                    <i data-lucide="line-chart" className="mr-2"></i> Patient Vitals Dashboard
                  </button>
                  <button className={`tab-btn ${doctorTab === 'directChats' ? 'active' : ''}`} onClick={() => setDoctorTab("directChats")}>
                    <i data-lucide="message-square" className="mr-2"></i> Patient Direct Consultations
                  </button>
                </div>

                {doctorTab === "vitals" ? (
                  <div className="workspace-layout">
                    {/* Sidebar Patients list */}
                    <aside className="workspace-sidebar card">
                      <div className="sidebar-header">
                        <h3><i data-lucide="users"></i> Active Patients</h3>
                        <span className="badge badge-doctor">{patients.length} Registered</span>
                      </div>
                      
                      <div className="patient-list">
                        {patients.map(p => (
                          <div 
                            key={p._id}
                            className={`patient-item ${selectedPatient && selectedPatient._id === p._id ? 'active' : ''}`}
                            onClick={() => handlePatientSelect(p)}
                          >
                            <div className="patient-item-header">
                              <span className="patient-item-name">{p.name}</span>
                              <span className={`badge ${p.riskClass}`}>{p.riskBadge}</span>
                            </div>
                            <div className="patient-item-sub">{p.age} yrs • {p.gender} • BP: {p.latestVitals?.bp || "--"}</div>
                          </div>
                        ))}
                      </div>

                      <button 
                        className="btn btn-secondary btn-block mt-3" 
                        onClick={() => setShowNewPatForm(!showNewPatForm)}
                      >
                        <i data-lucide="user-plus"></i> {showNewPatForm ? "Cancel" : "Add Patient Profile"}
                      </button>

                      {showNewPatForm && (
                        <form className="patient-form-card" onSubmit={handleAddPatient}>
                          <h4>Add Patient Vitals</h4>
                          <div className="form-group">
                            <label>Patient Name</label>
                            <input 
                              type="text" 
                              required 
                              placeholder="e.g. John Doe"
                              value={newPatient.name}
                              onChange={e => setNewPatient({...newPatient, name: e.target.value})}
                            />
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <div className="form-group" style={{ flex: 1 }}>
                              <label>Age</label>
                              <input 
                                type="number" 
                                required 
                                placeholder="e.g. 45"
                                value={newPatient.age}
                                onChange={e => setNewPatient({...newPatient, age: e.target.value})}
                              />
                            </div>
                            <div className="form-group" style={{ flex: 1 }}>
                              <label>Gender</label>
                              <select 
                                value={newPatient.gender}
                                onChange={e => setNewPatient({...newPatient, gender: e.target.value})}
                              >
                                <option>Male</option>
                                <option>Female</option>
                                <option>Other</option>
                              </select>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <div className="form-group" style={{ flex: 1 }}>
                              <label>Blood Group</label>
                              <input 
                                type="text" 
                                placeholder="e.g. A+"
                                value={newPatient.bloodGroup}
                                onChange={e => setNewPatient({...newPatient, bloodGroup: e.target.value})}
                              />
                            </div>
                            <div className="form-group" style={{ flex: 2 }}>
                              <label>BP (Systolic/Diast)</label>
                              <div style={{ display: "flex", gap: "4px" }}>
                                <input 
                                  type="number" 
                                  placeholder="120"
                                  value={newPatient.bpSystolic}
                                  onChange={e => setNewPatient({...newPatient, bpSystolic: e.target.value})}
                                />
                                <input 
                                  type="number" 
                                  placeholder="80"
                                  value={newPatient.bpDiastolic}
                                  onChange={e => setNewPatient({...newPatient, bpDiastolic: e.target.value})}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Blood Sugar (mg/dL)</label>
                            <input 
                              type="number" 
                              required 
                              placeholder="e.g. 110"
                              value={newPatient.sugar}
                              onChange={e => setNewPatient({...newPatient, sugar: e.target.value})}
                            />
                          </div>
                          <div className="form-group">
                            <label>Medical Report Summary</label>
                            <textarea 
                              rows="2" 
                              placeholder="Describe conditions..."
                              style={{ width: "100%", background: "var(--bg-main)", border: "1px solid var(--border-color)", color: "white", padding: "0.4rem", borderRadius: "4px", outline: "none", fontSize: "0.8rem" }}
                              value={newPatient.reportSummary}
                              onChange={e => setNewPatient({...newPatient, reportSummary: e.target.value})}
                            />
                          </div>
                          <button type="submit" className="btn btn-doctor btn-block mt-2">Save Profile</button>
                        </form>
                      )}
                    </aside>

                    {/* Main content: Vitals charts */}
                    <div className="workspace-content">
                      {selectedPatient ? (
                        <>
                          <div className="card patient-dashboard-card">
                            <div className="patient-dashboard-header">
                              <div className="patient-title-group">
                                <h2>{selectedPatient.name}</h2>
                                <div className="patient-meta">
                                  <span>{selectedPatient.age} yrs</span> • 
                                  <span>{selectedPatient.gender}</span> • 
                                  <span>Blood Group: {selectedPatient.bloodGroup}</span>
                                </div>
                              </div>
                              <div className="patient-actions">
                                <button className="btn btn-doctor" onClick={handleGenerateRisk}>
                                  <i data-lucide="shield-alert"></i> Generate Risk Assessment
                                </button>
                              </div>
                            </div>

                            <div className="vitals-grid">
                              <div className="vital-card card-inner">
                                <div className="vital-header">
                                  <span className="vital-label">Last Blood Pressure</span>
                                  <i data-lucide="heart" className="vital-icon bp-color"></i>
                                </div>
                                <div className="vital-value">{selectedPatient.latestVitals?.bp || "--"} mmHg</div>
                                <div className={`vital-trend ${selectedPatient.latestVitals?.bpTrendClass}`}>
                                  <i data-lucide={selectedPatient.latestVitals?.bpTrendClass === 'trend-up' ? 'trending-up' : 'trending-down'}></i> {selectedPatient.latestVitals?.bpTrend || "Normal"}
                                </div>
                              </div>

                              <div className="vital-card card-inner">
                                <div className="vital-header">
                                  <span className="vital-label">Last Blood Sugar</span>
                                  <i data-lucide="droplet" className="vital-icon sugar-color"></i>
                                </div>
                                <div className="vital-value">{selectedPatient.latestVitals?.sugar || "--"} mg/dL</div>
                                <div className={`vital-trend ${selectedPatient.latestVitals?.sugarTrendClass}`}>
                                  <i data-lucide={selectedPatient.latestVitals?.sugarTrendClass === 'trend-up' ? 'trending-up' : 'trending-down'}></i> {selectedPatient.latestVitals?.sugarTrend || "Normal"}
                                </div>
                              </div>
                            </div>

                            <div className="chart-container">
                              <div className="chart-header">
                                <h4>Vitals History Log</h4>
                                <div className="chart-legend">
                                  <span className="legend-item"><span className="legend-color bp-legend"></span>BP Systolic</span>
                                  <span className="legend-item"><span className="legend-color sugar-legend"></span>Blood Sugar</span>
                                </div>
                              </div>
                              <div className="chart-wrapper">
                                <canvas ref={canvasRef}></canvas>
                              </div>
                            </div>

                            <div className="patient-report-summary card-inner">
                              <h4><i data-lucide="file-text"></i> Raw Medical Report Summary</h4>
                              <p>{selectedPatient.reportSummary}</p>
                            </div>
                          </div>

                          {showRiskPanel && (
                            <div className="card risk-assessment-card" id="risk-assessment-panel">
                              <div className="risk-card-header">
                                <h3><i data-lucide="clipboard-list"></i> Risk Assessment Sheet</h3>
                                <button className="btn btn-icon" onClick={() => setShowRiskPanel(false)}><i data-lucide="x"></i></button>
                              </div>
                              {isRiskLoading ? (
                                <div className="risk-card-content loading">
                                  <div className="spinner"></div>
                                  <p>Analyzing historical database records with Gemini Risk Analyst...</p>
                                </div>
                              ) : (
                                <div 
                                  className="risk-card-content"
                                  dangerouslySetInnerHTML={{ __html: formatMarkdown(riskAssessment) }}
                                />
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="card" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                          <p>Please select a patient profile from the sidebar to review clinical vitals.</p>
                        </div>
                      )}
                    </div>

                    {/* Sidebar Right: Doctor Research chat */}
                    <aside className="workspace-chat-sidebar card">
                      <div className="chat-header">
                        <h3><i data-lucide="bot"></i> Clinical Research AI</h3>
                        <button className="btn btn-icon-small" onClick={() => setShowDocContext(!showDocContext)} title="Configure Clinical Context">
                          <i data-lucide="sliders"></i>
                        </button>
                      </div>

                      {showDocContext && (
                        <div className="chat-context-panel">
                          <h4>Active Prompt Context</h4>
                          <div className="form-group">
                            <label>Age Group</label>
                            <select 
                              value={docContext.ageGroup} 
                              onChange={e => setDocContext({...docContext, ageGroup: e.target.value})}
                            >
                              <option>Adult</option>
                              <option>Geriatric</option>
                              <option>Pediatric</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Renal Clearances</label>
                            <select 
                              value={docContext.kidneyFunction}
                              onChange={e => setDocContext({...docContext, kidneyFunction: e.target.value})}
                            >
                              <option>Normal</option>
                              <option>Mild Impairment</option>
                              <option>Moderate Impairment (eGFR 30-59)</option>
                              <option>Severe Impairment (eGFR &lt;30)</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Current Medications</label>
                            <input 
                              type="text" 
                              placeholder="e.g. Metformin, Lisinopril"
                              value={docContext.otherMeds}
                              onChange={e => setDocContext({...docContext, otherMeds: e.target.value})}
                            />
                          </div>
                        </div>
                      )}

                      <div className="chat-messages">
                        <div className="message system-msg">
                          <strong>Research Assistant:</strong> Chat messages are securely persisted in MongoDB for this patient. Enter any clinical interaction questions.
                        </div>
                        {doctorChat.map((m, index) => (
                          <div key={index} className={`message ${m.role === 'assistant' ? 'assistant' : 'user'}-msg`} dangerouslySetInnerHTML={{ __html: formatMarkdown(m.content) }}></div>
                        ))}
                        {isDocChatLoading && (
                          <div className="message assistant-msg">
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <span className="spinner spinner-patient" style={{ width: "12px", height: "12px", borderWidth: "2px", margin: 0 }}></span>
                              <span>Consulting pharmacological rules...</span>
                            </div>
                          </div>
                        )}
                        <div ref={docChatEndRef} />
                      </div>

                      <div className="chat-suggestions">
                        <button className="suggestion-tag" onClick={() => setDocChatInput("Explain Metformin contraindications in contrast CT scan procedure")}>Metformin & Contrast Dye</button>
                        <button className="suggestion-tag" onClick={() => setDocChatInput("Calculate Pediatric Amoxicillin dosage recommendations for a 28kg child")}>Pediatric Amoxicillin</button>
                        <button className="suggestion-tag" onClick={() => setDocChatInput("Beta-blocker risks in asthmatic patients")}>Beta-Blockers in Asthma</button>
                      </div>

                      <form className="chat-input-form" onSubmit={handleDocChatSubmit}>
                        <input 
                          type="text" 
                          placeholder={selectedPatient ? `Message for ${selectedPatient.name}...` : "Select a patient profile first"}
                          disabled={!selectedPatient}
                          value={docChatInput}
                          onChange={e => setDocChatInput(e.target.value)}
                          required
                        />
                        <button type="submit" className="btn btn-doctor btn-send" disabled={!selectedPatient}><i data-lucide="send"></i></button>
                      </form>
                    </aside>
                  </div>
                ) : (
                  // DOCTOR DIRECT PATIENT MESSAGING VIEW
                  <div className="workspace-layout">
                    {/* Left: Consultation chats list */}
                    <aside className="workspace-sidebar card">
                      <div className="sidebar-header">
                        <h3><i data-lucide="message-square"></i> Patient Chats</h3>
                        <span className="badge badge-doctor">{doctorConsults.length} Chats</span>
                      </div>
                      
                      <div className="patient-list">
                        {doctorConsults.length > 0 ? (
                          doctorConsults.map(c => (
                            <div 
                              key={c._id}
                              className={`patient-item ${selectedDocConsult && selectedDocConsult._id === c._id ? 'active' : ''}`}
                              onClick={() => setSelectedDocConsult(c)}
                            >
                              <div className="patient-item-header">
                                <span className="patient-item-name">{c.patientName}</span>
                                <span className={`badge ${c.status === 'active' ? 'badge-doctor' : 'risk-tag risk-medium'}`}>
                                  {c.status === 'active' ? 'Connected' : 'Requested'}
                                </span>
                              </div>
                              <div className="patient-item-sub">
                                {c.messages.length > 0 ? c.messages[c.messages.length - 1].content : "No messages exchanged yet."}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: "1rem", color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center" }}>
                            No consultation requests received yet.
                          </div>
                        )}
                      </div>
                    </aside>

                    {/* Right: Message dialogue */}
                    <div className="card" style={{ gridColumn: "2 / 4", display: "flex", flexDirection: "column", height: "100%" }}>
                      {selectedDocConsult ? (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "1rem", borderBottom: "1px solid var(--border-color)", marginBottom: "1rem" }}>
                            <div>
                              <h2 style={{ fontFamily: "var(--font-family-display)", fontSize: "1.4rem" }}>Direct Chat: {selectedDocConsult.patientName}</h2>
                              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Session: {selectedDocConsult._id}</span>
                            </div>
                            
                            {selectedDocConsult.status === "pending" && (
                              <button className="btn btn-doctor" onClick={() => handleAcceptConsultation(selectedDocConsult._id)}>
                                <i data-lucide="check"></i> Accept Consultation Request
                              </button>
                            )}
                          </div>

                          {/* Chat logs */}
                          <div className="chat-messages" style={{ flex: 1, minHeight: "200px" }}>
                            <div className="message system-msg">
                              <strong>Session Log:</strong> Secure encrypted consulting session with {selectedDocConsult.patientName}.
                            </div>
                            {selectedDocConsult.messages.map((m, idx) => (
                              <div 
                                key={idx} 
                                className={`message ${m.senderId === user.id ? 'user-msg' : 'assistant-msg'}`}
                                style={{ alignSelf: m.senderId === user.id ? "flex-end" : "flex-start", borderRadius: m.senderId === user.id ? "10px 10px 2px 10px" : "10px 10px 10px 2px" }}
                              >
                                <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.45)", display: "block", marginBottom: "0.2rem" }}>{m.senderName}</span>
                                <div>{m.content}</div>
                              </div>
                            ))}
                            <div ref={docConsultEndRef} />
                          </div>

                          {/* Message inputs */}
                          <form className="chat-input-form" onSubmit={handleDocConsultMessageSubmit} style={{ marginTop: "1rem" }}>
                            <input 
                              type="text" 
                              placeholder={selectedDocConsult.status === 'active' ? "Type medical advice/reply here..." : "Please accept request to enable messaging"}
                              disabled={selectedDocConsult.status === 'pending' || isDocConsultLoading}
                              value={docConsultInput}
                              onChange={e => setDocConsultInput(e.target.value)}
                              required
                            />
                            <button type="submit" className="btn btn-doctor btn-send" disabled={selectedDocConsult.status === 'pending' || isDocConsultLoading}>
                              <i data-lucide="send"></i>
                            </button>
                          </form>
                        </>
                      ) : (
                        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                          Select an active patient chat or request card from the sidebar list.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* =========================================
                PATIENT PORTAL WORKSPACE
                ========================================= */}
            {user.role === "patient" && (
              <section id="view-patient">
                {/* Tab selector */}
                <div className="tabs-control" style={{ maxWidth: "450px", marginBottom: "1.5rem" }}>
                  <button className={`tab-btn ${patientTab === 'triage' ? 'active' : ''}`} onClick={() => setPatientTab("triage")}>
                    <i data-lucide="bot" className="mr-2"></i> AI Triage & Report Parser
                  </button>
                  <button className={`tab-btn ${patientTab === 'consultations' ? 'active' : ''}`} onClick={() => setPatientTab("consultations")}>
                    <i data-lucide="message-square" className="mr-2"></i> Consult a Doctor
                  </button>
                </div>

                {patientTab === "triage" ? (
                  <div className="workspace-layout">
                    {/* Left Column: Triage chatbot */}
                    <div className="card patient-triage-panel">
                      <div className="chat-header">
                        <h3><i data-lucide="heart-handshake"></i> Patient Triage Assistant</h3>
                        <span className={`triage-status-indicator risk-tag ${triageStatus.className}`}>{triageStatus.text}</span>
                      </div>

                      <div className="chat-messages">
                        <div className="message assistant-msg">
                          Hello, <strong>{user.name}</strong>! I am your empathetic health triage assistant. Describe how you are feeling, and I will help classify symptom urgency.
                          <br/><br/>
                          <strong>Please note:</strong> Your symptoms log is safely persisted inside your account history.
                        </div>
                        {patientChat.map((m, index) => (
                          <div key={index} className={`message ${m.role === 'assistant' ? 'assistant' : 'user'}-msg`} dangerouslySetInnerHTML={{ __html: formatMarkdown(m.content) }}></div>
                        ))}
                        {isPatChatLoading && (
                          <div className="message assistant-msg">
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <span className="spinner spinner-patient" style={{ width: "12px", height: "12px", borderWidth: "2px", margin: 0 }}></span>
                              <span>Assessing severity...</span>
                            </div>
                          </div>
                        )}
                        <div ref={patChatEndRef} />
                      </div>

                      <div className="chat-suggestions">
                        <button className="suggestion-tag" onClick={() => setPatChatInput("I have mild cold symptoms, runny nose, and occasional dry coughing. No breathing issues.")}>Runny nose</button>
                        <button className="suggestion-tag" onClick={() => setPatChatInput("I am experiencing sudden crushing pressure in my chest, radiating down my left arm, with sweating.")}>Chest pain emergency</button>
                        <button className="suggestion-tag" onClick={() => setPatChatInput("My child has a high fever of 102F, abdominal pain, and has vomited twice.")}>Child high fever</button>
                      </div>

                      <form className="chat-input-form" onSubmit={handlePatChatSubmit}>
                        <input 
                          type="text" 
                          placeholder="Describe how you are feeling..."
                          value={patChatInput}
                          onChange={e => setPatChatInput(e.target.value)}
                          required
                        />
                        <button type="submit" className="btn btn-patient btn-send"><i data-lucide="send"></i></button>
                      </form>
                    </div>

                    {/* Right Columns: OCR scanner & translator */}
                    <div className="patient-tools-panel">
                      <div className="card report-parser-card">
                        <div className="card-header">
                          <h3><i data-lucide="scan-line"></i> Medical Report Scanner (OCR)</h3>
                        </div>

                        <div className="parser-inputs">
                          <div className="tabs-control">
                            <button className={`tab-btn ${ocrTab === 'image' ? 'active' : ''}`} onClick={() => setOcrTab("image")}>Upload Prescription Image</button>
                            <button className={`tab-btn ${ocrTab === 'text' ? 'active' : ''}`} onClick={() => setOcrTab("text")}>Paste OCR Text</button>
                          </div>

                          {ocrTab === "image" ? (
                            <div 
                              className="drop-zone" 
                              onDragOver={e => e.preventDefault()}
                              onDrop={handleOcrDrop}
                              onClick={() => document.getElementById("file-upload").click()}
                            >
                              <i data-lucide="upload-cloud"></i>
                              <span className="drop-zone-text">Click or drag & drop prescription/report image (PNG, JPG)</span>
                              <input 
                                type="file" 
                                id="file-upload" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={handleOcrFileChange}
                              />
                              {ocrFileName && <span className="file-name-display">{ocrFileName}</span>}
                            </div>
                          ) : (
                            <textarea 
                              id="text-report-paste"
                              rows="4" 
                              placeholder="Paste raw, messy medical text scanned via OCR here..."
                              value={ocrText}
                              onChange={e => setOcrText(e.target.value)}
                            />
                          )}

                          <button className="btn btn-patient btn-block" onClick={handleReportParsing} disabled={isOcrLoading}>
                            <i data-lucide="cpu"></i> Clean & Parse Document
                          </button>
                        </div>

                        {isOcrLoading && (
                          <div className="parser-loader">
                            <div className="spinner spinner-patient"></div>
                            <p>Gemini multimodal document parsing & structure extraction in progress...</p>
                          </div>
                        )}

                        {parsedReport && (
                          <div className="parser-results">
                            <h4><i data-lucide="braces"></i> Structured Lab Data (JSON Format)</h4>
                            
                            <div className="results-layout">
                              <div className="card-inner data-extracted-list">
                                <h5>Diagnosed Conditions</h5>
                                <ul className="data-tag-list">
                                  {parsedReport.diagnosed_conditions?.length > 0 ? (
                                    parsedReport.diagnosed_conditions.map((c, i) => <li key={i}>{c}</li>)
                                  ) : <li>None identified</li>}
                                </ul>

                                <h5>Prescribed Medications</h5>
                                <table className="report-data-table">
                                  <thead>
                                    <tr>
                                      <th>Drug</th>
                                      <th>Dosage</th>
                                      <th>Frequency</th>
                                      <th>Duration</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {parsedReport.prescribed_medications?.length > 0 ? (
                                      parsedReport.prescribed_medications.map((m, i) => (
                                        <tr key={i}>
                                          <td><strong>{m.name}</strong></td>
                                          <td>{m.dosage}</td>
                                          <td>{m.frequency}</td>
                                          <td>{m.duration}</td>
                                        </tr>
                                      ))
                                    ) : <tr><td colSpan="4" style={{ textAlign: "center", color: "var(--text-muted)" }}>No prescription items found</td></tr>}
                                  </tbody>
                                </table>

                                <h5>Abnormal Lab Indicators</h5>
                                <table className="report-data-table">
                                  <thead>
                                    <tr>
                                      <th>Test</th>
                                      <th>Value</th>
                                      <th>Classification</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {parsedReport.abnormal_lab_markers?.length > 0 ? (
                                      parsedReport.abnormal_lab_markers.map((mark, i) => {
                                        const status = (mark.status || "").toLowerCase();
                                        let statClass = "status-normal";
                                        if (status.includes("high")) statClass = "status-high";
                                        else if (status.includes("low")) statClass = "status-low";
                                        return (
                                          <tr key={i}>
                                            <td>{mark.test_name}</td>
                                            <td><strong>{mark.value}</strong></td>
                                            <td><span className={`status-marker ${statClass}`}>{mark.status}</span></td>
                                          </tr>
                                        );
                                      })
                                    ) : <tr><td colSpan="3" style={{ textAlign: "center", color: "var(--text-muted)" }}>No indicators found</td></tr>}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <button className="btn btn-patient btn-block mt-3" onClick={handleReportTranslation}>
                              <i data-lucide="languages"></i> Translate & Create Audio Summaries
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Translation card */}
                      {(isTransLoading || englishSummary) && (
                        <div className="card translator-card" id="translator-panel">
                          <div className="card-header">
                            <h3><i data-lucide="volume-2"></i> Report Translation & Summarizer</h3>
                          </div>

                          {isTransLoading ? (
                            <div className="translation-loader">
                              <div className="spinner spinner-patient"></div>
                              <p>Translating report data into simplified English and Hindi summaries...</p>
                            </div>
                          ) : (
                            <div className="translation-content">
                              {speechState.playing && (
                                <div className="sound-wave-container">
                                  <div className="bar"></div>
                                  <div className="bar"></div>
                                  <div className="bar"></div>
                                  <div className="bar"></div>
                                  <div className="bar"></div>
                                  <div className="bar"></div>
                                  <p>Reading summary aloud ({speechState.lang})...</p>
                                </div>
                              )}

                              <div className="translation-tabs">
                                <button className={`tab-btn ${transTab === 'english' ? 'active' : ''}`} onClick={() => setTransTab("english")}>English Summary</button>
                                <button className={`tab-btn ${transTab === 'hindi' ? 'active' : ''}`} onClick={() => setTransTab("hindi")}>हिंदी सारांश (Hindi)</button>
                              </div>

                              <div className="translation-panels">
                                {transTab === "english" ? (
                                  <div className="translation-pane">
                                    <div className="summary-text-box" dangerouslySetInnerHTML={{ __html: formatMarkdown(englishSummary) }} />
                                    <button className="btn btn-patient" onClick={() => speakText(englishSummary, "en-US")}>
                                      <i data-lucide="volume-2"></i> Listen to English Summary
                                    </button>
                                  </div>
                                ) : (
                                  <div className="translation-pane">
                                    <div className="summary-text-box font-hindi" dangerouslySetInnerHTML={{ __html: formatMarkdown(hindiSummary) }} />
                                    <button className="btn btn-patient" onClick={() => speakText(hindiSummary, "hi-IN")}>
                                      <i data-lucide="volume-2"></i> ऑडियो सुनें (Listen to Audio)
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="audio-controls-bar">
                                <button className="btn btn-secondary btn-icon-small" onClick={stopSpeech} title="Stop playback"><i data-lucide="square"></i></button>
                                <div className="rate-control">
                                  <label>Rate:</label>
                                  <input 
                                    type="range" 
                                    min="0.5" 
                                    max="1.5" 
                                    step="0.1" 
                                    value={ttsRate}
                                    onChange={handleTtsRateChange}
                                  />
                                  <span>{ttsRate.toFixed(1)}x</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // PATIENT DIRECT DOCTOR CONSULTATIONS VIEW
                  <div className="workspace-layout">
                    {/* Left: Registered doctors directory */}
                    <aside className="workspace-sidebar card">
                      <div className="sidebar-header">
                        <h3><i data-lucide="users"></i> Doctors Directory</h3>
                        <span className="badge badge-patient">{doctorDirectory.length} Online</span>
                      </div>
                      
                      <div className="patient-list">
                        {doctorDirectory.map(d => (
                          <div 
                            key={d._id}
                            className={`patient-item ${selectedDoctor && selectedDoctor._id === d._id ? 'active' : ''}`}
                            onClick={() => handleSelectDoctor(d)}
                          >
                            <div className="patient-item-header">
                              <span className="patient-item-name">{d.name}</span>
                              <span className="badge badge-doctor" style={{ fontSize: "0.6rem" }}>{d.specialty}</span>
                            </div>
                            <div className="patient-item-sub">{d.hospital} • Exp: {d.experience} yrs</div>
                          </div>
                        ))}
                      </div>
                    </aside>

                    {/* Right: Connect & Chat pane */}
                    <div className="card" style={{ gridColumn: "2 / 4", display: "flex", flexDirection: "column", height: "100%" }}>
                      {selectedDoctor ? (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "1rem", borderBottom: "1px solid var(--border-color)", marginBottom: "1rem" }}>
                            <div>
                              <h2 style={{ fontFamily: "var(--font-family-display)", fontSize: "1.4rem" }}>Consulting: {selectedDoctor.name}</h2>
                              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Specialty: {selectedDoctor.specialty} ({selectedDoctor.hospital})</span>
                            </div>

                            {!activeConsultation && (
                              <button className="btn btn-patient" onClick={handleRequestConsultation} disabled={isPatConsultLoading}>
                                <i data-lucide="send"></i> Send Consultation Request
                              </button>
                            )}
                          </div>

                          {activeConsultation ? (
                            <>
                              {/* Chat message history logs */}
                              <div className="chat-messages" style={{ flex: 1, minHeight: "200px" }}>
                                <div className="message system-msg">
                                  <strong>Status:</strong> {activeConsultation.status === 'pending' ? 'Request pending doctor approval.' : 'Connected. Conversation started.'}
                                </div>
                                {activeConsultation.messages.map((m, idx) => (
                                  <div 
                                    key={idx} 
                                    className={`message ${m.senderId === user.id ? 'user-msg' : 'assistant-msg'}`}
                                    style={{ alignSelf: m.senderId === user.id ? "flex-end" : "flex-start", borderRadius: m.senderId === user.id ? "10px 10px 2px 10px" : "10px 10px 10px 2px" }}
                                  >
                                    <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.45)", display: "block", marginBottom: "0.2rem" }}>{m.senderName}</span>
                                    <div>{m.content}</div>
                                  </div>
                                ))}
                                <div ref={patConsultEndRef} />
                              </div>

                              {/* Input box */}
                              <form className="chat-input-form" onSubmit={handlePatConsultMessageSubmit} style={{ marginTop: "1rem" }}>
                                <input 
                                  type="text" 
                                  placeholder="Type your message to the doctor..."
                                  value={patConsultInput}
                                  onChange={e => setPatConsultInput(e.target.value)}
                                  disabled={isPatConsultLoading}
                                  required
                                />
                                <button type="submit" className="btn btn-patient btn-send" disabled={isPatConsultLoading}>
                                  <i data-lucide="send"></i>
                                </button>
                              </form>
                            </>
                          ) : (
                            <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", color: "var(--text-muted)" }}>
                              <i data-lucide="send" style={{ width: "48px", height: "48px", color: "var(--color-patient-primary)", opacity: 0.5 }}></i>
                              <p>You have not connected with {selectedDoctor.name} yet.</p>
                              <button className="btn btn-patient" onClick={handleRequestConsultation} disabled={isPatConsultLoading}>
                                Send Connect Request to Start Chat
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                          Select a specialist doctor from the directory sidebar to start your consultation.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* API Key Modal Settings */}
      {showSettings && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3><i data-lucide="key-round"></i> API Configuration Settings</h3>
              <button className="btn btn-icon" onClick={() => setShowSettings(false)}><i data-lucide="x"></i></button>
            </div>
            <div className="modal-body">
              <p>The backend automatically uses the key configured in the server <code>.env</code> file. To override it, enter your custom Gemini API key here.</p>
              <div className="form-group">
                <label>Gemini API Key</label>
                <input 
                  type="password" 
                  placeholder="AIzaSy..."
                  value={tempApiKey}
                  onChange={e => setTempApiKey(e.target.value)}
                />
                <span className="help-text">Your API key is stored locally in this browser tab and is attached to subsequent clinical analysis requests.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleClearSettings}>Clear Key</button>
              <button className="btn btn-primary" onClick={handleSaveSettings}>Save Settings</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditProfile && (
        <div className="modal-overlay">
          <div className={`modal-card ${user.role === 'patient' ? 'patient-modal-card' : ''}`}>
            <div className={`modal-header ${user.role === 'patient' ? 'patient-modal-header' : ''}`}>
              <h3>
                <i data-lucide="user"></i> Update {user.role === 'doctor' ? 'Clinical Credentials' : 'Medical Demographics & Vitals'}
              </h3>
              <button className="btn btn-icon" onClick={() => setShowEditProfile(false)}>
                <i data-lucide="x"></i>
              </button>
            </div>
            
            {user.role === "doctor" ? (
              <form onSubmit={handleProfileUpdateSubmit}>
                <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: "4px" }}>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Full Name"
                      value={editProfileForm.name}
                      onChange={e => setEditProfileForm({...editProfileForm, name: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Specialty / Field</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Cardiology"
                      value={editProfileForm.specialty}
                      onChange={e => setEditProfileForm({...editProfileForm, specialty: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Experience (Years)</label>
                    <input 
                      type="number" 
                      required
                      placeholder="e.g. 10"
                      value={editProfileForm.experience}
                      onChange={e => setEditProfileForm({...editProfileForm, experience: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>License Number / NPI</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. LIC12345"
                      value={editProfileForm.licenseNumber}
                      onChange={e => setEditProfileForm({...editProfileForm, licenseNumber: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Hospital / Clinic Name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. City General Hospital"
                      value={editProfileForm.hospital}
                      onChange={e => setEditProfileForm({...editProfileForm, hospital: e.target.value})}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowEditProfile(false)}>Cancel</button>
                  <button type="submit" className="btn btn-doctor" disabled={isProfileUpdating}>
                    {isProfileUpdating ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="modal-body modal-double-column" style={{ maxHeight: "75vh", overflowY: "auto", paddingRight: "4px" }}>
                {/* Left Column: Demographics Update */}
                <form onSubmit={handleProfileUpdateSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <h4 style={{ fontSize: "0.95rem", color: "var(--color-patient-primary)", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem", fontFamily: "var(--font-family-display)", marginTop: 0 }}>Demographics</h4>
                  
                  <div className="form-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="Full Name"
                      value={editProfileForm.name}
                      onChange={e => setEditProfileForm({...editProfileForm, name: e.target.value})}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Age</label>
                      <input 
                        type="number" 
                        required
                        placeholder="e.g. 30"
                        value={editProfileForm.age}
                        onChange={e => setEditProfileForm({...editProfileForm, age: e.target.value})}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Gender</label>
                      <select 
                        value={editProfileForm.gender} 
                        onChange={e => setEditProfileForm({...editProfileForm, gender: e.target.value})}
                      >
                        <option>Male</option>
                        <option>Female</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Blood Group</label>
                      <input 
                        type="text" 
                        required
                        placeholder="e.g. B+"
                        value={editProfileForm.bloodGroup}
                        onChange={e => setEditProfileForm({...editProfileForm, bloodGroup: e.target.value})}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>BP (Systolic)</label>
                      <input 
                        type="number" 
                        required
                        placeholder="e.g. 120"
                        value={editProfileForm.bpSystolic}
                        onChange={e => setEditProfileForm({...editProfileForm, bpSystolic: e.target.value})}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>BP (Diastolic)</label>
                      <input 
                        type="number" 
                        required
                        placeholder="e.g. 80"
                        value={editProfileForm.bpDiastolic}
                        onChange={e => setEditProfileForm({...editProfileForm, bpDiastolic: e.target.value})}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Sugar (mg/dL)</label>
                      <input 
                        type="number" 
                        required
                        placeholder="e.g. 90"
                        value={editProfileForm.sugar}
                        onChange={e => setEditProfileForm({...editProfileForm, sugar: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Medical History / Diagnoses</label>
                    <textarea 
                      rows="4" 
                      placeholder="Describe existing conditions..."
                      style={{ width: "100%", background: "var(--bg-main)", border: "1px solid var(--border-color)", color: "white", padding: "0.4rem", borderRadius: "4px", outline: "none", fontSize: "0.8rem", fontFamily: "var(--font-family-body)", resize: "vertical" }}
                      value={editProfileForm.medicalHistory}
                      onChange={e => setEditProfileForm({...editProfileForm, medicalHistory: e.target.value})}
                    />
                  </div>

                  <div className="modal-footer" style={{ borderTop: "none", paddingTop: 0, paddingBottom: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowEditProfile(false)}>Cancel</button>
                    <button 
                      type="submit" 
                      className="btn btn-patient" 
                      disabled={isProfileUpdating}
                    >
                      {isProfileUpdating ? "Saving..." : "Save Demographics"}
                    </button>
                  </div>
                </form>

                {/* Right Column: Vitals History Chart Log & Month Logger */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>
                    <h4 style={{ fontSize: "0.95rem", color: "var(--color-patient-primary)", fontFamily: "var(--font-family-display)", marginTop: 0 }}>Vitals & Risk Analysis</h4>
                    {patientProfile && <span className={`badge ${patientProfile.riskClass}`}>{patientProfile.riskBadge}</span>}
                  </div>

                  {patientProfile && (
                    <div className="vitals-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", margin: 0 }}>
                      <div className="vital-card card-inner" style={{ padding: "0.75rem" }}>
                        <div className="vital-header">
                          <span className="vital-label" style={{ fontSize: "0.65rem" }}>Last Blood Pressure</span>
                          <i data-lucide="heart" className="vital-icon bp-color" style={{ width: "16px", height: "16px" }}></i>
                        </div>
                        <div className="vital-value" style={{ fontSize: "1.25rem" }}>{patientProfile.latestVitals?.bp || "--"} mmHg</div>
                        <div className={`vital-trend ${patientProfile.latestVitals?.bpTrendClass}`} style={{ fontSize: "0.7rem" }}>
                          <i data-lucide={patientProfile.latestVitals?.bpTrendClass === 'trend-up' ? 'trending-up' : 'trending-down'}></i> {patientProfile.latestVitals?.bpTrend || "Normal"}
                        </div>
                      </div>

                      <div className="vital-card card-inner" style={{ padding: "0.75rem" }}>
                        <div className="vital-header">
                          <span className="vital-label" style={{ fontSize: "0.65rem" }}>Last Blood Sugar</span>
                          <i data-lucide="droplet" className="vital-icon sugar-color" style={{ width: "16px", height: "16px" }}></i>
                        </div>
                        <div className="vital-value" style={{ fontSize: "1.25rem" }}>{patientProfile.latestVitals?.sugar || "--"} mg/dL</div>
                        <div className={`vital-trend ${patientProfile.latestVitals?.sugarTrendClass}`} style={{ fontSize: "0.7rem" }}>
                          <i data-lucide={patientProfile.latestVitals?.sugarTrendClass === 'trend-up' ? 'trending-up' : 'trending-down'}></i> {patientProfile.latestVitals?.sugarTrend || "Normal"}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="chart-container" style={{ margin: 0, padding: "0.75rem" }}>
                    <div className="chart-header" style={{ marginBottom: "0.5rem" }}>
                      <h5 style={{ fontSize: "0.85rem", margin: 0 }}>Vitals History Log</h5>
                      <div className="chart-legend" style={{ fontSize: "0.7rem", gap: "0.5rem" }}>
                        <span className="legend-item"><span className="legend-color bp-legend" style={{ backgroundColor: "#10b981", width: "8px", height: "8px" }}></span>BP</span>
                        <span className="legend-item"><span className="legend-color sugar-legend" style={{ backgroundColor: "#f59e0b", width: "8px", height: "8px" }}></span>Sugar</span>
                      </div>
                    </div>
                    <div className="chart-wrapper" style={{ height: "130px" }}>
                      <canvas ref={patientCanvasRef}></canvas>
                    </div>
                  </div>

                  <div className="card-inner" style={{ margin: 0, padding: "0.75rem" }}>
                    <h5 style={{ fontSize: "0.85rem", color: "var(--color-patient-primary)", marginBottom: "0.5rem", fontFamily: "var(--font-family-display)", marginTop: 0 }}>Log Monthly Vitals</h5>
                    <form onSubmit={handleLogVitalsSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <div className="form-group" style={{ flex: 1.5 }}>
                          <label style={{ fontSize: "0.65rem" }}>Month / Date Label</label>
                          <input 
                            type="text" 
                            required
                            placeholder="e.g. Jul 4 or Aug"
                            value={vitalsForm.label}
                            style={{ fontSize: "0.75rem", padding: "0.35rem" }}
                            onChange={e => setVitalsForm({...vitalsForm, label: e.target.value})}
                          />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.65rem" }}>BP (Systolic)</label>
                          <input 
                            type="number" 
                            required
                            placeholder="120"
                            value={vitalsForm.bpSystolic}
                            style={{ fontSize: "0.75rem", padding: "0.35rem" }}
                            onChange={e => setVitalsForm({...vitalsForm, bpSystolic: e.target.value})}
                          />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.65rem" }}>BP (Diastolic)</label>
                          <input 
                            type="number" 
                            required
                            placeholder="80"
                            value={vitalsForm.bpDiastolic}
                            style={{ fontSize: "0.75rem", padding: "0.35rem" }}
                            onChange={e => setVitalsForm({...vitalsForm, bpDiastolic: e.target.value})}
                          />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.65rem" }}>Sugar (mg/dL)</label>
                          <input 
                            type="number" 
                            required
                            placeholder="90"
                            value={vitalsForm.sugar}
                            style={{ fontSize: "0.75rem", padding: "0.35rem" }}
                            onChange={e => setVitalsForm({...vitalsForm, sugar: e.target.value})}
                          />
                        </div>
                      </div>
                      <button type="submit" className="btn btn-patient btn-block mt-1" style={{ padding: "0.4rem", fontSize: "0.8rem" }} disabled={isVitalsLogging}>
                        {isVitalsLogging ? "Logging..." : "Add Vitals Entry"}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <p>&copy; 2026 AI-DOCTOR Secure Medical Network. All rights reserved.</p>
        <p>Developed By: YOGESH SWAMI</p>
      </footer>
    </div>
  );
}
