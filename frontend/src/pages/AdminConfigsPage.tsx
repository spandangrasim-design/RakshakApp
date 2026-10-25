import React, { useState, useEffect, FormEvent } from 'react';
import { Eye, EyeOff, CheckCircle2, Power } from 'lucide-react';

const API_BASE_URL = "https://rakshak-api.spandangrasim.workers.dev";

export default function AdminConfigsPage() {
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: string }>({ text: '', type: '' });

  // Toggle visibility for secret token fields
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/configs`);
      const data = await response.json();
      
      if (data.success) {
        const configMap: Record<string, string> = {};
        data.configs.forEach((item: { key_name: string; key_value: string }) => {
          configMap[item.key_name] = item.key_value;
        });

        // Default toggle states if not yet saved in Supabase:
        // Auto-enable if credentials already exist, otherwise default to 'false'
        if (configMap['ENABLE_GMAIL'] === undefined) {
          configMap['ENABLE_GMAIL'] =
            configMap['MANAGER_EMAIL'] || configMap['GMAIL_ACCESS_TOKEN'] ? 'true' : 'false';
        }
        if (configMap['ENABLE_WHATSAPP'] === undefined) {
          configMap['ENABLE_WHATSAPP'] =
            configMap['MANAGER_PHONE'] || configMap['WHATSAPP_PHONE_ID'] || configMap['WHATSAPP_API_TOKEN']
              ? 'true'
              : 'false';
        }
        if (configMap['ENABLE_TELEGRAM'] === undefined) {
          configMap['ENABLE_TELEGRAM'] = configMap['TELEGRAM_BOT_TOKEN'] ? 'true' : 'false';
        }

        setConfigs(configMap);
      } else {
        setMessage({ text: 'Failed to load configurations', type: 'error' });
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

  const handleToggleIntegration = (enableKey: string) => {
    setConfigs(prev => ({
      ...prev,
      [enableKey]: prev[enableKey] === 'true' ? 'false' : 'true',
    }));
  };

  const toggleTokenVisibility = (key: string) => {
    setShowTokens(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    const payload = Object.keys(configs).map(key => ({
      key_name: key,
      key_value: configs[key] || ''
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.success) {
        setMessage({ text: 'Configurations updated successfully!', type: 'success' });
      } else {
        setMessage({ text: data.message || 'Failed to save configurations', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Network error while saving', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
      </div>
    );
  }

  const isGmailEnabled = configs['ENABLE_GMAIL'] === 'true';
  const isWhatsappEnabled = configs['ENABLE_WHATSAPP'] === 'true';
  const isTelegramEnabled = configs['ENABLE_TELEGRAM'] === 'true';

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-blue-900 px-6 py-5 text-white">
          <h1 className="text-xl font-bold">Rakshak Patrol - Admin Integrations</h1>
          <p className="text-blue-200 text-sm mt-1">
            Enable or disable emergency SLA notification channels and configure API credentials dynamically.
          </p>
        </div>

        {/* Feedback Banner */}
        {message.text && (
          <div className={`mx-6 mt-6 p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {message.text}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          
          {/* ================================================= */}
          {/* 1. Section: Email & Google Gmail API              */}
          {/* ================================================= */}
          <div className={`rounded-2xl border transition-all ${
            isGmailEnabled ? 'border-blue-200 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/70'
          }`}>
            <div className="p-4 sm:px-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${isGmailEnabled ? 'bg-blue-600' : 'bg-slate-400'}`}></span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
                    Google Gmail API & Email Settings
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      isGmailEnabled
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {isGmailEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Send automated HTML incident escalation emails when P1/P2 SLAs breach.
                  </p>
                </div>
              </div>

              {/* Enable / Disable Toggle Button */}
              <button
                type="button"
                onClick={() => handleToggleIntegration('ENABLE_GMAIL')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
                  isGmailEnabled
                    ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                {isGmailEnabled ? 'Disable' : 'Enable'}
              </button>
            </div>

            {isGmailEnabled && (
              <div className="px-5 pb-5 pt-3 border-t border-slate-100 grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Manager Email Address
                  </label>
                  <input
                    type="email"
                    value={configs['MANAGER_EMAIL'] || ''}
                    onChange={(e) => handleChange('MANAGER_EMAIL', e.target.value)}
                    placeholder="manager@company.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Gmail OAuth2 Access Token
                  </label>
                  <div className="relative">
                    <input
                      type={showTokens['GMAIL_ACCESS_TOKEN'] ? 'text' : 'password'}
                      value={configs['GMAIL_ACCESS_TOKEN'] || ''}
                      onChange={(e) => handleChange('GMAIL_ACCESS_TOKEN', e.target.value)}
                      placeholder="ya29.a0..."
                      className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-mono bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => toggleTokenVisibility('GMAIL_ACCESS_TOKEN')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showTokens['GMAIL_ACCESS_TOKEN'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================================================= */}
          {/* 2. Section: Meta WhatsApp API                     */}
          {/* ================================================= */}
          <div className={`rounded-2xl border transition-all ${
            isWhatsappEnabled ? 'border-emerald-200 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/70'
          }`}>
            <div className="p-4 sm:px-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${isWhatsappEnabled ? 'bg-emerald-600' : 'bg-slate-400'}`}></span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
                    Meta WhatsApp API Settings
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      isWhatsappEnabled
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {isWhatsappEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Dispatch instant WhatsApp alerts to the security manager on critical incidents.
                  </p>
                </div>
              </div>

              {/* Enable / Disable Toggle Button */}
              <button
                type="button"
                onClick={() => handleToggleIntegration('ENABLE_WHATSAPP')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
                  isWhatsappEnabled
                    ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                {isWhatsappEnabled ? 'Disable' : 'Enable'}
              </button>
            </div>

            {isWhatsappEnabled && (
              <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      Manager Phone (with country code)
                    </label>
                    <input
                      type="text"
                      value={configs['MANAGER_PHONE'] || ''}
                      onChange={(e) => handleChange('MANAGER_PHONE', e.target.value)}
                      placeholder="+919876543210"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                      WhatsApp Phone Number ID
                    </label>
                    <input
                      type="text"
                      value={configs['WHATSAPP_PHONE_ID'] || ''}
                      onChange={(e) => handleChange('WHATSAPP_PHONE_ID', e.target.value)}
                      placeholder="10692..."
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-mono bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    WhatsApp Graph API Token
                  </label>
                  <div className="relative">
                    <input
                      type={showTokens['WHATSAPP_API_TOKEN'] ? 'text' : 'password'}
                      value={configs['WHATSAPP_API_TOKEN'] || ''}
                      onChange={(e) => handleChange('WHATSAPP_API_TOKEN', e.target.value)}
                      placeholder="EAAG..."
                      className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-mono bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => toggleTokenVisibility('WHATSAPP_API_TOKEN')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showTokens['WHATSAPP_API_TOKEN'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================================================= */}
          {/* 3. Section: Telegram Bot API                      */}
          {/* ================================================= */}
          <div className={`rounded-2xl border transition-all ${
            isTelegramEnabled ? 'border-sky-200 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/70'
          }`}>
            <div className="p-4 sm:px-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${isTelegramEnabled ? 'bg-sky-500' : 'bg-slate-400'}`}></span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
                    Telegram Bot Settings
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      isTelegramEnabled
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {isTelegramEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Broadcast automated security alerts to a Telegram bot channel.
                  </p>
                </div>
              </div>

              {/* Enable / Disable Toggle Button */}
              <button
                type="button"
                onClick={() => handleToggleIntegration('ENABLE_TELEGRAM')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
                  isTelegramEnabled
                    ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                {isTelegramEnabled ? 'Disable' : 'Enable'}
              </button>
            </div>

            {isTelegramEnabled && (
              <div className="px-5 pb-5 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Telegram Bot Token
                  </label>
                  <div className="relative">
                    <input
                      type={showTokens['TELEGRAM_BOT_TOKEN'] ? 'text' : 'password'}
                      value={configs['TELEGRAM_BOT_TOKEN'] || ''}
                      onChange={(e) => handleChange('TELEGRAM_BOT_TOKEN', e.target.value)}
                      placeholder="123456:ABC-DEF..."
                      className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-mono bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => toggleTokenVisibility('TELEGRAM_BOT_TOKEN')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showTokens['TELEGRAM_BOT_TOKEN'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-blue-900 hover:bg-blue-800 text-white font-semibold rounded-xl text-sm transition-all shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving Changes...
                </>
              ) : (
                'Save All Configurations'
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}