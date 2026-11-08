import { useState, useEffect } from 'react';
import { api } from '../api';
import './Tsd.css';
import './Dashboard.css';

function Requests() {
    const [products, setProducts] = useState([]);
    const [lines, setLines] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    const [productCode, setProductCode] = useState('');
    const [lineName, setLineName] = useState('');
    const [quantity, setQuantity] = useState('');
    const [priority, setPriority] = useState(3);

    const [formError, setFormError] = useState('');
    const [message, setMessage] = useState({ ok: true, text: '' });

    async function loadRequests() {
        const res = await api('/api/replenishment/open');
        if (res.ok) setRequests(res.data);
    }

    useEffect(() => {
        async function load() {
            const [prodRes, lineRes] = await Promise.all([
                api('/api/dispecer/products'),
                api('/api/master-data/lines'),
            ]);
            if (prodRes.ok) {
                setProducts(prodRes.data);
                setProductCode(prodRes.data[0]?.code ?? '');
            }
            if (lineRes.ok) {
                const activeLines = lineRes.data.filter(line => line.isActive);
                setLines(activeLines);
                setLineName(activeLines[0]?.code ?? '');
            }
            await loadRequests();
            setLoading(false);
        }
        load();
    }, []);

    async function handleCreate() {
        setFormError('');
        setMessage({ ok: true, text: '' });

        const qty = Number(quantity);
        if (!productCode) {
            setFormError('Select a material');
            return;
        }
        if (!lines.some(line => line.code === lineName)) {
            setFormError('Select an active production line');
            return;
        }
        if (!/^\d+$/.test(quantity) || !Number.isSafeInteger(qty) || qty <= 0) {
            setFormError('Enter a valid whole-number quantity');
            return;
        }

        const res = await api('/api/replenishment', 'POST', {
            productCode,
            lineName,
            quantity: qty,
            priority,
        });
        if (!res.ok) {
            setFormError(res.data?.message ?? 'Error');
            return;
        }

        setMessage({ ok: true, text: 'Request #' + res.data.id + ' has been created' });
        setQuantity('');
        setPriority(3);
        await loadRequests();
    }

    async function handlePriority(id, newPriority) {
        setMessage({ ok: true, text: '' });
        const res = await api('/api/dispecer/replenishments/' + id + '/priority', 'POST', {
            priority: newPriority,
        });
        if (!res.ok) {
            setMessage({ ok: false, text: res.data?.message ?? 'Error' });
            return;
        }
        setMessage({ ok: true, text: 'The priority has been changed' });
        await loadRequests();
    }

    if (loading) return <p>Loading...</p>;

    return (
        <div className="tsd dash">
            <h1>Requests for Replenishment</h1>

            <section className="card">
                <h3>New Request</h3>
                <div className="row">
                    <select aria-label="Material" value={productCode} onChange={(e) => setProductCode(e.target.value)}>
                        {products.map((p) => (
                            <option key={p.code} value={p.code}>{p.code} - {p.name}</option>
                        ))}
                    </select>
                    <select aria-label="Production line" value={lineName} onChange={(e) => setLineName(e.target.value)}>
                        {lines.map((line) => (
                            <option key={line.id} value={line.code}>{line.code} - {line.name}</option>
                        ))}
                    </select>
                    <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Quantity"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                    />
                    <select
                        aria-label="Priority"
                        value={priority}
                        onChange={(e) => setPriority(parseInt(e.target.value, 10))}
                    >
                        {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>Priority {n}</option>
                        ))}
                    </select>
                    <button className="primary" onClick={handleCreate} disabled={!products.length || !lines.length}>Create</button>
                </div>
                {formError && <p className="error">{formError}</p>}
            </section>

            {message.text && <p className={message.ok ? 'ok' : 'error'}>{message.text}</p>}

            <section className="card">
                <h3>Open Requests</h3>
                {requests.length === 0 ? (
                    <p>No open requests.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>#</th><th>Material</th><th>Quantity</th>
                                <th>Line</th><th>Created</th><th>Priority</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map((r) => (
                                <tr key={r.id}>
                                    <td>{r.id}</td>
                                    <td>{r.productCode}<br /><small>{r.productName}</small></td>
                                    <td>{r.quantity}</td>
                                    <td>{r.lineName}</td>
                                    <td>{new Date(r.createdAt).toLocaleString('sk-SK')}</td>
                                    <td>
                                        <select
                                            value={r.priority}
                                            onChange={(e) => handlePriority(r.id, parseInt(e.target.value, 10))}
                                        >
                                            {[1, 2, 3, 4, 5].map((n) => (
                                                <option key={n} value={n}>Priority {n}</option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <small>1 = highest priority</small>
            </section>
        </div>
    );
}

export default Requests;
