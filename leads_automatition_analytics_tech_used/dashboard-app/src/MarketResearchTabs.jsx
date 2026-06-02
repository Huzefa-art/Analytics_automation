import React, { useState, useCallback } from 'react';
import axios from 'axios';
import {
  AlertCircle, RefreshCw, MessageSquare, GitBranch,
  DollarSign, Layers, ExternalLink, Calendar, ChevronDown,
  ChevronUp, CheckCircle, XCircle, AlertTriangle, Loader,
  Star, Zap, Target, BarChart2
} from 'lucide-react';

const API = '/api/market';

// ── Shared helpers (duplicated here to keep this file self-contained) ─────────
function SentimentBadge({ sentiment }) {
  const map = {
    negative: { bg: 'rgba(220,53,69,0.15)', color: '#ff6b6b', border: 'rgba(220,53,69,0.3)', label: '● Negative' },
    positive: { bg: 'rgba(40,167,69,0.15)',  color: '#39ff14', border: 'rgba(40,167,69,0.3)', label: '● Positive' },
    neutral:  { bg: 'rgba(108,117,125,0.15)',color: '#a0a0a0', border: 'rgba(108,117,125,0.3)',label: '● Neutral' },
  };
  const s = map[sentiment] || map.neutral;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function SourceTag({ source, url, date }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--border-color)', borderRadius: '4px', padding: '2px 8px' }}>{source}</span>
      {date && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Calendar size={11} /> {date}
      </span>}
      {url && <a href={url} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: '0.72rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}
        onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
        onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>
        <ExternalLink size={11} /> View Source
      </a>}
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
      <span style={{ fontSize: '0.9rem', maxWidth: '320px' }}>{message}</span>
    </div>
  );
}

function TagList({ items, color = 'var(--gold-primary)', bg = 'rgba(212,175,55,0.08)' }) {
  if (!items?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '0.75rem' }}>
      {items.map((item, i) => (
        <span key={i} style={{ background: bg, border: `1px solid ${color}33`,
          borderRadius: '20px', padding: '4px 14px', fontSize: '0.82rem', color }}>
          {item}
        </span>
      ))}
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

