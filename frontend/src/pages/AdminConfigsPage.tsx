import React, { useState, useEffect, FormEvent } from 'react';
import {
  Eye,
  EyeOff,
  CheckCircle2,
  Power,
  HelpCircle,
  Send,
  AlertCircle,
  Mail,
  MessageSquare,
  Radio,
  RefreshCw,
  Save,
  Layers,
  Building2,
  Plus,
  Trash2
} from 'lucide-react';

import { API_ROOT as API_BASE_URL } from '../lib/api';
const MASK = "********";
const DEFAULT_PLANTS = ['Test - P1', 'Test2 - P2'];

export default function AdminConfigsPage() {
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testingEmail, setTestingEmail] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: string }>({ text: '', type: '' });
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [showOAuthGuide, setShowOAuthGuide] = useState<boolean>(false);

  // Plant Name & User Assignment State
  const [plants, setPlants] = useState<string[]>(DEFAULT_PLANTS);
  const [newPlantInput, setNewPlantInput] = useState<string>('');
  const [guards, setGuards] = useState<any[]>([]);
  const [savingPlantUser, setSavingPlantUser] = useState<string | null>(null);

  const visibleModules = React.useMemo(() => {
    try {
      const saved = localStorage.getItem('visible_modules');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, []);

  const allowGmail = visibleModules.integration_gmail !== false;
  const allowWhatsapp = visibleModules.integration_whatsapp === true;
  const allowTelegram = visibleModules.integration_telegram === true;

  useEffect(() => {
    fetchConfigs();
  }, []);

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const [cfgRes, guardsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/admin/configs`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/api/v1/guards`, { headers: getAuthHeaders() }),
      ]);
      const data = await cfgRes.json();
      const gData = await guardsRes.json().catch(() => ({ guards: [] }));

      if (gData.success && Array.isArray(gData.guards)) {
        setGuards(gData.guards);
      }

      if (data.success) {
        const configMap: Record<string, string> = {};
        (data.configs || []).forEach((item: { key_name: string; key_value: string }) => {
          configMap[item.key_name] = item.key_value;
        });

        if (configMap['CUSTOM_PLANTS']) {
          try {
            const parsed = JSON.parse(configMap['CUSTOM_PLANTS']);
            if (Array.isArray(parsed) && parsed.length > 0) setPlants(parsed);
          } catch {}
        }

        if (allowGmail && configMap['ENABLE_GMAIL'] === undefined) {
          configMap['ENABLE_GMAIL'] =
            configMap['MANAGER_EMAIL'] || configMap['GMAIL_REFRESH_TOKEN'] || configMap['GMAIL_ACCESS_TOKEN']
              ? 'true'
              : 'false';
        }
        if (allowWhatsapp && configMap['ENABLE_WHATSAPP'] === undefined) {
          configMap['ENABLE_WHATSAPP'] =
            configMap['MANAGER_PHONE'] || configMap['WHATSAPP_PHONE_ID'] || configMap['WHATSAPP_API_TOKEN']
              ? 'true'
              : 'false';
        }
        if (allowTelegram && configMap['ENABLE_TELEGRAM'] === undefined) {
          configMap['ENABLE_TELEGRAM'] = configMap['TELEGRAM_BOT_TOKEN'] ? 'true' : 'false';
        }

        setConfigs(configMap);
      } else {
        setMessage({ text: data.message || 'Failed to load configurations', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Network error while loading configurations', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setConfigs(prev => ({ ...prev, [key]: value }));
  };

  const handleAddPlant = () => {
    const trimmed = newPlantInput.trim();
    if (!trimmed || plants.includes(trimmed)) return;
    const next = [...plants, trimmed];
    setPlants(next);
    handleChange('CUSTOM_PLANTS', JSON.stringify(next));
    setNewPlantInput('');
  };

  const handleRemovePlant = (plant: string) => {
    if (plants.length <= 1) return;
    const next = plants.filter((p) => p !== plant);
    setPlants(next);
    handleChange('CUSTOM_PLANTS', JSON.stringify(next));
  };

  const handleToggleGuardPlant = async (guard: any, plant: string) => {
    setSavingPlantUser(guard.guard_id);
    const current: string[] = Array.isArray(guard.assigned_plants) ? guard.assigned_plants : [];
    const next = current.includes(plant)
      ? current.filter((p) => p !== plant)
      : [...current, plant];

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/guards/${guard.guard_id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ assigned_plants: next }),
      });
      if (res.ok) {
        setGuards((prev) =>
          prev.map((g) => (g.guard_id === guard.guard_id ? { ...g, assigned_plants: next } : g))
        );
      }
    } finally {
      setSavingPlantUser(null);
    }
  };

  const handleToggleIntegration = (enableKey: string) => {
    setConfigs(prev => ({
      ...prev,
      [enableKey]: prev[enableKey] === 'true' ? 'false' : 'true',
    }));
  };

  const toggleTokenVisibility = (key: string) => {
    setShowTokens(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const buildAllowedPayload = () => {
    return Object.keys(configs)
      .filter((key) => {
        if (configs[key] === MASK) return false;
        if (key.startsWith('GMAIL_') || key.startsWith('SMTP_') || key === 'EMAIL_PROVIDER' || key === 'ENABLE_GMAIL' || key === 'MANAGER_EMAIL') return allowGmail;
        if (key.startsWith('WHATSAPP_') || key === 'ENABLE_WHATSAPP' || key === 'MANAGER_PHONE') return allowWhatsapp;
        if (key.startsWith('TELEGRAM_') || key === 'ENABLE_TELEGRAM') return allowTelegram;
        return true;
      })
      .map((key) => ({
        key_name: key,
        key_value: configs[key] ?? '',
      }));
  };

  const handleSave = async (e?: FormEvent): Promise<boolean> => {
    if (e) e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    const payload = buildAllowedPayload();

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/configs`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({ text: 'Configurations updated successfully!', type: 'success' });
        return true;
      } else {
        setMessage({ text: data.message || 'Failed to save configurations', type: 'error' });
        return false;
      }
    } catch (error) {
      setMessage({ text: 'Network error while saving', type: 'error' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleTestGmail = async () => {
    setTestingEmail(true);
    setMessage({ text: '', type: '' });

    const savedOk = await handleSave();
    if (!savedOk) {
      setTestingEmail(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/test-gmail`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({
          text: `Test email sent successfully to ${(data.recipients || []).join(', ')}!`,
          type: 'success',
        });
      } else {
        setMessage({
          text: `Gmail Test Failed: ${data.message || 'Check your OAuth2 credentials'}`,
          type: 'error',
        });
      }
    } catch (err) {
      setMessage({ text: 'Network error calling test-gmail endpoint.', type: 'error' });
    } finally {
      setTestingEmail(false);
    }
  };

  const [channelFilter, setChannelFilter] = useState<'ALL' | 'GMAIL' | 'WHATSAPP' | 'TELEGRAM'>('ALL');

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4 p-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  const isGmailEnabled = configs['ENABLE_GMAIL'] === 'true';
  const isWhatsappEnabled = configs['ENABLE_WHATSAPP'] === 'true';
  const isTelegramEnabled = configs['ENABLE_TELEGRAM'] === 'true';

  const licensedCount = [allowGmail, allowWhatsapp, allowTelegram].filter(Boolean).length;
  const activeCount = [
    allowGmail && isGmailEnabled,
    allowWhatsapp && isWhatsappEnabled,
    allowTelegram && isTelegramEnabled,
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-6 font-sans text-xs text-slate-800">
      <form onSubmit={handleSave} className="mx-auto max-w-[1600px] space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              Plant Routing, Notification Channels &amp; API Integrations
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Manage Plant Names and user alert assignments, plus configure enterprise email, WhatsApp, and Telegram gateways.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {licensedCount > 1 && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Layers className="h-3.5 w-3.5 text-brand-600" />
                <span className="text-[11px] font-bold uppercase text-slate-400">Channel:</span>
                <select
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value as any)}
                  className="bg-transparent text-xs font-extrabold text-slate-900 outline-none"
                >
                  <option value="ALL">All Licensed Channels ({licensedCount})</option>
                  {allowGmail && <option value="GMAIL">Google Gmail OAuth2</option>}
                  {allowWhatsapp && <option value="WHATSAPP">Meta WhatsApp API</option>}
                  {allowTelegram && <option value="TELEGRAM">Telegram Bot API</option>}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={fetchConfigs}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5 text-emerald-400" />
              {saving ? 'Saving...' : 'Save Configurations'}
            </button>
          </div>
        </div>

        {/* Channel Status KPI Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setChannelFilter('ALL')}
            className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
              channelFilter === 'ALL'
                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div>
              <div className={`text-[11px] font-bold uppercase ${channelFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
                Active Gateways
              </div>
              <div className="mt-1 font-mono text-2xl font-extrabold">
                {activeCount} <span className="text-xs font-semibold opacity-60">/ {licensedCount}</span>
              </div>
            </div>
            <Radio className={`h-5 w-5 ${channelFilter === 'ALL' ? 'text-sky-400' : 'text-slate-400'}`} />
          </button>

          {allowGmail && (
            <button
              type="button"
              onClick={() => setChannelFilter('GMAIL')}
              className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
                channelFilter === 'GMAIL'
                  ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold uppercase text-blue-700">Gmail OAuth2</div>
                <div className="mt-1 text-base font-extrabold text-slate-900">
                  {isGmailEnabled ? 'Connected' : 'Paused'}
                </div>
              </div>
              <Mail className={`h-5 w-5 ${isGmailEnabled ? 'text-blue-600' : 'text-slate-400'}`} />
            </button>
          )}

          {allowWhatsapp && (
            <button
              type="button"
              onClick={() => setChannelFilter('WHATSAPP')}
              className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
                channelFilter === 'WHATSAPP'
                  ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold uppercase text-emerald-700">Meta WhatsApp</div>
                <div className="mt-1 text-base font-extrabold text-slate-900">
                  {isWhatsappEnabled ? 'Connected' : 'Paused'}
                </div>
              </div>
              <MessageSquare className={`h-5 w-5 ${isWhatsappEnabled ? 'text-emerald-600' : 'text-slate-400'}`} />
            </button>
          )}

          {allowTelegram && (
            <button
              type="button"
              onClick={() => setChannelFilter('TELEGRAM')}
              className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
                channelFilter === 'TELEGRAM'
                  ? 'border-sky-500 bg-sky-50/70 ring-2 ring-sky-500/20'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold uppercase text-sky-700">Telegram Bot</div>
                <div className="mt-1 text-base font-extrabold text-slate-900">
                  {isTelegramEnabled ? 'Connected' : 'Paused'}
                </div>
              </div>
              <Send className={`h-5 w-5 ${isTelegramEnabled ? 'text-sky-600' : 'text-slate-400'}`} />
            </button>
          )}
        </div>

        {message.text && (
          <div className={`flex items-center gap-2 rounded-2xl border p-4 text-xs font-bold ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Plant Names & Automated Email Alert Assignments */}
        <div className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <Building2 className="h-5 w-5 text-indigo-600" />
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">
                  Plant Names &amp; Incident Email Alert Assignments
                </h2>
                <p className="text-xs text-slate-500">
                  Add plants (e.g., Test - P1, Test2 - P2) and assign users below. When an incident is created for a plant, all assigned users receive an automatic email alert.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPlantInput}
                onChange={(e) => setNewPlantInput(e.target.value)}
                placeholder="e.g. Test3 - P3"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold outline-none focus:border-indigo-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleAddPlant}
                className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add Plant
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {plants.map((plant) => (
              <span
                key={plant}
                className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-800"
              >
                {plant}
                {plants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemovePlant(plant)}
                    className="text-indigo-400 hover:text-rose-600"
                    title="Remove plant"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>

          {guards.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                    <th className="px-3 py-2.5">User / Guard</th>
                    <th className="px-3 py-2.5">Email</th>
                    {plants.map((p) => (
                      <th key={p} className="px-3 py-2.5 text-center">
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {guards.map((g) => {
                    const assigned: string[] = Array.isArray(g.assigned_plants) ? g.assigned_plants : [];
                    return (
                      <tr key={g.guard_id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 font-bold text-slate-800">
                          {g.full_name}{' '}
                          <span className="font-mono text-[10px] text-slate-400">({g.employee_code})</span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{g.email || 'No email set'}</td>
                        {plants.map((p) => (
                          <td key={p} className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={assigned.includes(p)}
                              disabled={savingPlantUser === g.guard_id}
                              onChange={() => handleToggleGuardPlant(g, p)}
                              className="h-4 w-4 cursor-pointer accent-indigo-600"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* 1. Google Gmail OAuth2 Refresh Token Settings */}
          {allowGmail && (channelFilter === 'ALL' || channelFilter === 'GMAIL') && (
            <div className={`rounded-2xl border transition-all ${
              isGmailEnabled ? 'border-blue-200 bg-white shadow-xs' : 'border-slate-200 bg-white/80'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${isGmailEnabled ? 'bg-blue-600' : 'bg-slate-400'}`}></span>
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                      Google Gmail OAuth2 Auto-Dispatch
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                        isGmailEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {isGmailEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Uses OAuth2 Refresh Token to automatically mint fresh access tokens and email all users assigned to a Plant or Group.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleIntegration('ENABLE_GMAIL')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-xs ${
                    isGmailEnabled
                      ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                  {isGmailEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>

              {isGmailEnabled && (
                <div className="space-y-4 border-t border-slate-100 px-5 pb-5 pt-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                        Manager / Fallback Notification Email
                      </label>
                      <input
                        type="email"
                        value={configs['MANAGER_EMAIL'] || ''}
                        onChange={(e) => handleChange('MANAGER_EMAIL', e.target.value)}
                        placeholder="spandangrasim@gmail.com"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold outline-none focus:border-brand-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                        Sender Display Name
                      </label>
                      <input
                        type="text"
                        value={configs['GMAIL_SENDER_NAME'] || ''}
                        onChange={(e) => handleChange('GMAIL_SENDER_NAME', e.target.value)}
                        placeholder="e.g. Rakshak Alert"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold outline-none focus:border-brand-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                        Connected Gmail Address (For Custom Sender Name)
                      </label>
                      <input
                        type="email"
                        value={configs['GMAIL_SENDER_EMAIL'] || ''}
                        onChange={(e) => handleChange('GMAIL_SENDER_EMAIL', e.target.value)}
                        placeholder="spandangrasim@gmail.com"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>

                  {/* Email Provider Selector: SMTP (Office 365 / Gmail / Custom) vs Gmail OAuth2 */}
                  <div className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                          Email Delivery Provider (Office 365 / Gmail / Custom SMTP or Gmail OAuth2)
                        </span>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          SMTP supports Office 365, Gmail SMTP, and custom SMTP servers with exact Sender Display Name control.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          value={configs['EMAIL_PROVIDER'] || (configs['SMTP_HOST'] ? 'SMTP' : 'GMAIL_OAUTH')}
                          onChange={(e) => handleChange('EMAIL_PROVIDER', e.target.value)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-brand-500"
                        >
                          <option value="SMTP">SMTP (Office 365 / Gmail / Custom)</option>
                          <option value="GMAIL_OAUTH">Google Gmail OAuth2 API</option>
                        </select>
                        {(configs['EMAIL_PROVIDER'] || (configs['SMTP_HOST'] ? 'SMTP' : 'GMAIL_OAUTH')) === 'SMTP' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                handleChange('EMAIL_PROVIDER', 'SMTP');
                                handleChange('SMTP_HOST', 'smtp.office365.com');
                                handleChange('SMTP_PORT', '587');
                                handleChange('SMTP_SECURE', 'starttls');
                              }}
                              className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                            >
                              Office 365 Preset
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleChange('EMAIL_PROVIDER', 'SMTP');
                                handleChange('SMTP_HOST', 'smtp.gmail.com');
                                handleChange('SMTP_PORT', '465');
                                handleChange('SMTP_SECURE', 'ssl');
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                            >
                              Gmail SMTP Preset
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {(configs['EMAIL_PROVIDER'] || (configs['SMTP_HOST'] ? 'SMTP' : 'GMAIL_OAUTH')) === 'SMTP' && (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 pt-1">
                        <div>
                          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                            SMTP Host
                          </label>
                          <input
                            type="text"
                            value={configs['SMTP_HOST'] || ''}
                            onChange={(e) => handleChange('SMTP_HOST', e.target.value)}
                            placeholder="smtp.office365.com"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-brand-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                            SMTP Port &amp; Security
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={configs['SMTP_PORT'] || '587'}
                              onChange={(e) => handleChange('SMTP_PORT', e.target.value)}
                              placeholder="587"
                              className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-semibold outline-none focus:border-brand-500"
                            />
                            <select
                              value={configs['SMTP_SECURE'] || 'starttls'}
                              onChange={(e) => handleChange('SMTP_SECURE', e.target.value)}
                              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-brand-500"
                            >
                              <option value="starttls">STARTTLS (587)</option>
                              <option value="ssl">SSL/TLS (465)</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                            From / Sender Email
                          </label>
                          <input
                            type="email"
                            value={configs['SMTP_FROM_EMAIL'] || configs['SMTP_USER'] || ''}
                            onChange={(e) => handleChange('SMTP_FROM_EMAIL', e.target.value)}
                            placeholder="alerts@yourdomain.com"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-brand-500"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                            SMTP Username
                          </label>
                          <input
                            type="text"
                            value={configs['SMTP_USER'] || ''}
                            onChange={(e) => handleChange('SMTP_USER', e.target.value)}
                            placeholder="user@yourdomain.com"
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-brand-500"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                            SMTP Password / App Password
                          </label>
                          <div className="flex gap-2">
                            <input
                              type={showTokens['SMTP_PASS'] ? 'text' : 'password'}
                              value={configs['SMTP_PASS'] || ''}
                              onChange={(e) => handleChange('SMTP_PASS', e.target.value)}
                              placeholder="Enter SMTP password or app password"
                              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-semibold outline-none focus:border-brand-500"
                            />
                            <button
                              type="button"
                              onClick={() => toggleTokenVisibility('SMTP_PASS')}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                            >
                              {showTokens['SMTP_PASS'] ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Enterprise OAuth2 Refresh Token Block */}
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                        Permanent OAuth2 Refresh Token Credentials (Recommended)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowOAuthGuide(!showOAuthGuide)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        {showOAuthGuide ? 'Hide 4-Step Guide' : 'How to Generate Refresh Token'}
                      </button>
                    </div>

                    {showOAuthGuide && (
                      <div className="space-y-1.5 rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-200">
                        <p><strong>1. Google Cloud Console:</strong> Go to <em>APIs &amp; Services → OAuth consent screen</em> and set Publishing Status to <strong>&ldquo;In production&rdquo;</strong>.</p>
                        <p><strong>2. Create OAuth Client ID:</strong> Go to <em>Credentials → Create Credentials → OAuth client ID (Web application)</em>. Add <code className="text-emerald-300">https://developers.google.com/oauthplayground</code> to <strong>Authorized redirect URIs</strong>.</p>
                        <p><strong>3. OAuth2 Playground:</strong> Open <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="text-sky-400 underline">developers.google.com/oauthplayground</a> → Click the Gear icon → Check <strong>&ldquo;Use your own OAuth credentials&rdquo;</strong> and paste your Client ID &amp; Client Secret.</p>
                        <p><strong>4. Authorize &amp; Exchange:</strong> Enter scope <code className="text-emerald-300">https://www.googleapis.com/auth/gmail.send</code> → Click <strong>Authorize APIs</strong> → Exchange authorization code for tokens → Copy the <strong>Refresh token</strong> below.</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-bold uppercase text-slate-600">
                          Google OAuth Client ID
                        </label>
                        <input
                          type="text"
                          value={configs['GMAIL_CLIENT_ID'] || ''}
                          onChange={(e) => handleChange('GMAIL_CLIENT_ID', e.target.value)}
                          placeholder="123456789-abc.apps.googleusercontent.com"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-brand-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-bold uppercase text-slate-600">
                          Google OAuth Client Secret
                        </label>
                        <div className="relative">
                          <input
                            type={showTokens['GMAIL_CLIENT_SECRET'] ? 'text' : 'password'}
                            value={configs['GMAIL_CLIENT_SECRET'] || ''}
                            onChange={(e) => handleChange('GMAIL_CLIENT_SECRET', e.target.value)}
                            placeholder="GOCSPX-..."
                            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-9 font-mono text-xs outline-none focus:border-brand-500"
                          />
                          <button
                            type="button"
                            onClick={() => toggleTokenVisibility('GMAIL_CLIENT_SECRET')}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                          >
                            {showTokens['GMAIL_CLIENT_SECRET'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-bold uppercase text-slate-600">
                          Google OAuth2 Refresh Token (1//...)
                        </label>
                        <div className="relative">
                          <input
                            type={showTokens['GMAIL_REFRESH_TOKEN'] ? 'text' : 'password'}
                            value={configs['GMAIL_REFRESH_TOKEN'] || ''}
                            onChange={(e) => handleChange('GMAIL_REFRESH_TOKEN', e.target.value)}
                            placeholder="1//04..."
                            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-9 font-mono text-xs outline-none focus:border-brand-500"
                          />
                          <button
                            type="button"
                            onClick={() => toggleTokenVisibility('GMAIL_REFRESH_TOKEN')}
                            className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                          >
                            {showTokens['GMAIL_REFRESH_TOKEN'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Fallback Direct Access Token + Test Email Button */}
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-[280px] flex-1 max-w-xl">
                      <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">
                        Optional: Direct OAuth2 Access Token (ya29... — Valid for 60 mins)
                      </label>
                      <div className="relative">
                        <input
                          type={showTokens['GMAIL_ACCESS_TOKEN'] ? 'text' : 'password'}
                          value={configs['GMAIL_ACCESS_TOKEN'] || ''}
                          onChange={(e) => handleChange('GMAIL_ACCESS_TOKEN', e.target.value)}
                          placeholder="ya29.a0..."
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-9 font-mono text-xs outline-none focus:border-brand-500"
                        />
                        <button
                          type="button"
                          onClick={() => toggleTokenVisibility('GMAIL_ACCESS_TOKEN')}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                        >
                          {showTokens['GMAIL_ACCESS_TOKEN'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestGmail}
                      disabled={testingEmail || saving}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {testingEmail ? 'Saving & Sending Test Email...' : 'Save & Send Test Email'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. Meta WhatsApp API */}
          {allowWhatsapp && (channelFilter === 'ALL' || channelFilter === 'WHATSAPP') && (
            <div className={`rounded-2xl border transition-all ${
              isWhatsappEnabled ? 'border-emerald-200 bg-white shadow-xs' : 'border-slate-200 bg-white/80'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${isWhatsappEnabled ? 'bg-emerald-600' : 'bg-slate-400'}`}></span>
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                      Meta WhatsApp API Settings
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                        isWhatsappEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {isWhatsappEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Dispatch instant WhatsApp alerts to the security manager on critical incidents.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleIntegration('ENABLE_WHATSAPP')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-xs ${
                    isWhatsappEnabled
                      ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                  {isWhatsappEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>

              {isWhatsappEnabled && (
                <div className="grid grid-cols-1 gap-4 border-t border-slate-100 px-5 pb-5 pt-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                      Manager Phone (with country code)
                    </label>
                    <input
                      type="text"
                      value={configs['MANAGER_PHONE'] || ''}
                      onChange={(e) => handleChange('MANAGER_PHONE', e.target.value)}
                      placeholder="+919876543210"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                      WhatsApp Phone Number ID
                    </label>
                    <input
                      type="text"
                      value={configs['WHATSAPP_PHONE_ID'] || ''}
                      onChange={(e) => handleChange('WHATSAPP_PHONE_ID', e.target.value)}
                      placeholder="10692..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-mono text-xs outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                      WhatsApp Graph API Token
                    </label>
                    <div className="relative">
                      <input
                        type={showTokens['WHATSAPP_API_TOKEN'] ? 'text' : 'password'}
                        value={configs['WHATSAPP_API_TOKEN'] || ''}
                        onChange={(e) => handleChange('WHATSAPP_API_TOKEN', e.target.value)}
                        placeholder="EAAG..."
                        className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-3.5 pr-9 font-mono text-xs outline-none focus:border-brand-500"
                      />
                      <button
                        type="button"
                        onClick={() => toggleTokenVisibility('WHATSAPP_API_TOKEN')}
                        className="absolute right-3 top-2 text-slate-400 hover:text-slate-600"
                      >
                        {showTokens['WHATSAPP_API_TOKEN'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Telegram Bot API */}
          {allowTelegram && (channelFilter === 'ALL' || channelFilter === 'TELEGRAM') && (
            <div className={`rounded-2xl border transition-all ${
              isTelegramEnabled ? 'border-sky-200 bg-white shadow-xs' : 'border-slate-200 bg-white/80'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${isTelegramEnabled ? 'bg-sky-500' : 'bg-slate-400'}`}></span>
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                      Telegram Bot Settings
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                        isTelegramEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {isTelegramEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Broadcast automated security alerts to a Telegram bot channel.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleIntegration('ENABLE_TELEGRAM')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-xs ${
                    isTelegramEnabled
                      ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                  {isTelegramEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>

              {isTelegramEnabled && (
                <div className="border-t border-slate-100 px-5 pb-5 pt-4">
                  <div className="max-w-xl">
                    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                      Telegram Bot Token
                    </label>
                    <input
                      type={showTokens['TELEGRAM_BOT_TOKEN'] ? 'text' : 'password'}
                      value={configs['TELEGRAM_BOT_TOKEN'] || ''}
                      onChange={(e) => handleChange('TELEGRAM_BOT_TOKEN', e.target.value)}
                      placeholder="123456:ABC-DEF..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-mono text-xs outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}