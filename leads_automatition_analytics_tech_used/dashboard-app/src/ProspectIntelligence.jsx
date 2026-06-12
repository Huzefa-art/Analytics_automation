import React, { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  Search, Zap, AlertCircle, Shield, Eye, CheckCircle, MapPin,
  ChevronDown, ChevronUp, ChevronRight, Loader, RefreshCw, Download, Send,
  TrendingUp, Users, Target, Globe, Activity, Filter,
  BarChart2, Layers, ExternalLink, Play, Database
} from 'lucide-react';

const API = '/api';

// ── Department options ────────────────────────────────────────────────────────
const DEFAULT_DEPT_OPTIONS = [
  { slug: 'logistics_supply_chain', label: 'Core Logistics & Supply Chain', sub: 'Logistics Managers, Supply Chain Directors', color: '#60a5fa' },
  { slug: 'warehousing_inventory', label: 'Warehousing & Inventory', sub: 'Warehouse Managers, Inventory Controllers', color: '#fbbf24' },
  { slug: 'transport_dispatch', label: 'Transport & Dispatch', sub: 'Fleet Managers, Dispatchers', color: '#34d399' },
  { slug: 'procurement_sourcing', label: 'Procurement & Sourcing', sub: 'Procurement Managers, Sourcing Analysts', color: '#a78bfa' },
  { slug: 'cross_functional', label: 'Cross-Functional Support', sub: 'IT, Finance, HR, Operations', color: '#f87171' },
  { slug: 'external_stakeholders', label: 'External Stakeholders', sub: 'Customers, Vendors, Carriers, Partners', color: '#fb923c' },
];

function deptColor(slug, options = DEFAULT_DEPT_OPTIONS) {
  return options.find(d => d.slug === slug)?.color || '#888';
}

