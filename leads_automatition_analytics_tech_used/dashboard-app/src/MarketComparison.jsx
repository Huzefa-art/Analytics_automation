import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  GitCompare, Plus, X, RefreshCw, TrendingUp, TrendingDown,
  Minus, AlertCircle, CheckCircle, AlertTriangle, Star,
  BarChart2, Loader, ChevronUp, ChevronDown, Award
} from 'lucide-react';

const API = '/api/market';

// ── Helpers ───────────────────────────────────────────────────────────────────
function LoadingSpinner({ message }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '3rem', gap: '1rem', color: 'var(--text-muted)' }}>
      <Loader size={32} style={{ color: 'var(--gold-primary)', animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: '0.9rem' }}>{message || 'Loading...'}</span>
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

// Score bar — horizontal fill bar
function ScoreBar({ score, max = 10, color = 'var(--gold-primary)', highlight = false }) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.06)',
        borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color,
          borderRadius: '4px', transition: 'width 0.8s ease',
          boxShadow: highlight ? `0 0 8px ${color}` : 'none' }} />
      </div>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: highlight ? color : 'var(--text-main)',
        minWidth: '28px', textAlign: 'right' }}>
        {score > 0 ? `${score}/10` : '—'}
      </span>
    </div>
  );
}

// Trend icon
function TrendIcon({ signal }) {
  if (signal === 'rising')  return <TrendingUp  size={16} style={{ color: '#39ff14' }} />;
  if (signal === 'falling') return <TrendingDown size={16} style={{ color: '#ff6b6b' }} />;
  return <Minus size={16} style={{ color: '#a0a0a0' }} />;
}

