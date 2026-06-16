import React, { useState, useEffect, useRef } from 'react';

const API_BASE = "http://127.0.0.1:8000/api";

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Data State
  const [stats, setStats] = useState({
    total_documents: 0,
    total_alerts: 0,
    total_escalated: 0,
    compliance_rate: 100,
    tickets_status: { Open: 0, Submitted: 0, Approved: 0, Rejected: 0 },
    tickets_department: { IT: 0, HR: 0, Legal: 0, Treasury: 0 }
  });
  const [alerts, setAlerts] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [settings, setSettings] = useState({
    threshold: 0.50,
    gemini_api_key: "",
    skills_IT: "",
    skills_HR: "",
    skills_Legal: "",
    skills_Treasury: ""
  });
  
  // Loading & Action State
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [ingestText, setIngestText] = useState("");
  const [ingestDocName, setIngestDocName] = useState("Manual Ingest Document");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [auditResult, setAuditResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  // Refs
  const fileInputRef = useRef(null);
  const evidenceFileInputRef = useRef(null);

  // Fetch data on load and when activeTab changes
  useEffect(() => {
    fetchStats();
    fetchAlerts();
    fetchTickets();
    fetchSettings();
  }, [activeTab]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/dashboard`);
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`${API_BASE}/alerts`);
      if (res.ok) setAlerts(await res.json());
    } catch (err) {
      console.error("Error fetching alerts:", err);
    }
  };

  const fetchTickets = async () => {
    try {
      const res = await fetch(`${API_BASE}/tickets`);
      if (res.ok) setTickets(await res.json());
    } catch (err) {
      console.error("Error fetching tickets:", err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings({
          threshold: parseFloat(data.threshold) || 0.50,
          gemini_api_key: data.gemini_api_key || "",
          skills_IT: data.skills_IT || "",
          skills_HR: data.skills_HR || "",
          skills_Legal: data.skills_Legal || "",
          skills_Treasury: data.skills_Treasury || ""
        });
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  // Upload handler
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setIsScanning(true);
    setUploadStatus(null);
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("threshold", settings.threshold);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setUploadStatus({
          success: true,
          message: `Successfully processed ${file.name}. Scanned ${data.total_segments} pages, escalated ${data.escalated_count} anomalies.`
        });
        fetchStats();
        fetchAlerts();
        fetchTickets();
      } else {
        const data = await res.json();
        setUploadStatus({
          success: false,
          message: `Error: ${data.detail || "Scanning failed."}`
        });
      }
    } catch (err) {
      setUploadStatus({ success: false, message: "Network error during upload." });
    } finally {
      setLoading(false);
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Manual Ingest handler
  const handleManualIngest = async (e) => {
    e.preventDefault();
    if (!ingestText.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ingest-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_name: ingestDocName,
          text_content: ingestText
        })
      });
      if (res.ok) {
        const data = await res.json();
        setUploadStatus({
          success: true,
          message: `Text scanned. Anomaly Rscore: ${data.rscore.toFixed(4)}. Escalated: ${data.is_escalated ? "YES" : "NO"}.`
        });
        setIngestText("");
        fetchStats();
        fetchAlerts();
        fetchTickets();
      }
    } catch (err) {
      console.error("Manual ingest failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // Submit Evidence handler
  const handleSubmitEvidence = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;

    setLoading(true);
    setAuditResult(null);

    const formData = new FormData();
    if (evidenceFile) {
      formData.append("file", evidenceFile);
    } else if (evidenceText.trim()) {
      formData.append("evidence_text", evidenceText);
    } else {
      alert("Please enter text evidence or upload an evidence document.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/tickets/${selectedTicket.id}/submit-evidence`, {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setAuditResult({
          passed: data.audit_passed,
          score: data.audit_score,
          feedback: data.feedback
        });
        
        // Refresh local details
        setSelectedTicket(prev => ({
          ...prev,
          status: data.ticket_status,
          audit_score: data.audit_score,
          audit_feedback: data.feedback,
          evidence_file: evidenceFile ? evidenceFile.name : "Manual Text Entry",
          evidence_text: evidenceText || "Document parsed"
        }));

        fetchStats();
        fetchTickets();
      } else {
        alert("Evidence submission failed.");
      }
    } catch (err) {
      console.error("Submit evidence error:", err);
    } finally {
      setLoading(false);
      setEvidenceText("");
      setEvidenceFile(null);
      if (evidenceFileInputRef.current) evidenceFileInputRef.current.value = "";
    }
  };

  // Run audit loop manually
  const triggerAuditLoop = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/audit-loop`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        alert(`Audit loop completed. Re-audited ${data.audited_tickets_count} tickets.`);
        fetchStats();
        fetchTickets();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Save Settings handler
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        alert("Settings saved successfully.");
        fetchSettings();
      } else {
        alert("Failed to save settings.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSettingsChange = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  // Icons SVGs
  const Icons = {
    Dashboard: () => (
      <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" /></svg>
    ),
    Scanner: () => (
      <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0a8 8 0 11-16 0 8 8 0 0116 0z" /></svg>
    ),
    Orchestrator: () => (
      <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
    ),
    Tasks: () => (
      <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
    ),
    Settings: () => (
      <svg style={{ width: '18px', height: '18px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    ),
    Upload: () => (
      <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
    ),
    File: () => (
      <svg style={{ width: '24px', height: '24px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
    )
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">S</div>
          <div>
            <h1 className="brand-title">Sentinel-RegAI</h1>
            <p className="brand-subtitle">Compliance Engine</p>
          </div>
        </div>

        <nav className="nav-links">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <Icons.Dashboard /> Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('alpha')} 
            className={`nav-link ${activeTab === 'alpha' ? 'active' : ''}`}
          >
            <Icons.Scanner /> Agent Alpha (Scanner)
          </button>
          <button 
            onClick={() => setActiveTab('beta')} 
            className={`nav-link ${activeTab === 'beta' ? 'active' : ''}`}
          >
            <Icons.Orchestrator /> Agent Beta (Orchestrator)
          </button>
          <button 
            onClick={() => setActiveTab('tasks')} 
            className={`nav-link ${activeTab === 'tasks' ? 'active' : ''}`}
          >
            <Icons.Tasks /> Task Board
          </button>
          <button 
            onClick={() => setActiveTab('settings')} 
            className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
          >
            <Icons.Settings /> Settings
          </button>
        </nav>

        {/* System Health / API Indicator */}
        <div className="system-status">
          <div className="status-indicator">
            <div>
              <span className="text-label">Gemini Core</span>
              <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-primary)' }}>
                {settings.gemini_api_key ? "Connected" : "Offline / Local"}
              </span>
            </div>
            <div className={`status-dot ${settings.gemini_api_key ? 'active' : 'inactive'}`} />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        
        {/* Top Header */}
        <header className="app-header">
          <div className="header-title">
            <h2>
              {activeTab === 'dashboard' && "Compliance Dashboard"}
              {activeTab === 'alpha' && "Agent Alpha: Traffic Scanner"}
              {activeTab === 'beta' && "Agent Beta: Orchestrator"}
              {activeTab === 'tasks' && "Departmental Task Board"}
              {activeTab === 'settings' && "System Settings"}
            </h2>
            <p>
              {activeTab === 'dashboard' && "Overview of regulatory intelligence and ticketing compliance metrics."}
              {activeTab === 'alpha' && "Real-time parsing, anomaly detection and risk scoring on regulatory feeds."}
              {activeTab === 'beta' && "Policy interpretation, Measurable Action Point (MAP) creation and routing reasoning."}
              {activeTab === 'tasks' && "Submit operational evidence and review autonomous audit logs."}
              {activeTab === 'settings' && "Adjust detection thresholds and update department skills profile."}
            </p>
          </div>
          <div className="header-actions">
            <button 
              onClick={triggerAuditLoop}
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '8px 14px' }}
              disabled={loading}
            >
              Recheck Audits
            </button>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '8px 12px', borderRadius: '8px', fontFamily: 'monospace' }}>
              v1.0.0
            </div>
          </div>
        </header>

        {/* Tab Views */}
        <div className="views-container">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Metrics Grid */}
              <div className="metrics-grid">
                <div className="glass-card metric-card">
                  <span className="metric-label">Compliance Rate</span>
                  <span className="metric-value" style={{ color: 'var(--accent-emerald)' }}>{stats.compliance_rate}%</span>
                  <div className="progress-bar-container">
                    <div className="progress-bar-fill" style={{ width: `${stats.compliance_rate}%`, backgroundColor: 'var(--accent-emerald)' }} />
                  </div>
                </div>

                <div className="glass-card metric-card">
                  <span className="metric-label">Ingested Docs</span>
                  <span className="metric-value" style={{ color: 'var(--accent-cyan)' }}>{stats.total_documents}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '12px' }}>Total source policy files</span>
                </div>

                <div className="glass-card metric-card">
                  <span className="metric-label">Scanned Segments</span>
                  <span className="metric-value" style={{ color: 'var(--accent-blue)' }}>{stats.total_alerts}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '12px' }}>Processed text blocks</span>
                </div>

                <div className="glass-card metric-card">
                  <span className="metric-label">Escalated Alerts</span>
                  <span className="metric-value" style={{ color: 'var(--accent-rose)' }}>{stats.total_escalated}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '12px' }}>Exceeding threshold anomaly</span>
                </div>
              </div>

              {/* Dashboard layouts */}
              <div className="dashboard-grid">
                
                {/* Left side: Allocation */}
                <div className="glass-card">
                  <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '20px', fontSize: '16px', fontWeight: '700' }}>Task Allocation by Department</h3>
                  <div className="allocation-list">
                    {['IT', 'HR', 'Legal', 'Treasury'].map(dept => {
                      const count = stats.tickets_department[dept] || 0;
                      const max = Math.max(...Object.values(stats.tickets_department), 1);
                      const percent = (count / max) * 100;
                      return (
                        <div key={dept} className="allocation-item">
                          <div className="allocation-header">
                            <span>{dept} Department</span>
                            <span style={{ color: 'var(--accent-cyan)' }}>{count} Active Tickets</span>
                          </div>
                          <div style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                            <div 
                              style={{ height: '100%', borderRadius: '4px', background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-blue))', width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right side: Status Queue */}
                <div className="glass-card">
                  <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '20px', fontSize: '16px', fontWeight: '700' }}>Compliance Status Queue</h3>
                  <div className="status-grid">
                    <div className="status-box">
                      <div>
                        <span className="text-label">Open / Unassigned</span>
                        <h4 className="status-value" style={{ color: 'var(--accent-cyan)' }}>{stats.tickets_status.Open || 0}</h4>
                      </div>
                      <div className="status-dot-large" style={{ backgroundColor: 'var(--accent-cyan)', boxShadow: '0 0 8px var(--accent-cyan)' }} />
                    </div>
                    <div className="status-box">
                      <div>
                        <span className="text-label">Audited & Verified</span>
                        <h4 className="status-value" style={{ color: 'var(--accent-emerald)' }}>{stats.tickets_status.Approved || 0}</h4>
                      </div>
                      <div className="status-dot-large" style={{ backgroundColor: 'var(--accent-emerald)', boxShadow: '0 0 8px var(--accent-emerald)' }} />
                    </div>
                    <div className="status-box">
                      <div>
                        <span className="text-label">Pending Verification</span>
                        <h4 className="status-value" style={{ color: 'var(--accent-amber)' }}>{stats.tickets_status.Submitted || 0}</h4>
                      </div>
                      <div className="status-dot-large" style={{ backgroundColor: 'var(--accent-amber)', boxShadow: '0 0 8px var(--accent-amber)' }} />
                    </div>
                    <div className="status-box">
                      <div>
                        <span className="text-label">Audit Failed</span>
                        <h4 className="status-value" style={{ color: 'var(--accent-rose)' }}>{stats.tickets_status.Rejected || 0}</h4>
                      </div>
                      <div className="status-dot-large" style={{ backgroundColor: 'var(--accent-rose)', boxShadow: '0 0 8px var(--accent-rose)' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Alerts Feed */}
              <div className="glass-card">
                <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '16px', fontSize: '16px', fontWeight: '700' }}>Recent Compliance Intelligence Feeds</h3>
                <div className="table-container">
                  <table className="table-el">
                    <thead>
                      <tr>
                        <th>Document Source</th>
                        <th>Alert Segment Preview</th>
                        <th>Anomaly Score</th>
                        <th>Escalated Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.slice(0, 5).map(alert => (
                        <tr key={alert.id}>
                          <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{alert.document_name}</td>
                          <td style={{ maxWidth: '400px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alert.content}</td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)', fontWeight: '600' }}>{(alert.rscore * 100).toFixed(1)}%</td>
                          <td>
                            <span className={`badge ${alert.is_escalated ? 'badge-escalated' : 'badge-bau'}`}>
                              {alert.is_escalated ? 'Escalated' : 'BAU'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {alerts.length === 0 && (
                        <tr>
                          <td colSpan="4" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No regulatory updates scanned. Upload a document in the Scanner tab to begin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: AGENT ALPHA (SCANNER) */}
          {activeTab === 'alpha' && (
            <div className="scanner-layout">
              {/* Ingestion Side */}
              <div className="scanner-controls">
                <div className="glass-card">
                  <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '12px', fontSize: '16px', fontWeight: '700' }}>Ingestion Engine</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px' }}>Upload the BankSavers regulatory PDF to parse and score alerts.</p>
                  
                  <div 
                    onClick={() => fileInputRef.current.click()}
                    className="drop-zone"
                    style={isScanning ? { borderColor: 'var(--accent-cyan)', backgroundColor: 'rgba(6, 182, 212, 0.05)' } : {}}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleUpload} 
                      className="hidden" 
                      style={{ display: 'none' }}
                      accept=".pdf"
                      disabled={loading}
                    />
                    <div style={{ color: 'var(--accent-cyan)', marginBottom: '10px' }}><Icons.Upload /></div>
                    <span style={{ fontSize: '13px', fontWeight: '600' }}>{isScanning ? "Scanning PDF Chapters..." : "Upload BankSavers PDF"}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Accepts .pdf format only</span>
                  </div>

                  {uploadStatus && (
                    <div style={{ 
                      marginTop: '16px', 
                      padding: '12px', 
                      borderRadius: '8px', 
                      fontSize: '12px', 
                      lineHeight: '1.4',
                      border: '1px solid',
                      backgroundColor: uploadStatus.success ? 'rgba(16, 185, 129, 0.05)' : 'rgba(244, 63, 94, 0.05)',
                      borderColor: uploadStatus.success ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                      color: uploadStatus.success ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                    }}>
                      {uploadStatus.message}
                    </div>
                  )}
                </div>

                <div className="glass-card">
                  <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '16px', fontSize: '16px', fontWeight: '700' }}>Manual Alert Ingestion</h3>
                  <form onSubmit={handleManualIngest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="form-group">
                      <label>Document Source Label</label>
                      <input 
                        type="text" 
                        value={ingestDocName}
                        onChange={(e) => setIngestDocName(e.target.value)}
                        className="form-input"
                      />
                    </div>
                    <div className="form-group">
                      <label>Regulatory Alert Text</label>
                      <textarea 
                        value={ingestText}
                        onChange={(e) => setIngestText(e.target.value)}
                        placeholder="Paste single policy mandate, RBI updates or circular details..."
                        rows="4"
                        className="form-input"
                        style={{ resize: 'none' }}
                        required
                      />
                    </div>
                    <button 
                      type="submit" 
                      className="btn-primary" 
                      style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
                      disabled={loading}
                    >
                      Run Classification Scanner
                    </button>
                  </form>
                </div>
              </div>

              {/* Feed logs */}
              <div className="glass-card scanner-feed">
                <div className="feed-header">
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: '700' }}>Alpha Scanner Outputs</h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Trigger Level: {settings.threshold.toFixed(2)}</span>
                </div>
                <div className="feed-items">
                  {alerts.map(alert => {
                    const isEsc = alert.is_escalated;
                    return (
                      <div 
                        key={alert.id} 
                        className="feed-item"
                        style={isEsc ? { borderLeft: '3px solid var(--accent-rose)', backgroundColor: 'rgba(244, 63, 94, 0.02)' } : {}}
                      >
                        <div className="feed-item-header">
                          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                            Source: {alert.document_name}
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <span className="badge badge-rscore">
                              Score: {alert.rscore.toFixed(4)}
                            </span>
                            <span className={`badge ${isEsc ? 'badge-escalated' : 'badge-bau'}`}>
                              {isEsc ? 'Escalated' : 'BAU'}
                            </span>
                          </div>
                        </div>
                        <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-primary)' }}>{alert.content}</p>
                      </div>
                    );
                  })}
                  {alerts.length === 0 && (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
                      <Icons.Scanner />
                      <p style={{ fontSize: '13px' }}>Scanned log database is empty. Process a file to view.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AGENT BETA (ORCHESTRATOR) */}
          {activeTab === 'beta' && (
            <div className="orchestrator-layout">
              {/* Queue panel */}
              <div className="glass-card queue-panel">
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}>Escalation Queue</h3>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Scanned alerts flagged as anomalous.</p>
                <div className="queue-items">
                  {alerts.filter(a => a.is_escalated).map(alert => {
                    const ticket = tickets.find(t => t.alert_id === alert.id);
                    return (
                      <div 
                        key={alert.id}
                        onClick={() => {
                          if (ticket) setSelectedTicket(ticket);
                        }}
                        className={`queue-card ${selectedTicket?.alert_id === alert.id ? 'active' : ''}`}
                      >
                        <div style={{ display: 'flex', justify: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{alert.document_name}</span>
                          <span className="badge badge-escalated" style={{ fontSize: '8px', padding: '1px 5px' }}>Rscore: {alert.rscore.toFixed(3)}</span>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }} className="line-clamp-2">
                          {alert.content}
                        </p>
                        {ticket && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.02)', fontSize: '10px' }}>
                            <span style={{ color: 'var(--accent-violet)', fontWeight: '600' }}>Matched: {ticket.department}</span>
                            <span style={{ color: 'var(--text-muted)' }}>Details &rarr;</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {alerts.filter(a => a.is_escalated).length === 0 && (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justify: 'center', color: 'var(--text-muted)', gap: '8px' }}>
                      <Icons.Orchestrator />
                      <p style={{ fontSize: '12px' }}>Escalation queue is empty.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Reasoning view */}
              <div className="glass-card reasoning-panel">
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>Agent Beta Routing Reasoning</h3>
                
                {selectedTicket ? (
                  <div className="reasoning-steps">
                    {/* Step 1 */}
                    <div className="reasoning-step">
                      <div className="reasoning-step-header step-rose">
                        <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--accent-rose)', borderRadius: '50%' }} />
                        Step 1: Escaled Alert Raw Source
                      </div>
                      <p className="reasoning-text" style={{ fontStyle: 'italic', backgroundColor: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.02)' }}>
                        "{alerts.find(a => a.id === selectedTicket.alert_id)?.content}"
                      </p>
                    </div>

                    {/* Step 2 */}
                    <div className="reasoning-step">
                      <div className="reasoning-step-header step-cyan">
                        <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--accent-cyan)', borderRadius: '50%' }} />
                        Step 2: RAG Generation (Measurable Action Point - MAP)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <span className="text-label">Actionable Task Title</span>
                          <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>{selectedTicket.title}</h4>
                        </div>
                        <div>
                          <span className="text-label">Operational Instruction (MAP)</span>
                          <p className="reasoning-text reasoning-code">
                            {selectedTicket.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div className="reasoning-step">
                      <div className="reasoning-step-header step-violet">
                        <span style={{ width: '6px', height: '6px', backgroundColor: 'var(--accent-violet)', borderRadius: '50%' }} />
                        Step 3: Vector Skill-Matrix Association Match
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div>
                          <span className="text-label">Highest Similar Department</span>
                          <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', fontSize: '11px', color: 'var(--accent-violet)', fontWeight: '700', marginTop: '4px' }}>
                            {selectedTicket.department}
                          </span>
                        </div>
                        <div>
                          <span className="text-label">Cosine Match score</span>
                          <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: '700', color: 'var(--accent-violet)', marginTop: '4px' }}>
                            {selectedTicket.similarity_score.toFixed(4)}
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '12px' }}>
                        Task TF-IDF vector matched against departmental skill profile keywords. Highest similarity score triggers automatic routing assignment to {selectedTicket.department}.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
                    <Icons.Orchestrator />
                    <p style={{ fontSize: '13px' }}>Select an escalated alert in the queue to inspect Agent Beta reasoning.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: TASK BOARD */}
          {activeTab === 'tasks' && (
            <div className="kanban-board">
              
              {/* Four Department Columns */}
              {['IT', 'HR', 'Legal', 'Treasury'].map(dept => {
                const deptTickets = tickets.filter(t => t.department === dept);
                return (
                  <div key={dept} className="kanban-column">
                    <div className="column-header">
                      <span className="column-title">{dept} Department</span>
                      <span className="column-count">{deptTickets.length}</span>
                    </div>

                    <div className="kanban-cards">
                      {deptTickets.map(ticket => (
                        <div 
                          key={ticket.id}
                          onClick={() => {
                            setSelectedTicket(ticket);
                            setAuditResult(null);
                          }}
                          className={`kanban-card ${selectedTicket?.id === ticket.id ? 'active' : ''}`}
                        >
                          <h4 className="kanban-card-title">{ticket.title}</h4>
                          <p className="kanban-card-body">{ticket.description}</p>
                          
                          <div className="kanban-card-footer">
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>ID: #{ticket.id}</span>
                            <span className={`badge-status ${
                              ticket.status === 'Approved' ? 'badge-status-approved' :
                              ticket.status === 'Rejected' ? 'badge-status-rejected' :
                              ticket.status === 'Submitted' ? 'badge-status-submitted' :
                              'badge-status-open'
                            }`}>
                              {ticket.status === 'Approved' ? 'Verified' : 
                               ticket.status === 'Rejected' ? 'Audit Fail' : 
                               ticket.status === 'Submitted' ? 'Auditing' : 'Open'}
                            </span>
                          </div>
                        </div>
                      ))}
                      {deptTickets.length === 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '11px', height: '100px' }}>
                          No tickets assigned
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Side Drawer Modal */}
              {selectedTicket && (
                <div className="drawer">
                  <div className="drawer-header">
                    <div>
                      <span className="text-label" style={{ color: 'var(--accent-cyan)' }}>{selectedTicket.department} Action Audit</span>
                      <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#fff', marginTop: '2px' }}>{selectedTicket.title}</h3>
                    </div>
                    <button className="drawer-close" onClick={() => setSelectedTicket(null)}>✕ Close</button>
                  </div>

                  <div className="drawer-content">
                    <div className="form-group">
                      <span className="text-label">Target Compliance MAP</span>
                      <p style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.6', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                        {selectedTicket.description}
                      </p>
                    </div>

                    {selectedTicket.evidence_file && (
                      <div className="audit-results-card passed" style={{ backgroundColor: 'rgba(16, 185, 129, 0.03)', borderColor: 'rgba(16, 185, 129, 0.1)' }}>
                        <span className="text-label" style={{ color: 'var(--accent-emerald)' }}>Evidence Ingested</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>{selectedTicket.evidence_file}</span>
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.1)', padding: '8px', borderRadius: '4px', overflowX: 'auto' }}>
                          {selectedTicket.evidence_text}
                        </p>
                      </div>
                    )}

                    {/* Audit Results feedback */}
                    {(selectedTicket.audit_score !== null || auditResult) && (
                      <div className={`audit-results-card ${
                        (auditResult?.passed ?? selectedTicket.status === 'Approved') ? 'passed' : 'failed'
                      }`}>
                        <div className="audit-score-row">
                          <span>{(auditResult?.passed ?? selectedTicket.status === 'Approved') ? 'Audit Passed' : 'Audit Failed'}</span>
                          <span style={{ fontFamily: 'monospace' }}>
                            Score: {(((auditResult?.score ?? selectedTicket.audit_score) || 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                          {auditResult?.feedback ?? selectedTicket.audit_feedback}
                        </p>
                      </div>
                    )}

                    {/* Submit evidence section */}
                    <form onSubmit={handleSubmitEvidence} style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                      <span className="text-label" style={{ fontSize: '11px' }}>Submit Compliance Evidence</span>
                      
                      <div className="form-group">
                        <label>Upload Document Evidence (TXT/PDF)</label>
                        <input 
                          type="file" 
                          ref={evidenceFileInputRef} 
                          onChange={(e) => setEvidenceFile(e.target.files[0])}
                          className="form-input"
                          accept=".pdf,.txt"
                        />
                      </div>
                      
                      <div style={{ textAlign: 'center', fontSize: '9px', color: 'var(--text-muted)', fontWeight: '600' }}>— OR —</div>

                      <div className="form-group">
                        <label>Paste Evidence Log Text</label>
                        <textarea 
                          value={evidenceText}
                          onChange={(e) => setEvidenceText(e.target.value)}
                          placeholder="Paste command line outputs, configuration checks or compliance proof statements..."
                          rows="4"
                          className="form-input"
                          style={{ resize: 'none' }}
                        />
                      </div>

                      <button 
                        type="submit" 
                        className="btn-primary" 
                        style={{ justifyContent: 'center', fontSize: '12px' }}
                        disabled={loading}
                      >
                        {loading ? "Auditing evidence..." : "Submit and Run Audit"}
                      </button>
                    </form>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 5: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="glass-card" style={{ maxWidth: '800px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700', marginBottom: '24px' }}>System Configurations</h3>
              
              <form onSubmit={handleSaveSettings} className="settings-form">
                
                {/* Escalation threshold */}
                <div className="slider-container">
                  <div className="slider-header">
                    <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Agent Alpha Anomaly Threshold ($\theta$)</label>
                    <span style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)', fontWeight: '700' }}>{settings.threshold.toFixed(2)}</span>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Escalation trigger level for classifying regulatory alert anomalies from BAU texts.
                  </p>
                  <input 
                    type="range" 
                    min="0.05" 
                    max="0.95" 
                    step="0.05"
                    value={settings.threshold} 
                    onChange={(e) => handleSettingsChange('threshold', parseFloat(e.target.value))}
                    className="slider-el"
                  />
                </div>

                {/* Gemini key */}
                <div className="form-group">
                  <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>Gemini API Key</label>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Provide a valid Gemini API Key to enable cognitive MAP generation and compliance auditing. 
                    Uses standard local cosine vectors if empty.
                  </p>
                  <input 
                    type="password" 
                    value={settings.gemini_api_key} 
                    onChange={(e) => handleSettingsChange('gemini_api_key', e.target.value)}
                    placeholder="Enter AIzaSy..."
                    className="form-input"
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>

                {/* Skill Keywords matrices */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '600' }}>Department Vector Skills Matrix Profiles</h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Adjust keywords describing each department. These profiles form the basis of TF-IDF Cosine Similarity task routing.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '11px' }}>IT Infrastructure & Cybersecurity</label>
                      <textarea 
                        value={settings.skills_IT} 
                        onChange={(e) => handleSettingsChange('skills_IT', e.target.value)}
                        rows="3"
                        className="form-input"
                        style={{ resize: 'none' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px' }}>Human Resources & Training</label>
                      <textarea 
                        value={settings.skills_HR} 
                        onChange={(e) => handleSettingsChange('skills_HR', e.target.value)}
                        rows="3"
                        className="form-input"
                        style={{ resize: 'none' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px' }}>Legal, Data Privacy & Audits</label>
                      <textarea 
                        value={settings.skills_Legal} 
                        onChange={(e) => handleSettingsChange('skills_Legal', e.target.value)}
                        rows="3"
                        className="form-input"
                        style={{ resize: 'none' }}
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '11px' }}>Treasury, Liquidity & Capital</label>
                      <textarea 
                        value={settings.skills_Treasury} 
                        onChange={(e) => handleSettingsChange('skills_Treasury', e.target.value)}
                        rows="3"
                        className="form-input"
                        style={{ resize: 'none' }}
                      />
                    </div>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ width: 'fit-content', fontSize: '12px' }}
                  disabled={loading}
                >
                  {loading ? "Saving configs..." : "Save System Configs"}
                </button>

              </form>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
