import React, { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { DeepRedditTab, CompetitorReviewsTab, PricingSignalsTab, DeepValidationTab } from './MarketResearchTabs';
import {
  TrendingUp, AlertCircle, Lightbulb, Users, BarChart2,
  ExternalLink, RefreshCw, Search, ChevronDown, ChevronUp,
  Calendar, Globe, MessageSquare, Star, Zap, Target,
  CheckCircle, XCircle, AlertTriangle, Loader, Database,
  GitBranch, DollarSign, Layers
} from 'lucide-react';

const API = '/api/market';

// ─── Reusable sub-components ──────────────────────────────────────────────────

function SentimentBadge({ sentiment }) {
  const map = {
    negative: { bg: 'rgba(220,53,69,0.15)', color: '#ff6b6b', border: 'rgba(220,53,69,0.3)', label: '● Negative' },
    positive: { bg: 'rgba(40,167,69,0.15)', color: '#39ff14', border: 'rgba(40,167,69,0.3)', label: '● Positive' },
    neutral:  { bg: 'rgba(108,117,125,0.15)', color: '#a0a0a0', border: 'rgba(108,117,125,0.3)', label: '● Neutral' },
  };
  const s = map[sentiment] || map.neutral;
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600,
    }}>{s.label}</span>
  );
}

function SourceTag({ source, url, date }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--border-color)', borderRadius: '4px', padding: '2px 8px' }}>
        {source}
      </span>
      {date && (
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Calendar size={11} /> {date}
        </span>
      )}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: '0.72rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '3px',
            textDecoration: 'none' }}
          onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
          onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>
          <ExternalLink size={11} /> View Source
        </a>
      )}
    </div>
  );
}

function LoadingSpinner({ message = 'Fetching data...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '3rem', gap: '1rem', color: 'var(--text-muted)' }}>
      <Loader size={32} style={{ color: 'var(--gold-primary)', animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: '0.9rem' }}>{message}</span>
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.3)',
      borderRadius: '8px', padding: '1rem 1.25rem', color: '#ff6b6b', fontSize: '0.9rem',
      display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, message }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '3rem', gap: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>
      <Icon size={40} style={{ opacity: 0.3 }} />
      <span style={{ fontSize: '0.9rem', maxWidth: '300px' }}>{message}</span>
    </div>
  );
}

function ScoreRing({ score, label, color = 'var(--gold-primary)' }) {
  const pct = (score / 10) * 100;
  const r = 28, circ = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
          strokeLinecap="round" transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
        <text x="36" y="40" textAnchor="middle" fill={color} fontSize="16" fontWeight="700">{score}</text>
      </svg>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '80px' }}>{label}</span>
    </div>
  );
}

