import { useState } from 'react';
import { api } from '../api';
import './Tsd.css';

const REASONS = [
    'Damaged packaging',
    'Incorrect material',
    'Incorrect dimensions',
    'Contaminated material',
    'Other reason',
];

function Quarantine() {
    const [palletCode, setPalletCode] = useState('');
    const [reason, setReason] = useState(REASONS[0]);
    const [note, setNote] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    async function handleSubmit() {
        setError('');
        setSuccess('');

        const code = palletCode.trim();
        if (!code) {
            setError('Please enter the pallet code');
            return;
        }

        // бекенд приймає один текст причини, тому склеюємо тип дефекту й опис
        const fullReason = note.trim() ? reason + ': ' + note.trim() : reason;

        const res = await api('/api/quarantine', 'POST', {
            palletCode: code,
            reason: fullReason,
        });

        if (!res.ok) {
            setError(res.data?.message ?? 'Error');
            return;
        }

        setSuccess(res.data?.message ?? 'Pallet has been moved to quarantine');
        setPalletCode('');
        setNote('');
        setReason(REASONS[0]);
    }

    return (
        <div className="tsd">
            <h1>Quarantine / Defect</h1>

            <section className="card">
                <h3>New Record</h3>

                <div className="field">
                    <label>Pallet ID</label>
                    <input
                        placeholder="PALLET-001"
                        value={palletCode}
                        onChange={(e) => setPalletCode(e.target.value)}
                    />
                </div>

                <div className="field">
                    <label>Defect Reason</label>
                    <select value={reason} onChange={(e) => setReason(e.target.value)}>
                        {REASONS.map((r) => (
                            <option key={r} value={r}>
                                {r}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="field">
                    <label>Description (optional)</label>
                    <textarea
                        rows="3"
                        placeholder="Enter detailed description..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                    />
                </div>

                <div className="info-box">
                    <b>Automatic actions after saving:</b>
                    <ul>
                        <li>The item will be blocked in the system</li>
                        <li>State: quarantine</li>
                        <li>Will be deducted from the regular warehouse</li>
                        <li>Record will be saved to history for ML</li>
                    </ul>
                </div>

                <button className="danger" onClick={handleSubmit}>
                    Save and Mark as Quarantine
                </button>

                {error && <p className="error">{error}</p>}
                {success && <p className="ok">{success}</p>}
            </section>
        </div>
    );
}

export default Quarantine;