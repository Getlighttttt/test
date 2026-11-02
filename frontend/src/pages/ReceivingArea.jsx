import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import './Dashboard.css';

function ReceivingArea() {
    const [pallets, setPallets] = useState([]);
    const [locations, setLocations] = useState([]);
    const [selected, setSelected] = useState({});
    const [busyCode, setBusyCode] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const reload = useCallback(async () => {
        try {
            const [waiting, free] = await Promise.all([
                api('/api/receiving/area'),
                api('/api/receiving/free-locations'),
            ]);
            if (!waiting.ok || !free.ok) {
                setError('Could not load receiving pallets or storage locations.');
                return;
            }
            setPallets(waiting.data);
            setLocations(free.data);
            setError('');
        } catch {
            setError('Could not connect to the server.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { reload(); }, [reload]);

    async function storePallet(code) {
        const locationCode = selected[code];
        if (!locationCode) {
            setError('Choose a free storage location first.');
            return;
        }

        setBusyCode(code);
        setError('');
        setMessage('');
        try {
            const response = await api('/api/receiving/store', 'POST', {
                palletCode: code,
                locationCode,
            });
            if (!response.ok) {
                setError(response.data?.message ?? 'Unable to store pallet.');
                return;
            }
            setMessage(`Pallet ${code} stored at ${locationCode}.`);
            setSelected(current => ({ ...current, [code]: '' }));
            await reload();
        } catch {
            setError('Could not connect to the server.');
        } finally {
            setBusyCode(null);
        }
    }

    const approvalLabel = (status) => ({
        OK: 'Ready',
        APPROVED: 'Approved',
        WITH_DEVIATION: 'Awaiting dispatcher approval',
        REJECTED: 'Rejected / blocked',
        UNKNOWN: 'No receipt linked',
    }[status] ?? status);

    return (
        <div className="tsd dash">
            <h1>Receiving Area</h1>
            <p>All received pallets awaiting storage. Shared physical area: <b>LOC-REC1</b>.</p>
            <div className="row" style={{ marginBottom: 16 }}>
                <button onClick={reload} disabled={busyCode !== null}>Refresh</button>
            </div>
            {message && <p className="ok">{message}</p>}
            {error && <p className="error">{error}</p>}

            <section className="card">
                <h3>Awaiting placement ({pallets.length})</h3>
                {loading ? (
                    <p>Loading...</p>
                ) : pallets.length === 0 ? (
                    <p>No pallets are waiting in receiving.</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Pallet</th>
                                    <th>Order</th>
                                    <th>Material</th>
                                    <th>Quantity</th>
                                    <th>Location</th>
                                    <th>Approval</th>
                                    <th>Storage location</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pallets.map(p => (
                                    <tr key={p.code}>
                                        <td>{p.code}</td>
                                        <td>{p.orderNumber ?? '—'}</td>
                                        <td>{p.productCode}<br/><small>{p.productName}</small></td>
                                        <td>{p.quantity} {p.unit}</td>
                                        <td>{p.locationCode ?? 'Not assigned (older record)'}</td>
                                        <td>{approvalLabel(p.receiptStatus)}</td>
                                        <td>
                                            <select
                                                value={selected[p.code] ?? ''}
                                                disabled={!p.canStore || busyCode !== null}
                                                onChange={e => setSelected(current => ({
                                                    ...current, [p.code]: e.target.value,
                                                }))}
                                            >
                                                <option value="">Select location</option>
                                                {locations.map(loc => (
                                                    <option key={loc.code} value={loc.code}>
                                                        {loc.code}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <button
                                                disabled={!p.canStore || busyCode !== null || !selected[p.code]}
                                                onClick={() => storePallet(p.code)}
                                            >
                                                {busyCode === p.code ? 'Saving...' : 'Store'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}

export default ReceivingArea;
