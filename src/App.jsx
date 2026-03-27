import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ─── DATA ───────────────────────────────────────────────────────────────────

const busRoutes = [
  {
    id: '101', name: 'Route 101', from: 'Central Station', to: 'Airport Terminal',
    stops: ['Central Station', 'City Mall', 'Park Road', 'Airport Terminal'],
    coords: [[28.6139, 77.2090], [28.6200, 77.2150], [28.6280, 77.2200], [28.6350, 77.2280]],
    status: 'On Time', nextArrival: '8 mins', frequency: 'Every 15 min',
    color: '#10b981', passengers: 42, capacity: 60,
    busPos: [28.6200, 77.2150], busNumber: 'DL-101'
  },
  {
    id: '202', name: 'Route 202', from: 'North Gate', to: 'South Terminal',
    stops: ['North Gate', 'University', 'Hospital', 'South Terminal'],
    coords: [[28.6450, 77.2100], [28.6380, 77.2090], [28.6300, 77.2080], [28.6200, 77.2070]],
    status: 'Delayed', nextArrival: '15 mins', frequency: 'Every 20 min',
    color: '#ef4444', passengers: 28, capacity: 60, delay: '7 min delay',
    busPos: [28.6380, 77.2090], busNumber: 'DL-202'
  },
  {
    id: '303', name: 'Route 303', from: 'East Market', to: 'Central Station',
    stops: ['East Market', 'Stadium', 'Park Lane', 'Central Station'],
    coords: [[28.6139, 77.2300], [28.6150, 77.2220], [28.6145, 77.2160], [28.6139, 77.2090]],
    status: 'On Time', nextArrival: '3 mins', frequency: 'Every 10 min',
    color: '#3b82f6', passengers: 55, capacity: 60,
    busPos: [28.6150, 77.2220], busNumber: 'DL-303'
  },
  {
    id: '404', name: 'Route 404', from: 'West Hub', to: 'Tech Park',
    stops: ['West Hub', 'Shopping Centre', 'IT Colony', 'Tech Park'],
    coords: [[28.6139, 77.1900], [28.6150, 77.1970], [28.6160, 77.2020], [28.6170, 77.2060]],
    status: 'On Time', nextArrival: '12 mins', frequency: 'Every 25 min',
    color: '#f59e0b', passengers: 19, capacity: 60,
    busPos: [28.6155, 77.1985], busNumber: 'DL-404'
  },
]

const users = [
  { id: 1, name: 'Rahul Sharma', email: 'rahul@gmail.com', password: '123456', phone: '9876543210', avatar: '👨' },
  { id: 2, name: 'Priya Singh', email: 'priya@gmail.com', password: '123456', phone: '9876543211', avatar: '👩' },
]

const INITIAL_ALERTS = [
  { id: 1, type: 'delay', route: '202', msg: 'Route 202 delayed 7 min — Heavy traffic near Hospital Road', time: '2 min ago', read: false },
  { id: 2, type: 'info', route: '101', msg: 'Route 101 now boarding at Platform 3', time: '5 min ago', read: false },
  { id: 3, type: 'crowd', route: '303', msg: 'Route 303 almost full — 55/60 seats occupied', time: '8 min ago', read: true },
]

// ─── ICONS ──────────────────────────────────────────────────────────────────

const stopDot = (color) => L.divIcon({
  html: `<div style="width:9px;height:9px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 4px ${color}"></div>`,
  className: '', iconSize: [9, 9], iconAnchor: [4, 4]
})

