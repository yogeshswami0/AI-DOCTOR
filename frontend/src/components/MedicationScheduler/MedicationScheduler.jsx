import React from "react";
import "./MedicationScheduler.css";

export default function MedicationScheduler({
  medications,
  newMedication,
  setNewMedication,
  handleAddMedication,
  handleToggleMedicationDose,
  handleDeleteMedication
}) {
  const [alarmTimes, setAlarmTimes] = React.useState(["08:00"]);

  React.useEffect(() => {
    if (newMedication.frequency === "Once Daily" || newMedication.frequency === "As Needed (PRN)") {
      setAlarmTimes(["08:00"]);
    } else if (newMedication.frequency === "Twice Daily") {
      setAlarmTimes(["08:00", "20:00"]);
    } else if (newMedication.frequency === "Thrice Daily") {
      setAlarmTimes(["08:00", "14:00", "20:00"]);
    }
  }, [newMedication.frequency]);

  const todayDate = new Date().toISOString().split("T")[0];

  const isMedActiveToday = (med) => {
    if (!med.isActive) return false;
    if (todayDate < med.startDate) return false;
    if (med.endDate && todayDate > med.endDate) return false;
    return true;
  };

  const isMedTakenToday = (med) => {
    return med.adherenceLogs && med.adherenceLogs.some(log => log.date === todayDate && log.status === "taken");
  };

  const activeMeds = medications.filter(isMedActiveToday);
  const totalCount = activeMeds.length;
  const takenCount = activeMeds.filter(isMedTakenToday).length;
  const complianceRate = totalCount > 0 ? Math.round((takenCount / totalCount) * 100) : 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", padding: "1.5rem", gap: "0" }}>
      <div className="feature-header-box">
        <div className="feature-logo-frame">
          <span className="feature-icon">⏰</span>
        </div>
        <div className="feature-heading-group">
          <h1 className="feature-title">Prescription & Medication Scheduler</h1>
          <p className="feature-desc">Schedule dose intervals, set daily alarms, and track patient treatment compliance.</p>
        </div>
      </div>
      
      <div className="scheduler-layout" style={{ flex: 1, height: "calc(100% - 75px)" }}>
      {/* Left Pane: Alarms Timeline Checklist */}
      <div className="scheduler-pane">
        
        {/* Compliance percentage box */}
        <div className="card compliance-progress-box">
          <div className="compliance-details">
            <div>
              <h4 style={{ fontSize: "1.1rem", fontFamily: "var(--font-family-display)", fontWeight: 700, margin: 0 }}>Compliance Rate</h4>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Medication Adherence Overview</span>
            </div>
            <div className="compliance-pct">{complianceRate}%</div>
          </div>
          <div className="adherence-bar-container">
            <div 
              className="adherence-bar-fill" 
              style={{ width: `${complianceRate}%` }}
            ></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginTop: "0.5rem", color: "var(--text-muted)" }}>
            <span>{takenCount} of {totalCount} doses taken today</span>
            <span>Target: 100% Adherence</span>
          </div>
        </div>

        {/* Alarm checklist */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3 style={{ fontFamily: "var(--font-family-display)", fontSize: "1.1rem", margin: 0 }}>⏰ Today's Timeline Checklist</h3>
          
          {activeMeds.length === 0 ? (
            <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
              <span>💊</span>
              <h4>No Medication Alarms Active Today</h4>
              <p style={{ fontSize: "0.8rem" }}>Add your clinical prescriptions or adjust date bounds in the right pane to track alarms.</p>
            </div>
          ) : (
            activeMeds.map(med => {
              const taken = isMedTakenToday(med);
              return (
                <div 
                  key={med._id} 
                  className={`medication-card-item ${taken ? 'dose-taken' : 'dose-pending'}`}
                >
                  <div className="medication-card-header">
                    <div>
                      <span className="medication-name">{med.name}</span>
                      <div className="medication-details">
                        Dosage: <strong>{med.dosage}</strong> • Freq: <strong>{med.frequency}</strong>
                      </div>
                    </div>
                    <span className="medication-time">{med.time}</span>
                  </div>

                  <div className="medication-actions">
                    <div className="compliance-status">
                      Status:{" "}
                      <span className={taken ? "status-taken" : "status-pending"}>
                        {taken ? "✓ Completed" : "⏳ Pending"}
                      </span>
                    </div>
                    
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button 
                        className={`btn btn-secondary ${taken ? 'btn-patient' : ''}`}
                        onClick={() => handleToggleMedicationDose(med._id, taken)}
                        style={{ padding: "0.3rem 0.75rem", fontSize: "0.75rem" }}
                      >
                        {taken ? "Mark Pending" : "Mark Taken"}
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        onClick={() => handleDeleteMedication(med._id)}
                        style={{ padding: "0.3rem 0.5rem", fontSize: "0.75rem", color: "red" }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Pane: Prescription Schedule Creator */}
      <div>
        <form className="card scheduler-form-card" onSubmit={e => handleAddMedication(e, alarmTimes)}>
          <h4>➕ Configure Medication Alarm</h4>
          <div className="form-group">
            <label>Medication / Drug Name</label>
            <input 
              type="text" 
              required 
              placeholder="e.g. Paracetamol or Metformin"
              value={newMedication.name}
              onChange={e => setNewMedication({...newMedication, name: e.target.value})}
            />
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Dosage Quantity</label>
              <input 
                type="text" 
                required 
                placeholder="e.g. 500mg or 1 pill"
                value={newMedication.dosage}
                onChange={e => setNewMedication({...newMedication, dosage: e.target.value})}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Daily Frequency</label>
              <select 
                value={newMedication.frequency}
                onChange={e => setNewMedication({...newMedication, frequency: e.target.value})}
              >
                <option value="Once Daily">Once Daily</option>
                <option value="Twice Daily">Twice Daily</option>
                <option value="Thrice Daily">Thrice Daily</option>
                <option value="As Needed (PRN)">As Needed (PRN)</option>
              </select>
            </div>
          </div>

          {alarmTimes.map((time, idx) => (
            <div className="form-group" key={idx} style={{ marginTop: "0.5rem" }}>
              <label>Alarm Reminder Time {alarmTimes.length > 1 ? `#${idx + 1}` : ""}</label>
              <input 
                type="time" 
                required 
                value={time}
                onChange={e => {
                  const updated = [...alarmTimes];
                  updated[idx] = e.target.value;
                  setAlarmTimes(updated);
                }}
              />
            </div>
          ))}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Start Date</label>
              <input 
                type="date" 
                required 
                value={newMedication.startDate || ""}
                onChange={e => setNewMedication({...newMedication, startDate: e.target.value})}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>End Date (Optional)</label>
              <input 
                type="date" 
                value={newMedication.endDate || ""}
                onChange={e => setNewMedication({...newMedication, endDate: e.target.value})}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-patient btn-block mt-3">
            Add Daily Medication Alarm
          </button>
        </form>
      </div>
    </div>
  </div>
  );
}
