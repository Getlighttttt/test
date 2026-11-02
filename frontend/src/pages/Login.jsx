import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import './Login.css';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        const result = await api('/api/auth/login', 'POST', { username, password });
        if (!result.ok) {
            setError(result.data?.message ?? 'Chyba prihlásenia');
            return;
        }
        if (result.data?.role === 'Skladnik') {
            navigate('/tsd');
        } else if (result.data?.role === 'Dispecer') {
            navigate('/dashboard');
        }
    }

    return (
        <div className="login-page">
            <div className="login-brand">
                <h1>In-Plant WMS</h1>
                <p>Logistics &amp; Material Flow</p>
            </div>

            <form className="login-card" onSubmit={handleSubmit}>
                <h2>Log in to the system</h2>

                <div className="field">
                    <label>Username</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                </div>

                <div className="field">
                    <label>Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>

                <button type="submit" className="primary">
                    Log in
                </button>
                {error && <p className="error">{error}</p>}
            </form>

            <small className="login-footer">In-Plant WMS © 2026</small>
        </div>
    );
}

export default Login;