// ── Tab: Deep Reddit Analysis ─────────────────────────────────────────────────
export function DeepRedditTab({ industry, problem, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});

  const doFetch = useCallback(async () => {
    if (!industry) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await axios.post(`${API}/deep-reddit`, { industry, problem });
      setData(res.data);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch deep Reddit analysis');
    } finally { setLoading(false); }
  }, [industry, problem, onSaved]);

  React.useEffect(() => { if (industry) doFetch(); }, [doFetch]);

  if (loading) return <LoadingSpinner message="Pulling top Reddit comments via Arctic Shift + NVIDIA AI analysis..." />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <EmptyState icon={MessageSquare} message="Submit an industry to run deep Reddit thread analysis." />;

  const { analysis: ai, comments, total_comments } = data;

  const Section = ({ title, items, color, icon: Icon }) => (
    items?.length > 0 ? (
      <div className="mr-card">
        <div className="mr-card-header">
          <Icon size={16} style={{ color }} />
          <span>{title}</span>
          <span className="mr-source-chip">NVIDIA AI</span>
        </div>
        <TagList items={items} color={color} bg={`${color}15`} />
      </div>
    ) : null
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="mr-card" style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ff6314' }}>{total_comments}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Reddit Comments</span>
        </div>
        <button onClick={doFetch} style={{ width: 'auto', padding: '0.75rem 1.25rem',
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: 0 }}>
          <RefreshCw size={14} /> Load Saved
        </button>
        <button onClick={async () => { try { await axios.post(`${API}/refresh/deep_reddit`, { industry, problem }); doFetch(); } catch { doFetch(); } }}
          style={{ width: 'auto', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '0.85rem', marginBottom: 0, background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-color)', color: 'var(--text-muted)', transform: 'none', boxShadow: 'none' }}>
          <RefreshCw size={14} /> Re-fetch Fresh
        </button>
      </div>

      {/* AI Summary */}
      {ai?.summary && (
        <div className="mr-card" style={{ borderLeft: '3px solid #ff6314' }}>
          <div className="mr-card-header">
            <MessageSquare size={16} style={{ color: '#ff6314' }} />
            <span>Deep Insight Summary</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
            {ai.summary}
          </p>
        </div>
      )}

      {/* JTBD sections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        <Section title="Jobs to Be Done" items={ai?.jtbd} color="var(--gold-primary)" icon={Target} />
        <Section title="Feature Requests" items={ai?.feature_requests} color="#39ff14" icon={Zap} />
        <Section title="Current Workarounds" items={ai?.workarounds} color="#ffdf00" icon={AlertTriangle} />
        <Section title="Tools People Abandoned" items={ai?.abandoned_tools} color="#ff6b6b" icon={XCircle} />
        <Section title="Unmet Needs (No Solution Exists)" items={ai?.unmet_needs} color="#5ac8fa" icon={AlertCircle} />
      </div>

      {/* Top comments */}
      {comments?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <MessageSquare size={16} style={{ color: 'var(--text-muted)' }} />
            <span>Top Upvoted Comments</span>
            <span className="mr-source-chip">Arctic Shift</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '0.75rem' }}>
            {comments.slice(0, 8).map((c, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '6px',
                padding: '0.875rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6, fontStyle: 'italic' }}>
                    "{c.body}"
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                    <SentimentBadge sentiment={c.sentiment} />
                    <span style={{ fontSize: '0.7rem', color: '#ff6314' }}>▲ {c.score}</span>
                  </div>
                </div>
                <SourceTag source={c.source} url={c.url} date={c.date} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Competitor Reviews ───────────────────────────────────────────────────
export function CompetitorReviewsTab({ industry, problem, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doFetch = useCallback(async () => {
    if (!industry) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await axios.post(`${API}/competitor-reviews`, { industry, problem });
      setData(res.data);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch competitor reviews');
    } finally { setLoading(false); }
  }, [industry, problem, onSaved]);

  React.useEffect(() => { if (industry) doFetch(); }, [doFetch]);

  if (loading) return <LoadingSpinner message="Scraping G2 & Capterra competitor reviews..." />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <EmptyState icon={GitBranch} message="Submit an industry to mine competitor reviews." />;

  const { reviews, competitors, weakness_map: wm, total_reviews } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Stats */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { label: 'Reviews Scraped', value: total_reviews, color: 'var(--gold-primary)' },
          { label: 'Competitors Analyzed', value: competitors?.length || 0, color: '#007aff' },
        ].map((s, i) => (
          <div key={i} className="mr-card" style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.label}</span>
          </div>
        ))}
        <button onClick={doFetch} style={{ width: 'auto', padding: '0.75rem 1.25rem',
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: 0 }}>
          <RefreshCw size={14} /> Load Saved
        </button>
      </div>

      {/* AI Weakness Map */}
      {wm?.summary && (
        <div className="mr-card" style={{ borderLeft: '3px solid #ff6b6b' }}>
          <div className="mr-card-header">
            <GitBranch size={16} style={{ color: '#ff6b6b' }} />
            <span>Competitor Weakness Summary</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
            {wm.summary}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {wm?.common_complaints?.length > 0 && (
          <div className="mr-card">
            <div className="mr-card-header">
              <AlertCircle size={16} style={{ color: '#ff6b6b' }} />
              <span>Common Complaints</span>
              <span className="mr-source-chip">NVIDIA AI</span>
            </div>
            <TagList items={wm.common_complaints} color="#ff6b6b" bg="rgba(255,107,107,0.08)" />
          </div>
        )}
        {wm?.missing_features?.length > 0 && (
          <div className="mr-card">
            <div className="mr-card-header">
              <Zap size={16} style={{ color: '#39ff14' }} />
              <span>Missing Features (Opportunity)</span>
              <span className="mr-source-chip">NVIDIA AI</span>
            </div>
            <TagList items={wm.missing_features} color="#39ff14" bg="rgba(57,255,20,0.08)" />
          </div>
        )}
        {wm?.opportunity_gaps?.length > 0 && (
          <div className="mr-card">
            <div className="mr-card-header">
              <Target size={16} style={{ color: 'var(--gold-primary)' }} />
              <span>Opportunity Gaps</span>
              <span className="mr-source-chip">NVIDIA AI</span>
            </div>
            <TagList items={wm.opportunity_gaps} color="var(--gold-primary)" />
          </div>
        )}
      </div>

      {/* Competitors listed */}
      {competitors?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <GitBranch size={16} style={{ color: 'var(--text-muted)' }} />
            <span>Competitors Analyzed</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '0.75rem' }}>
            {competitors.map((c, i) => (
              <span key={i} style={{ background: 'rgba(0,122,255,0.1)', border: '1px solid rgba(0,122,255,0.25)',
                borderRadius: '6px', padding: '4px 14px', fontSize: '0.82rem', color: '#5ac8fa' }}>
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Raw reviews */}
      {reviews?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <Star size={16} style={{ color: 'var(--text-muted)' }} />
            <span>Raw Reviews</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '0.75rem' }}>
            {reviews.slice(0, 8).map((r, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '6px',
                padding: '0.875rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6, fontStyle: 'italic' }}>
                    "{r.text}"
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                    <SentimentBadge sentiment={r.sentiment} />
                    <span style={{ fontSize: '0.7rem', color: 'var(--gold-primary)' }}>{'★'.repeat(Math.round(r.rating))}</span>
                  </div>
                </div>
                <SourceTag source={r.source} url={r.url} date={r.date} />
              </div>
            ))}
          </div>
        </div>
      )}

      {total_reviews === 0 && (
        <div style={{ background: 'rgba(255,223,0,0.08)', border: '1px solid rgba(255,223,0,0.2)',
          borderRadius: '8px', padding: '1rem', color: '#ffdf00', fontSize: '0.88rem' }}>
          ⚠️ No reviews scraped — G2/Capterra may have blocked the request or this industry has no mapped competitors yet.
          The AI weakness map is still generated from available data.
        </div>
      )}
    </div>
  );
}

