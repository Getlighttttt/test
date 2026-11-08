
import { useState, useEffect } from 'react';
import { api } from '../api';
import './Tsd.css';
import './Dashboard.css';
import './Deviations.css';

function Deviations() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ ok: true, text: '' });
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [selectedDeviation, setSelectedDeviation] = useState(null);
    const [submitting, setSubmitting] = useState(false);

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
        if (!approve) {
            setSelectedDeviation(id);
            setShowRejectModal(true);
            return;
        }

        await submitDecision(id, true);
    }

    async function submitDecision(id, approve) {
        setSubmitting(true);

        const res = await api(
            '/api/dispecer/deviations/' + id + '/decision',
            'POST',
            { approve }
        );

        setSubmitting(false);

        if (!res.ok) {
            setMessage({
                ok: false,
                text: res.data?.message ?? 'Error',
            });
            return;
        }

        setMessage({
            ok: true,
            text: approve ? 'Deviation approved' : 'Deviation rejected',
        });

        setShowRejectModal(false);
        setSelectedDeviation(null);

        await loadDeviations();
    }

    function confirmReject() {
        if (selectedDeviation !== null) {
            submitDecision(selectedDeviation, false);
        }
    }

    if (loading) {
        return <p>Loading...</p>;
    }

    return (
        <div className="tsd dash">
            <h1>Deviations</h1>

            {message.text && (
                <p className={message.ok ? 'ok' : 'error'}>
                    {message.text}
                </p>
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

                            <span>
                                {new Date(d.createdAt).toLocaleString('sk-SK')}
                            </span>
                        </div>

                        <div className="warn">
                            <b>Deviation Found:</b>
                            <p className="note">{d.note}</p>
                        </div>

                        <div className="row" style={{ marginTop: 12 }}>
                            <button
                                className="success"
                                onClick={() => handleDecision(d.id, true)}
                            >
                                Approve
                            </button>

                            <button
                                className="danger"
                                onClick={() => handleDecision(d.id, false)}
                            >
                                Reject
                            </button>
                        </div>
                    </section>
                ))
            )}

            {showRejectModal && (
                <div
                    className="deviation-modal-overlay"
                    onClick={() => {
                        if (!submitting) {
                            setShowRejectModal(false);
                            setSelectedDeviation(null);
                        }
                    }}
                >
                    <div
                        className="deviation-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="deviation-modal-icon">!</div>

                        <h2>Reject deviation?</h2>

                        <p>
                            Are you sure you want to reject this deviation?
                            This action cannot be undone.
                        </p>

                        <div className="deviation-modal-actions">
                            <button
                                className="deviation-cancel"
                                disabled={submitting}
                                onClick={() => {
                                    setShowRejectModal(false);
                                    setSelectedDeviation(null);
                                }}
                            >
                                Cancel
                            </button>

                            <button
                                className="danger"
                                disabled={submitting}
                                onClick={confirmReject}
                            >
                                {submitting ? 'Rejecting...' : 'Yes, reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Deviations;
