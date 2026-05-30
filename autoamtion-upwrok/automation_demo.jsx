import { useState, useEffect, useRef } from "react";

// --- CONFIGURATION ---
// Set your real n8n or Make.com webhook URL here
export const WEBHOOK_URL = "";

// Configure your automation workflow nodes here
export const NODES = [
    { 
        id: 1, 
        label: "Form Submitted", 
        icon: "⚡", 
        desc: "Webhook triggered", 
        color: "#f97316",
        details: {
            event: "lead.form_submitted",
            source: "automation_portfolio_demo",
            ip_address: "192.168.1.104",
            user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            referrer: "https://automation-portfolio.demo"
        }
    },
    { 
        id: 2, 
        label: "n8n Receives Data", 
        icon: "🔄", 
        desc: "Parsing lead info", 
        color: "#8b5cf6",
        details: {
            execution_id: "n8n_exec_398a10d9f",
            endpoint: "/v1/webhooks/leads",
            http_status: 200,
            payload_format: "application/json",
            parsed_fields: ["name", "email", "company", "message", "timestamp"],
            security_validation: "HMAC-SHA256 (passed)"
        }
    },
    { 
        id: 3, 
        label: "AI Classifies Lead", 
        icon: "🧠", 
        desc: "OpenAI scoring intent", 
        color: "#06b6d4",
        details: {
            model_used: "gpt-4o",
            prompt_tokens: 382,
            completion_tokens: 88,
            lead_intent_score: "94/100",
            category: "Enterprise / High Priority",
            suggested_action: "Immediate sales outreach / direct phone call",
            sentiment: "Highly positive / ready to integrate"
        }
    },
    { 
        id: 4, 
        label: "CRM Contact Created", 
        icon: "🗂️", 
        desc: "HubSpot / GHL record", 
        color: "#10b981",
        details: {
            crm_platform: "HubSpot CRM",
            contact_id: "hs_vid_589312984",
            deal_id: "hs_deal_90831",
            lead_status: "Qualified Lead (SQL)",
            owner_assigned: "Alex Mercer (Enterprise Lead Rep)",
            sync_status: "in-sync"
        }
    },
    { 
        id: 5, 
        label: "Email Dispatched", 
        icon: "📧", 
        desc: "Welcome sequence fired", 
        color: "#f59e0b",
        details: {
            email_provider: "Resend SMTP",
            recipient: "{{email}}",
            sender: "hello@autoflow.demo",
            subject: "Welcome to AutoFlow! Let's build your integration",
            template: "welcome_drip_1_enterprise",
            status: "delivered",
            open_tracking: "enabled"
        }
    },
    { 
        id: 6, 
        label: "Slack Notified", 
        icon: "💬", 
        desc: "#sales channel alerted", 
        color: "#ec4899",
        details: {
            channel: "#sales-pipeline-alerts",
            bot_name: "AutoFlow Bot",
            message_ts: "1716405821.0023",
            blocks_sent: 4,
            actions_included: ["Approve Lead", "Assign to Rep", "View CRM Profile"],
            alert_priority: "HIGH"
        }
    },
    { 
        id: 7, 
        label: "Sheet Updated", 
        icon: "📊", 
        desc: "Google Sheets logged", 
        color: "#3b82f6",
        details: {
            spreadsheet_id: "1zL9yK98J3_vGdf102...",
            worksheet_name: "CRM Leads Sync",
            target_row: 142,
            columns_written: ["Date", "Name", "Email", "Company", "AI Score", "Status"],
            execution_time_ms: 184
        }
    },
];

const DELAYS = [0, 1200, 2400, 3500, 4600, 5500, 6400];


