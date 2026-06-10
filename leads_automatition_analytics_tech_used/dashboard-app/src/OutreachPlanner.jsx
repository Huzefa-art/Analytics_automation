import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Mail, Target, Sparkles, Send, Check, AlertCircle,
  RefreshCw, Filter, ExternalLink, FileText, ChevronRight,
  Globe, MessageSquare, CreditCard, Play, Clipboard,
  Radar, Eye, MapPin, Search, CheckCircle, ChevronDown, ChevronUp,
  Loader, Shield, Zap, TrendingUp, Users, Phone
} from 'lucide-react';

// ── Confidence score helpers ─────────────────────────────────────────────────
function getConfidenceColor(score) {
  if (score >= 81) return { bg: 'rgba(255,80,0,0.15)', border: 'rgba(255,80,0,0.4)', text: '#ff6020', label: 'HOT LEAD' };
  if (score >= 61) return { bg: 'rgba(40,167,69,0.12)', border: 'rgba(40,167,69,0.35)', text: '#39ff14', label: 'STRONG LEAD' };
  if (score >= 31) return { bg: 'rgba(255,193,7,0.12)', border: 'rgba(255,193,7,0.35)', text: '#ffdf00', label: 'WEAK LEAD' };
  return { bg: 'rgba(120,120,120,0.1)', border: 'rgba(120,120,120,0.3)', text: '#888', label: 'SKIP' };
}

function ConfidenceBadge({ score }) {
  const c = getConfidenceColor(score);
  return (
    <span style={{
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '20px',
      letterSpacing: '0.5px', whiteSpace: 'nowrap'
    }}>
      {score}% · {c.label}
    </span>
  );
}

// ── Compute confidence score for a lead against a pain point's signal plan ──
function computeLeadConfidence(lead, signalBlock) {
  if (!signalBlock || !signalBlock.signals || signalBlock.signals.length === 0) return { score: 0, confirmed: [], unconfirmed: [] };

  const confirmed = [];
  const unconfirmed = [];

  for (const sig of signalBlock.signals) {
    const weight = sig.weight || 0;
    let isConfirmed = false;

    if (sig.side === 'solution_gap') {
      // Check if lead is MISSING the solution (no CRM, no live chat, no payments, no ads)
      const theme = (signalBlock.pain_point || '').toLowerCase();
      const sigText = (sig.signal || '').toLowerCase();

      if (sigText.includes('chat') || sigText.includes('support') || theme.includes('support') || theme.includes('chat')) {
        const lc = lead['Live Chat / Support'] || lead['live_chat'] || '';
        isConfirmed = !lc || lc === 'N/A' || lc === '[]' || lc === '';
      } else if (sigText.includes('crm') || sigText.includes('automat') || theme.includes('crm')) {
        const crm = lead['CRM / Marketing Automation'] || lead['crm'] || '';
        isConfirmed = !crm || crm === 'N/A' || crm === '[]' || crm === '';
      } else if (sigText.includes('payment') || sigText.includes('order') || sigText.includes('booking') || theme.includes('payment') || theme.includes('order')) {
        const pay = lead['Payments'] || lead['payments'] || '';
        isConfirmed = !pay || pay === 'N/A' || pay === '[]' || pay === '';
      } else if (sigText.includes('ads') || sigText.includes('advertis') || theme.includes('ads')) {
        const ads = lead['Ads Active'] || lead['ads_active'] || '';
        isConfirmed = ads === 'No' || ads === 'N/A' || !ads;
      } else if (sigText.includes('website') || sigText.includes('web presence')) {
        const web = lead['Website'] || lead['website'] || '';
        isConfirmed = !web || web === 'N/A' || web === '';
      } else {
        // Generic: if no CMS and no website tools, likely has gap
        const cms = lead['CMS'] || lead['cms'] || '';
        isConfirmed = !cms || cms === 'N/A' || cms === '[]' || cms === '';
      }
    } else {
      // Side 2 problem evidence — check email/phone presence as proxy for "reachable lead"
      // Also check review volume as proxy (not directly stored, so partial credit)
      const email = lead['Email'] || lead['email'] || '';
      const phone = lead['Phone'] || lead['phone'] || '';
      const hasContact = (email && email !== 'N/A' && email !== '') || (phone && phone !== 'N/A' && phone !== '');
      isConfirmed = hasContact; // partial heuristic — real signal check would require live scraping
    }

    if (isConfirmed) {
      confirmed.push({ ...sig });
    } else {
      unconfirmed.push({ ...sig });
    }
  }

  const score = confirmed.reduce((sum, s) => sum + (s.weight || 0), 0);
  return { score: Math.min(score, 100), confirmed, unconfirmed };
}

