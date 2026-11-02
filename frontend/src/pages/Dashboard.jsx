import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import './Tsd.css';
import './Dashboard.css';

function Dashboard() {
    const [stock, setStock] = useState([]);
    const [deviationCount, setDeviationCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        async function load() {
            // два запити одночасно
            const [stockRes, devRes] = await Promise.all([
                api('/api/dispecer/stock'),
                api('/api/dispecer/deviations'),
            ]);

            if (stockRes.ok) {
                setStock(stockRes.data);
            } else {
                setError('Unable to load stock levels');
            }
            if (devRes.ok) {
                setDeviationCount(devRes.data.length);
            }
            setLoading(false);
        }
        load();
    }, []);

    if (loading) {
        return <p>Loading...</p>;
    }

    // суми по всіх товарах
    const totalStorage = stock.reduce((sum, s) => sum + s.inStorage, 0);
    const totalOnLine = stock.reduce((sum, s) => sum + s.onLine, 0);
    const totalReceiving = stock.reduce((sum, s) => sum + s.receiving, 0);
    const totalQuarantine = stock.reduce((sum, s) => sum + s.quarantine, 0);

    return (
        <div className="tsd dash">
            <h1>Dispetcher Dashboard</h1>
            {error && <p className="error">{error}</p>}

            <div className="tiles">
                <div className="tile">
                    <span>At Storage</span>
                    <strong>{totalStorage.toLocaleString('sk-SK')}</strong>
                </div>
                <div className="tile">
                    <span>On Lines</span>
                    <strong>{totalOnLine.toLocaleString('sk-SK')}</strong>
                </div>
                <div className="tile">
                    <span>Receiving</span>
                    <strong>{totalReceiving.toLocaleString('sk-SK')}</strong>
                </div>
                <div className="tile tile-danger">
                    <span>Quarantine</span>
                    <strong>{totalQuarantine.toLocaleString('sk-SK')}</strong>
                </div>
                <div className={deviationCount > 0 ? 'tile tile-warn' : 'tile'}>
                    <span>Deviations</span>
                    <strong>{deviationCount}</strong>
                </div>
            </div>

            <section className="card">
                <h3>Stock Levels by Material</h3>
                {stock.length === 0 ? (
                    <p>No stock available.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Name</th>
                                <th>Storage</th>
                                <th>Lines</th>
                                <th>Receiving</th>
                                <th>Quarantine</th>
                                <th>Unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stock.map((s) => (
                                <tr key={s.code}>
                                    <td>{s.code}</td>
                                    <td>{s.name}</td>
                                    <td>{s.inStorage}</td>
                                    <td>{s.onLine}</td>
                                    <td>{s.receiving}</td>
                                    <td className={s.quarantine > 0 ? 'error' : ''}>
                                        {s.quarantine}
                                    </td>
                                    <td>{s.unit}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            <section className="card">
                <h3>Quick Actions</h3>
                <div className="row">
                    <Link className="btn-link" to="/dashboard/deviations">
                        Approve Deviations
                    </Link>
                    <Link className="btn-link" to="/dashboard/quarantine">
                        Resolve Quarantine
                    </Link>
                    <Link className="btn-link" to="/dashboard/requests">
                        Requests and Priorities
                    </Link>
                </div>
            </section>
        </div>
    );
}

export default Dashboard;