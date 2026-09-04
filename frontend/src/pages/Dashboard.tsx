import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Activity, Thermometer, AlertTriangle, ShieldCheck, LogOut,
  User, HeartPulse, Wind, Flame, Snowflake, Zap, Droplets,
  CheckCircle2, X, Bell, BellOff, Radio, Gauge,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Toast {
  id: number;
  isAlert: boolean;
  action: string;
  scenario: string;
  timestamp: string;
}

interface SimScenario {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  glow: string;
}

// ---------------------------------------------------------------------------
// Scenario config
// ---------------------------------------------------------------------------
const SCENARIOS: SimScenario[] = [
  { key: 'normal',      label: 'Normal',      icon: <CheckCircle2 size={18} />, color: '#00ff88', glow: 'rgba(0,255,136,0.35)'  },
  { key: 'heatstroke',  label: 'Heatstroke',  icon: <Flame size={18} />,        color: '#ff7e25', glow: 'rgba(255,126,37,0.35)' },
  { key: 'hypothermia', label: 'Hypothermia', icon: <Snowflake size={18} />,    color: '#00cfff', glow: 'rgba(0,207,255,0.35)'  },
  { key: 'high_hr',     label: 'High HR',     icon: <Zap size={18} />,          color: '#ff2a5f', glow: 'rgba(255,42,95,0.35)'  },
  { key: 'low_spo2',    label: 'Low SpO2',    icon: <Droplets size={18} />,     color: '#b672ff', glow: 'rgba(182,114,255,0.35)'},
  { key: 'high_bp',     label: 'High BP',     icon: <Gauge size={18} />,        color: '#ff4d4d', glow: 'rgba(255,77,77,0.35)'  },
  { key: 'low_bp',      label: 'Low BP',      icon: <Gauge size={18} />,        color: '#4db8ff', glow: 'rgba(77,184,255,0.35)' },
];

