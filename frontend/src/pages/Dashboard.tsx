import React, { useEffect, useState } from 'react';
import { Activity, Thermometer, AlertTriangle, ShieldCheck, LogOut, User, HeartPulse, Wind } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // Live Telemetry Data
  const [telemetryData, setTelemetryData] = useState<any[]>([]);
  const [latestVitals, setLatestVitals] = useState<any>(null);

  const handleLogout = () => {
    localStorage.removeItem('kavach_token');
    navigate('/login');
  };

  useEffect(() => {
    const token = localStorage.getItem('kavach_token');
    if (!token) {
      navigate('/login');
      return;
    }

    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    
    // Fetch Profile
    fetch('http://localhost:3000/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setUserProfile(data))
      .catch(() => handleLogout());

    // Fetch Live Telemetry every 2 seconds
    const fetchTelemetry = () => {
      fetch('http://localhost:3000/api/telemetry', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => {
          if (res.ok) setBackendStatus('Connected');
          return res.json();
        })
        .then(data => {
          if (data && data.length > 0) {
            // Format data for Recharts
            const formatted = data.map((d: any) => ({
              time: new Date(d.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              temp: d.temperature,
              hr: d.heartRate,
              spo2: d.spo2
            }));
            setTelemetryData(formatted);
            setLatestVitals(data[data.length - 1]); // Last item is the newest since we reversed it in backend
          }
        })
        .catch(() => setBackendStatus('Disconnected'));
    };

    fetchTelemetry();
    const telemetryInterval = setInterval(fetchTelemetry, 2000);

    return () => {
      clearInterval(timer);
      clearInterval(telemetryInterval);
    };
  }, [navigate]);

  if (!userProfile) {
    return <div className="flex-center" style={{ minHeight: '100vh', color: 'var(--text-secondary)' }}>Loading Dashboard...</div>;
  }

  const isAlerting = latestVitals?.isAlert;

  return (
    <div>
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ShieldCheck size={32} color="var(--accent-primary)" />
          <h1 className="logo-text">Kavach Command Center</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
             <User size={16} /> {userProfile.name || userProfile.email} ({userProfile.role})
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Backend: <span style={{ color: backendStatus === 'Connected' ? 'var(--accent-success)' : 'var(--accent-danger)' }}>{backendStatus}</span>
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{currentTime}</div>
          <button onClick={handleLogout} className="btn-outline" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      {/* Main Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'rgba(0, 240, 255, 0.1)', borderRadius: '12px' }}>
            <Activity color="var(--accent-primary)" size={28} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Active Devices</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>1</div>
          </div>
        </div>

        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '16px', background: isAlerting ? 'rgba(255, 42, 95, 0.05)' : 'var(--glass-bg)', border: isAlerting ? '1px solid rgba(255, 42, 95, 0.3)' : '1px solid var(--glass-border)' }}>
          <div style={{ padding: '12px', background: isAlerting ? 'rgba(255, 42, 95, 0.2)' : 'rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
            <AlertTriangle color={isAlerting ? 'var(--accent-danger)' : 'var(--text-secondary)'} size={28} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Active Alerts</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: isAlerting ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
              {isAlerting ? '1' : '0'}
            </div>
          </div>
        </div>
      </div>

      {/* Device List & Chart */}
      <div className="grid-dashboard">
        <div className="glass-panel">
          <h3 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={20} color="var(--accent-primary)" /> Live Telemetry Stream
          </h3>
          <div style={{ height: '350px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetryData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={12} />
                <YAxis yAxisId="temp" stroke="rgba(255,255,255,0.3)" domain={[33, 41]} fontSize={12} />
                <YAxis yAxisId="hr" orientation="right" stroke="rgba(255,255,255,0.3)" domain={[40, 160]} fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-dark)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}
                />
                <Line yAxisId="temp" type="monotone" dataKey="temp" name="Temperature (°C)" stroke="#ff7e67" strokeWidth={3} dot={false} isAnimationActive={false} />
                <Line yAxisId="hr" type="monotone" dataKey="hr" name="Heart Rate (BPM)" stroke="#00f0ff" strokeWidth={3} dot={false} isAnimationActive={false} />
                <Line yAxisId="hr" type="monotone" dataKey="spo2" name="SpO2 (%)" stroke="#b672ff" strokeWidth={3} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '16px', fontSize: '0.85rem' }}>
            <span style={{ color: '#ff7e67' }}>● Temperature</span>
            <span style={{ color: '#00f0ff' }}>● Heart Rate</span>
            <span style={{ color: '#b672ff' }}>● SpO2</span>
          </div>
        </div>

        <div className="glass-panel">
          <h3 style={{ marginBottom: '24px' }}>Monitored Personnel</h3>
          
          {latestVitals ? (
            <div style={{ 
              background: isAlerting ? 'rgba(255, 42, 95, 0.05)' : 'rgba(0, 240, 255, 0.05)', 
              border: isAlerting ? '1px solid rgba(255, 42, 95, 0.2)' : '1px solid rgba(0, 240, 255, 0.1)', 
              borderRadius: '12px', 
              padding: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div className={isAlerting ? "status-indicator status-danger" : "status-indicator status-success"}></div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Worker ID: {latestVitals.device.deviceMac.substring(9)}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Kavach Band ({latestVitals.device.name})</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <Thermometer size={20} color="#ff7e67" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{latestVitals.temperature.toFixed(1)}°</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TEMP</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <HeartPulse size={20} color="#00f0ff" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{latestVitals.heartRate}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>BPM</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <Wind size={20} color="#b672ff" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{latestVitals.spo2}%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SpO2</div>
                </div>
              </div>

              {isAlerting && (
                <div style={{ 
                  background: 'rgba(255, 42, 95, 0.15)', 
                  border: '1px solid var(--accent-danger)', 
                  padding: '16px', 
                  borderRadius: '8px',
                  animation: 'pulse 2s infinite'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-danger)', fontWeight: 'bold', marginBottom: '8px' }}>
                    <AlertTriangle size={18} /> MEDICAL ALERT TRIGGERED
                  </div>
                  <div style={{ color: '#fff', fontSize: '0.95rem', lineHeight: '1.5' }}>
                    {latestVitals.action}
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
    </div>
  );
}
