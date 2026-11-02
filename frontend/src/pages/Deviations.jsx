import { useState, useEffect } from 'react';
import { api } from '../api';
import './Tsd.css';
import './Dashboard.css';

function Deviations() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ ok: true, text: '' });

    async function loadDeviations() {
        const res = await api('/api/dispecer/deviations');
        if (res.ok) {
            setItems(res.data);
        } else {
            setMessage({ ok: false, text: 'Failed to load deviations' });
        }
        setLoading(false);
    }

    useEffect(() => {
        loadDeviations();
    }, []);

    async function handleDecision(id, approve) {
        if (!approve && !window.confirm('Do you really want to reject this payment?')) {
            return;
        }

        const res = await api('/api/dispecer/deviations/' + id + '/decision', 'POST', {
            approve: approve,
        });

        if (!res.ok) {
            setMessage({ ok: false, text: res.data?.message ?? 'Error' });
            return;
        }

        setMessage({
            ok: true,
            text: approve ? 'Payment approved' : 'Payment rejected',
        });
        await loadDeviations();  
    }

    if (loading) {
        return <p>Loading...</p>;
    }

    return (
        <div className="tsd dash">
            <h1>Deviations</h1>

            {message.text && (
                <p className={message.ok ? 'ok' : 'error'}>{message.text}</p>
            )}

            {items.length === 0 ? (
                <section className="card">
                    <p>No deviations to approve.</p>
                </section>
            ) : (
                items.map((d) => (
                    <section className="card" key={d.id}>
                        <div className="row-between">
                            <h3>
                                Order {d.orderNumber}{' '}
                                <small>(receipt #{d.id})</small>
                            </h3>
                            <span>{new Date(d.createdAt).toLocaleString('sk-SK')}</span>
                        </div>

                        <div className="warn">
                            <b>Deviation Found:</b>
                            <p className="note">{d.note}</p>
                        </div>

                        <div className="row" style={{ marginTop: 12 }}>
                            <button className="success" onClick={() => handleDecision(d.id, true)}>
                                Approve
                            </button>
                            <button className="danger" onClick={() => handleDecision(d.id, false)}>
                                Reject
                            </button>
                        </div>
                    </section>
                ))
            )}
        </div>
    );
}

export default Deviations;