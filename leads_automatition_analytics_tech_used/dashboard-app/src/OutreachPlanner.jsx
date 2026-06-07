import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Mail, Target, Sparkles, Send, Check, AlertCircle,
  RefreshCw, Filter, ExternalLink, FileText, ChevronRight,
  Globe, MessageSquare, CreditCard, Play, Clipboard,
  Radar, Eye, MapPin, Search, CheckCircle, ChevronDown, ChevronUp, Loader
} from 'lucide-react';

export default function OutreachPlanner() {
  // Saved Searches
  const [savedSearches, setSavedSearches] = useState([]);
  const [selectedSearchKey, setSelectedSearchKey] = useState('');
  const [loadingSearches, setLoadingSearches] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Selected Campaign & Pain Points
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [painPoints, setPainPoints] = useState([]);
  const [loadingPains, setLoadingPains] = useState(false);
  const [selectedPain, setSelectedPain] = useState(null);

  // Targets Filtering State
  const [targetIndustry, setTargetIndustry] = useState('');
  const [requireEmail, setRequireEmail] = useState(true);
  const [requirePhone, setRequirePhone] = useState(false);
  const [filterNoAds, setFilterNoAds] = useState(false);
  const [filterNoCrm, setFilterNoCrm] = useState(false);
  const [filterNoLiveChat, setFilterNoLiveChat] = useState(false);
  const [filterNoPayments, setFilterNoPayments] = useState(false);

  // Leads list
  const [targetLeads, setTargetLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);

  // AI Pitch Generation State
  const [userOffer, setUserOffer] = useState(
    "We design custom web ordering portals and integrate automated booking tools to eliminate third-party commission fees and capture more direct customers."
  );
  const [generatingPitch, setGeneratingPitch] = useState(false);
  const [generatedPitch, setGeneratedPitch] = useState(null);
  const [pitchError, setPitchError] = useState('');

  // Live edit fields
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  // Actions states
  const [copying, setCopying] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  // Signal Detection Plan state
  const [signalPlan, setSignalPlan] = useState([]);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [signalError, setSignalError] = useState('');
  const [signalPlanOpen, setSignalPlanOpen] = useState(true);

  // Fetch saved searches on load
  const fetchSavedSearches = useCallback(async () => {
    setLoadingSearches(true);
    setSearchError('');
    try {
      const res = await axios.get('/api/market/saved-searches');
      // Only keep 'pain' tab searches since we extract pain points from them
      const painSearches = res.data.filter(s => s.tab === 'pain');
      setSavedSearches(painSearches);
      if (painSearches.length > 0) {
        setSelectedSearchKey(painSearches[0].cache_key);
      }
    } catch (err) {
      setSearchError('Failed to fetch saved campaigns history.');
    } finally {
      setLoadingSearches(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedSearches();
  }, [fetchSavedSearches]);

  // Load pain points when a saved search is selected
  const handleLoadCampaign = async () => {
    if (!selectedSearchKey) return;
    const search = savedSearches.find(s => s.cache_key === selectedSearchKey);
    if (!search) return;

    setLoadingPains(true);
    setSelectedPain(null);
    setGeneratedPitch(null);
    setSelectedLead(null);
    try {
      const res = await axios.get(`/api/market/saved-searches/pain/${selectedSearchKey}`);
      setSelectedCampaign(search);
      setTargetIndustry(search.industry);
      
      if (res.data && res.data.clusters) {
        setPainPoints(res.data.clusters);
        if (res.data.clusters.length > 0) {
          setSelectedPain(res.data.clusters[0]);
        }
      } else {
        setPainPoints([]);
      }
    } catch (err) {
      console.error(err);
      setSearchError('Error loading campaign data details.');
    } finally {
      setLoadingPains(false);
    }
  };

  // Fetch target leads matching criteria
  const handleFindTargets = async () => {
    setLoadingLeads(true);
    setSelectedLead(null);
    setGeneratedPitch(null);
    try {
      const res = await axios.post('/api/outreach/targets', {
        industry: targetIndustry || 'all',
        require_email: requireEmail,
        require_phone: requirePhone,
        no_ads: filterNoAds,
        no_crm: filterNoCrm,
        no_live_chat: filterNoLiveChat,
        no_payments: filterNoPayments
      });
      setTargetLeads(res.data);
      if (res.data.length > 0) {
        setSelectedLead(res.data[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLeads(false);
    }
  };

  // Generate AI Pitch
  const handleGeneratePitch = async () => {
    if (!selectedLead || !selectedPain) return;
    setGeneratingPitch(true);
    setPitchError('');
    setGeneratedPitch(null);
    setActionMessage('');
    setActionError('');

    try {
      const res = await axios.post('/api/outreach/generate', {
        business_name: selectedLead["Business Name"] || selectedLead["business_name"],
        website: selectedLead["Website"] || selectedLead["website"] || 'N/A',
        industry: selectedLead["Industry"] || selectedLead["industry"] || targetIndustry,
        tech_stack: {
          CMS: selectedLead["CMS"] || 'N/A',
          CRM: selectedLead["CRM / Marketing Automation"] || 'N/A',
          LiveChat: selectedLead["Live Chat / Support"] || 'N/A',
          Payments: selectedLead["Payments"] || 'N/A',
          AdsActive: selectedLead["Ads Active"] || 'N/A'
        },
        pain_point_theme: selectedPain.theme,
        pain_point_description: selectedPain.description,
        user_offer: userOffer
      });

      setGeneratedPitch(res.data);
      setEditSubject(res.data.subject || '');
      setEditBody(res.data.body || '');
    } catch (err) {
      setPitchError('Failed to generate pitch with Llama LLM.');
    } finally {
      setGeneratingPitch(false);
    }
  };

  // Copy email to clipboard
  const handleCopyToClipboard = () => {
    const text = `Subject: ${editSubject}\n\n${editBody}`;
    navigator.clipboard.writeText(text);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  // Send email
  const handleSendEmail = async () => {
    if (!selectedLead) return;
    const emailAddr = selectedLead["Email"] || selectedLead["email"];
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
        business_name: selectedLead["Business Name"] || selectedLead["business_name"]
      });

      if (res.data.status === 'mock') {
        setActionMessage(`[Simulated] ${res.data.message}`);
      } else {
        setActionMessage('Outreach email sent successfully via SMTP!');
      }
    } catch (err) {
      setActionError('Failed to trigger email send. Please verify SMTP details.');
    } finally {
      setSendingEmail(false);
    }
  };

  // Auto query targets when campaign is loaded
  useEffect(() => {
    if (selectedCampaign) {
      handleFindTargets();
    }
  }, [selectedCampaign]);

  // Auto-generate Signal Detection Plan when pain points load
  useEffect(() => {
    if (painPoints.length > 0 && selectedCampaign) {
      const fetchSignalPlan = async () => {
        setLoadingSignals(true);
        setSignalError('');
        setSignalPlan([]);
        try {
          const res = await axios.post('/api/outreach/signal-plan', {
            industry: selectedCampaign.industry,
            pain_points: painPoints.map(p => ({ theme: p.theme, description: p.description }))
          });
          setSignalPlan(res.data);
        } catch (err) {
          console.error(err);
          setSignalError('Failed to generate Signal Detection Plan.');
        } finally {
          setLoadingSignals(false);
        }
      };
      fetchSignalPlan();
    }
  }, [painPoints, selectedCampaign]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '2rem', marginBottom: '0.25rem' }}>
            <Target size={28} style={{ color: 'var(--gold-primary)' }} /> AI Outreach Campaign Planner
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Map local business tech gaps directly to Reddit & web research pain points and generate custom pitch copy.
          </p>
        </div>
        
        <button 
          onClick={fetchSavedSearches} 
          disabled={loadingSearches}
          className="refresh-btn"
          style={{ width: 'auto' }}
        >
          <RefreshCw size={14} className={loadingSearches ? "animate-spin" : ""} /> Refresh Campaigns
        </button>
      </div>

      {/* ERROR DISPLAY */}
      {searchError && (
        <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)', padding: '1rem', borderRadius: '8px', color: '#ff6b6b' }}>
          <AlertCircle size={16} style={{ marginRight: '8px' }} /> {searchError}
        </div>
      )}

      {/* CAMPAIGN SOURCE SELECTION CARDS */}
      <div className="card">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={16} /> Step 1: Select Active Campaign & Market Research
        </h3>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label>Saved Campaigns History</label>
            <select 
              value={selectedSearchKey} 
              onChange={(e) => setSelectedSearchKey(e.target.value)}
              disabled={loadingSearches}
            >
              {savedSearches.length === 0 ? (
                <option value="">No campaigns saved yet. Go to Market Research tab first.</option>
              ) : (
                savedSearches.map(s => (
                  <option key={s.cache_key} value={s.cache_key}>
                    {s.industry.toUpperCase()} - {s.problem ? `"${s.problem}"` : "General Overview"} ({new Date(s.saved_at).toLocaleDateString()})
                  </option>
                ))
              )}
            </select>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'flex-end', minWidth: '150px' }}>
            <button 
              onClick={handleLoadCampaign} 
              disabled={loadingPains || !selectedSearchKey}
              style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {loadingPains ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />} Load Campaign Context
            </button>
          </div>
        </div>
      </div>

      {/* ═══ SIGNAL DETECTION PLAN ═══════════════════════════════════════════ */}
      {selectedCampaign && (
        <div className="card" style={{ borderColor: 'rgba(138, 43, 226, 0.25)' }}>
          <div 
            onClick={() => setSignalPlanOpen(!signalPlanOpen)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          >
            <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radar size={18} style={{ color: '#a78bfa' }} /> Signal Detection Plan
              {loadingSignals && <Loader size={14} className="animate-spin" style={{ color: '#a78bfa', marginLeft: '6px' }} />}
              {!loadingSignals && signalPlan.length > 0 && (
                <span style={{ background: 'rgba(138,43,226,0.15)', color: '#a78bfa', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', border: '1px solid rgba(138,43,226,0.3)' }}>
                  {signalPlan.length} pain points mapped
                </span>
              )}
            </h3>
            {signalPlanOpen ? <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />}
          </div>

          {signalPlanOpen && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                Auto-generated from your market research pain points. Each block maps an observable, externally-checkable signal to prove a specific business is experiencing that problem.
              </p>

              {signalError && (
                <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)', padding: '0.75rem', borderRadius: '6px', color: '#ff6b6b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  <AlertCircle size={14} style={{ marginRight: '6px' }} /> {signalError}
                </div>
              )}

              {loadingSignals ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem', gap: '1rem' }}>
                  <Loader size={28} className="animate-spin" style={{ color: '#a78bfa' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Analyzing pain points with Llama LLM to build signal map...</span>
                  <span style={{ color: 'rgba(167,139,250,0.6)', fontSize: '0.75rem' }}>This may take 15–30 seconds</span>
                </div>
              ) : signalPlan.length === 0 && !signalError ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' }}>
                  No signal plan yet. Load a campaign with pain points above.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {signalPlan.map((block, bIdx) => (
                    <div key={bIdx} style={{ background: 'rgba(138,43,226,0.04)', border: '1px solid rgba(138,43,226,0.15)', borderRadius: '10px', overflow: 'hidden' }}>
                      {/* Pain Point Header */}
                      <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid rgba(138,43,226,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={15} style={{ color: '#f87171', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>PAIN POINT:</span>
                        <span style={{ fontSize: '0.9rem', color: 'var(--gold-secondary)' }}>{block.pain_point}</span>
                      </div>

                      {/* Signals */}
                      {block.raw_text && (!block.signals || block.signals.length === 0) ? (
                        <div style={{ padding: '1rem', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{block.raw_text}</div>
                      ) : (
                        (block.signals || []).map((sig, sIdx) => (
                          <div key={sIdx} style={{ padding: '0.85rem 1rem', borderBottom: sIdx < block.signals.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                            {/* Signal */}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                              <Eye size={14} style={{ color: '#a78bfa', marginTop: '2px', flexShrink: 0 }} />
                              <div>
                                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#a78bfa', fontWeight: 700, letterSpacing: '0.5px' }}>Signal</span>
                                <div style={{ fontSize: '0.85rem', color: '#e0e0e0', marginTop: '2px' }}>{sig.signal}</div>
                              </div>
                            </div>

                            {/* Sources with How To Find */}
                            {sig.sources && sig.sources.length > 0 && (
                              <div style={{ marginLeft: '22px', marginBottom: '0.6rem' }}>
                                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#60a5fa', fontWeight: 700, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                  <MapPin size={11} /> Sources (easiest → hardest)
                                </span>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {sig.sources.map((src, srcIdx) => (
                                    <div key={srcIdx} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '0.5rem 0.75rem' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>{src.name}</span>
                                        <span style={{
                                          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: '4px',
                                          background: src.difficulty === 'easy' ? 'rgba(40,167,69,0.15)' : src.difficulty === 'medium' ? 'rgba(255,193,7,0.15)' : 'rgba(220,53,69,0.15)',
                                          color: src.difficulty === 'easy' ? '#39ff14' : src.difficulty === 'medium' ? '#ffdf00' : '#ff6b6b',
                                          border: `1px solid ${src.difficulty === 'easy' ? 'rgba(40,167,69,0.3)' : src.difficulty === 'medium' ? 'rgba(255,193,7,0.3)' : 'rgba(220,53,69,0.3)'}`
                                        }}>{src.difficulty}</span>
                                      </div>
                                      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                        <Search size={11} style={{ color: '#fbbf24', marginTop: '2px', flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{src.how_to_find}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Confirmed If */}
                            {sig.confirmed_if && (
                              <div style={{ marginLeft: '22px', display: 'flex', gap: '6px', alignItems: 'flex-start', background: 'rgba(40,167,69,0.06)', border: '1px solid rgba(40,167,69,0.15)', borderRadius: '6px', padding: '0.45rem 0.65rem' }}>
                                <CheckCircle size={13} style={{ color: '#39ff14', marginTop: '2px', flexShrink: 0 }} />
                                <div>
                                  <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#39ff14', fontWeight: 700, letterSpacing: '0.5px' }}>Confirmed if</span>
                                  <div style={{ fontSize: '0.8rem', color: '#a7f3d0', marginTop: '1px' }}>{sig.confirmed_if}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* WIZARD SPLIT COLUMNS LAYOUT */}
      {selectedCampaign && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem', alignItems: 'start' }}>
          
          {/* LEFT COLUMN: FILTERS, PAIN CLUSTERS, & TARGET LEADS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* STEP 2: SELECT PITCH ANGLE (PAIN POINTS) */}
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} style={{ color: 'var(--gold-primary)' }} /> Step 2: Select Pitch Angle (Pain Cluster)
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Select a pain point clustered from subreddits/reviews to shape the sales angle:
              </p>
              
              {loadingPains ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>Loading pain points...</div>
              ) : painPoints.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '1rem' }}>
                  No pain clusters found for this campaign. Ensure Reddit scraping succeeded.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto' }}>
                  {painPoints.map((p, idx) => (
                    <div 
                      key={idx}
                      onClick={() => setSelectedPain(p)}
                      style={{
                        padding: '1rem',
                        background: selectedPain?.theme === p.theme ? 'rgba(212, 175, 55, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${selectedPain?.theme === p.theme ? 'var(--gold-primary)' : 'rgba(212, 175, 55, 0.1)'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <strong style={{ color: selectedPain?.theme === p.theme ? 'var(--gold-secondary)' : '#fff', fontSize: '0.95rem' }}>
                          {p.theme}
                        </strong>
                        <span className="badge" style={{ margin: 0 }}>{p.items ? p.items.length : 0} mentions</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineBreak: 'anywhere' }}>
                        {p.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* STEP 3: MATCH TARGET LEADS */}
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={16} /> Step 3: Match Target Leads & Tech Gaps
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label>Industry Keyword</label>
                  <input 
                    type="text" 
                    value={targetIndustry} 
                    onChange={(e) => setTargetIndustry(e.target.value)} 
                    placeholder="e.g. Restaurants"
                  />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button 
                    onClick={handleFindTargets} 
                    disabled={loadingLeads}
                    style={{ margin: 0, height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <RefreshCw size={14} className={loadingLeads ? "animate-spin" : ""} /> Filter Leads
                  </button>
                </div>
              </div>

              {/* Advanced Tech gap options */}
              <div className="options-group" style={{ margin: '0 0 1rem 0' }}>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--gold-primary)', display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                  Gaps & Contact Filters
                </span>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="checkbox-option">
                    <input 
                      type="checkbox" 
                      id="reqEmail" 
                      checked={requireEmail} 
                      onChange={(e) => setRequireEmail(e.target.checked)} 
                    />
                    <label htmlFor="reqEmail" className="checkbox-label">Has Email</label>
                  </div>
                  
                  <div className="checkbox-option">
                    <input 
                      type="checkbox" 
                      id="reqPhone" 
                      checked={requirePhone} 
                      onChange={(e) => setRequirePhone(e.target.checked)} 
                    />
                    <label htmlFor="reqPhone" className="checkbox-label">Has Phone</label>
                  </div>
                  
                  <div className="checkbox-option">
                    <input 
                      type="checkbox" 
                      id="noAds" 
                      checked={filterNoAds} 
                      onChange={(e) => setFilterNoAds(e.target.checked)} 
                    />
                    <label htmlFor="noAds" className="checkbox-label">No Active Ads</label>
                  </div>
                  
                  <div className="checkbox-option">
                    <input 
                      type="checkbox" 
                      id="noCrm" 
                      checked={filterNoCrm} 
                      onChange={(e) => setFilterNoCrm(e.target.checked)} 
                    />
                    <label htmlFor="noCrm" className="checkbox-label">No CRM / Automation</label>
                  </div>

                  <div className="checkbox-option">
                    <input 
                      type="checkbox" 
                      id="noLiveChat" 
                      checked={filterNoLiveChat} 
                      onChange={(e) => setFilterNoLiveChat(e.target.checked)} 
                    />
                    <label htmlFor="noLiveChat" className="checkbox-label">No Live Chat</label>
                  </div>

                  <div className="checkbox-option">
                    <input 
                      type="checkbox" 
                      id="noPayments" 
                      checked={filterNoPayments} 
                      onChange={(e) => setFilterNoPayments(e.target.checked)} 
                    />
                    <label htmlFor="noPayments" className="checkbox-label">No Payments Stack</label>
                  </div>
                </div>
              </div>

              {/* Target Results List */}
              <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                {loadingLeads ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Filtering leads table...</div>
                ) : targetLeads.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No leads match these criteria. Try relaxing the filters.
                  </div>
                ) : (
                  targetLeads.map((lead, idx) => (
                    <div 
                      key={idx}
                      onClick={() => setSelectedLead(lead)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        background: selectedLead === lead ? 'rgba(212, 175, 55, 0.08)' : 'transparent',
                        borderBottom: '1px solid rgba(212, 175, 55, 0.05)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.88rem', color: selectedLead === lead ? 'var(--gold-primary)' : '#fff' }}>
                          {lead["Business Name"] || lead["business_name"]}
                        </strong>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          <span>{lead["City"] || lead["city"]}</span>
                          {lead["Email"] && lead["Email"] !== 'N/A' && <span>• 📧 {lead["Email"]}</span>}
                        </div>
                      </div>
                      
                      <ChevronRight size={16} style={{ color: selectedLead === lead ? 'var(--gold-primary)' : 'var(--text-muted)' }} />
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: AI PITCH GENERATOR & PREVIEW EDITOR */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', position: 'sticky', top: '10px' }}>
            
            {/* SELECT LEAD DETAIL BRIEF */}
            <div className="card">
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} style={{ color: 'var(--gold-primary)' }} /> Step 4: AI Pitch Generator
              </h3>

              {selectedLead ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Lead brief info */}
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', border: '1px solid rgba(212, 175, 55, 0.05)', borderRadius: '6px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--gold-primary)' }}>
                      {selectedLead["Business Name"] || selectedLead["business_name"]}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                      <a href={selectedLead["Website"] || '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Globe size={11} /> {selectedLead["Website"] || 'No website'}
                      </a>
                      {selectedLead["Email"] && selectedLead["Email"] !== 'N/A' && <span>• 📧 {selectedLead["Email"]}</span>}
                    </div>

                    {/* Detected Tech Badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '0.5rem' }}>
                      {selectedLead["CMS"] && selectedLead["CMS"] !== 'N/A' && <span className="badge">CMS: {selectedLead["CMS"]}</span>}
                      {selectedLead["CRM / Marketing Automation"] && selectedLead["CRM / Marketing Automation"] !== 'N/A' && <span className="badge">CRM: {selectedLead["CRM / Marketing Automation"]}</span>}
                      {selectedLead["Live Chat / Support"] && selectedLead["Live Chat / Support"] !== 'N/A' && <span className="badge">Chat: {selectedLead["Live Chat / Support"]}</span>}
                      {selectedLead["Payments"] && selectedLead["Payments"] !== 'N/A' && <span className="badge">POS/Pay: {selectedLead["Payments"]}</span>}
                    </div>
                  </div>

                  {/* Pain brief info */}
                  {selectedPain ? (
                    <div style={{ borderLeft: '3px solid #dc3545', paddingLeft: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#ff6b6b', fontWeight: 600 }}>Selected sales angle:</span>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff', marginTop: '2px' }}>{selectedPain.theme}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedPain.description}</div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Select a pain cluster on the left.</div>
                  )}

                  {/* Custom offer input */}
                  <div>
                    <label>Our Offer / Value Proposition</label>
                    <textarea 
                      value={userOffer} 
                      onChange={(e) => setUserOffer(e.target.value)} 
                      rows={3}
                      style={{
                        width: '100%',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        color: '#fff',
                        fontSize: '0.88rem',
                        fontFamily: 'inherit',
                        resize: 'none',
                        outline: 'none',
                        transition: 'border 0.2s ease'
                      }}
                      placeholder="e.g. We design custom reservation plugins that integrate into your website..."
                    />
                  </div>

                  <button 
                    onClick={handleGeneratePitch} 
                    disabled={generatingPitch || !selectedPain}
                    style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    {generatingPitch ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />} 
                    {generatingPitch ? "Drafting with Llama LLM..." : "Generate AI Pitch"}
                  </button>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                  Please match and select a target business on the left list first.
                </div>
              )}
            </div>

            {/* EMAIL PITCH PREVIEW & EDIT AREA */}
            {generatedPitch && (
              <div className="card" style={{ background: 'rgba(20, 20, 23, 0.9)', backdropFilter: 'blur(10px)' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--gold-secondary)' }}>
                  <Mail size={16} /> Cold Outreach Draft Preview & Editor
                </h3>

                {pitchError && (
                  <div style={{ color: '#ff6b6b', fontSize: '0.85rem', marginBottom: '1rem' }}>{pitchError}</div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label>Email Subject</label>
                    <input 
                      type="text" 
                      value={editSubject} 
                      onChange={(e) => setEditSubject(e.target.value)} 
                      style={{ fontFamily: 'inherit' }}
                    />
                  </div>

                  <div>
                    <label>Email Body</label>
                    <textarea 
                      value={editBody} 
                      onChange={(e) => setEditBody(e.target.value)} 
                      rows={8}
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace',
                        resize: 'vertical',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* ACTION BAR */}
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button 
                      onClick={handleCopyToClipboard}
                      style={{ 
                        flex: 1, 
                        margin: 0, 
                        background: 'rgba(255,255,255,0.05)', 
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '6px' 
                      }}
                    >
                      {copying ? <Check size={14} style={{ color: '#39ff14' }} /> : <Clipboard size={14} />} 
                      {copying ? "Copied!" : "Copy Pitch"}
                    </button>

                    <button 
                      onClick={handleSendEmail} 
                      disabled={sendingEmail}
                      style={{ 
                        flex: 1, 
                        margin: 0, 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '6px' 
                      }}
                    >
                      {sendingEmail ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />} 
                      {sendingEmail ? "Sending..." : "Send Email"}
                    </button>
                  </div>

                  {/* Action Success / Error Notifications */}
                  {actionMessage && (
                    <div style={{ background: 'rgba(40,167,69,0.1)', border: '1px solid rgba(40,167,69,0.2)', padding: '0.75rem', borderRadius: '6px', color: '#39ff14', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <Check size={14} /> {actionMessage}
                    </div>
                  )}

                  {actionError && (
                    <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.2)', padding: '0.75rem', borderRadius: '6px', color: '#ff6b6b', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <AlertCircle size={14} /> {actionError}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* CHOOSE CAMPAIGN FIRST PLACEHOLDER */}
      {!selectedCampaign && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', border: '1px dashed var(--border-color)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
          <Mail size={48} style={{ color: 'var(--gold-primary)', opacity: 0.3, marginBottom: '1rem' }} />
          <h4 style={{ color: 'var(--text-main)', fontSize: '1rem', marginBottom: '0.25rem' }}>No campaign loaded</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Select a campaign in Step 1 and load its context to begin campaign targeting.</p>
        </div>
      )}

    </div>
  );
}
