import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Lock, User, Shield, Eye, EyeOff, QrCode, Siren, BarChart3, Smartphone, Download, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLoginSuccess?: (token: string, userData: any, modules?: any) => void;
}

/** Split layout: brand panel (lg+) + form. On phones the form fills the screen with a compact brand header. */
const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apkChecking, setApkChecking] = useState(false);
  const [apkNotice, setApkNotice] = useState('');
  const navigate = useNavigate();

  const apkUrl = (import.meta as any).env?.VITE_APK_DOWNLOAD_URL || '/rakshak-field.apk';

  const handleDownloadApk = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (/^https?:\/\//i.test(apkUrl)) return; // External release URL downloads directly
    e.preventDefault();
    setApkNotice('');
    setApkChecking(true);
    try {
      const res = await fetch(apkUrl, { method: 'HEAD' });
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || contentType.includes('text/html')) {
        setApkNotice('APK package is not uploaded yet. Place rakshak-field.apk in frontend/public/ or set VITE_APK_DOWNLOAD_URL.');
        return;
      }
      const link = document.createElement('a');
      link.href = apkUrl;
      link.download = 'rakshak-field.apk';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      setApkNotice('Unable to reach APK download file. Please verify network connection.');
    } finally {
      setApkChecking(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const baseUrl = import.meta.env.VITE_API_URL || 'https://rakshak-api.spandangrasim.workers.dev';
    try {
      const response = await axios.post(`${baseUrl}/api/v1/auth/login`, { employee_code: adminId, password });
      const token = response.data.access_token;
      const userData = response.data.guard || { full_name: 'Admin', employee_code: adminId };
      const visibleModules = response.data.visible_modules || {};

      if (userData.tier === 'USER') {
        setError('This console is for administrators. Please use the Rakshak mobile app.');
        return;
      }
      if (onLoginSuccess) {
        onLoginSuccess(token, userData, visibleModules);
      } else {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('visible_modules', JSON.stringify(visibleModules));
      }
      navigate(userData.tier === 'SUPER_ADMIN' ? '/platform' : '/overview');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid Employee Code or Password');
    } finally {
      setIsLoading(false);
    }
  };

  const points = [
    { icon: <QrCode className="h-5 w-5" />, t: 'QR checkpoint patrols', d: 'Every round verified by location and time.' },
    { icon: <Siren className="h-5 w-5" />, t: 'Incidents in real time', d: 'Raised, assigned and closed in one queue.' },
    { icon: <BarChart3 className="h-5 w-5" />, t: 'Daily reports', d: 'Shift summaries delivered automatically.' },
  ];

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25"><Shield className="h-6 w-6" /></div>
          <span className="text-xl font-extrabold tracking-tight">Rakshak</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">Know every round happened. Every time.</h2>
          <p className="mt-3 text-brand-100">Patrol and incident management for your plant, built for the people on the ground.</p>
          <ul className="mt-8 space-y-4">
            {points.map((p) => (
              <li key={p.t} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/20">{p.icon}</span>
                <span><span className="block text-sm font-bold">{p.t}</span><span className="block text-sm text-brand-100">{p.d}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200">Enterprise Security Infrastructure by Spandan IT Professionals</p>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-lift lg:hidden"><Shield className="h-7 w-7" /></div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to the Rakshak admin console</p>
          </div>

          {error && <div role="alert" className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="adminId" className="label">Employee code</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                <input id="adminId" type="text" autoComplete="username" autoCapitalize="none" placeholder="e.g. ADM-001" value={adminId} onChange={(e) => setAdminId(e.target.value)} required className="field pl-11" />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required className="field pl-11 pr-12" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full !min-h-[48px] text-base">{isLoading ? 'Signing in…' : 'Sign in'}</button>
          </form>

          {/* Android Field App (.APK) Direct Download */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-slate-900">Rakshak Field App (Android)</div>
                  <div className="text-[11px] text-slate-500">For security guards &amp; patrol officers</div>
                </div>
              </div>

              <a
                href={apkUrl}
                download="rakshak-field.apk"
                onClick={handleDownloadApk}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" />
                {apkChecking ? 'Checking…' : 'Download APK'}
              </a>
            </div>

            {apkNotice && (
              <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>{apkNotice}</span>
              </div>
            )}
          </div>

          <p className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500 lg:text-left">
            Enterprise Security Infrastructure by <span className="font-bold text-slate-800">Spandan IT Professionals</span>
            <br /><a href="https://spandanit.com" target="_blank" rel="noopener noreferrer" className="font-bold text-brand-600 hover:underline">www.spandanit.com</a>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
