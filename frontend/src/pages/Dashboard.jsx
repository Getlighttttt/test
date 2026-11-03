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

    const [risks, setRisks] = useState([]);
    const [mlAlerts, setMlAlerts] = useState([]);
    const [mlError, setMlError] = useState('');
    const [acknowledging, setAcknowledging] = useState(null);

    useEffect(() => {
        async function load() {
            // Keep existing warehouse dashboard behavior unchanged.
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

    useEffect(() => {
        let active = true;

        async function loadMlData() {
            try {
                const [riskRes, alertsRes] = await Promise.all([
                    api('/api/ml/risk'),
                    api('/api/ml/alerts'),
                ]);
                if (!active) return;
                if (riskRes.ok && alertsRes.ok &&
                    Array.isArray(riskRes.data) && Array.isArray(alertsRes.data)) {
                    setRisks(riskRes.data);
                    setMlAlerts(alertsRes.data);
                    setMlError('');
                } else {
                    setMlError('Unable to load ML predictions or alerts.');
                }
            } catch {
                if (active) setMlError('ML service is unavailable.');
            }
        }

        loadMlData();
        const timer = setInterval(loadMlData, 15000);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, []);

    async function acknowledgeAlert(id) {
        setAcknowledging(id);
        try {
            const result = await api(`/api/ml/alerts/${id}/ack`, 'POST');
            if (!result.ok) {
                setMlError(result.data?.message ?? 'Failed to acknowledge the alert.');
                return;
            }
            setMlAlerts(current => current.filter(a => a.id !== id));
            setMlError('');
        } catch {
            setMlError('Unable to acknowledge the alert.');
        } finally {
            setAcknowledging(null);
        }
    }

    if (loading) {
        return <p>Loading...</p>;
    }

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
                                <th>Rework</th>
                                <th>Claim</th>
                                <th>Total</th>
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
                                    <td className={s.quarantine > 0 ? 'error' : ''}>{s.quarantine}</td>
                                    <td>{s.rework}</td>
                                    <td>{s.claim}</td>
                                    <td><strong>{s.total}</strong></td>
                                    <td>{s.unit}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            <section className="card">
                <h3>ML Shortage Predictions</h3>
                {mlError && <p className="error" role="alert">{mlError}</p>}
                {risks.length === 0 ? (
                    <p>No predictions available yet.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Line</th>
                                <th>Material</th>
                                <th>Risk</th>
                                <th>Risk Level</th>
                                <th>Time to Stockout</th>
                                <th>Recommended Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                            {risks.map(r => (
                                <tr key={`${r.lineName}-${r.productCode}`}
                                    className={`ml-risk-${['HIGH', 'MEDIUM', 'LOW'].includes(r.riskLevel) ? r.riskLevel.toLowerCase() : 'unknown'}`}>
                                    <td>{r.lineName}</td>
                                    <td>{r.productCode}</td>
                                    <td>{r.riskPercent}%</td>
                                    <td>{r.riskLevel}</td>
                                    <td>{r.minutesToStockout == null ? '—' : `${Math.round(r.minutesToStockout)} min`}</td>
                                    <td>{r.recommendedQty}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <small>Predictions refresh every 15 seconds (simulated line stock).</small>
            </section>

            <section className="card">
                <h3>ML Alerts</h3>
                {mlAlerts.length === 0 ? (
                    <p>No active ML alerts.</p>
                ) : (
                    <table>
                        <thead>
                            <tr><th>Line</th><th>Material</th><th>Risk</th><th>Message</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                            {mlAlerts.map(alert => (
                                <tr key={alert.id}>
                                    <td>{alert.lineName}</td>
                                    <td>{alert.productCode}</td>
                                    <td>{alert.riskPercent}%</td>
                                    <td>{alert.message}</td>
                                    <td>
                                        <button type="button" onClick={() => acknowledgeAlert(alert.id)}
                                            disabled={acknowledging === alert.id}>
                                            {acknowledging === alert.id ? 'Saving…' : 'Acknowledge'}
                                        </button>
                                    </td>
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