// ─── Tab 1: Market Overview ───────────────────────────────────────────────────
function MarketOverviewTab({ industry, problem, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    if (!industry) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await axios.post(`${API}/market-overview`, { industry, problem });
      setData(res.data);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch market overview');
    } finally { setLoading(false); }
  }, [industry, problem, onSaved]);

  React.useEffect(() => { if (industry) fetch(); }, [fetch]);

  if (loading) return <LoadingSpinner message="Fetching Google Trends & Wikipedia data..." />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <EmptyState icon={TrendingUp} message="Submit an industry above to load market overview data." />;

  const { trends, wikipedia, top_discussions } = data;
  const trendVals = trends?.trend_data || [];
  const maxVal = Math.max(...trendVals.map(d => d.value), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Wikipedia Summary */}
      {wikipedia?.extract && (
        <div className="mr-card">
          <div className="mr-card-header">
            <Globe size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Market Overview</span>
            <span className="mr-source-chip">Wikipedia</span>
          </div>
          <p style={{ color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: 1.7, margin: '0.75rem 0' }}>
            {wikipedia.extract}
          </p>
          <SourceTag source="Wikipedia" url={wikipedia.url} date={new Date().toISOString().slice(0,10)} />
        </div>
      )}

      {/* Trend Chart */}
      {trendVals.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <TrendingUp size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Search Interest Over Time — "{trends.keyword}"</span>
            <span className="mr-source-chip">Google Trends</span>
          </div>
          <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '120px', minWidth: '600px' }}>
              {trendVals.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{
                    width: '100%', background: `rgba(212,175,55,${0.3 + (d.value / maxVal) * 0.7})`,
                    height: `${Math.max(4, (d.value / maxVal) * 100)}px`,
                    borderRadius: '2px 2px 0 0', transition: 'height 0.5s ease',
                    minWidth: '4px',
                  }} title={`${d.date}: ${d.value}`} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px',
              fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <span>{trendVals[0]?.date}</span>
              <span>{trendVals[Math.floor(trendVals.length/2)]?.date}</span>
              <span>{trendVals[trendVals.length-1]?.date}</span>
            </div>
          </div>
          <SourceTag source="Google Trends (pytrends)" url="https://trends.google.com" date={new Date().toISOString().slice(0,10)} />
        </div>
      )}

      {/* Rising Queries */}
      {trends?.rising_queries?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <Zap size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Rising Search Queries</span>
            <span className="mr-source-chip">Google Trends</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '0.75rem' }}>
            {trends.rising_queries.map((q, i) => (
              <span key={i} style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid var(--border-color)',
                borderRadius: '20px', padding: '4px 12px', fontSize: '0.8rem', color: 'var(--gold-primary)' }}>
                ↑ {q.query} {q.value !== 'Breakout' ? `(${q.value}%)` : '🔥 Breakout'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top HN Discussions */}
      {top_discussions?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <MessageSquare size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Top Industry Discussions</span>
            <span className="mr-source-chip">Hacker News</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.75rem' }}>
            {top_discussions.map((d, i) => (
              <div key={i} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', margin: 0 }}>{d.name}</p>
                <SourceTag source={d.source} url={d.url} date={d.date} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Pain Points ───────────────────────────────────────────────────────
function PainPointsTab({ industry, problem, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});

  const fetch = useCallback(async () => {
    if (!industry) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await axios.post(`${API}/pain-points`, { industry, problem });
      setData(res.data);
      if (onSaved) onSaved(); // refresh saved panel
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch pain points');
    } finally { setLoading(false); }
  }, [industry, problem, onSaved]);

  React.useEffect(() => { if (industry) fetch(); }, [fetch]);

  const toggleCluster = (i) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }));

  if (loading) return <LoadingSpinner message="Scanning Reddit, Hacker News & App Store reviews..." />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <EmptyState icon={AlertCircle} message="Submit an industry above to discover pain points." />;

  const { clusters, source_breakdown, total_sources } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Source summary bar */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Sources',          value: total_sources,                          color: 'var(--gold-primary)' },
          { label: 'Reddit (Arctic Shift)',  value: source_breakdown?.reddit_arctic_shift || 0, color: '#ff6314' },
          { label: 'Google (SerpAPI)',        value: source_breakdown?.google_serp || 0,    color: '#4285f4' },
          { label: 'Hacker News',            value: source_breakdown?.hacker_news || 0,    color: '#ff6600' },
          { label: 'App Store',              value: source_breakdown?.app_store || 0,      color: '#007aff' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: '8px', padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</span>
          </div>
        ))}
        <button onClick={fetch} style={{ width: 'auto', padding: '0.75rem 1.25rem', display: 'flex',
          alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: 0 }}>
          <RefreshCw size={14} /> Load Saved
        </button>
        <button
          onClick={async () => {
            try {
              await axios.post(`${API}/refresh/pain`, { industry, problem });
              fetch();
            } catch(e) { fetch(); }
          }}
          style={{ width: 'auto', padding: '0.75rem 1.25rem', display: 'flex',
            alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: 0,
            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
            color: 'var(--text-muted)', transform: 'none', boxShadow: 'none' }}>
          <RefreshCw size={14} /> Re-fetch Fresh
        </button>      </div>

      {clusters?.length === 0 && (
        <EmptyState icon={AlertCircle} message="No pain points found. Try a more specific industry or problem area." />
      )}

      {/* Cluster cards */}
      {clusters?.map((cluster, ci) => (
        <div key={ci} className="mr-card" style={{ borderLeft: '3px solid var(--gold-primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
            onClick={() => toggleCluster(ci)}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <AlertCircle size={16} style={{ color: '#ff6b6b', flexShrink: 0 }} />
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)', fontFamily: 'inherit' }}>
                  {cluster.theme}
                </h3>
                <span style={{ background: 'rgba(255,107,107,0.15)', color: '#ff6b6b',
                  border: '1px solid rgba(255,107,107,0.3)', borderRadius: '20px',
                  padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600 }}>
                  {cluster.items?.length || 0} mentions
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', paddingLeft: '26px' }}>
                {cluster.description}
              </p>
            </div>
            <div style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: '12px' }}>
              {expanded[ci] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </div>

          {expanded[ci] && (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '10px',
              paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {cluster.items?.map((item, ii) => (
                <div key={ii} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px',
                  padding: '0.875rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    gap: '10px', marginBottom: '8px' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6,
                      fontStyle: 'italic' }}>
                      "{item.quote}"
                    </p>
                    <SentimentBadge sentiment={item.sentiment} />
                  </div>
                  <SourceTag source={item.source} url={item.url} date={item.date} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab 3: Opportunities ─────────────────────────────────────────────────────
function OpportunitiesTab({ industry, problem, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    if (!industry) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await axios.post(`${API}/opportunities`, { industry, problem });
      setData(res.data);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch opportunities');
    } finally { setLoading(false); }
  }, [industry, problem, onSaved]);

  React.useEffect(() => { if (industry) fetch(); }, [fetch]);

  if (loading) return <LoadingSpinner message="Scanning Google Trends & Hacker News for opportunities..." />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <EmptyState icon={Lightbulb} message="Submit an industry above to discover opportunities." />;

  const { trends, opportunity_cards } = data;
  const trendVals = trends?.trend_data || [];
  const maxVal = Math.max(...trendVals.map(d => d.value), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Rising queries */}
      {trends?.rising_queries?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <Zap size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Rising Opportunity Signals</span>
            <span className="mr-source-chip">Google Trends</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '0.75rem' }}>
            {trends.rising_queries.map((q, i) => (
              <span key={i} style={{ background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.2)',
                borderRadius: '20px', padding: '4px 14px', fontSize: '0.8rem', color: '#39ff14' }}>
                🚀 {q.query} {q.value !== 'Breakout' ? `+${q.value}%` : '🔥 Breakout'}
              </span>
            ))}
          </div>
          <SourceTag source="Google Trends" url="https://trends.google.com" date={new Date().toISOString().slice(0,10)} />
        </div>
      )}

      {/* Mini trend chart */}
      {trendVals.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <TrendingUp size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Market Interest Trend</span>
            <span className="mr-source-chip">Google Trends</span>
          </div>
          <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px', minWidth: '500px' }}>
              {trendVals.map((d, i) => (
                <div key={i} style={{ flex: 1, background: `rgba(57,255,20,${0.2 + (d.value / maxVal) * 0.6})`,
                  height: `${Math.max(4, (d.value / maxVal) * 70)}px`,
                  borderRadius: '2px 2px 0 0', minWidth: '4px' }} title={`${d.date}: ${d.value}`} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Opportunity cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {opportunity_cards?.map((card, i) => (
          <div key={i} className="mr-card" style={{ borderLeft: '3px solid #39ff14' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Lightbulb size={16} style={{ color: '#39ff14', flexShrink: 0, marginTop: '2px' }} />
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                {card.title}
              </p>
            </div>
            <SourceTag source={card.source} url={card.url} date={card.date} />
          </div>
        ))}
      </div>

      {(!opportunity_cards || opportunity_cards.length === 0) && (
        <EmptyState icon={Lightbulb} message="No opportunity signals found for this industry yet." />
      )}
    </div>
  );
}

// ─── Tab 4: Audience Intelligence ────────────────────────────────────────────
function AudienceTab({ industry, problem, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    if (!industry) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await axios.post(`${API}/audience`, { industry, problem });
      setData(res.data);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch audience data');
    } finally { setLoading(false); }
  }, [industry, problem, onSaved]);

  React.useEffect(() => { if (industry) fetch(); }, [fetch]);

  if (loading) return <LoadingSpinner message="Analyzing audience patterns with NVIDIA AI..." />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <EmptyState icon={Users} message="Submit an industry above to analyze your audience." />;

  const { audience_intel: ai, communities, raw_sources } = data;

  const Section = ({ title, icon: Icon, items, color = 'var(--gold-primary)' }) => (
    items?.length > 0 ? (
      <div className="mr-card">
        <div className="mr-card-header">
          <Icon size={16} style={{ color }} />
          <span>{title}</span>
          <span className="mr-source-chip">NVIDIA AI</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '0.75rem' }}>
          {items.map((item, i) => (
            <span key={i} style={{ background: `rgba(212,175,55,0.08)`, border: '1px solid var(--border-color)',
              borderRadius: '20px', padding: '4px 14px', fontSize: '0.82rem', color: 'var(--text-main)' }}>
              {item}
            </span>
          ))}
        </div>
      </div>
    ) : null
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* AI Summary */}
      {ai?.summary && (
        <div className="mr-card" style={{ borderLeft: '3px solid var(--gold-primary)' }}>
          <div className="mr-card-header">
            <Users size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Audience Summary</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
            {ai.summary}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        <Section title="Who Has This Problem" icon={Target} items={ai?.job_titles} />
        <Section title="Seniority Levels" icon={BarChart2} items={ai?.seniority_levels} />
        <Section title="Company Sizes" icon={Globe} items={ai?.company_sizes} />
        <Section title="Where They Hang Out" icon={MessageSquare} items={communities} color="#39ff14" />
      </div>

      {/* Language phrases */}
      {ai?.language_phrases?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <MessageSquare size={16} style={{ color: '#007aff' }} />
            <span>Exact Language They Use</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '0.75rem' }}>
            {ai.language_phrases.map((phrase, i) => (
              <span key={i} style={{ background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.25)',
                borderRadius: '6px', padding: '4px 12px', fontSize: '0.82rem', color: '#5ac8fa',
                fontStyle: 'italic' }}>
                "{phrase}"
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Raw sources */}
      {raw_sources?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <Globe size={16} style={{ color: 'var(--text-muted)' }} />
            <span>Source Posts Used for Analysis</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.75rem' }}>
            {raw_sources.slice(0, 8).map((s, i) => (
              <div key={i} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {s.quote}
                </p>
                <SourceTag source={s.source} url={s.url} date={s.date} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Investment Insights Section (used inside ValidationTab) ─────────────────
function InvestmentInsightsSection({ industry, problem, insights, insLoading, insError,
  expandedOpp, setExpandedOpp, onFetch, onSaved }) {

  const confColor = { high: '#39ff14', medium: '#ffdf00', low: '#ff6b6b' };
  const compColor = { none: '#39ff14', low: '#39ff14', medium: '#ffdf00', high: '#ff6b6b' };
  const rankColors = ['var(--gold-primary)', '#5ac8fa', '#39ff14', '#ffdf00', '#ff6b6b', '#a0a0a0'];

  return (
    <div className="mr-card" style={{ borderTop: '3px solid var(--gold-primary)' }}>
      <div className="mr-card-header" style={{ marginBottom: '0.5rem' }}>
        <Lightbulb size={16} style={{ color: 'var(--gold-primary)' }} />
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Where to Invest — AI Opportunity Analysis</span>
        <span className="mr-source-chip">NVIDIA AI</span>
      </div>
      <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Reads all collected research (pain points, Reddit comments, competitor gaps, pricing signals) and ranks specific investment opportunities with evidence and sources.
        Run more tabs first for richer analysis.
      </p>

      {!insights && !insLoading && !insError && (
        <button onClick={onFetch} style={{ width: 'auto', padding: '0.75rem 1.75rem',
          marginBottom: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}>
          <Lightbulb size={16} /> Generate Investment Insights
        </button>
      )}

      {insLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem 0',
          color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          <Loader size={20} style={{ color: 'var(--gold-primary)', animation: 'spin 1s linear infinite' }} />
          Analyzing all research data — reading pain clusters, Reddit comments, competitor gaps, pricing signals...
        </div>
      )}

      {insError && (
        <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.3)',
          borderRadius: '8px', padding: '0.875rem', color: '#ff6b6b', fontSize: '0.85rem' }}>
          {insError}
        </div>
      )}

      {insights && !insLoading && (() => {
        const { insights: ins, data_richness, pain_clusters_used } = insights;
        const opps = ins?.opportunities || [];
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Data richness */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0.75rem',
              background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Data used:</span>
              {[
                { key: 'has_pain_data',      label: `${pain_clusters_used} pain clusters` },
                { key: 'has_deep_reddit',    label: 'Reddit comments' },
                { key: 'has_competitor_data',label: 'Competitor gaps' },
                { key: 'has_pricing_data',   label: 'Pricing signals' },
                { key: 'has_trend_data',     label: 'Trend data' },
              ].map(({ key, label }) => (
                <span key={key} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px',
                  background: data_richness?.[key] ? 'rgba(57,255,20,0.1)' : 'rgba(255,255,255,0.04)',
                  color: data_richness?.[key] ? '#39ff14' : 'var(--text-muted)',
                  border: `1px solid ${data_richness?.[key] ? 'rgba(57,255,20,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                  {data_richness?.[key] ? '✓' : '○'} {label}
                </span>
              ))}
              <button onClick={async () => {
                  try { await axios.post(`${API}/refresh/invest`, { industry, problem }); } catch {}
                  onFetch();
                }}
                style={{ all: 'unset', cursor: 'pointer', marginLeft: 'auto', fontSize: '0.72rem',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RefreshCw size={11} /> Re-run
              </button>
            </div>

            {/* Executive summary */}
            {ins?.executive_summary && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.8,
                padding: '1rem', background: 'rgba(212,175,55,0.05)',
                borderRadius: '8px', border: '1px solid rgba(212,175,55,0.1)' }}>
                {ins.executive_summary}
              </p>
            )}

            {/* Quick win + biggest risk */}
            {(ins?.quick_win || ins?.biggest_risk) && (
              <div className="mr-grid-2" style={{ gap: '1rem' }}>
                {ins?.quick_win && (
                  <div style={{ background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.2)',
                    borderRadius: '8px', padding: '0.875rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#39ff14',
                      textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>⚡ Quick Win</div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>{ins.quick_win}</p>
                  </div>
                )}
                {ins?.biggest_risk && (
                  <div style={{ background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.2)',
                    borderRadius: '8px', padding: '0.875rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ff6b6b',
                      textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>⚠️ Biggest Risk</div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>{ins.biggest_risk}</p>
                  </div>
                )}
              </div>
            )}

            {opps.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                No opportunities generated — run Pain Points, Deep Reddit, and Competitor Reviews tabs first for richer analysis.
              </div>
            )}

            {/* Opportunity cards */}
            {opps.map((opp, i) => {
              const isExp = expandedOpp[i];
              const cc = confColor[opp.confidence?.toLowerCase()] || 'var(--text-muted)';
              const compC = compColor[opp.competition_level?.toLowerCase()] || 'var(--text-muted)';
              const rankColor = rankColors[i] || 'var(--text-muted)';
              return (
                <div key={i} className="mr-card" style={{ borderLeft: `4px solid ${rankColor}`,
                  background: i === 0 ? 'rgba(212,175,55,0.04)' : 'var(--bg-card)' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}
                    onClick={() => setExpandedOpp(p => ({ ...p, [i]: !p[i] }))}>
                    <div style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '50%',
                      background: `${rankColor}20`, border: `2px solid ${rankColor}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.88rem', fontWeight: 700, color: rankColor }}>
                      #{opp.rank || i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>{opp.title}</span>
                        {i === 0 && <span style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--gold-primary)',
                          border: '1px solid rgba(212,175,55,0.3)', borderRadius: '20px',
                          padding: '1px 8px', fontSize: '0.68rem', fontWeight: 700 }}>🏆 Top Pick</span>}
                        <span style={{ background: `${cc}15`, color: cc, border: `1px solid ${cc}33`,
                          borderRadius: '4px', padding: '1px 8px', fontSize: '0.68rem', fontWeight: 600 }}>
                          {opp.confidence || '—'} confidence
                        </span>
                        <span style={{ background: `${compC}15`, color: compC, border: `1px solid ${compC}33`,
                          borderRadius: '4px', padding: '1px 8px', fontSize: '0.68rem', fontWeight: 600 }}>
                          {opp.competition_level || '—'} competition
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {opp.problem_statement}
                      </p>
                    </div>
                    <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                      {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExp && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem',
                      borderTop: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {opp.why_now && (
                        <div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--gold-primary)',
                            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Why Now</div>
                          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>{opp.why_now}</p>
                        </div>
                      )}
                      {opp.evidence?.length > 0 && (
                        <div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#5ac8fa',
                            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Evidence</div>
                          {opp.evidence.map((e, ei) => (
                            <div key={ei} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '4px' }}>
                              <span style={{ color: '#5ac8fa', flexShrink: 0 }}>→</span>
                              <span style={{ fontSize: '0.83rem', color: 'var(--text-main)', lineHeight: 1.5 }}>{e}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mr-grid-2" style={{ gap: '1rem' }}>
                        {opp.target_user && (
                          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.75rem' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
                              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Target User</div>
                            <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-main)' }}>{opp.target_user}</p>
                          </div>
                        )}
                        {opp.monetization && (
                          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '0.75rem' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
                              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Monetization</div>
                            <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-main)' }}>{opp.monetization}</p>
                          </div>
                        )}
                      </div>
                      {opp.source_items?.length > 0 && opp.source_items.map((si, sii) => si.quote && (
                        <div key={sii} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '6px',
                          padding: '0.75rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                          <p style={{ margin: '0 0 6px', fontSize: '0.82rem', color: 'var(--text-main)',
                            lineHeight: 1.5, fontStyle: 'italic' }}>"{si.quote}"</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)',
                              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)',
                              borderRadius: '4px', padding: '2px 8px' }}>{si.source}</span>
                            <span style={{ fontSize: '0.7rem', color: '#ff6314' }}>{si.mentions} mentions</span>
                            {si.url && (
                              <a href={si.url} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: '0.7rem', color: 'var(--gold-primary)',
                                  display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}
                                onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
                                onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>
                                <ExternalLink size={10} /> View Source
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                      {opp.sources?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {opp.sources.map((s, si) => (
                            <span key={si} style={{ fontSize: '0.7rem', color: 'var(--text-muted)',
                              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '4px', padding: '2px 8px' }}>{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Tab 5: Validation Score ──────────────────────────────────────────────────
function ValidationTab({ industry, problem, onSaved }) {
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [insights, setInsights]       = useState(null);
  const [insLoading, setInsLoading]   = useState(false);
  const [insError, setInsError]       = useState('');
  const [expandedOpp, setExpandedOpp] = useState({});

  const fetch = useCallback(async () => {
    if (!industry) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await axios.post(`${API}/validation`, { industry, problem });
      setData(res.data);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to run validation analysis');
    } finally { setLoading(false); }
  }, [industry, problem, onSaved]);

  const fetchInsights = useCallback(async () => {
    if (!industry) return;
    setInsLoading(true); setInsError(''); setInsights(null);
    try {
      const res = await axios.post(`${API}/investment-insights`, { industry, problem });
      setInsights(res.data);
      if (onSaved) onSaved();
    } catch (e) {
      setInsError(e.response?.data?.detail || 'Failed to generate investment insights');
    } finally { setInsLoading(false); }
  }, [industry, problem, onSaved]);

  React.useEffect(() => { if (industry) fetch(); }, [fetch]);

  if (loading) return <LoadingSpinner message="Running NVIDIA AI validation analysis across all data sources..." />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <EmptyState icon={BarChart2} message="Submit an industry above to get your validation score." />;

  const { scores, data_sources_used } = data;
  const rec = scores?.recommendation || 'research more';
  const recConfig = {
    pursue:          { color: '#39ff14', bg: 'rgba(57,255,20,0.1)',   border: 'rgba(57,255,20,0.3)',   label: '✅ Pursue This Market' },
    'research more': { color: '#ffdf00', bg: 'rgba(255,223,0,0.1)',   border: 'rgba(255,223,0,0.3)',   label: '⚠️ Research More' },
    avoid:           { color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)', border: 'rgba(255,107,107,0.3)', label: '❌ Avoid This Market' },
  };
  const rc = recConfig[rec] || recConfig['research more'];
  const confColor = { high: '#39ff14', medium: '#ffdf00', low: '#ff6b6b' };
  const compColor = { none: '#39ff14', low: '#39ff14', medium: '#ffdf00', high: '#ff6b6b' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Score rings */}
      <div className="mr-card">
        <div className="mr-card-header">
          <BarChart2 size={16} style={{ color: 'var(--gold-primary)' }} />
          <span>Validation Scores</span>
          <span className="mr-source-chip">NVIDIA AI</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap',
          gap: '1.5rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
          <ScoreRing score={scores?.pain_intensity?.score || 0} label="Pain Intensity" color="#ff6b6b" />
          <ScoreRing score={scores?.market_size?.score || 0} label="Market Size" color="var(--gold-primary)" />
          <ScoreRing score={scores?.competition_density?.score || 0} label="Competition Density" color="#007aff" />
          <ScoreRing score={scores?.overall_opportunity?.score || 0} label="Overall Opportunity" color="#39ff14" />
        </div>
      </div>

      {/* Score explanations */}
      {[
        { key: 'pain_intensity',    label: 'Pain Intensity',    color: '#ff6b6b' },
        { key: 'market_size',       label: 'Market Size',       color: 'var(--gold-primary)' },
        { key: 'competition_density',label:'Competition Density',color: '#007aff' },
        { key: 'overall_opportunity',label:'Overall Opportunity',color: '#39ff14' },
      ].map(({ key, label, color }) => scores?.[key] && (
        <div key={key} className="mr-card" style={{ borderLeft: `3px solid ${color}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, color, minWidth: '48px' }}>
              {scores[key].score}/10
            </span>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>{label}</div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{scores[key].explanation}</p>
            </div>
          </div>
        </div>
      ))}

      {/* AI Summary */}
      {scores?.summary && (
        <div className="mr-card">
          <div className="mr-card-header">
            <Star size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>AI Market Summary</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.8 }}>
            {scores.summary}
          </p>
        </div>
      )}

      {/* Recommendation */}
      <div style={{ background: rc.bg, border: `1px solid ${rc.border}`, borderRadius: '10px', padding: '1.25rem 1.5rem' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: rc.color, marginBottom: '8px' }}>{rc.label}</div>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
          {scores?.recommendation_reason}
        </p>
      </div>

      {/* ── Investment Insights ─────────────────────────────────────────── */}
      <InvestmentInsightsSection
        industry={industry} problem={problem}
        insights={insights} insLoading={insLoading} insError={insError}
        expandedOpp={expandedOpp} setExpandedOpp={setExpandedOpp}
        onFetch={fetchInsights} onSaved={onSaved}
      />

      {/* Data sources used */}
      <div className="mr-card">
        <div className="mr-card-header">
          <Globe size={16} style={{ color: 'var(--text-muted)' }} />
          <span>Data Sources Used in This Analysis</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '0.75rem' }}>
          {Object.entries(data_sources_used || {}).map(([k, v]) => (
            <div key={k} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)',
              borderRadius: '6px', padding: '6px 14px', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--gold-primary)', fontWeight: 700 }}>{v}</span>
              <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>{k.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Saved Searches Panel ────────────────────────────────────────────────────
const TAB_LABELS = {
  pain:       'Pain Points',
  overview:   'Market Overview',
  opp:        'Opportunities',
  audience:   'Audience Intel',
  validation: 'Validation Score',
};
const TAB_ICONS = {
  pain:            AlertCircle,
  overview:        TrendingUp,
  opp:             Lightbulb,
  audience:        Users,
  validation:      BarChart2,
  deep_reddit:     MessageSquare,
  competitors:     GitBranch,
  pricing:         DollarSign,
  deep_validation: Layers,
};

function SavedSearchesPanel({ onLoad, currentIndustry, currentProblem, refreshRef }) {
  const [searches, setSearches] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(true);  // start open so users see their saved searches

  const fetchSearches = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/saved-searches`);
      setSearches(res.data || []);
    } catch (e) {
      console.error('Failed to load saved searches', e);
    } finally { setLoading(false); }
  };

  // Expose fetchSearches to parent via ref
  React.useEffect(() => {
    if (refreshRef) refreshRef.current = fetchSearches;
  }, [refreshRef]);

  React.useEffect(() => { fetchSearches(); }, []);

  const handleDelete = async (e, key) => {
    e.stopPropagation();
    if (!window.confirm('Delete this saved search?')) return;
    try {
      await axios.delete(`${API}/saved-searches/${key}`);
      setSearches(s => s.filter(x => x.cache_key !== key));
    } catch (e) { alert('Failed to delete'); }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Delete ALL saved searches? This cannot be undone.')) return;
    try {
      await axios.delete(`${API}/saved-searches`);
      setSearches([]);
    } catch (e) { alert('Failed to clear'); }
  };

  // Group by industry+problem
  const grouped = searches.reduce((acc, s) => {
    const gk = `${s.industry}||${s.problem}`;
    if (!acc[gk]) acc[gk] = { industry: s.industry, problem: s.problem, tabs: [] };
    acc[gk].tabs.push(s);
    return acc;
  }, {});

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchSearches(); }}
        style={{
          width: 'auto', marginBottom: 0, padding: '0.6rem 1.25rem',
          display: 'flex', alignItems: 'center', gap: '8px',
          background: open ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border-color)', borderRadius: '8px',
          color: 'var(--gold-primary)', fontSize: '0.85rem', fontWeight: 600,
          transform: 'none', boxShadow: 'none',
        }}>
        <Database size={15} />
        Saved Searches
        <span style={{ background: 'rgba(212,175,55,0.2)', borderRadius: '20px',
          padding: '1px 8px', fontSize: '0.72rem' }}>{searches.length}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="mr-card" style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {searches.length === 0
                ? '⚠️ No saved searches yet — run any tab below to auto-save results'
                : `${Object.keys(grouped).length} industries saved · ${searches.length} tabs`}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={fetchSearches} style={{ width: 'auto', marginBottom: 0,
                padding: '4px 10px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)', color: 'var(--text-muted)',
                borderRadius: '6px', transform: 'none', boxShadow: 'none' }}>
                <RefreshCw size={12} style={{ display: 'inline', marginRight: '4px' }} />
                Refresh
              </button>
              {searches.length > 0 && (
                <button onClick={handleClearAll} style={{ width: 'auto', marginBottom: 0,
                  padding: '4px 10px', fontSize: '0.75rem', background: 'rgba(220,53,69,0.1)',
                  border: '1px solid rgba(220,53,69,0.3)', color: '#ff6b6b',
                  borderRadius: '6px', transform: 'none', boxShadow: 'none' }}>
                  Clear All
                </button>
              )}
            </div>
          </div>

          {loading && <LoadingSpinner message="Loading saved searches..." />}

          {!loading && Object.values(grouped).map((group, gi) => (
            <div key={gi} style={{ marginBottom: '1rem', padding: '0.875rem',
              background: 'rgba(0,0,0,0.25)', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.05)' }}>
              {/* Industry header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, color: 'var(--gold-primary)', fontSize: '0.9rem' }}>
                  {group.industry}
                </span>
                {group.problem && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)',
                    background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '2px 8px' }}>
                    {group.problem}
                  </span>
                )}
              </div>

              {/* Tab chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {group.tabs.map((s, ti) => {
                  const Icon = TAB_ICONS[s.tab] || BarChart2;
                  const isActive = currentIndustry?.toLowerCase() === s.industry.toLowerCase()
                    && (currentProblem || '') === (s.problem || '');
                  return (
                    <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: '4px',
                      background: isActive ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isActive ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: '6px', padding: '4px 10px', fontSize: '0.78rem' }}>
                      <button
                        onClick={() => onLoad(s.industry, s.problem, s.tab)}
                        style={{ all: 'unset', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', gap: '5px', color: isActive ? 'var(--gold-primary)' : 'var(--text-muted)' }}>
                        <Icon size={12} />
                        {TAB_LABELS[s.tab] || s.tab}
                      </button>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginLeft: '4px' }}>
                        {s.saved_at?.slice(0, 10)}
                      </span>
                      <button
                        onClick={(e) => handleDelete(e, s.cache_key)}
                        style={{ all: 'unset', cursor: 'pointer', color: 'rgba(255,107,107,0.5)',
                          marginLeft: '4px', lineHeight: 1 }}
                        title="Delete this saved result">
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
const MR_TABS = [
  { id: 'overview',      label: 'Market Overview',       icon: TrendingUp },
  { id: 'pain-points',   label: 'Pain Points',            icon: AlertCircle },
  { id: 'opportunities', label: 'Opportunities',          icon: Lightbulb },
  { id: 'audience',      label: 'Audience Intel',         icon: Users },
  { id: 'deep-reddit',   label: 'Deep Reddit',            icon: MessageSquare },
  { id: 'competitors',   label: 'Competitor Reviews',     icon: GitBranch },
  { id: 'pricing',       label: 'Willingness to Pay',     icon: DollarSign },
  { id: 'validation',    label: 'Validation Score',       icon: BarChart2 },
  { id: 'deep-validation', label: 'Deep Analysis ✦',     icon: Layers },
];

export default function MarketResearch() {
  const [industry, setIndustry] = useState('');
  const [problem, setProblem] = useState('');
  const [submitted, setSubmitted] = useState({ industry: '', problem: '' });
  const [activeTab, setActiveTab] = useState('pain-points');
  const savedPanelRef = useRef(null); // ref to trigger saved-searches refresh

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!industry.trim()) return;
    setSubmitted({ industry: industry.trim(), problem: problem.trim() });
  };

  // Load a saved search — sets inputs + switches to that tab
  const handleLoadSaved = (savedIndustry, savedProblem, savedTab) => {
    setIndustry(savedIndustry);
    setProblem(savedProblem || '');
    setSubmitted({ industry: savedIndustry, problem: savedProblem || '' });
    const tabMap = { pain: 'pain-points', overview: 'overview', opp: 'opportunities',
                     audience: 'audience', validation: 'validation',
                     deep_reddit: 'deep-reddit', competitors: 'competitors',
                     pricing: 'pricing', deep_validation: 'deep-validation' };
    setActiveTab(tabMap[savedTab] || savedTab);
  };

  // Called by tabs after they finish saving — refreshes the saved panel list
  const notifySaved = useCallback(() => {
    if (savedPanelRef.current) savedPanelRef.current();
  }, []);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, color: 'var(--gold-primary)', fontSize: '1.5rem' }}>
          Market Research Analytics
        </h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          AI-powered market intelligence using Reddit, Hacker News, App Store & Google Trends
        </p>
      </div>

      {/* Input form */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label style={{ marginBottom: '6px' }}>Industry / Market</label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%',
                transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="text" placeholder="e.g. restaurants, SaaS, fitness"
                value={industry} onChange={e => setIndustry(e.target.value)}
                style={{ paddingLeft: '34px' }} />
            </div>
          </div>
          <div style={{ flex: '1 1 220px' }}>
            <label style={{ marginBottom: '6px' }}>Problem Area <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
            <input type="text" placeholder="e.g. inventory management, scheduling"
              value={problem} onChange={e => setProblem(e.target.value)} />
          </div>
          <button type="submit" disabled={!industry.trim()}
            style={{ flex: '0 0 auto', width: 'auto', padding: '0.75rem 1.75rem',
              marginBottom: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={16} /> Analyze Market
          </button>
        </form>
        {submitted.industry && (
          <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Analyzing: <span style={{ color: 'var(--gold-primary)', fontWeight: 600 }}>"{submitted.industry}"</span>
            {submitted.problem && <> — <span style={{ color: 'var(--gold-primary)' }}>"{submitted.problem}"</span></>}
          </div>
        )}
      </div>

      {/* Saved Searches Panel */}
      <SavedSearchesPanel
        onLoad={handleLoadSaved}
        currentIndustry={submitted.industry}
        currentProblem={submitted.problem}
        refreshRef={savedPanelRef}
      />

      {/* Sub-tab navigation */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', background: 'rgba(0,0,0,0.2)',
        padding: '6px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
        {MR_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                flex: '1 1 auto', width: 'auto', marginBottom: 0, padding: '0.6rem 1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                fontSize: '0.82rem', fontWeight: 600, borderRadius: '7px',
                background: isActive ? 'linear-gradient(135deg, var(--gold-primary), #b8860b)' : 'transparent',
                color: isActive ? '#000' : 'var(--text-muted)',
                border: isActive ? 'none' : '1px solid transparent',
                boxShadow: isActive ? '0 4px 12px var(--accent-glow)' : 'none',
                transform: 'none',
                transition: 'all 0.2s ease',
              }}>
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {!submitted.industry ? (
          <EmptyState icon={Search} message="Enter an industry above and click Analyze Market to get started." />
        ) : (
          <>
            {activeTab === 'overview'        && <MarketOverviewTab    industry={submitted.industry} problem={submitted.problem} onSaved={notifySaved} />}
            {activeTab === 'pain-points'     && <PainPointsTab        industry={submitted.industry} problem={submitted.problem} onSaved={notifySaved} />}
            {activeTab === 'opportunities'   && <OpportunitiesTab     industry={submitted.industry} problem={submitted.problem} onSaved={notifySaved} />}
            {activeTab === 'audience'        && <AudienceTab          industry={submitted.industry} problem={submitted.problem} onSaved={notifySaved} />}
            {activeTab === 'deep-reddit'     && <DeepRedditTab        industry={submitted.industry} problem={submitted.problem} onSaved={notifySaved} />}
            {activeTab === 'competitors'     && <CompetitorReviewsTab industry={submitted.industry} problem={submitted.problem} onSaved={notifySaved} />}
            {activeTab === 'pricing'         && <PricingSignalsTab    industry={submitted.industry} problem={submitted.problem} onSaved={notifySaved} />}
            {activeTab === 'validation'      && <ValidationTab        industry={submitted.industry} problem={submitted.problem} onSaved={notifySaved} />}
            {activeTab === 'deep-validation' && <DeepValidationTab    industry={submitted.industry} problem={submitted.problem} onSaved={notifySaved} />}
          </>
        )}
      </div>
    </div>
  );
}