// Recommendation badge
function RecBadge({ rec }) {
  const map = {
    pursue:          { color: '#39ff14', bg: 'rgba(57,255,20,0.12)',   label: '✅ Pursue' },
    'research more': { color: '#ffdf00', bg: 'rgba(255,223,0,0.12)',   label: '⚠️ Research' },
    avoid:           { color: '#ff6b6b', bg: 'rgba(255,107,107,0.12)', label: '❌ Avoid' },
  };
  const s = map[rec?.toLowerCase()] || { color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.05)', label: rec || '—' };
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}33`,
      borderRadius: '6px', padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

// Column header card
const COL_COLORS = ['var(--gold-primary)', '#5ac8fa', '#39ff14', '#ff6b6b'];

function ColHeader({ snap, index, onRemove, isWinner }) {
  const color = COL_COLORS[index] || 'var(--gold-primary)';
  return (
    <div style={{ background: 'var(--bg-card)', border: `1px solid ${color}44`,
      borderRadius: '10px', padding: '1rem', position: 'relative',
      borderTop: `3px solid ${color}` }}>
      {isWinner && (
        <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--gold-primary)', color: '#000', borderRadius: '20px',
          padding: '2px 10px', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
          🏆 Recommended
        </div>
      )}
      <button onClick={() => onRemove(index)}
        style={{ position: 'absolute', top: '8px', right: '8px', all: 'unset',
          cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, fontSize: '1rem' }}
        title="Remove from comparison">✕</button>
      <div style={{ fontWeight: 700, color, fontSize: '1rem', marginBottom: '4px',
        paddingRight: '20px' }}>
        {snap.industry}
      </div>
      {snap.problem && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{snap.problem}</div>
      )}
      {!snap.has_data && (
        <div style={{ marginTop: '6px', fontSize: '0.72rem', color: '#ffdf00' }}>
          ⚠️ Limited data — run Validation tab first
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MarketComparison() {
  const [available, setAvailable]   = useState([]);
  const [selected, setSelected]     = useState([]);   // [{industry, problem}]
  const [result, setResult]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [loadingAvail, setLoadingAvail] = useState(true);
  const [error, setError]           = useState('');

  // Load available markets on mount
  useEffect(() => {
    (async () => {
      setLoadingAvail(true);
      try {
        const res = await axios.get(`${API}/compare/available`);
        setAvailable(res.data || []);
      } catch (e) {
        console.error('Failed to load available markets', e);
      } finally { setLoadingAvail(false); }
    })();
  }, []);

  const addMarket = (market) => {
    if (selected.length >= 4) return;
    const already = selected.some(s => s.industry === market.industry && s.problem === market.problem);
    if (already) return;
    setSelected(prev => [...prev, { industry: market.industry, problem: market.problem }]);
    setResult(null);
  };

  const removeMarket = (index) => {
    setSelected(prev => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  const runComparison = useCallback(async () => {
    if (selected.length < 2) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await axios.post(`${API}/compare`, { markets: selected });
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Comparison failed');
    } finally { setLoading(false); }
  }, [selected]);

  const snapshots  = result?.snapshots  || [];
  const ai         = result?.ai_insights || {};
  const winnerLabel = ai?.recommended_market?.market || '';

  // Find best score per metric row for highlighting
  const bestScore = (key) => {
    if (!snapshots.length) return -1;
    return Math.max(...snapshots.map(s => s[key] || 0));
  };

  const METRIC_ROWS = [
    { key: 'overall_score',  label: 'Overall Opportunity', color: '#39ff14' },
    { key: 'pain_intensity', label: 'Pain Intensity',       color: '#ff6b6b' },
    { key: 'market_size',    label: 'Market Size Signal',   color: 'var(--gold-primary)' },
    { key: 'competition',    label: 'Competition Density',  color: '#007aff',
      note: 'lower = less competition' },
    { key: 'wtp_score',      label: 'Willingness to Pay',   color: '#ffdf00' },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, color: 'var(--gold-primary)', fontSize: '1.5rem' }}>
          Market Comparison
        </h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          Compare 2–4 researched markets side by side using saved data — no new scraping needed
        </p>
      </div>

      {/* Market selector */}
      <div className="mr-card">
        <div className="mr-card-header" style={{ marginBottom: '1rem' }}>
          <GitCompare size={16} style={{ color: 'var(--gold-primary)' }} />
          <span>Select Markets to Compare</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {selected.length}/4 selected
          </span>
        </div>

        {loadingAvail ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', padding: '0.5rem 0' }}>
            Loading available markets...
          </div>
        ) : available.length === 0 ? (
          <div style={{ background: 'rgba(255,223,0,0.08)', border: '1px solid rgba(255,223,0,0.2)',
            borderRadius: '8px', padding: '1rem', color: '#ffdf00', fontSize: '0.88rem' }}>
            ⚠️ No researched markets found. Go to Market Research, search an industry, and run the
            Validation Score tab first. Then come back here to compare.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {available.map((m, i) => {
              const isSelected = selected.some(s => s.industry === m.industry && s.problem === m.problem);
              const isFull = selected.length >= 4 && !isSelected;
              return (
                <button key={i} onClick={() => isSelected ? null : addMarket(m)}
                  disabled={isFull || isSelected}
                  style={{
                    width: 'auto', marginBottom: 0, padding: '6px 14px',
                    fontSize: '0.82rem', fontWeight: 600, borderRadius: '20px',
                    background: isSelected ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isSelected ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)'}`,
                    color: isSelected ? 'var(--gold-primary)' : 'var(--text-muted)',
                    cursor: isSelected || isFull ? 'default' : 'pointer',
                    opacity: isFull ? 0.4 : 1,
                    transform: 'none', boxShadow: 'none',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                  {isSelected ? <CheckCircle size={12} /> : <Plus size={12} />}
                  {m.label}
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: '2px' }}>
                    ({m.tabs?.length || 0} tabs)
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected chips */}
        {selected.length > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '8px',
            paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
              Comparing:
            </span>
            {selected.map((s, i) => (
              <span key={i} style={{ background: `${COL_COLORS[i]}18`,
                border: `1px solid ${COL_COLORS[i]}44`, borderRadius: '6px',
                padding: '4px 10px', fontSize: '0.8rem', color: COL_COLORS[i],
                display: 'flex', alignItems: 'center', gap: '6px' }}>
                {s.industry}{s.problem ? ` / ${s.problem}` : ''}
                <button onClick={() => removeMarket(i)}
                  style={{ all: 'unset', cursor: 'pointer', color: 'inherit', lineHeight: 1 }}>✕</button>
              </span>
            ))}
          </div>
        )}

        {/* Run button */}
        <div style={{ marginTop: '1rem' }}>
          <button onClick={runComparison} disabled={selected.length < 2 || loading}
            style={{ width: 'auto', padding: '0.75rem 2rem', marginBottom: 0,
              display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem',
              opacity: selected.length < 2 ? 0.5 : 1 }}>
            {loading ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <GitCompare size={16} />}
            {loading ? 'Comparing...' : `Compare ${selected.length} Markets`}
          </button>
          {selected.length < 2 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
              Select at least 2 markets
            </span>
          )}
        </div>
      </div>

      {error && <ErrorBox message={error} />}
      {loading && <LoadingSpinner message="Running AI comparison across all saved data..." />}

      {/* ── Results ── */}
      {result && !loading && (
        <>
          {/* Column headers */}
          <div style={{ display: 'grid', gap: '1rem',
            gridTemplateColumns: `180px repeat(${snapshots.length}, 1fr)` }}>
            <div /> {/* empty label column */}
            {snapshots.map((snap, i) => (
              <ColHeader key={i} snap={snap} index={i} onRemove={removeMarket}
                isWinner={snap.label === winnerLabel || snap.industry === winnerLabel} />
            ))}
          </div>

          {/* Score rows */}
          <div className="mr-card" style={{ padding: '1.25rem' }}>
            <div className="mr-card-header" style={{ marginBottom: '1.25rem' }}>
              <BarChart2 size={16} style={{ color: 'var(--gold-primary)' }} />
              <span>Score Comparison</span>
              <span className="mr-source-chip">NVIDIA AI</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {METRIC_ROWS.map(({ key, label, color, note }) => {
                const best = bestScore(key);
                return (
                  <div key={key} style={{ display: 'grid', gap: '1rem', alignItems: 'center',
                    gridTemplateColumns: `180px repeat(${snapshots.length}, 1fr)` }}>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>{label}</div>
                      {note && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{note}</div>}
                    </div>
                    {snapshots.map((snap, i) => {
                      const val = snap[key] || 0;
                      const isTop = val === best && best > 0;
                      return (
                        <div key={i}>
                          <ScoreBar score={val} color={COL_COLORS[i]} highlight={isTop} />
                          {isTop && <div style={{ fontSize: '0.65rem', color: COL_COLORS[i],
                            marginTop: '2px', textAlign: 'right' }}>▲ highest</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trend + WTP + Sources row */}
          <div className="mr-card" style={{ padding: '1.25rem' }}>
            <div className="mr-card-header" style={{ marginBottom: '1.25rem' }}>
              <TrendingUp size={16} style={{ color: 'var(--gold-primary)' }} />
              <span>Signals Comparison</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Trend direction */}
              <div style={{ display: 'grid', gap: '1rem', alignItems: 'center',
                gridTemplateColumns: `180px repeat(${snapshots.length}, 1fr)` }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  Trend Direction
                </div>
                {snapshots.map((snap, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <TrendIcon signal={snap.trend_signal} />
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-main)',
                      textTransform: 'capitalize' }}>{snap.trend_signal}</span>
                    {snap.trend_avg > 0 && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        ({snap.trend_avg}/100)
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* WTP sensitivity */}
              <div style={{ display: 'grid', gap: '1rem', alignItems: 'center',
                gridTemplateColumns: `180px repeat(${snapshots.length}, 1fr)` }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  Price Sensitivity
                </div>
                {snapshots.map((snap, i) => {
                  const sc = { high: '#ff6b6b', medium: '#ffdf00', low: '#39ff14' };
                  const c = sc[snap.wtp_sensitivity?.toLowerCase()] || 'var(--text-muted)';
                  return (
                    <div key={i} style={{ fontSize: '0.82rem', color: c, fontWeight: 600,
                      textTransform: 'capitalize' }}>
                      {snap.wtp_sensitivity || '—'}
                    </div>
                  );
                })}
              </div>

              {/* WTP range */}
              <div style={{ display: 'grid', gap: '1rem', alignItems: 'center',
                gridTemplateColumns: `180px repeat(${snapshots.length}, 1fr)` }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  Acceptable Price Range
                </div>
                {snapshots.map((snap, i) => (
                  <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>
                    {snap.wtp_range || '—'}
                  </div>
                ))}
              </div>

              {/* Total sources */}
              <div style={{ display: 'grid', gap: '1rem', alignItems: 'center',
                gridTemplateColumns: `180px repeat(${snapshots.length}, 1fr)` }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  Total Sources Analyzed
                </div>
                {snapshots.map((snap, i) => {
                  const best = Math.max(...snapshots.map(s => s.total_sources || 0));
                  const isTop = snap.total_sources === best && best > 0;
                  return (
                    <div key={i} style={{ fontSize: '0.88rem', fontWeight: 700,
                      color: isTop ? COL_COLORS[i] : 'var(--text-main)' }}>
                      {snap.total_sources || 0}
                      {isTop && <span style={{ fontSize: '0.65rem', marginLeft: '4px' }}>▲</span>}
                    </div>
                  );
                })}
              </div>

              {/* Recommendation */}
              <div style={{ display: 'grid', gap: '1rem', alignItems: 'center',
                gridTemplateColumns: `180px repeat(${snapshots.length}, 1fr)` }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  AI Recommendation
                </div>
                {snapshots.map((snap, i) => (
                  <div key={i}><RecBadge rec={snap.recommendation} /></div>
                ))}
              </div>
            </div>
          </div>

          {/* Top pain points per market */}
          <div className="mr-card" style={{ padding: '1.25rem' }}>
            <div className="mr-card-header" style={{ marginBottom: '1.25rem' }}>
              <AlertCircle size={16} style={{ color: '#ff6b6b' }} />
              <span>Top Pain Points per Market</span>
            </div>
            <div style={{ display: 'grid', gap: '1rem',
              gridTemplateColumns: `repeat(${snapshots.length}, 1fr)` }}>
              {snapshots.map((snap, i) => (
                <div key={i}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: COL_COLORS[i],
                    marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {snap.industry}
                  </div>
                  {snap.top_pains?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {snap.top_pains.map((pain, pi) => (
                        <div key={pi} style={{ background: 'rgba(255,107,107,0.08)',
                          border: '1px solid rgba(255,107,107,0.2)', borderRadius: '6px',
                          padding: '6px 10px', fontSize: '0.8rem', color: 'var(--text-main)' }}>
                          {pi + 1}. {pain}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      No pain data — run Pain Points tab
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* AI Insights */}
          {ai && Object.keys(ai).length > 0 && (
            <div className="mr-card" style={{ borderLeft: '3px solid var(--gold-primary)' }}>
              <div className="mr-card-header" style={{ marginBottom: '1.25rem' }}>
                <Award size={16} style={{ color: 'var(--gold-primary)' }} />
                <span>AI Comparison Insights</span>
                <span className="mr-source-chip">NVIDIA AI</span>
              </div>

              {/* Summary */}
              {ai.comparison_summary && (
                <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: 'var(--text-main)',
                  lineHeight: 1.8, padding: '1rem', background: 'rgba(212,175,55,0.05)',
                  borderRadius: '8px', border: '1px solid rgba(212,175,55,0.1)' }}>
                  {ai.comparison_summary}
                </p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {[
                  { key: 'recommended_market',  label: '🏆 Recommended Market',      color: 'var(--gold-primary)' },
                  { key: 'strongest_opportunity',label: '💪 Strongest Opportunity',   color: '#39ff14' },
                  { key: 'least_competition',    label: '🎯 Least Competition',        color: '#5ac8fa' },
                  { key: 'fastest_growing',      label: '🚀 Fastest Growing',          color: '#ffdf00' },
                ].map(({ key, label, color }) => ai[key] && (
                  <div key={key} style={{ background: `${color}0d`, border: `1px solid ${color}33`,
                    borderRadius: '8px', padding: '1rem' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color, marginBottom: '6px' }}>
                      {label}
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)',
                      marginBottom: '6px' }}>
                      {ai[key].market}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      {ai[key].reason}
                    </p>
                  </div>
                ))}
              </div>

              {/* Ranking */}
              {ai.ranking?.length > 0 && (
                <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem',
                  borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px',
                    textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Market Ranking (Best → Worst Opportunity)
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {ai.ranking.map((market, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px',
                        background: i === 0 ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${i === 0 ? 'var(--gold-primary)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: '6px', padding: '6px 12px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700,
                          color: i === 0 ? 'var(--gold-primary)' : 'var(--text-muted)' }}>
                          #{i + 1}
                        </span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>{market}</span>
                        {i === 0 && <Award size={12} style={{ color: 'var(--gold-primary)' }} />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