// ── Tab: Willingness to Pay ───────────────────────────────────────────────────
export function PricingSignalsTab({ industry, problem, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doFetch = useCallback(async () => {
    if (!industry) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await axios.post(`${API}/pricing-signals`, { industry, problem });
      setData(res.data);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to fetch pricing signals');
    } finally { setLoading(false); }
  }, [industry, problem, onSaved]);

  React.useEffect(() => { if (industry) doFetch(); }, [doFetch]);

  if (loading) return <LoadingSpinner message="Scanning Reddit & HN for pricing discussions + competitor pricing..." />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <EmptyState icon={DollarSign} message="Submit an industry to analyze willingness to pay." />;

  const { synthesis: s, raw_signals, competitor_pricing } = data;

  const sensitivityColor = { high: '#ff6b6b', medium: '#ffdf00', low: '#39ff14' };
  const sc = sensitivityColor[s?.price_sensitivity?.toLowerCase()] || 'var(--gold-primary)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Key metrics */}
      {s && Object.keys(s).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'Price Sensitivity', value: s.price_sensitivity || '—', color: sc },
            { label: 'Acceptable Range', value: s.acceptable_price_range || '—', color: 'var(--gold-primary)' },
            { label: 'Competitor Range', value: s.competitor_price_range || '—', color: '#007aff' },
            { label: 'Pricing Model', value: s.pricing_model_preference || '—', color: '#39ff14' },
          ].map((m, i) => (
            <div key={i} className="mr-card" style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.5px', marginBottom: '6px' }}>{m.label}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* AI Recommendation */}
      {s?.recommendation && (
        <div className="mr-card" style={{ borderLeft: '3px solid var(--gold-primary)' }}>
          <div className="mr-card-header">
            <DollarSign size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Pricing Strategy Recommendation</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
            {s.recommendation}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {s?.features_worth_premium?.length > 0 && (
          <div className="mr-card">
            <div className="mr-card-header">
              <CheckCircle size={16} style={{ color: '#39ff14' }} />
              <span>Features Worth Premium Price</span>
              <span className="mr-source-chip">NVIDIA AI</span>
            </div>
            <TagList items={s.features_worth_premium} color="#39ff14" bg="rgba(57,255,20,0.08)" />
          </div>
        )}
        {s?.price_objections?.length > 0 && (
          <div className="mr-card">
            <div className="mr-card-header">
              <XCircle size={16} style={{ color: '#ff6b6b' }} />
              <span>Price Objections / Cancellation Reasons</span>
              <span className="mr-source-chip">NVIDIA AI</span>
            </div>
            <TagList items={s.price_objections} color="#ff6b6b" bg="rgba(255,107,107,0.08)" />
          </div>
        )}
      </div>

      {/* Competitor pricing */}
      {competitor_pricing?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <DollarSign size={16} style={{ color: '#007aff' }} />
            <span>Competitor Pricing Pages</span>
            <span className="mr-source-chip">SerpAPI</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '0.75rem' }}>
            {competitor_pricing.map((p, i) => (
              <div key={i} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '6px',
                padding: '0.875rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#5ac8fa', marginBottom: '6px' }}>
                  {p.competitor}
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                  {p.snippet}
                </p>
                <SourceTag source={p.source} url={p.url} date={new Date().toISOString().slice(0,10)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw signals */}
      {raw_signals?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <MessageSquare size={16} style={{ color: 'var(--text-muted)' }} />
            <span>Raw Pricing Discussions</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.75rem' }}>
            {raw_signals.slice(0, 8).map((s, i) => (
              <div key={i} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {s.text}
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

// ── Tab: Deep Validation (Master AI Synthesis) ────────────────────────────────
export function DeepValidationTab({ industry, problem, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doFetch = useCallback(async () => {
    if (!industry) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await axios.post(`${API}/deep-validation`, { industry, problem });
      setData(res.data);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to run deep validation');
    } finally { setLoading(false); }
  }, [industry, problem, onSaved]);

  React.useEffect(() => { if (industry) doFetch(); }, [doFetch]);

  if (loading) return <LoadingSpinner message="Running master AI synthesis across ALL data sources — this takes 60-90 seconds..." />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return <EmptyState icon={Layers} message="Submit an industry to run the full cross-source deep analysis." />;

  const { synthesis: s, data_sources_used } = data;
  const rec = s?.final_recommendation || 'research more';
  const recConfig = {
    pursue:          { color: '#39ff14', bg: 'rgba(57,255,20,0.1)',   border: 'rgba(57,255,20,0.3)',   label: '✅ Pursue This Market' },
    'research more': { color: '#ffdf00', bg: 'rgba(255,223,0,0.1)',   border: 'rgba(255,223,0,0.3)',   label: '⚠️ Research More' },
    avoid:           { color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)', border: 'rgba(255,107,107,0.3)', label: '❌ Avoid This Market' },
  };
  const rc = recConfig[rec] || recConfig['research more'];

  const scores = s?.updated_scores || {};
  const scoreList = [
    { key: 'pain_intensity',      label: 'Pain Intensity',      color: '#ff6b6b' },
    { key: 'market_size',         label: 'Market Size',         color: 'var(--gold-primary)' },
    { key: 'competition_density', label: 'Competition Density', color: '#007aff' },
    { key: 'willingness_to_pay',  label: 'Willingness to Pay',  color: '#ffdf00' },
    { key: 'overall_opportunity', label: 'Overall Opportunity', color: '#39ff14' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Data sources used */}
      <div className="mr-card">
        <div className="mr-card-header">
          <Layers size={16} style={{ color: 'var(--gold-primary)' }} />
          <span>Data Sources Synthesized</span>
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

      {/* Updated score rings */}
      {Object.keys(scores).length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <BarChart2 size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Updated Validation Scores (All Sources)</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap',
            gap: '1.5rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
            {scoreList.map(({ key, label, color }) => scores[key] && (
              <ScoreRing key={key} score={scores[key].score || 0} label={label} color={color} />
            ))}
          </div>
        </div>
      )}

      {/* Score explanations */}
      {scoreList.map(({ key, label, color }) => scores[key] && (
        <div key={key} className="mr-card" style={{ borderLeft: `3px solid ${color}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, color, minWidth: '48px' }}>
              {scores[key].score}/10
            </span>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>{label}</div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {scores[key].explanation}
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Cross-source patterns */}
      {s?.cross_source_patterns?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <Layers size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Cross-Source Patterns</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.75rem' }}>
            {s.cross_source_patterns.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--gold-primary)', fontWeight: 700, flexShrink: 0 }}>→</span>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.6 }}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contradictions */}
      {s?.contradictions?.length > 0 && (
        <div className="mr-card" style={{ borderLeft: '3px solid #ffdf00' }}>
          <div className="mr-card-header">
            <AlertTriangle size={16} style={{ color: '#ffdf00' }} />
            <span>Contradictions Detected</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.75rem' }}>
            {s.contradictions.map((c, i) => (
              <div key={i} style={{ background: 'rgba(255,223,0,0.06)', borderRadius: '6px',
                padding: '0.75rem', border: '1px solid rgba(255,223,0,0.15)' }}>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.6 }}>⚡ {c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Highest opportunity pains */}
      {s?.highest_opportunity_pains?.length > 0 && (
        <div className="mr-card" style={{ borderLeft: '3px solid #39ff14' }}>
          <div className="mr-card-header">
            <Target size={16} style={{ color: '#39ff14' }} />
            <span>Highest Opportunity Pains (No Existing Solution)</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <TagList items={s.highest_opportunity_pains} color="#39ff14" bg="rgba(57,255,20,0.08)" />
        </div>
      )}

      {/* Recommended features */}
      {s?.recommended_features?.length > 0 && (
        <div className="mr-card">
          <div className="mr-card-header">
            <Zap size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Top Features to Build</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.75rem' }}>
            {s.recommended_features.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--gold-primary)', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.6 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GTM insight */}
      {s?.go_to_market_insight && (
        <div className="mr-card">
          <div className="mr-card-header">
            <Target size={16} style={{ color: '#5ac8fa' }} />
            <span>Go-to-Market Insight</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
            {s.go_to_market_insight}
          </p>
        </div>
      )}

      {/* Final summary */}
      {s?.final_summary && (
        <div className="mr-card">
          <div className="mr-card-header">
            <Star size={16} style={{ color: 'var(--gold-primary)' }} />
            <span>Executive Summary</span>
            <span className="mr-source-chip">NVIDIA AI</span>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.8 }}>
            {s.final_summary}
          </p>
        </div>
      )}

      {/* Final recommendation */}
      <div style={{ background: rc.bg, border: `1px solid ${rc.border}`, borderRadius: '10px', padding: '1.25rem 1.5rem' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: rc.color, marginBottom: '8px' }}>
          {rc.label}
        </div>
      </div>

      {/* Refresh button */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={doFetch} style={{ width: 'auto', padding: '0.75rem 1.25rem',
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: 0 }}>
          <RefreshCw size={14} /> Load Saved
        </button>
        <button onClick={async () => { try { await axios.post(`${API}/refresh/deep_validation`, { industry, problem }); doFetch(); } catch { doFetch(); } }}
          style={{ width: 'auto', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '0.85rem', marginBottom: 0, background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-color)', color: 'var(--text-muted)', transform: 'none', boxShadow: 'none' }}>
          <RefreshCw size={14} /> Re-run Full Analysis
        </button>
      </div>
    </div>
  );
}
