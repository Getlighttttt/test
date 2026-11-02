import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api';
import './Layout.css';

function Layout({ children }) {
    const [user, setUser] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        async function load() {
            const result = await api('/api/auth/me');
            if (result.ok) {
                setUser(result.data);
            }
        }
        load();
    }, []);

    async function handleLogout() {
        await api('/api/auth/logout', 'POST');
        navigate('/');
    }

    const skladnikMenu = [
        { to: '/tsd', label: 'Income / Transfer' },
        { to: '/tsd/receiving', label: 'Receiving Area' },
        { to: '/tsd/line', label: 'Send to Line' },
        { to: '/tsd/quarantine', label: 'Quarantine / Reject' },
    ];

    const dispecerMenu = [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/dashboard/deviations', label: 'Deviations' },
        { to: '/dashboard/quarantine', label: 'Quarantine' },
        { to: '/dashboard/requests', label: 'Requests' },
    ];

    let menu = [];
    if (user?.role === 'Skladnik') menu = skladnikMenu;
    if (user?.role === 'Dispecer') menu = dispecerMenu;

    return (
        <div className="layout">
            <aside className="sidebar">
                <div className="brand">
                    <h2>In-Plant WMS</h2>
                    <small>Logistics &amp; Material Flow</small>
                </div>
                <nav>
                    {menu.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end
                            className={({ isActive }) => (isActive ? 'active' : '')}
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            <div className="main">
                <header className="topbar">
                    <div className="user-chip">
                        <div className="avatar">
                            {user?.username?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <b>{user?.username}</b>
                            <small>{user?.role === 'Skladnik' ? 'Skladník' : 'Dispečer'}</small>
                        </div>
                    </div>
                    <button onClick={handleLogout}>Log out</button>
                </header>
                <main className="content">{children}</main>
            </div>
        </div>
    );
}

export default Layout;
