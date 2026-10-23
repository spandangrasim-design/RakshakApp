import React, { useState, useEffect } from 'react';

interface Guard {
  guard_id: string;
  full_name: string;
  employee_code: string;
  is_active: boolean;
  created_at: string;
}

const API_BASE_URL = 'https://rakshak-api.spandangrasim.workers.dev/api/v1';

export const GuardsView: React.FC = () => {
  const [guards, setGuards] = useState<Guard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [resetModalGuard, setResetModalGuard] = useState<Guard | null>(null);

  // Form states
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchGuards = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/guards`);
      const data = await res.json();
      if (data.success) {
        setGuards(data.guards);
      }
    } catch (err) {
      console.error('Failed to load guards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuards();
  }, []);

  const handleCreateGuard = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/guards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newName,
          employee_code: newCode,
          password: newPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create guard');
      }

      setGuards((prev) => [data.guard, ...prev]);
      setIsAddModalOpen(false);
      setNewName('');
      setNewCode('');
      setNewPassword('');
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (guard: Guard) => {
    const updatedStatus = !guard.is_active;
    try {
      const res = await fetch(`${API_BASE_URL}/guards/${guard.guard_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: updatedStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setGuards((prev) =>
          prev.map((g) => (g.guard_id === guard.guard_id ? { ...g, is_active: updatedStatus } : g))
        );
      }
    } catch (err) {
      alert('Failed to update guard status.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalGuard) return;
    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/guards/${resetModalGuard.guard_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to reset password');
      }

      setResetModalGuard(null);
      setResetPassword('');
      alert(`Password updated for ${resetModalGuard.full_name}.`);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredGuards = guards.filter(
    (g) =>
      g.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.employee_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Guard Management</h1>
          <p className="text-sm text-slate-500">Register new patrol staff, manage credentials, and toggle account access.</p>
        </div>
        <button
          onClick={() => {
            setFormError(null);
            setIsAddModalOpen(true);
          }}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-medium text-sm rounded-lg shadow-sm transition"
        >
          + Add New Guard
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Guards</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{guards.length}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Active Staff</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{guards.filter((g) => g.is_active).length}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Deactivated</p>
          <p className="text-2xl font-bold text-rose-700 mt-1">{guards.filter((g) => !g.is_active).length}</p>
        </div>
      </div>

      {/* Filter and Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <input
            type="text"
            placeholder="Search by name or employee code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-80 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={fetchGuards}
            className="ml-3 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading security guards...</div>
        ) : filteredGuards.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">No security guards found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-100 text-xs font-semibold text-slate-600 uppercase border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Guard Name</th>
                  <th className="px-6 py-3">Employee Code</th>
                  <th className="px-6 py-3">Account Status</th>
                  <th className="px-6 py-3">Registered On</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredGuards.map((guard) => (
                  <tr key={guard.guard_id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
                        {guard.full_name.charAt(0).toUpperCase()}
                      </div>
                      {guard.full_name}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-600">
                      {guard.employee_code}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          guard.is_active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {guard.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(guard.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setFormError(null);
                          setResetPassword('');
                          setResetModalGuard(guard);
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-blue-700 border border-slate-300 rounded hover:border-blue-400 transition"
                      >
                        Reset Password
                      </button>
                      <button
                        onClick={() => handleToggleStatus(guard)}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition border ${
                          guard.is_active
                            ? 'text-rose-600 border-rose-200 hover:bg-rose-50'
                            : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                        }`}
                      >
                        {guard.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add New Guard */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Add New Security Guard</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateGuard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Employee Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. G-105"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Initial Password</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  placeholder="At least 4 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {isSubmitting ? 'Registering...' : 'Register Guard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {resetModalGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Reset Guard Password</h3>
              <button
                onClick={() => setResetModalGuard(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Set a new mobile login password for <strong>{resetModalGuard.full_name}</strong> (
              {resetModalGuard.employee_code}).
            </p>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {formError}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">New Password</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  placeholder="Enter new password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResetModalGuard(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {isSubmitting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};