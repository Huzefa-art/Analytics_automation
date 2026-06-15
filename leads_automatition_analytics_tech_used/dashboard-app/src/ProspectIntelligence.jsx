import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Zap, AlertCircle, Shield, Target, BarChart2, Search, Globe,
  Users, CheckCircle, XCircle, HelpCircle, Loader, Download,
  ChevronDown, ChevronUp, ChevronRight, RefreshCw, Play, Mail,
  Phone, LinkIcon, ExternalLink, Filter, TrendingUp, Activity,
  MapPin, Star, Copy, Clock, X
} from 'lucide-react';

const API = '/api';

// ── Score colours ─────────────────────────────────────────────────────────────
function scoreColor(n) {
  if (n >= 70) return { text: '#ff5020', bg: 'rgba(255,80,32,0.12)', border: 'rgba(255,80,32,0.35)', label: 'HOT' };
  if (n >= 40) return { text: '#ffdf00', bg: 'rgba(255,223,0,0.1)', border: 'rgba(255,223,0,0.3)', label: 'WARM' };
  if (n > 0)   return { text: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.25)', label: 'COLD' };
  return { text: '#555', bg: 'rgba(80,80,80,0.1)', border: 'rgba(80,80,80,0.2)', label: 'N/A' };
}

function ScoreBadge({ score }) {
  const c = scoreColor(score);
  return (
    <span style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: '0.68rem', fontWeight: 800, padding: '2px 9px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
      {score}% · {c.label}
    </span>
  );
}

function FreqBadge({ freq }) {
  const colors = { 'very common': '#ff6b6b', common: '#ffdf00', occasional: '#a78bfa' };
  const c = colors[(freq || '').toLowerCase()] || '#888';
  return (
    <span style={{ background: `${c}18`, border: `1px solid ${c}44`, color: c, fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', textTransform: 'uppercase' }}>
      {freq}
    </span>
  );
}

function ConfirmBadge({ confirmed }) {
  if (confirmed === 'yes') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#39ff14', fontSize: '0.7rem', fontWeight: 700 }}><CheckCircle size={11} /> Confirmed</span>;
  if (confirmed === 'no') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#ff6b6b', fontSize: '0.7rem', fontWeight: 700 }}><XCircle size={11} /> Not confirmed</span>;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#888', fontSize: '0.7rem', fontWeight: 700 }}><HelpCircle size={11} /> Unable to check</span>;
}

// ── Sub-tab bar ───────────────────────────────────────────────────────────────
const TABS = [
  { icon: AlertCircle, label: 'Pain Points', color: '#ff6b6b' },
  { icon: Shield, label: 'Signal Plans', color: '#a78bfa' },
  { icon: Target, label: 'Lead Extraction', color: '#39ff14' },
  { icon: BarChart2, label: 'Signal Analyzer', color: 'var(--gold-primary)' },
];

function SubTabBar({ active, setActive, readiness }) {
  return (
    <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.25)', padding: '5px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
      {TABS.map((t, i) => {
        const Icon = t.icon;
        const isActive = active === i;
        const ready = readiness[i];
        return (
          <button key={i} onClick={() => setActive(i)} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '0.65rem 0.5rem', borderRadius: '9px', border: 'none', cursor: 'pointer',
            background: isActive ? `${t.color}18` : 'transparent',
            borderTop: isActive ? `2px solid ${t.color}` : '2px solid transparent',
            color: isActive ? t.color : 'var(--text-muted)',
            fontSize: '0.78rem', fontWeight: isActive ? 700 : 400,
            transition: 'all 0.15s ease', position: 'relative',
          }}>
            <Icon size={14} />
            <span className="pi-v2-subtab-label" style={{ whiteSpace: 'nowrap' }}>{t.label}</span>
            {ready && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#39ff14', position: 'absolute', top: '5px', right: '5px' }} />}
          </button>
        );
      })}
    </div>
  );
}

// ── Loading bar ───────────────────────────────────────────────────────────────
function ProgressBar({ current, total, label }) {
  const pct = total > 0 ? Math.round(current / total * 100) : 0;
  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '0.78rem', color: '#60a5fa' }}>{label}</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--gold-primary)', fontWeight: 700 }}>{current}/{total} ({pct}%)</span>
      </div>
      <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--gold-primary), #ff6b6b)', borderRadius: '3px', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

