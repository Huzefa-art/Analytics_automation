import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Play, Activity, Globe, MapPin, Phone, Database, ExternalLink, RefreshCw } from 'lucide-react';

const API_BASE = '/api';

function App() {
    const [url, setUrl] = useState('');
    const [maxResults, setMaxResults] = useState(20);
    const [status, setStatus] = useState({
        scraping: { active: false, progress: '', logs: [] },
        analyzing: { active: false, progress: '', logs: [] }
    });
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [includeTech, setIncludeTech] = useState(true);
    const [includeAds, setIncludeAds] = useState(true);
    const [activeConsoleTab, setActiveConsoleTab] = useState('scraper');
    
    const consoleBodyRef = useRef(null);

    useEffect(() => {
        fetchResults();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (consoleBodyRef.current) {
            consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
        }
    }, [status.scraping?.logs, status.analyzing?.logs, activeConsoleTab]);

    const fetchStatus = async () => {
        try {
            const response = await axios.get(`${API_BASE}/status`);
            setStatus(response.data);
            
            // Automatically switch tabs if a process is active
            if (response.data.scraping?.active && !response.data.analyzing?.active) {
                setActiveConsoleTab('scraper');
            } else if (response.data.analyzing?.active && !response.data.scraping?.active) {
                setActiveConsoleTab('analytics');
            }
        } catch (error) {
            console.error("Error fetching status:", error);
        }
    };

    const handleCopyLogs = () => {
        const logsToCopy = activeConsoleTab === 'scraper' 
            ? (status.scraping?.logs || []).join('\n')
            : (status.analyzing?.logs || []).join('\n');
        navigator.clipboard.writeText(logsToCopy);
        alert("Logs copied to clipboard!");
    };

    const getLogLineClass = (line) => {
        if (!line) return 'info';
        const lower = line.toLowerCase();
        if (line.startsWith('❌') || lower.includes('error:') || lower.includes('failed')) return 'error';
        if (line.startsWith('✅') || lower.includes('finished') || lower.includes('done') || lower.includes('saved:')) return 'success';
        if (line.startsWith('🔍') || lower.includes('analysing') || lower.includes('starting') || lower.includes('opening google maps') || lower.includes('dismissing cookie')) return 'system';
        if (line.includes('warning:') || lower.includes('warning') || lower.includes('bypass:')) return 'warning';
        return 'info';
    };

    const fetchResults = async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE}/results`);
            setResults(response.data);
        } catch (error) {
            console.error("Error fetching results:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleScrape = async () => {
        try {
            await axios.post(`${API_BASE}/scrape`, { url, max_results: parseInt(maxResults) });
        } catch (error) {
            alert(error.response?.data?.detail || "Failed to start scraping");
        }
    };

    const handleAnalyze = async () => {
        try {
            await axios.post(`${API_BASE}/analyze`, { 
                file_path: "urls.txt",
                include_tech: includeTech,
                include_ads: includeAds
            });
        } catch (error) {
            alert(error.response?.data?.detail || "Failed to start analysis");
        }
    };

    return (
        <div className="app-container">
            <header>
                <div className="logo">Antigravity Analytics</div>
                <button onClick={fetchResults} style={{ width: 'auto', padding: '0.5rem 1rem' }} disabled={loading}>
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </header>

            <div className="dashboard-grid">
                <aside className="animate-fade-in">
                    <div className="card">
                        <h3>Control Panel</h3>
                        <div className="form-group">
                            <label>Google Maps Link</label>
                            <div style={{ position: 'relative' }}>
                                <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="https://google.com/maps/search/..."
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    style={{ paddingLeft: '35px' }}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Max Results</label>
                            <input
                                type="number"
                                value={maxResults}
                                onChange={(e) => setMaxResults(e.target.value)}
                            />
                        </div>

                        <button onClick={handleScrape} disabled={status.scraping.active || !url}>
                            {status.scraping.active ? <Activity size={18} className="animate-pulse" /> : <Play size={18} />}
                            <span style={{ marginLeft: '10px' }}>Start Scraping</span>
                        </button>

                        <div className="options-group">
                            <label>Analysis Options</label>
                            <div className="checkbox-option">
                                <input
                                    type="checkbox"
                                    id="includeTech"
                                    checked={includeTech}
                                    onChange={(e) => setIncludeTech(e.target.checked)}
                                />
                                <label htmlFor="includeTech" className="checkbox-label">Tech Stack Detection</label>
                            </div>
                            <div className="checkbox-option">
                                <input
                                    type="checkbox"
                                    id="includeAds"
                                    checked={includeAds}
                                    onChange={(e) => setIncludeAds(e.target.checked)}
                                />
                                <label htmlFor="includeAds" className="checkbox-label">Meta Ads Info (FB Check)</label>
                            </div>
                        </div>

                        <button
                            onClick={handleAnalyze}
                            disabled={status.analyzing.active}
                            style={
                                status.analyzing.active
                                ? { background: '#333', color: '#666', cursor: 'not-allowed' }
                                : { background: 'linear-gradient(135deg, #1A5E1A, #0a3d0a)', color: '#fff' }
                            }
                        >
                            {status.analyzing.active ? <Activity size={18} className="animate-pulse" /> : <Database size={18} />}
                            <span style={{ marginLeft: '10px' }}>Start Analytics</span>
                        </button>

                        {status.scraping.active && (
                            <div className="status-indicator">
                                <label>Scraping Status</label>
                                <div className="status-active">{status.scraping.progress}</div>
                            </div>
                        )}

                        {status.analyzing.active && (
                            <div className="status-indicator">
                                <label>Analytics Status</label>
                                <div className="status-active">{status.analyzing.progress}</div>
                            </div>
                        )}
                    </div>
                </aside>

                <main className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
                    <div className="card scroll-y">
                        <h2 style={{ marginBottom: '1rem' }}>Scraped Leads ({results.length})</h2>
                        <div className="results-table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Business Name</th>
                                        <th>Location</th>
                                        <th>Contact</th>
                                        <th>Meta Ads</th>
                                        <th>Tech Stack</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((res, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <div style={{ fontWeight: '600', color: 'var(--gold-primary)' }}>{res["Business Name"]}</div>
                                                {res.Website && res.Website !== "N/A" && (
                                                    <a href={res.Website} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                                        <Globe size={12} style={{ marginRight: '5px' }} />
                                                        {res.Website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                                                        <ExternalLink size={12} style={{ marginLeft: '5px' }} />
                                                    </a>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center' }} title={res.Address}>
                                                    <MapPin size={14} style={{ marginRight: '5px', color: 'var(--gold-secondary)' }} />
                                                    {res.City}, {res.Country}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {res.Phone && res.Phone !== "N/A" && (
                                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                                            <Phone size={12} style={{ marginRight: '5px', color: 'var(--text-muted)' }} />
                                                            {res.Phone}
                                                        </div>
                                                    )}
                                                    {res.Email && res.Email !== "N/A" && (
                                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                                            <span style={{ marginRight: '5px', color: 'var(--gold-primary)', fontSize: '11px' }}>✉</span>
                                                            <a href={`mailto:${res.Email}`} style={{ color: 'var(--text-main)', textDecoration: 'none', fontSize: '0.8rem' }}>{res.Email}</a>
                                                        </div>
                                                    )}
                                                    {res["Facebook Page"] && res["Facebook Page"] !== "N/A" && (
                                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                                            <span style={{ marginRight: '5px', color: '#1877F2', fontWeight: 'bold', fontSize: '11px' }}>f</span>
                                                            <a href={res["Facebook Page"]} target="_blank" rel="noreferrer" style={{ color: '#1877F2', textDecoration: 'none', display: 'flex', alignItems: 'center', fontSize: '0.8rem' }}>
                                                                Facebook Page <ExternalLink size={10} style={{ marginLeft: '3px' }} />
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                {res["Ads Active"] && res["Ads Active"] !== "N/A" ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span style={{
                                                            padding: '0.2rem 0.4rem',
                                                            borderRadius: '4px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: '600',
                                                            display: 'inline-block',
                                                            width: 'fit-content',
                                                            background: res["Ads Active"] === 'Yes' ? 'rgba(40, 167, 69, 0.15)' : 'rgba(220, 53, 69, 0.15)',
                                                            color: res["Ads Active"] === 'Yes' ? '#28a745' : '#dc3545',
                                                            border: res["Ads Active"] === 'Yes' ? '1px solid rgba(40, 167, 69, 0.3)' : '1px solid rgba(220, 53, 69, 0.3)'
                                                        }}>
                                                            {res["Ads Active"] === 'Yes' ? 'Active' : 'No Ads'}
                                                        </span>
                                                        {res["Ads Active"] === 'Yes' && res["Ad Count"] !== undefined && (
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                Count: {res["Ad Count"]} ads
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                                )}
                                            </td>
                                            <td>
                                                {Object.keys(res).filter(k => ["CMS", "Analytics", "CRM / Marketing Automation", "Live Chat / Support", "Payments"].includes(k)).map(cat => (
                                                    res[cat] && res[cat] !== "N/A" && res[cat] !== "[]" && (
                                                        <div key={cat} style={{ marginBottom: '2px' }}>
                                                            {Array.isArray(res[cat]) ? res[cat].map(t => <span key={t} className="badge">{t}</span>) :
                                                                res[cat].split(',').map(t => <span key={t} className="badge">{t.trim()}</span>)}
                                                        </div>
                                                    )
                                                ))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            </div>

            {/* Real-time Process Logs Console */}
            <div className="console-card animate-fade-in" style={{ animationDelay: '0.4s' }}>
                <div className="console-header">
                    <div className="console-title-group">
                        <Database size={18} style={{ color: 'var(--gold-primary)' }} />
                        <h3 style={{ fontSize: '1.1rem', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>Process Logs Console</h3>
                    </div>
                    
                    <div className="console-tabs">
                        <button 
                            className={`console-tab ${activeConsoleTab === 'scraper' ? 'active' : ''}`}
                            onClick={() => setActiveConsoleTab('scraper')}
                        >
                            Scraper
                            {status.scraping?.active && <span className="pulse-dot" style={{ marginLeft: '6px', display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#39ff14' }}></span>}
                        </button>
                        <button 
                            className={`console-tab ${activeConsoleTab === 'analytics' ? 'active' : ''}`}
                            onClick={() => setActiveConsoleTab('analytics')}
                        >
                            Analytics
                            {status.analyzing?.active && <span className="pulse-dot" style={{ marginLeft: '6px', display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#39ff14' }}></span>}
                        </button>
                    </div>

                    <div className="console-actions">
                        <button 
                            className="console-action-btn"
                            onClick={handleCopyLogs}
                            disabled={activeConsoleTab === 'scraper' ? !(status.scraping?.logs?.length) : !(status.analyzing?.logs?.length)}
                        >
                            Copy Logs
                        </button>
                    </div>
                </div>

                <div className="console-body" ref={consoleBodyRef}>
                    {activeConsoleTab === 'scraper' ? (
                        status.scraping?.logs && status.scraping.logs.length > 0 ? (
                            status.scraping.logs.map((line, idx) => (
                                <div key={idx} className={`console-line ${getLogLineClass(line)}`}>
                                    {line}
                                </div>
                            ))
                        ) : (
                            <div className="console-empty">
                                <span>No scraping logs available. Enter a URL and click "Start Scraping".</span>
                            </div>
                        )
                    ) : (
                        status.analyzing?.logs && status.analyzing.logs.length > 0 ? (
                            status.analyzing.logs.map((line, idx) => (
                                <div key={idx} className={`console-line ${getLogLineClass(line)}`}>
                                    {line}
                                </div>
                            ))
                        ) : (
                            <div className="console-empty">
                                <span>No analytics logs available. Select options and click "Start Analytics".</span>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;
