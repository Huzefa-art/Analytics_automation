import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Play, Activity, Globe, MapPin, Phone, Database, ExternalLink, RefreshCw, Download, Filter, Send, TrendingUp } from 'lucide-react';
import MarketResearch from './MarketResearch';

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
    const [activeTab, setActiveTab] = useState('control'); // 'control', 'leads', 'logs'

    // Control parameters
    const [maxAnalyze, setMaxAnalyze] = useState(10);
    const [scrapeMode, setScrapeMode] = useState('url'); // 'url' or 'keyword'

    // Filtering states
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEmail, setFilterEmail] = useState(false);
    const [filterPhone, setFilterPhone] = useState(false);
    const [filterAds, setFilterAds] = useState('all');
    const [filterTech, setFilterTech] = useState('all');
    const [filterIndustry, setFilterIndustry] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    
    const consoleBodyRef = useRef(null);

    // Slack integration state
    const [isSlackModalOpen, setIsSlackModalOpen] = useState(false);
    const [slackOption, setSlackOption] = useState('webhook'); // 'webhook' or 'token'
    const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
    const [slackBotToken, setSlackBotToken] = useState('');
    const [slackChannel, setSlackChannel] = useState('leads');
    const [sendingToSlack, setSendingToSlack] = useState(false);
    const [slackTargetScope, setSlackTargetScope] = useState('filtered'); // 'filtered' or 'all'
    const [slackSavedStatus, setSlackSavedStatus] = useState(null); // { webhook_url_saved, bot_token_saved, channel }
    const [savingSlackCreds, setSavingSlackCreds] = useState(false);

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
            setActiveTab('logs'); // Automatically redirect to Logs so they see progress!
        } catch (error) {
            alert(error.response?.data?.detail || "Failed to start scraping");
        }
    };

    const handleAnalyze = async () => {
        try {
            await axios.post(`${API_BASE}/analyze`, { 
                file_path: "urls.txt",
                include_tech: includeTech,
                include_ads: includeAds,
                max_leads: parseInt(maxAnalyze)
            });
            setActiveTab('logs'); // Automatically redirect to Logs so they see progress!
        } catch (error) {
            alert(error.response?.data?.detail || "Failed to start analysis");
        }
    };

    // Extract all unique technologies in the results data
    const getAvailableTechs = () => {
        const techs = new Set();
        results.forEach(res => {
            ["CMS", "Analytics", "CRM / Marketing Automation", "Live Chat / Support", "Payments"].forEach(cat => {
                if (res[cat] && res[cat] !== "N/A" && res[cat] !== "[]") {
                    const items = Array.isArray(res[cat]) 
                        ? res[cat] 
                        : res[cat].split(',').map(t => t.trim());
                    items.forEach(item => { if (item) techs.add(item); });
                }
            });
        });
        return Array.from(techs).sort();
    };

    // Extract all unique industries in the results data
    const getAvailableIndustries = () => {
        const industries = new Set();
        results.forEach(res => {
            if (res.Industry && res.Industry !== "N/A" && res.Industry !== "") {
                industries.add(res.Industry);
            }
        });
        return Array.from(industries).sort();
    };

    // Client-side filtering logic
    const filteredResults = results.filter(res => {
        // 1. Search Query
        if (searchTerm) {
            const query = searchTerm.toLowerCase();
            const searchFields = [
                res["Business Name"],
                res.Industry,
                res.Website,
                res.City,
                res.Country,
                res.Phone,
                res.Email,
                res["Facebook Page"],
                res["Analysis Status"] || 'Pending',
                ...["CMS", "Analytics", "CRM / Marketing Automation", "Live Chat / Support", "Payments"].map(c => res[c] || '')
            ].join(' ').toLowerCase();
            if (!searchFields.includes(query)) return false;
        }

        // 2. Email Presence
        if (filterEmail && (!res.Email || res.Email === "N/A")) return false;

        // 3. Phone Presence
        if (filterPhone && (!res.Phone || res.Phone === "N/A")) return false;

        // 4. Ads Active
        if (filterAds === 'yes' && res["Ads Active"] !== 'Yes') return false;
        if (filterAds === 'no' && res["Ads Active"] === 'Yes') return false;

        // 5. Tech Stack Filter
        if (filterTech !== 'all') {
            let hasTech = false;
            ["CMS", "Analytics", "CRM / Marketing Automation", "Live Chat / Support", "Payments"].forEach(cat => {
                if (res[cat] && res[cat] !== "N/A" && res[cat] !== "[]") {
                    const items = Array.isArray(res[cat]) 
                        ? res[cat] 
                        : res[cat].split(',').map(t => t.trim());
                    if (items.includes(filterTech)) hasTech = true;
                }
            });
            if (!hasTech) return false;
        }

        // 6. Industry Filter
        if (filterIndustry !== 'all' && res.Industry !== filterIndustry) return false;

        // 7. Analysis Status Filter
        if (filterStatus === 'analyzed' && res["Analysis Status"] !== 'Analyzed') return false;
        if (filterStatus === 'pending' && res["Analysis Status"] === 'Analyzed') return false;

        return true;
    });

    // Client-side CSV generator and downloader
    const downloadCSV = (dataToExport, filename = 'leads_export.csv') => {
        if (!dataToExport || dataToExport.length === 0) {
            alert("No leads data available to export");
            return;
        }

        const headers = [
            "Business Name", "Industry", "Analysis Status", "Website", "Location", "Phone", "Email", "Facebook Page", 
            "Ads Active", "Ad Count", "CMS", "Analytics", "CRM / Marketing Automation", 
            "Live Chat / Support", "Payments"
        ];

        const csvRows = [];
        // 1. Headers Row
        csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

        // 2. Data Rows
        dataToExport.forEach(res => {
            const values = headers.map(h => {
                let val = "";
                if (h === "Location") {
                    val = `${res.City || ''}, ${res.Country || ''}`;
                } else if (h === "Analysis Status") {
                    val = res["Analysis Status"] || "Pending";
                } else if (Array.isArray(res[h])) {
                    val = res[h].join(', ');
                } else {
                    val = res[h] !== undefined && res[h] !== null ? String(res[h]) : "";
                }
                return `"${val.replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        });

        // Trigger safe file download in browser
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSendToSlack = async () => {
        const targetLeads = slackTargetScope === 'filtered' ? filteredResults : results;
        if (!targetLeads || targetLeads.length === 0) {
            alert("No leads data available to send");
            return;
        }
        setSendingToSlack(true);
        try {
            const payload = {
                leads: targetLeads,
                webhook_url: slackOption === 'webhook' ? slackWebhookUrl : null,
                bot_token: slackOption === 'token' ? slackBotToken : null,
                channel: slackOption === 'token' ? slackChannel : null
            };
            const response = await axios.post(`${API_BASE}/slack/send`, payload);
            alert(response.data?.message || "Leads successfully sent to Slack!");
            setIsSlackModalOpen(false);
        } catch (error) {
            console.error("Slack post error:", error);
            alert(error.response?.data?.detail || "Failed to send leads to Slack");
        } finally {
            setSendingToSlack(false);
        }
    };

    const loadSlackSettings = async () => {
        try {
            const response = await axios.get(`${API_BASE}/settings/slack`);
            setSlackSavedStatus(response.data);
            if (response.data.channel) setSlackChannel(response.data.channel);
        } catch (error) {
            console.error("Failed to load Slack settings:", error);
        }
    };

    const saveSlackCredentials = async () => {
        setSavingSlackCreds(true);
        try {
            const payload = {};
            if (slackOption === 'webhook' && slackWebhookUrl.trim()) {
                payload.webhook_url = slackWebhookUrl.trim();
            }
            if (slackOption === 'token') {
                if (slackBotToken.trim()) payload.bot_token = slackBotToken.trim();
                if (slackChannel.trim()) payload.channel = slackChannel.trim();
            }
            if (Object.keys(payload).length === 0) {
                alert("Enter credentials in the fields above to save them.");
                return;
            }
            const response = await axios.post(`${API_BASE}/settings/slack`, payload);
            alert(response.data?.message || "Credentials saved!");
            await loadSlackSettings();
        } catch (error) {
            alert(error.response?.data?.detail || "Failed to save credentials");
        } finally {
            setSavingSlackCreds(false);
        }
    };

    const clearSlackCredentials = async () => {
        if (!window.confirm("Clear all saved Slack credentials from the database?")) return;
        try {
            await axios.delete(`${API_BASE}/settings/slack`);
            setSlackSavedStatus(null);
            alert("Slack credentials cleared.");
        } catch (error) {
            alert("Failed to clear credentials");
        }
    };

    return (
        <div className="dashboard-layout">
            {/* Left Sidebar Navigation */}
            <aside className="sidebar">
                <div className="sidebar-brand">
                    <Database size={22} className="brand-icon" />
                    <span>Antigravity Analytics</span>
                </div>
                
                <nav className="sidebar-nav">
                    <button 
                        className={`sidebar-nav-item ${activeTab === 'control' ? 'active' : ''}`}
                        onClick={() => setActiveTab('control')}
                    >
                        <Play size={18} />
                        <span>Scraper & Input</span>
                    </button>
                    
                    <button 
                        className={`sidebar-nav-item ${activeTab === 'leads' ? 'active' : ''}`}
                        onClick={() => setActiveTab('leads')}
                    >
                        <Globe size={18} />
                        <span>Scraped Leads</span>
                        {results.length > 0 && <span className="leads-badge">{results.length}</span>}
                    </button>

                    <button 
                        className={`sidebar-nav-item ${activeTab === 'logs' ? 'active' : ''}`}
                        onClick={() => setActiveTab('logs')}
                    >
                        <Activity size={18} />
                        <span>Real-time Logs</span>
                        {(status.scraping?.active || status.analyzing?.active) && <span className="sidebar-pulse-dot"></span>}
                    </button>

                    <button 
                        className={`sidebar-nav-item ${activeTab === 'market-research' ? 'active' : ''}`}
                        onClick={() => setActiveTab('market-research')}
                    >
                        <TrendingUp size={18} />
                        <span>Market Research</span>
                    </button>
                </nav>

                <div className="sidebar-footer">
                    <button onClick={fetchResults} className="refresh-btn" disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        <span>Sync Fresh Data</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="main-content">
                {activeTab === 'control' && (
                    <div className="animate-fade-in">
                        <div className="card">
                            <h2 style={{ marginBottom: '1.5rem', color: 'var(--gold-primary)' }}>Control Panel</h2>
                            
                            {/* Scraper Input Toggle */}
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', background: 'rgba(0, 0, 0, 0.2)', padding: '4px', borderRadius: '6px', border: '1px solid var(--border-color)', maxWidth: '350px' }}>
                                <button
                                    onClick={() => { setScrapeMode('url'); setUrl(''); }}
                                    style={{
                                        flexGrow: 1,
                                        height: '34px',
                                        fontSize: '0.85rem',
                                        background: scrapeMode === 'url' ? 'var(--gold-primary)' : 'transparent',
                                        color: scrapeMode === 'url' ? '#000' : 'var(--text-muted)',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontWeight: scrapeMode === 'url' ? '600' : '400',
                                        padding: 0
                                    }}
                                >
                                    Google Maps Link
                                </button>
                                <button
                                    onClick={() => { setScrapeMode('keyword'); setUrl(''); }}
                                    style={{
                                        flexGrow: 1,
                                        height: '34px',
                                        fontSize: '0.85rem',
                                        background: scrapeMode === 'keyword' ? 'var(--gold-primary)' : 'transparent',
                                        color: scrapeMode === 'keyword' ? '#000' : 'var(--text-muted)',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontWeight: scrapeMode === 'keyword' ? '600' : '400',
                                        padding: 0
                                    }}
                                >
                                    Search Keywords
                                </button>
                            </div>

                            <div className="form-group">
                                <label>{scrapeMode === 'url' ? 'Google Maps Link' : 'Map Search Keywords'}</label>
                                <div style={{ position: 'relative' }}>
                                    <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        type="text"
                                        placeholder={scrapeMode === 'url' ? "https://google.com/maps/search/..." : "e.g., estate agents london, restaurants new york"}
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

                            <button onClick={handleScrape} disabled={status.scraping.active || !url} style={{ marginBottom: '1.5rem' }}>
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

                                <div className="form-group" style={{ marginTop: '1.25rem', width: '100%', maxWidth: '280px' }}>
                                    <label style={{ color: 'var(--text-main)', fontSize: '0.85rem' }}>Max Leads to Analyze (Skips Already Analyzed)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={maxAnalyze}
                                        onChange={(e) => setMaxAnalyze(e.target.value)}
                                        style={{ marginTop: '0.5rem' }}
                                    />
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
                    </div>
                )}

                {activeTab === 'leads' && (
                    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        
                        {/* Table Header and Sync Action */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ margin: 0, color: 'var(--gold-primary)' }}>Scraped Leads</h2>
                            <button 
                                onClick={fetchResults} 
                                className="refresh-table-btn" 
                                disabled={loading}
                                style={{ width: 'auto', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                                <span>Sync Fresh Leads</span>
                            </button>
                        </div>

                        {/* Interactive Filter & Export Control Panel */}
                        <div className="card filters-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid rgba(212, 175, 55, 0.15)' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'center', justifyContent: 'space-between' }}>
                                
                                {/* Left: Selection Fields */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', flexGrow: 1, maxWidth: 'calc(100% - 340px)', minWidth: '280px' }}>
                                    {/* Search Query Input */}
                                    <div style={{ position: 'relative', flexGrow: 1, minWidth: '200px' }}>
                                        <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input
                                            type="text"
                                            placeholder="Search name, industry, email, tech..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ paddingLeft: '32px', fontSize: '0.85rem', height: '38px', width: '100%' }}
                                        />
                                    </div>

                                    {/* Industry Dropdown */}
                                    <select
                                        value={filterIndustry}
                                        onChange={(e) => setFilterIndustry(e.target.value)}
                                        style={{ height: '38px', fontSize: '0.85rem', minWidth: '150px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '6px', padding: '0 10px' }}
                                    >
                                        <option value="all">All Industries</option>
                                        {getAvailableIndustries().map(ind => (
                                            <option key={ind} value={ind}>{ind}</option>
                                        ))}
                                    </select>

                                    {/* Analysis Status Dropdown */}
                                    <select
                                        value={filterStatus}
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        style={{ height: '38px', fontSize: '0.85rem', minWidth: '150px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '6px', padding: '0 10px' }}
                                    >
                                        <option value="all">All Analysis Status</option>
                                        <option value="analyzed">Analyzed Only</option>
                                        <option value="pending">Pending Only</option>
                                    </select>

                                    {/* Technologies Dropdown */}
                                    <select
                                        value={filterTech}
                                        onChange={(e) => setFilterTech(e.target.value)}
                                        style={{ height: '38px', fontSize: '0.85rem', minWidth: '150px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '6px', padding: '0 10px' }}
                                    >
                                        <option value="all">All Technologies</option>
                                        {getAvailableTechs().map(tech => (
                                            <option key={tech} value={tech}>{tech}</option>
                                        ))}
                                    </select>

                                    {/* Ads Active Dropdown */}
                                    <select
                                        value={filterAds}
                                        onChange={(e) => setFilterAds(e.target.value)}
                                        style={{ height: '38px', fontSize: '0.85rem', minWidth: '140px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '6px', padding: '0 10px' }}
                                    >
                                        <option value="all">All Ads Status</option>
                                        <option value="yes">Active Ads Only</option>
                                        <option value="no">No Ads Only</option>
                                    </select>
                                </div>

                                {/* Right: Checkbox filters and Export options */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                                    {/* Checklist */}
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={filterEmail} 
                                                onChange={(e) => setFilterEmail(e.target.checked)} 
                                                style={{ cursor: 'pointer' }}
                                            />
                                            <span>Has Email</span>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={filterPhone} 
                                                onChange={(e) => setFilterPhone(e.target.checked)} 
                                                style={{ cursor: 'pointer' }}
                                            />
                                            <span>Has Phone</span>
                                        </label>
                                    </div>

                                    {/* Downloader Buttons */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button 
                                            onClick={() => downloadCSV(filteredResults, 'filtered_leads.csv')}
                                            disabled={filteredResults.length === 0}
                                            style={{ 
                                                height: '38px', 
                                                padding: '0 12px', 
                                                fontSize: '0.85rem', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '6px', 
                                                background: 'rgba(212, 175, 55, 0.15)', 
                                                border: '1px solid var(--gold-primary)', 
                                                color: 'var(--gold-secondary)',
                                                cursor: filteredResults.length === 0 ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            <Download size={14} />
                                            <span>Export Filtered ({filteredResults.length})</span>
                                        </button>
                                        <button 
                                            onClick={() => downloadCSV(results, 'all_leads.csv')}
                                            disabled={results.length === 0}
                                            style={{ 
                                                height: '38px', 
                                                padding: '0 12px', 
                                                fontSize: '0.85rem', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '6px', 
                                                background: 'linear-gradient(135deg, var(--gold-primary), var(--gold-secondary))', 
                                                border: '1px solid var(--gold-primary)', 
                                                color: '#000',
                                                fontWeight: '600',
                                                cursor: results.length === 0 ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            <Download size={14} />
                                            <span>Export All ({results.length})</span>
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setSlackTargetScope(filteredResults.length === results.length ? 'all' : 'filtered');
                                                setIsSlackModalOpen(true);
                                                loadSlackSettings();
                                            }}
                                            disabled={results.length === 0}
                                            style={{ 
                                                height: '38px', 
                                                padding: '0 12px', 
                                                fontSize: '0.85rem', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '6px', 
                                                background: 'linear-gradient(135deg, #4A154B, #2E0D30)', 
                                                border: '1px solid rgba(212, 175, 55, 0.3)', 
                                                color: '#fff',
                                                fontWeight: '600',
                                                cursor: results.length === 0 ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            <Send size={14} />
                                            <span>Send to Slack</span>
                                        </button>
                                    </div>
                                </div>
                                
                            </div>
                        </div>

                        {/* Leads Data Table Grid */}
                        <div className="card table-card" style={{ flexGrow: 1, minHeight: '520px', padding: '1.25rem' }}>
                            <div className="results-table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Business Name</th>
                                            <th>Industry</th>
                                            <th>Analysis Status</th>
                                            <th>Website</th>
                                            <th>Location</th>
                                            <th>Phone</th>
                                            <th>Email</th>
                                            <th>Facebook Page</th>
                                            <th>Meta Ads</th>
                                            <th>Tech Stack</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredResults.length > 0 ? (
                                            filteredResults.map((res, idx) => (
                                                <tr key={idx}>
                                                    <td>
                                                        <div style={{ fontWeight: '600', color: 'var(--gold-primary)' }}>{res["Business Name"]}</div>
                                                    </td>
                                                    <td>
                                                        <span className="badge" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--gold-secondary)', border: '1px solid rgba(212, 175, 55, 0.2)' }}>
                                                            {res.Industry || 'N/A'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            padding: '0.25rem 0.5rem',
                                                            borderRadius: '4px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                            display: 'inline-block',
                                                            textAlign: 'center',
                                                            background: res["Analysis Status"] === 'Analyzed' ? 'rgba(40, 167, 69, 0.12)' : 'rgba(212, 175, 55, 0.12)',
                                                            color: res["Analysis Status"] === 'Analyzed' ? '#28a745' : 'var(--gold-secondary)',
                                                            border: res["Analysis Status"] === 'Analyzed' ? '1px solid rgba(40, 167, 69, 0.25)' : '1px solid rgba(212, 175, 55, 0.25)'
                                                        }}>
                                                            {res["Analysis Status"] || 'Pending'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {res.Website && res.Website !== "N/A" ? (
                                                            <a href={res.Website} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--gold-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <Globe size={12} />
                                                                <span>{res.Website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}</span>
                                                                <ExternalLink size={10} />
                                                            </a>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center' }} title={res.Address}>
                                                            <MapPin size={14} style={{ marginRight: '5px', color: 'var(--gold-secondary)' }} />
                                                            {res.City}, {res.Country}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {res.Phone && res.Phone !== "N/A" ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                                                                <Phone size={12} style={{ color: 'var(--text-muted)' }} />
                                                                <span>{res.Phone}</span>
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {res.Email && res.Email !== "N/A" ? (
                                                            <a href={`mailto:${res.Email}`} style={{ color: 'var(--text-main)', textDecoration: 'underline', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <span>✉</span>
                                                                <span>{res.Email}</span>
                                                            </a>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {res["Facebook Page"] && res["Facebook Page"] !== "N/A" ? (
                                                            <a href={res["Facebook Page"]} target="_blank" rel="noreferrer" style={{ color: '#1877F2', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                                                                <span style={{ fontWeight: 'bold' }}>f</span>
                                                                <span>Facebook Page</span>
                                                                <ExternalLink size={10} />
                                                            </a>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                                        )}
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
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="10" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                        <Filter size={24} style={{ color: 'rgba(212, 175, 55, 0.3)' }} />
                                                        <span>No leads match the selected filter criteria.</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="animate-fade-in" style={{ height: '100%' }}>
                        <div className="console-card" style={{ margin: 0, height: '100%', minHeight: '680px', display: 'flex', flexDirection: 'column' }}>
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

                            <div className="console-body" ref={consoleBodyRef} style={{ flexGrow: 1, height: '550px' }}>
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
                )}

                {activeTab === 'market-research' && (
                    <MarketResearch />
                )}
            </main>

            {isSlackModalOpen && (
                <div className="modal-overlay" onClick={() => setIsSlackModalOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>
                                <Send size={20} style={{ color: 'var(--gold-primary)' }} />
                                <span>Send Leads to Slack</span>
                            </h3>
                            <button className="modal-close-btn" onClick={() => setIsSlackModalOpen(false)}>×</button>
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ marginBottom: '0.5rem' }}>Target Data Scope</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => setSlackTargetScope('filtered')}
                                    style={{
                                        flex: 1,
                                        fontSize: '0.8rem',
                                        background: slackTargetScope === 'filtered' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.05)',
                                        color: slackTargetScope === 'filtered' ? '#000' : 'var(--text-main)',
                                        border: '1px solid var(--border-color)',
                                        margin: 0,
                                        padding: '8px'
                                    }}
                                >
                                    Filtered Leads ({filteredResults.length})
                                </button>
                                <button
                                    onClick={() => setSlackTargetScope('all')}
                                    style={{
                                        flex: 1,
                                        fontSize: '0.8rem',
                                        background: slackTargetScope === 'all' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.05)',
                                        color: slackTargetScope === 'all' ? '#000' : 'var(--text-main)',
                                        border: '1px solid var(--border-color)',
                                        margin: 0,
                                        padding: '8px'
                                    }}
                                >
                                    All Leads ({results.length})
                                </button>
                            </div>
                        </div>

                        <div className="slack-tab-group">
                            <button 
                                className={`slack-tab-btn ${slackOption === 'webhook' ? 'active' : ''}`}
                                onClick={() => setSlackOption('webhook')}
                            >
                                Webhook (Summary)
                            </button>
                            <button 
                                className={`slack-tab-btn ${slackOption === 'token' ? 'active' : ''}`}
                                onClick={() => setSlackOption('token')}
                            >
                                Bot Token (CSV Upload)
                            </button>
                        </div>

                        {slackOption === 'webhook' ? (
                            <div className="form-group animate-fade-in">
                                <label>Slack Webhook URL
                                    {slackSavedStatus?.webhook_url_saved && (
                                        <span style={{ marginLeft: '8px', fontSize: '0.72rem', color: '#28a745', background: 'rgba(40,167,69,0.12)', border: '1px solid rgba(40,167,69,0.3)', borderRadius: '4px', padding: '1px 6px' }}>
                                            ✓ Saved in DB
                                        </span>
                                    )}
                                </label>
                                <input
                                    type="text"
                                    placeholder={slackSavedStatus?.webhook_url_saved ? `Using saved: ${slackSavedStatus.webhook_url_preview}` : "https://hooks.slack.com/services/... (or leave blank to use .env)"}
                                    value={slackWebhookUrl}
                                    onChange={(e) => setSlackWebhookUrl(e.target.value)}
                                    style={{ width: '100%' }}
                                />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                                    Posts a formatted summary message with a preview list of the top 10 leads to the designated webhook channel.
                                </span>
                            </div>
                        ) : (
                            <div className="animate-fade-in">
                                <div className="form-group">
                                    <label>Slack Bot Token (xoxb-...)
                                        {slackSavedStatus?.bot_token_saved && (
                                            <span style={{ marginLeft: '8px', fontSize: '0.72rem', color: '#28a745', background: 'rgba(40,167,69,0.12)', border: '1px solid rgba(40,167,69,0.3)', borderRadius: '4px', padding: '1px 6px' }}>
                                                ✓ Saved in DB
                                            </span>
                                        )}
                                    </label>
                                    <input
                                        type="text"
                                        placeholder={slackSavedStatus?.bot_token_saved ? `Using saved: ${slackSavedStatus.bot_token_preview}` : "xoxb-your-slack-bot-token (or leave blank to use .env)"}
                                        value={slackBotToken}
                                        onChange={(e) => setSlackBotToken(e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Target Channel Name</label>
                                    <input
                                        type="text"
                                        placeholder="#leads (or leave blank to use .env)"
                                        value={slackChannel}
                                        onChange={(e) => setSlackChannel(e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                                        Uploads the complete generated CSV spreadsheet file to this channel. Make sure your Slack app is added to this channel!
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Save / Clear credentials row */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
                            <button
                                onClick={saveSlackCredentials}
                                disabled={savingSlackCreds}
                                style={{ flex: 1, fontSize: '0.8rem', background: 'rgba(212,175,55,0.12)', color: 'var(--gold-primary)', border: '1px solid rgba(212,175,55,0.3)', margin: 0, padding: '8px' }}
                            >
                                {savingSlackCreds ? 'Saving...' : '💾 Save Credentials to DB'}
                            </button>
                            {(slackSavedStatus?.webhook_url_saved || slackSavedStatus?.bot_token_saved) && (
                                <button
                                    onClick={clearSlackCredentials}
                                    style={{ fontSize: '0.8rem', background: 'rgba(220,53,69,0.1)', color: '#dc3545', border: '1px solid rgba(220,53,69,0.3)', margin: 0, padding: '8px 12px' }}
                                >
                                    🗑 Clear
                                </button>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button 
                                onClick={() => setIsSlackModalOpen(false)}
                                style={{ background: '#333', color: '#fff', flex: 1 }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSendToSlack}
                                disabled={sendingToSlack}
                                style={{ flex: 2 }}
                            >
                                {sendingToSlack ? 'Sending...' : 'Send to Slack'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
