import { useState, useEffect } from 'react';
import { api } from '../api';
import './Tsd.css';

function Line() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [palletInput, setPalletInput] = useState({}); // { 5: 'PALLET-020' }  ключ це id заявки
    const [errors, setErrors] = useState({});           // { 5: 'текст помилки' }
    const [info, setInfo] = useState('');

    async function loadRequests() {
        const res = await api('/api/replenishment/open');
        if (res.ok) {
            setRequests(res.data);
        }
        setLoading(false);
    }

    useEffect(() => {
        loadRequests();
    }, []);

    async function handleSend(id) {
        setInfo('');
        const code = (palletInput[id] ?? '').trim();
        if (!code) {
            setErrors({ ...errors, [id]: 'Please enter the pallet code' });
            return;
        }

        const res = await api('/api/replenishment/' + id + '/send', 'POST', {
            palletCode: code,
        });

        if (!res.ok) {
            setErrors({ ...errors, [id]: res.data?.message ?? 'Error' });
            return;
        }

        setErrors({ ...errors, [id]: '' });
        setPalletInput({ ...palletInput, [id]: '' });
        setInfo(res.data?.message ?? 'Pallet sent to line');
        await loadRequests(); // виконана заявка зникне зі списку
    }

    if (loading) {
        return <p>Loading...</p>;
    }

    return (
        <div className="tsd">
            <h1>Send to Line</h1>

            <section className="card">
                <h3>Open Requests for Replenishment</h3>

                {info && <p className="ok">{info}</p>}

                {requests.length === 0 ? (
                    <p>No open requests.</p>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Priority</th>
                                <th>Material</th>
                                <th>Quantity</th>
                                <th>Line</th>
                                <th>Created</th>
                                <th>Pallet</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map((r) => (
                                <tr key={r.id}>
                                    <td>{r.priority}</td>
                                    <td>
                                        {r.productCode}
                                        <br />
                                        <small>{r.productName}</small>
                                    </td>
                                    <td>{r.quantity}</td>
                                    <td>{r.lineName}</td>
                                    <td>{new Date(r.createdAt).toLocaleString('sk-SK')}</td>
                                    <td>
                                        <input
                                            placeholder="PALLET-001"
                                            value={palletInput[r.id] ?? ''}
                                            onChange={(e) =>
                                                setPalletInput({
                                                    ...palletInput,
                                                    [r.id]: e.target.value,
                                                })
                                            }
                                        />
                                        {errors[r.id] && <div className="error">{errors[r.id]}</div>}
                                    </td>
                                    <td>
                                        <button className="primary" onClick={() => handleSend(r.id)}>
                                            Send to Line
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}

export default Line;