import React, { useState, useEffect, useRef } from "react";
import { safeStorage } from "../../utils/safeStorage";
import "./Consultations.css";

export default function Consultations({
  user,
  doctorDirectory = [],
  selectedDoctor,
  handleSelectDoctor,
  activeConsultation,
  isPatConsultLoading,
  handleRequestConsultation,
  patConsultInput,
  setPatConsultInput,
  onPatMessageSubmit,
  
  doctorConsults = [],
  selectedDocConsult,
  setSelectedDocConsult,
  handleAcceptConsultation,
  isDocConsultLoading,
  docConsultInput,
  setDocConsultInput,
  onDocMessageSubmit,
  
  socketConnected = false,
  onlineUserIds = new Set(),
  activeTypingUsers = {},
  onSendTyping,
  
  triggerToast
}) {
  // Attachment states
  const [chatFile, setChatFile] = useState(null);
  const [chatFileName, setChatFileName] = useState("");
  const [chatFileSize, setChatFileSize] = useState("");
  const [chatFileType, setChatFileType] = useState("");
  const [chatFilePreview, setChatFilePreview] = useState(null);
  const [isChatFileUploading, setIsChatFileUploading] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [fileCategoryFilter, setFileCategoryFilter] = useState("*");

  // Drag-and-drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Lightbox Modal state
  const [lightboxMedia, setLightboxMedia] = useState(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxRotation, setLightboxRotation] = useState(0);

  // In-chat Voice Recording states
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // References
  const chatFileInputRef = useRef(null);
  const patConsultEndRef = useRef(null);
  const docConsultEndRef = useRef(null);
  const typingDebounceTimerRef = useRef(null);

  const activeChatId = user.role === "patient" ? activeConsultation?._id : selectedDocConsult?._id;
  const activeTypingName = activeChatId ? activeTypingUsers[activeChatId] : null;

  // Auto-scroll on new messages or typing
  useEffect(() => {
    if (user.role === "patient") {
      patConsultEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      docConsultEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeConsultation?.messages, selectedDocConsult?.messages, activeTypingName]);

  // Handle escape key to close lightbox
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && lightboxMedia) {
        closeLightbox();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxMedia]);

  // Clean up object URLs and recording timers
  useEffect(() => {
    return () => {
      if (chatFilePreview && chatFilePreview.startsWith("blob:")) {
        URL.revokeObjectURL(chatFilePreview);
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (typingDebounceTimerRef.current) {
        clearTimeout(typingDebounceTimerRef.current);
      }
    };
  }, [chatFilePreview]);

  // Format file size helper
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Determine file type category from name/mime
  const getFileCategory = (file) => {
    const mime = (file.type || "").toLowerCase();
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();

    if (mime.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".bmp"].includes(ext)) {
      return "image";
    }
    if (mime === "application/pdf" || ext === ".pdf") {
      return "pdf";
    }
    if (mime.startsWith("audio/") || [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".weba"].includes(ext)) {
      return "audio";
    }
    if (mime.startsWith("video/") || [".mp4", ".webm", ".mov", ".mkv"].includes(ext)) {
      return "video";
    }
    return "document";
  };

  // Process selected file
  const processSelectedFile = (file) => {
    if (!file) return;

    // Up to 25MB limit
    if (file.size > 25 * 1024 * 1024) {
      triggerToast("Maximum file size allowed is 25MB.", "warning");
      return;
    }

    const category = getFileCategory(file);
    setChatFile(file);
    setChatFileName(file.name);
    setChatFileSize(formatBytes(file.size));
    setChatFileType(category);

    if (category === "image") {
      const previewUrl = URL.createObjectURL(file);
      setChatFilePreview(previewUrl);
    } else {
      setChatFilePreview(null);
    }

    setShowAttachmentMenu(false);
  };

  const handleChatFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      processSelectedFile(file);
    }
    e.target.value = "";
  };

  // Open file dialog with specific category filter
  const openFilePicker = (acceptType) => {
    setFileCategoryFilter(acceptType);
    setShowAttachmentMenu(false);
    setTimeout(() => {
      if (chatFileInputRef.current) {
        chatFileInputRef.current.accept = acceptType;
        chatFileInputRef.current.click();
      }
    }, 50);
  };

  // Drag and Drop Handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processSelectedFile(file);
      triggerToast(`Attached: ${file.name}`, "info");
    }
  };

  // Voice Note Recording
  const startVoiceRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        triggerToast("Voice recording is not supported in this browser.", "warning");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const voiceFile = new File([audioBlob], `voice-note-${Date.now()}.webm`, {
          type: "audio/webm",
          lastModified: Date.now()
        });

        processSelectedFile(voiceFile);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

      triggerToast("Recording voice note...", "info");
    } catch (err) {
      console.warn("Microphone access failed", err);
      triggerToast("Microphone permission denied or unavailable.", "error");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecordingVoice) {
      mediaRecorderRef.current.stop();
      setIsRecordingVoice(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecordingVoice) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecordingVoice(false);
      clearInterval(recordingTimerRef.current);
      audioChunksRef.current = [];
      setRecordingSeconds(0);
      triggerToast("Voice recording canceled.", "info");
    }
  };

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Upload file helper
  const uploadFile = async () => {
    if (!chatFile) return null;
    setIsChatFileUploading(true);
    const formData = new FormData();
    try {
      formData.append("file", chatFile);
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
      clearSelectedFile();
    }
  };

  const clearSelectedFile = () => {
    if (chatFilePreview && chatFilePreview.startsWith("blob:")) {
      URL.revokeObjectURL(chatFilePreview);
    }
    setChatFile(null);
    setChatFileName("");
    setChatFileSize("");
    setChatFileType("");
    setChatFilePreview(null);
  };

  // Typing debounce broadcast
  const handleInputChange = (val, isPatient) => {
    if (isPatient) {
      setPatConsultInput(val);
    } else {
      setDocConsultInput(val);
    }

    if (activeChatId && onSendTyping) {
      onSendTyping(activeChatId, true);

      if (typingDebounceTimerRef.current) {
        clearTimeout(typingDebounceTimerRef.current);
      }
      typingDebounceTimerRef.current = setTimeout(() => {
        onSendTyping(activeChatId, false);
      }, 2000);
    }
  };

  // Submit patient message
  const handlePatMessageFormSubmit = async (e) => {
    e.preventDefault();
    if (!patConsultInput.trim() && !chatFile) return;

    if (activeChatId && onSendTyping) {
      onSendTyping(activeChatId, false);
    }

    let fileData = null;
    if (chatFile) {
      fileData = await uploadFile();
      if (!fileData) return;
    }

    onPatMessageSubmit(patConsultInput.trim(), fileData);
    setPatConsultInput("");
  };

  // Submit doctor message
  const handleDocMessageFormSubmit = async (e) => {
    e.preventDefault();
    if (!docConsultInput.trim() && !chatFile) return;

    if (activeChatId && onSendTyping) {
      onSendTyping(activeChatId, false);
    }

    let fileData = null;
    if (chatFile) {
      fileData = await uploadFile();
      if (!fileData) return;
    }

    onDocMessageSubmit(docConsultInput.trim(), fileData);
    setDocConsultInput("");
  };

  // Lightbox Modal Controls
  const openLightbox = (media) => {
    setLightboxMedia(media);
    setLightboxZoom(1);
    setLightboxRotation(0);
  };

  const closeLightbox = () => {
    setLightboxMedia(null);
  };

  const zoomIn = () => setLightboxZoom(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setLightboxZoom(prev => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => { setLightboxZoom(1); setLightboxRotation(0); };
  const rotateImage = () => setLightboxRotation(prev => (prev + 90) % 360);

  // Message attachment renderer
  const renderMessageAttachment = (m) => {
    if (!m.fileUrl && !m.fileName) return null;

    const fileName = m.fileName || "attachment";
    const fileUrl = m.fileUrl;
    const fileType = m.fileType || getFileCategory({ name: fileName, type: "" });
    const fileSize = m.fileSize || "";

    // 1. Image Preview with Lightbox trigger
    if (fileType === "image") {
      return (
        <div className="chat-attachment-container">
          <div 
            className="chat-image-wrapper" 
            onClick={() => openLightbox({ url: fileUrl, name: fileName, type: "image", size: fileSize })}
            title="Click to view full size"
          >
            <img src={fileUrl} alt={fileName} className="chat-thumbnail-img" loading="lazy" />
            <div className="chat-image-overlay">
              <span>🖼️ {fileName}</span>
              <span style={{ opacity: 0.85 }}>{fileSize || "Zoom 🔍"}</span>
            </div>
          </div>
        </div>
      );
    }

    // 2. Audio / Voice Notes Player
    if (fileType === "audio") {
      return (
        <div className="chat-attachment-container">
          <div className="chat-audio-wrapper">
            <div className="chat-audio-meta">
              <span>🎙️ Voice Note / Audio</span>
              <span>{fileSize}</span>
            </div>
            <audio controls preload="metadata" src={fileUrl}>
              Your browser does not support audio playback.
            </audio>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2px" }}>
              <span style={{ fontSize: "0.72rem", color: "rgba(255, 255, 255, 0.8)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "200px" }}>
                {fileName}
              </span>
              <a 
                href={fileUrl} 
                download={fileName} 
                className="chat-action-btn chat-action-btn-dl"
                title="Download Audio"
              >
                ⬇️ Download
              </a>
            </div>
          </div>
        </div>
      );
    }

    // 3. Video Player
    if (fileType === "video") {
      return (
        <div className="chat-attachment-container">
          <div className="chat-video-wrapper">
            <video controls preload="metadata" src={fileUrl}>
              Your browser does not support video playback.
            </video>
            <div style={{ padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(15, 23, 42, 0.9)" }}>
              <span style={{ fontSize: "0.75rem", color: "#ffffff", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "200px" }}>
                🎥 {fileName}
              </span>
              <a 
                href={fileUrl} 
                download={fileName} 
                className="chat-action-btn chat-action-btn-dl"
              >
                ⬇️ Download
              </a>
            </div>
          </div>
        </div>
      );
    }

    // 4. Document / PDF / Medical Lab Scans
    const ext = fileName.split(".").pop().toLowerCase();
    let iconClass = "doc-icon-default";
    let iconSymbol = "📄";

    if (fileType === "pdf" || ext === "pdf") {
      iconClass = "doc-icon-pdf";
      iconSymbol = "📑";
    } else if (["doc", "docx"].includes(ext)) {
      iconClass = "doc-icon-word";
      iconSymbol = "📘";
    } else if (["csv", "xlsx", "xls"].includes(ext)) {
      iconClass = "doc-icon-sheet";
      iconSymbol = "📊";
    }

    return (
      <div className="chat-attachment-container">
        <div className="chat-doc-card">
          <div className={`chat-doc-icon-frame ${iconClass}`}>
            <span>{iconSymbol}</span>
          </div>
          <div className="chat-doc-info">
            <span className="chat-doc-title" title={fileName}>{fileName}</span>
            <span className="chat-doc-meta">
              {fileType.toUpperCase()} • {fileSize || "Document"}
            </span>
          </div>
          <div className="chat-doc-actions">
            <a 
              href={fileUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="chat-action-btn chat-action-btn-view"
              title="Open document in new browser tab"
            >
              👁️ View
            </a>
            <a 
              href={fileUrl} 
              download={fileName} 
              className="chat-action-btn chat-action-btn-dl"
              title="Download file"
            >
              ⬇️ Save
            </a>
          </div>
        </div>
      </div>
    );
  };

  // Lightbox Modal Component
  const renderLightboxModal = () => {
    if (!lightboxMedia) return null;

    return (
      <div className="lightbox-backdrop" onClick={closeLightbox}>
        <div className="lightbox-toolbar" onClick={e => e.stopPropagation()}>
          <button className="lightbox-btn" onClick={zoomIn} title="Zoom In">➕</button>
          <button className="lightbox-btn" onClick={zoomOut} title="Zoom Out">➖</button>
          <button className="lightbox-btn" onClick={resetZoom} title="Reset Zoom">🔄</button>
          <button className="lightbox-btn" onClick={rotateImage} title="Rotate 90°">🔃</button>
          <a 
            href={lightboxMedia.url} 
            download={lightboxMedia.name} 
            className="lightbox-btn" 
            title="Download Media"
            style={{ textDecoration: "none" }}
          >
            💾
          </a>
          <button className="lightbox-btn" onClick={closeLightbox} title="Close (Esc)">✕</button>
        </div>

        <div className="lightbox-content-box" onClick={e => e.stopPropagation()}>
          <img 
            src={lightboxMedia.url} 
            alt={lightboxMedia.name} 
            className="lightbox-image" 
            style={{ 
              transform: `scale(${lightboxZoom}) rotate(${lightboxRotation}deg)`
            }} 
          />
        </div>

        <div className="lightbox-caption" onClick={e => e.stopPropagation()}>
          <span>🖼️ {lightboxMedia.name} {lightboxMedia.size ? `(${lightboxMedia.size})` : ''}</span>
        </div>
      </div>
    );
  };

  // =========================================================================
  // RENDER PATIENT VIEW
  // =========================================================================
  if (user.role === "patient") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", padding: "1.5rem", gap: "0" }}>
        {renderLightboxModal()}

        <div className="feature-header-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div className="feature-logo-frame">
              <span className="feature-icon">💬</span>
            </div>
            <div className="feature-heading-group">
              <h1 className="feature-title">Clinical Consultations Hub</h1>
              <p className="feature-desc">Full-duplex real-time synchronization with clinical specialists & interactive media sharing.</p>
            </div>
          </div>
          
          {/* Real-Time WebSocket Status Pill */}
          <div className={`ws-status-pill ${socketConnected ? '' : 'offline'}`} title={socketConnected ? "Connected via full-duplex WebSockets" : "Connecting..."}>
            <span className="ws-pulse-dot"></span>
            <span>{socketConnected ? "⚡ WebSocket Live • Instant Sync" : "Connecting..."}</span>
          </div>
        </div>
        
        <div className="workspace-layout patient-theme" style={{ flex: 1, display: "grid", gridTemplateColumns: "300px 1fr", gap: "1.5rem", height: "calc(100% - 75px)", overflow: "hidden" }}>
          {/* Left Sidebar: Doctors Directory */}
          <aside className="workspace-sidebar card">
            <div className="sidebar-header">
              <h3>👥 Specialists Directory</h3>
              <span className="badge badge-patient">{doctorDirectory.length} Registered</span>
            </div>
            
            <div className="patient-list">
              {doctorDirectory.map(d => {
                const isOnline = onlineUserIds.has(d._id) || onlineUserIds.has(String(d._id)) || d.email === "doctor@aidoctor.com";
                return (
                  <div 
                    key={d._id}
                    className={`patient-item ${selectedDoctor && selectedDoctor._id === d._id ? 'active' : ''}`}
                    onClick={() => handleSelectDoctor(d)}
                  >
                    <div className="patient-item-header">
                      <span className="patient-item-name" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span 
                          style={{ 
                            width: "9px", 
                            height: "9px", 
                            borderRadius: "50%", 
                            backgroundColor: isOnline ? "#10b981" : "#94a3b8",
                            display: "inline-block",
                            boxShadow: isOnline ? "0 0 8px #10b981" : "none"
                          }}
                          title={isOnline ? "Online Now (WebSocket)" : "Offline"}
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

          {/* Right Pane: Conversation workspace with Drag & Drop */}
          <div 
            className="card chat-drop-zone" 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDraggingOver && (
              <div className="chat-drop-overlay">
                <span style={{ fontSize: "3.5rem" }}>📂</span>
                <h3 style={{ margin: 0, fontSize: "1.3rem" }}>Drop your media or documents here</h3>
                <p style={{ margin: 0, opacity: 0.85, fontSize: "0.85rem" }}>Images, Lab Reports (PDF), Audio Dictations & Medical Files up to 25MB</p>
              </div>
            )}

            {selectedDoctor ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "1rem", borderBottom: "1px solid var(--border-color)", marginBottom: "0.75rem" }}>
                  <div>
                    <h2 style={{ fontFamily: "var(--font-family-display)", fontSize: "1.3rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span>Consulting: {selectedDoctor.name}</span>
                      <span 
                        style={{ 
                          width: "8px", 
                          height: "8px", 
                          borderRadius: "50%", 
                          backgroundColor: (onlineUserIds.has(selectedDoctor._id) || selectedDoctor.email === "doctor@aidoctor.com") ? "#10b981" : "#94a3b8",
                          boxShadow: (onlineUserIds.has(selectedDoctor._id) || selectedDoctor.email === "doctor@aidoctor.com") ? "0 0 6px #10b981" : "none"
                        }}
                        title={onlineUserIds.has(selectedDoctor._id) ? "Online" : "Offline"}
                      ></span>
                    </h2>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Specialty: {selectedDoctor.specialty} ({selectedDoctor.hospital})</span>
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
                        <strong>Session Status:</strong> {activeConsultation.status === 'pending' ? 'Request pending doctor approval.' : 'Connected via Full-Duplex WebSockets. Messages and media sync in real-time.'}
                      </div>

                      {activeConsultation.messages.map((m, idx) => (
                        <div 
                          key={idx} 
                          className={`message ${m.senderId === user.id ? 'user-msg' : 'assistant-msg'}`}
                          style={{ alignSelf: m.senderId === user.id ? "flex-end" : "flex-start", borderRadius: m.senderId === user.id ? "10px 10px 2px 10px" : "10px 10px 10px 2px" }}
                        >
                          <span style={{ fontSize: "0.72rem", opacity: 0.8, display: "block", marginBottom: "0.2rem" }}>{m.senderName}</span>
                          {m.content && <div>{m.content}</div>}
                          {renderMessageAttachment(m)}
                        </div>
                      ))}

                      {/* Live typing indicator */}
                      {activeTypingName && (
                        <div className="typing-bubble">
                          <div className="typing-dots">
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                            <span className="typing-dot"></span>
                          </div>
                          <span>{activeTypingName} is typing...</span>
                        </div>
                      )}

                      <div ref={patConsultEndRef} />
                    </div>

                    {/* Live Voice Recording Bar */}
                    {isRecordingVoice && (
                      <div className="voice-recorder-bar">
                        <span className="rec-dot"></span>
                        <span className="rec-timer">Recording: {formatTimer(recordingSeconds)}</span>
                        <div className="rec-waves">
                          <span className="rec-wave-bar"></span>
                          <span className="rec-wave-bar"></span>
                          <span className="rec-wave-bar"></span>
                          <span className="rec-wave-bar"></span>
                        </div>
                        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                          <button type="button" className="btn btn-secondary" style={{ padding: "4px 8px", fontSize: "0.75rem" }} onClick={cancelVoiceRecording}>
                            Cancel
                          </button>
                          <button type="button" className="btn btn-patient" style={{ padding: "4px 12px", fontSize: "0.75rem" }} onClick={stopVoiceRecording}>
                            ⏹️ Stop & Attach
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Pre-send Attachment Preview Bar */}
                    {chatFileName && (
                      <div className="attachment-preview-bar">
                        {chatFilePreview ? (
                          <img src={chatFilePreview} alt="thumb" style={{ width: "32px", height: "32px", objectFit: "cover", borderRadius: "4px" }} />
                        ) : (
                          <span style={{ fontSize: "1.2rem" }}>📎</span>
                        )}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span><strong>{chatFileName}</strong></span>
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{chatFileType.toUpperCase()} • {chatFileSize}</span>
                        </div>
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          style={{ marginLeft: "auto", padding: "2px 8px", fontSize: "0.72rem" }} 
                          onClick={clearSelectedFile}
                        >
                          ✕ Remove
                        </button>
                      </div>
                    )}

                    {/* Input form */}
                    <form className="chat-input-form chat-input-container" onSubmit={handlePatMessageFormSubmit} style={{ marginTop: "0.75rem", position: "relative" }}>
                      {/* Attachment Category Selector Menu */}
                      {showAttachmentMenu && (
                        <div className="attachment-menu">
                          <button type="button" className="attachment-menu-item" onClick={() => openFilePicker("image/*")}>
                            <span>🖼️</span> Photos & Medical Scans
                          </button>
                          <button type="button" className="attachment-menu-item" onClick={() => openFilePicker(".pdf,.doc,.docx,.txt,.csv,.xlsx")}>
                            <span>📑</span> PDF & Lab Reports
                          </button>
                          <button type="button" className="attachment-menu-item" onClick={() => openFilePicker("audio/*")}>
                            <span>🎵</span> Audio / Voice Clip
                          </button>
                          <button type="button" className="attachment-menu-item" onClick={() => openFilePicker("video/*")}>
                            <span>🎥</span> Video File
                          </button>
                          <button type="button" className="attachment-menu-item" onClick={() => openFilePicker("*")}>
                            <span>📂</span> All Files (up to 25MB)
                          </button>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                        {/* Attachment Menu Toggle */}
                        <button 
                          type="button" 
                          className="btn btn-secondary btn-icon" 
                          title="Attach Media or Document"
                          disabled={isPatConsultLoading || isChatFileUploading}
                          onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                          style={{ padding: "0.6rem 0.85rem", fontSize: "1rem" }}
                        >
                          📎
                        </button>

                        {/* Hidden Native File Input */}
                        <input 
                          type="file" 
                          ref={chatFileInputRef} 
                          style={{ display: "none" }}
                          accept={fileCategoryFilter}
                          onChange={handleChatFileChange}
                        />

                        {/* Voice Note Recording Button */}
                        <button 
                          type="button" 
                          className="btn btn-secondary btn-icon" 
                          title="Record Voice Note"
                          disabled={isPatConsultLoading || isChatFileUploading || isRecordingVoice}
                          onClick={startVoiceRecording}
                          style={{ padding: "0.6rem 0.85rem", fontSize: "1rem", color: isRecordingVoice ? "#ef4444" : "inherit" }}
                        >
                          🎙️
                        </button>

                        <input 
                          type="text" 
                          placeholder="Type your message, drag files, or record voice note..."
                          value={patConsultInput}
                          onChange={e => handleInputChange(e.target.value, true)}
                          disabled={isPatConsultLoading || isChatFileUploading}
                          required={!chatFile}
                          style={{ flex: 1, padding: "0.6rem 0.8rem" }}
                        />

                        <button 
                          type="submit" 
                          className="btn btn-patient" 
                          disabled={isPatConsultLoading || isChatFileUploading} 
                          style={{ padding: "0.6rem 1.4rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
                        >
                          {isChatFileUploading ? "Uploading..." : "Send"} 🚀
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", color: "var(--text-muted)" }}>
                    <span style={{ fontSize: "3.5rem" }}>✉️</span>
                    <p style={{ fontSize: "1.05rem" }}>You have not connected with {selectedDoctor.name} yet.</p>
                    <button className="btn btn-patient" onClick={handleRequestConsultation} disabled={isPatConsultLoading} style={{ padding: "0.75rem 1.5rem" }}>
                      Send Connect Request to Start Real-Time Consultation
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", gap: "0.75rem" }}>
                <span style={{ fontSize: "3rem" }}>👥</span>
                <p>Select a specialist doctor from the directory sidebar to start your real-time consultation.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER DOCTOR VIEW
  // =========================================================================
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", padding: "1.5rem", gap: "0" }}>
      {renderLightboxModal()}

      <div className="feature-header-box" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div className="feature-logo-frame">
            <span className="feature-icon">💬</span>
          </div>
          <div className="feature-heading-group">
            <h1 className="feature-title">Clinical Consultations Hub</h1>
            <p className="feature-desc">Full-duplex real-time synchronization with active patients & rich media exchange.</p>
          </div>
        </div>

        {/* Real-Time WebSocket Status Pill */}
        <div className={`ws-status-pill ${socketConnected ? '' : 'offline'}`} title={socketConnected ? "Connected via full-duplex WebSockets" : "Connecting..."}>
          <span className="ws-pulse-dot"></span>
          <span>{socketConnected ? "⚡ WebSocket Live • Instant Sync" : "Connecting..."}</span>
        </div>
      </div>
      
      <div className="workspace-layout" style={{ flex: 1, display: "grid", gridTemplateColumns: "300px 1fr", gap: "1.5rem", height: "calc(100% - 75px)", overflow: "hidden" }}>
        {/* Left Sidebar: Active consultation list */}
        <aside className="workspace-sidebar card">
          <div className="sidebar-header">
            <h3>💬 Direct Patient Chats</h3>
            <span className="badge badge-doctor">{doctorConsults.length} Sessions</span>
          </div>
          
          <div className="patient-list">
            {doctorConsults.length > 0 ? (
              doctorConsults.map(c => {
                const isOnline = onlineUserIds.has(c.patientId) || onlineUserIds.has(String(c.patientId));
                return (
                  <div 
                    key={c._id}
                    className={`patient-item ${selectedDocConsult && selectedDocConsult._id === c._id ? 'active' : ''}`}
                    onClick={() => setSelectedDocConsult(c)}
                  >
                    <div className="patient-item-header">
                      <span className="patient-item-name" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span 
                          style={{ 
                            width: "9px", 
                            height: "9px", 
                            borderRadius: "50%", 
                            backgroundColor: isOnline ? "#10b981" : "#94a3b8",
                            display: "inline-block",
                            boxShadow: isOnline ? "0 0 8px #10b981" : "none"
                          }}
                          title={isOnline ? "Online Now (WebSocket)" : "Offline"}
                        ></span>
                        {c.patientName}
                      </span>
                      <span className={`badge ${c.status === 'active' ? 'badge-doctor' : 'risk-tag risk-medium'}`}>
                        {c.status === 'active' ? 'Connected' : 'Requested'}
                      </span>
                    </div>
                    <div className="patient-item-sub">
                      {c.messages.length > 0 ? (
                        c.messages[c.messages.length - 1].fileName ? 
                          `📎 ${c.messages[c.messages.length - 1].fileName}` : 
                          c.messages[c.messages.length - 1].content
                      ) : "No messages exchanged yet."}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: "1.5rem 1rem", color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center" }}>
                No consultation requests received yet.
              </div>
            )}
          </div>
        </aside>

        {/* Right Pane: Direct messaging stream with Drag & Drop */}
        <div 
          className="card chat-drop-zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDraggingOver && (
            <div className="chat-drop-overlay">
              <span style={{ fontSize: "3.5rem" }}>📂</span>
              <h3 style={{ margin: 0, fontSize: "1.3rem" }}>Drop your media or documents here</h3>
              <p style={{ margin: 0, opacity: 0.85, fontSize: "0.85rem" }}>Clinical Scans, Prescriptions, Reports (PDF), Audio & Video Files</p>
            </div>
          )}

          {selectedDocConsult ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "1rem", borderBottom: "1px solid var(--border-color)", marginBottom: "0.75rem" }}>
                <div>
                  <h2 style={{ fontFamily: "var(--font-family-display)", fontSize: "1.3rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>Direct Chat: {selectedDocConsult.patientName}</span>
                    <span 
                      style={{ 
                        width: "8px", 
                        height: "8px", 
                        borderRadius: "50%", 
                        backgroundColor: (onlineUserIds.has(selectedDocConsult.patientId) || onlineUserIds.has(String(selectedDocConsult.patientId))) ? "#10b981" : "#94a3b8",
                        boxShadow: (onlineUserIds.has(selectedDocConsult.patientId) || onlineUserIds.has(String(selectedDocConsult.patientId))) ? "0 0 6px #10b981" : "none"
                      }}
                      title={onlineUserIds.has(selectedDocConsult.patientId) ? "Patient is Online" : "Patient is Offline"}
                    ></span>
                  </h2>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Session: {selectedDocConsult._id} • Status: {selectedDocConsult.status.toUpperCase()}</span>
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
                  <strong>Session Log:</strong> Secure encrypted consulting session with {selectedDocConsult.patientName}. Full-duplex WebSocket enabled.
                </div>

                {selectedDocConsult.messages.map((m, idx) => (
                  <div 
                    key={idx} 
                    className={`message ${m.senderId === user.id ? 'user-msg' : 'assistant-msg'}`}
                    style={{ alignSelf: m.senderId === user.id ? "flex-end" : "flex-start", borderRadius: m.senderId === user.id ? "10px 10px 2px 10px" : "10px 10px 10px 2px" }}
                  >
                    <span style={{ fontSize: "0.72rem", opacity: 0.8, display: "block", marginBottom: "0.2rem" }}>{m.senderName}</span>
                    {m.content && <div>{m.content}</div>}
                    {renderMessageAttachment(m)}
                  </div>
                ))}

                {/* Live typing indicator */}
                {activeTypingName && (
                  <div className="typing-bubble">
                    <div className="typing-dots">
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                    </div>
                    <span>{activeTypingName} is typing...</span>
                  </div>
                )}

                <div ref={docConsultEndRef} />
              </div>

              {/* Live Voice Recording Bar */}
              {isRecordingVoice && (
                <div className="voice-recorder-bar">
                  <span className="rec-dot"></span>
                  <span className="rec-timer">Recording: {formatTimer(recordingSeconds)}</span>
                  <div className="rec-waves">
                    <span className="rec-wave-bar"></span>
                    <span className="rec-wave-bar"></span>
                    <span className="rec-wave-bar"></span>
                    <span className="rec-wave-bar"></span>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                    <button type="button" className="btn btn-secondary" style={{ padding: "4px 8px", fontSize: "0.75rem" }} onClick={cancelVoiceRecording}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-doctor" style={{ padding: "4px 12px", fontSize: "0.75rem" }} onClick={stopVoiceRecording}>
                      ⏹️ Stop & Attach
                    </button>
                  </div>
                </div>
              )}

              {/* Pre-send Attachment Preview Bar */}
              {chatFileName && (
                <div className="attachment-preview-bar">
                  {chatFilePreview ? (
                    <img src={chatFilePreview} alt="thumb" style={{ width: "32px", height: "32px", objectFit: "cover", borderRadius: "4px" }} />
                  ) : (
                    <span style={{ fontSize: "1.2rem" }}>📎</span>
                  )}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span><strong>{chatFileName}</strong></span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{chatFileType.toUpperCase()} • {chatFileSize}</span>
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ marginLeft: "auto", padding: "2px 8px", fontSize: "0.72rem" }} 
                    onClick={clearSelectedFile}
                  >
                    ✕ Remove
                  </button>
                </div>
              )}

              {/* Input form */}
              <form className="chat-input-form chat-input-container" onSubmit={handleDocMessageFormSubmit} style={{ marginTop: "0.75rem", position: "relative" }}>
                {/* Attachment Category Selector Menu */}
                {showAttachmentMenu && (
                  <div className="attachment-menu">
                    <button type="button" className="attachment-menu-item" onClick={() => openFilePicker("image/*")}>
                      <span>🖼️</span> Photos & Medical Scans
                    </button>
                    <button type="button" className="attachment-menu-item" onClick={() => openFilePicker(".pdf,.doc,.docx,.txt,.csv,.xlsx")}>
                      <span>📑</span> PDF & Prescriptions
                    </button>
                    <button type="button" className="attachment-menu-item" onClick={() => openFilePicker("audio/*")}>
                      <span>🎵</span> Audio / Voice Note
                    </button>
                    <button type="button" className="attachment-menu-item" onClick={() => openFilePicker("video/*")}>
                      <span>🎥</span> Video File
                    </button>
                    <button type="button" className="attachment-menu-item" onClick={() => openFilePicker("*")}>
                      <span>📂</span> All Files (up to 25MB)
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                  {/* Attachment Toggle */}
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-icon" 
                    title="Attach Media or Document"
                    disabled={selectedDocConsult.status === 'pending' || isChatFileUploading}
                    onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                    style={{ padding: "0.6rem 0.85rem", fontSize: "1rem" }}
                  >
                    📎
                  </button>

                  <input 
                    type="file" 
                    ref={chatFileInputRef} 
                    style={{ display: "none" }}
                    accept={fileCategoryFilter}
                    onChange={handleChatFileChange}
                  />

                  {/* Voice Note Recording Button */}
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-icon" 
                    title="Record Voice Note"
                    disabled={selectedDocConsult.status === 'pending' || isChatFileUploading || isRecordingVoice}
                    onClick={startVoiceRecording}
                    style={{ padding: "0.6rem 0.85rem", fontSize: "1rem", color: isRecordingVoice ? "#ef4444" : "inherit" }}
                  >
                    🎙️
                  </button>

                  <input 
                    type="text" 
                    placeholder={selectedDocConsult.status === 'active' ? "Type advice, drag media/docs, or record audio..." : "Please accept request to enable messaging"}
                    disabled={selectedDocConsult.status === 'pending' || isDocConsultLoading || isChatFileUploading}
                    value={docConsultInput}
                    onChange={e => handleInputChange(e.target.value, false)}
                    required={!chatFile}
                    style={{ flex: 1, padding: "0.6rem 0.8rem" }}
                  />

                  <button 
                    type="submit" 
                    className="btn btn-doctor" 
                    disabled={selectedDocConsult.status === 'pending' || isDocConsultLoading || isChatFileUploading} 
                    style={{ padding: "0.6rem 1.4rem", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    {isChatFileUploading ? "Uploading..." : "Send"} 🚀
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", gap: "0.75rem" }}>
              <span style={{ fontSize: "3rem" }}>📋</span>
              <p>Select an active patient chat or request card from the sidebar list.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