function DeptBadge({ dept, options = DEFAULT_DEPT_OPTIONS, size = 'sm' }) {
  const d = options.find(o => o.slug === dept || o.label === dept);
  const color = d?.color || '#888';
  const label = d?.label || dept;
  return (
    <span style={{
      background: `${color}15`, border: `1px solid ${color}44`,
      color, fontSize: size === 'xs' ? '0.6rem' : '0.68rem', fontWeight: 700,
      padding: size === 'xs' ? '1px 6px' : '2px 8px', borderRadius: '20px',
      whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px'
    }}>
      <Users size={size === 'xs' ? 9 : 10} /> {label}
    </span>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
function getConfColor(score) {
  if (score >= 81) return { bg: 'rgba(255,80,0,0.15)', border: 'rgba(255,80,0,0.4)', text: '#ff6020', label: 'HOT' };
  if (score >= 61) return { bg: 'rgba(40,167,69,0.12)', border: 'rgba(40,167,69,0.35)', text: '#39ff14', label: 'STRONG' };
  if (score >= 31) return { bg: 'rgba(255,193,7,0.12)', border: 'rgba(255,193,7,0.35)', text: '#ffdf00', label: 'WEAK' };
  return { bg: 'rgba(120,120,120,0.1)', border: 'rgba(120,120,120,0.3)', text: '#888', label: 'SKIP' };
}

function ConfBadge({ score }) {
  const c = getConfColor(score);
  return (
    <span style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
      {score}% · {c.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    generated: { bg: 'rgba(40,167,69,0.15)', color: '#39ff14', border: 'rgba(40,167,69,0.3)', label: '✓ Generated' },
    pending: { bg: 'rgba(255,193,7,0.15)', color: '#ffdf00', border: 'rgba(255,193,7,0.3)', label: '⟳ Pending' },
    loading: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: 'rgba(96,165,250,0.3)', label: '◌ Loading…' },
    none: { bg: 'rgba(120,120,120,0.1)', color: '#666', border: 'rgba(120,120,120,0.2)', label: '— Not started' },
  };
  const s = map[status] || map.none;
  return (
    <span style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
      {s.label}
    </span>
  );
}

function FreqBadge({ freq }) {
  const map = {
    'very common': '#ff6b6b',
    'common': '#ffdf00',
    'occasional': '#a78bfa',
  };
  const color = map[(freq || '').toLowerCase()] || '#888';
  return (
    <span style={{ background: `${color}18`, border: `1px solid ${color}44`, color, fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' }}>
      {freq}
    </span>
  );
}

function AccordionSection({ title, icon: Icon, iconColor = 'var(--gold-primary)', status, children, defaultOpen = true, action }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card pi-accordion" style={{ borderColor: `${iconColor}33` }}>
      <div onClick={() => setOpen(o => !o)} className="pi-accordion-header">
        <div className="pi-accordion-title">
          <Icon size={18} style={{ color: iconColor, flexShrink: 0 }} />
          <h3>{title}</h3>
          <StatusBadge status={status} />
        </div>
        <div className="pi-accordion-actions">
          {action}
          {open ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </div>
      {open && <div className="pi-accordion-body">{children}</div>}
    </div>
  );
}

// ── compute confidence for a lead against all signal blocks ───────────────────
function scoreLeadAgainstSignals(lead, signalBlocks) {
  const results = {};
  let totalScore = 0;
  let blockCount = 0;

  for (const block of (signalBlocks || [])) {
    const confirmed = [], unconfirmed = [];
    let blockScore = 0;

    for (const sig of (block.signals || [])) {
      const weight = sig.weight || 20; // fallback weight
      let ok = false;
      const st = (sig.signal || '').toLowerCase();
      const st_desc = (sig.confirmed_if || '').toLowerCase();
      const side = sig.side;

      // Normalize lead fields
      const chat = lead['Live Chat / Support'] || lead['live_chat'] || '';
      const crm = lead['CRM / Marketing Automation'] || lead['crm'] || '';
      const pay = lead['Payments'] || lead['payments'] || '';
      const ads = lead['Ads Active'] || lead['ads_active'] || '';
      const cms = lead['CMS'] || lead['cms'] || '';
      const web = lead['Website'] || lead['website'] || '';
      const rating = parseFloat(lead['Rating'] || lead['rating'] || '5');
      const reviews = parseInt(lead['Reviews'] || lead['reviews'] || '0');
      const email = lead['Email'] || lead['email'] || '';
      const phone = lead['Phone'] || lead['phone'] || '';

      const noVal = v => !v || v === 'N/A' || v === '[]' || v === '';

      if (side === 'solution_gap') {
        // Broaden matching for software gaps
        if (st.includes('chat') || st.includes('bot') || st.includes('chatbot') || st.includes('messaging')) {
          ok = noVal(chat);
        } else if (st.includes('crm') || st.includes('automat') || st.includes('outreach') || st.includes('salesforce') || st.includes('hubspot')) {
          ok = noVal(crm);
        } else if (st.includes('payment') || st.includes('order') || st.includes('booking') || st.includes('transaction')) {
          ok = noVal(pay);
        } else if (st.includes('ads') || st.includes('advertis') || st.includes('pixel') || st.includes('facebook') || st.includes('google ads')) {
          ok = ads === 'No' || noVal(ads);
        } else if (st.includes('website') || st.includes('web presence') || st.includes('online visibility')) {
          ok = noVal(web);
        } else if (st.includes('analytics') || st.includes('tracking') || st.includes('pixel')) {
          ok = noVal(cms) && noVal(chat);
        } else if (st.includes('logisitic') || st.includes('shipment') || st.includes('carrier') || st.includes('freight')) {
          // B2B logistics specific gaps — often tied to lack of advanced CRM/Pay integration
          ok = noVal(crm) || noVal(pay);
        } else {
          ok = noVal(cms); // Fallback to CMS check
        }
      } else {
        // problem_evidence — check reviews, rating, or reachability
        const hasContact = (email && email !== 'N/A' && email !== '') || (phone && phone !== 'N/A' && phone !== '');

        if (st.includes('review') || st.includes('rating') || st.includes('reputation') || st.includes('unhappy')) {
          // Lower ratings or fewer reviews can be evidence of pain
          ok = rating < 4.2 || reviews < 15;
        } else if (st.includes('hiring') || st.includes('vacancy') || st.includes('recruiting')) {
          // hiring signals are strong evidence of growth or turnover pain
          ok = reviews > 5; // Proxy: established businesses hire more
        } else {
          ok = hasContact; // Default to basic reachability
        }
      }

      if (ok) { confirmed.push(sig); blockScore += weight; }
      else unconfirmed.push(sig);
    }

    results[block.pain_point_title] = { score: Math.min(blockScore, 100), confirmed, unconfirmed };
    totalScore += Math.min(blockScore, 100);
    blockCount++;
  }

  const overall = blockCount > 0 ? Math.round(totalScore / blockCount) : 0;
  return { overall, perPainPoint: results };
}

export default function ProspectIntelligence({ leads: globalLeads = [], onSendToOutreach }) {
  // Inputs
  const [technology, setTechnology] = useState('');
  const [industry, setIndustry] = useState('');
  const [deptOptions, setDeptOptions] = useState(DEFAULT_DEPT_OPTIONS);
  const [departments, setDepartments] = useState([]); // selected dept slugs
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  // Generation state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [fromCache, setFromCache] = useState(false);

  // History panel
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Section open states
  const [sec1Open, setSec1Open] = useState(true);
  const [sec2Open, setSec2Open] = useState(true);
  const [sec3Open, setSec3Open] = useState(true);
  const [resultsOpen, setResultsOpen] = useState(true);

  // Scraping state
  const [scrapeKeyword, setScrapeKeyword] = useState('');
  const [scrapeMax, setScrapeMax] = useState(20);
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState('');
  const [scrapeLeads, setScrapeLeads] = useState([]);
  const scrapeIntervalRef = useRef(null);

  // Signal scan state
  const [scanning, setScanning] = useState(false);
  const [scoredLeads, setScoredLeads] = useState([]);

  // Runner state (Option A/B)
  const [runnerSource, setRunnerSource] = useState('existing'); // 'existing' | 'fresh'
  const [freshLocation, setFreshLocation] = useState('');
  const [freshSources, setFreshSources] = useState(['Google Maps']);
  const availableSources = ['Google Maps', 'Yellow Pages', 'Yelp', 'Companies House (UK)', 'LinkedIn Company Search', 'Bark.com', 'Clutch.co', 'Facebook Business Pages'];

  // Table filters
  const [confThreshold, setConfThreshold] = useState(0);
  const [filterPainPoint, setFilterPainPoint] = useState('all');
  const [selectedLeads, setSelectedLeads] = useState(new Set());

  // ── Load history from Supabase ────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await axios.get('/api/market/saved-searches');
      const pi = (res.data || []).filter(x => x.tab === 'prospect_intel');
      setHistory(pi);
    } catch { /* silent */ }
    finally { setLoadingHistory(false); }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // ── Fetch recommended departments when industry changes ─────────────────
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoadingDepts(true);
      try {
        const res = await axios.get(`${API}/market/recommend-departments?industry=${encodeURIComponent(industry)}`);
        if (res.data && Array.isArray(res.data)) {
          setDeptOptions(res.data);
          // Clear selections if they no longer exist in new options
          setDepartments(prev => prev.filter(slug => res.data.some(opt => opt.slug === slug)));
        }
      } catch (err) {
        console.error("Failed to fetch depts", err);
      } finally {
        setLoadingDepts(false);
      }
    }, 600); // 600ms debounce
    return () => clearTimeout(timer);
  }, [industry]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => { if (mq.matches) setHistoryOpen(false); };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ── Load a saved history entry ────────────────────────────────────────────
  const handleLoadHistory = async (entry) => {
    setLoading(true);
    setError('');
    setData(null);
    setScoredLeads([]);
    setScrapeLeads([]);
    try {
      // Load via generate endpoint (will hit cache instantly)
      // The problem field stores "prospect:{tech}:{industry}"
      const parts = (entry.problem || '').replace(/^prospect:/, '').split(':');
      const tech = parts[0] || entry.industry;
      const ind = parts[1] || '';
      const sub = { technology: tech, industry: ind };
      setSubmitted(sub);
      setTechnology(tech);
      setIndustry(ind);
      const res = await axios.post('/api/prospect-intel/generate', { technology: tech, industry: ind });
      setData(res.data);
      setFromCache(true);
      const primary = res.data?.section3_lead_sources?.find(s => s.is_primary);
      if (primary?.search_keyword) setScrapeKeyword(primary.search_keyword);

      // Try to load saved scan results for this tech+industry
      try {
        const scanRes = await axios.get(`/api/prospect-intel/scan-results?technology=${encodeURIComponent(tech)}&industry=${encodeURIComponent(ind)}`);
        if (scanRes.data?.scored_leads?.length) {
          setScoredLeads(scanRes.data.scored_leads);
        }
      } catch { /* no saved scan yet */ }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load saved run.');
    } finally {
      setLoading(false);
    }
  };

  // ── Delete a history entry ────────────────────────────────────────────────
  const handleDeleteHistory = async (e, cacheKey) => {
    e.stopPropagation();
    if (!window.confirm('Delete this saved run?')) return;
    try {
      await axios.delete(`/api/market/saved-searches/${cacheKey}`);
      setHistory(h => h.filter(x => x.cache_key !== cacheKey));
    } catch { alert('Failed to delete'); }
  };

  // ── Generate / load from cache ───────────────────────────────────────────
  const handleGenerate = async (forceRefresh = false) => {
    if (!technology.trim()) return;
    setLoading(true);
    setError('');
    setData(null);
    setScoredLeads([]);
    setScrapeLeads([]);
    const sub = { technology: technology.trim(), industry: industry.trim(), departments: departments };
    setSubmitted(sub);

    try {
      const endpoint = forceRefresh ? `${API}/prospect-intel/refresh` : `${API}/prospect-intel/generate`;
      const res = await axios.post(endpoint, { technology: sub.technology, industry: sub.industry, departments: sub.departments });
      setData(res.data);
      setFromCache(!forceRefresh);

      // Auto-set scrape keyword from primary source
      const primary = res.data?.section3_lead_sources?.find(s => s.is_primary);
      if (primary?.search_keyword) setScrapeKeyword(primary.search_keyword);

      // Try to load previously saved scan results
      try {
        const scanRes = await axios.get(`/api/prospect-intel/scan-results?technology=${encodeURIComponent(sub.technology)}&industry=${encodeURIComponent(sub.industry)}`);
        if (scanRes.data?.scored_leads?.length) {
          setScoredLeads(scanRes.data.scored_leads);
        }
      } catch { /* no saved scan yet — user needs to run it */ }

      // Refresh history panel so new entry appears
      fetchHistory();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to generate. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Signal Runner Orchestration ──────────────────────────────────────────
  const triggerSignalRunner = async (type = 'existing') => {
    if (!data?.section2_signals || !submitted) return;
    setScraping(true);
    setScanning(true);
    setScrapeStatus(type === 'fresh' ? 'Initiating multi-source scrape...' : 'Starting database signal analysis...');

    try {
      await axios.post(`${API}/prospect-intel/run-signals`, {
        source: type,
        industry: type === 'fresh' ? freshIndustry : submitted.industry,
        location: type === 'fresh' ? freshLocation : '',
        num_businesses: type === 'fresh' ? freshVolume : 20,
        sources: type === 'fresh' ? freshSources : ["Google Maps"],
        signal_plan: data.section2_signals
      });

      // Poll analyzing status
      scrapeIntervalRef.current = setInterval(async () => {
        try {
          const st = await axios.get(`${API}/status`);
          const s = st.data?.analyzing;
          setScrapeStatus(s?.progress || '');
          if (!s?.active) {
            clearInterval(scrapeIntervalRef.current);
            setScraping(false);
            setScanning(false);
            setScrapeStatus('Runner finished — loading results...');
            // Fetch results
            const res = await axios.get(`${API}/results`);
            const normalized = (res.data || []).map(l => {
              // Map backend signal_evidence to frontend _perPainPoint
              let ev = {};
              try {
                ev = typeof l['Signal Evidence'] === 'string' ? JSON.parse(l['Signal Evidence']) : (l['Signal Evidence'] || {});
              } catch { ev = {}; }

              return {
                ...l,
                _overall: parseInt(l['Overall Score'] || 0),
                _perPainPoint: ev,
                _rating: l['Rating'] || 'COLD', // HOT/WARM/COLD
              };
            });
            setScrapeLeads(normalized);
            setScoredLeads(normalized);
          }
        } catch {
          clearInterval(scrapeIntervalRef.current);
          setScraping(false);
          setScanning(false);
        }
      }, 2500);
    } catch (err) {
      setScraping(false);
      setScanning(false);
      setScrapeStatus(err?.response?.data?.detail || 'Runner failed');
    }
  };

  const handleScrape = () => triggerSignalRunner('fresh');
  const handleSignalScan = () => triggerSignalRunner('existing');

  // ── Export CSV ───────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!scoredLeads.length) return;
    const painTitles = data?.section2_signals?.map(b => b.pain_point_title) || [];
    const headers = ['Business Name', 'Industry', 'Email', 'Phone', 'Website', 'Overall Score', ...painTitles];
    const rows = scoredLeads.map(l => [
      l['Business Name'] || '', l['Industry'] || '',
      l['Email'] || '', l['Phone'] || '',
      l['Website'] || '', l._overall,
      ...painTitles.map(pt => l._perPainPoint?.[pt]?.score || 0)
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `prospect_intel_${submitted?.technology}_${Date.now()}.csv`; a.click();
  };

  // ── Send selected to Outreach ─────────────────────────────────────────────
  const handleSendToOutreach = () => {
    if (!onSendToOutreach) return;
    const toSend = scoredLeads.filter((_, i) => selectedLeads.has(i));
    onSendToOutreach(toSend);
  };

  // ── Filtered leads ────────────────────────────────────────────────────────
  const filteredScored = scoredLeads.filter(l => {
    if (l._overall < confThreshold) return false;
    if (filterPainPoint !== 'all') {
      const ppScore = l._perPainPoint?.[filterPainPoint]?.score || 0;
      if (ppScore < confThreshold) return false;
    }
    return true;
  });

  const painTitles = data?.section2_signals?.map(b => b.pain_point_title) || [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in prospect-intel-page">

      {/* HEADER */}
      <div className="pi-header">
        <h2>
          <Zap size={24} style={{ color: 'var(--gold-primary)', flexShrink: 0 }} /> Prospect Intelligence
        </h2>
        <p>
          Enter a technology or keyword → AI generates pain points, signal detection plan, and lead sources → scrape and score leads automatically.
        </p>
      </div>

      {/* HISTORY PANEL */}
      <div className="card" style={{ padding: '0.85rem 1.1rem' }}>
        <div onClick={() => setHistoryOpen(o => !o)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={15} style={{ color: 'var(--gold-primary)' }} />
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gold-primary)' }}>Saved Runs</span>
            <span style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--gold-primary)', fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: '20px', border: '1px solid rgba(212,175,55,0.3)' }}>
              {history.length}
            </span>
            {loadingHistory && <Loader size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={e => { e.stopPropagation(); fetchHistory(); }}
              style={{ margin: 0, width: 'auto', padding: '2px 8px', fontSize: '0.7rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', transform: 'none', boxShadow: 'none' }}>
              <RefreshCw size={10} />
            </button>
            {historyOpen ? <ChevronUp size={15} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />}
          </div>
        </div>

        {historyOpen && (
          <div style={{ marginTop: '0.75rem' }}>
            {history.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '0.5rem 0' }}>
                No saved runs yet. Generate your first intelligence report above.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {history.map((entry, i) => {
                  const parts = (entry.problem || '').replace(/^prospect:/, '').split(':');
                  const tech = parts[0] || entry.industry;
                  const ind = parts[1] || '';
                  const isActive = submitted?.technology === tech && submitted?.industry === ind;
                  return (
                    <div key={i}
                      onClick={() => handleLoadHistory(entry)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: isActive ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isActive ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: '8px', padding: '5px 10px', cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}>
                      <Zap size={11} style={{ color: isActive ? 'var(--gold-primary)' : '#a78bfa', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isActive ? 'var(--gold-primary)' : '#fff' }}>
                        {tech}
                      </span>
                      {ind && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>· {ind}</span>}
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {entry.saved_at?.slice(0, 10)}
                      </span>
                      <button
                        onClick={e => handleDeleteHistory(e, entry.cache_key)}
                        style={{ all: 'unset', cursor: 'pointer', color: 'rgba(255,107,107,0.4)', fontSize: '0.9rem', lineHeight: 1, padding: '0 2px' }}
                        title="Delete">×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* INPUT FORM */}
      <div className="card">
        <form onSubmit={e => { e.preventDefault(); handleGenerate(false); }} className="pi-form">
          <div className="pi-form-field pi-form-field--wide">
            <label>Technology / Keyword <span style={{ color: '#ff6b6b', fontWeight: 700 }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <Zap size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--gold-primary)' }} />
              <input type="text" value={technology} onChange={e => setTechnology(e.target.value)}
                placeholder="e.g. chatbots, voice agents, website development, automation"
                style={{ paddingLeft: '32px' }} required />
            </div>
          </div>
          <div className="pi-form-field">
            <label>Industry <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <div style={{ position: 'relative' }}>
              <Globe size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="text" value={industry} onChange={e => setIndustry(e.target.value)}
                placeholder="e.g. restaurants, real estate" style={{ paddingLeft: '30px' }} />
            </div>
          </div>

          {/* Department / Stakeholder Focus */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Department / Stakeholder Focus
              <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, marginLeft: '6px' }}>(optional — select all that apply)</span>
              {loadingDepts && <Loader size={12} className="animate-spin" style={{ color: 'var(--gold-primary)' }} />}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {deptOptions.map(opt => {
                const selected = departments.includes(opt.slug);
                return (
                  <button key={opt.slug} type="button"
                    onClick={() => setDepartments(prev =>
                      prev.includes(opt.slug) ? prev.filter(d => d !== opt.slug) : [...prev, opt.slug]
                    )}
                    style={{
                      margin: 0, width: 'auto', padding: '5px 12px',
                      background: selected ? `${opt.color}18` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selected ? opt.color : 'rgba(255,255,255,0.1)'}`,
                      color: selected ? opt.color : 'var(--text-muted)',
                      borderRadius: '20px', fontSize: '0.78rem', fontWeight: selected ? 700 : 400,
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1px',
                      transform: 'none', boxShadow: 'none', textTransform: 'none', letterSpacing: 0,
                      transition: 'all 0.15s ease', cursor: 'pointer'
                    }}>
                    <span>{opt.label}</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 400 }}>{opt.sub}</span>
                  </button>
                );
              })}
              {departments.length > 0 && (
                <button type="button"
                  onClick={() => setDepartments([])}
                  style={{ margin: 0, width: 'auto', padding: '5px 12px', background: 'rgba(220,53,69,0.08)', border: '1px solid rgba(220,53,69,0.25)', color: '#ff6b6b', borderRadius: '20px', fontSize: '0.72rem', transform: 'none', boxShadow: 'none', textTransform: 'none', letterSpacing: 0 }}>
                  Clear all ×
                </button>
              )}
            </div>
            {departments.length === 0 && (
              <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                None selected = All Departments (default)
              </p>
            )}
          </div>

          <div className="pi-form-actions">
            <button type="submit" disabled={loading || !technology.trim()} className="pi-btn-primary">
              {loading ? <Loader size={15} className="animate-spin" /> : <Search size={15} />}
              {loading ? 'Generating…' : 'Generate Intelligence'}
            </button>
            {data && (
              <button type="button" onClick={() => handleGenerate(true)} disabled={loading}
                title="Regenerate fresh from LLM"
                style={{ width: 'auto', marginBottom: 0, padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', transform: 'none', boxShadow: 'none' }}>
                <RefreshCw size={15} />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ERROR */}
      {error && (
        <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.3)', borderRadius: '8px', padding: '1rem', color: '#ff6b6b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} /><span>{error}</span>
          </div>
          <button onClick={() => handleGenerate(true)} style={{ width: 'auto', margin: 0, padding: '4px 12px', fontSize: '0.78rem', background: 'rgba(220,53,69,0.15)', border: '1px solid rgba(220,53,69,0.4)', color: '#ff6b6b', transform: 'none', boxShadow: 'none' }}>Retry</button>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem', gap: '1rem' }}>
          <Loader size={32} className="animate-spin" style={{ color: 'var(--gold-primary)' }} />
          <span style={{ color: 'var(--text-muted)' }}>Generating pain points, signal detection plan, and lead sources with AI…</span>
          <span style={{ color: 'rgba(212,175,55,0.5)', fontSize: '0.78rem' }}>Takes 20–40 seconds · result is cached for instant future loads</span>
        </div>
      )}

      {/* SUMMARY BAR */}
      {data && submitted && (
        <div className="pi-summary-bar">
          {[
            { label: 'Technology', value: submitted.technology, color: 'var(--gold-primary)' },
            { label: 'Industry Scope', value: submitted.industry || 'All Industries', color: '#60a5fa' },
            { label: 'Pain Points', value: data.section1_pain_points?.length || 0, color: '#ff6b6b' },
            { label: 'Signal Blocks', value: data.section2_signals?.length || 0, color: '#a78bfa' },
            { label: 'Lead Sources', value: data.section3_lead_sources?.length || 0, color: '#39ff14' },
            { label: 'Scored Leads', value: scoredLeads.length, color: '#ffdf00' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>{s.label}</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
          ))}
          {fromCache && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#39ff14', background: 'rgba(40,167,69,0.1)', border: '1px solid rgba(40,167,69,0.3)', padding: '2px 10px', borderRadius: '20px' }}>✓ From Supabase cache</span>}
          {/* Departments targeted */}
          {submitted.departments?.length > 0 && (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dept Focus:</span>
              {submitted.departments.map(slug => <DeptBadge key={slug} dept={slug} options={deptOptions} size="xs" />)}
            </div>
          )}
        </div>
      )}

      {data && (
        <>
          {/* ── SECTION 1: PAIN POINTS ─────────────────────────────────────── */}
          <AccordionSection title="Section 1 — Pain Points" icon={AlertCircle} iconColor="#ff6b6b"
            status={data.section1_pain_points?.length ? 'generated' : 'none'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(data.section1_pain_points || []).map((pp, i) => (
                <div key={i} style={{ background: 'rgba(255,107,107,0.04)', border: '1px solid rgba(255,107,107,0.15)', borderRadius: '10px', padding: '1rem 1.1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: 'rgba(255,107,107,0.15)', color: '#ff6b6b', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '20px', border: '1px solid rgba(255,107,107,0.3)' }}>#{i + 1}</span>
                      <strong style={{ color: 'var(--gold-primary)', fontSize: '0.97rem' }}>{pp.title}</strong>
                    </div>
                    <FreqBadge freq={pp.frequency} />
                  </div>
                  <p style={{ margin: '0 0 0.6rem', fontSize: '0.87rem', color: 'var(--text-main)', lineHeight: 1.65 }}>{pp.description}</p>
                  <div className="pi-grid-2" style={{ marginTop: '0.5rem' }}>
                    <div style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.15)', borderRadius: '7px', padding: '0.55rem 0.75rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#39ff14', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Revenue Impact</div>
                      <div style={{ fontSize: '0.83rem', color: '#a7f3d0' }}>{pp.revenue_impact}</div>
                    </div>
                    <div style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '7px', padding: '0.55rem 0.75rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Why Tech Solves It</div>
                      <div style={{ fontSize: '0.83rem', color: '#ddd6fe' }}>{pp.why_tech_solves}</div>
                    </div>
                  </div>

                  {/* Who Feels This Pain */}
                  {pp.who_feels_pain?.length > 0 && (
                    <div style={{ marginTop: '0.65rem', background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: '7px', padding: '0.6rem 0.75rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={10} /> Who Feels This Pain
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {pp.who_feels_pain.map((wfp, wi) => (
                          <div key={wi} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <DeptBadge dept={wfp.department} options={deptOptions} size="xs" />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {Array.isArray(wfp.job_titles) ? wfp.job_titles.join(', ') : wfp.job_titles}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </AccordionSection>

          {/* ── SECTION 2: SIGNAL DETECTION PLAN ──────────────────────────── */}
          <AccordionSection title="Section 2 — Signal Detection Plan" icon={Shield} iconColor="#a78bfa"
            status={data.section2_signals?.length ? 'generated' : 'none'}
            action={
              <button onClick={e => { e.stopPropagation(); handleSignalScan(); }}
                disabled={scanning || (!scrapeLeads.length && !globalLeads.length)}
                style={{ margin: 0, width: 'auto', padding: '4px 12px', fontSize: '0.78rem', background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.35)', color: '#a78bfa', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', transform: 'none', boxShadow: 'none' }}>
                {scanning ? <Loader size={11} className="animate-spin" /> : <Activity size={11} />}
                {scanning ? 'Scanning…' : 'Run Signal Scan'}
              </button>
            }>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Each pain point: <strong style={{ color: '#60a5fa' }}>Side 1 — Solution Gap</strong> (no fix in place) + <strong style={{ color: '#fbbf24' }}>Side 2 — Problem Evidence</strong> (pain exists). Weights sum to 100%.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {(data.section2_signals || []).map((block, bi) => {
                const side1 = block.signals?.filter(s => s.side === 'solution_gap') || [];
                const side2 = block.signals?.filter(s => s.side === 'problem_evidence') || [];
                const totalW = block.signals?.reduce((a, s) => a + (s.weight || 0), 0) || 0;
                return (
                  <div key={bi} style={{ background: 'rgba(138,43,226,0.04)', border: '1px solid rgba(138,43,226,0.18)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid rgba(138,43,226,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <AlertCircle size={14} style={{ color: '#f87171' }} />
                        <span style={{ fontWeight: 700, color: 'var(--gold-primary)', fontSize: '0.92rem' }}>{block.pain_point_title}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Who to Contact */}
                        {block.who_to_contact && (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '8px', padding: '3px 10px' }}>
                            <Users size={11} style={{ color: '#60a5fa', flexShrink: 0 }} />
                            <div>
                              <span style={{ fontSize: '0.6rem', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block' }}>Contact</span>
                              <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 600 }}>{block.who_to_contact.job_title}</span>
                              {block.who_to_contact.department && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '4px' }}>· {block.who_to_contact.department}</span>}
                            </div>
                          </div>
                        )}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                          {totalW}% total weight
                        </span>
                      </div>
                    </div>
                    <div className="pi-signal-grid">
                      <div className="pi-signal-col pi-signal-col--left">
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Shield size={11} /> Side 1 — Solution Gap
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                          {side1.map((sig, si) => <MiniSignalCard key={si} sig={sig} accent="#60a5fa" />)}
                          {side1.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No side 1 signals.</span>}
                        </div>
                      </div>
                      <div className="pi-signal-col">
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Zap size={11} /> Side 2 — Problem Evidence
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                          {side2.map((sig, si) => <MiniSignalCard key={si} sig={sig} accent="#fbbf24" />)}
                          {side2.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No side 2 signals.</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </AccordionSection>

          {/* ── SECTION 3: SIGNAL DETECTION RUNNER ────────────────────────── */}
          <AccordionSection title="Section 3 — Signal Detection Runner" icon={Zap} iconColor="#ffdf00"
            status={(scoredLeads.length || scraping) ? 'generated' : 'none'}>

            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ color: 'var(--gold-primary)', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.8rem', display: 'block' }}>
                  Step 1 — Source Selection
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div
                    onClick={() => setRunnerSource('existing')}
                    style={{
                      padding: '1rem', borderRadius: '10px', border: `1px solid ${runnerSource === 'existing' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)'}`,
                      background: runnerSource === 'existing' ? 'rgba(212,175,55,0.1)' : 'rgba(0,0,0,0.2)', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: runnerSource === 'existing' ? 'var(--gold-primary)' : '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={16} /> Option A: Existing Leads
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '5px 0 0' }}>Run signal analysis on leads already in your central database.</p>
                  </div>
                  <div
                    onClick={() => setRunnerSource('fresh')}
                    style={{
                      padding: '1rem', borderRadius: '10px', border: `1px solid ${runnerSource === 'fresh' ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)'}`,
                      background: runnerSource === 'fresh' ? 'rgba(212,175,55,0.1)' : 'rgba(0,0,0,0.2)', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: runnerSource === 'fresh' ? 'var(--gold-primary)' : '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Search size={16} /> Option B: Fresh Scrape
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '5px 0 0' }}>Scrape new businesses from multiple live sources, then run signals.</p>
                  </div>
                </div>
              </div>

              {runnerSource === 'fresh' && (
                <div className="animate-fade-in" style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <label style={{ color: 'var(--gold-primary)', fontWeight: 700, fontSize: '0.95rem', marginBottom: '1rem', display: 'block' }}>
                    Step 2 — Fresh Scrape Configuration
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="pi-form-field">
                      <label>Industry</label>
                      <input type="text" value={freshIndustry} onChange={e => setFreshIndustry(e.target.value)} placeholder="e.g. real estate" />
                    </div>
                    <div className="pi-form-field">
                      <label>Location</label>
                      <input type="text" value={freshLocation} onChange={e => setFreshLocation(e.target.value)} placeholder="e.g. London, UK" />
                    </div>
                    <div className="pi-form-field">
                      <label>Number of Businesses</label>
                      <input type="number" value={scrapeMax} onChange={e => setScrapeMax(Number(e.target.value))} min={5} max={100} />
                    </div>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff', marginBottom: '8px', display: 'block' }}>Sources to scrape from:</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                      {availableSources.map(src => (
                        <label key={src} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={freshSources.includes(src)}
                            onChange={e => setFreshSources(prev => e.target.checked ? [...prev, src] : prev.filter(s => s !== src))}
                          />
                          {src}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button
                  onClick={runnerSource === 'existing' ? handleSignalScan : handleScrape}
                  disabled={scraping || scanning || (runnerSource === 'fresh' && (!freshIndustry || !freshLocation))}
                  style={{
                    margin: 0, width: 'auto', padding: '0.85rem 2rem', background: 'var(--gold-primary)', color: '#000',
                    fontWeight: 800, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', transform: 'scale(1.02)'
                  }}
                >
                  {(scraping || scanning) ? <Loader size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                  {runnerSource === 'existing' ? 'Run Signal Detection' : 'Start Fresh Scrape & Analysis'}
                </button>
              </div>

              {(scrapeStatus || scanning) && (
                <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Loader size={16} className="animate-spin" style={{ color: '#60a5fa' }} />
                  <span style={{ fontSize: '0.85rem', color: '#60a5fa', fontWeight: 600 }}>{scrapeStatus || 'Scoring leads against intelligence detection plan…'}</span>
                </div>
              )}
            </div>

            {/* Strategy Context (Original Cards) */}
            <div style={{ marginTop: '1.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '1rem', display: 'block', textTransform: 'uppercase' }}>
                AI Strategy Guidance
              </label>
              <div className="pi-source-grid">
                {(data.section3_lead_sources || []).map((src, i) => (
                  <div key={i} style={{
                    background: src.is_primary ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${src.is_primary ? 'rgba(212,175,55,0.25)' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: '8px', padding: '0.85rem 1rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {src.is_primary && <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--gold-primary)', background: 'rgba(212,175,55,0.15)', padding: '1px 6px', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.3)' }}>PRIMARY</span>}
                        <strong style={{ fontSize: '0.88rem', color: src.is_primary ? 'var(--gold-primary)' : '#fff' }}>{src.platform}</strong>
                      </div>
                      <span style={{
                        fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: '10px',
                        color: src.estimated_volume === 'high' ? '#39ff14' : src.estimated_volume === 'medium' ? '#ffdf00' : '#a78bfa',
                        background: src.estimated_volume === 'high' ? 'rgba(57,255,20,0.1)' : src.estimated_volume === 'medium' ? 'rgba(255,223,0,0.1)' : 'rgba(167,139,250,0.1)',
                        border: `1px solid ${src.estimated_volume === 'high' ? 'rgba(57,255,20,0.3)' : src.estimated_volume === 'medium' ? 'rgba(255,223,0,0.3)' : 'rgba(167,139,250,0.3)'}`
                      }}>{src.estimated_volume} volume</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '0.5rem' }}>
                      <Search size={12} style={{ color: 'var(--gold-primary)', marginTop: '3px' }} />
                      <code style={{ fontSize: '0.78rem', color: 'var(--gold-primary)', fontWeight: 600 }}>{src.search_keyword}</code>
                    </div>
                    <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{src.why}</p>
                    {src.decision_maker && (
                      <div style={{ marginTop: '8px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.18)', borderRadius: '6px', padding: '0.5rem 0.7rem' }}>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Users size={9} /> Decision Maker to Target
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>{src.decision_maker.job_title}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </AccordionSection>

          {/* ── RESULTS TABLE ─────────────────────────────────────────────── */}
          {(scoredLeads.length > 0 || scanning) && (
            <div className="card pi-results-card">
              <div className="pi-results-toolbar">
                <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BarChart2 size={17} style={{ color: 'var(--gold-primary)' }} /> Scored Leads
                  <span className="badge" style={{ margin: 0 }}>{filteredScored.length} / {scoredLeads.length}</span>
                </h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Confidence threshold */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Min score:</span>
                    <input type="range" min={0} max={100} value={confThreshold} onChange={e => setConfThreshold(Number(e.target.value))}
                      style={{ width: '100px', accentColor: 'var(--gold-primary)' }} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--gold-primary)', fontWeight: 700, minWidth: '30px' }}>{confThreshold}%</span>
                  </div>
                  {/* Pain point filter */}
                  <select value={filterPainPoint} onChange={e => setFilterPainPoint(e.target.value)}
                    style={{ height: '32px', fontSize: '0.78rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '6px', padding: '0 8px', width: 'auto' }}>
                    <option value="all">All Pain Points</option>
                    {painTitles.map((pt, i) => <option key={i} value={pt}>{pt}</option>)}
                  </select>
                  {/* Export */}
                  <button onClick={handleExportCSV}
                    style={{ margin: 0, width: 'auto', padding: '5px 12px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', transform: 'none', boxShadow: 'none' }}>
                    <Download size={13} /> Export CSV
                  </button>
                  {/* Send to Outreach */}
                  {onSendToOutreach && selectedLeads.size > 0 && (
                    <button onClick={handleSendToOutreach}
                      style={{ margin: 0, width: 'auto', padding: '5px 12px', fontSize: '0.78rem', background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.35)', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '5px', transform: 'none', boxShadow: 'none' }}>
                      <Send size={13} /> Send {selectedLeads.size} to Outreach
                    </button>
                  )}
                </div>
              </div>

              {scanning ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '2rem', color: 'var(--text-muted)' }}>
                  <Loader size={20} className="animate-spin" style={{ color: '#a78bfa' }} /> Running signal scan across {(scrapeLeads.length || globalLeads.length)} leads…
                </div>
              ) : (
                <>
                  <div className="pi-table-scroll">
                    <table className="pi-results-table">
                      <thead>
                        <tr>
                          <th style={thStyle}><input type="checkbox" onChange={e => {
                            if (e.target.checked) setSelectedLeads(new Set(filteredScored.map((_, i) => i)));
                            else setSelectedLeads(new Set());
                          }} /></th>
                          <th style={thStyle}>Business & Website</th>
                          <th style={thStyle}>Category</th>
                          <th style={thStyle}>Contact Info</th>
                          <th style={thStyle}>Rating</th>
                          <th style={thStyle}>Signal Score</th>
                          <th style={thStyle}>Evidence & Transformation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredScored.map((lead, idx) => {
                          const name = lead['Business Name'] || lead['business_name'] || '—';
                          const category = lead['Category'] || lead['industry'] || '—';
                          const email = lead['Email'] || lead['email'] || '';
                          const phone = lead['Phone'] || lead['phone'] || '';
                          const website = lead['Website'] || lead['website'] || '';
                          const score = lead._overall || 0;

                          // Hot/Warm/Cold
                          let rating = { label: 'COLD', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' };
                          if (score >= 80) rating = { label: 'HOT', color: '#ff4d4d', bg: 'rgba(255, 77, 77, 0.15)' };
                          else if (score >= 45) rating = { label: 'WARM', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' };

                          const isSelected = selectedLeads.has(idx);
                          return (
                            <tr key={idx} style={{ background: isSelected ? 'rgba(212,175,55,0.05)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={tdStyle}>
                                <input type="checkbox" checked={isSelected} onChange={e => {
                                  const ns = new Set(selectedLeads);
                                  e.target.checked ? ns.add(idx) : ns.delete(idx);
                                  setSelectedLeads(ns);
                                }} />
                              </td>
                              <td style={tdStyle}>
                                <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>{name}</div>
                                {website && website !== 'N/A' && <a href={website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.72rem', color: 'var(--gold-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px', opacity: 0.8 }}>
                                  <LinkIcon size={10} /> {website.replace(/^https?:\/\//, '').split('/')[0]}
                                </a>}
                              </td>
                              <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>{category}</span>
                              </td>
                              <td style={tdStyle}>
                                {email && email !== 'N/A' ? (
                                  <div style={{ fontSize: '0.75rem', color: '#fff', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Mail size={10} style={{ color: 'var(--gold-primary)' }} /> {email}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '0.7rem', color: '#ff6b6b', fontStyle: 'italic' }}>Email missing</div>
                                )}
                                {phone && phone !== 'N/A' && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Phone size={10} /> {phone}
                                </div>}
                              </td>
                              <td style={tdStyle}>
                                <div style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '6px',
                                  background: rating.bg, color: rating.color, border: `1px solid ${rating.color}44`, fontWeight: 800, fontSize: '0.68rem', letterSpacing: '0.5px'
                                }}>
                                  <Zap size={10} fill="currentColor" /> {rating.label}
                                </div>
                              </td>
                              <td style={tdStyle}>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>{score}%</div>
                                <div style={{ width: '60px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '4px', position: 'relative' }}>
                                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${score}%`, background: rating.color, borderRadius: '2px' }} />
                                </div>
                              </td>
                              <td style={{ ...tdStyle, width: '400px', padding: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  {/* Evidence */}
                                  <div>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--gold-primary)', textTransform: 'uppercase', marginBottom: '4px' }}>Signal Evidence</div>
                                    <div style={{ fontSize: '0.78rem', color: '#e0e0e0', lineHeight: 1.4, background: 'rgba(212,175,55,0.06)', padding: '6px', borderRadius: '6px', borderLeft: '3px solid var(--gold-primary)' }}>
                                      {lead['Signal Evidence'] || lead.signal_evidence || 'No direct evidence captured. Auto-scored based on tech detection.'}
                                    </div>
                                  </div>
                                  {/* Process */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <div>
                                      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Current Process</div>
                                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
                                        {lead['Current Process'] || lead.current_process || 'Manual handling…'}
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#39ff14', textTransform: 'uppercase' }}>After Chatbot</div>
                                      <div style={{ fontSize: '0.72rem', color: 'rgba(57,255,20,0.8)', marginTop: '2px' }}>
                                        {lead['After Chatbot'] || lead.after_chatbot || 'Real-time automation…'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredScored.length === 0 && (
                      <div style={{ padding: '3rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginTop: '1rem' }}>
                        <Database size={30} style={{ color: 'rgba(255,255,255,0.1)', marginBottom: '1rem' }} />
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          No leads found matching your criteria. Try adjusting the score slider or run a fresh scrape.
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="pi-mobile-leads">
                {filteredScored.map((lead, idx) => {
                  const name = lead['Business Name'] || lead['business_name'] || '—';
                  const industry = lead['Industry'] || lead['industry'] || '—';
                  const email = lead['Email'] || lead['email'] || '';
                  const phone = lead['Phone'] || lead['phone'] || '';
                  const website = lead['Website'] || lead['website'] || '';
                  const isSelected = selectedLeads.has(idx);
                  return (
                    <div key={idx} className={`pi-lead-card${isSelected ? ' pi-lead-card--selected' : ''}`}>
                      <div className="pi-lead-card-top">
                        <label className="pi-lead-check">
                          <input type="checkbox" checked={isSelected} onChange={e => {
                            const ns = new Set(selectedLeads);
                            e.target.checked ? ns.add(idx) : ns.delete(idx);
                            setSelectedLeads(ns);
                          }} />
                        </label>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="pi-lead-name">{name}</div>
                          <div className="pi-lead-meta">{industry}</div>
                        </div>
                        <ConfBadge score={lead._overall} />
                      </div>
                      {(email || phone) && (
                        <div className="pi-lead-contact">
                          {email && email !== 'N/A' && <span>✉ {email}</span>}
                          {phone && phone !== 'N/A' && <span>☎ {phone}</span>}
                        </div>
                      )}
                      {website && website !== 'N/A' && (
                        <a href={website} target="_blank" rel="noopener noreferrer" className="pi-lead-website">
                          <Globe size={10} /> {website.replace(/^https?:\/\//, '').slice(0, 40)}
                        </a>
                      )}
                      <div className="pi-lead-scores">
                        {painTitles.map((pt, pi) => {
                          const pData = lead._perPainPoint?.[pt] || {};
                          const score = pData.score || 0;
                          const evidence = pData.evidence || '';
                          const cc2 = getConfColor(score);
                          return (
                            <div key={pi} className="pi-lead-score-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                <span className="pi-lead-score-label" title={pt}>{pt}</span>
                                <span style={{ color: cc2.text, fontWeight: 700, fontSize: '0.78rem' }}>{score}%</span>
                              </div>
                              {evidence && score > 0 && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '4px', borderLeft: `2px solid ${cc2.text}`, width: '100%' }}>
                                  {evidence}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Transformation Logic */}
                      {(lead['Current Process'] || lead['After Chatbot']) && (
                        <div className="pi-lead-transformation" style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(212,175,55,0.05)', borderRadius: '8px', border: '1px solid rgba(212,175,55,0.1)' }}>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 700 }}>Current Process</div>
                              <div style={{ fontSize: '0.78rem', color: '#ff6b6b' }}>{lead['Current Process'] || 'Manual & inefficient workflows.'}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--gold-primary)' }}><ChevronRight size={16} /></div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--gold-primary)', marginBottom: '4px', fontWeight: 700 }}>After Chatbot</div>
                              <div style={{ fontSize: '0.78rem', color: '#39ff14' }}>{lead['After Chatbot'] || 'AI-optimized automation.'}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredScored.length === 0 && (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No leads above {confThreshold}% confidence.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* EMPTY STATE */}
      {!data && !loading && (
        <div className="pi-empty-state" style={{ padding: '4rem 2rem', textAlign: 'center', opacity: 0.6 }}>
          <Zap size={48} style={{ color: 'var(--gold-primary)', marginBottom: '1rem', opacity: 0.3 }} />
          <h4 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Enter a technology or keyword above</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>
            AI will generate a custom signal detection plan, identify lead sources, and scan for pain points automatically.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Table styles ──────────────────────────────────────────────────────────────
const thStyle = {
  padding: '0.7rem 0.85rem', background: '#141417', color: 'var(--gold-primary)',
  fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.8px',
  borderBottom: '2px solid rgba(212,175,55,0.2)', textAlign: 'left', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, zIndex: 5
};
const tdStyle = {
  padding: '0.65rem 0.85rem', borderBottom: '1px solid rgba(255,255,255,0.04)',
  fontSize: '0.82rem', color: 'var(--text-main)', verticalAlign: 'top'
};

// ── Mini signal card (compact version for Section 2) ─────────────────────────
function MiniSignalCard({ sig, accent }) {
  return (
    <div style={{ background: `${accent}08`, border: `1px solid ${accent}1a`, borderRadius: '7px', padding: '0.6rem 0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px', marginBottom: '0.35rem' }}>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-start', flex: 1 }}>
          <Eye size={11} style={{ color: accent, marginTop: '2px', flexShrink: 0 }} />
          <span style={{ fontSize: '0.79rem', color: '#e0e0e0', lineHeight: 1.4 }}>{sig.signal}</span>
        </div>
        {sig.weight != null && (
          <span style={{ fontSize: '0.65rem', fontWeight: 800, color: accent, background: `${accent}18`, padding: '1px 6px', borderRadius: '10px', border: `1px solid ${accent}33`, flexShrink: 0 }}>
            {sig.weight}%
          </span>
        )}
      </div>
      {sig.sources && sig.sources.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '16px' }}>
          {sig.sources.map((src, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '5px', padding: '0.35rem 0.55rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#fff' }}>{src.name}</span>
                <span style={{
                  fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', padding: '1px 4px', borderRadius: '3px',
                  background: src.difficulty === 'easy' ? 'rgba(40,167,69,0.15)' : src.difficulty === 'medium' ? 'rgba(255,193,7,0.15)' : 'rgba(220,53,69,0.15)',
                  color: src.difficulty === 'easy' ? '#39ff14' : src.difficulty === 'medium' ? '#ffdf00' : '#ff6b6b',
                  border: `1px solid ${src.difficulty === 'easy' ? 'rgba(40,167,69,0.3)' : src.difficulty === 'medium' ? 'rgba(255,193,7,0.3)' : 'rgba(220,53,69,0.3)'}`
                }}>{src.difficulty}</span>
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                <Search size={9} style={{ color: '#fbbf24', marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{src.how_to_find}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {sig.confirmed_if && (
        <div style={{ paddingLeft: '16px', marginTop: '4px' }}>
          <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-start', background: 'rgba(40,167,69,0.06)', border: '1px solid rgba(40,167,69,0.15)', borderRadius: '5px', padding: '0.35rem 0.55rem' }}>
            <CheckCircle size={10} style={{ color: '#39ff14', marginTop: '2px', flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: '#39ff14', fontWeight: 700, letterSpacing: '0.4px' }}>Confirmed if</span>
              <div style={{ fontSize: '0.72rem', color: '#a7f3d0', marginTop: '1px', lineHeight: 1.4 }}>{sig.confirmed_if}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