let toastIdCounter = 0;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime]     = useState(new Date().toLocaleTimeString());
  const [backendStatus, setBackendStatus] = useState<'Connected' | 'Disconnected' | 'Connecting'>('Connecting');
  const [userProfile, setUserProfile]     = useState<any>(null);
  const [telemetryData, setTelemetryData] = useState<any[]>([]);
  const [latestVitals, setLatestVitals]   = useState<any>(null);
  const [toasts, setToasts]               = useState<Toast[]>([]);
  const [simLoading, setSimLoading]       = useState<string | null>(null);
  const [notifPerm, setNotifPerm]         = useState<NotificationPermission>('default');
  const lastAlertIdRef                    = useRef<string | null>(null);
  const eventSourceRef                    = useRef<EventSource | null>(null);

  // -------------------------------------------------------------------------
  // Notification helpers
  // -------------------------------------------------------------------------
  const requestNotifPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  }, []);

  const fireBrowserNotif = useCallback((title: string, body: string) => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/kavach-icon.png', tag: 'kavach-alert' });
    }
  }, []);

  const addToast = useCallback((vitals: any) => {
    const toast: Toast = {
      id: ++toastIdCounter,
      isAlert: vitals.isAlert,
      action:  vitals.action,
      scenario: vitals.isAlert ? 'Alert' : 'Safe',
      timestamp: new Date().toLocaleTimeString(),
    };
    setToasts(prev => [toast, ...prev].slice(0, 5));
    if (vitals.isAlert) {
      // Auto-dismiss after 8 seconds
      setTimeout(() => dismissToast(toast.id), 8000);
    } else {
      setTimeout(() => dismissToast(toast.id), 4000);
    }
  }, []);

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // -------------------------------------------------------------------------
  // Process incoming telemetry (from SSE or initial fetch)
  // -------------------------------------------------------------------------
  const processTelemetry = useCallback((data: any[]) => {
    if (!data || data.length === 0) return;
    const formatted = data.map((d: any) => ({
      time: new Date(d.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      temp:  d.temperature,
      hr:    d.heartRate,
      spo2:  d.spo2,
    }));
    setTelemetryData(formatted);
    setLatestVitals(data[data.length - 1]);
  }, []);

  const processNewRecord = useCallback((record: any) => {
    setTelemetryData(prev => {
      const formatted = {
        time: new Date(record.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        temp:  record.temperature,
        hr:    record.heartRate,
        spo2:  record.spo2,
      };
      return [...prev.slice(-19), formatted]; // keep last 20
    });
    setLatestVitals(record);

    // Only fire notifications when alert state changes (avoid spam)
    const alertKey = `${record.id}`;
    if (record.isAlert && lastAlertIdRef.current !== alertKey) {
      lastAlertIdRef.current = alertKey;
      addToast(record);
      fireBrowserNotif('⚠️ Kavach Alert', record.action);
    } else if (!record.isAlert) {
      // Optionally show safe confirmation as a subtle toast
      addToast(record);
    }
  }, [addToast, fireBrowserNotif]);

  // -------------------------------------------------------------------------
  // Auth / logout
  // -------------------------------------------------------------------------
  const handleLogout = useCallback(() => {
    localStorage.removeItem('kavach_token');
    if (eventSourceRef.current) { eventSourceRef.current.close(); }
    navigate('/login');
  }, [navigate]);

  // -------------------------------------------------------------------------
  // Boot: check token, fetch profile + initial telemetry, open SSE
  // -------------------------------------------------------------------------
  useEffect(() => {
    const token = localStorage.getItem('kavach_token');
    if (!token) { navigate('/login'); return; }

    // Clock
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);

    // Notification permission
    if ('Notification' in window) { setNotifPerm(Notification.permission); }

    // Fetch profile
    fetch('http://localhost:3000/api/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setUserProfile)
      .catch(handleLogout);

    // Initial telemetry snapshot
    fetch('http://localhost:3000/api/telemetry', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (r.ok) setBackendStatus('Connected'); return r.json(); })
      .then(processTelemetry)
      .catch(() => setBackendStatus('Disconnected'));

    // Open SSE stream
    const es = new EventSource(`http://localhost:3000/api/telemetry/stream?token=${token}`);
    eventSourceRef.current = es;

    es.onopen = () => setBackendStatus('Connected');
    es.onmessage = (event) => {
      try { processNewRecord(JSON.parse(event.data)); } catch (_) { /* ignore malformed */ }
    };
    es.onerror = () => { setBackendStatus('Disconnected'); };

    return () => {
      clearInterval(timer);
      es.close();
    };
  }, [navigate, handleLogout, processTelemetry, processNewRecord]);

  // Fix SSE auth: EventSource doesn't support custom headers — pass token as query param
  // Backend needs to read from query param too. Let's patch the backend to support this.

  // -------------------------------------------------------------------------
  // Simulate a health scenario
  // -------------------------------------------------------------------------
  const triggerScenario = useCallback(async (scenarioKey: string) => {
    const token = localStorage.getItem('kavach_token');
    if (!token) return;
    setSimLoading(scenarioKey);
    try {
      const res = await fetch('http://localhost:3000/api/simulate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ scenario: scenarioKey }),
      });
      if (!res.ok) console.error('Simulate error:', await res.text());
    } catch (e) {
      console.error('Simulate fetch error:', e);
    } finally {
      setTimeout(() => setSimLoading(null), 600);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Render guards
  // -------------------------------------------------------------------------
  if (!userProfile) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div className="sse-pulse-ring" />
        <span style={{ color: 'var(--text-secondary)' }}>Loading Dashboard...</span>
      </div>
    );
  }

  const isAlerting = latestVitals?.isAlert;

  // -------------------------------------------------------------------------
  // JSX
  // -------------------------------------------------------------------------
  return (
    <div>
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldCheck size={32} color="var(--accent-primary)" />
          <h1 className="logo-text">Kavach Command Center</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={14} /> {userProfile.name || userProfile.email}
            <span style={{ opacity: 0.5 }}>({userProfile.role})</span>
          </div>

          {/* SSE Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
            <Radio size={14} color={backendStatus === 'Connected' ? 'var(--accent-success)' : 'var(--accent-danger)'} />
            <span style={{ color: backendStatus === 'Connected' ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
              {backendStatus}
            </span>
          </div>

          {/* Notification bell */}
          <button
            onClick={requestNotifPermission}
            title={notifPerm === 'granted' ? 'Notifications on' : 'Enable notifications'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            {notifPerm === 'granted'
              ? <Bell size={18} color="var(--accent-primary)" />
              : <BellOff size={18} color="var(--text-secondary)" />
            }
          </button>

          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{currentTime}</div>
          <button onClick={handleLogout} className="btn-outline" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Stat Cards                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(0,240,255,0.1)', borderRadius: '12px' }}>
            <Activity color="var(--accent-primary)" size={28} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Active Devices</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>1</div>
          </div>
        </div>

        <div
          className="glass-panel"
          style={{
            display: 'flex', alignItems: 'center', gap: '16px',
            background: isAlerting ? 'rgba(255,42,95,0.05)' : 'var(--glass-bg)',
            border: isAlerting ? '1px solid rgba(255,42,95,0.3)' : '1px solid var(--glass-border)',
            transition: 'all 0.4s ease',
          }}
        >
          <div style={{ padding: '12px', background: isAlerting ? 'rgba(255,42,95,0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
            <AlertTriangle color={isAlerting ? 'var(--accent-danger)' : 'var(--text-secondary)'} size={28} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Active Alerts</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: isAlerting ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
              {isAlerting ? '1' : '0'}
            </div>
          </div>
        </div>

        {/* Live vitals summary */}
        {latestVitals && (
          <>
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '12px', background: 'rgba(255,126,103,0.1)', borderRadius: '12px' }}>
                <Thermometer color="#ff7e67" size={28} />
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Temperature</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#ff7e67' }}>
                  {latestVitals.temperature.toFixed(1)}°C
                </div>
              </div>
            </div>
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '12px', background: 'rgba(0,240,255,0.1)', borderRadius: '12px' }}>
                <HeartPulse color="var(--accent-primary)" size={28} />
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Heart Rate</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                  {latestVitals.heartRate} <span style={{ fontSize: '1rem' }}>BPM</span>
                </div>
              </div>
            </div>
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '12px', background: 'rgba(255,77,77,0.1)', borderRadius: '12px' }}>
                <Gauge color="#ff4d4d" size={28} />
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Blood Pressure</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#ff4d4d' }}>
                  {latestVitals.systolicBP != null
                    ? <>{latestVitals.systolicBP}<span style={{ fontSize: '1rem' }}>/{latestVitals.diastolicBP} mmHg</span></>
                    : <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>—</span>}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Simulation Control Panel                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="glass-panel" style={{ marginBottom: '32px' }}>
        <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio size={20} color="var(--accent-primary)" />
          Simulation Control Panel
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '8px' }}>
            Inject a health scenario instantly — no external script required
          </span>
        </h3>
        <div className="sim-grid">
          {SCENARIOS.map(s => (
            <button
              key={s.key}
              id={`sim-btn-${s.key}`}
              className={`sim-btn${simLoading === s.key ? ' sim-btn-loading' : ''}`}
              style={{ '--sim-color': s.color, '--sim-glow': s.glow } as React.CSSProperties}
              onClick={() => triggerScenario(s.key)}
              disabled={simLoading !== null}
            >
              <span className="sim-btn-icon">{s.icon}</span>
              <span>{s.label}</span>
              {simLoading === s.key && <span className="sim-spinner" />}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Chart + Personnel Panel                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid-dashboard">
        {/* Live Chart */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={20} color="var(--accent-primary)" /> Live Telemetry Stream
            <span className="sse-dot" title="Real-time SSE" />
          </h3>
          <div style={{ height: '350px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetryData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={11} />
                <YAxis yAxisId="temp" stroke="rgba(255,255,255,0.3)" domain={[33, 41]} fontSize={11} />
                <YAxis yAxisId="hr" orientation="right" stroke="rgba(255,255,255,0.3)" domain={[40, 160]} fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-dark)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}
                />
                <Line yAxisId="temp" type="monotone" dataKey="temp"  name="Temp (°C)"  stroke="#ff7e67" strokeWidth={3} dot={false} isAnimationActive={false} />
                <Line yAxisId="hr"   type="monotone" dataKey="hr"    name="HR (BPM)"   stroke="#00f0ff" strokeWidth={3} dot={false} isAnimationActive={false} />
                <Line yAxisId="hr"   type="monotone" dataKey="spo2"  name="SpO2 (%)"   stroke="#b672ff" strokeWidth={3} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '16px', fontSize: '0.85rem' }}>
            <span style={{ color: '#ff7e67' }}>● Temperature</span>
            <span style={{ color: '#00f0ff' }}>● Heart Rate</span>
            <span style={{ color: '#b672ff' }}>● SpO2</span>
          </div>
        </div>

        {/* Personnel card */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '24px' }}>Monitored Personnel</h3>
          {latestVitals ? (
            <div style={{
              background: isAlerting ? 'rgba(255,42,95,0.05)' : 'rgba(0,240,255,0.05)',
              border: isAlerting ? '1px solid rgba(255,42,95,0.2)' : '1px solid rgba(0,240,255,0.1)',
              borderRadius: '12px', padding: '20px',
              transition: 'all 0.4s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div className={isAlerting ? 'status-indicator status-danger' : 'status-indicator status-success'} />
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                    Worker ID: {latestVitals.device.deviceMac.substring(9) || latestVitals.device.deviceMac}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Kavach Band ({latestVitals.device.name})
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                {[
                  { Icon: Thermometer, color: '#ff7e67', val: `${latestVitals.temperature.toFixed(1)}°`, label: 'TEMP' },
                  { Icon: HeartPulse,  color: '#00f0ff', val: `${latestVitals.heartRate}`,               label: 'BPM'  },
                  { Icon: Wind,        color: '#b672ff', val: `${latestVitals.spo2}%`,                   label: 'SpO2' },
                  {
                    Icon: Gauge,
                    color: '#ff4d4d',
                    val: latestVitals.systolicBP != null
                      ? `${latestVitals.systolicBP}/${latestVitals.diastolicBP}`
                      : '—',
                    label: 'BP'
                  },
                ].map(({ Icon, color, val, label }) => (
                  <div key={label} style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                    <Icon size={20} color={color} style={{ margin: '0 auto 8px', display: 'block' }} />
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{val}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</div>
                  </div>
                ))}
              </div>

              {isAlerting ? (
                <div style={{
                  background: 'rgba(255,42,95,0.15)',
                  border: '1px solid var(--accent-danger)',
                  padding: '16px', borderRadius: '8px',
                  animation: 'pulse-danger 2s infinite',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-danger)', fontWeight: 'bold', marginBottom: '8px' }}>
                    <AlertTriangle size={18} /> MEDICAL ALERT TRIGGERED
                  </div>
                  <div style={{ color: '#fff', fontSize: '0.95rem', lineHeight: '1.5' }}>{latestVitals.action}</div>
                </div>
              ) : (
                <div style={{
                  background: 'rgba(0,255,136,0.08)',
                  border: '1px solid rgba(0,255,136,0.2)',
                  padding: '16px', borderRadius: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-success)', fontWeight: 'bold' }}>
                    <ShieldCheck size={18} /> {latestVitals.action}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px 0' }}>
              Waiting for telemetry data...
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Toast Notification Stack                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="toast-container" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.isAlert ? 'toast-danger' : 'toast-safe'}`}>
            <div className="toast-icon">
              {t.isAlert ? <AlertTriangle size={18} color="var(--accent-danger)" /> : <CheckCircle2 size={18} color="var(--accent-success)" />}
            </div>
            <div className="toast-body">
              <div className="toast-title">{t.isAlert ? '⚠️ Medical Alert' : '✅ Vitals Normal'}</div>
              <div className="toast-msg">{t.action}</div>
              <div className="toast-time">{t.timestamp}</div>
            </div>
            <button className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
