import React, { useState, useEffect, useRef } from "react";
import { safeStorage } from "../../utils/safeStorage";
import "./Consultations.css";

export default function Consultations({
  user,
  doctorDirectory,
  selectedDoctor,
  handleSelectDoctor,
  activeConsultation,
  isPatConsultLoading,
  handleRequestConsultation,
  patConsultInput,
  setPatConsultInput,
  onPatMessageSubmit,
  
  doctorConsults,
  selectedDocConsult,
  setSelectedDocConsult,
  handleAcceptConsultation,
  isDocConsultLoading,
  docConsultInput,
  setDocConsultInput,
  onDocMessageSubmit,
  
  triggerToast
}) {
  const [chatFile, setChatFile] = useState(null);
  const [chatFileName, setChatFileName] = useState("");
  const [isChatFileUploading, setIsChatFileUploading] = useState(false);

  const chatFileInputRef = useRef(null);
  const patConsultEndRef = useRef(null);
  const docConsultEndRef = useRef(null);

  // Auto scroll logic
  useEffect(() => {
    if (user.role === "patient") {
      patConsultEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      docConsultEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeConsultation?.messages, selectedDocConsult?.messages]);

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

  // Submit patient message
  const handlePatMessageFormSubmit = async (e) => {
    e.preventDefault();
    if (!patConsultInput.trim() && !chatFile) return;
    
    let fileData = null;
    if (chatFile) {
      fileData = await uploadFile();
      if (!fileData) return; // Stop if upload failed
    }

    onPatMessageSubmit(patConsultInput.trim(), fileData);
    setPatConsultInput("");
  };

  // Submit doctor message
  const handleDocMessageFormSubmit = async (e) => {
    e.preventDefault();
    if (!docConsultInput.trim() && !chatFile) return;

    let fileData = null;
    if (chatFile) {
      fileData = await uploadFile();
      if (!fileData) return;
    }

    onDocMessageSubmit(docConsultInput.trim(), fileData);
    setDocConsultInput("");
  };

  // Message attachment renderer
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

  // RENDER PATIENT VIEW
  if (user.role === "patient") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", padding: "1.5rem", gap: "0" }}>
        <div className="feature-header-box">
          <div className="feature-logo-frame">
            <span className="feature-icon">💬</span>
          </div>
          <div className="feature-heading-group">
            <h1 className="feature-title">Clinical Consultations Hub</h1>
            <p className="feature-desc">Manage direct connections, request approvals, and chat with medical specialists.</p>
          </div>
        </div>
        
        <div className="workspace-layout patient-theme" style={{ flex: 1, display: "grid", gridTemplateColumns: "280px 1fr", gap: "1.5rem", height: "calc(100% - 75px)", overflow: "hidden" }}>
          {/* Left Sidebar: Doctors Directory */}
          <aside className="workspace-sidebar card">
          <div className="sidebar-header">
            <h3>👥 Specialists Directory</h3>
            <span className="badge badge-patient">{doctorDirectory.length} Registered</span>
          </div>
          
          <div className="patient-list">
            {doctorDirectory.map(d => {
              const isOnline = d.email === "doctor@aidoctor.com" || d.experience % 2 === 0;
              return (
                <div 
                  key={d._id}
                  className={`patient-item ${selectedDoctor && selectedDoctor._id === d._id ? 'active' : ''}`}
                  onClick={() => handleSelectDoctor(d)}
                >
                  <div className="patient-item-header">
                    <span className="patient-item-name" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span 
                        style={{ 
                          width: "8px", 
                          height: "8px", 
                          borderRadius: "50%", 
                          backgroundColor: isOnline ? "#10b981" : "#94a3b8",
                          display: "inline-block",
                          boxShadow: isOnline ? "0 0 6px #10b981" : "none"
                        }}
                        title={isOnline ? "Online" : "Offline"}
                      ></span>
                      {d.name}
                    </span>
                    <span className="badge badge-doctor" style={{ fontSize: "0.6rem" }}>{d.specialty}</span>
                  </div>
                  <div className="patient-item-sub">{d.hospital} • Exp: {d.experience} yrs</div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Pane: Conversation workspace */}
        <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {selectedDoctor ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "1rem", borderBottom: "1px solid var(--border-color)", marginBottom: "1rem" }}>
                <div>
                  <h2 style={{ fontFamily: "var(--font-family-display)", fontSize: "1.4rem" }}>Consulting: {selectedDoctor.name}</h2>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Specialty: {selectedDoctor.specialty} ({selectedDoctor.hospital})</span>
                </div>

                {!activeConsultation && (
                  <button className="btn btn-patient" onClick={handleRequestConsultation} disabled={isPatConsultLoading}>
                    ✉️ Send Consultation Request
                  </button>
                )}
              </div>

              {activeConsultation ? (
                <>
                  {/* Messages stream */}
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
                        <span style={{ fontSize: "0.75rem", opacity: 0.8, display: "block", marginBottom: "0.2rem" }}>{m.senderName}</span>
                        <div>{m.content}</div>
                        {renderMessageAttachment(m)}
                      </div>
                    ))}
                    <div ref={patConsultEndRef} />
                  </div>

                  {/* Input form */}
                  <form className="chat-input-form chat-input-container" onSubmit={handlePatMessageFormSubmit} style={{ marginTop: "1rem" }}>
                    {chatFileName && (
                      <div className="attachment-preview-bar">
                        <span>📎 Attached File: <strong>{chatFileName}</strong></span>
                        <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto", padding: "2px 6px", fontSize: "0.7rem" }} onClick={() => {setChatFile(null); setChatFileName("");}}>Cancel</button>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-icon" 
                        title="Attach File"
                        disabled={isPatConsultLoading || isChatFileUploading}
                        onClick={() => chatFileInputRef.current.click()}
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
                        placeholder="Type your message to the doctor..."
                        value={patConsultInput}
                        onChange={e => setPatConsultInput(e.target.value)}
                        disabled={isPatConsultLoading || isChatFileUploading}
                        required={!chatFile}
                        style={{ flex: 1, padding: "0.6rem" }}
                      />
                      <button type="submit" className="btn btn-patient" disabled={isPatConsultLoading || isChatFileUploading} style={{ padding: "0.6rem 1.2rem" }}>
                        Send
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", color: "var(--text-muted)" }}>
                  <span style={{ fontSize: "3rem" }}>✉️</span>
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
    </div>
    );
  }

  // RENDER DOCTOR VIEW
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", padding: "1.5rem", gap: "0" }}>
      <div className="feature-header-box">
        <div className="feature-logo-frame">
          <span className="feature-icon">💬</span>
        </div>
        <div className="feature-heading-group">
          <h1 className="feature-title">Clinical Consultations Hub</h1>
          <p className="feature-desc">Manage direct connections, accept patient chats, and exchange treatment referrals.</p>
        </div>
      </div>
      
      <div className="workspace-layout" style={{ flex: 1, display: "grid", gridTemplateColumns: "280px 1fr", gap: "1.5rem", height: "calc(100% - 75px)", overflow: "hidden" }}>
        {/* Left Sidebar: Active consultation list */}
        <aside className="workspace-sidebar card">
        <div className="sidebar-header">
          <h3>💬 Active Direct Chats</h3>
          <span className="badge badge-doctor">{doctorConsults.length} Sessions</span>
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

      {/* Right Pane: Direct messaging stream */}
      <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {selectedDocConsult ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "1rem", borderBottom: "1px solid var(--border-color)", marginBottom: "1rem" }}>
              <div>
                <h2 style={{ fontFamily: "var(--font-family-display)", fontSize: "1.4rem" }}>Direct Chat: {selectedDocConsult.patientName}</h2>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Session: {selectedDocConsult._id}</span>
              </div>
              
              {selectedDocConsult.status === "pending" && (
                <button className="btn btn-doctor" onClick={() => handleAcceptConsultation(selectedDocConsult._id)}>
                  ✓ Accept Consultation Request
                </button>
              )}
            </div>

            {/* Chats stream */}
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
                  <span style={{ fontSize: "0.75rem", opacity: 0.8, display: "block", marginBottom: "0.2rem" }}>{m.senderName}</span>
                  <div>{m.content}</div>
                  {renderMessageAttachment(m)}
                </div>
              ))}
              <div ref={docConsultEndRef} />
            </div>

            {/* Input form */}
            <form className="chat-input-form chat-input-container" onSubmit={handleDocMessageFormSubmit} style={{ marginTop: "1rem" }}>
              {chatFileName && (
                <div className="attachment-preview-bar">
                  <span>📎 Attached File: <strong>{chatFileName}</strong></span>
                  <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto", padding: "2px 6px", fontSize: "0.7rem" }} onClick={() => {setChatFile(null); setChatFileName("");}}>Cancel</button>
                </div>
              )}
              <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                <button 
                  type="button" 
                  className="btn btn-secondary btn-icon" 
                  title="Attach File"
                  disabled={selectedDocConsult.status === 'pending' || isChatFileUploading}
                  onClick={() => chatFileInputRef.current.click()}
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
                  placeholder={selectedDocConsult.status === 'active' ? "Type medical advice/reply here..." : "Please accept request to enable messaging"}
                  disabled={selectedDocConsult.status === 'pending' || isDocConsultLoading || isChatFileUploading}
                  value={docConsultInput}
                  onChange={e => setDocConsultInput(e.target.value)}
                  required={!chatFile}
                  style={{ flex: 1, padding: "0.6rem" }}
                />
                <button type="submit" className="btn btn-doctor" disabled={selectedDocConsult.status === 'pending' || isDocConsultLoading || isChatFileUploading} style={{ padding: "0.6rem 1.2rem" }}>
                  Send
                </button>
              </div>
            </form>
          </>
        ) : (
          <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
            Select an active patient chat or request card from the sidebar list.
          </div>
        )}
      </div>
    </div>
  </div>
  );
}
