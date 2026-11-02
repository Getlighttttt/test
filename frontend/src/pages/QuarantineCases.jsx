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

        onDone(
            repairable
                ? 'Pallet ' + item.palletCode + ' has been sent for repair'
                : 'Claim for pallet ' + item.palletCode + ' has been issued'
        );
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
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    async function loadCases() {
        const res = await api('/api/quarantine/open');
        if (res.ok) {
            setCases(res.data);
        }
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

            {cases.length === 0 ? (
                <section className="card">
                    <p>No open cases in quarantine.</p>
                </section>
            ) : (
                cases.map((c) => <CaseCard key={c.id} item={c} onDone={handleDone} />)
            )}
        </div>
    );
}

export default QuarantineCases;