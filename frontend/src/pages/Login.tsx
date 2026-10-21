import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Lock, User } from 'lucide-react';

export default function Login() {
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/admin`, {
        adminId,
        password
      });

      // Save the JWT token
      localStorage.setItem('admin_token', response.data.token);
      
      // Navigate to the secure dashboard
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid Admin ID or Password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' }}>
      <form onSubmit={handleLogin} style={{ padding: '2.5rem', background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#1f2937' }}>Rakshak Admin</h2>
        
        {error && <p style={{ color: '#ef4444', textAlign: 'center', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</p>}

        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '4px', padding: '0.5rem', marginBottom: '1rem' }}>
          <User size={20} color="#6b7280" />
          <input 
            type="text" 
            placeholder="Admin ID" 
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            required
            style={{ border: 'none', outline: 'none', marginLeft: '10px', width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d1d5db', borderRadius: '4px', padding: '0.5rem', marginBottom: '1.5rem' }}>
          <Lock size={20} color="#6b7280" />
          <input 
            type="password" 
            placeholder="Password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ border: 'none', outline: 'none', marginLeft: '10px', width: '100%' }}
          />
        </div>

        <button 
          type="submit" 
          disabled={isLoading}
          style={{ width: '100%', padding: '0.75rem', background: isLoading ? '#93c5fd' : '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: isLoading ? 'not-allowed' : 'pointer', fontSize: '1rem', fontWeight: 'bold' }}>
          {isLoading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}