export default function OutreachPlanner() {
  // Saved Searches
  const [savedSearches, setSavedSearches] = useState([]);
  const [selectedSearchKey, setSelectedSearchKey] = useState('');
  const [loadingSearches, setLoadingSearches] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Campaign & Pain Points
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [painPoints, setPainPoints] = useState([]);
  const [loadingPains, setLoadingPains] = useState(false);
  const [selectedPain, setSelectedPain] = useState(null);

  // Leads
  const [targetIndustry, setTargetIndustry] = useState('');
  const [allLeads, setAllLeads] = useState([]);        // raw from backend
  const [scoredLeads, setScoredLeads] = useState([]);  // with confidence scores
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(30);

  // Filter toggles (OR logic)
  const [requireEmail, setRequireEmail] = useState(true);
  const [requirePhone, setRequirePhone] = useState(false);
  const [filterNoAds, setFilterNoAds] = useState(false);
  const [filterNoCrm, setFilterNoCrm] = useState(false);
  const [filterNoLiveChat, setFilterNoLiveChat] = useState(false);
  const [filterNoPayments, setFilterNoPayments] = useState(false);

  // AI Pitch
  const [userOffer, setUserOffer] = useState(
    "We design custom web ordering portals and integrate automated booking tools to eliminate third-party commission fees and capture more direct customers."
  );
  const [generatingPitch, setGeneratingPitch] = useState(false);
  const [generatedPitch, setGeneratedPitch] = useState(null);
  const [pitchError, setPitchError] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  // Actions
  const [copying, setCopying] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  // Signal Detection Plan
  const [signalPlan, setSignalPlan] = useState([]);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [signalError, setSignalError] = useState('');
  const [signalPlanOpen, setSignalPlanOpen] = useState(true);
  const [signalPlanFromCache, setSignalPlanFromCache] = useState(false);

  // ── Fetch saved searches ──────────────────────────────────────────────────
  const fetchSavedSearches = useCallback(async () => {
    setLoadingSearches(true);
    setSearchError('');
    try {
      const res = await axios.get('/api/market/saved-searches');
      const allSearches = res.data || [];
      const painSearches = allSearches.filter(s => s.tab === 'pain');
      setSavedSearches(painSearches);
      // Auto-select first if nothing selected yet
      if (painSearches.length > 0 && !selectedSearchKey) {
        setSelectedSearchKey(painSearches[0].cache_key);
      }
    } catch {
      setSearchError('Failed to fetch saved campaigns.');
    } finally {
      setLoadingSearches(false);
    }
  }, [selectedSearchKey]);

  useEffect(() => { fetchSavedSearches(); }, [fetchSavedSearches]);

  // ── Load campaign ──────────────────────────────────────────────────────────
  const handleLoadCampaign = async () => {
    if (!selectedSearchKey) return;
    const search = savedSearches.find(s => s.cache_key === selectedSearchKey);
    if (!search) return;
    setLoadingPains(true);
    setSelectedPain(null);
    setGeneratedPitch(null);
    setSelectedLead(null);
    setScoredLeads([]);
    try {
      const res = await axios.get(`/api/market/saved-searches/pain/${selectedSearchKey}`);
      setSelectedCampaign(search);
      setTargetIndustry(search.industry);
      if (res.data?.clusters) {
        setPainPoints(res.data.clusters);
        if (res.data.clusters.length > 0) setSelectedPain(res.data.clusters[0]);
      } else {
        setPainPoints([]);
      }
    } catch {
      setSearchError('Error loading campaign data.');
    } finally {
      setLoadingPains(false);
    }
  };

  // ── Fetch all leads (no strict AND filters — fetch everything, score client-side) ──
  const handleFindTargets = async () => {
    setLoadingLeads(true);
    setSelectedLead(null);
    setGeneratedPitch(null);
    try {
      const res = await axios.post('/api/outreach/targets', {
        industry: targetIndustry || 'all',
        require_email: false,
        require_phone: false,
        no_ads: false,
        no_crm: false,
        no_live_chat: false,
        no_payments: false
      });
      setAllLeads(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLeads(false);
    }
  };

  // ── Compute OR-based match score and confidence score per lead ─────────────
  useEffect(() => {
    if (!allLeads.length) { setScoredLeads([]); return; }

    const filters = [
      { key: 'has_email', label: 'Has Email', active: requireEmail },
      { key: 'has_phone', label: 'Has Phone', active: requirePhone },
      { key: 'no_ads',    label: 'No Active Ads', active: filterNoAds },
      { key: 'no_crm',    label: 'No CRM', active: filterNoCrm },
      { key: 'no_chat',   label: 'No Live Chat', active: filterNoLiveChat },
      { key: 'no_pay',    label: 'No Payments', active: filterNoPayments },
    ].filter(f => f.active);

    const activeSignalBlock = selectedPain
      ? signalPlan.find(b => b.pain_point === selectedPain.theme) || null
      : null;

    const scored = allLeads.map(lead => {
      const email = lead['Email'] || lead['email'] || '';
      const phone = lead['Phone'] || lead['phone'] || '';
      const ads   = lead['Ads Active'] || lead['ads_active'] || '';
      const crm   = lead['CRM / Marketing Automation'] || lead['crm'] || '';
      const chat  = lead['Live Chat / Support'] || lead['live_chat'] || '';
      const pay   = lead['Payments'] || lead['payments'] || '';

      const checks = {
        has_email: email && email !== 'N/A' && email !== '',
        has_phone: phone && phone !== 'N/A' && phone !== '',
        no_ads:    ads === 'No' || ads === 'N/A' || !ads,
        no_crm:    !crm || crm === 'N/A' || crm === '[]' || crm === '',
        no_chat:   !chat || chat === 'N/A' || chat === '[]' || chat === '',
        no_pay:    !pay || pay === 'N/A' || pay === '[]' || pay === '',
      };

      const matchCount = filters.filter(f => checks[f.key]).length;
      const matchLabels = filters.filter(f => checks[f.key]).map(f => f.label);

      const { score, confirmed, unconfirmed } = activeSignalBlock
        ? computeLeadConfidence(lead, activeSignalBlock)
        : { score: 0, confirmed: [], unconfirmed: [] };

      return { ...lead, _matchCount: matchCount, _matchTotal: filters.length, _matchLabels: matchLabels, _confidence: score, _confirmed: confirmed, _unconfirmed: unconfirmed };
    });

    // Sort by confidence desc, then matchCount desc
    scored.sort((a, b) => b._confidence - a._confidence || b._matchCount - a._matchCount);
    setScoredLeads(scored);
  }, [allLeads, requireEmail, requirePhone, filterNoAds, filterNoCrm, filterNoLiveChat, filterNoPayments, signalPlan, selectedPain]);

  // Visible leads: pass threshold OR match at least one filter
  const visibleLeads = scoredLeads.filter(l => {
    const passesThreshold = l._confidence >= confidenceThreshold;
    const passesFilter = l._matchCount > 0;
    return passesThreshold || passesFilter;
  });

  // ── Auto-load leads when campaign is set ──────────────────────────────────
  useEffect(() => {
    if (selectedCampaign) handleFindTargets();
  }, [selectedCampaign]);

  // ── Auto-generate signal plan when pain points load ───────────────────────
  const fetchSignalPlan = useCallback(async (forceRefresh = false) => {
    if (!painPoints.length || !selectedCampaign) return;
    setLoadingSignals(true);
    setSignalError('');
    if (forceRefresh) setSignalPlan([]);

    // campaign_key ties this signal plan to the exact pain campaign loaded
    const campaignKey = selectedCampaign.cache_key || '';

    try {
      let result = null;

      // 1. Try GET cache endpoint first (fastest — no body, pure cache lookup)
      if (!forceRefresh) {
        try {
          const url = `/api/outreach/signal-plan/${encodeURIComponent(selectedCampaign.industry)}?campaign_key=${encodeURIComponent(campaignKey)}`;
          const cached = await axios.get(url);
          if (Array.isArray(cached.data) && cached.data.length > 0) {
            result = cached.data;
            setSignalPlanFromCache(true);
          }
        } catch {
          // 404 or bad cache — fall through to POST
        }
      }

      // 2. Generate via POST (new generation or force refresh)
      if (!result) {
        const res = await axios.post('/api/outreach/signal-plan', {
          industry: selectedCampaign.industry,
          pain_points: painPoints.map(p => ({ theme: p.theme, description: p.description })),
          force_refresh: forceRefresh,
          campaign_key: campaignKey
        });
        result = res.data;
        setSignalPlanFromCache(false);
      }

      setSignalPlan(result);
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.message || 'Unknown error';
      setSignalError(`Failed to generate Signal Detection Plan: ${detail}. Click Retry to try again.`);
    } finally {
      setLoadingSignals(false);
    }
  }, [painPoints, selectedCampaign]);

  useEffect(() => {
    if (painPoints.length > 0 && selectedCampaign) {
      fetchSignalPlan(false);
    }
  }, [painPoints, selectedCampaign]);

  // ── When pain selection changes, re-score (useEffect on selectedPain handles via allLeads dep) ──
  useEffect(() => {
    if (selectedPain && allLeads.length > 0) {
      setSelectedLead(null);
      setGeneratedPitch(null);
    }
  }, [selectedPain]);

  // ── Generate AI Pitch ──────────────────────────────────────────────────────
  const handleGeneratePitch = async () => {
    if (!selectedLead || !selectedPain) return;
    setGeneratingPitch(true);
    setPitchError('');
    setGeneratedPitch(null);
    setActionMessage('');
    setActionError('');
    try {
      const res = await axios.post('/api/outreach/generate', {
        business_name: selectedLead['Business Name'] || selectedLead['business_name'],
        website: selectedLead['Website'] || selectedLead['website'] || 'N/A',
        industry: selectedLead['Industry'] || selectedLead['industry'] || targetIndustry,
        tech_stack: {
          CMS: selectedLead['CMS'] || 'N/A',
          CRM: selectedLead['CRM / Marketing Automation'] || 'N/A',
          LiveChat: selectedLead['Live Chat / Support'] || 'N/A',
          Payments: selectedLead['Payments'] || 'N/A',
          AdsActive: selectedLead['Ads Active'] || 'N/A'
        },
        pain_point_theme: selectedPain.theme,
        pain_point_description: selectedPain.description,
        user_offer: userOffer
      });
      setGeneratedPitch(res.data);
      setEditSubject(res.data.subject || '');
      setEditBody(res.data.body || '');
    } catch {
      setPitchError('Failed to generate pitch with Llama LLM.');
    } finally {
      setGeneratingPitch(false);
    }
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(`Subject: ${editSubject}\n\n${editBody}`);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const handleSendEmail = async () => {
    if (!selectedLead) return;
    const emailAddr = selectedLead['Email'] || selectedLead['email'];
    if (!emailAddr || emailAddr === 'N/A' || emailAddr === '') {
      setActionError('Recipient email is missing for this lead.');
      return;
    }
    setSendingEmail(true);
    setActionMessage('');
    setActionError('');
    try {
      const res = await axios.post('/api/outreach/send', {
        to_email: emailAddr,
        subject: editSubject,
        body: editBody,
        business_name: selectedLead['Business Name'] || selectedLead['business_name']
      });
      setActionMessage(res.data.status === 'mock' ? `[Simulated] ${res.data.message}` : 'Email sent successfully!');
    } catch {
      setActionError('Failed to send email. Verify SMTP config in .env.');
    } finally {
      setSendingEmail(false);
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const sideLabel = (side) => side === 'solution_gap'
    ? { bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)', color: '#60a5fa', icon: <Shield size={11} />, text: 'SIDE 1 — SOLUTION GAP' }
    : { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', color: '#fbbf24', icon: <Zap size={11} />, text: 'SIDE 2 — PROBLEM EVIDENCE' };

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '2rem', marginBottom: '0.25rem' }}>
            <Target size={28} style={{ color: 'var(--gold-primary)' }} /> AI Outreach Campaign Planner
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Map local business tech gaps to pain point signals — find the hottest leads and generate custom pitches.
          </p>
        </div>
        <button onClick={fetchSavedSearches} disabled={loadingSearches} className="refresh-btn" style={{ width: 'auto' }}>
          <RefreshCw size={14} className={loadingSearches ? 'animate-spin' : ''} /> Refresh Campaigns
        </button>
      </div>

      {searchError && (
        <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)', padding: '1rem', borderRadius: '8px', color: '#ff6b6b' }}>
          <AlertCircle size={16} style={{ marginRight: '8px' }} />{searchError}
        </div>
      )}

      {/* ── STEP 1: SELECT CAMPAIGN ─────────────────────────────────────────── */}
      <div className="card">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={16} /> Step 1: Select Campaign &amp; Load Pain Points
        </h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label>Saved Campaigns History</label>
            <select value={selectedSearchKey} onChange={e => setSelectedSearchKey(e.target.value)} disabled={loadingSearches}>
              {savedSearches.length === 0
                ? <option value="">No campaigns saved yet. Run Market Research → Pain Points first.</option>
                : savedSearches.map(s => (
                    <option key={s.cache_key} value={s.cache_key}>
                      {s.industry.toUpperCase()} — {s.problem ? `"${s.problem}"` : 'General Overview'} ({new Date(s.saved_at).toLocaleDateString()})
                    </option>
                  ))
              }
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', minWidth: '160px' }}>
            <button onClick={handleLoadCampaign} disabled={loadingPains || !selectedSearchKey} style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              {loadingPains ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />} Load Campaign
            </button>
          </div>
        </div>

        {savedSearches.length === 0 && !loadingSearches && (
          <div style={{ marginTop: '1rem', background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.25)', borderRadius: '8px', padding: '0.875rem', fontSize: '0.85rem', color: '#ffdf00', lineHeight: 1.6 }}>
            <strong>No pain point campaigns found.</strong><br />
            To create one: go to <strong>Market Research</strong> → enter an industry (e.g. "restaurants") → click <strong>Analyze Market</strong> → open the <strong>Pain Points</strong> tab → wait for results (they auto-save to Supabase).<br />
            Then come back here and click <strong>Refresh Campaigns</strong>.
          </div>
        )}

        {savedSearches.length > 0 && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {savedSearches.length} pain point campaign{savedSearches.length !== 1 ? 's' : ''} saved across{' '}
            {[...new Set(savedSearches.map(s => s.industry.toLowerCase()))].length} industries.
            Select one above and click <strong style={{ color: 'var(--gold-primary)' }}>Load Campaign</strong>.
          </div>
        )}
      </div>

      {/* ── SIGNAL DETECTION PLAN ──────────────────────────────────────────── */}
      {selectedCampaign && (
        <div className="card" style={{ borderColor: 'rgba(138,43,226,0.25)' }}>
          <div onClick={() => setSignalPlanOpen(!signalPlanOpen)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radar size={18} style={{ color: '#a78bfa' }} /> Signal Detection Plan
              {loadingSignals && <Loader size={14} className="animate-spin" style={{ color: '#a78bfa', marginLeft: '6px' }} />}
              {!loadingSignals && signalPlan.length > 0 && (
                <span style={{ background: 'rgba(138,43,226,0.15)', color: '#a78bfa', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', border: '1px solid rgba(138,43,226,0.3)' }}>
                  {signalPlan.length} pain points
                </span>
              )}
              {!loadingSignals && signalPlan.length > 0 && signalPlanFromCache && (
                <span style={{ background: 'rgba(40,167,69,0.12)', color: '#39ff14', fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', border: '1px solid rgba(40,167,69,0.3)' }}>
                  ✓ cached
                </span>
              )}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!loadingSignals && signalPlan.length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); fetchSignalPlan(true); }}
                  title="Regenerate with LLM (overwrites cache)"
                  style={{ margin: 0, width: 'auto', padding: '3px 10px', fontSize: '0.72rem', background: 'rgba(138,43,226,0.12)', border: '1px solid rgba(138,43,226,0.3)', color: '#a78bfa', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '5px', transform: 'none', boxShadow: 'none' }}
                >
                  <RefreshCw size={11} /> Regenerate
                </button>
              )}
              {signalPlanOpen ? <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />}
            </div>
          </div>

          {signalPlanOpen && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                Each pain point has two sides: <strong style={{ color: '#60a5fa' }}>Side 1 — Solution Gap</strong> (business has no fix in place) and <strong style={{ color: '#fbbf24' }}>Side 2 — Problem Evidence</strong> (external proof the pain exists). Signal weights sum to 100% per pain point.
              </p>

              {signalError && (
                <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)', padding: '0.75rem 1rem', borderRadius: '6px', color: '#ff6b6b', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>{signalError}</span>
                  </div>
                  <button
                    onClick={() => fetchSignalPlan(true)}
                    style={{ margin: 0, width: 'auto', padding: '4px 12px', fontSize: '0.78rem', background: 'rgba(220,53,69,0.15)', border: '1px solid rgba(220,53,69,0.4)', color: '#ff6b6b', borderRadius: '6px', flexShrink: 0, transform: 'none', boxShadow: 'none' }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {loadingSignals ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem', gap: '1rem' }}>
                  <Loader size={28} className="animate-spin" style={{ color: '#a78bfa' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {signalPlan.length === 0 ? 'Checking cache…' : 'Regenerating signal map with Llama LLM…'}
                  </span>
                  <span style={{ color: 'rgba(167,139,250,0.6)', fontSize: '0.75rem' }}>First run takes 20–40 seconds · subsequent loads are instant from cache</span>
                </div>
              ) : signalPlan.length === 0 && !signalError ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>No signal plan yet. Load a campaign above.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {signalPlan.map((block, bIdx) => {
                    const side1 = (block.signals || []).filter(s => s.side === 'solution_gap');
                    const side2 = (block.signals || []).filter(s => s.side === 'problem_evidence');
                    const totalWeight = (block.signals || []).reduce((s, sg) => s + (sg.weight || 0), 0);

                    return (
                      <div key={bIdx} style={{ background: 'rgba(138,43,226,0.04)', border: '1px solid rgba(138,43,226,0.15)', borderRadius: '10px', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '1rem 1rem 0.85rem', borderBottom: '1px solid rgba(138,43,226,0.12)' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: block.brief ? '0.65rem' : 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <AlertCircle size={15} style={{ color: '#f87171', flexShrink: 0 }} />
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#f87171' }}>Pain Point</span>
                              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gold-primary)' }}>{block.pain_point}</span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                              {totalWeight}% total weight
                            </span>
                          </div>
                          {/* Brief */}
                          {block.brief && (
                            <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '8px', padding: '0.65rem 0.85rem', marginBottom: '0.2rem' }}>
                              <p style={{ margin: 0, fontSize: '0.84rem', color: '#e8d5a3', lineHeight: 1.65 }}>
                                {block.brief}
                              </p>
                            </div>
                          )}
                        </div>

                        {block.raw_text && (!block.signals || block.signals.length === 0) ? (
                          <div style={{ padding: '1rem', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{block.raw_text}</div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                            {/* SIDE 1 */}
                            <div style={{ borderRight: '1px solid rgba(96,165,250,0.12)', padding: '0.85rem 1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(96,165,250,0.12)' }}>
                                <Shield size={13} style={{ color: '#60a5fa' }} />
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Side 1 — Solution Gap</span>
                              </div>
                              {side1.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No solution gap signals generated.</div> : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                  {side1.map((sig, sIdx) => <SignalCard key={sIdx} sig={sig} side="solution_gap" />)}
                                </div>
                              )}
                            </div>
                            {/* SIDE 2 */}
                            <div style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(251,191,36,0.12)' }}>
                                <Zap size={13} style={{ color: '#fbbf24' }} />
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Side 2 — Problem Evidence</span>
                              </div>
                              {side2.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No problem evidence signals generated.</div> : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                  {side2.map((sig, sIdx) => <SignalCard key={sIdx} sig={sig} side="problem_evidence" />)}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MAIN WIZARD (2 columns) ─────────────────────────────────────────── */}
      {selectedCampaign && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem', alignItems: 'start' }}>

          {/* LEFT: Step 2 + Step 3 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* STEP 2: SELECT PITCH ANGLE */}
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} style={{ color: 'var(--gold-primary)' }} /> Step 2: Select Pitch Angle
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1rem' }}>
                Selecting a pain point filters Step 3 leads to those matching its signals.
              </p>
              {loadingPains ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading pain points…</div>
              ) : painPoints.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '1rem' }}>No pain clusters found. Ensure Market Research completed successfully.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '320px', overflowY: 'auto' }}>
                  {painPoints.map((p, idx) => {
                    const block = signalPlan.find(b => b.pain_point === p.theme);
                    return (
                      <div key={idx} onClick={() => setSelectedPain(p)} style={{
                        padding: '0.9rem 1rem',
                        background: selectedPain?.theme === p.theme ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${selectedPain?.theme === p.theme ? 'var(--gold-primary)' : 'rgba(212,175,55,0.1)'}`,
                        borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s ease'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <strong style={{ color: selectedPain?.theme === p.theme ? 'var(--gold-secondary)' : '#fff', fontSize: '0.92rem' }}>{p.theme}</strong>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span className="badge" style={{ margin: 0 }}>{p.items?.length || 0} mentions</span>
                            {block && <span style={{ fontSize: '0.65rem', color: '#a78bfa', background: 'rgba(138,43,226,0.12)', padding: '1px 6px', borderRadius: '10px', border: '1px solid rgba(138,43,226,0.25)' }}>{block.signals?.length || 0} signals</span>}
                          </div>
                        </div>
                        {/* Description from pain cluster */}
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, marginBottom: block?.brief ? '0.5rem' : 0 }}>{p.description}</p>
                        {/* Brief from signal plan */}
                        {block?.brief && (
                          <p style={{ fontSize: '0.76rem', color: '#d4af37aa', margin: 0, lineHeight: 1.5, paddingTop: '0.4rem', borderTop: '1px solid rgba(212,175,55,0.1)' }}>
                            {block.brief}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* STEP 3: LEADS WITH CONFIDENCE SCORING */}
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={16} /> Step 3: Ranked Target Leads
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1rem' }}>
                Leads are scored using signal detection and sorted by confidence. Filters use OR logic — any match counts.
              </p>

              {/* Industry + Refresh */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <label>Industry Keyword</label>
                  <input type="text" value={targetIndustry} onChange={e => setTargetIndustry(e.target.value)} placeholder="e.g. Restaurants" />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button onClick={handleFindTargets} disabled={loadingLeads} style={{ margin: 0, height: '42px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={14} className={loadingLeads ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>
              </div>

              {/* OR Filters */}
              <div className="options-group" style={{ margin: '0 0 1rem 0' }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--gold-primary)', display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                  OR Filters (any match qualifies)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {[
                    { id: 'reqEmail', label: 'Has Email',       checked: requireEmail,     setter: setRequireEmail },
                    { id: 'reqPhone', label: 'Has Phone',       checked: requirePhone,     setter: setRequirePhone },
                    { id: 'noAds',    label: 'No Active Ads',   checked: filterNoAds,      setter: setFilterNoAds },
                    { id: 'noCrm',    label: 'No CRM',          checked: filterNoCrm,      setter: setFilterNoCrm },
                    { id: 'noChat',   label: 'No Live Chat',    checked: filterNoLiveChat, setter: setFilterNoLiveChat },
                    { id: 'noPay',    label: 'No Payments',     checked: filterNoPayments, setter: setFilterNoPayments },
                  ].map(f => (
                    <div key={f.id} className="checkbox-option">
                      <input type="checkbox" id={f.id} checked={f.checked} onChange={e => f.setter(e.target.checked)} />
                      <label htmlFor={f.id} className="checkbox-label">{f.label}</label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Confidence Threshold Slider */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ margin: 0, fontSize: '0.8rem' }}>Confidence Threshold</label>
                  <ConfidenceBadge score={confidenceThreshold} />
                </div>
                <input type="range" min={0} max={100} value={confidenceThreshold} onChange={e => setConfidenceThreshold(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--gold-primary)', cursor: 'pointer' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  <span>0% (show all)</span><span>50%</span><span>100%</span>
                </div>
              </div>

              {/* Lead count summary */}
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Showing <strong style={{ color: '#fff' }}>{visibleLeads.length}</strong> of {allLeads.length} leads
                {selectedPain && signalPlan.find(b => b.pain_point === selectedPain.theme) && (
                  <span style={{ color: '#a78bfa', marginLeft: '6px' }}>• scored against "<strong>{selectedPain.theme}</strong>"</span>
                )}
              </div>

              {/* Lead cards list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '380px', overflowY: 'auto' }}>
                {loadingLeads ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading leads…</div>
                ) : visibleLeads.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No leads above {confidenceThreshold}% confidence. Lower the threshold or adjust filters.
                  </div>
                ) : (
                  visibleLeads.map((lead, idx) => {
                    const isSelected = selectedLead === lead;
                    const conf = lead._confidence;
                    const cc = getConfidenceColor(conf);
                    const email = lead['Email'] || lead['email'] || '';
                    const phone = lead['Phone'] || lead['phone'] || '';

                    return (
                      <div key={idx} onClick={() => setSelectedLead(lead)} style={{
                        padding: '0.75rem 1rem',
                        background: isSelected ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isSelected ? 'var(--gold-primary)' : 'rgba(212,175,55,0.06)'}`,
                        borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s ease'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: isSelected ? 'var(--gold-primary)' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lead['Business Name'] || lead['business_name']}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', flexWrap: 'wrap' }}>
                              {lead['City'] && lead['City'] !== 'N/A' && <span>{lead['City']}</span>}
                              {email && email !== 'N/A' && <span style={{ color: '#60a5fa' }}>✉ {email}</span>}
                              {phone && phone !== 'N/A' && <span style={{ color: '#a78bfa' }}>☎ {phone}</span>}
                            </div>
                            {/* Filter match badges */}
                            {lead._matchLabels?.length > 0 && (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                {lead._matchLabels.map((lb, li) => (
                                  <span key={li} style={{ fontSize: '0.6rem', background: 'rgba(40,167,69,0.12)', border: '1px solid rgba(40,167,69,0.25)', color: '#39ff14', padding: '1px 5px', borderRadius: '8px' }}>{lb}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                            <ConfidenceBadge score={conf} />
                            {lead._matchTotal > 0 && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                {lead._matchCount}/{lead._matchTotal} filters
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Confirmed / Unconfirmed signals (collapsed, show only when selected) */}
                        {isSelected && (lead._confirmed?.length > 0 || lead._unconfirmed?.length > 0) && (
                          <div style={{ marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {lead._confirmed?.map((sig, si) => (
                              <div key={si} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '0.74rem' }}>
                                <CheckCircle size={12} style={{ color: '#39ff14', flexShrink: 0, marginTop: '1px' }} />
                                <span style={{ color: '#a7f3d0' }}><strong>{sig.weight}%</strong> {sig.signal}</span>
                              </div>
                            ))}
                            {lead._unconfirmed?.map((sig, si) => (
                              <div key={si} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '0.74rem' }}>
                                <AlertCircle size={12} style={{ color: '#6b7280', flexShrink: 0, marginTop: '1px' }} />
                                <span style={{ color: '#6b7280' }}><strong>{sig.weight}%</strong> {sig.signal}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: AI Pitch */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', position: 'sticky', top: '10px' }}>
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} style={{ color: 'var(--gold-primary)' }} /> Step 4: AI Pitch Generator
              </h3>

              {selectedLead ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Lead brief */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', border: '1px solid rgba(212,175,55,0.05)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--gold-primary)', fontSize: '0.95rem' }}>
                        {selectedLead['Business Name'] || selectedLead['business_name']}
                      </div>
                      <ConfidenceBadge score={selectedLead._confidence || 0} />
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(selectedLead['Website'] || selectedLead['website']) && (selectedLead['Website'] || selectedLead['website']) !== 'N/A' && (
                        <a href={selectedLead['Website'] || selectedLead['website']} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Globe size={11} /> {selectedLead['Website'] || selectedLead['website']}
                        </a>
                      )}
                      {selectedLead['Email'] && selectedLead['Email'] !== 'N/A' && <span>✉ {selectedLead['Email']}</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '0.5rem' }}>
                      {selectedLead['CMS'] && selectedLead['CMS'] !== 'N/A' && <span className="badge">CMS: {selectedLead['CMS']}</span>}
                      {selectedLead['CRM / Marketing Automation'] && selectedLead['CRM / Marketing Automation'] !== 'N/A' && <span className="badge">CRM: {selectedLead['CRM / Marketing Automation']}</span>}
                      {selectedLead['Live Chat / Support'] && selectedLead['Live Chat / Support'] !== 'N/A' && <span className="badge">Chat: {selectedLead['Live Chat / Support']}</span>}
                      {selectedLead['Payments'] && selectedLead['Payments'] !== 'N/A' && <span className="badge">Pay: {selectedLead['Payments']}</span>}
                    </div>
                  </div>

                  {/* Pain brief */}
                  {selectedPain ? (
                    <div style={{ borderLeft: '3px solid #dc3545', paddingLeft: '0.75rem' }}>
                      <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#ff6b6b', fontWeight: 600 }}>Pitch angle:</span>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', marginTop: '2px' }}>{selectedPain.theme}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selectedPain.description}</div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Select a pain angle in Step 2.</div>
                  )}

                  <div>
                    <label>Our Offer / Value Proposition</label>
                    <textarea value={userOffer} onChange={e => setUserOffer(e.target.value)} rows={3} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem', color: '#fff', fontSize: '0.88rem', fontFamily: 'inherit', resize: 'none', outline: 'none' }} placeholder="e.g. We build custom booking portals…" />
                  </div>

                  <button onClick={handleGeneratePitch} disabled={generatingPitch || !selectedPain} style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    {generatingPitch ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {generatingPitch ? 'Drafting with Llama LLM…' : 'Generate AI Pitch'}
                  </button>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', fontSize: '0.88rem' }}>Select a lead from Step 3 first.</div>
              )}
            </div>

            {/* Email Preview */}
            {generatedPitch && (
              <div className="card" style={{ background: 'rgba(20,20,23,0.9)' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gold-secondary)' }}>
                  <Mail size={16} /> Cold Email Draft
                </h3>
                {pitchError && <div style={{ color: '#ff6b6b', fontSize: '0.85rem', marginBottom: '1rem' }}>{pitchError}</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label>Subject</label>
                    <input type="text" value={editSubject} onChange={e => setEditSubject(e.target.value)} style={{ fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <label>Body</label>
                    <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={8} style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem', color: '#fff', fontSize: '0.85rem', fontFamily: 'monospace', resize: 'vertical', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={handleCopyToClipboard} style={{ flex: 1, margin: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      {copying ? <Check size={14} style={{ color: '#39ff14' }} /> : <Clipboard size={14} />}
                      {copying ? 'Copied!' : 'Copy'}
                    </button>
                    <button onClick={handleSendEmail} disabled={sendingEmail} style={{ flex: 1, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      {sendingEmail ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                      {sendingEmail ? 'Sending…' : 'Send Email'}
                    </button>
                  </div>
                  {actionMessage && <div style={{ background: 'rgba(40,167,69,0.1)', border: '1px solid rgba(40,167,69,0.2)', padding: '0.75rem', borderRadius: '6px', color: '#39ff14', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}><Check size={14} />{actionMessage}</div>}
                  {actionError   && <div style={{ background: 'rgba(220,53,69,0.1)',  border: '1px solid rgba(220,53,69,0.2)',  padding: '0.75rem', borderRadius: '6px', color: '#ff6b6b',  fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}><AlertCircle size={14} />{actionError}</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Placeholder when no campaign */}
      {!selectedCampaign && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
          <Target size={48} style={{ color: 'var(--gold-primary)', opacity: 0.3, marginBottom: '1rem' }} />
          <h4 style={{ color: 'var(--text-main)', fontSize: '1rem', marginBottom: '0.25rem' }}>No campaign loaded</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Select a campaign in Step 1 and click Load Campaign to begin.</p>
        </div>
      )}
    </div>
  );
}

// ── Reusable signal card component ────────────────────────────────────────────
function SignalCard({ sig, side }) {
  const accentColor = side === 'solution_gap' ? '#60a5fa' : '#fbbf24';
  const bgColor     = side === 'solution_gap' ? 'rgba(96,165,250,0.04)' : 'rgba(251,191,36,0.04)';
  const borderColor = side === 'solution_gap' ? 'rgba(96,165,250,0.12)' : 'rgba(251,191,36,0.12)';

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
      {/* Signal + weight */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', flex: 1 }}>
          <Eye size={13} style={{ color: accentColor, marginTop: '2px', flexShrink: 0 }} />
          <span style={{ fontSize: '0.82rem', color: '#e0e0e0', lineHeight: 1.4 }}>{sig.signal}</span>
        </div>
        {sig.weight != null && (
          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: accentColor, background: `rgba(${side === 'solution_gap' ? '96,165,250' : '251,191,36'},0.12)`, padding: '2px 7px', borderRadius: '12px', border: `1px solid ${borderColor}`, flexShrink: 0 }}>
            {sig.weight}%
          </span>
        )}
      </div>

      {/* Sources */}
      {sig.sources && sig.sources.length > 0 && (
        <div style={{ paddingLeft: '19px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {sig.sources.map((src, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '0.45rem 0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff' }}>{src.name}</span>
                <span style={{
                  fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', padding: '1px 5px', borderRadius: '4px',
                  background: src.difficulty === 'easy' ? 'rgba(40,167,69,0.15)' : src.difficulty === 'medium' ? 'rgba(255,193,7,0.15)' : 'rgba(220,53,69,0.15)',
                  color:      src.difficulty === 'easy' ? '#39ff14'              : src.difficulty === 'medium' ? '#ffdf00'              : '#ff6b6b',
                  border:     `1px solid ${src.difficulty === 'easy' ? 'rgba(40,167,69,0.3)' : src.difficulty === 'medium' ? 'rgba(255,193,7,0.3)' : 'rgba(220,53,69,0.3)'}`
                }}>{src.difficulty}</span>
              </div>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
                <Search size={10} style={{ color: '#fbbf24', marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{src.how_to_find}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmed if */}
      {sig.confirmed_if && (
        <div style={{ paddingLeft: '19px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', background: 'rgba(40,167,69,0.06)', border: '1px solid rgba(40,167,69,0.15)', borderRadius: '6px', padding: '0.4rem 0.6rem' }}>
            <CheckCircle size={12} style={{ color: '#39ff14', marginTop: '1px', flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#39ff14', fontWeight: 700, letterSpacing: '0.5px' }}>Confirmed if</span>
              <div style={{ fontSize: '0.76rem', color: '#a7f3d0', marginTop: '1px', lineHeight: 1.4 }}>{sig.confirmed_if}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