function NodeCard({ node, state, onClick }) {
    const isIdle = state === "idle";
    const isRunning = state === "running";
    const isDone = state === "done";

    return (
        <div
            onClick={isDone ? onClick : undefined}
            className={isDone ? "node-card-interactive" : ""}
            title={isDone ? "Click to view execution details" : undefined}
            style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                borderRadius: "10px",
                border: `1.5px solid ${isDone ? node.color : isRunning ? node.color : "#2a2a3a"}`,
                background: isDone
                    ? `${node.color}18`
                    : isRunning
                        ? `${node.color}10`
                        : "#16162a",
                transition: "all 0.4s ease",
                opacity: isIdle ? 0.4 : 1,
                position: "relative",
                overflow: "hidden",
                cursor: isDone ? "pointer" : "default",
            }}
        >
            {isRunning && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: `linear-gradient(90deg, transparent, ${node.color}20, transparent)`,
                        animation: "shimmer 1.2s infinite",
                    }}
                />
            )}
            <div
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: "8px",
                    background: isDone || isRunning ? `${node.color}25` : "#1e1e30",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px",
                    flexShrink: 0,
                    border: `1px solid ${isDone || isRunning ? node.color + "50" : "#2a2a3a"}`,
                }}
            >
                {node.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: isDone ? node.color : isRunning ? node.color : "#555577",
                        letterSpacing: "0.02em",
                    }}
                >
                    {node.label}
                </div>
                <div
                    style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: "10px",
                        color: isDone || isRunning ? "#888" : "#333355",
                        marginTop: 2,
                    }}
                >
                    {node.desc}
                </div>
            </div>
            <div style={{ flexShrink: 0 }}>
                {isDone && (
                    <div
                        style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: node.color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "10px",
                            animation: "popIn 0.3s ease",
                        }}
                    >
                        ✓
                    </div>
                )}
                {isRunning && (
                    <div
                        style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            border: `2px solid ${node.color}`,
                            borderTopColor: "transparent",
                            animation: "spin 0.7s linear infinite",
                        }}
                    />
                )}
                {isIdle && (
                    <div
                        style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            border: "2px solid #2a2a3a",
                        }}
                    />
                )}
            </div>
        </div>
    );
}

function Connector({ active, color }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                paddingLeft: "28px",
                height: "14px",
                gap: 0,
            }}
        >
            <div
                style={{
                    width: 2,
                    height: "100%",
                    background: active ? color : "#2a2a3a",
                    transition: "background 0.4s ease",
                    borderRadius: 1,
                }}
            />
        </div>
    );
}

