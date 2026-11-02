import { useEffect, useState } from 'react';
import { api } from '../api';

function LineInventory() {
    const [lines, setLines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    async function loadLines() {
        setLoading(true);
        setError('');
        try {
            const result = await api('/api/dispecer/lines');
            if (!result.ok || !Array.isArray(result.data)) {
                setError(result.data?.message ?? 'Unable to load production line inventory.');
                return;
            }
            setLines(result.data);
        } catch {
            setError('Cannot connect to the backend.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadLines(); }, []);

    return (
        <div className="tsd dash">
            <div className="row-between">
                <h1>Production Line Inventory</h1>
                <button onClick={loadLines} disabled={loading}>Refresh</button>
            </div>
            <p>Materials and pallets currently assigned to L1 and L2.</p>
            <small>Quantities are grouped by material and unit. Pending requests are not included.</small>
            {error && <p className="error">{error}</p>}
            {loading && <p>Loading...</p>}

            {!loading && lines.map((line) => (
                <section className="card" key={line.lineName}>
                    <div className="row-between">
                        <h3>{line.lineName}</h3>
                        <small>{line.palletCount} assigned pallet{line.palletCount === 1 ? '' : 's'}</small>
                    </div>

                    <h3>Material quantities</h3>
                    {line.materials.length === 0 ? (
                        <p>No material currently assigned to this line.</p>
                    ) : (
                        <table>
                            <thead>
                                <tr><th>Material</th><th>Name</th><th>Quantity</th><th>Unit</th><th>Pallets</th></tr>
                            </thead>
                            <tbody>
                                {line.materials.map((m) => (
                                    <tr key={m.productCode}>
                                        <td>{m.productCode}</td>
                                        <td>{m.productName}</td>
                                        <td><strong>{m.quantity.toLocaleString('sk-SK')}</strong></td>
                                        <td>{m.unit}</td>
                                        <td>{m.palletCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    <h3>Assigned pallets</h3>
                    {line.pallets.length === 0 ? (
                        <p>No pallets on this line.</p>
                    ) : (
                        <table>
                            <thead>
                                <tr><th>Pallet</th><th>Material</th><th>Name</th><th>Quantity</th><th>Unit</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {line.pallets.map((p) => (
                                    <tr key={p.palletCode}>
                                        <td>{p.palletCode}</td>
                                        <td>{p.productCode}</td>
                                        <td>{p.productName}</td>
                                        <td>{p.quantity.toLocaleString('sk-SK')}</td>
                                        <td>{p.unit}</td>
                                        <td>{p.status}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>
            ))}
        </div>
    );
}

export default LineInventory;
