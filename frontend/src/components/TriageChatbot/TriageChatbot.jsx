import React, { useState, useEffect, useRef } from "react";
import { safeStorage } from "../../utils/safeStorage";
import "./TriageChatbot.css";

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

const compressImage = (file) => {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      return resolve(file);
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200;
        let width = img.width;
        let height = img.height;
        
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now()
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        }, "image/jpeg", 0.75);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
};

export default function TriageChatbot({
  user,
  patientChat,
  setPatientChat,
  triggerToast,
  fetchWithAuth,
  speakText,
  stopSpeech,
  speechRate,
  setSpeechRate,
  speechVolume,
  setSpeechVolume,
  speechPitch,
  setSpeechPitch,
  fetchPatientProfile,
  patientProfile
}) {
  
  const [chatMode, setChatMode] = useState("custom"); // custom (RAG), standard
  const [patChatInput, setPatChatInput] = useState("");
  const [isPatChatLoading, setIsPatChatLoading] = useState(false);
  
  // Scoped file sharing state
  const [chatFile, setChatFile] = useState(null);
  const [chatFileName, setChatFileName] = useState("");
  const [isChatFileUploading, setIsChatFileUploading] = useState(false);
  
  // Scoped OCR states
  const [activeScannerTab, setActiveScannerTab] = useState("upload"); // upload, manual, structured, vitals, saved
  const [reportText, setReportText] = useState("");
  const [isReportParsing, setIsReportParsing] = useState(false);
  const [parsedReport, setParsedReport] = useState(null);

  // Patient vitals log state
  const [patientVitalsForm, setPatientVitalsForm] = useState({
    label: "",
    bpSystolic: "",
    bpDiastolic: "",
    sugar: ""
  });
  const [isVitalsSubmitting, setIsVitalsSubmitting] = useState(false);
  
  // Translation summary
  const [englishSummary, setEnglishSummary] = useState("");
  const [hindiSummary, setHindiSummary] = useState("");

  // Scoped Delete handler for reports history
  const handleReportDelete = async (reportId) => {
    if (!window.confirm("Are you sure you want to delete this report record?")) return;
    try {
      const res = await fetchWithAuth(`/api/patient/reports/${reportId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        triggerToast("Report deleted successfully", "success");
        if (fetchPatientProfile && user) fetchPatientProfile(user.id);
        setParsedReport(null);
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete report.");
      }
    } catch (err) {
      triggerToast(err.message, "error");
    }
  };

  const [isReportSaving, setIsReportSaving] = useState(false);

  const handleSaveReportToProfile = async () => {
    if (!parsedReport) return;
    const defaultName = parsedReport._fileName || `Report - ${new Date().toLocaleDateString()}`;
    const name = window.prompt("Enter a name for this report to save under your profile:", defaultName);
    if (!name || !name.trim()) return;

    setIsReportSaving(true);
    try {
      const res = await fetchWithAuth("/api/patient/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportName: name.trim(),
          reportData: parsedReport
        })
      });
      if (res.ok) {
        triggerToast("Report saved to profile successfully!", "success");
        if (fetchPatientProfile && user) fetchPatientProfile(user.id);
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to save report.");
      }
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsReportSaving(false);
    }
  };

  const [isTranslating, setIsTranslating] = useState(false);

  const patChatEndRef = useRef(null);
  const chatFileInputRef = useRef(null);
  const reportFileInputRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    patChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [patientChat]);

  // Handle attachment change
  const handleChatFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        triggerToast("Maximum file size is 5MB.", "warning");
        return;
      }
      setChatFile(file);
      setChatFileName(file.name);
    }
  };

  const triggerChatFileInput = () => {
    chatFileInputRef.current?.click();
  };

  // Chat message submit
  const handlePatientChatSubmit = async (e) => {
    e.preventDefault();
    if (!patChatInput.trim() && !chatFile) return;

    const userMessageContent = patChatInput.trim();
    setPatChatInput("");
    setIsPatChatLoading(true);

    let fileData = null;

    // Dispatch file upload if exists
    if (chatFile) {
      setIsChatFileUploading(true);
      const formData = new FormData();
      try {
        const compressedFile = await compressImage(chatFile);
        formData.append("file", compressedFile);
        const token = safeStorage.getLocal("ai_doctor_token");
        const uploadRes = await fetch("/api/chats/upload", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`
          },
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || "File upload failed.");
        fileData = uploadData;
      } catch (err) {
        triggerToast("Could not send attachment: " + err.message, "error");
        setIsPatChatLoading(false);
        setIsChatFileUploading(false);
        return;
      } finally {
        setIsChatFileUploading(false);
        setChatFile(null);
        setChatFileName("");
      }
    }

    // Optimistically update UI
    const newUserMsg = {
      senderId: user.id,
      senderName: user.name,
      role: "user",
      content: userMessageContent || `Shared attachment: ${fileData.fileName}`,
      timestamp: new Date().toISOString(),
      ...(fileData && {
        fileUrl: fileData.fileUrl,
        fileName: fileData.fileName,
        fileType: fileData.fileType
      })
    };

    setPatientChat(prev => [...prev, newUserMsg]);

    try {
      const payload = {
        messages: [...patientChat, newUserMsg],
        mode: chatMode
      };
      
      const res = await fetchWithAuth("/api/patient/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch AI reply.");

      setPatientChat(prev => [...prev, {
        senderId: "assistant",
        senderName: "AI Assistant",
        role: "assistant",
        content: data.reply,
        timestamp: new Date().toISOString()
      }]);
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsPatChatLoading(false);
    }
  };

  // OCR report submission
  const handleReportParseSubmit = async (e) => {
    e.preventDefault();
    if (!reportText.trim()) return;
    setIsReportParsing(true);

    try {
      const res = await fetchWithAuth("/api/patient/parse-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed.");

      const result = data.analysis ? (typeof data.analysis === "string" ? JSON.parse(data.analysis) : data.analysis) : data;
      setParsedReport(result);
      setActiveScannerTab("structured");
      
      // Auto fill summaries
      const summaryText = `Diagnosed conditions: ${result.diagnosed_conditions?.join(", ") || "None"}. Prescriptions: ${result.prescribed_medications?.map(m => m.name).join(", ") || "None"}.`;
      setEnglishSummary(summaryText);
      setHindiSummary(""); // Reset translation until clicked
      triggerToast("Lab report structured successfully!", "success");
    } catch (err) {
      triggerToast("Parsing failed: " + err.message, "error");
    } finally {
      setIsReportParsing(false);
    }
  };

  // OCR file upload
  const handleReportUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsReportParsing(true);

    const formData = new FormData();
    try {
      const compressedFile = await compressImage(file);
      formData.append("reportFile", compressedFile);

      const res = await fetchWithAuth("/api/patient/parse-report", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OCR upload parsing failed.");

      const result = data.analysis ? (typeof data.analysis === "string" ? JSON.parse(data.analysis) : data.analysis) : data;
      setParsedReport(result);
      setActiveScannerTab("structured");
      
      const summaryText = `Diagnosed conditions: ${result.diagnosed_conditions?.join(", ") || "None"}. Prescriptions: ${result.prescribed_medications?.map(m => m.name).join(", ") || "None"}.`;
      setEnglishSummary(summaryText);
      setHindiSummary("");
      triggerToast("OCR file processed and structured!", "success");
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsReportParsing(false);
    }
  };

  const handlePatientLogVitals = async (e) => {
    e.preventDefault();
    if (!patientVitalsForm.label || !patientVitalsForm.bpSystolic || !patientVitalsForm.bpDiastolic || !patientVitalsForm.sugar) {
      triggerToast("Please fill in all fields.", "warning");
      return;
    }
    setIsVitalsSubmitting(true);
    try {
      const res = await fetchWithAuth(`/api/patients/${user.id}/vitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: patientVitalsForm.label,
          bpSystolic: parseInt(patientVitalsForm.bpSystolic),
          bpDiastolic: parseInt(patientVitalsForm.bpDiastolic),
          sugar: parseInt(patientVitalsForm.sugar)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      triggerToast("Your vitals have been saved!", "success");
      setPatientVitalsForm({ label: "", bpSystolic: "", bpDiastolic: "", sugar: "" });
      
      if (typeof fetchPatientProfile === "function") {
        await fetchPatientProfile(user.id);
      }
    } catch (err) {
      triggerToast("Failed to save vitals: " + err.message, "error");
    } finally {
      setIsVitalsSubmitting(false);
    }
  };

  // Translation to Hindi using backend summarize endpoint
  const handleTranslateToHindi = async () => {
    if (!parsedReport) return;
    setIsTranslating(true);
    try {
      const res = await fetchWithAuth("/api/patient/translate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportData: parsedReport })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Translation failed.");
      
      const fullText = data.summary || "";
      // Split combined bilingual response by headers
      const parts = fullText.split(/--- HINDI SUMMARY \(हिंदी सारांश\) ---|--- HINDI SUMMARY ---/i);
      let englishPart = parts[0].replace(/--- ENGLISH SUMMARY ---/i, "").trim();
      let hindiPart = parts[1] ? parts[1].trim() : "";
      
      if (englishPart) setEnglishSummary(englishPart);
      if (hindiPart) setHindiSummary(hindiPart);
      
      triggerToast("Bilingual summaries generated!", "success");
    } catch (err) {
      triggerToast("Translation error: " + err.message, "error");
    } finally {
      setIsTranslating(false);
    }
  };

  // Clear chat
  const clearPatientChatLogs = async () => {
    if (!window.confirm("Are you sure you want to clear your AI chat history?")) return;
    try {
      const res = await fetchWithAuth(`/api/chats/patient/${user.email}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setPatientChat([]);
        triggerToast("Chat logs cleared.", "info");
      }
    } catch (err) {
      triggerToast("Failed to clear chat.", "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 90px)", padding: "1rem", gap: "0.5rem", boxSizing: "border-box" }}>
      <div className="feature-header-box" style={{ marginBottom: "0.5rem" }}>
        <div className="feature-logo-frame">
          <span className="feature-icon">🤖</span>
        </div>
        <div className="feature-heading-group">
          <h1 className="feature-title">AI Symptom Triage</h1>
          <p className="feature-desc">Engage with symptom diagnostic models and parse clinical records automatically.</p>
        </div>
      </div>

      <div className="workspace-layout" style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", overflow: "hidden" }}>
        {/* Left Chat Stream */}
        <div className="workspace-content" style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
          <div className="card triage-chat-card" style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", height: "100%", padding: "1.25rem", gap: "1rem" }}>
            {/* Toggle Mode */}
            <div className="triage-engine-card">
          <div className="engine-toggle-group">
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Triage Engine Mode:</span>
            <button 
              className={`btn btn-secondary ${chatMode === "custom" ? "btn-patient" : ""}`}
              onClick={() => setChatMode("custom")}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
            >
              🔒 Custom
            </button>
            <button 
              className={`btn btn-secondary ${chatMode === "standard" ? "btn-patient" : ""}`}
              onClick={() => setChatMode("standard")}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
            >
              🌐 Standard
            </button>
          </div>

          <button className="btn btn-secondary" onClick={clearPatientChatLogs} style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}>
            🗑️ Clear History
          </button>
        </div>

        {/* Chat message stream */}
        <div className="chat-messages card">
          {patientChat.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", padding: "2rem" }}>
              <span style={{ fontSize: "2.5rem" }}>🤖</span>
              <h4>Patient AI Triage Hub</h4>
              <p style={{ fontSize: "0.8rem", textAlign: "center" }}>Describe your clinical symptoms or upload diagnostic records for instant triage support.</p>
            </div>
          ) : (
            patientChat.map((m, idx) => (
              <div 
                key={idx} 
                className={`message ${m.role === 'user' ? 'user-msg' : 'assistant-msg'}`}
              >
                <div style={{ fontWeight: "bold", fontSize: "0.7rem", marginBottom: "4px", opacity: 0.9 }}>
                  {m.senderName || (m.role === 'user' ? user.name : 'AI Assistant')}
                </div>
                
                {/* Text body */}
                <div dangerouslySetInnerHTML={{ __html: formatMarkdown(m.content) }}></div>
                
                {/* Attachment file widget */}
                {m.fileName && (
                  <div className="chat-file-preview" style={{ marginTop: "8px", background: "rgba(255, 255, 255, 0.1)", border: "none" }}>
                    <span>📂 {m.fileName}</span>
                    <a 
                      href={m.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ color: "#ffffff", textDecoration: "underline", marginLeft: "auto", fontSize: "0.7rem" }}
                    >
                      Download
                    </a>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={patChatEndRef} />
        </div>

        {/* Chat Input Section */}
        <form onSubmit={handlePatientChatSubmit} className="chat-input-area">
          <button 
            type="button" 
            className={`btn btn-secondary ${chatFile ? 'btn-patient' : ''}`}
            onClick={triggerChatFileInput} 
            title="Attach file (Max 5MB)"
            style={{ padding: "0.6rem 0.8rem" }}
          >
            📎
          </button>
          <input 
            type="file" 
            ref={chatFileInputRef} 
            style={{ display: "none" }} 
            onChange={handleChatFileChange} 
          />

          <input 
            type="text" 
            placeholder={chatFile ? `File attached: ${chatFileName}. Type a message...` : "Describe your symptoms..."}
            value={patChatInput}
            onChange={e => setPatChatInput(e.target.value)}
            style={{ flex: 1, padding: "0.6rem" }}
          />

          <button 
            type="submit" 
            className="btn btn-patient" 
            style={{ padding: "0.6rem 1.2rem" }} 
            disabled={isPatChatLoading || isChatFileUploading}
          >
            {isPatChatLoading ? "Sending..." : "Send"}
          </button>
        </form>

        {chatFile && (
          <div className="chat-file-preview">
            <span>📎 Attached File: <strong>{chatFileName}</strong></span>
            <button className="btn btn-secondary" style={{ marginLeft: "auto", padding: "2px 6px", fontSize: "0.7rem" }} onClick={() => { setChatFile(null); setChatFileName(""); }}>Cancel</button>
          </div>
        )}
          </div>
      </div>

      {/* Right OCR Scanner & Translate Panel */}
      <div className="workspace-right-sidebar" style={{ minHeight: 0 }}>
        {/* OCR Scanner */}
        <div className="card ocr-scanner-card">
          <h3 style={{ fontFamily: "var(--font-family-display)", fontSize: "1.1rem", marginBottom: "1rem" }}>
            📂 Medical Report OCR Scanner
          </h3>
          
          <div className="scanner-tabs">
            <button 
              className={`scanner-tab-btn ${activeScannerTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveScannerTab("upload")}
            >
              Upload Document
            </button>
            <button 
              className={`scanner-tab-btn ${activeScannerTab === 'manual' ? 'active' : ''}`}
              onClick={() => setActiveScannerTab("manual")}
            >
              Manual OCR Text
            </button>
            <button 
              className={`scanner-tab-btn ${activeScannerTab === 'vitals' ? 'active' : ''}`}
              onClick={() => setActiveScannerTab("vitals")}
            >
              📈 Log Vitals
            </button>
            {parsedReport && (
              <button 
                className={`scanner-tab-btn ${activeScannerTab === 'structured' ? 'active' : ''}`}
                onClick={() => setActiveScannerTab("structured")}
              >
                Structured JSON
              </button>
            )}
          </div>

          {activeScannerTab === "upload" && (
            <div style={{ textAlign: "center", padding: "1.5rem 1rem", border: "2px dashed var(--border-color)", borderRadius: "6px" }}>
              <span style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem" }}>📄</span>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>Upload prescription or report images to extract conditions, medications, and labs.</p>
              
              <button 
                className="btn btn-secondary btn-block" 
                onClick={() => reportFileInputRef.current?.click()}
                disabled={isReportParsing}
              >
                {isReportParsing ? "Processing File..." : "Choose File"}
              </button>
              <input 
                type="file" 
                ref={reportFileInputRef} 
                style={{ display: "none" }} 
                accept="image/*"
                onChange={handleReportUpload}
              />
            </div>
          )}

          {activeScannerTab === "manual" && (
            <form onSubmit={handleReportParseSubmit}>
              <textarea 
                rows="4" 
                placeholder="Paste messy OCR text from reports here..."
                value={reportText}
                onChange={e => setReportText(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", fontSize: "0.8rem" }}
              />
              <button type="submit" className="btn btn-patient btn-block mt-2" disabled={isReportParsing}>
                {isReportParsing ? "Analyzing Text..." : "Parse Report Content"}
              </button>
            </form>
          )}

          {activeScannerTab === "vitals" && (
            <form onSubmit={handlePatientLogVitals} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Month Label</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. Jul 2026"
                    value={patientVitalsForm.label}
                    onChange={e => setPatientVitalsForm({...patientVitalsForm, label: e.target.value})}
                    style={{ width: "100%", padding: "0.4rem", fontSize: "0.75rem" }}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Blood Sugar (mg/dL)</label>
                  <input 
                    type="number" 
                    required 
                    placeholder="e.g. 110"
                    value={patientVitalsForm.sugar}
                    onChange={e => setPatientVitalsForm({...patientVitalsForm, sugar: e.target.value})}
                    style={{ width: "100%", padding: "0.4rem", fontSize: "0.75rem" }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>BP Systolic (mmHg)</label>
                  <input 
                    type="number" 
                    required 
                    placeholder="e.g. 120"
                    value={patientVitalsForm.bpSystolic}
                    onChange={e => setPatientVitalsForm({...patientVitalsForm, bpSystolic: e.target.value})}
                    style={{ width: "100%", padding: "0.4rem", fontSize: "0.75rem" }}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>BP Diastolic (mmHg)</label>
                  <input 
                    type="number" 
                    required 
                    placeholder="e.g. 80"
                    value={patientVitalsForm.bpDiastolic}
                    onChange={e => setPatientVitalsForm({...patientVitalsForm, bpDiastolic: e.target.value})}
                    style={{ width: "100%", padding: "0.4rem", fontSize: "0.75rem" }}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-patient btn-block mt-2" disabled={isVitalsSubmitting}>
                {isVitalsSubmitting ? "Saving..." : "Log Vitals Entry"}
              </button>
            </form>
          )}



          {activeScannerTab === "structured" && parsedReport && (
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {/* Diagnosed Conditions */}
              {parsedReport.diagnosed_conditions?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <h5 style={{ fontSize: "0.8rem", color: "var(--color-patient-primary)", marginBottom: "4px" }}>Diagnosed Conditions</h5>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {parsedReport.diagnosed_conditions.map((c, i) => (
                      <span key={i} className="badge badge-patient" style={{ fontSize: "0.7rem" }}>{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Medications */}
              {parsedReport.prescribed_medications?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <h5 style={{ fontSize: "0.8rem", color: "var(--color-patient-primary)", marginBottom: "4px" }}>Prescribed Medications</h5>
                  <table className="report-data-table">
                    <thead>
                      <tr>
                        <th>Med</th>
                        <th>Dose</th>
                        <th>Freq</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedReport.prescribed_medications.map((m, i) => (
                        <tr key={i}>
                          <td><strong>{m.name}</strong></td>
                          <td>{m.dosage}</td>
                          <td>{m.frequency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Lab Markers */}
              {parsedReport.abnormal_lab_markers?.length > 0 && (
                <div>
                  <h5 style={{ fontSize: "0.8rem", color: "var(--color-patient-primary)", marginBottom: "4px" }}>Abnormal Lab Indicators</h5>
                  <table className="report-data-table">
                    <thead>
                      <tr>
                        <th>Marker</th>
                        <th>Value</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedReport.abnormal_lab_markers.map((l, i) => (
                        <tr key={i}>
                          <td>{l.test_name}</td>
                          <td>{l.value}</td>
                          <td style={{ color: l.status.toLowerCase() === 'high' ? 'red' : 'orange', fontWeight: 'bold' }}>{l.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Explicit save button to save parsed reports on demand */}
              <button 
                className="btn btn-patient btn-block mt-3"
                onClick={handleSaveReportToProfile}
                disabled={isReportSaving}
              >
                {isReportSaving ? "Saving report..." : "💾 Save Report to Profile"}
              </button>
            </div>
          )}
        </div>

        {/* Translation summary and Synthesizer */}
        <div className="card ocr-scanner-card">
          <h3 style={{ fontFamily: "var(--font-family-display)", fontSize: "1.1rem", marginBottom: "1rem" }}>
            🔊 Bilingual Triage Assistant
          </h3>
          
          <div className="translation-controls">
            {englishSummary ? (
              <>
                <div className="form-group">
                  <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    English Triage Notes
                    <button className="btn btn-secondary" style={{ padding: "2px 6px", fontSize: "0.65rem" }} onClick={() => speakText(englishSummary, "en")}>🔊 Speak</button>
                  </label>
                  <div className="translation-text-box">{englishSummary}</div>
                </div>

                {!hindiSummary ? (
                  <button className="btn btn-patient btn-block mt-1" onClick={handleTranslateToHindi} disabled={isTranslating}>
                    {isTranslating ? "Translating..." : "Translate summary to Hindi"}
                  </button>
                ) : (
                  <div className="form-group">
                    <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      Hindi Triage Notes (अनुवादित)
                      <button className="btn btn-secondary" style={{ padding: "2px 6px", fontSize: "0.65rem" }} onClick={() => speakText(hindiSummary, "hi")}>🔊 Speak</button>
                    </label>
                    <div className="translation-text-box" style={{ fontFamily: "sans-serif" }}>{hindiSummary}</div>
                  </div>
                )}
                
                <button className="btn btn-secondary btn-block" onClick={stopSpeech} style={{ padding: "0.4rem", fontSize: "0.75rem" }}>
                  🛑 Stop Text-to-Speech
                </button>
              </>
            ) : (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>Scan a report or chat with the AI assistant above to generate audio-bilingual triage summaries.</p>
            )}

            {/* Audio settings */}
            {englishSummary && (
              <div className="audio-settings-card">
                <h4 style={{ fontSize: "0.85rem", margin: 0, marginBottom: "0.5rem" }}>Speech Customization</h4>
                <div className="form-group">
                  <label style={{ fontSize: "0.7rem" }}>Speed: {speechRate}x</label>
                  <input type="range" min="0.5" max="2" step="0.1" value={speechRate} onChange={e => setSpeechRate(parseFloat(e.target.value))} />
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label style={{ fontSize: "0.7rem" }}>Pitch: {speechPitch}</label>
                    <input type="range" min="0.5" max="1.5" step="0.1" value={speechPitch} onChange={e => setSpeechPitch(parseFloat(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label style={{ fontSize: "0.7rem" }}>Volume: {Math.round(speechVolume * 100)}%</label>
                    <input type="range" min="0" max="1" step="0.1" value={speechVolume} onChange={e => setSpeechVolume(parseFloat(e.target.value))} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
