import React, { useState, useEffect, useRef } from "react";
import { safeStorage } from "../../utils/safeStorage";
import "./DoctorDashboard.css";

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

export default function DoctorDashboard({
  user,
  patients,
  selectedPatient,
  handlePatientSelect,
  showNewPatForm,
  setShowNewPatForm,
  newPatient,
  setNewPatient,
  handleAddPatient,
  handleGenerateRisk,
  riskAssessment,
  isRiskLoading,
  renderVitalsChart,
  
  // Doctor AI Research chat props
  doctorChat,
  setDoctorChat,
  docChatInput,
  setDocChatInput,
  isDocChatLoading,
  setIsDocChatLoading,
  showDocContext,
  setShowDocContext,
  docContext,
  setDocContext,
  handleDocChatSubmit,
  triggerToast,
  fetchPatients,
  fetchWithAuth
}) {
  const canvasRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const docChatEndRef = useRef(null);
  const chatFileInputRef = useRef(null);

  // Scoped file sharing state for doctor research assistant
  const [chatFile, setChatFile] = useState(null);
  const [chatFileName, setChatFileName] = useState("");
  const [isChatFileUploading, setIsChatFileUploading] = useState(false);
  const [chatMode, setChatMode] = useState("standard");

  // Patient Vitals form logging state
  const [vitalsForm, setVitalsForm] = useState({
    label: "",
    bpSystolic: "",
    bpDiastolic: "",
    sugar: ""
  });
  const [isVitalsSubmitting, setIsVitalsSubmitting] = useState(false);

  const handleLogVitals = async (e) => {
    e.preventDefault();
    if (!vitalsForm.label || !vitalsForm.bpSystolic || !vitalsForm.bpDiastolic || !vitalsForm.sugar) {
      triggerToast("Please fill in all vitals fields.", "warning");
      return;
    }
    setIsVitalsSubmitting(true);
    try {
      const res = await fetchWithAuth(`/api/patients/${selectedPatient.userId}/vitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: vitalsForm.label,
          bpSystolic: parseInt(vitalsForm.bpSystolic),
          bpDiastolic: parseInt(vitalsForm.bpDiastolic),
          sugar: parseInt(vitalsForm.sugar)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      triggerToast("Patient vitals logged successfully!", "success");
      setVitalsForm({ label: "", bpSystolic: "", bpDiastolic: "", sugar: "" });
      
      if (typeof fetchPatients === "function") {
        await fetchPatients();
      }
      
      // Update selected patient profile in dashboard state
      handlePatientSelect(data);
    } catch (err) {
      triggerToast("Failed to log vitals: " + err.message, "error");
    } finally {
      setIsVitalsSubmitting(false);
    }
  };

  // Auto scroll logic for AI research chat
  useEffect(() => {
    docChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [doctorChat]);

  // Sync Vitals Chart inside doctor dashboard when patient selection or patients list changes
  useEffect(() => {
    if (selectedPatient) {
      const timer = setTimeout(() => {
        if (canvasRef.current) {
          if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
            chartInstanceRef.current = null;
          }
          
          const chartInstance = renderVitalsChart(selectedPatient, canvasRef.current);
          if (chartInstance) {
            chartInstanceRef.current = chartInstance;
          }
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [selectedPatient, patients]);

  // Clean chart instances
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  // Handle local attachment sharing
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

  const uploadFile = async () => {
    if (!chatFile) return null;
    setIsChatFileUploading(true);
    const formData = new FormData();
    try {
      const compressedFile = await compressImage(chatFile);
      formData.append("file", compressedFile);
      const token = safeStorage.getLocal("ai_doctor_token");
      const res = await fetch("/api/chats/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "File upload failed.");
      return data;
    } catch (err) {
      triggerToast("File sharing failed: " + err.message, "error");
      return null;
    } finally {
      setIsChatFileUploading(false);
      setChatFile(null);
      setChatFileName("");
    }
  };

  const handleDocChatFormSubmit = async (e) => {
    e.preventDefault();
    if (!docChatInput.trim() && !chatFile) return;

    let fileData = null;
    if (chatFile) {
      fileData = await uploadFile();
      if (!fileData) return;
    }

    handleDocChatSubmit(docChatInput.trim(), fileData, chatMode);
    setDocChatInput("");
  };

  const renderMessageAttachment = (m) => {
    if (!m.fileName) return null;
    return (
      <div className="chat-file-preview" style={{ marginTop: "8px", background: "rgba(255, 255, 255, 0.1)", border: "none", color: "#ffffff" }}>
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
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 90px)", padding: "1rem", gap: "0.5rem", boxSizing: "border-box" }}>
      <div className="feature-header-box" style={{ marginBottom: "0.5rem" }}>
        <div className="feature-logo-frame">
          <span className="feature-icon">📋</span>
        </div>
        <div className="feature-heading-group">
          <h1 className="feature-title">Specialist Patient Directory</h1>
          <p className="feature-desc">Monitor patient vitals, review reports, and analyze AI health risk assessments.</p>
        </div>
      </div>
      
      <div className="doctor-dashboard-layout" style={{ display: "grid", gridTemplateColumns: "280px 1fr 340px", gap: "1.5rem", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Sidebar Patients list */}
        <aside className="workspace-sidebar card" style={{ minHeight: 0, height: "100%", overflowY: "auto" }}>
        <div className="sidebar-header">
          <h3>👥 Active Patients</h3>
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
          👤 {showNewPatForm ? "Cancel" : "Add Patient Profile"}
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
                style={{ width: "100%", background: "var(--bg-main)", border: "1px solid var(--border-color)", color: "var(--text-main)", padding: "0.4rem", borderRadius: "4px", outline: "none", fontSize: "0.8rem" }}
                value={newPatient.reportSummary}
                onChange={e => setNewPatient({...newPatient, reportSummary: e.target.value})}
              />
            </div>
            <button type="submit" className="btn btn-doctor btn-block mt-2">Save Profile</button>
          </form>
        )}
      </aside>

      {/* Main content: Vitals charts */}
      <div className="workspace-content" style={{ minHeight: 0, height: "100%", overflowY: "auto" }}>
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
                    🛡️ {isRiskLoading ? "Analyzing..." : "Generate Risk Assessment"}
                  </button>
                </div>
              </div>

              <div className="vitals-grid">
                <div className="vital-card">
                  <div className="vital-header">
                    <span className="vital-label">Last Blood Pressure</span>
                    <i className="vital-icon bp-color" style={{ fontStyle: "normal" }}>❤️</i>
                  </div>
                  <div className="vital-value">{selectedPatient.latestVitals?.bp || "--"} mmHg</div>
                  <div className={`vital-trend ${selectedPatient.latestVitals?.bpTrendClass}`} style={{ fontSize: "0.75rem" }}>
                    {selectedPatient.latestVitals?.bpTrend || "Normal"}
                  </div>
                </div>

                <div className="vital-card">
                  <div className="vital-header">
                    <span className="vital-label">Last Blood Sugar</span>
                    <i className="vital-icon sugar-color" style={{ fontStyle: "normal" }}>💧</i>
                  </div>
                  <div className="vital-value">{selectedPatient.latestVitals?.sugar || "--"} mg/dL</div>
                  <div className={`vital-trend ${selectedPatient.latestVitals?.sugarTrendClass}`} style={{ fontSize: "0.75rem" }}>
                    {selectedPatient.latestVitals?.sugarTrend || "Normal"}
                  </div>
                </div>
              </div>

              {/* Chart container */}
              <div className="chart-container">
                <div className="chart-header">
                  <h4>Vitals History Log</h4>
                  <div className="chart-legend">
                    <span className="legend-item"><span className="legend-color bp-legend" style={{ backgroundColor: "#10b981", width: "8px", height: "8px", display: "inline-block", marginRight: "3px" }}></span>BP</span>
                    <span className="legend-item"><span className="legend-color sugar-legend" style={{ backgroundColor: "#f59e0b", width: "8px", height: "8px", display: "inline-block", marginRight: "3px" }}></span>Sugar</span>
                  </div>
                </div>
                <div className="chart-wrapper">
                  <canvas ref={canvasRef}></canvas>
                </div>
              </div>

              {/* Log Vitals Entry Form */}
              <form onSubmit={handleLogVitals} className="card-inner" style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem" }}>📈 Log Patient Vitals Entry</h4>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Month Label</label>
                    <input 
                      type="text" 
                      required 
                      placeholder="e.g. Jul 2026"
                      value={vitalsForm.label}
                      onChange={e => setVitalsForm({...vitalsForm, label: e.target.value})}
                      style={{ width: "100%", padding: "0.4rem", fontSize: "0.75rem" }}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Sugar (mg/dL)</label>
                    <input 
                      type="number" 
                      required 
                      placeholder="e.g. 110"
                      value={vitalsForm.sugar}
                      onChange={e => setVitalsForm({...vitalsForm, sugar: e.target.value})}
                      style={{ width: "100%", padding: "0.4rem", fontSize: "0.75rem" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>BP Systolic (mmHg)</label>
                    <input 
                      type="number" 
                      required 
                      placeholder="e.g. 120"
                      value={vitalsForm.bpSystolic}
                      onChange={e => setVitalsForm({...vitalsForm, bpSystolic: e.target.value})}
                      style={{ width: "100%", padding: "0.4rem", fontSize: "0.75rem" }}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>BP Diastolic (mmHg)</label>
                    <input 
                      type="number" 
                      required 
                      placeholder="e.g. 80"
                      value={vitalsForm.bpDiastolic}
                      onChange={e => setVitalsForm({...vitalsForm, bpDiastolic: e.target.value})}
                      style={{ width: "100%", padding: "0.4rem", fontSize: "0.75rem" }}
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-patient btn-block mt-2" disabled={isVitalsSubmitting} style={{ padding: "0.4rem", fontSize: "0.8rem" }}>
                  {isVitalsSubmitting ? "Logging Vitals..." : "Save Vitals Data Point"}
                </button>
              </form>

              {/* Patient report summary */}
              <div className="patient-report-summary card-inner" style={{ marginTop: "1.5rem" }}>
                <h4>📋 Clinical Diagnoses & Notes</h4>
                <p>{selectedPatient.reportSummary || "No diagnostic notes added yet."}</p>
              </div>

              {/* Risk Assessment AI Insights */}
              {riskAssessment && (
                <div className="risk-assessment-sheet">
                  <h4 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", fontSize: "0.95rem", color: "#ef4444" }}>
                    ⚠️ Clinical AI Risk Intelligence Report
                  </h4>
                  <div 
                    style={{ fontSize: "0.85rem", lineHeight: "1.6", whiteSpace: "pre-wrap" }}
                    dangerouslySetInnerHTML={{ 
                      __html: riskAssessment
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/\*(.*?)\*/g, "<em>$1</em>") 
                    }}
                  ></div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="card" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "300px" }}>
            <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
              <i style={{ fontSize: "3rem", display: "block", marginBottom: "1rem", fontStyle: "normal" }}>🩺</i>
              <h3>Select a Patient Profile</h3>
              <p>Choose an active profile from the left sidebar to analyze medical history, charts, and risks.</p>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Right: Doctor Research chat */}
      <aside className="workspace-chat-sidebar card" style={{ minHeight: 0, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div className="chat-header" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--border-color)", marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <h3 style={{ fontSize: "1rem", margin: 0 }}>🤖 Clinical Research AI</h3>
            <button className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }} onClick={() => setShowDocContext(!showDocContext)} title="Configure Clinical Context">
              ⚙️ Context
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", width: "100%" }}>
            <button 
              type="button"
              className={`btn btn-secondary ${chatMode === "custom" ? "btn-doctor" : ""}`} 
              onClick={() => setChatMode("custom")}
              style={{ flex: 1, padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}
            >
              🔒 Custom
            </button>
            <button 
              type="button"
              className={`btn btn-secondary ${chatMode === "standard" ? "btn-doctor" : ""}`} 
              onClick={() => setChatMode("standard")}
              style={{ flex: 1, padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}
            >
              🌐 Standard
            </button>
          </div>
        </div>

        {showDocContext && (
          <div className="chat-context-panel" style={{ padding: "0.75rem", background: "#f8fafc", borderRadius: "6px", marginBottom: "0.5rem", border: "1px dashed #cbd5e1" }}>
            <h4 style={{ margin: 0, marginBottom: "0.5rem", fontSize: "0.8rem" }}>Active Prompt Context</h4>
            <div className="form-group" style={{ marginBottom: "0.4rem" }}>
              <label style={{ fontSize: "0.65rem" }}>Age Group</label>
              <select 
                value={docContext.ageGroup} 
                style={{ fontSize: "0.75rem", padding: "0.2rem" }}
                onChange={e => setDocContext({...docContext, ageGroup: e.target.value})}
              >
                <option>Adult</option>
                <option>Geriatric</option>
                <option>Pediatric</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: "0.4rem" }}>
              <label style={{ fontSize: "0.65rem" }}>Renal Clearances</label>
              <select 
                value={docContext.kidneyFunction}
                style={{ fontSize: "0.75rem", padding: "0.2rem" }}
                onChange={e => setDocContext({...docContext, kidneyFunction: e.target.value})}
              >
                <option>Normal</option>
                <option>Mild Impairment</option>
                <option>Moderate Impairment (eGFR 30-59)</option>
                <option>Severe Impairment (eGFR &lt;30)</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: "0.65rem" }}>Current Medications</label>
              <input 
                type="text" 
                placeholder="e.g. Metformin"
                style={{ fontSize: "0.75rem", padding: "0.2rem" }}
                value={docContext.otherMeds}
                onChange={e => setDocContext({...docContext, otherMeds: e.target.value})}
              />
            </div>
          </div>
        )}

        <div className="chat-messages" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div className="message system-msg">
            <strong>Research Assistant:</strong> Chat messages are securely persisted. Ask clinical interactions.
          </div>
          {doctorChat.map((m, index) => (
            <div key={index} className={`message ${m.role === 'assistant' ? 'assistant' : 'user'}-msg`} style={{ maxWidth: "85%" }}>
              <div dangerouslySetInnerHTML={{ __html: formatMarkdown(m.content) }}></div>
              {renderMessageAttachment(m)}
            </div>
          ))}
          {isDocChatLoading && (
            <div className="message assistant-msg">
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span>Consulting pharmacological rules...</span>
              </div>
            </div>
          )}
          <div ref={docChatEndRef} />
        </div>

        <div className="chat-suggestions" style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
          <button className="suggestion-tag" style={{ fontSize: "0.65rem" }} onClick={() => setDocChatInput("Explain Metformin contraindications in contrast CT scan")}>Metformin & Contrast Dye</button>
        </div>

        {/* Input form */}
        <form className="chat-input-form chat-input-container" onSubmit={handleDocChatFormSubmit}>
          {chatFileName && (
            <div className="attachment-preview-bar" style={{ padding: "4px 8px", fontSize: "0.7rem", marginBottom: "4px" }}>
              <span>📎 {chatFileName}</span>
              <button type="button" style={{ border: "none", background: "none", marginLeft: "auto" }} onClick={() => {setChatFile(null); setChatFileName("");}}>&times;</button>
            </div>
          )}
          <div style={{ display: "flex", gap: "0.4rem", width: "100%" }}>
            <button 
              type="button" 
              className="btn btn-secondary btn-icon" 
              title="Attach File"
              onClick={() => chatFileInputRef.current.click()}
              style={{ padding: "0.4rem" }}
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
              placeholder={selectedPatient ? `Message for ${selectedPatient.name}...` : "Select a patient first"}
              disabled={!selectedPatient || isChatFileUploading}
              value={docChatInput}
              onChange={e => setDocChatInput(e.target.value)}
              style={{ flex: 1, padding: "0.4rem", fontSize: "0.8rem" }}
            />
            <button type="submit" className="btn btn-doctor" disabled={!selectedPatient || isChatFileUploading} style={{ padding: "0.4rem 0.75rem" }}>
              Send
            </button>
          </div>
        </form>
      </aside>
    </div>
  </div>
  );
}
