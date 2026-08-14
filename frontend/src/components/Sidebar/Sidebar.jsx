import React, { useState, useEffect, useRef } from "react";
import { safeStorage } from "../../utils/safeStorage";
import "./Sidebar.css";

export default function Sidebar({
  user,
  doctorTab,
  setDoctorTab,
  patientTab,
  setPatientTab,
  dbStatus,
  pendingRequests,
  pendingCount,
  onSelectNotification,
  onSignOut,
  onProfileUpdate,
  triggerToast,
  fetchPatientProfile,
  patientProfile,
  renderPatientVitalsChart
}) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  
  // Custom API configurations state
  const [tempApiKey, setTempApiKey] = useState(() => safeStorage.getSession("gemini_api_key") || "");
  
  // Profile update form state
  const [isProfileUpdating, setIsProfileUpdating] = useState(false);
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
    bpSystolic: "120",
    bpDiastolic: "80",
    sugar: "90"
  });

  // Vitals history logs inside patient demographics modal
  const [isVitalsLogging, setIsVitalsLogging] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({
    label: "",
    bpSystolic: "120",
    bpDiastolic: "80",
    sugar: "90"
  });

  const patientCanvasRef = useRef(null);
  const patientChartInstanceRef = useRef(null);

  // Sync edit profile form fields when user profile modal opens
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

  // Synchronize dynamic vital charts inside Patient profile modal
  useEffect(() => {
    if (showEditProfile && user && user.role === "patient" && patientProfile && patientCanvasRef.current) {
      // Small timeout to allow canvas element to fully mount in DOM tree
      const timer = setTimeout(() => {
        if (patientChartInstanceRef.current) {
          patientChartInstanceRef.current.destroy();
          patientChartInstanceRef.current = null;
        }
        
        const chartInstance = renderPatientVitalsChart(patientProfile, patientCanvasRef.current);
        if (chartInstance) {
          patientChartInstanceRef.current = chartInstance;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showEditProfile, patientProfile, user]);

  // Clean chart instances on modal close
  useEffect(() => {
    if (!showEditProfile && patientChartInstanceRef.current) {
      patientChartInstanceRef.current.destroy();
      patientChartInstanceRef.current = null;
    }
  }, [showEditProfile]);

  // Settings Save/Clear
  const handleSaveSettings = () => {
    safeStorage.setSession("gemini_api_key", tempApiKey);
    // Reload tab to attach apiKey to context
    window.location.reload();
  };

  const handleClearSettings = () => {
    setTempApiKey("");
    safeStorage.removeSession("gemini_api_key");
    window.location.reload();
  };

  // Profile update submission
  const handleProfileUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setIsProfileUpdating(true);

    try {
      const token = safeStorage.getLocal("ai_doctor_token");
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: user.id,
          role: user.role,
          ...editProfileForm
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile.");

      const updatedUser = { ...user, ...data.user };
      onProfileUpdate(updatedUser);
      triggerToast("Profile updated successfully!", "success");
      setShowEditProfile(false);
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsProfileUpdating(false);
    }
  };

  // Patient logs a new vitals history check-in
  const handleLogVitalsSubmit = async (e) => {
    e.preventDefault();
    if (!user || !vitalsForm.label) return;
    setIsVitalsLogging(true);

    try {
      const token = safeStorage.getLocal("ai_doctor_token");
      const res = await fetch(`/api/patients/${user.id}/vitals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          label: vitalsForm.label,
          bpSystolic: parseInt(vitalsForm.bpSystolic),
          bpDiastolic: parseInt(vitalsForm.bpDiastolic),
          sugar: parseInt(vitalsForm.sugar)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log vitals entry.");

      triggerToast("Vital indicators logged successfully!", "success");
      setVitalsForm({ label: "", bpSystolic: "120", bpDiastolic: "80", sugar: "90" });
      
      // Refresh patient stats
      fetchPatientProfile(user.id);
    } catch (err) {
      triggerToast(err.message, "error");
    } finally {
      setIsVitalsLogging(false);
    }
  };

  return (
    <>
      <aside className="app-sidebar">
        <div>
          <div className="sidebar-brand">
            <div className="logo-container" onClick={() => window.location.reload()}>
              <div className="logo-icon"><i className="activity-icon">🩺</i></div>
              <div className="logo-text">
                <span className="logo-main">AI-DOCTOR</span>
                <span className="logo-sub">Clinical Network</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="sidebar-nav">
            {user.role === "doctor" ? (
              <>
                <button 
                  className={`sidebar-link ${doctorTab === 'vitals' ? 'active' : ''}`} 
                  onClick={() => setDoctorTab("vitals")}
                >
                  📈 Patient Vitals
                </button>
                <button 
                  className={`sidebar-link ${doctorTab === 'directChats' ? 'active' : ''}`} 
                  onClick={() => setDoctorTab("directChats")}
                >
                  💬 Direct Consults
                  {pendingCount > 0 && <span className="notification-badge" style={{ marginLeft: "auto" }}>{pendingCount}</span>}
                </button>
              </>
            ) : (
              <>
                <button 
                  className={`sidebar-link patient-link ${patientTab === 'triage' ? 'active' : ''}`} 
                  onClick={() => setPatientTab("triage")}
                >
                  🤖 AI Triage & Scanner
                </button>
                <button 
                  className={`sidebar-link patient-link ${patientTab === 'consultations' ? 'active' : ''}`} 
                  onClick={() => setPatientTab("consultations")}
                >
                  🤝 Consult a Doctor
                </button>
                <button 
                  className={`sidebar-link patient-link ${patientTab === 'scheduler' ? 'active' : ''}`} 
                  onClick={() => setPatientTab("scheduler")}
                >
                  💊 Medication Alarm
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="sidebar-footer">
          {/* Connection Indicator */}
          <div className="conn-indicator" title={dbStatus.connectedDatabase}>
            <span className={`conn-dot ${dbStatus.fallbackMode ? 'conn-fallback' : 'conn-mongo'}`}></span>
            <span style={{ fontSize: "0.75rem" }}>{dbStatus.fallbackMode ? 'Local JSON DB' : 'MongoDB Connected'}</span>
          </div>

          {/* Doctor Consultations dropdown */}
          {user.role === "doctor" && pendingCount > 0 && (
            <div style={{ position: "relative" }}>
              <button 
                className="btn btn-secondary btn-block" 
                onClick={() => setShowNotifications(!showNotifications)}
                style={{ padding: "0.5rem", marginBottom: "0.5rem" }}
              >
                🔔 Requests Pending ({pendingCount})
              </button>
              {showNotifications && (
                <div className="notification-dropdown">
                  <div className="notification-header">Incoming Consultation Requests</div>
                  <div className="notification-list">
                    {pendingRequests.map(req => (
                      <div 
                        key={req._id} 
                        className="notification-item" 
                        onClick={() => {
                          onSelectNotification(req);
                          setShowNotifications(false);
                        }}
                      >
                        <div className="notification-item-title">{req.patientName}</div>
                        <div className="notification-item-desc">Is requesting a consultation...</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Profile widget */}
          <div className="sidebar-profile">
            <div className="sidebar-profile-info" style={{ flex: 1 }}>
              <span className="sidebar-profile-name">{user.name}</span>
              <span className={`badge ${user.role === 'doctor' ? 'badge-doctor' : 'badge-patient'}`} style={{ fontSize: "0.6rem", padding: "0.1rem 0.3rem", width: "fit-content", marginTop: "3px" }}>
                {user.role}
              </span>
            </div>
            <button className="btn btn-secondary" onClick={handleOpenEditProfile} title="Edit Profile" style={{ padding: "0.3rem", width: "32px", height: "32px" }}>
              👤
            </button>
          </div>

          {/* API settings */}
          <button className="btn btn-secondary btn-block" onClick={() => setShowSettings(true)} style={{ padding: "0.5rem", marginBottom: "0.5rem" }}>
            ⚙️ API Settings
          </button>

          {/* Sign Out */}
          <button className="btn btn-primary btn-block" onClick={onSignOut} style={{ padding: "0.5rem" }}>
            🚪 Sign Out
          </button>
        </div>
      </aside>

      {/* API Key Modal Settings */}
      {showSettings && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>🔑 API Configuration Settings</h3>
              <button className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem" }} onClick={() => setShowSettings(false)}>✕</button>
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
          <div className={`modal-card ${user.role === 'patient' ? 'patient-modal-card' : ''}`} style={{ width: user.role === 'patient' ? "850px" : "480px" }}>
            <div className={`modal-header ${user.role === 'patient' ? 'patient-modal-header' : ''}`}>
              <h3>
                👤 Update {user.role === 'doctor' ? 'Clinical Credentials' : 'Medical Demographics & Vitals'}
              </h3>
              <button className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem" }} onClick={() => setShowEditProfile(false)}>✕</button>
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
                      style={{ width: "100%", background: "var(--bg-main)", border: "1px solid var(--border-color)", color: "var(--text-main)", padding: "0.4rem", borderRadius: "4px", outline: "none", fontSize: "0.8rem", fontFamily: "var(--font-family-body)", resize: "vertical" }}
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
                          <i className="vital-icon bp-color" style={{ fontStyle: "normal" }}>❤️</i>
                        </div>
                        <div className="vital-value" style={{ fontSize: "1.25rem" }}>{patientProfile.latestVitals?.bp || "--"} mmHg</div>
                        <div className={`vital-trend ${patientProfile.latestVitals?.bpTrendClass}`} style={{ fontSize: "0.7rem" }}>
                          {patientProfile.latestVitals?.bpTrend || "Normal"}
                        </div>
                      </div>

                      <div className="vital-card card-inner" style={{ padding: "0.75rem" }}>
                        <div className="vital-header">
                          <span className="vital-label" style={{ fontSize: "0.65rem" }}>Last Blood Sugar</span>
                          <i className="vital-icon sugar-color" style={{ fontStyle: "normal" }}>💧</i>
                        </div>
                        <div className="vital-value" style={{ fontSize: "1.25rem" }}>{patientProfile.latestVitals?.sugar || "--"} mg/dL</div>
                        <div className={`vital-trend ${patientProfile.latestVitals?.sugarTrendClass}`} style={{ fontSize: "0.7rem" }}>
                          {patientProfile.latestVitals?.sugarTrend || "Normal"}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="chart-container" style={{ margin: 0, padding: "0.75rem" }}>
                    <div className="chart-header" style={{ marginBottom: "0.5rem" }}>
                      <h5 style={{ fontSize: "0.85rem", margin: 0 }}>Vitals History Log</h5>
                      <div className="chart-legend" style={{ fontSize: "0.7rem", gap: "0.5rem" }}>
                        <span className="legend-item"><span className="legend-color bp-legend" style={{ backgroundColor: "#10b981", width: "8px", height: "8px", display: "inline-block", marginRight: "3px" }}></span>BP</span>
                        <span className="legend-item"><span className="legend-color sugar-legend" style={{ backgroundColor: "#f59e0b", width: "8px", height: "8px", display: "inline-block", marginRight: "3px" }}></span>Sugar</span>
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
                            placeholder="e.g. Jul 4"
                            value={vitalsForm.label}
                            style={{ fontSize: "0.75rem", padding: "0.35rem" }}
                            onChange={e => setVitalsForm({...vitalsForm, label: e.target.value})}
                          />
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.65rem" }}>BP (Syst)</label>
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
                          <label style={{ fontSize: "0.65rem" }}>BP (Diast)</label>
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
    </>
  );
}
