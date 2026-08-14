import React, { useState } from "react";
import "./AuthPortal.css";

export default function AuthPortal({ onAuthSuccess, triggerToast }) {
  const [authMode, setAuthMode] = useState("login"); // login, register
  const [otpSent, setOtpSent] = useState(false);
  const [otpForm, setOtpForm] = useState("");
  const [isOtpSending, setIsOtpSending] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
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

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    
    // Stage 1: Send registration OTP
    if (authMode === "register" && !otpSent) {
      if (!authForm.email || !authForm.name || !authForm.password) {
        triggerToast("Please enter all required name, email, and password credentials.", "warning");
        return;
      }
      setIsOtpSending(true);
      try {
        const res = await fetch("/api/auth/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: authForm.email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to generate verification code.");
        
        setOtpSent(true);
        triggerToast("Verification OTP sent to your email. Please check your inbox.", "success");
      } catch (err) {
        triggerToast(err.message, "error");
      } finally {
        setIsOtpSending(false);
      }
      return;
    }

    // Stage 2: Login or complete registration
    setIsAuthLoading(true);
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload = authMode === "login" 
      ? { email: authForm.email, password: authForm.password } 
      : { ...authForm, otp: otpForm };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed.");

      onAuthSuccess(data);
      
      // Reset forms
      setOtpSent(false);
      setOtpForm("");
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

  return (
    <section className="auth-container">
      <div className="auth-wrapper">
        {/* Left Column: Form details */}
        <div className="auth-form-side">
          <div className="auth-header">
            <h1 className="auth-title">
              {authMode === "login" ? "Wellcome Back! 👋" : "Register Workspace"}
            </h1>
            <p className="auth-subtitle">
              {authMode === "login" 
                ? "Please enter log in details below." 
                : "Create your detailed role profile to connect."}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {authMode === "login" ? (
              <>
                <div className="form-group">
                  <label>Email Address</label>
                  <input 
                    type="email" 
                    required 
                    placeholder="name@example.com"
                    value={authForm.email}
                    onChange={e => setAuthForm({...authForm, email: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input 
                    type="password" 
                    required 
                    placeholder="••••••••"
                    value={authForm.password}
                    onChange={e => setAuthForm({...authForm, password: e.target.value})}
                  />
                </div>
              </>
            ) : otpSent ? (
              <div className="card-inner" style={{ padding: "1.5rem", background: "rgba(0,0,0,0.02)", textAlign: "center" }}>
                <h4 style={{ color: "var(--color-patient-primary)", marginBottom: "0.5rem" }}>Verify Registration</h4>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
                  We have generated a 6-digit registration code for <strong>{authForm.email}</strong>. Please check your inbox and paste it below.
                </p>
                
                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label>6-Digit Verification Code (OTP)</label>
                  <input 
                    type="text" 
                    required 
                    maxLength="6"
                    placeholder="e.g. 123456"
                    style={{ fontSize: "1.25rem", letterSpacing: "6px", textAlign: "center", fontWeight: "bold", padding: "0.6rem" }}
                    value={otpForm}
                    onChange={e => setOtpForm(e.target.value)}
                  />
                </div>
                
                <span 
                  style={{ fontSize: "0.75rem", color: "var(--color-doctor-primary)", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => { setOtpSent(false); setOtpForm(""); }}
                >
                  Change Email / Edit Credentials
                </span>
              </div>
            ) : (
              <>
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

                <div className="form-group">
                  <label>Register Role</label>
                  <select 
                    value={authForm.role}
                    onChange={e => setAuthForm({...authForm, role: e.target.value})}
                    className="auth-role-select"
                  >
                    <option value="patient">Patient Profile</option>
                    <option value="doctor">Medical Specialist</option>
                  </select>
                </div>

                {/* DOCTOR CREDENTIALS */}
                {authForm.role === "doctor" && (
                  <div className="card-inner" style={{ marginTop: 0, padding: "1rem", background: "rgba(0,0,0,0.02)", borderStyle: "dashed" }}>
                    <h4 style={{ fontSize: "0.85rem", color: "var(--color-doctor-primary)", marginBottom: "0.75rem", fontFamily: "var(--font-family-display)" }}>Specialist Credentials</h4>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Specialty</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. Cardiology"
                          value={authForm.specialty}
                          onChange={e => setAuthForm({...authForm, specialty: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Experience (Yrs)</label>
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
                        <label>License No / NPI</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. LIC98242"
                          value={authForm.licenseNumber}
                          onChange={e => setAuthForm({...authForm, licenseNumber: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Hospital Name</label>
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. City Hospital"
                          value={authForm.hospital}
                          onChange={e => setAuthForm({...authForm, hospital: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* PATIENT DEMOGRAPHICS */}
                {authForm.role === "patient" && (
                  <div className="card-inner" style={{ marginTop: 0, padding: "1rem", background: "rgba(0,0,0,0.02)", borderStyle: "dashed" }}>
                    <h4 style={{ fontSize: "0.85rem", color: "var(--color-patient-primary)", marginBottom: "0.75rem", fontFamily: "var(--font-family-display)" }}>Medical Demographics</h4>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Age</label>
                        <input 
                          type="number" 
                          required
                          placeholder="28"
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
                        <label>Blood</label>
                        <input 
                          type="text" 
                          required
                          placeholder="O+"
                          value={authForm.bloodGroup}
                          onChange={e => setAuthForm({...authForm, bloodGroup: e.target.value})}
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>BP (Syst)</label>
                        <input 
                          type="number" 
                          required
                          placeholder="120"
                          value={authForm.bpSystolic}
                          onChange={e => setAuthForm({...authForm, bpSystolic: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>BP (Diast)</label>
                        <input 
                          type="number" 
                          required
                          placeholder="80"
                          value={authForm.bpDiastolic}
                          onChange={e => setAuthForm({...authForm, bpDiastolic: e.target.value})}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label>Sugar</label>
                        <input 
                          type="number" 
                          required
                          placeholder="90"
                          value={authForm.sugar}
                          onChange={e => setAuthForm({...authForm, sugar: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Medical History</label>
                      <textarea 
                        rows="2" 
                        placeholder="Existing conditions..."
                        style={{ width: "100%", background: "#f8fafc", border: "1px solid #cbd5e1", color: "#021024", padding: "0.4rem", borderRadius: "4px", outline: "none", fontSize: "0.8rem", fontFamily: "var(--font-family-body)", resize: "vertical" }}
                        value={authForm.medicalHistory}
                        onChange={e => setAuthForm({...authForm, medicalHistory: e.target.value})}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <button 
              type="submit" 
              className={`btn ${authForm.role === 'doctor' || authMode === 'login' ? 'btn-doctor' : 'btn-patient'} btn-block mt-2`} 
              disabled={isAuthLoading || isOtpSending}
            >
              {isOtpSending 
                ? "Generating Verification Code..." 
                : isAuthLoading 
                  ? "Authenticating..." 
                  : authMode === "login" 
                    ? "Sign In" 
                    : otpSent 
                      ? "Verify Code & Register" 
                      : "Send Verification Code"}
            </button>
          </form>

          <div style={{ marginTop: "1.25rem", textAlign: "center", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            {authMode === "login" ? (
              <p>
                Don't have an account?{" "}
                <span className="auth-toggle-link" onClick={() => { setAuthMode("register"); setOtpSent(false); setOtpForm(""); }}>
                  Register here
                </span>
              </p>
            ) : (
              <p>
                Already have an account?{" "}
                <span className="auth-toggle-link" onClick={() => { setAuthMode("login"); setOtpSent(false); setOtpForm(""); }}>
                  Sign in here
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Centered doctor graphic banner */}
        <div className="auth-visual-side">
          <div className="auth-visual-overlay" />
          <div className="auth-visual-wrapper">
            <img 
              src="dist/ai_doctor_login_illustration.jpg" 
              alt="AI Doctor & Hospital ward Diagnostics" 
              className="auth-visual-bg"
            />
            <div className="auth-visual-content">
              <h2 className="auth-visual-title">Manage your Health Anywhere</h2>
              <p className="auth-visual-text">
                Chat with clinical symptom triagers, upload files to execute OCR summaries, check medication trackers, and connect with peer doctors.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
