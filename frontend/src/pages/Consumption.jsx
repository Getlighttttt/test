import { useEffect, useState } from 'react';
import { api } from '../api';

// 48 options: 00:00, 00:30, 01:00, ... 23:30.
const ARRIVAL_TIMES = Array.from({ length: 48 }, (_, index) => {
    const hours = String(Math.floor(index / 2)).padStart(2, '0');
    const minutes = index % 2 === 0 ? '00' : '30';
    return `${hours}:${minutes}`;
});

function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Preserve the selected calendar date and the browser's actual local UTC offset.
// This allows the backend to store PeriodStart/PeriodEnd accurately in UTC.
function arrivalWithLocalOffset(recordedAt, arrivalTime) {
    const [year, month, day] = recordedAt.split('-').map(Number);
    const [hours, minutes] = arrivalTime.split(':').map(Number);
    const local = new Date(year, month - 1, day, hours, minutes, 0, 0);
    const offsetMinutes = -local.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0');
    const offsetRemainder = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
    return {
        value: `${recordedAt}T${arrivalTime}:00${sign}${offsetHours}:${offsetRemainder}`,
        timestamp: local.getTime()
    };
}

function Consumption() {
    const [pallets, setPallets] = useState([]);
    const [palletCode, setPalletCode] = useState('');
    const [recordedAt, setRecordedAt] = useState(() => localDateString());
    const [arrivalTime, setArrivalTime] = useState('');
    const [durationMinutes, setDurationMinutes] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    async function loadPallets() {
        setLoading(true);
        try {
            const result = await api('/api/consumption/pallets');
            if (!result.ok || !Array.isArray(result.data)) {
                setError(result.data?.message ?? 'Unable to load pallets on the production lines.');
                return;
            }
            setPallets(result.data);
            setPalletCode(current => result.data.some(p => p.palletCode === current) ? current : '');
            setError('');
        } catch {
            setError('Cannot connect to the backend.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadPallets(); }, []);

    const selected = pallets.find(p => p.palletCode === palletCode);

    async function handleSubmit(event) {
        event.preventDefault();
        setError('');
        setMessage('');

        const duration = Number(durationMinutes);
        if (!selected || !recordedAt || !arrivalTime || !Number.isSafeInteger(duration) || duration < 1 || duration > 10080) {
            setError('Select a pallet, consumption date and arrival time, then enter a valid duration in minutes.');
            return;
        }

        const arrivedAt = arrivalWithLocalOffset(recordedAt, arrivalTime);
        if (!Number.isFinite(arrivedAt.timestamp) || arrivedAt.timestamp + duration * 60000 > Date.now() + 60000) {
            setError('Arrival time plus consumption duration cannot be in the future.');
            return;
        }

        setSaving(true);
        try {
            const result = await api('/api/consumption', 'POST', {
                palletCode,
                recordedAt,
                arrivedAt: arrivedAt.value,
                durationMinutes: duration
            });
            if (!result.ok) {
                setError(result.data?.message ?? 'Unable to record consumption.');
                return;
            }
            setMessage(result.data?.message ?? 'Consumption recorded.');
            setPalletCode('');
            setArrivalTime('');
            setDurationMinutes('');
            await loadPallets();
        } catch {
            setError('Cannot connect to the backend.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="tsd dash">
            <h1>Production Consumption</h1>
            <p>Confirm consumption of a complete pallet on production line L1 or L2.</p>

            <section className="card">
                <form onSubmit={handleSubmit}>
                    <div className="field">
                        <label htmlFor="consume-pallet">Pallet on production line</label>
                        <select id="consume-pallet" value={palletCode}
                            onChange={e => setPalletCode(e.target.value)}
                            required disabled={loading || saving}>
                            <option value="">Select pallet</option>
                            {pallets.map(p => (
                                <option key={p.palletCode} value={p.palletCode}>
                                    {p.palletCode} — {p.lineName} — {p.productCode} — {p.quantity} {p.unit}
                                </option>
                            ))}
                        </select>
                    </div>

                    {selected && (
                        <p>
                            <strong>{selected.productName}</strong> — {selected.quantity} {selected.unit} on {selected.lineName}
                        </p>
                    )}

                    <div className="field">
                        <label htmlFor="consume-date">Consumption date (RecordedAt)</label>
                        <input id="consume-date" type="date" value={recordedAt}
                            onChange={e => setRecordedAt(e.target.value)}
                            max={localDateString()} required disabled={saving} />
                        <small>Select the calendar day of consumption (day, month, year).</small>
                    </div>

                    <div className="field">
                        <label htmlFor="consume-arrival">Time pallet arrived on the line</label>
                        <select id="consume-arrival" value={arrivalTime}
                            onChange={e => setArrivalTime(e.target.value)}
                            required disabled={saving}>
                            <option value="">Select arrival time</option>
                            {ARRIVAL_TIMES.map(time => <option key={time} value={time}>{time}</option>)}
                        </select>
                        <small>30-minute steps. The date is the one selected above.</small>
                    </div>

                    <div className="field">
                        <label htmlFor="consume-duration">Time taken to consume the pallet (minutes)</label>
                        <input id="consume-duration" type="number" min="1" max="10080" step="1"
                            value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)}
                            placeholder="e.g. 90" required disabled={saving} />
                    </div>

                    <button className="primary" type="submit" disabled={saving || loading || pallets.length === 0}>
                        {saving ? 'Saving...' : 'Confirm whole-pallet consumption'}
                    </button>
                </form>
                {loading && <p>Loading pallets...</p>}
                {!loading && pallets.length === 0 && <p>No pallets currently on L1 or L2.</p>}
                {error && <p className="error" role="alert">{error}</p>}
                {message && <p role="status">{message}</p>}
                <p><small>Confirmation removes the pallet from active inventory and records its consumption history.</small></p>
            </section>
        </div>
    );
}

export default Consumption;
