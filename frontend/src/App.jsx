import React, { useState, useEffect } from "react";
import { safeStorage } from "./utils/safeStorage";
import AuthPortal from "./components/AuthPortal/AuthPortal";
import Sidebar from "./components/Sidebar/Sidebar";
import DoctorDashboard from "./components/DoctorDashboard/DoctorDashboard";
import TriageChatbot from "./components/TriageChatbot/TriageChatbot";
import Consultations from "./components/Consultations/Consultations";
import MedicationScheduler from "./components/MedicationScheduler/MedicationScheduler";
import "./App.css";

export default function App() {
  // Global States
  const [user, setUser] = useState(() => {
    try {
      const saved = safeStorage.getLocal("ai_doctor_user");
      if (saved && saved !== "undefined") {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Local storage user parsing failed.", e);
      safeStorage.removeLocal("ai_doctor_user");
      safeStorage.removeLocal("ai_doctor_token");
    }
    return null;
  });

  const [toasts, setToasts] = useState([]);
  const [apiKey, setApiKey] = useState(() => safeStorage.getSession("gemini_api_key") || "");
  const [dbStatus, setDbStatus] = useState({ fallbackMode: false, connectedDatabase: "Connecting..." });
  
  // Tab Routing
  const [doctorTab, setDoctorTab] = useState("vitals"); // vitals, directChats
  const [patientTab, setPatientTab] = useState("triage"); // triage, consultations, scheduler

  // Data Collections
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [riskAssessment, setRiskAssessment] = useState("");
  const [isRiskLoading, setIsRiskLoading] = useState(false);
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

  // Doctor AI Research chat states
  const [doctorChat, setDoctorChat] = useState([]);
  const [docChatInput, setDocChatInput] = useState("");
  const [isDocChatLoading, setIsDocChatLoading] = useState(false);
  const [showDocContext, setShowDocContext] = useState(false);
  const [docContext, setDocContext] = useState({
    ageGroup: "Adult",
    kidneyFunction: "Normal",
    otherMeds: ""
  });

  // Patient AI chat states
  const [patientChat, setPatientChat] = useState([]);

  // Medication Scheduler states
  const [medications, setMedications] = useState([]);
  const [newMedication, setNewMedication] = useState({
    name: "",
    dosage: "",
    frequency: "Once Daily",
    time: "08:00",
    startDate: new Date().toISOString().split("T")[0],
    endDate: ""
  });
  const [lastNotified, setLastNotified] = useState({});

  // Consultations States
  const [doctorDirectory, setDoctorDirectory] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [patientConsults, setPatientConsults] = useState([]);
  const [activeConsultation, setActiveConsultation] = useState(null);
  const [patConsultInput, setPatConsultInput] = useState("");
  const [isPatConsultLoading, setIsPatConsultLoading] = useState(false);

  const [doctorConsults, setDoctorConsults] = useState([]);
  const [selectedDocConsult, setSelectedDocConsult] = useState(null);
  const [docConsultInput, setDocConsultInput] = useState("");
  const [isDocConsultLoading, setIsDocConsultLoading] = useState(false);

  // Patient profile (demographics modal & triage badges)
  const [patientProfile, setPatientProfile] = useState(null);

  // Speech Customization Reactive States
  const [speechRate, setSpeechRateState] = useState(parseFloat(safeStorage.getLocal("speech_rate") || "1"));
  const [speechPitch, setSpeechPitchState] = useState(parseFloat(safeStorage.getLocal("speech_pitch") || "1"));
  const [speechVolume, setSpeechVolumeState] = useState(parseFloat(safeStorage.getLocal("speech_volume") || "1"));

  const setSpeechRate = (val) => {
    setSpeechRateState(val);
    safeStorage.setLocal("speech_rate", val.toString());
  };
  const setSpeechPitch = (val) => {
    setSpeechPitchState(val);
    safeStorage.setLocal("speech_pitch", val.toString());
  };
  const setSpeechVolume = (val) => {
    setSpeechVolumeState(val);
    safeStorage.setLocal("speech_volume", val.toString());
  };

  // Toast Helper
  const triggerToast = (msg, type = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Auth fetch wrapper
  const fetchWithAuth = (url, options = {}) => {
    const token = safeStorage.getLocal("ai_doctor_token");
    const headers = {
      ...options.headers,
      ...(token && { "Authorization": `Bearer ${token}` }),
      ...(apiKey && { "x-gemini-key": apiKey })
    };
    return fetch(url, { ...options, headers });
  };

  // Global Check: Connectivity & Fallbacks
  useEffect(() => {
    const checkConnectivity = async () => {
      try {
        const res = await fetch("/api/db-status");
        const data = await res.json();
        setDbStatus(data);
      } catch (err) {
        setDbStatus({ fallbackMode: true, connectedDatabase: "Offline (JSON Mode)" });
      }
    };
    checkConnectivity();
    const interval = setInterval(checkConnectivity, 30000);
    return () => clearInterval(interval);
  }, []);

  // Request Notification Permissions on Mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Fetch lists based on role
  useEffect(() => {
    if (user) {
      if (user.role === "doctor") {
        fetchPatients();
        fetchDoctorConsultations();
      } else if (user.role === "patient") {
        fetchPatientProfile(user.id);
        fetchMedications();
        fetchDoctorDirectory();
        fetchPatientConsultations();
        fetchPatientChatLogs();
      }
    }
  }, [user]);

  // Fetch Patient Chat History
  const fetchPatientChatLogs = async () => {
    if (!user) return;
    try {
      const res = await fetchWithAuth(`/api/chats/patient/${user.email}`);
      const data = await res.json();
      if (res.ok && data.history) {
        setPatientChat(data.history);
      }
    } catch (err) {
      console.warn("Failed to load chat history", err);
    }
  };

  // Fetch Patients List (Doctor)
  const fetchPatients = async () => {
    try {
      const res = await fetchWithAuth("/api/patients");
      const data = await res.json();
      if (res.ok) setPatients(data);
    } catch (err) {
      triggerToast("Error loading patients: " + err.message, "error");
    }
  };

  // Fetch Patient Stats Profile
  const fetchPatientProfile = async (patientId) => {
    try {
      const res = await fetchWithAuth(`/api/patients/user/${patientId}`);
      const data = await res.json();
      if (res.ok) setPatientProfile(data);
    } catch (err) {
      console.warn(err);
    }
  };

  // Fetch Medications
  const fetchMedications = async () => {
    try {
      const res = await fetchWithAuth("/api/medications");
      const data = await res.json();
      if (res.ok) setMedications(data);
    } catch (err) {
      console.warn(err);
    }
  };

  // Fetch Doctor Directory
  const fetchDoctorDirectory = async () => {
    try {
      const res = await fetchWithAuth("/api/doctors");
      const data = await res.json();
      if (res.ok) setDoctorDirectory(data);
    } catch (err) {
      console.warn(err);
    }
  };

  // Fetch Patient Consultations
  const fetchPatientConsultations = async () => {
    if (!user || !user.id) return;
    try {
      const res = await fetchWithAuth("/api/consultations/patient/" + user.id);
      const data = await res.json();
      if (res.ok) {
        setPatientConsults(data);
        if (selectedDoctor) {
          const match = data.find(c => c.doctorId === selectedDoctor._id);
          if (match) setActiveConsultation(match);
        }
      }
    } catch (err) {
      console.warn(err);
    }
  };

  // Fetch Doctor Consultations
  const fetchDoctorConsultations = async () => {
    if (!user || !user.id) return;
    try {
      const res = await fetchWithAuth("/api/consultations/doctor/" + user.id);
      const data = await res.json();
      if (res.ok) setDoctorConsults(data);
    } catch (err) {
      console.warn(err);
    }
  };

  const refreshActiveConsultation = async (chatId) => {
    try {
      const res = await fetchWithAuth(`/api/consultations/session/${chatId}`);
      const data = await res.json();
      if (res.ok) {
        if (user.role === "patient") {
          setActiveConsultation(data);
          fetchPatientConsultations();
        } else {
          setSelectedDocConsult(data);
          fetchDoctorConsultations();
        }
      }
    } catch (err) {
      console.warn(err);
    }
  };

  // Poll for consultation updates every 5 seconds
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      if (user.role === "patient" && activeConsultation) {
        refreshActiveConsultation(activeConsultation._id);
      } else if (user.role === "doctor" && selectedDocConsult) {
        refreshActiveConsultation(selectedDocConsult._id);
      }
      
      // Keep notifications sidebar fresh for doctors
      if (user.role === "doctor") {
        fetchDoctorConsultations();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [user, activeConsultation, selectedDocConsult]);

  // Medication alarm trigger sound / checker loop
  useEffect(() => {
    if (!user || user.role !== "patient" || medications.length === 0) return;

    const playAlarmChime = () => {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const playNote = (frequency, startTime, duration) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(frequency, startTime);
          gain.gain.setValueAtTime(0.15, startTime);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(startTime);
          osc.stop(startTime + duration);
        };
        const now = audioCtx.currentTime;
        playNote(659.25, now, 0.3); // E5
        playNote(880.00, now + 0.15, 0.4); // A5
      } catch (e) {
        console.warn("Alarm chime failed to synthesize", e);
      }
    };

    const checkAlarms = () => {
      const now = new Date();
      const timeStr = now.toTimeString().substring(0, 5); // "HH:MM"
      const todayKey = now.toDateString(); // "Fri Aug 14 2026"
      const todayDate = now.toISOString().split("T")[0];

      medications.forEach(med => {
        // Active and date bounds check
        if (!med.isActive || todayDate < med.startDate || (med.endDate && todayDate > med.endDate)) return;

        // Daily compliance check
        const isTakenToday = med.adherenceLogs && med.adherenceLogs.some(l => l.date === todayDate && l.status === "taken");

        if (med.time === timeStr && !isTakenToday) {
          const alarmKey = `${med._id}-${todayKey}-${timeStr}`;
          if (!lastNotified[alarmKey]) {
            // Trigger synthesized alert chime
            playAlarmChime();

            // Trigger browser notification speech alarm
            speakText(`Friendly reminder from AI Doctor: It is time to take your dose of ${med.name}, ${med.dosage}.`, "en");
            
            // UI Toast
            triggerToast(`Medication Reminder: Take ${med.name} (${med.dosage})`, "info");
            
            // Native OS Desktop Notification
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("Medication Reminder ⏰", {
                body: `It is time to take your dose of ${med.name} (${med.dosage})`,
                icon: "/favicon.ico"
              });
            }

            setLastNotified(prev => ({ ...prev, [alarmKey]: Date.now() }));
          }
        }
      });
    };

    const interval = setInterval(checkAlarms, 15000);
    return () => clearInterval(interval);
  }, [user, medications, lastNotified]);

  // Speech Synthesizer Helpers
  const speakText = (text, lang = "en") => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    const cleanText = text.replace(/[*#_`]/g, ""); // Strip markdown tags
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang === "hi" ? "hi-IN" : "en-US";
    
    utterance.rate = speechRate;
    utterance.pitch = speechPitch;
    utterance.volume = speechVolume;
    
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeech = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  };

  // Auth portal success handler
  const handleAuthSuccess = (data) => {
    safeStorage.setLocal("ai_doctor_token", data.token);
    safeStorage.setLocal("ai_doctor_user", JSON.stringify(data.user));
    setUser(data.user);
    triggerToast(`Welcome back, ${data.user.name}!`, "success");
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
    setMedications([]);
    setPatientProfile(null);
    safeStorage.removeLocal("ai_doctor_user");
    safeStorage.removeLocal("ai_doctor_token");
    triggerToast("Logged out successfully.", "info");
  };

  // Demographics/Profile updates from Sidebar form
  const handleSidebarProfileUpdate = (updatedUser) => {
    setUser(updatedUser);
    safeStorage.setLocal("ai_doctor_user", JSON.stringify(updatedUser));
    if (updatedUser.role === "doctor") {
      fetchPatients();
    } else {
      fetchPatientProfile(updatedUser.id);
    }
  };

  // Select patient on Doctor Dashboard
  const handlePatientSelect = async (patient) => {
    setSelectedPatient(patient);
    setRiskAssessment("");
    
    setDocContext({
      ageGroup: patient.age >= 65 ? "Geriatric" : (patient.age < 18 ? "Pediatric" : "Adult"),
      kidneyFunction: patient.name.includes("Aarav") ? "Moderate Impairment (eGFR 30-59)" : "Normal",
      otherMeds: patient.name.includes("Aarav") ? "Metformin, Lisinopril" : ""
    });

    // Fetch doctor-patient pharmacological chat history logs
    try {
      const res = await fetchWithAuth(`/api/chats/doctor/${patient._id}`);
      const data = await res.json();
      if (res.ok && data.history) {
        setDoctorChat(data.history);
      } else {
        setDoctorChat([]);
      }
    } catch (err) {
      setDoctorChat([]);
    }
  };

  // Save new Patient Profile (Doctor)
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

      const res = await fetchWithAuth("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      triggerToast(`Added profile: ${data.name}`, "success");
      setShowNewPatForm(false);
      setNewPatient({
        name: "", age: "", gender: "Male", bloodGroup: "O+", bpSystolic: "120", bpDiastolic: "80", sugar: "90", reportSummary: ""
      });
      fetchPatients();
    } catch (err) {
      triggerToast(`Failed to add patient: ${err.message}`, "error");
    }
  };

  // Generate Risk assessment
  const handleGenerateRisk = async () => {
    if (!selectedPatient) return;
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

      const res = await fetchWithAuth("/api/doctor/analyze-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientData })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate risk Assessment.");

      setRiskAssessment(data.analysis);
    } catch (err) {
      triggerToast(err.message, "error");
      setRiskAssessment(`### Analysis Error\n\n${err.message}`);
    } finally {
      setIsRiskLoading(false);
    }
  };

  // Pharmacological Research AI Chat submit (Doctor)
  const handleDocChatSubmit = async (queryText, fileData, mode = "standard") => {
    const userMsg = { 
      role: "user", 
      content: queryText || `Sent attachment: ${fileData?.fileName}`,
      fileUrl: fileData?.fileUrl || "",
      fileName: fileData?.fileName || "",
      fileType: fileData?.fileType || ""
    };
    
    let updatedHistory = [...doctorChat, userMsg];
    setDoctorChat(updatedHistory);
    
    try {
      await fetchWithAuth(`/api/chats/doctor/${selectedPatient._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg })
      });
    } catch (err) {
      console.warn("Failed to persist message to db", err);
    }

    setIsDocChatLoading(true);

    try {
      const res = await fetchWithAuth("/api/doctor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedHistory.map(m => ({ 
            role: m.role, 
            content: m.content,
            fileUrl: m.fileUrl,
            fileName: m.fileName,
            fileType: m.fileType
          })),
          context: docContext,
          mode
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const assistantMsg = { role: "assistant", content: data.reply };
      setDoctorChat(prev => [...prev, assistantMsg]);

      await fetchWithAuth(`/api/chats/doctor/${selectedPatient._id}`, {
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

  // Patient selects a doctor
  const handleSelectDoctor = (doctor) => {
    setSelectedDoctor(doctor);
    const consult = patientConsults.find(c => c.doctorId === doctor._id);
    setActiveConsultation(matchConsult(doctor._id));
  };

  const matchConsult = (doctorId) => {
    return patientConsults.find(c => c.doctorId === doctorId) || null;
  };

  // Consultation message send (Patient)
  const handlePatConsultMessageSubmit = async (messageText, fileData) => {
    setIsPatConsultLoading(true);
    try {
      const res = await fetchWithAuth(`/api/consultations/${activeConsultation._id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: user.id,
          senderName: user.name,
          content: messageText || `Shared attachment: ${fileData.fileName}`,
          fileUrl: fileData?.fileUrl || "",
          fileName: fileData?.fileName || "",
          fileType: fileData?.fileType || ""
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

  // Consultation message send (Doctor)
  const handleDocConsultMessageSubmit = async (messageText, fileData) => {
    setIsDocConsultLoading(true);
    try {
      const res = await fetchWithAuth(`/api/consultations/${selectedDocConsult._id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: user.id,
          senderName: user.name,
          content: messageText || `Shared attachment: ${fileData.fileName}`,
          fileUrl: fileData?.fileUrl || "",
          fileName: fileData?.fileName || "",
          fileType: fileData?.fileType || ""
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

  const handleRequestConsultation = async () => {
    if (!selectedDoctor) return;
    setIsPatConsultLoading(true);
    try {
      const res = await fetchWithAuth("/api/consultations/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: selectedDoctor._id,
          doctorName: selectedDoctor.name,
          patientId: user.id,
          patientName: user.name
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActiveConsultation(data);
      fetchPatientConsultations();
      triggerToast("Consultation request sent successfully!", "success");
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsPatConsultLoading(false);
    }
  };

  const handleAcceptConsultation = async (chatId) => {
    try {
      const res = await fetchWithAuth(`/api/consultations/${chatId}/accept`, {
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

  const handleSelectNotification = (req) => {
    setDoctorTab("directChats");
    setSelectedDocConsult(req);
  };

  // Medication Actions (supports batch adding multiple scheduled alarms)
  const handleAddMedication = async (e, times = [newMedication.time]) => {
    e.preventDefault();
    if (!newMedication.name || !newMedication.dosage) return;

    try {
      for (const alarmTime of times) {
        const res = await fetchWithAuth("/api/medications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newMedication.name,
            dosage: newMedication.dosage,
            frequency: newMedication.frequency,
            time: alarmTime,
            startDate: newMedication.startDate || new Date().toISOString().split("T")[0],
            endDate: newMedication.endDate || ""
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      }

      triggerToast(`Scheduled alarms for ${newMedication.name}`, "success");
      setNewMedication({ 
        name: "", 
        dosage: "", 
        frequency: "Once Daily", 
        time: "08:00",
        startDate: new Date().toISOString().split("T")[0],
        endDate: ""
      });
      fetchMedications();
    } catch (err) {
      triggerToast(err.message, "error");
    }
  };

  const handleToggleMedicationDose = async (medId, currentStatus) => {
    try {
      const todayDate = new Date().toISOString().split("T")[0];
      const res = await fetchWithAuth(`/api/medications/${medId}/toggle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taken: !currentStatus, date: todayDate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchMedications();
    } catch (err) {
      triggerToast("Failed to update status: " + err.message, "error");
    }
  };

  const handleDeleteMedication = async (medId) => {
    if (!window.confirm("Delete this medication alarm?")) return;
    try {
      const res = await fetchWithAuth(`/api/medications/${medId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        triggerToast("Medication alarm deleted.", "info");
        fetchMedications();
      }
    } catch (err) {
      triggerToast(err.message, "error");
    }
  };

  // Chartjs rendering logic (passed down to components)
  const renderPatientVitalsChart = (patient, canvas) => {
    if (!canvas || !window.Chart) return null;
    const ctx = canvas.getContext("2d");
    const history = patient.vitalsHistory || [];
    const labels = history.map(h => h.label);
    const bpData = history.map(h => h.bpSystolic);
    const sugarData = history.map(h => h.sugar);

    return new window.Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "BP Systolic",
            data: bpData,
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.05)",
            tension: 0.35,
            fill: true,
            yAxisID: "y-bp"
          },
          {
            label: "Sugar",
            data: sugarData,
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.05)",
            tension: 0.35,
            fill: true,
            yAxisID: "y-sugar"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          "y-bp": { type: "linear", position: "left", title: { display: true, text: "BP (mmHg)", font: { size: 9 } } },
          "y-sugar": { type: "linear", position: "right", title: { display: true, text: "Sugar (mg/dL)", font: { size: 9 } }, grid: { drawOnChartArea: false } }
        }
      }
    });
  };

  const renderVitalsChart = (patient, canvas) => {
    if (!canvas || !window.Chart) return null;
    const ctx = canvas.getContext("2d");
    
    // Parse datasets
    const history = patient.vitals || { labels: [], bpSystolic: [], sugar: [] };
    const labels = history.labels || [];
    const bpData = history.bpSystolic || [];
    const sugarData = history.sugar || [];

    return new window.Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "BP Systolic",
            data: bpData,
            borderColor: "#0284c7",
            backgroundColor: "rgba(2, 132, 199, 0.05)",
            tension: 0.35,
            fill: true,
            yAxisID: "y-bp"
          },
          {
            label: "Sugar",
            data: sugarData,
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.05)",
            tension: 0.35,
            fill: true,
            yAxisID: "y-sugar"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          "y-bp": { type: "linear", position: "left", title: { display: true, text: "BP (mmHg)", font: { size: 9 } } },
          "y-sugar": { type: "linear", position: "right", title: { display: true, text: "Sugar (mg/dL)", font: { size: 9 } }, grid: { drawOnChartArea: false } }
        }
      }
    });
  };

  // Derive notifications pending list
  const pendingRequests = user && user.role === "doctor" ? doctorConsults.filter(c => c.status === "pending") : [];
  const pendingCount = pendingRequests.length;

  return (
    <div className="app-container">
      {/* Toast notifications portal */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      {/* Main Workspace Router */}
      {!user ? (
        <AuthPortal 
          onAuthSuccess={handleAuthSuccess} 
          triggerToast={triggerToast} 
        />
      ) : (
        <div className="workspace-shell" style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
          {/* Collapsible Sidebar */}
          <Sidebar 
            user={user}
            doctorTab={doctorTab}
            setDoctorTab={setDoctorTab}
            patientTab={patientTab}
            setPatientTab={setPatientTab}
            dbStatus={dbStatus}
            pendingRequests={pendingRequests}
            pendingCount={pendingCount}
            onSelectNotification={handleSelectNotification}
            onSignOut={handleSignOut}
            onProfileUpdate={handleSidebarProfileUpdate}
            triggerToast={triggerToast}
            fetchPatientProfile={fetchPatientProfile}
            patientProfile={patientProfile}
            renderPatientVitalsChart={renderPatientVitalsChart}
          />

          {/* Main workspace container */}
          <main className="app-main-content" style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            {user.role === "doctor" ? (
              <>
                {doctorTab === "vitals" && (
                  <DoctorDashboard 
                    user={user}
                    patients={patients}
                    selectedPatient={selectedPatient}
                    handlePatientSelect={handlePatientSelect}
                    showNewPatForm={showNewPatForm}
                    setShowNewPatForm={setShowNewPatForm}
                    newPatient={newPatient}
                    setNewPatient={setNewPatient}
                    handleAddPatient={handleAddPatient}
                    handleGenerateRisk={handleGenerateRisk}
                    riskAssessment={riskAssessment}
                    isRiskLoading={isRiskLoading}
                    renderVitalsChart={renderVitalsChart}
                    doctorChat={doctorChat}
                    setDoctorChat={setDoctorChat}
                    docChatInput={docChatInput}
                    setDocChatInput={setDocChatInput}
                    isDocChatLoading={isDocChatLoading}
                    setIsDocChatLoading={setIsDocChatLoading}
                    showDocContext={showDocContext}
                    setShowDocContext={setShowDocContext}
                    docContext={docContext}
                    setDocContext={setDocContext}
                    handleDocChatSubmit={handleDocChatSubmit}
                    triggerToast={triggerToast}
                    fetchPatients={fetchPatients}
                    fetchWithAuth={fetchWithAuth}
                  />
                )}
                {doctorTab === "directChats" && (
                  <Consultations 
                    user={user}
                    doctorConsults={doctorConsults}
                    selectedDocConsult={selectedDocConsult}
                    setSelectedDocConsult={setSelectedDocConsult}
                    handleAcceptConsultation={handleAcceptConsultation}
                    isDocConsultLoading={isDocConsultLoading}
                    docConsultInput={docConsultInput}
                    setDocConsultInput={setDocConsultInput}
                    onDocMessageSubmit={handleDocConsultMessageSubmit}
                    triggerToast={triggerToast}
                  />
                )}
              </>
            ) : (
              <>
                {patientTab === "triage" && (
                  <TriageChatbot 
                    user={user}
                    patientChat={patientChat}
                    setPatientChat={setPatientChat}
                    triggerToast={triggerToast}
                    fetchWithAuth={fetchWithAuth}
                    speakText={speakText}
                    stopSpeech={stopSpeech}
                    speechRate={speechRate}
                    setSpeechRate={setSpeechRate}
                    speechVolume={speechVolume}
                    setSpeechVolume={setSpeechVolume}
                    speechPitch={speechPitch}
                    setSpeechPitch={setSpeechPitch}
                    fetchPatientProfile={fetchPatientProfile}
                  />
                )}
                {patientTab === "consultations" && (
                  <Consultations 
                    user={user}
                    doctorDirectory={doctorDirectory}
                    selectedDoctor={selectedDoctor}
                    handleSelectDoctor={handleSelectDoctor}
                    activeConsultation={activeConsultation}
                    isPatConsultLoading={isPatConsultLoading}
                    handleRequestConsultation={handleRequestConsultation}
                    patConsultInput={patConsultInput}
                    setPatConsultInput={setPatConsultInput}
                    onPatMessageSubmit={handlePatConsultMessageSubmit}
                    triggerToast={triggerToast}
                  />
                )}
                {patientTab === "scheduler" && (
                  <MedicationScheduler 
                    medications={medications}
                    newMedication={newMedication}
                    setNewMedication={setNewMedication}
                    handleAddMedication={handleAddMedication}
                    handleToggleMedicationDose={handleToggleMedicationDose}
                    handleDeleteMedication={handleDeleteMedication}
                  />
                )}
              </>
            )}

            {/* Centered bottom footer credit */}
            <footer style={{ padding: "2rem 0 1.5rem", borderTop: "1px solid var(--border-color)", marginTop: "2rem", display: "flex", justifyContent: "center", width: "100%" }}>
              <div style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                © 2026 AI-DOCTOR Clinical Network. All rights reserved. • MERN Advanced Medical Intelligence Portal
              </div>
            </footer>
          </main>
        </div>
      )}
    </div>
  );
}