// ── History Panel ─────────────────────────────────────────────────────────────
function HistoryPanel({ onLoad }) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState('');

  const fetchHistory = async () => {
    setFetching(true);
    setError('');
    try {
      const res = await axios.get(`${API}/prospect-intel/v2/history`);
      setSessions(res.data || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load history — check DB connection');
    } finally {
      setFetching(false);
    }
  };

  // Auto-fetch on mount so history is ready immediately
  useEffect(() => { fetchHistory(); }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchHistory();
  };

  const loadSession = async (sid) => {
    setLoadingId(sid);
    try {
      const [metaRes] = await Promise.all([
        axios.get(`${API}/prospect-intel/v2/session/${sid}`),
      ]);
      const meta = metaRes.data;

      let leads = [];
      let analyzed = [];

      if (meta.leads_count > 0) {
        try {
          const lr = await axios.get(`${API}/prospect-intel/v2/leads/${sid}`);
          leads = lr.data.leads || [];
        } catch {}
      }
      if (meta.analyzed_count > 0) {
        try {
          const ar = await axios.get(`${API}/prospect-intel/v2/analyzed/${sid}`);
          // normalize column names from DB to frontend format
          analyzed = (ar.data.results || []).map(r => ({
            ...r,
            signal_evidence: typeof r.signal_evidence === 'string'
              ? JSON.parse(r.signal_evidence || '[]')
              : (r.signal_evidence || []),
            score_reason: r.score_reason || '',
            extraction_mode: r.extraction_mode || 'leads_first',
            signal_trigger: r.signal_trigger || '',
            signal_confirmed: r.signal_confirmed || false,
          }));
        } catch {}
      }

      onLoad(meta, leads, analyzed);
      setOpen(false);
    } catch (e) {
      setError('Failed to load session');
    } finally {
      setLoadingId(null);
    }
  };

  const fmtDate = (s) => {
    try { return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return s; }
  };

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={toggle} style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: '0.78rem', color: open ? 'var(--gold-primary)' : 'var(--text-muted)',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          padding: '5px 12px', borderRadius: '8px', transition: 'all 0.15s',
        }}>
          <Clock size={13} /> History {open ? <X size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {open && (
        <div className="card" style={{ marginTop: '0.5rem', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold-primary)' }}>Previous Sessions</span>
            <button onClick={fetchHistory} disabled={fetching} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}>
              <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {error && <div style={{ color: '#ff6b6b', fontSize: '0.78rem', marginBottom: '0.5rem' }}>{error}</div>}

          {fetching && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              <Loader size={14} className="animate-spin" /> Loading history...
            </div>
          )}

          {!fetching && sessions.length === 0 && (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              No previous sessions found. Complete the pipeline to save history.
            </div>
          )}

          {!fetching && sessions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
              {sessions.map((s) => (
                <div key={s.session_id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                  padding: '0.6rem 0.85rem', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.technology || '(no tech)'}{s.industry ? ` · ${s.industry}` : ''}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>{fmtDate(s.updated_at)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {s.leads_count > 0 && (
                      <span style={{ fontSize: '0.62rem', background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.25)', color: '#39ff14', padding: '1px 7px', borderRadius: '10px' }}>
                        {s.leads_count} leads
                      </span>
                    )}
                    {s.analyzed_count > 0 && (
                      <span style={{ fontSize: '0.62rem', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', color: 'var(--gold-primary)', padding: '1px 7px', borderRadius: '10px' }}>
                        {s.analyzed_count} analyzed
                      </span>
                    )}
                  </div>
                  <button onClick={() => loadSession(s.session_id)} disabled={loadingId === s.session_id}
                    style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold-primary)', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', padding: '4px 12px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                    {loadingId === s.session_id ? <Loader size={11} className="animate-spin" /> : <ChevronRight size={11} />}
                    Load
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-tab 1: Pain Points ────────────────────────────────────────────────────
function PainPointsTab({ onDone, existingData }) {
  const [tech, setTech] = useState(existingData?.technology || '');
  const [industry, setIndustry] = useState(existingData?.industry || '');
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(existingData || null);
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const generate = async () => {
    if (!tech.trim()) return;
    setLoading(true);
    setError('');
    setProgress('Starting...');
    try {
      const res = await axios.post(`${API}/prospect-intel/v2/pain-points`, {
        technology: tech.trim(),
        industry: industry.trim(),
        departments: depts,
      });
      // If server already returned full result (old sync format), use it directly
      if (res.data.pain_points?.length) {
        setResult(res.data);
        onDone(res.data);
        setLoading(false);
        return;
      }
      const sid = res.data.session_id;
      pollRef.current = setInterval(async () => {
        try {
          const st = await axios.get(`${API}/prospect-intel/v2/pain-points/status/${sid}`);
          if (st.data.progress) setProgress(st.data.progress);
          if (st.data.done) {
            clearInterval(pollRef.current);
            setLoading(false);
            if (st.data.error) {
              setError(st.data.error);
            } else {
              setResult(st.data.result);
              onDone(st.data.result);
            }
          }
        } catch {
          clearInterval(pollRef.current);
          setLoading(false);
          setError('Lost connection while polling.');
        }
      }, 3000);
    } catch (e) {
      setLoading(false);
      setError(e?.response?.data?.detail || e?.message || 'Generation failed');
    }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="pi-v2-grid-2" style={{ gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold-primary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Technology / Keyword <span style={{ color: '#ff6b6b' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <Zap size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--gold-primary)' }} />
              <input value={tech} onChange={e => setTech(e.target.value)}
                placeholder="e.g. chatbots, voice agents, website design"
                onKeyDown={e => e.key === 'Enter' && generate()}
                style={{ paddingLeft: '30px', width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Industry
            </label>
            <div style={{ position: 'relative' }}>
              <Globe size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input value={industry} onChange={e => setIndustry(e.target.value)}
                placeholder="e.g. restaurants, real estate, dental"
                style={{ paddingLeft: '28px', width: '100%' }} />
            </div>
          </div>
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '8px' }}>
          <button onClick={generate} disabled={loading || !tech.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--gold-primary)', color: '#000', fontWeight: 800, border: 'none', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer', width: 'auto', margin: 0 }}>
            {loading ? <Loader size={15} className="animate-spin" /> : <Search size={15} />}
            {loading ? 'Researching...' : 'Generate Pain Points'}
          </button>
          {result && (
            <button onClick={generate} disabled={loading}
              title="Regenerate fresh" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', width: 'auto', margin: 0 }}>
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        {result?.web_research_used && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.68rem', color: '#39ff14', background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.2)', padding: '2px 8px', borderRadius: '12px' }}>
              ✓ Reddit: {result.reddit_posts_found} posts analysed
            </span>
            <span style={{ fontSize: '0.68rem', color: '#60a5fa', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', padding: '2px 8px', borderRadius: '12px' }}>
              ✓ Indeed: {result.indeed_jobs_found} job postings analysed
            </span>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', color: '#ff6b6b', marginBottom: '1rem', display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.85rem' }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />{error}
        </div>
      )}

      {loading && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2.5rem', gap: '0.75rem' }}>
          <Loader size={28} className="animate-spin" style={{ color: 'var(--gold-primary)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{progress || 'Searching Reddit, Indeed, and synthesising with AI...'}</span>
        </div>
      )}

      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(result.pain_points || []).map((pp, i) => (
            <div key={i} className="card" style={{ borderLeft: '3px solid #ff6b6b', padding: '1rem 1.1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '0.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: 'rgba(255,107,107,0.15)', color: '#ff6b6b', fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: '20px' }}>#{i + 1}</span>
                  <strong style={{ color: 'var(--gold-primary)', fontSize: '0.95rem' }}>{pp.title}</strong>
                </div>
                <FreqBadge freq={pp.frequency} />
              </div>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.65 }}>{pp.description}</p>
              <div className="pi-v2-grid-2" style={{ gap: '8px', marginBottom: '0.5rem' }}>
                <div style={{ background: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.15)', borderRadius: '7px', padding: '0.55rem 0.75rem' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#39ff14', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Revenue Impact</div>
                  <div style={{ fontSize: '0.82rem', color: '#a7f3d0' }}>{pp.revenue_impact}</div>
                </div>
                <div style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: '7px', padding: '0.55rem 0.75rem' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>Why Tech Solves It</div>
                  <div style={{ fontSize: '0.82rem', color: '#ddd6fe' }}>{pp.why_tech_solves}</div>
                </div>
              </div>
              {pp.job_titles?.length > 0 && (
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Feels this pain:</span>
                  {pp.job_titles.map((jt, ji) => (
                    <span key={ji} style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', fontSize: '0.68rem', padding: '1px 7px', borderRadius: '10px' }}>
                      {jt}
                    </span>
                  ))}
                </div>
              )}
              {pp.web_evidence && (
                <div style={{ marginTop: '0.5rem', background: 'rgba(57,255,20,0.04)', border: '1px solid rgba(57,255,20,0.12)', borderRadius: '6px', padding: '0.4rem 0.65rem', fontSize: '0.72rem', color: '#86efac' }}>
                  <span style={{ color: '#39ff14', fontWeight: 700 }}>Web evidence:</span> {pp.web_evidence}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!result && !loading && (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', opacity: 0.5 }}>
          <AlertCircle size={40} style={{ color: '#ff6b6b', marginBottom: '1rem', opacity: 0.3 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Enter a technology above to generate pain points backed by live web research.</p>
        </div>
      )}
    </div>
  );
}

// ── Sub-tab 2: Signal Plans ───────────────────────────────────────────────────
function SignalPlansTab({ painData, onDone, existingPlans }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [plans, setPlans] = useState(existingPlans || []);
  const [expanded, setExpanded] = useState({});
  const autoGenRef = useRef(false);
  const pollRef = useRef(null);

  const generate = useCallback(async () => {
    if (!painData?.pain_points?.length) return;
    setLoading(true);
    setError('');
    setProgress('Starting...');
    try {
      const res = await axios.post(`${API}/prospect-intel/v2/signal-plans`, {
        pain_points: painData.pain_points,
        industry: painData.industry || '',
        technology: painData.technology || '',
        session_id: painData.session_id || '',
      });
      // If server already returned full result (old sync format), use it directly
      if (res.data.signal_plans?.length) {
        setPlans(res.data.signal_plans);
        onDone(res.data.signal_plans);
        setLoading(false);
        return;
      }
      const sid = res.data.session_id;
      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const st = await axios.get(`${API}/prospect-intel/v2/signal-plans/status/${sid}`);
          if (st.data.progress) setProgress(st.data.progress);
          if (st.data.done) {
            clearInterval(pollRef.current);
            setLoading(false);
            if (st.data.error) {
              setError(st.data.error);
            } else {
              setPlans(st.data.signal_plans || []);
              onDone(st.data.signal_plans || []);
            }
          }
        } catch {
          clearInterval(pollRef.current);
          setLoading(false);
          setError('Lost connection while polling signal plans.');
        }
      }, 3000);
    } catch (e) {
      setLoading(false);
      setError(e?.response?.data?.detail || e?.message || 'Failed to generate signal plans');
    }
  }, [painData, onDone]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  useEffect(() => {
    if (painData?.pain_points?.length && !existingPlans?.length && !autoGenRef.current) {
      autoGenRef.current = true;
      generate();
    }
  }, [painData, existingPlans, generate]);

  const diffColor = { easy: '#39ff14', medium: '#ffdf00', hard: '#ff6b6b' };

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--gold-primary)' }}>Signal Detection Plans</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {painData?.pain_points?.length
                ? `Auto-generated from ${painData.pain_points.length} pain points in Sub-tab 1`
                : 'Go to Sub-tab 1 and generate pain points first'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {painData?.pain_points?.length > 0 && (
              <button onClick={generate} disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.35)', padding: '0.6rem 1.1rem', borderRadius: '8px', cursor: 'pointer', width: 'auto', margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                {loading ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {plans.length ? 'Regenerate' : 'Generate Plans'}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', color: '#ff6b6b', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2.5rem', gap: '0.75rem' }}>
          <Loader size={28} className="animate-spin" style={{ color: '#a78bfa' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{progress || 'Generating signal detection plans...'}</span>
        </div>
      )}

      {!painData?.pain_points?.length && !loading && (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', opacity: 0.5 }}>
          <Shield size={40} style={{ color: '#a78bfa', marginBottom: '1rem', opacity: 0.3 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Complete Sub-tab 1 first — signal plans are generated from your pain points.</p>
        </div>
      )}

      {plans.length > 0 && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {plans.map((plan, pi) => {
            const isExp = expanded[pi];
            return (
              <div key={pi} className="card" style={{ borderLeft: '3px solid #a78bfa', padding: 0, overflow: 'hidden' }}>
                <div onClick={() => setExpanded(e => ({ ...e, [pi]: !e[pi] }))}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', cursor: 'pointer', background: 'rgba(167,139,250,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={14} style={{ color: '#a78bfa' }} />
                    <strong style={{ color: 'var(--gold-primary)', fontSize: '0.9rem' }}>{plan.pain_point_title || plan.pain_point}</strong>
                    <span style={{ fontSize: '0.68rem', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', color: '#a78bfa', padding: '1px 7px', borderRadius: '10px' }}>
                      {plan.checks?.length || 0} checks
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {plan.decision_maker?.job_title && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', padding: '3px 9px', borderRadius: '8px' }}>
                        <Users size={10} style={{ color: '#60a5fa' }} />
                        <span style={{ fontSize: '0.72rem', color: '#60a5fa', fontWeight: 600 }}>{plan.decision_maker.job_title}</span>
                      </div>
                    )}
                    {isExp ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                </div>
                {isExp && (
                  <div style={{ padding: '0.75rem 1rem 1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {(plan.checks || []).map((chk, ci) => {
                      const dc = diffColor[chk.difficulty] || '#888';
                      const autoCheck = chk.auto_checkable === true || ['live_chat', 'booking', 'contact_form', 'meta_pixel', 'google_analytics', 'cms'].includes(chk.signal_type);
                      return (
                        <div key={ci} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.65rem 0.85rem', marginBottom: ci < plan.checks.length - 1 ? '0.5rem' : 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '6px' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>{chk.check_name}</span>
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: '8px', background: `${dc}15`, color: dc, border: `1px solid ${dc}33` }}>{chk.difficulty}</span>
                              {autoCheck
                                ? <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: '8px', background: 'rgba(57,255,20,0.1)', color: '#39ff14', border: '1px solid rgba(57,255,20,0.25)' }}>AUTO ✓</span>
                                : <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: '8px', background: 'rgba(255,223,0,0.1)', color: '#ffdf00', border: '1px solid rgba(255,223,0,0.25)' }}>MANUAL</span>
                              }
                            </div>
                          </div>
                          <div className="pi-v2-grid-2" style={{ gap: '6px', fontSize: '0.75rem' }}>
                            <div><span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.58rem', fontWeight: 700 }}>Where: </span><span style={{ color: '#e0e0e0' }}>{chk.where_to_look}</span></div>
                            <div><span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.58rem', fontWeight: 700 }}>Search: </span><span style={{ color: '#e0e0e0' }}>{chk.what_to_search}</span></div>
                          </div>
                          <div style={{ marginTop: '5px', display: 'flex', gap: '5px', alignItems: 'flex-start', background: 'rgba(57,255,20,0.04)', border: '1px solid rgba(57,255,20,0.12)', borderRadius: '5px', padding: '0.35rem 0.55rem' }}>
                            <CheckCircle size={10} style={{ color: '#39ff14', marginTop: '2px', flexShrink: 0 }} />
                            <div style={{ fontSize: '0.72rem', color: '#86efac' }}><strong style={{ color: '#39ff14' }}>Confirmed if:</strong> {chk.confirmed_if}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sub-tab 3: Lead Extraction ────────────────────────────────────────────────
const SOURCES = ['Google Maps', 'Yellow Pages', 'Companies House UK', 'Bark.com', 'LinkedIn', 'Facebook Business'];

function LeadExtractionTab({ onDone, existingLeads, masterSessionId, signalPlans }) {
  const [extractionMode, setExtractionMode] = useState('leads_first');
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('');
  const [numLeads, setNumLeads] = useState(20);
  const [sources, setSources] = useState(['Google Maps']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [leads, setLeads] = useState(existingLeads || []);
  const [sourceResults, setSourceResults] = useState({});
  const [sessionId, setSessionId] = useState('');
  const pollRef = useRef(null);

  const poll = (sid) => {
    pollRef.current = setInterval(async () => {
      try {
        const st = await axios.get(`${API}/prospect-intel/v2/extract-leads/status/${sid}`);
        if (st.data.done) {
          clearInterval(pollRef.current);
          setLoading(false);
          setLeads(st.data.leads || []);
          setSourceResults(st.data.source_results || {});
          onDone(st.data.leads || [], sid);
        }
      } catch {
        clearInterval(pollRef.current);
        setLoading(false);
        setError('Lost connection while polling. Refresh to check results.');
      }
    }, 3000);
  };

  const extract = async () => {
    if (!industry.trim() || !location.trim()) return;
    if (extractionMode === 'signal_first' && (!signalPlans || !signalPlans.length)) {
      setError('Signal First mode requires signal plans from Sub-tab 2. Please complete Sub-tab 2 first.');
      return;
    }
    setLoading(true);
    setError('');
    setLeads([]);
    setSourceResults({});

    if (extractionMode === 'leads_first') {
      try {
        const res = await axios.post(`${API}/prospect-intel/v2/extract-leads`, {
          industry: industry.trim(),
          location: location.trim(),
          num_leads: numLeads,
          sources,
          session_id: masterSessionId || '',
        });
        setSessionId(res.data.session_id);
        poll(res.data.session_id);
      } catch (e) {
        setLoading(false);
        setError(e?.response?.data?.detail || e?.message || 'Lead extraction failed');
      }
    } else {
      try {
        const res = await axios.post(`${API}/prospect-intel/v2/extract-leads-signal-first`, {
          industry: industry.trim(),
          location: location.trim(),
          num_leads: numLeads,
          signal_plans: signalPlans,
          session_id: masterSessionId || '',
        });
        setSessionId(res.data.session_id);
        poll(res.data.session_id);
      } catch (e) {
        setLoading(false);
        setError(e?.response?.data?.detail || e?.message || 'Signal First extraction failed');
      }
    }
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const exportCSV = () => {
    const headers = ['Business Name', 'Website', 'Phone', 'Email', 'Rating', 'Reviews', 'Category', 'Location', 'Source', 'Duplicate?'];
    const rows = leads.map(l => [l.business_name, l.website, l.phone, l.email, l.rating, l.review_count, l.category, l.location, l.source, l.is_duplicate ? 'Yes' : 'No']);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `pi_leads_${Date.now()}.csv`; a.click();
  };

  const unique = leads.filter(l => !l.is_duplicate).length;
  const dups = leads.filter(l => l.is_duplicate).length;

  return (
    <div>
      {/* Extraction Mode Toggle */}
      <div style={{ marginBottom: '1rem', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>Extraction Mode</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => setExtractionMode('leads_first')} style={{
            flex: 1, padding: '0.65rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: extractionMode === 'leads_first' ? 'rgba(57,255,20,0.1)' : 'rgba(255,255,255,0.03)',
            borderTop: extractionMode === 'leads_first' ? '2px solid #39ff14' : '2px solid transparent',
            color: extractionMode === 'leads_first' ? '#39ff14' : 'var(--text-muted)',
            fontWeight: extractionMode === 'leads_first' ? 700 : 400, fontSize: '0.82rem', textAlign: 'left', margin: 0, width: 'auto',
          }}>
            <div style={{ fontWeight: 700, marginBottom: '2px' }}>Mode A — Leads First</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.75 }}>Scrape businesses by industry &amp; location, then run signal checks</div>
          </button>
          <button type="button" onClick={() => setExtractionMode('signal_first')} style={{
            flex: 1, padding: '0.65rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: extractionMode === 'signal_first' ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.03)',
            borderTop: extractionMode === 'signal_first' ? '2px solid #a78bfa' : '2px solid transparent',
            color: extractionMode === 'signal_first' ? '#a78bfa' : 'var(--text-muted)',
            fontWeight: extractionMode === 'signal_first' ? 700 : 400, fontSize: '0.82rem', textAlign: 'left', margin: 0, width: 'auto',
          }}>
            <div style={{ fontWeight: 700, marginBottom: '2px' }}>Mode B — Signal First</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.75 }}>Find businesses already showing the pain on Indeed, Reddit &amp; News</div>
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="pi-v2-grid-1-1-auto" style={{ gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold-primary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Industry <span style={{ color: '#ff6b6b' }}>*</span></label>
            <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. restaurants, dental, real estate" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Location <span style={{ color: '#ff6b6b' }}>*</span></label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. London UK, New York NY" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Max Leads</label>
            <input type="number" value={numLeads} onChange={e => setNumLeads(Number(e.target.value))} min={5} max={100} style={{ width: '100px' }} />
          </div>
        </div>

        {extractionMode === 'leads_first' && (
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sources</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {SOURCES.map(src => {
                const sel = sources.includes(src);
                const automated = ['Google Maps', 'Yellow Pages', 'Companies House UK'].includes(src);
                return (
                  <button key={src} type="button" onClick={() => setSources(prev => sel ? prev.filter(s => s !== src) : [...prev, src])}
                    style={{
                      margin: 0, width: 'auto', padding: '5px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: sel ? 700 : 400,
                      background: sel ? 'rgba(57,255,20,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${sel ? 'rgba(57,255,20,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      color: sel ? '#39ff14' : 'var(--text-muted)',
                      cursor: 'pointer', transform: 'none', boxShadow: 'none', textTransform: 'none', letterSpacing: 0,
                    }}>
                    {src} {!automated && <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>(manual)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {extractionMode === 'signal_first' && (
          <div style={{ marginTop: '0.85rem' }}>
            {(!signalPlans || !signalPlans.length) ? (
              <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: '8px', padding: '0.65rem 1rem', fontSize: '0.82rem', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={14} /> Signal First requires signal plans from Sub-tab 2 — complete Sub-tab 2 first, then return here.
              </div>
            ) : (
              <div style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: '8px', padding: '0.65rem 1rem', fontSize: '0.78rem', color: '#a78bfa' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>Will scan for these {signalPlans.length} signal plans:</div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {signalPlans.map((p, i) => (
                    <span key={i} style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: '10px', padding: '1px 8px', fontSize: '0.68rem' }}>
                      {p.pain_point_title || p.pain_point || `Plan ${i+1}`}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: '6px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  Sources: Indeed job postings · Reddit (Arctic Shift API) · Google News RSS — all bot-safe, no scraping blocked
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: '1rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={extract}
            disabled={loading || !industry.trim() || !location.trim() || (extractionMode === 'signal_first' && (!signalPlans || !signalPlans.length))}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, border: 'none',
              padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer', width: 'auto', margin: 0,
              background: extractionMode === 'signal_first' ? '#a78bfa' : '#39ff14',
              color: '#000',
            }}>
            {loading ? <Loader size={15} className="animate-spin" /> : <Play size={15} fill="currentColor" />}
            {loading
              ? (extractionMode === 'signal_first' ? 'Scanning signals...' : 'Extracting...')
              : (extractionMode === 'signal_first' ? 'Run Signal First' : 'Extract Leads')}
          </button>
          {leads.length > 0 && (
            <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', width: 'auto', margin: 0, fontSize: '0.82rem' }}>
              <Download size={13} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', color: '#ff6b6b', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2.5rem', gap: '0.75rem' }}>
          <Loader size={28} className="animate-spin" style={{ color: '#39ff14' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {extractionMode === 'signal_first'
              ? 'Scanning Indeed, Reddit & News for businesses showing the pain signal...'
              : 'Scraping leads and hunting emails...'}
          </span>
          <span style={{ fontSize: '0.78rem', color: extractionMode === 'signal_first' ? 'rgba(167,139,250,0.5)' : 'rgba(57,255,20,0.5)' }}>
            {extractionMode === 'signal_first'
              ? 'Searching job boards and enriching company contact data...'
              : 'This may take 1–3 minutes depending on sources'}
          </span>
        </div>
      )}

      {Object.keys(sourceResults).length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {Object.entries(sourceResults).map(([src, r]) => (
            <div key={src} style={{
              background: r.status === 'success' ? 'rgba(57,255,20,0.06)' : 'rgba(255,107,107,0.06)',
              border: `1px solid ${r.status === 'success' ? 'rgba(57,255,20,0.2)' : 'rgba(255,107,107,0.2)'}`,
              borderRadius: '8px', padding: '6px 12px',
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: r.status === 'success' ? '#39ff14' : '#ff6b6b' }}>{src}: {r.count} leads</div>
              {r.status !== 'success' && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{r.status}</div>}
            </div>
          ))}
        </div>
      )}

      {leads.length === 0 && !loading && Object.keys(sourceResults).length > 0 && (
        <div style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, color: '#ff6b6b', marginBottom: '6px', fontSize: '0.9rem' }}>⚠ 0 leads collected</div>
          {Object.entries(sourceResults).some(([, r]) => r.status && r.status.includes('Playwright')) && (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              <b style={{ color: '#ffdf00' }}>Google Maps</b> requires browser automation (Playwright) which is unavailable on this cloud deployment.
            </div>
          )}
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Switch to <b style={{ color: '#a78bfa' }}>Signal First mode</b> (uses Indeed/Reddit/News — no browser needed) or select <b style={{ color: '#39ff14' }}>Yellow Pages</b> as the source instead.
          </div>
        </div>
      )}

      {leads.length > 0 && !loading && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={15} /> {leads.length} Leads
              <span style={{ fontSize: '0.7rem', color: '#39ff14', fontWeight: 600 }}>{unique} unique</span>
              {dups > 0 && <span style={{ fontSize: '0.7rem', color: '#ffdf00', fontWeight: 600 }}>{dups} flagged duplicates</span>}
            </h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {(() => {
              const hasSignalLeads = leads.some(l => l.extraction_mode === 'signal_first');
              const headers = hasSignalLeads
                ? ['Business', 'Website', 'Phone', 'Email', 'Signal Trigger', 'Source', 'Status']
                : ['Business', 'Website', 'Phone', 'Email', 'Rating', 'Category', 'Source', 'Status'];
              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#141417' }}>
                      {headers.map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.85rem', textAlign: 'left', color: 'var(--gold-primary)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.6px', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(212,175,55,0.2)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: l.is_duplicate ? 'rgba(255,223,0,0.03)' : l.extraction_mode === 'signal_first' ? 'rgba(167,139,250,0.02)' : 'transparent' }}>
                        <td style={{ padding: '0.55rem 0.85rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>
                          {l.business_name || '—'}
                          {l.extraction_mode === 'signal_first' && (
                            <span style={{ marginLeft: '6px', fontSize: '0.58rem', background: 'rgba(57,255,20,0.12)', border: '1px solid rgba(57,255,20,0.3)', color: '#39ff14', padding: '1px 5px', borderRadius: '6px' }}>⚡ confirmed</span>
                          )}
                        </td>
                        <td style={{ padding: '0.55rem 0.85rem' }}>
                          {l.website && l.website !== 'N/A' ? (
                            <a href={l.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-secondary)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}>
                              <Globe size={10} /> {l.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].slice(0, 25)}
                            </a>
                          ) : <span style={{ color: '#555' }}>—</span>}
                        </td>
                        <td style={{ padding: '0.55rem 0.85rem', color: 'var(--text-muted)' }}>{l.phone || '—'}</td>
                        <td style={{ padding: '0.55rem 0.85rem' }}>
                          {l.email ? <span style={{ color: '#a7f3d0', fontSize: '0.75rem' }}>{l.email}</span> : <span style={{ color: '#555', fontSize: '0.72rem', fontStyle: 'italic' }}>not found</span>}
                        </td>
                        {hasSignalLeads ? (
                          <td style={{ padding: '0.55rem 0.85rem', maxWidth: '200px' }}>
                            {l.signal_trigger ? (
                              <div>
                                <div style={{ fontSize: '0.7rem', color: '#a78bfa', fontWeight: 600, marginBottom: '2px' }}>{l.signal_trigger}</div>
                                {l.signal_evidence_text && (
                                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }} title={l.signal_evidence_text}>
                                    {l.signal_evidence_text.slice(0, 80)}…
                                  </div>
                                )}
                              </div>
                            ) : <span style={{ color: '#555' }}>—</span>}
                          </td>
                        ) : (
                          <>
                            <td style={{ padding: '0.55rem 0.85rem', color: l.rating ? '#ffdf00' : '#555' }}>
                              {l.rating ? <><Star size={10} style={{ verticalAlign: 'middle' }} /> {l.rating}</> : '—'}
                            </td>
                            <td style={{ padding: '0.55rem 0.85rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>{l.category || '—'}</td>
                          </>
                        )}
                        <td style={{ padding: '0.55rem 0.85rem' }}>
                          <span style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', fontSize: '0.62rem', padding: '1px 6px', borderRadius: '8px' }}>{l.source}</span>
                        </td>
                        <td style={{ padding: '0.55rem 0.85rem' }}>
                          {l.is_duplicate
                            ? <span style={{ fontSize: '0.62rem', color: '#ffdf00', background: 'rgba(255,223,0,0.1)', border: '1px solid rgba(255,223,0,0.25)', padding: '1px 6px', borderRadius: '8px' }}>duplicate</span>
                            : <span style={{ fontSize: '0.62rem', color: '#39ff14', background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.2)', padding: '1px 6px', borderRadius: '8px' }}>unique</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}

      {!leads.length && !loading && (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', opacity: 0.5 }}>
          <Target size={40} style={{ color: '#39ff14', marginBottom: '1rem', opacity: 0.3 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Enter industry and location above to extract leads from live sources.</p>
        </div>
      )}
    </div>
  );
}

// ── Sub-tab 4: Signal Analyzer ────────────────────────────────────────────────
function SignalAnalyzerTab({ leads, signalPlans, technology, industry, onDone, masterSessionId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analyzed, setAnalyzed] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' });
  const [expandedLead, setExpandedLead] = useState(null);
  const [filterScore, setFilterScore] = useState(0);
  const [filterPain, setFilterPain] = useState('all');
  const [filterDM, setFilterDM] = useState('all');
  const [outreachStatus, setOutreachStatus] = useState({});
  const [hotOnly, setHotOnly] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(null);
  const [outreachOffer, setOutreachOffer] = useState('');
  const [outreachEmail, setOutreachEmail] = useState({ subject: '', body: '' });
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachSending, setOutreachSending] = useState(false);
  const [outreachSent, setOutreachSent] = useState({});
  const pollRef = useRef(null);
  const autoRunRef = useRef(false);

  const runAnalysis = async () => {
    if (!leads.length || !signalPlans.length) return;
    setLoading(true);
    setError('');
    setAnalyzed([]);
    setProgress({ current: 0, total: leads.length, msg: 'Starting...' });
    try {
      const res = await axios.post(`${API}/prospect-intel/v2/analyze`, {
        leads,
        signal_plans: signalPlans,
        technology: technology || '',
        industry: industry || '',
        session_id: masterSessionId || '',
      });
      const sid = res.data.session_id;
      setSessionId(sid);
      pollRef.current = setInterval(async () => {
        try {
          const st = await axios.get(`${API}/prospect-intel/v2/analyze/status/${sid}`);
          setProgress({ current: st.data.current || 0, total: st.data.total || leads.length, msg: st.data.progress });
          if (st.data.leads?.length) setAnalyzed(st.data.leads);
          if (st.data.done) {
            clearInterval(pollRef.current);
            setLoading(false);
            setAnalyzed(st.data.leads || []);
            onDone(st.data.leads || []);
          }
        } catch {
          clearInterval(pollRef.current);
          setLoading(false);
        }
      }, 2500);
    } catch (e) {
      setLoading(false);
      setError(e?.response?.data?.detail || e?.message || 'Analysis failed');
    }
  };

  useEffect(() => () => clearInterval(pollRef.current), []);
  useEffect(() => {
    if (leads.length && signalPlans.length && !analyzed.length && !autoRunRef.current) {
      autoRunRef.current = true;
      runAnalysis();
    }
  }, [leads, signalPlans]);

  const painTitles = [...new Set(signalPlans.map(p => p.pain_point_title || p.pain_point || '').filter(Boolean))];
  const dmOptions = [...new Set(analyzed.map(l => l.decision_maker).filter(Boolean))];

  const filtered = analyzed
    .filter(l => {
      if (hotOnly && (l.signal_score || 0) < 70) return false;
      if (l.signal_score < filterScore) return false;
      if (filterDM !== 'all' && l.decision_maker !== filterDM) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.extraction_mode === 'signal_first' && b.extraction_mode !== 'signal_first') return -1;
      if (b.extraction_mode === 'signal_first' && a.extraction_mode !== 'signal_first') return 1;
      return b.signal_score - a.signal_score;
    });

  const exportCSV = () => {
    const headers = ['Business', 'Website', 'Phone', 'Email', 'Score', 'Confirmed Checks', 'Checkable Checks', 'Decision Maker', 'Current Process', 'After Tech', 'Outreach Status'];
    const rows = filtered.map(l => [
      l.business_name, l.website, l.phone, l.email,
      l.signal_score, l.confirmed_checks, l.total_checkable,
      l.decision_maker, l.current_process, l.after_chatbot,
      outreachStatus[l.business_name] || l.outreach_status,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `pi_analyzed_${Date.now()}.csv`; a.click();
  };

  const OUTREACH_OPTIONS = ['not_contacted', 'email_sent', 'called', 'meeting_booked', 'not_interested'];

  const noData = !leads.length || !signalPlans.length;

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--gold-primary)' }}>Signal Analyzer</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {noData
                ? 'Complete Sub-tabs 2 (Signal Plans) and 3 (Lead Extraction) first'
                : `${leads.length} leads × ${signalPlans.length} signal plans → real HTTP checks per lead`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {!noData && (
              <button onClick={runAnalysis} disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(212,175,55,0.15)', color: 'var(--gold-primary)', border: '1px solid rgba(212,175,55,0.35)', padding: '0.6rem 1.1rem', borderRadius: '8px', cursor: 'pointer', width: 'auto', margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                {loading ? <Loader size={13} className="animate-spin" /> : <Activity size={13} />}
                {analyzed.length ? 'Re-analyze' : 'Run Analysis'}
              </button>
            )}
            {analyzed.length > 0 && (
              <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer', width: 'auto', margin: 0, fontSize: '0.82rem' }}>
                <Download size={13} /> Export CSV
              </button>
            )}
          </div>
        </div>
        {loading && (
          <div style={{ marginTop: '0.75rem' }}>
            <ProgressBar current={progress.current} total={progress.total} label={progress.msg} />
            <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Each lead: real HTTP request to website → HTML parsed for chat widgets, forms, pixels, CMS
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', color: '#ff6b6b', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {noData && !loading && (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', opacity: 0.5 }}>
          <BarChart2 size={40} style={{ color: 'var(--gold-primary)', marginBottom: '1rem', opacity: 0.3 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>Complete Sub-tab 2 (signal plans) and Sub-tab 3 (lead extraction) first. This tab runs automatically when both are ready.</p>
        </div>
      )}

      {analyzed.length > 0 && (
        <>
          {/* Filters */}
          <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Filter size={13} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Min score:</span>
              <input type="range" min={0} max={100} value={filterScore} onChange={e => setFilterScore(Number(e.target.value))} style={{ width: '80px', accentColor: 'var(--gold-primary)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--gold-primary)', fontWeight: 700, minWidth: '32px' }}>{filterScore}%</span>
            </div>
            {dmOptions.length > 0 && (
              <select value={filterDM} onChange={e => setFilterDM(e.target.value)}
                style={{ height: '30px', fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '6px', padding: '0 8px' }}>
                <option value="all">All Decision Makers</option>
                {dmOptions.map((dm, i) => <option key={i} value={dm}>{dm}</option>)}
              </select>
            )}
            <button
              onClick={() => setHotOnly(!hotOnly)}
              style={{
                padding: '4px 12px', borderRadius: '6px',
                border: hotOnly ? '1.5px solid #ef4444' : '1.5px solid #444',
                background: hotOnly ? 'rgba(239,68,68,0.12)' : 'transparent',
                color: hotOnly ? '#ef4444' : '#888',
                cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700
              }}
            >
              🔥 HOT only (≥70%)
            </button>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              Showing {filtered.length} of {analyzed.length} leads
            </span>
          </div>

          {/* Results table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.map((lead, i) => {
              const isExpanded = expandedLead === i;
              const sc = scoreColor(lead.signal_score);
              const fetchOk = lead.website_fetch_status === 'success';
              return (
                <div key={i} className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `3px solid ${sc.border}` }}>
                  {/* Lead header row */}
                  <div className="pi-v2-lead-row" style={{ gap: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>{lead.business_name || '—'}</div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                        {lead.website && lead.website !== 'N/A' && (
                          <a href={lead.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--gold-secondary)', display: 'flex', alignItems: 'center', gap: '2px', textDecoration: 'none' }}>
                            <Globe size={9} /> {lead.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].slice(0, 30)}
                          </a>
                        )}
                        <span style={{ fontSize: '0.62rem', color: fetchOk ? '#39ff14' : '#ff6b6b', background: fetchOk ? 'rgba(57,255,20,0.08)' : 'rgba(255,107,107,0.08)', padding: '0px 5px', borderRadius: '6px', border: `1px solid ${fetchOk ? 'rgba(57,255,20,0.2)' : 'rgba(255,107,107,0.2)'}` }}>
                          {fetchOk ? '✓ website fetched' : 'website: ' + (lead.website_fetch_status || 'not checked').slice(0, 40)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        {lead.phone && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}><Phone size={9} />{lead.phone}</span>}
                        {lead.email && <span style={{ fontSize: '0.7rem', color: '#a7f3d0', display: 'flex', alignItems: 'center', gap: '3px' }}><Mail size={9} />{lead.email}</span>}
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <ScoreBadge score={lead.signal_score} />
                        {lead.extraction_mode === 'signal_first' ? (
                          <span style={{ fontSize: '0.6rem', fontWeight: 800, padding: '2px 8px', borderRadius: '20px', background: 'rgba(57,255,20,0.12)', border: '1px solid rgba(57,255,20,0.35)', color: '#39ff14', whiteSpace: 'nowrap' }}>⚡ Signal First</span>
                        ) : (
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', color: '#666', whiteSpace: 'nowrap' }}>Leads First</span>
                        )}
                      </div>
                      {lead.score_reason && (
                        <div style={{ fontSize: '0.68rem', color: '#999', marginTop: '3px', fontStyle: 'italic', maxWidth: '220px' }}>
                          {lead.score_reason}
                        </div>
                      )}
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {lead.confirmed_checks}/{lead.total_checkable} auto-checks confirmed
                      </div>
                      {lead.total_checks - lead.total_checkable > 0 && (
                        <div style={{ fontSize: '0.6rem', color: '#888' }}>
                          +{lead.total_checks - lead.total_checkable} manual (excluded from score)
                        </div>
                      )}
                    </div>

                    <div>
                      {lead.decision_maker && (
                        <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.18)', borderRadius: '6px', padding: '4px 8px' }}>
                          <div style={{ fontSize: '0.58rem', color: '#60a5fa', textTransform: 'uppercase', fontWeight: 700 }}>Contact</div>
                          <div style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 600 }}>{lead.decision_maker}</div>
                        </div>
                      )}
                    </div>

                    <div>
                      <select value={outreachStatus[lead.business_name] || lead.outreach_status}
                        onChange={e => setOutreachStatus(prev => ({ ...prev, [lead.business_name]: e.target.value }))}
                        style={{ fontSize: '0.72rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '6px', padding: '3px 6px', width: '100%' }}>
                        {OUTREACH_OPTIONS.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                      </select>
                      {lead.email && (lead.signal_score || 0) >= 40 && (
                        <button
                          onClick={() => {
                            setOutreachOpen(outreachOpen === lead.business_name ? null : lead.business_name);
                            setOutreachEmail({ subject: '', body: '' });
                          }}
                          style={{
                            marginTop: '5px', padding: '4px 10px', width: '100%',
                            background: outreachOpen === lead.business_name ? '#7c3aed' : 'transparent',
                            border: '1.5px solid #7c3aed', borderRadius: '6px',
                            color: outreachOpen === lead.business_name ? '#fff' : '#a78bfa',
                            cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700
                          }}
                        >
                          ✉ {outreachOpen === lead.business_name ? 'Close' : 'Generate & Send'}
                        </button>
                      )}
                    </div>

                    <button onClick={() => setExpandedLead(isExpanded ? null : i)}
                      style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)', whiteSpace: 'nowrap' }}>
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {isExpanded ? 'Collapse' : 'Evidence'}
                    </button>
                  </div>

                  {/* Outreach panel */}
                  {outreachOpen === lead.business_name && (
                    <div style={{ borderTop: '1px solid rgba(124,58,237,0.2)', padding: '1rem', background: 'rgba(124,58,237,0.04)' }}>
                      <div style={{ fontSize: '0.72rem', color: '#a78bfa', marginBottom: '8px', fontStyle: 'italic' }}>
                        {lead.score_reason || `${lead.business_name} — Score: ${lead.signal_score}%`}
                      </div>
                      <textarea
                        placeholder="Your offer (e.g. 'AI chatbot that handles bookings 24/7')"
                        value={outreachOffer}
                        onChange={e => setOutreachOffer(e.target.value)}
                        style={{ width: '100%', padding: '8px', background: '#0d0d1a', border: '1px solid #333', borderRadius: '6px', color: '#eee', fontSize: '0.78rem', minHeight: '48px', marginBottom: '8px', boxSizing: 'border-box', resize: 'vertical' }}
                      />
                      <button
                        disabled={outreachLoading}
                        onClick={async () => {
                          setOutreachLoading(true);
                          try {
                            const res = await axios.post(`${API}/prospect-intel/v2/generate-outreach`, {
                              lead, technology, industry, user_offer: outreachOffer
                            });
                            setOutreachEmail({ subject: res.data.subject || '', body: res.data.body || '' });
                          } catch (e) { alert('Email generation failed: ' + (e?.response?.data?.detail || e.message)); }
                          setOutreachLoading(false);
                        }}
                        style={{ padding: '6px 14px', background: '#7c3aed', border: 'none', borderRadius: '6px', color: '#fff', cursor: outreachLoading ? 'wait' : 'pointer', fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px' }}
                      >
                        {outreachLoading ? 'Generating…' : '✨ Generate Email'}
                      </button>
                      {outreachEmail.subject && (
                        <div>
                          <input
                            value={outreachEmail.subject}
                            onChange={e => setOutreachEmail(prev => ({ ...prev, subject: e.target.value }))}
                            style={{ width: '100%', padding: '6px', background: '#0d0d1a', border: '1px solid #333', borderRadius: '6px', color: '#eee', fontSize: '0.78rem', marginBottom: '6px', boxSizing: 'border-box' }}
                            placeholder="Subject"
                          />
                          <textarea
                            value={outreachEmail.body}
                            onChange={e => setOutreachEmail(prev => ({ ...prev, body: e.target.value }))}
                            style={{ width: '100%', padding: '8px', background: '#0d0d1a', border: '1px solid #333', borderRadius: '6px', color: '#eee', fontSize: '0.78rem', minHeight: '120px', marginBottom: '8px', boxSizing: 'border-box', resize: 'vertical' }}
                          />
                          <button
                            disabled={outreachSending}
                            onClick={async () => {
                              setOutreachSending(true);
                              try {
                                const res = await axios.post(`${API}/prospect-intel/v2/send-outreach`, {
                                  session_id: masterSessionId || '',
                                  business_name: lead.business_name,
                                  email: lead.email,
                                  subject: outreachEmail.subject,
                                  body: outreachEmail.body,
                                });
                                if (res.data.success) {
                                  setOutreachSent(prev => ({ ...prev, [lead.business_name]: true }));
                                  setOutreachStatus(prev => ({ ...prev, [lead.business_name]: 'email_sent' }));
                                  setOutreachOpen(null);
                                }
                              } catch (e) { alert('Send failed: ' + (e?.response?.data?.detail || e.message)); }
                              setOutreachSending(false);
                            }}
                            style={{ padding: '6px 14px', background: outreachSent[lead.business_name] ? '#16a34a' : '#2563eb', border: 'none', borderRadius: '6px', color: '#fff', cursor: outreachSending ? 'wait' : 'pointer', fontSize: '0.78rem', fontWeight: 700 }}
                          >
                            {outreachSending ? 'Sending…' : outreachSent[lead.business_name] ? '✓ Sent' : '📤 Send Email'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expanded: signal evidence + process */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '1rem', background: 'rgba(0,0,0,0.2)' }}>
                      {/* Tech detected summary */}
                      {lead.tech_detected && Object.values(lead.tech_detected).some(v => v && (Array.isArray(v) ? v.length > 0 : v)) && (
                        <div style={{ marginBottom: '1rem', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, alignSelf: 'center' }}>Detected:</span>
                          {lead.tech_detected.live_chat?.map(t => <span key={t} style={{ fontSize: '0.65rem', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa', padding: '1px 7px', borderRadius: '8px' }}>{t}</span>)}
                          {lead.tech_detected.booking?.map(t => <span key={t} style={{ fontSize: '0.65rem', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', color: '#a78bfa', padding: '1px 7px', borderRadius: '8px' }}>{t}</span>)}
                          {lead.tech_detected.cms?.map(t => <span key={t} style={{ fontSize: '0.65rem', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24', padding: '1px 7px', borderRadius: '8px' }}>{t}</span>)}
                          {lead.tech_detected.meta_pixel && <span style={{ fontSize: '0.65rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6', padding: '1px 7px', borderRadius: '8px' }}>Meta Pixel</span>}
                          {lead.tech_detected.google_analytics && <span style={{ fontSize: '0.65rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', padding: '1px 7px', borderRadius: '8px' }}>Google Analytics</span>}
                        </div>
                      )}

                      {/* Signal checks */}
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
                          Signal Checks ({lead.confirmed_checks} confirmed / {lead.total_checkable} auto-checked / {lead.total_checks} total)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          {(lead.signal_evidence || []).map((chk, ci) => (
                            <div key={ci} style={{
                              display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '0.5rem 0.75rem', borderRadius: '6px',
                              background: chk.confirmed === 'yes' ? 'rgba(57,255,20,0.04)' : chk.confirmed === 'no' ? 'rgba(255,107,107,0.04)' : 'rgba(80,80,80,0.08)',
                              border: `1px solid ${chk.confirmed === 'yes' ? 'rgba(57,255,20,0.12)' : chk.confirmed === 'no' ? 'rgba(255,107,107,0.12)' : 'rgba(80,80,80,0.15)'}`,
                            }}>
                              <div style={{ flexShrink: 0, marginTop: '1px' }}><ConfirmBadge confirmed={chk.confirmed} /></div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.78rem', color: '#e0e0e0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                  {chk.check_name}
                                  {chk.importance_level && (
                                    <span style={{
                                      fontSize: '0.58rem', padding: '1px 5px', borderRadius: '8px', fontWeight: 700,
                                      textTransform: 'uppercase', letterSpacing: '0.4px',
                                      background: chk.importance_level === 'critical' ? 'rgba(255,77,77,0.13)' : chk.importance_level === 'important' ? 'rgba(245,166,35,0.13)' : 'rgba(136,136,136,0.13)',
                                      color: chk.importance_level === 'critical' ? '#ff4d4d' : chk.importance_level === 'important' ? '#f5a623' : '#888',
                                    }}>
                                      {chk.importance_level}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  <span style={{ color: '#888', textTransform: 'uppercase', fontSize: '0.58rem', fontWeight: 700 }}>Evidence: </span>
                                  {chk.evidence}
                                </div>
                                {chk.confirmed === 'unable_to_check' && chk.where_to_look && (
                                  <div style={{ fontSize: '0.68rem', color: '#60a5fa', marginTop: '3px' }}>→ {chk.where_to_look}</div>
                                )}
                                {chk.confirmed === 'yes' && chk.outreach_angle && (
                                  <div style={{
                                    marginTop: '5px', padding: '4px 8px',
                                    background: 'rgba(124,58,237,0.1)', borderLeft: '3px solid #7c3aed',
                                    borderRadius: '0 4px 4px 0', fontSize: '0.68rem', color: '#c4b5fd'
                                  }}>
                                    <strong>Pitch:</strong> {chk.outreach_angle}
                                  </div>
                                )}
                              </div>
                              <span style={{ fontSize: '0.6rem', color: '#555', flexShrink: 0 }}>{chk.signal_type}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Process transformation */}
                      {(lead.current_process || lead.after_chatbot) && (
                        <div className="pi-v2-process-grid" style={{ gap: '10px', background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.12)', borderRadius: '8px', padding: '0.75rem' }}>
                          <div>
                            <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>Current Process</div>
                            <div style={{ fontSize: '0.8rem', color: '#ff6b6b' }}>{lead.current_process || 'Manual process in place'}</div>
                          </div>
                          <ChevronRight size={16} style={{ color: 'var(--gold-primary)' }} />
                          <div>
                            <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--gold-primary)', fontWeight: 700, marginBottom: '4px' }}>After Implementation</div>
                            <div style={{ fontSize: '0.8rem', color: '#39ff14' }}>{lead.after_chatbot || 'Automated workflow'}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No leads above {filterScore}% score. Lower the threshold or re-run analysis.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProspectIntelligence() {
  const [activeTab, setActiveTab] = useState(0);

  // Cross-tab data
  const [painData, setPainData] = useState(null);       // tab 1 → tab 2
  const [signalPlans, setSignalPlans] = useState([]);   // tab 2 → tab 4
  const [extractedLeads, setExtractedLeads] = useState([]); // tab 3 → tab 4
  const [leadsSessionId, setLeadsSessionId] = useState('');
  const [analyzedLeads, setAnalyzedLeads] = useState([]); // tab 4 output

  // Derived session ID: use pain data's session, fall back to leads session
  const piSessionId = painData?.session_id || leadsSessionId;

  const readiness = [
    Boolean(painData?.pain_points?.length),
    Boolean(signalPlans.length),
    Boolean(extractedLeads.length),
    Boolean(analyzedLeads.length),
  ];

  const handlePainDone = (data) => {
    setPainData(data);
    setTimeout(() => setActiveTab(1), 400);
  };

  const handleLeadsDone = (leads, sid) => {
    setExtractedLeads(leads);
    setLeadsSessionId(sid);
    if (signalPlans.length) {
      setTimeout(() => setActiveTab(3), 400);
    }
  };

  const handleSignalsDone = (plans) => {
    setSignalPlans(plans);
    if (extractedLeads.length) {
      setTimeout(() => setActiveTab(3), 400);
    }
  };

  const handleHistoryLoad = (meta, leads, analyzed) => {
    if (meta.pain_data?.pain_points?.length) setPainData(meta.pain_data);
    if (meta.signal_plans?.length) setSignalPlans(meta.signal_plans);
    if (leads.length) { setExtractedLeads(leads); setLeadsSessionId(meta.session_id); }
    if (analyzed.length) setAnalyzedLeads(analyzed);
    // Navigate to the most complete tab
    if (analyzed.length) setActiveTab(3);
    else if (leads.length) setActiveTab(2);
    else if (meta.signal_plans?.length) setActiveTab(1);
    else setActiveTab(0);
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '100%' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--gold-primary)', marginBottom: '4px' }}>
            <Zap size={22} /> Prospect Intelligence
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            4-step pipeline: pain points → signal plans → lead extraction → real-time signal analysis.
            Scores are calculated from actual HTTP checks — never fabricated.
          </p>
        </div>
      </div>

      <HistoryPanel onLoad={handleHistoryLoad} />

      <SubTabBar active={activeTab} setActive={setActiveTab} readiness={readiness} />

      {activeTab === 0 && (
        <PainPointsTab onDone={handlePainDone} existingData={painData} />
      )}

      {activeTab === 1 && (
        <SignalPlansTab
          painData={painData}
          onDone={handleSignalsDone}
          existingPlans={signalPlans.length ? signalPlans : null}
        />
      )}

      {activeTab === 2 && (
        <LeadExtractionTab
          onDone={handleLeadsDone}
          existingLeads={extractedLeads}
          masterSessionId={piSessionId}
          signalPlans={signalPlans}
        />
      )}

      {activeTab === 3 && (
        <SignalAnalyzerTab
          leads={extractedLeads}
          signalPlans={signalPlans}
          technology={painData?.technology || ''}
          industry={painData?.industry || ''}
          onDone={setAnalyzedLeads}
          masterSessionId={piSessionId}
        />
      )}
    </div>
  );
}
