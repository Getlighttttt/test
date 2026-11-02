import { useState, useEffect } from 'react';
import { api } from '../api';
import './Tsd.css';
import './Dashboard.css';

function CaseCard({ item, onDone }) {
    const [repairable, setRepairable] = useState(true);
    const [protocol, setProtocol] = useState('');
    const [error, setError] = useState('');

    async function handleSave() {
        setError('');

        if (!repairable && !protocol.trim()) {
            setError('The report is essential for making a claim');
            return;
        }

        const res = await api('/api/quarantine/' + item.id + '/decision', 'POST', {
            repairable: repairable,
            protocolText: repairable ? null : protocol.trim(),
        });

        if (!res.ok) {
            setError(res.data?.message ?? 'Error');
            return;
        }

        onDone('Pallet ' + item.palletCode + ' moved to ' + res.data.locationCode);
    }

    return (
        <section className="card">
            <div className="row-between">
                <h3>
                    {item.palletCode} <small>({item.productCode})</small>
                </h3>
                <span>{new Date(item.createdAt).toLocaleString('sk-SK')}</span>
            </div>

            <p>
                Množstvo: <b>{item.quantity}</b>
                <br />
                Dôvod: <b>{item.reason}</b>
            </p>

            <p>
                <b>Can the material be repaired?</b>
            </p>
            <label>
                <input
                    type="radio"
                    checked={repairable}
                    onChange={() => setRepairable(true)}
                />{' '}
                Yes, for repair
            </label>
            <br />
            <label>
                <input
                    type="radio"
                    checked={!repairable}
                    onChange={() => setRepairable(false)}
                />{' '}
                No, claim
            </label>

            {!repairable && (
                <div className="field" style={{ marginTop: 12 }}>
                    <label>Report of Damage</label>
                    <textarea
                        rows="3"
                        placeholder="Describe the damage for the supplier..."
                        value={protocol}
                        onChange={(e) => setProtocol(e.target.value)}
                    />
                </div>
            )}

            <div style={{ marginTop: 12 }}>
                <button className="primary" onClick={handleSave}>
                    Uložiť rozhodnutie
                </button>
            </div>
            {error && <p className="error">{error}</p>}
        </section>
    );
}

function QuarantineCases() {
    const [cases, setCases] = useState([]);
    const [holdingPallets, setHoldingPallets] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    async function loadCases() {
        const [openRes, areasRes] = await Promise.all([
            api('/api/quarantine/open'),
            api('/api/quarantine/areas'),
        ]);
        if (openRes.ok) setCases(openRes.data);
        if (areasRes.ok) setHoldingPallets(areasRes.data);
        setError(openRes.ok && areasRes.ok ? '' : 'Could not load quarantine information');
        setLoading(false);
    }

    useEffect(() => {
        loadCases();
    }, []);

    async function handleDone(text) {
        setMessage(text);
        await loadCases();
    }

    if (loading) {
        return <p>Loading...</p>;
    }

    return (
        <div className="tsd dash">
            <h1>Quarantine</h1>

            {message && <p className="ok">{message}</p>}
            {error && <p className="error">{error}</p>}

            {cases.length === 0 ? (
                <section className="card">
                    <p>No open cases in quarantine.</p>
                </section>
            ) : (
                cases.map((c) => <CaseCard key={c.id} item={c} onDone={handleDone} />)
            )}

            <section className="card">
                <h3>Rework and Claim Holding Areas</h3>
                {holdingPallets.length === 0 ? (
                    <p>No pallets currently held in rework or claim areas.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Pallet</th>
                                <th>Material</th>
                                <th>Quantity</th>
                                <th>Status</th>
                                <th>Location</th>
                            </tr>
                        </thead>
                        <tbody>
                            {holdingPallets.map((p) => (
                                <tr key={p.palletCode}>
                                    <td>{p.palletCode}</td>
                                    <td>{p.productCode}</td>
                                    <td>{p.quantity}</td>
                                    <td>{p.status}</td>
                                    <td>{p.locationCode}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}

export default QuarantineCases;
