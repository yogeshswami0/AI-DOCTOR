import React, { useState } from "react";

export default function PatientReports({
  patientProfile,
  fetchPatientProfile,
  user,
  fetchWithAuth,
  triggerToast
}) {
  const [selectedReport, setSelectedReport] = useState(null);

  const handleReportDelete = async (reportId) => {
    if (!window.confirm("Are you sure you want to delete this report record?")) return;
    try {
      const res = await fetchWithAuth(`/api/patient/reports/${reportId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        triggerToast("Report deleted successfully", "success");
        if (fetchPatientProfile && user) fetchPatientProfile(user.id);
        if (selectedReport && (selectedReport._id === reportId || selectedReport.id === reportId)) {
          setSelectedReport(null);
        }
      } else {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete report.");
      }
    } catch (err) {
      triggerToast(err.message, "error");
    }
  };

  const reports = patientProfile?.reports || [];

  return (
    <div className="card consultations-card" style={{ height: "calc(100vh - 40px)", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {selectedReport ? (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "1rem" }}>
          {/* Back Action Header */}
          <div style={{ marginBottom: "1.5rem" }}>
            <button 
              className="btn btn-secondary" 
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
              onClick={() => setSelectedReport(null)}
            >
              ← Back to Reports List
            </button>
          </div>

          <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
            <h2 style={{ fontFamily: "var(--font-family-display)", fontSize: "1.4rem", margin: "0 0 0.5rem 0", color: "var(--text-main)" }}>
              📄 {selectedReport.name}
            </h2>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Uploaded on: {new Date(selectedReport.uploadedAt).toLocaleString()}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            {/* Diagnosed Conditions */}
            {selectedReport.diagnosed_conditions?.length > 0 && (
              <div className="card-inner" style={{ margin: 0, padding: "1.25rem" }}>
                <h3 style={{ fontSize: "1rem", color: "var(--color-patient-primary)", marginBottom: "0.75rem", fontFamily: "var(--font-family-display)", marginTop: 0 }}>
                  ⚕️ Diagnosed Conditions
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {selectedReport.diagnosed_conditions.map((c, i) => (
                    <span key={i} className="badge badge-patient" style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}>{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Medications Table */}
            {selectedReport.prescribed_medications?.length > 0 && (
              <div className="card-inner" style={{ margin: 0, padding: "1.25rem" }}>
                <h3 style={{ fontSize: "1rem", color: "var(--color-patient-primary)", marginBottom: "0.75rem", fontFamily: "var(--font-family-display)", marginTop: 0 }}>
                  💊 Prescribed Medications
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table className="consultations-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border-color)" }}>
                        <th style={{ textAlign: "left", padding: "0.75rem" }}>Medication Name</th>
                        <th style={{ textAlign: "left", padding: "0.75rem" }}>Dosage</th>
                        <th style={{ textAlign: "left", padding: "0.75rem" }}>Frequency</th>
                        <th style={{ textAlign: "left", padding: "0.75rem" }}>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReport.prescribed_medications.map((m, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-color)" }}>
                          <td style={{ padding: "0.75rem", fontWeight: 600 }}>{m.name}</td>
                          <td style={{ padding: "0.75rem" }}>{m.dosage || "--"}</td>
                          <td style={{ padding: "0.75rem" }}>{m.frequency || "--"}</td>
                          <td style={{ padding: "0.75rem" }}>{m.duration || "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Abnormal Labs Table */}
            {selectedReport.abnormal_lab_markers?.length > 0 && (
              <div className="card-inner" style={{ margin: 0, padding: "1.25rem" }}>
                <h3 style={{ fontSize: "1rem", color: "var(--color-patient-primary)", marginBottom: "0.75rem", fontFamily: "var(--font-family-display)", marginTop: 0 }}>
                  🧪 Abnormal Lab Markers
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table className="consultations-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border-color)" }}>
                        <th style={{ textAlign: "left", padding: "0.75rem" }}>Test Name</th>
                        <th style={{ textAlign: "left", padding: "0.75rem" }}>Extracted Value</th>
                        <th style={{ textAlign: "left", padding: "0.75rem" }}>Clinical Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReport.abnormal_lab_markers.map((l, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-color)" }}>
                          <td style={{ padding: "0.75rem", fontWeight: 600 }}>{l.test_name}</td>
                          <td style={{ padding: "0.75rem" }}>{l.value}</td>
                          <td style={{ padding: "0.75rem" }}>
                            <span 
                              className="badge" 
                              style={{ 
                                backgroundColor: l.status.toLowerCase() === "high" ? "#fee2e2" : "#fef3c7", 
                                color: l.status.toLowerCase() === "high" ? "#991b1b" : "#92400e",
                                padding: "0.2rem 0.5rem",
                                borderRadius: "4px",
                                fontSize: "0.75rem",
                                fontWeight: 600
                              }}
                            >
                              {l.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: "2.5rem", borderTop: "1px solid var(--border-color)", paddingTop: "1.5rem" }}>
            <button 
              className="btn btn-secondary" 
              style={{ backgroundColor: "#ef4444", color: "#fff", border: "none", padding: "0.6rem 1.2rem" }}
              onClick={() => handleReportDelete(selectedReport._id || selectedReport.id)}
            >
              🗑️ Delete Saved Report Record
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          <div className="consultations-header" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontFamily: "var(--font-family-display)", fontSize: "1.3rem", margin: 0 }}>
              📁 Saved OCR Medical Reports
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
              Archive of all your historically parsed medical document files, prescriptions, and lab test results.
            </p>
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {reports.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem", border: "1px dashed var(--border-color)", borderRadius: "8px" }}>
                <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.5rem" }}>📄</span>
                <h4 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem 0" }}>No saved reports found</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "320px", margin: "0 auto" }}>
                  Go to the <strong>AI Triage & Scanner</strong> workspace tab to upload and save report records.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="consultations-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border-color)" }}>
                      <th style={{ textAlign: "left", padding: "0.75rem" }}>Report Name</th>
                      <th style={{ textAlign: "left", padding: "0.75rem" }}>Upload Date</th>
                      <th style={{ textAlign: "left", padding: "0.75rem" }}>Conditions Found</th>
                      <th style={{ textAlign: "center", padding: "0.75rem", width: "100px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr 
                        key={report._id || report.id} 
                        style={{ borderBottom: "1px solid var(--border-color)", cursor: "pointer" }}
                        onClick={() => setSelectedReport(report)}
                      >
                        <td style={{ padding: "0.75rem", fontWeight: 600, color: "var(--color-patient-primary)" }}>
                          📄 {report.name}
                        </td>
                        <td style={{ padding: "0.75rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                          {new Date(report.uploadedAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "0.75rem" }}>
                          {report.diagnosed_conditions && report.diagnosed_conditions.length > 0 ? (
                            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                              {report.diagnosed_conditions.map((c, idx) => (
                                <span key={idx} className="badge badge-patient" style={{ fontSize: "0.7rem", padding: "1px 6px" }}>{c}</span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic" }}>None</span>
                          )}
                        </td>
                        <td style={{ padding: "0.75rem", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: "4px 8px", fontSize: "0.75rem", backgroundColor: "#ef4444", color: "#fff", border: "none" }}
                            onClick={() => handleReportDelete(report._id || report.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