export default function App() {
    const [nodeStates, setNodeStates] = useState(NODES.map(() => "idle"));
    const [running, setRunning] = useState(false);
    const [done, setDone] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
    const [submitted, setSubmitted] = useState(false);
    const [log, setLog] = useState([]);
    const [webhookActive, setWebhookActive] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activePopupNode, setActivePopupNode] = useState(null);
    const [copiedText, setCopiedText] = useState(false);
    const logRef = useRef(null);

    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [log]);

    const addLog = (msg, color = "#666") => {
        const time = new Date().toLocaleTimeString("en-US", { hour12: false });
        setLog((prev) => [...prev, { time, msg, color }]);
    };

    const runAutomation = () => {
        setRunning(true);
        setDone(false);
        setLog([]);
        setNodeStates(NODES.map(() => "idle"));

        const logMessages = [
            ["Webhook fired — payload received", "#f97316"],
            ["n8n workflow triggered, parsing fields...", "#8b5cf6"],
            [`OpenAI → Scored intent: 94/100 (High Quality Lead)`, "#06b6d4"],
            ["CRM contact created → HubSpot ID #hs_vid_589312984", "#10b981"],
            [`Email sequence activated → sent to ${form.email || "john@company.com"}`, "#f59e0b"],
            ["Slack message sent to #sales-pipeline-alerts", "#ec4899"],
            ["Google Sheets row appended → Row 142", "#3b82f6"],
        ];

        NODES.forEach((_, i) => {
            setTimeout(() => {
                setNodeStates((prev) => {
                    const next = [...prev];
                    if (i > 0) next[i - 1] = "done";
                    next[i] = "running";
                    return next;
                });
                addLog(logMessages[i][0], logMessages[i][1]);

                if (i === NODES.length - 1) {
                    setTimeout(() => {
                        setNodeStates(NODES.map(() => "done"));
                        setRunning(false);
                        setDone(true);
                        addLog("✅ Workflow complete — 7 nodes executed in 6.4s", "#10b981");
                    }, 900);
                }
            }, DELAYS[i]);
        });
    };

    const handleSubmit = async () => {
        if (!form.name || !form.email) return;
        
        setIsSubmitting(true);
        setLog([]); // Reset log upon trigger
        addLog("⚡ Submitting lead to pipeline...", "#f97316");

        const payload = {
            name: form.name,
            email: form.email,
            company: form.company || "N/A",
            message: form.message || "N/A",
            timestamp: new Date().toISOString(),
            source: "lead_form"
        };

        if (webhookActive) {
            if (WEBHOOK_URL) {
                addLog(`📤 Dispatching POST request to webhook...`, "#8b5cf6");
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 second timeout
                    
                    const response = await fetch(WEBHOOK_URL, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (response.ok) {
                        addLog("🟢 Webhook triggered successfully!", "#10b981");
                    } else {
                        addLog(`⚠️ Webhook responded with status ${response.status}`, "#f59e0b");
                    }
                } catch (err) {
                    if (err.name === "AbortError") {
                        addLog("❌ Webhook request timed out after 6 seconds", "#ef4444");
                    } else {
                        addLog(`❌ Webhook failure: ${err.message}`, "#ef4444");
                    }
                }
            } else {
                addLog("⚠️ Webhook toggle is ON but WEBHOOK_URL is not configured at top of file!", "#f59e0b");
                await new Promise((r) => setTimeout(r, 1200));
            }
        } else {
            addLog("ℹ️ Local simulation active (Webhook toggle is OFF)", "#555577");
            await new Promise((r) => setTimeout(r, 800)); // Smooth simulation delay
        }

        setSubmitted(true);
        setIsSubmitting(false);
        setTimeout(() => runAutomation(), 400);
    };

    const handleReset = () => {
        setSubmitted(false);
        setRunning(false);
        setDone(false);
        setNodeStates(NODES.map(() => "idle"));
        setLog([]);
        setForm({ name: "", email: "", company: "", message: "" });
        setIsSubmitting(false);
        setCopiedText(false);
    };

    const handleExportSummary = () => {
        const timeStr = new Date().toLocaleString();
        const summaryText = `🚀 AutoFlow.demo Workflow Execution Summary
--------------------------------------------------
Timestamp: ${timeStr}
Pipeline Status: SUCCESS ✓
Nodes Executed: ${NODES.length}/${NODES.length}
Total Duration: 6.4s

Lead Submitted:
- Name: ${form.name || "N/A"}
- Email: ${form.email || "N/A"}
- Company: ${form.company || "N/A"}
- Message: ${form.message || "N/A"}

Pipeline Execution Steps:
${NODES.map(node => `  ${node.icon} [${node.label}] - ${node.desc}`).join("\n")}

Thank you for using AutoFlow.demo!
--------------------------------------------------`;

        navigator.clipboard.writeText(summaryText);
        setCopiedText(true);
        setTimeout(() => setCopiedText(false), 2000);
    };

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0c0c18; }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes popIn {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        input, textarea {
          outline: none;
          background: #0f0f1e;
          border: 1.5px solid #2a2a3a;
          border-radius: 8px;
          color: #e0e0ff;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          padding: 10px 14px;
          width: 100%;
          transition: border-color 0.2s;
        }
        input:focus, textarea:focus {
          border-color: #8b5cf6;
        }
        input::placeholder, textarea::placeholder {
          color: #33334a;
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 2px; }

        .app-grid {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          min-height: calc(100vh - 61px);
        }
        .left-panel {
          border-right: 1px solid #1a1a2e;
        }
        @media (max-width: 900px) {
          .app-grid {
            grid-template-columns: 1fr;
          }
          .left-panel {
            border-right: none !important;
            border-bottom: 1px solid #1a1a2e;
          }
        }
        .node-card-interactive {
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .node-card-interactive:hover {
          transform: translateY(-2px);
          filter: brightness(1.2);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
        }
      `}</style>

            <div
                style={{
                    minHeight: "100vh",
                    background: "#0c0c18",
                    fontFamily: "'Syne', sans-serif",
                    padding: "0",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        borderBottom: "1px solid #1a1a2e",
                        padding: "16px 32px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                            style={{
                                width: 28,
                                height: 28,
                                background: "linear-gradient(135deg, #8b5cf6, #06b6d4)",
                                borderRadius: "6px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "14px",
                            }}
                        >
                            ⚙️
                        </div>
                        <span
                            style={{
                                color: "#e0e0ff",
                                fontWeight: 800,
                                fontSize: "16px",
                                letterSpacing: "-0.02em",
                            }}
                        >
                            AutoFlow<span style={{ color: "#8b5cf6" }}>.</span>demo
                        </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: "#10b981",
                                animation: "pulse 2s infinite",
                            }}
                        />
                        <span
                            style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: "11px",
                                color: "#10b981",
                            }}
                        >
                            n8n workflow live
                        </span>
                    </div>
                </div>

                {/* Main */}
                <div className="app-grid">
                    {/* LEFT — Form */}
                    <div
                        className="left-panel"
                        style={{
                            padding: "32px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "24px",
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: "10px",
                                    color: "#8b5cf6",
                                    letterSpacing: "0.15em",
                                    textTransform: "uppercase",
                                    marginBottom: "8px",
                                }}
                            >
                                Trigger — Lead Form
                            </div>
                            <h1
                                style={{
                                    fontSize: "26px",
                                    fontWeight: 800,
                                    color: "#e0e0ff",
                                    letterSpacing: "-0.03em",
                                    lineHeight: 1.2,
                                }}
                            >
                                Submit a lead.
                                <br />
                                <span style={{ color: "#8b5cf6" }}>Watch it flow.</span>
                            </h1>
                            <p
                                style={{
                                    marginTop: "8px",
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: "12px",
                                    color: "#555577",
                                    lineHeight: 1.6,
                                }}
                            >
                                Fill the form → n8n processes it live → watch every automation node execute in real time on the right.
                            </p>
                        </div>

                        {!submitted ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {/* Webhook Toggle Switch */}
                                <div style={{
                                    background: "#0f0f1e",
                                    border: "1.5px solid #2a2a3a",
                                    borderRadius: "10px",
                                    padding: "12px 16px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    marginBottom: "4px",
                                    animation: "fadeUp 0.3s ease",
                                }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#e0e0ff", fontWeight: 600 }}>Real Webhook Trigger</span>
                                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "9px", color: "#555577" }}>POST to configured webhook URL</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: webhookActive ? "#10b981" : "#555577", fontWeight: 600 }}>
                                            {webhookActive ? "ACTIVE" : "OFF"}
                                        </span>
                                        <button 
                                            onClick={() => setWebhookActive(!webhookActive)}
                                            style={{
                                                width: "40px",
                                                height: "22px",
                                                borderRadius: "11px",
                                                background: webhookActive ? "#10b981" : "#2a2a3a",
                                                border: "none",
                                                cursor: "pointer",
                                                position: "relative",
                                                transition: "all 0.3s ease",
                                                padding: 0,
                                            }}
                                        >
                                            <div style={{
                                                width: "16px",
                                                height: "16px",
                                                borderRadius: "50%",
                                                background: "#fff",
                                                position: "absolute",
                                                top: "3px",
                                                left: webhookActive ? "21px" : "3px",
                                                transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
                                                boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                                            }} />
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                    <div>
                                        <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#555577", display: "block", marginBottom: "6px", letterSpacing: "0.1em" }}>NAME *</label>
                                        <input
                                            placeholder="John Smith"
                                            value={form.name}
                                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#555577", display: "block", marginBottom: "6px", letterSpacing: "0.1em" }}>EMAIL *</label>
                                        <input
                                            placeholder="john@company.com"
                                            value={form.email}
                                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#555577", display: "block", marginBottom: "6px", letterSpacing: "0.1em" }}>COMPANY</label>
                                    <input
                                        placeholder="Acme Corp"
                                        value={form.company}
                                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                                        disabled={isSubmitting}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#555577", display: "block", marginBottom: "6px", letterSpacing: "0.1em" }}>MESSAGE</label>
                                    <textarea
                                        rows={3}
                                        placeholder="Tell us about your project..."
                                        value={form.message}
                                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                                        style={{ resize: "none" }}
                                        disabled={isSubmitting}
                                    />
                                </div>
                                <button
                                    onClick={handleSubmit}
                                    disabled={!form.name || !form.email || isSubmitting}
                                    style={{
                                        padding: "13px 24px",
                                        background: form.name && form.email && !isSubmitting ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "#1a1a2e",
                                        border: "none",
                                        borderRadius: "8px",
                                        color: form.name && form.email && !isSubmitting ? "#fff" : "#333355",
                                        fontFamily: "'Syne', sans-serif",
                                        fontWeight: 700,
                                        fontSize: "14px",
                                        cursor: form.name && form.email && !isSubmitting ? "pointer" : "not-allowed",
                                        letterSpacing: "0.02em",
                                        transition: "all 0.2s",
                                        marginTop: "4px",
                                    }}
                                >
                                    {isSubmitting ? (
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                                            <div style={{
                                                width: "16px",
                                                height: "16px",
                                                borderRadius: "50%",
                                                border: "2px solid #ffffff",
                                                borderTopColor: "transparent",
                                                animation: "spin 0.6s linear infinite",
                                            }} />
                                            <span>Triggering workflow...</span>
                                        </div>
                                    ) : (
                                        "Submit Lead → Trigger Workflow ⚡"
                                    )}
                                </button>
                            </div>
                        ) : (
                            <div
                                style={{
                                    background: "#0f0f1e",
                                    border: "1.5px solid #2a2a3a",
                                    borderRadius: "10px",
                                    padding: "20px",
                                    animation: "fadeUp 0.4s ease",
                                }}
                            >
                                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#555577", marginBottom: "12px", letterSpacing: "0.1em" }}>PAYLOAD SENT TO N8N</div>
                                <pre
                                    style={{
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        fontSize: "12px",
                                        color: "#8b5cf6",
                                        lineHeight: 1.7,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                    }}
                                >
                                    {`{
  "name": "${form.name || "John Smith"}",
  "email": "${form.email || "john@company.com"}",
  "company": "${form.company || "Acme Corp"}",
  "message": "${form.message || "Project inquiry"}",
  "timestamp": "${new Date().toISOString()}",
  "source": "lead_form"
}`}
                                </pre>
                                {done && (
                                    <button
                                        onClick={handleReset}
                                        style={{
                                            marginTop: "16px",
                                            padding: "10px 20px",
                                            background: "transparent",
                                            border: "1.5px solid #2a2a3a",
                                            borderRadius: "8px",
                                            color: "#555577",
                                            fontFamily: "'IBM Plex Mono', monospace",
                                            fontSize: "12px",
                                            cursor: "pointer",
                                            width: "100%",
                                            transition: "all 0.2s",
                                        }}
                                        onMouseOver={e => { e.target.style.borderColor = "#8b5cf6"; e.target.style.color = "#8b5cf6"; }}
                                        onMouseOut={e => { e.target.style.borderColor = "#2a2a3a"; e.target.style.color = "#555577"; }}
                                    >
                                        ↺ Reset & Run Again
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Log */}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#333355", letterSpacing: "0.1em", marginBottom: "8px" }}>EXECUTION LOG</div>
                            <div
                                ref={logRef}
                                style={{
                                    background: "#080812",
                                    border: "1px solid #1a1a2e",
                                    borderRadius: "8px",
                                    padding: "12px",
                                    height: "160px",
                                    overflowY: "auto",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "4px",
                                }}
                            >
                                {log.length === 0 ? (
                                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#1e1e30" }}>
                                        Waiting for trigger...
                                    </div>
                                ) : (
                                    log.map((entry, i) => (
                                        <div
                                            key={i}
                                            style={{
                                                display: "flex",
                                                gap: "10px",
                                                animation: "fadeUp 0.3s ease",
                                                fontFamily: "'IBM Plex Mono', monospace",
                                                fontSize: "11px",
                                            }}
                                        >
                                            <span style={{ color: "#333355", flexShrink: 0 }}>{entry.time}</span>
                                            <span style={{ color: entry.color }}>{entry.msg}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT — Workflow */}
                    <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div>
                            <div
                                style={{
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: "10px",
                                    color: "#06b6d4",
                                    letterSpacing: "0.15em",
                                    textTransform: "uppercase",
                                    marginBottom: "8px",
                                }}
                            >
                                n8n Workflow — Live Execution
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#e0e0ff", letterSpacing: "-0.02em" }}>
                                    Lead Intake Pipeline
                                </h2>
                                {running && (
                                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#f97316", background: "#f9731610", border: "1px solid #f9731630", borderRadius: "4px", padding: "2px 8px", animation: "pulse 1s infinite" }}>
                                        RUNNING
                                    </div>
                                )}
                                {done && (
                                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#10b981", background: "#10b98110", border: "1px solid #10b98130", borderRadius: "4px", padding: "2px 8px" }}>
                                        COMPLETE ✓
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column" }}>
                            {NODES.map((node, i) => (
                                <div key={node.id}>
                                    <NodeCard 
                                        node={node} 
                                        state={nodeStates[i]} 
                                        onClick={() => setActivePopupNode(node)} 
                                    />
                                    {i < NODES.length - 1 && (
                                        <Connector
                                            active={nodeStates[i] === "done" || nodeStates[i + 1] === "running"}
                                            color={node.color}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        {done && (
                            <div
                                style={{
                                    background: "#10b98108",
                                    border: "1.5px solid #10b98130",
                                    borderRadius: "10px",
                                    padding: "16px",
                                    animation: "fadeUp 0.5s ease",
                                    marginTop: "4px",
                                }}
                            >
                                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#10b981", letterSpacing: "0.1em", marginBottom: "8px" }}>EXECUTION SUMMARY</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                                    {[
                                        { label: "Nodes Run", value: "7" },
                                        { label: "Duration", value: "6.4s" },
                                        { label: "Status", value: "Success" },
                                    ].map((s) => (
                                        <div key={s.label} style={{ textAlign: "center" }}>
                                            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: 800, color: "#10b981" }}>{s.value}</div>
                                            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px", color: "#555577" }}>{s.label}</div>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    onClick={handleExportSummary}
                                    style={{
                                        marginTop: "16px",
                                        width: "100%",
                                        padding: "10px 16px",
                                        background: "rgba(16, 185, 129, 0.08)",
                                        border: "1px solid rgba(16, 185, 129, 0.3)",
                                        borderRadius: "8px",
                                        color: "#10b981",
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: "8px",
                                        transition: "all 0.2s ease",
                                    }}
                                    onMouseOver={e => { e.target.style.background = "rgba(16, 185, 129, 0.15)"; }}
                                    onMouseOut={e => { e.target.style.background = "rgba(16, 185, 129, 0.08)"; }}
                                >
                                    {copiedText ? "📋 Summary Copied!" : "📤 Export Execution Summary"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Detail Popup Modal */}
                {activePopupNode && (
                    <div
                        style={{
                            position: "fixed",
                            inset: 0,
                            zIndex: 9999,
                            background: "rgba(6, 6, 12, 0.85)",
                            backdropFilter: "blur(8px)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "24px",
                            animation: "fadeUp 0.3s ease",
                        }}
                        onClick={() => setActivePopupNode(null)}
                    >
                        <div
                            style={{
                                width: "100%",
                                maxWidth: "500px",
                                background: "#0f0f1e",
                                border: `2px solid ${activePopupNode.color}`,
                                borderRadius: "16px",
                                padding: "24px",
                                boxShadow: `0 8px 32px ${activePopupNode.color}25`,
                                display: "flex",
                                flexDirection: "column",
                                gap: "16px",
                                fontFamily: "'IBM Plex Mono', monospace",
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                    <div style={{
                                        width: "36px",
                                        height: "36px",
                                        borderRadius: "8px",
                                        background: `${activePopupNode.color}25`,
                                        border: `1px solid ${activePopupNode.color}50`,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "18px",
                                    }}>
                                        {activePopupNode.icon}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: "14px", fontWeight: 600, color: activePopupNode.color }}>
                                            {activePopupNode.label}
                                        </div>
                                        <div style={{ fontSize: "10px", color: "#555577", marginTop: "2px" }}>
                                            Execution Payload Outcomes
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setActivePopupNode(null)}
                                    style={{
                                        background: "transparent",
                                        border: "none",
                                        color: "#555577",
                                        fontSize: "20px",
                                        cursor: "pointer",
                                        padding: "4px",
                                    }}
                                    onMouseOver={e => e.target.style.color = "#fff"}
                                    onMouseOut={e => e.target.style.color = "#555577"}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Payload block */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <div style={{ fontSize: "9px", color: "#555577", letterSpacing: "0.1em" }}>OUTPUT JSON</div>
                                <div style={{
                                    background: "#080812",
                                    border: "1.5px solid #2a2a3a",
                                    borderRadius: "10px",
                                    padding: "16px",
                                    maxHeight: "240px",
                                    overflowY: "auto",
                                }}>
                                    <pre style={{
                                        fontSize: "11px",
                                        color: "#e0e0ff",
                                        lineHeight: "1.6",
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                    }}>
                                        {JSON.stringify(
                                            Object.fromEntries(
                                                Object.entries(activePopupNode.details).map(([key, val]) => [
                                                    key,
                                                    typeof val === "string" 
                                                        ? val.replace("{{email}}", form.email || "john@company.com")
                                                             .replace("{{name}}", form.name || "John Smith")
                                                        : val
                                                ])
                                            ),
                                            null, 
                                            2
                                        )}
                                    </pre>
                                </div>
                           </div>

                           {/* Action Bar */}
                           <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                               <button
                                   onClick={() => {
                                       const replacedDetails = Object.fromEntries(
                                           Object.entries(activePopupNode.details).map(([key, val]) => [
                                               key,
                                               typeof val === "string" 
                                                   ? val.replace("{{email}}", form.email || "john@company.com")
                                                        .replace("{{name}}", form.name || "John Smith")
                                                   : val
                                           ])
                                       );
                                       navigator.clipboard.writeText(JSON.stringify(replacedDetails, null, 2));
                                       const btn = document.getElementById("copy-node-payload-btn");
                                       if (btn) {
                                           btn.innerText = "📋 Payload Copied!";
                                           setTimeout(() => { btn.innerText = "📄 Copy Payload JSON"; }, 2000);
                                       }
                                   }}
                                   id="copy-node-payload-btn"
                                   style={{
                                       flex: 1,
                                       padding: "10px 16px",
                                       background: "rgba(139, 92, 246, 0.08)",
                                       border: "1px solid rgba(139, 92, 246, 0.3)",
                                       borderRadius: "8px",
                                       color: "#8b5cf6",
                                       fontSize: "11px",
                                       fontWeight: 600,
                                       cursor: "pointer",
                                       transition: "all 0.2s ease",
                                   }}
                                   onMouseOver={e => e.target.style.background = "rgba(139, 92, 246, 0.15)"}
                                   onMouseOut={e => e.target.style.background = "rgba(139, 92, 246, 0.08)"}
                               >
                                   📄 Copy Payload JSON
                               </button>
                               <button
                                   onClick={() => setActivePopupNode(null)}
                                   style={{
                                       padding: "10px 16px",
                                       background: "#2a2a3a",
                                       border: "none",
                                       borderRadius: "8px",
                                       color: "#e0e0ff",
                                       fontSize: "11px",
                                       fontWeight: 600,
                                       cursor: "pointer",
                                   }}
                                   onMouseOver={e => e.target.style.background = "#3a3a4e"}
                                   onMouseOut={e => e.target.style.background = "#2a2a3a"}
                               >
                                   Dismiss
                               </button>
                           </div>
                       </div>
                   </div>
               )}
            </div>
        </>
    );
}