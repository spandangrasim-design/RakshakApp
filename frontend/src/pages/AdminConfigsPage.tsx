import React, { useState, useEffect } from 'react';

const API_BASE_URL = "https://your-cloudflare-worker-url.workers.dev"; // Replace with your worker URL

export default function AdminConfigsPage() {
  const [configs, setConfigs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // Fetch current configs on load
  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/configs`);
      const data = await response.json();
      
      if (data.success) {
        // Convert array from Supabase into a key-value object for easy form binding
        const configMap = {};
        data.configs.forEach(item => {
          configMap[item.key_name] = item.key_value;
        });
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

  const handleChange = (key, value) => {
    setConfigs(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    // Transform back into the array format expected by your Cloudflare Worker upsert route
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

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-blue-900 px-6 py-5 text-white">
          <h1 className="text-xl font-bold">Rakshak Patrol - Admin Integrations</h1>
          <p className="text-blue-200 text-sm mt-1">Configure emergency SLA notification APIs and credentials dynamically.</p>
        </div>

        {/* Feedback Banner */}
        {message.text && (
          <div className={`mx-6 mt-6 p-4 rounded-xl text-sm font-medium ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-6">
          
          {/* Section: Email & Google API */}
          <div>
            <h2 className="text-md font-semibold text-slate-800 border-b border-slate-100 pb-2 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span> Google Gmail API & Email Settings
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Manager Email Address</label>
                <input
                  type="email"
                  value={configs['MANAGER_EMAIL'] || ''}
                  onChange={(e) => handleChange('MANAGER_EMAIL', e.target.value)}
                  placeholder="manager@company.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Gmail OAuth2 Access Token</label>
                <input
                  type="password"
                  value={configs['GMAIL_ACCESS_TOKEN'] || ''}
                  onChange={(e) => handleChange('GMAIL_ACCESS_TOKEN', e.target.value)}
                  placeholder="ya29.a0..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section: Meta WhatsApp API */}
          <div>
            <h2 className="text-md font-semibold text-slate-800 border-b border-slate-100 pb-2 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span> Meta WhatsApp API Settings
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Manager Phone (with country code)</label>
                <input
                  type="text"
                  value={configs['MANAGER_PHONE'] || ''}
                  onChange={(e) => handleChange('MANAGER_PHONE', e.target.value)}
                  placeholder="1234567890"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">WhatsApp Phone Number ID</label>
                <input
                  type="text"
                  value={configs['WHATSAPP_PHONE_ID'] || ''}
                  onChange={(e) => handleChange('WHATSAPP_PHONE_ID', e.target.value)}
                  placeholder="10692..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-mono"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">WhatsApp Graph API Token</label>
              <input
                type="password"
                value={configs['WHATSAPP_API_TOKEN'] || ''}
                onChange={(e) => handleChange('WHATSAPP_API_TOKEN', e.target.value)}
                placeholder="EAAG..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-mono"
              />
            </div>
          </div>

          {/* Section: Telegram API */}
          <div>
            <h2 className="text-md font-semibold text-slate-800 border-b border-slate-100 pb-2 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-500"></span> Telegram Bot Settings
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Telegram Bot Token</label>
              <input
                type="password"
                value={configs['TELEGRAM_BOT_TOKEN'] || ''}
                onChange={(e) => handleChange('TELEGRAM_BOT_TOKEN', e.target.value)}
                placeholder="123456:ABC-DEF..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm font-mono"
              />
            </div>
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