const busIcon = (color, occupancy) => {
  const pct = occupancy
  const crowdColor = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#10b981'
  return L.divIcon({
    html: `<div style="position:relative">
      <div style="background:${color};color:white;font-size:17px;border-radius:50%;
        width:32px;height:32px;display:flex;align-items:center;justify-content:center;
        border:2.5px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.35)">🚌</div>
      <div style="position:absolute;top:-6px;right:-6px;background:${crowdColor};
        color:white;font-size:8px;font-weight:700;border-radius:6px;
        padding:1px 4px;border:1.5px solid white;white-space:nowrap">${pct}%</div>
    </div>`,
    className: '', iconSize: [32, 32], iconAnchor: [16, 16]
  })
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function occupancyInfo(passengers, capacity) {
  const pct = Math.round((passengers / capacity) * 100)
  if (pct >= 90) return { pct, label: 'Very Crowded', color: '#ef4444', bg: '#fef2f2', icon: '🔴' }
  if (pct >= 65) return { pct, label: 'Moderately Full', color: '#f59e0b', bg: '#fffbeb', icon: '🟡' }
  return { pct, label: 'Comfortable', color: '#10b981', bg: '#f0fdf4', icon: '🟢' }
}

function etaCalc(stops, fromStop, toStop) {
  const fromIdx = stops.findIndex(s => s.toLowerCase().includes(fromStop.toLowerCase()))
  const toIdx = stops.findIndex(s => s.toLowerCase().includes(toStop.toLowerCase()))
  if (fromIdx === -1 || toIdx === -1) return null
  const diff = Math.abs(toIdx - fromIdx)
  return { stops: diff, eta: diff * 6, fromIdx, toIdx }
}

// ─── MAP FLY COMPONENT ───────────────────────────────────────────────────────

function FlyTo({ position }) {
  const map = useMap()
  useEffect(() => { if (position) map.flyTo(position, 15, { duration: 1.2 }) }, [position])
  return null
}

// ─── TOAST COMPONENT ─────────────────────────────────────────────────────────

function Toast({ toasts, removeToast }) {
  return (
    <div style={{ position: 'fixed', top: '70px', right: '16px', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {toasts.map(t => (
        <div key={t.id}
          style={{
            background: 'white', borderRadius: '12px', padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: `1px solid ${t.color || '#e2e8f0'}`,
            maxWidth: '320px', display: 'flex', gap: '10px', alignItems: 'flex-start',
            animation: 'slideIn 0.3s ease', borderLeft: `4px solid ${t.color || '#3b82f6'}`
          }}>
          <span style={{ fontSize: '18px' }}>{t.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', marginBottom: '2px' }}>{t.title}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{t.msg}</div>
          </div>
          <button onClick={() => removeToast(t.id)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px', padding: '0', lineHeight: 1 }}>✕</button>
        </div>
      ))}
    </div>
  )
}

// ─── OCCUPANCY BAR ───────────────────────────────────────────────────────────

function OccupancyBar({ passengers, capacity, showLabel = true }) {
  const { pct, label, color, bg, icon } = occupancyInfo(passengers, capacity)
  return (
    <div style={{ background: bg, borderRadius: '8px', padding: '8px 10px' }}>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>{icon} {label}</span>
          <span style={{ fontSize: '11px', fontWeight: '700', color }}>{passengers}/{capacity} seats</span>
        </div>
      )}
      <div style={{ background: '#e2e8f0', borderRadius: '99px', height: '6px', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: '99px',
          background: color, transition: 'width 0.5s ease'
        }} />
      </div>
      {showLabel && <div style={{ fontSize: '10px', color, marginTop: '3px', textAlign: 'right', fontWeight: '600' }}>{pct}% full</div>}
    </div>
  )
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState('login')
  const [user, setUser] = useState(null)
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loginError, setLoginError] = useState('')

  const [tab, setTab] = useState('map')
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [planResult, setPlanResult] = useState(null)
  const [time, setTime] = useState(new Date())
  const [showProfile, setShowProfile] = useState(false)
  const [flyTo, setFlyTo] = useState(null)

  // Live bus positions (simulated)
  const [busPosMap, setBusPosMap] = useState(
    Object.fromEntries(busRoutes.map(b => [b.id, b.busPos]))
  )

  // Live occupancy (simulated fluctuations)
  const [occupancyMap, setOccupancyMap] = useState(
    Object.fromEntries(busRoutes.map(b => [b.id, b.passengers]))
  )

  // Notifications / Alerts
  const [alerts, setAlerts] = useState(INITIAL_ALERTS)
  const [toasts, setToasts] = useState([])
  const toastId = useRef(100)

  // ── Live clock ──
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // ── Simulate live bus movement ──
  useEffect(() => {
    const t = setInterval(() => {
      setBusPosMap(prev => {
        const next = { ...prev }
        busRoutes.forEach(bus => {
          const [lat, lng] = prev[bus.id]
          next[bus.id] = [lat + (Math.random() - 0.5) * 0.0008, lng + (Math.random() - 0.5) * 0.0008]
        })
        return next
      })
    }, 2000)
    return () => clearInterval(t)
  }, [])

  // ── Simulate live occupancy ──
  useEffect(() => {
    const t = setInterval(() => {
      setOccupancyMap(prev => {
        const next = { ...prev }
        busRoutes.forEach(bus => {
          const delta = Math.floor((Math.random() - 0.4) * 4)
          next[bus.id] = Math.max(0, Math.min(bus.capacity, (prev[bus.id] || bus.passengers) + delta))
        })
        return next
      })
    }, 4000)
    return () => clearInterval(t)
  }, [])

  // ── Push notification every 30s ──
  useEffect(() => {
    if (!user) return
    const msgs = [
      { title: '🚌 Route 303 approaching', msg: 'Arriving at East Market in 2 mins', icon: '🚌', color: '#3b82f6' },
      { title: '⚠️ Route 202 still delayed', msg: 'Now 9 minutes behind schedule', icon: '⚠️', color: '#ef4444' },
      { title: '✅ Route 101 on time', msg: 'Next departure from Central Station in 5 mins', icon: '✅', color: '#10b981' },
      { title: '👥 Route 404 filling up', msg: '80% capacity reached — board soon!', icon: '👥', color: '#f59e0b' },
    ]
    const t = setInterval(() => {
      const msg = msgs[Math.floor(Math.random() * msgs.length)]
      pushToast(msg)
      setAlerts(prev => [{
        id: Date.now(), type: 'live', route: msg.title.split(' ')[2] || '?',
        msg: msg.msg, time: 'Just now', read: false
      }, ...prev.slice(0, 9)])
    }, 30000)
    return () => clearInterval(t)
  }, [user])

  const pushToast = (t) => {
    const id = toastId.current++
    setToasts(prev => [...prev, { ...t, id }])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 5000)
  }

  const removeToast = (id) => setToasts(prev => prev.filter(x => x.id !== id))

  const markAllRead = () => setAlerts(prev => prev.map(a => ({ ...a, read: true })))
  const unreadCount = alerts.filter(a => !a.read).length

  // ── Login ──
  const handleLogin = () => {
    const found = users.find(u => u.email === email && u.password === password)
    if (found) {
      setUser(found); setPage('dashboard'); setLoginError('')
      pushToast({ title: `Welcome back, ${found.name.split(' ')[0]}! 👋`, msg: 'Live tracking is active.', icon: '🚌', color: '#10b981' })
    } else setLoginError('❌ Wrong email or password!')
  }

  const handleRegister = () => {
    if (!name || !email || !password || !phone) { setLoginError('⚠️ Please fill all fields!'); return }
    const newUser = { id: users.length + 1, name, email, password, phone, avatar: '🧑' }
    users.push(newUser)
    setUser(newUser); setPage('dashboard'); setLoginError('')
    pushToast({ title: 'Account created! 🎉', msg: 'Welcome to TransitIQ.', icon: '🎉', color: '#10b981' })
  }

  // ── Route planner ──
  const findRoute = () => {
    const found = busRoutes.find(b =>
      b.stops.some(s => s.toLowerCase().includes(from.toLowerCase())) &&
      b.stops.some(s => s.toLowerCase().includes(to.toLowerCase()))
    )
    if (found) {
      const eta = etaCalc(found.stops, from, to)
      setPlanResult({ bus: found, eta, occ: occupancyInfo(occupancyMap[found.id], found.capacity) })
      setFlyTo(found.busPos)
      pushToast({ title: `Route found! ${found.name}`, msg: `ETA ~${eta?.eta || '?'} mins from ${from}`, icon: '🗺️', color: '#3b82f6' })
    } else {
      setPlanResult('none')
    }
  }

  const filtered = busRoutes.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.from.toLowerCase().includes(search.toLowerCase()) ||
    b.to.toLowerCase().includes(search.toLowerCase())
  )

  const allStops = [...new Set(busRoutes.flatMap(b => b.stops))]

  // ─── LOGIN PAGE ──────────────────────────────────────────────────────────────
  if (page === 'login') return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Segoe UI', sans-serif"
    }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ width: '100%', maxWidth: '400px', padding: '0 20px', animation: 'fadeUp 0.5s ease' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '52px', marginBottom: '8px' }}>🚌</div>
          <div style={{ fontSize: '26px', fontWeight: '800', color: 'white' }}>TransitIQ</div>
          <div style={{ fontSize: '13px', color: '#7dd3fc', marginTop: '4px' }}>Smart Public Transport</div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.97)', borderRadius: '20px',
          padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>
            {isRegister ? '📝 Create Account' : '👋 Welcome Back'}
          </div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '22px' }}>
            {isRegister ? 'Register to track buses' : 'Login to your account'}
          </div>

          {isRegister && (
            <>
              {[{ label: 'FULL NAME', ph: 'Enter your name', val: name, set: setName },
                { label: 'PHONE', ph: 'Enter phone number', val: phone, set: setPhone }].map((f, i) => (
                <div key={i}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                  <input placeholder={f.ph} value={f.val} onChange={e => f.set(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', marginBottom: '12px', boxSizing: 'border-box', background: '#f8fafc' }} />
                </div>
              ))}
            </>
          )}

          {[{ label: 'EMAIL', ph: 'Enter your email', val: email, set: setEmail, type: 'email' },
            { label: 'PASSWORD', ph: 'Enter password', val: password, set: setPassword, type: 'password' }].map((f, i) => (
            <div key={i}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '4px' }}>{f.label}</label>
              <input placeholder={f.ph} type={f.type} value={f.val} onChange={e => f.set(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', marginBottom: '12px', boxSizing: 'border-box', background: '#f8fafc' }} />
            </div>
          ))}

          {!isRegister && <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '14px' }}>Demo: rahul@gmail.com / 123456</div>}

          {loginError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '14px' }}>
              {loginError}
            </div>
          )}

          <button onClick={isRegister ? handleRegister : handleLogin}
            style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '15px', fontWeight: '600', cursor: 'pointer', marginBottom: '16px', boxShadow: '0 4px 12px rgba(59,130,246,0.4)' }}>
            {isRegister ? 'Create Account →' : 'Login →'}
          </button>

          <div style={{ textAlign: 'center', fontSize: '13px', color: '#94a3b8' }}>
            {isRegister ? 'Already have account? ' : "Don't have account? "}
            <span onClick={() => { setIsRegister(!isRegister); setLoginError('') }}
              style={{ color: '#3b82f6', cursor: 'pointer', fontWeight: '600' }}>
              {isRegister ? 'Login' : 'Register'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── DASHBOARD ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc', fontFamily: "'Segoe UI',sans-serif", color: '#0f172a' }}>
      <style>{`
        @keyframes slideIn { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.4)} 50%{box-shadow:0 0 0 6px rgba(16,185,129,0)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .bus-live { animation: blink 1.5s infinite; }
        ::-webkit-scrollbar { width: 4px } ::-webkit-scrollbar-track { background: #f1f5f9 }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px }
      `}</style>

      <Toast toasts={toasts} removeToast={removeToast} />

      {/* TOPBAR */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 20px', height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🚌</span>
          <span style={{ fontSize: '16px', fontWeight: '800' }}>TransitIQ</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>LIVE</span>
          </div>
          <span style={{ fontSize: '13px', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{time.toLocaleTimeString()}</span>

          {/* Notification Bell */}
          <div onClick={() => { setTab('alerts'); setShowProfile(false) }}
            style={{ position: 'relative', cursor: 'pointer', padding: '6px', borderRadius: '8px', background: unreadCount > 0 ? '#fef2f2' : '#f8fafc', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '16px' }}>🔔</span>
            {unreadCount > 0 && (
              <div style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#ef4444', color: 'white', fontSize: '9px', fontWeight: '700', borderRadius: '99px', minWidth: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid white' }}>
                {unreadCount}
              </div>
            )}
          </div>

          {/* Profile */}
          <div style={{ position: 'relative' }}>
            <div onClick={() => setShowProfile(!showProfile)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: '#f8fafc', padding: '5px 10px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '18px' }}>{user?.avatar}</span>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>{user?.name.split(' ')[0]}</span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>▼</span>
            </div>
            {showProfile && (
              <div style={{ position: 'absolute', right: 0, top: '42px', background: 'white', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', width: '230px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 9999 }}>
                <div style={{ textAlign: 'center', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9', marginBottom: '14px' }}>
                  <div style={{ fontSize: '38px', marginBottom: '6px' }}>{user?.avatar}</div>
                  <div style={{ fontWeight: '700', fontSize: '15px' }}>{user?.name}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{user?.email}</div>
                </div>
                {[
                  { icon: '📱', label: 'Phone', val: user?.phone },
                  { icon: '🎫', label: 'Saved Routes', val: '3 routes' },
                  { icon: '🕐', label: 'Last Trip', val: '2 hrs ago' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0', fontSize: '13px' }}>
                    <span>{item.icon}</span>
                    <span style={{ color: '#64748b' }}>{item.label}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: '500' }}>{item.val}</span>
                  </div>
                ))}
                <button onClick={() => { setPage('login'); setUser(null); setShowProfile(false) }}
                  style={{ width: '100%', marginTop: '14px', padding: '8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                  🚪 Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ALERT BANNER */}
      <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '7px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px' }}>⚠️</span>
        <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: '500' }}>
          Route 202 delayed 7 min — Heavy traffic near Hospital Road
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#f87171' }}>2 min ago</span>
      </div>

      {/* NAV */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '0 20px', display: 'flex', gap: '2px' }}>
        {[
          { id: 'map', label: '🗺️ Live Map' },
          { id: 'routes', label: '🛣️ My Routes' },
          { id: 'planner', label: '🔍 Planner' },
          { id: 'alerts', label: `🔔 Alerts${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
          { id: 'profile', label: '👤 Profile' },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setShowProfile(false) }}
            style={{
              padding: '11px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: '12px', fontWeight: tab === t.id ? '700' : '500',
              color: tab === t.id ? '#3b82f6' : '#64748b',
              borderBottom: tab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
              whiteSpace: 'nowrap'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── MAP TAB ── */}
        {tab === 'map' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', width: '100%', height: '100%' }}>
            <MapContainer center={[28.630, 77.210]} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {flyTo && <FlyTo position={flyTo} />}

              {(selected ? [selected] : busRoutes).map(bus => (
                <div key={bus.id}>
                  <Polyline positions={bus.coords} color={bus.color} weight={3} opacity={0.7} />
                  {bus.coords.map((c, i) => (
                    <Marker key={i} position={c} icon={stopDot(bus.color)}>
                      <Popup>
                        <b>{bus.stops[i]}</b><br />
                        <span style={{ fontSize: '12px', color: '#64748b' }}>{bus.name}</span>
                      </Popup>
                    </Marker>
                  ))}
                  {/* LIVE BUS MARKER with occupancy % badge */}
                  <Marker
                    position={busPosMap[bus.id]}
                    icon={busIcon(bus.color, occupancyInfo(occupancyMap[bus.id], bus.capacity).pct)}>
                    <Popup>
                      <div style={{ fontFamily: 'sans-serif', minWidth: '180px' }}>
                        <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '4px' }}>🚌 {bus.name}</div>
                        <div style={{ color: bus.color, fontWeight: '600', fontSize: '12px', marginBottom: '6px' }}>● LIVE · {bus.status}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Next stop in {bus.nextArrival}</div>
                        <OccupancyBar passengers={occupancyMap[bus.id]} capacity={bus.capacity} />
                      </div>
                    </Popup>
                  </Marker>
                </div>
              ))}
            </MapContainer>

            {/* ROUTE PANEL */}
            <div style={{ background: 'white', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Live Routes</div>
                <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }} />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {filtered.map(bus => (
                  <div key={bus.id}
                    onClick={() => { setSelected(selected?.id === bus.id ? null : bus); setFlyTo(busPosMap[bus.id]) }}
                    style={{
                      padding: '12px', borderRadius: '10px', cursor: 'pointer', marginBottom: '6px',
                      border: `1px solid ${selected?.id === bus.id ? bus.color : '#f1f5f9'}`,
                      background: selected?.id === bus.id ? `${bus.color}08` : 'white'
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700' }}>
                        <span style={{ color: bus.color }}>● </span>{bus.name}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px', background: `${bus.color}15`, color: bus.color }}>
                        {bus.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                      {bus.from} → {bus.to}
                    </div>

                    {/* Occupancy Bar inside route card */}
                    <OccupancyBar passengers={occupancyMap[bus.id]} capacity={bus.capacity} />

                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>⏱ {bus.nextArrival}</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>🔁 {bus.frequency}</span>
                      <span className="bus-live" style={{ fontSize: '10px', color: bus.color, fontWeight: '700', marginLeft: 'auto' }}>● LIVE</span>
                    </div>

                    {/* Stop list when selected */}
                    {selected?.id === bus.id && (
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                        {bus.stops.map((s, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '12px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: bus.color, flexShrink: 0 }} />
                            <span style={{ color: '#374151' }}>{s}</span>
                            <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '11px' }}>{i * 6} min</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', gap: '16px' }}>
                {[
                  { label: 'On Time', val: busRoutes.filter(b => b.status === 'On Time').length, color: '#10b981' },
                  { label: 'Delayed', val: busRoutes.filter(b => b.status === 'Delayed').length, color: '#ef4444' },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── PLANNER TAB ── */}
        {tab === 'planner' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>🔍 Route Planner</div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>Find the best route with live ETA</div>

            <div style={{ background: 'white', borderRadius: '14px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>FROM STOP</label>
              <select value={from} onChange={e => setFrom(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', marginBottom: '14px', background: '#f8fafc', color: from ? '#0f172a' : '#94a3b8' }}>
                <option value="">Select departure stop...</option>
                {allStops.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '5px' }}>TO STOP</label>
              <select value={to} onChange={e => setTo(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', marginBottom: '16px', background: '#f8fafc', color: to ? '#0f172a' : '#94a3b8' }}>
                <option value="">Select destination stop...</option>
                {allStops.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <button onClick={findRoute}
                style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', border: 'none', borderRadius: '10px', color: 'white', fontSize: '15px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.35)' }}>
                Find Route →
              </button>
            </div>

            {/* Result */}
            {planResult === 'none' && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px', textAlign: 'center', fontSize: '14px', color: '#dc2626' }}>
                😕 No direct route found between these stops.
              </div>
            )}

            {planResult && planResult !== 'none' && (() => {
              const { bus, eta, occ } = planResult
              return (
                <div style={{ background: 'white', borderRadius: '14px', border: `1px solid ${bus.color}40`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  {/* Header */}
                  <div style={{ background: `${bus.color}12`, padding: '14px 16px', borderBottom: `1px solid ${bus.color}20`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '15px' }}>🚌 {bus.name}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{bus.from} → {bus.to}</div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '12px', background: `${bus.color}20`, color: bus.color }}>{bus.status}</span>
                  </div>

                  <div style={{ padding: '16px' }}>
                    {/* ETA Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                      {[
                        { icon: '⏱', label: 'Est. Travel', val: `~${eta?.eta || '?'} min` },
                        { icon: '🛑', label: 'Stops', val: `${eta?.stops || '?'} stops` },
                        { icon: '🚌', label: 'Next Bus', val: bus.nextArrival },
                      ].map((c, i) => (
                        <div key={i} style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '18px', marginBottom: '4px' }}>{c.icon}</div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{c.val}</div>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>{c.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Occupancy */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>👥 CURRENT OCCUPANCY</div>
                      <OccupancyBar passengers={occupancyMap[bus.id]} capacity={bus.capacity} />
                    </div>

                    {/* Journey steps */}
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>📍 JOURNEY STEPS</div>
                    {bus.stops.map((s, i) => {
                      const isFrom = s.toLowerCase().includes(from.toLowerCase())
                      const isTo = s.toLowerCase().includes(to.toLowerCase())
                      const isActive = eta && i >= Math.min(eta.fromIdx, eta.toIdx) && i <= Math.max(eta.fromIdx, eta.toIdx)
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', opacity: isActive ? 1 : 0.4 }}>
                          <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: isFrom ? '#3b82f6' : isTo ? '#10b981' : bus.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'white', fontWeight: '700', flexShrink: 0 }}>
                            {isFrom ? '🏁' : isTo ? '🎯' : i + 1}
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: isFrom || isTo ? '700' : '400', color: '#0f172a' }}>{s}</span>
                          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8' }}>{i * 6} min</span>
                        </div>
                      )
                    })}

                    <button
                      onClick={() => { setTab('map'); setSelected(bus); setFlyTo(busPosMap[bus.id]) }}
                      style={{ width: '100%', marginTop: '14px', padding: '10px', background: `${bus.color}`, border: 'none', borderRadius: '10px', color: 'white', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                      📍 Track on Map
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── ALERTS TAB ── */}
        {tab === 'alerts' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>🔔 Notifications</div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>{unreadCount} unread alerts</div>
              </div>
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  style={{ padding: '7px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', color: '#3b82f6', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                  Mark all read
                </button>
              )}
            </div>

            {/* Alert preferences */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '10px' }}>ALERT PREFERENCES</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {[
                  { icon: '⚠️', label: 'Delays', active: true, color: '#ef4444' },
                  { icon: '👥', label: 'Crowd', active: true, color: '#f59e0b' },
                  { icon: '🚌', label: 'Arrivals', active: true, color: '#10b981' },
                  { icon: 'ℹ️', label: 'Info', active: false, color: '#3b82f6' },
                ].map((p, i) => (
                  <div key={i} style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', background: p.active ? `${p.color}15` : '#f1f5f9', color: p.active ? p.color : '#94a3b8', border: `1px solid ${p.active ? p.color + '30' : '#e2e8f0'}`, cursor: 'pointer' }}>
                    {p.icon} {p.label}
                  </div>
                ))}
              </div>
            </div>

            {alerts.map(a => (
              <div key={a.id}
                onClick={() => setAlerts(prev => prev.map(x => x.id === a.id ? { ...x, read: true } : x))}
                style={{
                  background: a.read ? 'white' : '#eff6ff',
                  borderRadius: '12px', padding: '14px 16px', marginBottom: '8px',
                  border: `1px solid ${a.read ? '#f1f5f9' : '#bfdbfe'}`,
                  cursor: 'pointer', transition: 'all 0.2s'
                }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '20px' }}>
                    {a.type === 'delay' ? '⚠️' : a.type === 'crowd' ? '👥' : a.type === 'live' ? '🔴' : 'ℹ️'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: a.read ? '500' : '700', color: '#0f172a', marginBottom: '2px' }}>
                      Route {a.route}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{a.msg}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{a.time}</div>
                  </div>
                  {!a.read && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0, marginTop: '4px' }} />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ROUTES TAB ── */}
        {tab === 'routes' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
            <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>🛣️ All Routes</div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>Live status & crowd info</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {busRoutes.map(bus => {
                const occ = occupancyInfo(occupancyMap[bus.id], bus.capacity)
                return (
                  <div key={bus.id} style={{ background: 'white', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <span style={{ color: bus.color, marginRight: '6px' }}>●</span>
                        <span style={{ fontWeight: '700', fontSize: '15px' }}>{bus.name}</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>{bus.busNumber}</span>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '12px', background: `${bus.color}15`, color: bus.color }}>{bus.status}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>{bus.from} → {bus.to} · {bus.frequency}</div>

                    <OccupancyBar passengers={occupancyMap[bus.id]} capacity={bus.capacity} />

                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                      {bus.stops.map((s, i) => (
                        <span key={i} style={{ fontSize: '11px', padding: '3px 8px', background: '#f1f5f9', borderRadius: '6px', color: '#475569' }}>{s}</span>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>⏱ Next: <b>{bus.nextArrival}</b></span>
                      <span style={{ fontSize: '12px', color: occ.color, fontWeight: '600', marginLeft: 'auto' }}>{occ.icon} {occ.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {tab === 'profile' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', maxWidth: '480px', margin: '0 auto', width: '100%' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '56px', marginBottom: '10px' }}>{user?.avatar}</div>
              <div style={{ fontWeight: '800', fontSize: '20px' }}>{user?.name}</div>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{user?.email}</div>
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '24px' }}>
                {[{ icon: '🎫', val: '3', label: 'Saved' }, { icon: '🕐', val: '47', label: 'Trips' }, { icon: '⭐', val: '4.8', label: 'Rating' }].map((s, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>{s.val}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{s.icon} {s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            {[
              { icon: '📱', label: 'Phone', val: user?.phone },
              { icon: '🔔', label: 'Notifications', val: 'Enabled' },
              { icon: '🗺️', label: 'Default Route', val: 'Route 101' },
              { icon: '🌙', label: 'Theme', val: 'Light' },
            ].map((item, i) => (
              <div key={i} style={{ background: 'white', borderRadius: '10px', padding: '13px 16px', marginBottom: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '18px' }}>{item.icon}</span>
                <span style={{ fontSize: '14px', color: '#374151' }}>{item.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>{item.val}</span>
                <span style={{ color: '#cbd5e1', fontSize: '12px' }}>›</span>
              </div>
            ))}
            <button onClick={() => { setPage('login'); setUser(null) }}
              style={{ width: '100%', marginTop: '8px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#dc2626', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              🚪 Logout
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
