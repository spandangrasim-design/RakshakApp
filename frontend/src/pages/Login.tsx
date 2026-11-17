import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Lock, User, Shield } from 'lucide-react';

interface LoginProps {
  onLoginSuccess?: (token: string, userData: any, modules?: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const baseUrl = import.meta.env.VITE_API_URL || 'https://rakshak-api.spandangrasim.workers.dev';

    try {
      const response = await axios.post(`${baseUrl}/api/v1/auth/login`, {
        employee_code: adminId,
        password: password
      });

      const token = response.data.access_token;
      const userData = response.data.guard || { full_name: 'Admin', employee_code: adminId };
      const visibleModules = response.data.visible_modules || {};

      // The web console is for the two admin tiers. Field users use the mobile app.
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

      // Route dynamically: if Patrol is disabled for this tenant, land on /guards
      const defaultRoute =
        userData.tier === 'SUPER_ADMIN' ? '/platform' : '/overview';
      navigate(defaultRoute);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid Employee Code or Password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rakshak-login min-h-screen p-4 text-slate-800 sm:p-6 lg:p-8">
      <main className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-7xl overflow-hidden rounded-[30px] border border-white/80 bg-white/50 shadow-[0_30px_90px_-55px_rgba(15,35,70,.35)] lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.02fr_.98fr]">
        <section className="rakshak-login-panel relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14">
          <div className="relative z-10 flex items-center gap-4">
            <div className="flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-lg shadow-black/10">
              <img src="/branding/rakshak-logo.png" alt="Rakshak" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="text-xl font-extrabold tracking-tight">Rakshak</div>
              <div className="mt-0.5 text-xs font-medium tracking-wide text-blue-100/80">SECURITY OPERATIONS PLATFORM</div>
            </div>
          </div>

          <div className="relative z-10 max-w-xl py-12">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50 backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.85)]" />
              One view for every operation
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.12] tracking-tight xl:text-5xl">Stay aware.<br />Stay in control.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-blue-100/80">Coordinate patrol activity, people and incident response from one clear operational workspace.</p>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
              {[
                { value: '01', label: 'Patrol visibility' },
                { value: '02', label: 'Incident response' },
                { value: '03', label: 'Team oversight' },
              ].map((item) => (
                <div key={item.value} className="rounded-2xl border border-white/15 bg-white/[.08] p-3 backdrop-blur-sm">
                  <div className="text-xs font-bold tracking-widest text-blue-200">{item.value}</div>
                  <div className="mt-2 text-xs font-semibold leading-5 text-white">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-5 text-xs text-blue-100/65">
            <span>Secure access for authorised administrators</span>
            <span>Rakshak · Spandan IT</span>
          </div>
          <div className="pointer-events-none absolute -bottom-36 -left-28 h-[420px] w-[420px] rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-[300px] w-[300px] rounded-full border border-white/10" />
        </section>

        <section className="flex items-center justify-center bg-white px-5 py-10 sm:px-10 lg:px-12 xl:px-16">
          <div className="w-full max-w-[430px]">
            <div className="mb-9 flex items-center gap-3 lg:hidden">
              <img src="/branding/rakshak-logo.png" alt="Rakshak" className="h-12 w-12 rounded-xl object-contain" />
              <div>
                <div className="text-lg font-extrabold tracking-tight text-slate-900">Rakshak</div>
                <div className="text-[10px] font-bold tracking-[.14em] text-slate-400">SECURITY OPERATIONS</div>
              </div>
            </div>
            <div className="mb-8">
              <div className="mb-3 inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[.13em] text-blue-700">Administrator access</div>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">Welcome back</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Sign in with your administrator credentials to continue.</p>
            </div>

            {error && (
              <div className="mb-5 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700" role="alert">
                <Shield className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="admin-code" className="mb-2 block text-xs font-bold tracking-wide text-slate-700">Employee code</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-code"
                    type="text"
                    placeholder="Enter your employee code"
                    autoComplete="username"
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3.5 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="admin-password" className="block text-xs font-bold tracking-wide text-slate-700">Password</label>
                  <span className="text-[11px] font-medium text-slate-400">Secure sign in</span>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-password"
                    type="password"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3.5 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-blue-600/25 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {isLoading ? 'Signing in…' : 'Sign in to Rakshak'}
                {!isLoading && <Shield className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-10 border-t border-slate-100 pt-5 text-center">
              <div className="text-[11px] leading-5 text-slate-400">Enterprise security infrastructure by</div>
              <a href="https://spandanit.com" target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-extrabold tracking-tight text-slate-700 transition hover:text-blue-700">Spandan IT Professionals</a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Login;