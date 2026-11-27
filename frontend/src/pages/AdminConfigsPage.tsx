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
  Trash2,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Users,
  X,
  CheckSquare,
  Square
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
  const [plantSectionOpen, setPlantSectionOpen] = useState<boolean>(false);
  const [modalPlant, setModalPlant] = useState<string | null>(null);
  const [checkedUserIds, setCheckedUserIds] = useState<string[]>([]);
  const [bulkAddingUsers, setBulkAddingUsers] = useState<boolean>(false);
  const [selectedPlant, setSelectedPlant] = useState<string>(DEFAULT_PLANTS[0]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const visibleModules = React.useMemo(() => {
    try {
      const saved = localStorage.getItem('visible_modules');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }, []);

  const allowGmail = visibleModules.integration_gmail !== false;
  const allowSmtp = visibleModules.integration_smtp === true;
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
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPlants(parsed);
              setSelectedPlant((prev) => (parsed.includes(prev) ? prev : parsed[0]));
            }
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

  const persistPlants = async (next: string[]) => {
    setPlants(next);
    handleChange('CUSTOM_PLANTS', JSON.stringify(next));
    try {
      await fetch(`${API_BASE_URL}/api/v1/admin/configs`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ configs: { CUSTOM_PLANTS: JSON.stringify(next) } }),
      });
    } catch {}
  };


  const handleAddPlant = async () => {
    const trimmed = newPlantInput.trim();
    if (!trimmed) {
      setMessage({ text: 'Please enter a plant name first.', type: 'error' });
      return;
    }
    const existing = plants.find((p) => p.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setNewPlantInput('');
      setModalPlant(existing);
      setCheckedUserIds([]);
      setMessage({ text: `Plant "${existing}" already exists.`, type: 'error' });
      return;
    }
    const next = [...plants, trimmed];
    setNewPlantInput('');
    await persistPlants(next);
    setModalPlant(trimmed);
    setCheckedUserIds([]);
    setMessage({ text: `Added plant "${trimmed}".`, type: 'success' });
  };

  const handleRemovePlant = async (plant: string) => {
    const next = plants.filter((p) => p !== plant);
    if (modalPlant === plant) {
      setModalPlant(null);
      setCheckedUserIds([]);
    }
    await persistPlants(next);
    setMessage({ text: `Removed plant "${plant}".`, type: 'success' });
  };

  const getGuardId = (g: any): string => String(g?.guard_id ?? g?.id ?? '');

  const handleToggleGuardPlant = async (guard: any, plant: string) => {
    const gid = getGuardId(guard);
    if (!gid || !plant) return;
    setSavingPlantUser(gid);
    const current: string[] = Array.isArray(guard.assigned_plants) ? guard.assigned_plants : [];
    const adding = !current.includes(plant);
    const next = adding ? [...current, plant] : current.filter((p) => p !== plant);

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/guards/${gid}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ assigned_plants: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        setGuards((prev) =>
          prev.map((g) => (getGuardId(g) === gid ? { ...g, assigned_plants: next } : g))
        );
        setCheckedUserIds((prev) => prev.filter((id) => id !== gid));
        setMessage({
          text: adding
            ? `Added ${guard.full_name} to ${plant}.`
            : `Removed ${guard.full_name} from ${plant}.`,
          type: 'success',
        });
      } else {
        setMessage({
          text: data.message || `Could not update ${guard.full_name} for ${plant}.`,
          type: 'error',
        });
      }
    } catch {
      setMessage({ text: 'Network error while updating plant alert recipients.', type: 'error' });
    } finally {
      setSavingPlantUser(null);
    }
  };

  const handleAddCheckedUsersToPlant = async (plant: string, usersToAdd: any[]) => {
    if (!plant || usersToAdd.length === 0) return;
    setBulkAddingUsers(true);
    let addedCount = 0;
    let lastError = '';

    try {
      for (const user of usersToAdd) {
        const gid = getGuardId(user);
        if (!gid) continue;
        const current: string[] = Array.isArray(user.assigned_plants) ? user.assigned_plants : [];
        const next = current.includes(plant) ? current : [...current, plant];

        const res = await fetch(`${API_BASE_URL}/api/v1/guards/${gid}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ assigned_plants: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success !== false) {
          addedCount += 1;
          setGuards((prev) =>
            prev.map((g) => (getGuardId(g) === gid ? { ...g, assigned_plants: next } : g))
          );
        } else {
          lastError = data.message || `Failed to assign ${user.full_name}.`;
        }
      }

      setCheckedUserIds([]);
      if (addedCount > 0) {
        setMessage({
          text: `Added ${addedCount} ${addedCount === 1 ? 'user' : 'users'} to ${plant}.`,
          type: 'success',
        });
      } else if (lastError) {
        setMessage({ text: lastError, type: 'error' });
      }
    } catch {
      setMessage({ text: 'Network error while adding users to plant.', type: 'error' });
    } finally {
      setBulkAddingUsers(false);
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

  const [channelFilter, setChannelFilter] = useState<'ALL' | 'GMAIL' | 'SMTP' | 'WHATSAPP' | 'TELEGRAM' | 'PLANT_ALERTS'>('ALL');

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
  const isSmtpEnabled = configs['ENABLE_SMTP'] === 'true' || (!configs['ENABLE_SMTP'] && Boolean(configs['SMTP_HOST']));
  const isWhatsappEnabled = configs['ENABLE_WHATSAPP'] === 'true';
  const isTelegramEnabled = configs['ENABLE_TELEGRAM'] === 'true';

  const licensedCount = [allowGmail, allowSmtp, allowWhatsapp, allowTelegram].filter(Boolean).length;
  const activeCount = [
    allowGmail && isGmailEnabled,
    allowSmtp && isSmtpEnabled,
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
                  {allowSmtp && <option value="SMTP">Office 365 / SMTP</option>}
                  {allowWhatsapp && <option value="WHATSAPP">Meta WhatsApp API</option>}
                  {allowTelegram && <option value="TELEGRAM">Telegram Bot API</option>}
                  <option value="PLANT_ALERTS">Plant Names &amp; Incident Email Alerts</option>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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

          {allowSmtp && (
            <button
              type="button"
              onClick={() => setChannelFilter('SMTP')}
              className={`flex items-center justify-between rounded-2xl border p-4 text-left transition ${
                channelFilter === 'SMTP'
                  ? 'border-violet-500 bg-violet-50/70 ring-2 ring-violet-500/20'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold uppercase text-violet-700">Office 365 / SMTP</div>
                <div className="mt-1 text-base font-extrabold text-slate-900">
                  {isSmtpEnabled ? 'Connected' : 'Paused'}
                </div>
              </div>
              <Mail className={`h-5 w-5 ${isSmtpEnabled ? 'text-violet-600' : 'text-slate-400'}`} />
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

        {/* Plant Names & Incident Email Alert Assignments (Collapsible + Plant Click Modal) */}
        {(channelFilter === 'ALL' || channelFilter === 'PLANT_ALERTS') && (
          <div className={`rounded-2xl border transition-all ${
            plantSectionOpen ? 'border-indigo-200 bg-white shadow-xs' : 'border-slate-200 bg-white/80'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <button
                type="button"
                onClick={() => setPlantSectionOpen((prev) => !prev)}
                className="flex items-center gap-3 text-left"
              >
                <span className={`h-2.5 w-2.5 rounded-full ${plantSectionOpen ? 'bg-indigo-600' : 'bg-slate-400'}`}></span>
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-slate-900">
                    Plant Names &amp; Incident Email Alert Assignments
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                      {plants.length} {plants.length === 1 ? 'Plant' : 'Plants'}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Manage plant names and select users in a popup to receive automatic incident email alerts.
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPlantSectionOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                >
                  {plantSectionOpen ? (
                    <>
                      Close <ChevronUp className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Open <ChevronDown className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>

            {plantSectionOpen && (
              <div className="space-y-4 border-t border-slate-100 px-5 pb-5 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Plant Names (Click a plant to manage users)
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newPlantInput}
                      onChange={(e) => setNewPlantInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddPlant();
                        }
                      }}
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {plants.map((plant) => {
                    const assignedCount = guards.filter(
                      (g) => Array.isArray(g.assigned_plants) && g.assigned_plants.includes(plant)
                    ).length;

                    return (
                      <div
                        key={plant}
                        className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 transition hover:border-indigo-400 hover:bg-indigo-50"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setModalPlant(plant);
                            setCheckedUserIds([]);
                          }}
                          className="flex flex-1 items-center justify-between gap-2 text-left"
                        >
                          <div>
                            <div className="text-xs font-extrabold text-slate-900">{plant}</div>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-indigo-700">
                              <Users className="h-3.5 w-3.5" />
                              {assignedCount} {assignedCount === 1 ? 'user' : 'users'} assigned — Click to manage
                            </div>
                          </div>
                        </button>

                        {
                          <button
                            type="button"
                            onClick={() => handleRemovePlant(plant)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-100 hover:text-rose-600"
                            title="Delete plant"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        }
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Popup Modal for Selected Plant with Multi-User Checkboxes */}
            {modalPlant && (() => {
              const assignedUsers = guards.filter(
                (g) => Array.isArray(g.assigned_plants) && g.assigned_plants.includes(modalPlant)
              );
              const unassignedUsers = guards.filter(
                (g) => !(Array.isArray(g.assigned_plants) && g.assigned_plants.includes(modalPlant))
              );
              const selectedBatchUsers = unassignedUsers.filter((u) =>
                checkedUserIds.includes(getGuardId(u))
              );

              const toggleCheckbox = (gid: string) => {
                setCheckedUserIds((prev) =>
                  prev.includes(gid) ? prev.filter((id) => id !== gid) : [...prev, gid]
                );
              };

              const toggleAllUnassigned = () => {
                if (selectedBatchUsers.length === unassignedUsers.length) {
                  setCheckedUserIds([]);
                } else {
                  setCheckedUserIds(unassignedUsers.map((u) => getGuardId(u)).filter(Boolean));
                }
              };

              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
                  <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                          Plant Alert Recipients
                        </div>
                        <h3 className="text-base font-extrabold text-slate-900">{modalPlant}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setModalPlant(null);
                          setCheckedUserIds([]);
                        }}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Close popup"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Multi-User Checkbox Selection to Add to Plant */}
                    <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                          Select Users to Add ({selectedBatchUsers.length} selected)
                        </span>
                        <div className="flex items-center gap-2">
                          {unassignedUsers.length > 0 && (
                            <button
                              type="button"
                              onClick={toggleAllUnassigned}
                              className="text-[11px] font-bold text-indigo-600 hover:underline"
                            >
                              {selectedBatchUsers.length === unassignedUsers.length ? 'Clear All' : 'Select All'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={selectedBatchUsers.length === 0 || bulkAddingUsers}
                            onClick={() => handleAddCheckedUsersToPlant(modalPlant, selectedBatchUsers)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            {bulkAddingUsers
                              ? 'Adding...'
                              : `Add Selected (${selectedBatchUsers.length})`}
                          </button>
                        </div>
                      </div>

                      {unassignedUsers.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-200 bg-white py-3 text-center text-xs text-slate-400">
                          All users are already assigned to {modalPlant}.
                        </p>
                      ) : (
                        <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                          {unassignedUsers.map((g) => {
                            const gid = getGuardId(g);
                            const isChecked = checkedUserIds.includes(gid);
                            return (
                              <label
                                key={gid}
                                className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-xs transition hover:bg-indigo-50/50"
                              >
                                <div className="flex items-center gap-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    disabled={bulkAddingUsers}
                                    onChange={() => toggleCheckbox(gid)}
                                    className="h-4 w-4 cursor-pointer accent-indigo-600"
                                  />
                                  <div>
                                    <div className="font-bold text-slate-900">
                                      {g.full_name}{' '}
                                      <span className="font-mono text-[10px] text-slate-400">
                                        ({g.employee_code})
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {g.email || 'No email set'}
                                    </div>
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Users Already Part of This Plant */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Users in {modalPlant} ({assignedUsers.length})
                      </div>
                      {assignedUsers.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-200 py-3 text-center text-xs text-slate-400">
                          No users are part of {modalPlant} yet.
                        </p>
                      ) : (
                        <div className="max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                          {assignedUsers.map((g) => {
                            const gid = getGuardId(g);
                            return (
                              <div
                                key={gid}
                                className="flex items-center justify-between gap-2 px-3.5 py-2 text-xs"
                              >
                                <div>
                                  <div className="font-bold text-slate-900">{g.full_name}</div>
                                  <div className="text-[11px] text-slate-500">
                                    {g.employee_code} • {g.email || 'No email set'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={savingPlantUser === gid}
                                  onClick={() => handleToggleGuardPlant(g, modalPlant)}
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                                >
                                  Remove
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

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

          {/* Office 365 / Custom SMTP Settings */}
          {allowSmtp && (channelFilter === 'ALL' || channelFilter === 'SMTP') && (
            <div className={`rounded-2xl border transition-all ${
              isSmtpEnabled ? 'border-violet-200 bg-white shadow-xs' : 'border-slate-200 bg-white/80'
            }`}>
              <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${isSmtpEnabled ? 'bg-violet-600' : 'bg-slate-400'}`}></span>
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                      Office 365 / SMTP Settings
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                        isSmtpEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {isSmtpEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Send incident email alerts via Microsoft Office 365 or a custom SMTP relay with explicit sender display name control.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isSmtpEnabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          handleChange('EMAIL_PROVIDER', 'SMTP');
                          handleChange('SMTP_HOST', 'smtp.office365.com');
                          handleChange('SMTP_PORT', '587');
                          handleChange('SMTP_SECURE', 'starttls');
                        }}
                        className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 hover:bg-violet-100"
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
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        Gmail SMTP Preset
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const nextEnabled = !isSmtpEnabled;
                      handleChange('ENABLE_SMTP', nextEnabled ? 'true' : 'false');
                      if (nextEnabled) handleChange('EMAIL_PROVIDER', 'SMTP');
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-xs ${
                      isSmtpEnabled
                        ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    <Power className="h-3.5 w-3.5" />
                    {isSmtpEnabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>

              {isSmtpEnabled && (
                <div className="space-y-4 border-t border-slate-100 px-5 pb-5 pt-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                        SMTP Host
                      </label>
                      <input
                        type="text"
                        value={configs['SMTP_HOST'] || ''}
                        onChange={(e) => handleChange('SMTP_HOST', e.target.value)}
                        placeholder="smtp.office365.com"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold outline-none focus:border-brand-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                        SMTP Port &amp; Security
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={configs['SMTP_PORT'] || '587'}
                          onChange={(e) => handleChange('SMTP_PORT', e.target.value)}
                          placeholder="587"
                          className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-semibold outline-none focus:border-brand-500"
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
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                        From / Sender Email
                      </label>
                      <input
                        type="email"
                        value={configs['SMTP_FROM_EMAIL'] || configs['SMTP_USER'] || ''}
                        onChange={(e) => handleChange('SMTP_FROM_EMAIL', e.target.value)}
                        placeholder="alerts@yourdomain.com"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold outline-none focus:border-brand-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-600">
                        SMTP Username
                      </label>
                      <input
                        type="text"
                        value={configs['SMTP_USER'] || ''}
                        onChange={(e) => handleChange('SMTP_USER', e.target.value)}
                        placeholder="user@yourdomain.com"
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
                        SMTP Password / App Password
                      </label>
                      <div className="relative">
                        <input
                          type={showTokens['SMTP_PASS'] ? 'text' : 'password'}
                          value={configs['SMTP_PASS'] || ''}
                          onChange={(e) => handleChange('SMTP_PASS', e.target.value)}
                          placeholder="Enter SMTP password or app password"
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-3.5 pr-9 font-mono text-xs outline-none focus:border-brand-500"
                        />
                        <button
                          type="button"
                          onClick={() => toggleTokenVisibility('SMTP_PASS')}
                          className="absolute right-3 top-2 text-slate-400 hover:text-slate-600"
                        >
                          {showTokens['SMTP_PASS'] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
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