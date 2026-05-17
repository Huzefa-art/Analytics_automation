import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Play, Activity, Globe, MapPin, Phone, Database, ExternalLink, RefreshCw } from 'lucide-react';

const API_BASE = '/api';

function App() {
    const [url, setUrl] = useState('');
    const [maxResults, setMaxResults] = useState(20);
    const [status, setStatus] = useState({
        scraping: { active: false, progress: '' },
        analyzing: { active: false, progress: '' }
    });
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchResults();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    const fetchStatus = async () => {
        try {
            const response = await axios.get(`${API_BASE}/status`);
            setStatus(response.data);
        } catch (error) {
            console.error("Error fetching status:", error);
        }
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
            await axios.post(`${API_BASE}/analyze`, { file_path: "urls.txt" });
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

                        <button
                            onClick={handleAnalyze}
                            disabled={status.analyzing.active || results.length === 0}
                            style={{ background: 'linear-gradient(135deg, #1A5E1A, #0a3d0a)', color: '#fff' }}
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
                                        <th>Tech Stack</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((res, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <div style={{ fontWeight: '600', color: 'var(--gold-primary)' }}>{res["Business Name"]}</div>
                                                {res.Website !== "N/A" && (
                                                    <a href={res.Website} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                                        <Globe size={12} style={{ marginRight: '5px' }} />
                                                        {new URL(res.Website).hostname}
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
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    <Phone size={14} style={{ marginRight: '5px' }} />
                                                    {res.Phone}
                                                </div>
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
        </div>
    );
}

export default App;
