import { useState } from 'react';
import { api } from '../api';
import './Tsd.css';

function Tsd() {
    // ---- 23a: пошук замовлення ----
    const [orderNumber, setOrderNumber] = useState('');
    const [order, setOrder] = useState(null);
    const [error, setError] = useState('');

    // ---- 23b: додавання паллет ----
    const [palletCode, setPalletCode] = useState('');
    const [productCode, setProductCode] = useState('');
    const [quantity, setQuantity] = useState('');
    const [damaged, setDamaged] = useState(false);
    const [damageDescription, setDamageDescription] = useState('');
    const [pallets, setPallets] = useState([]);
    const [palletError, setPalletError] = useState('');

    // ---- 23c: відправка приймання ----
    const [result, setResult] = useState(null);
    const [submitError, setSubmitError] = useState('');

    // ---- 23d: розміщення в комірки ----
    const [freeLocations, setFreeLocations] = useState([]);
    const [chosen, setChosen] = useState({});      // { 'PALLET-001': 'LOC-A1' }
    const [placeMsg, setPlaceMsg] = useState({});  // { 'PALLET-001': { ok: true, text: '...' } }

    async function handleSearch() {
        setError('');
        setOrder(null);
        setResult(null);
        const res = await api('/api/receiving/order/' + orderNumber);
        if (!res.ok) {
            setError(res.data?.message ?? 'Error');
            return;
        }
        setOrder(res.data);
        setProductCode(res.data.items[0]?.code ?? '');
    }

    function handleAddPallet() {
        setPalletError('');
        const qty = parseInt(quantity, 10);
        if (!palletCode.trim()) {
            setPalletError('Enter pallet code');
            return;
        }
        if (!qty || qty <= 0) {
            setPalletError('Invalid quantity');
            return;
        }
        if (pallets.some((p) => p.code === palletCode.trim())) {
            setPalletError('This pallet is already in the list');
            return;
        }
        setPallets([
            ...pallets,
            {
                code: palletCode.trim(),
                productCode,
                quantity: qty,
                packagingDamaged: damaged,
                damageDescription: damaged ? damageDescription : null,
            },
        ]);
        setPalletCode('');
        setQuantity('');
        setDamaged(false);
        setDamageDescription('');
    }

    function handleRemovePallet(code) {
        setPallets(pallets.filter((p) => p.code !== code));
    }

    async function loadFreeLocations() {
        const res = await api('/api/receiving/free-locations');
        if (res.ok) {
            setFreeLocations(res.data);
        }
    }

    async function handleSubmit() {
        setSubmitError('');
        if (pallets.length === 0) {
            setSubmitError('Add at least one pallet');
            return;
        }
        const res = await api('/api/receiving/receive', 'POST', {
            orderNumber: order.orderNumber,
            pallets: pallets,
        });
        if (!res.ok) {
            setSubmitError(res.data?.message ?? 'Error occurred while receiving');
            return;
        }
        setResult(res.data);
        setPallets([]);
        await loadFreeLocations();
    }

    async function handlePlace(code) {
        const locationCode = chosen[code];
        if (!locationCode) {
            setPlaceMsg({ ...placeMsg, [code]: { ok: false, text: 'Select location' } });
            return;
        }
        const res = await api('/api/receiving/store', 'POST', {
            palletCode: code,
            locationCode: locationCode,
        });
        if (!res.ok) {
            setPlaceMsg({
                ...placeMsg,
                [code]: { ok: false, text: res.data?.message ?? 'Error' },
            });
            return;
        }
        setPlaceMsg({
            ...placeMsg,
            [code]: { ok: true, text: 'Stored at ' + locationCode },
        });
        await loadFreeLocations();
    }

    function handleReset() {
        setOrderNumber('');
        setOrder(null);
        setResult(null);
        setPallets([]);
        setError('');
        setSubmitError('');
        setPalletError('');
        setChosen({});
        setPlaceMsg({});
    }

    return (
        <div className="tsd">
            <h1>Receipt of materials</h1>

            {/* 23a: пошук замовлення */}
            <section className="card">
                <h3>1. Order</h3>
                <div className="row">
                    <input
                        placeholder="Order Number (e.g., ORD-001)"
                        value={orderNumber}
                        onChange={(e) => setOrderNumber(e.target.value)}
                    />
                    <button onClick={handleSearch}>Find</button>
                </div>
                {error && <p className="error">{error}</p>}

                {order && (
                    <>
                        <p>
                            <b>{order.orderNumber}</b> / {order.supplierName}
                        </p>
                        <table>
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Name</th>
                                    <th>Expected</th>
                                    <th>Unit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.items.map((item) => (
                                    <tr key={item.code}>
                                        <td>{item.code}</td>
                                        <td>{item.name}</td>
                                        <td>{item.expectedQty}</td>
                                        <td>{item.unit}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}
            </section>

            {order && !result && (
                <section className="card">
                    <h3>2. Pallets</h3>
                    <div className="row">
                        <input
                            placeholder="Pallet Code (PALLET-001)"
                            value={palletCode}
                            onChange={(e) => setPalletCode(e.target.value)}
                        />
                        <select
                            value={productCode}
                            onChange={(e) => setProductCode(e.target.value)}
                        >
                            {order.items.map((item) => (
                                <option key={item.code} value={item.code}>
                                    {item.code}
                                </option>
                            ))}
                        </select>
                        <input
                            type="number"
                            placeholder="Quantity"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                        />
                    </div>
                    <label className="check">
                        <input
                            type="checkbox"
                            checked={damaged}
                            onChange={(e) => setDamaged(e.target.checked)}
                        />
                        Damaged packaging
                    </label>
                    {damaged && (
                        <input
                            className="damage-input"
                            placeholder="Description of damage"
                            value={damageDescription}
                            onChange={(e) => setDamageDescription(e.target.value)}
                        />
                    )}
                    <div className="actions">
                        <button onClick={handleAddPallet}>Add pallet to list</button>
                    </div>
                    {palletError && <p className="error">{palletError}</p>}

                    {pallets.length > 0 && (
                        <table>
                            <thead>
                                <tr>
                                    <th>Pallet</th>
                                    <th>Material</th>
                                    <th>Quantity</th>
                                    <th>Damage</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pallets.map((p) => (
                                    <tr key={p.code}>
                                        <td>{p.code}</td>
                                        <td>{p.productCode}</td>
                                        <td>{p.quantity}</td>
                                        <td>{p.packagingDamaged ? 'Yes' : 'No'}</td>
                                        <td>
                                            <button onClick={() => handleRemovePallet(p.code)}>
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    <div className="actions submit">    
                        <button className="primary" onClick={handleSubmit}>
                            Save and Submit
                        </button>
                    </div>
                    {submitError && <p className="error">{submitError}</p>}
                </section>
            )}

            {result && (
                <section className="card">
                    <h3>3. Result</h3>
                    {result.status === 'OK' ? (
                        <p className="ok">The shipment is in order.</p>
                    ) : (
                        <div className="warn">
                            <p>
                                <b>Receipt with a discrepancy.</b> It is awaiting approval from the dispatcher.
                            </p>
                            <ul>
                                {result.deviations.map((d, i) => (
                                    <li key={i}>{d}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <h3>4. Placement in Warehouse</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Pallet</th>
                                <th>Position</th>
                                <th></th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.pallets.map((code) => (
                                <tr key={code}>
                                    <td>{code}</td>
                                    <td>
                                        <select
                                            value={chosen[code] ?? ''}
                                            onChange={(e) =>
                                                setChosen({ ...chosen, [code]: e.target.value })
                                            }
                                        >
                                            <option value="">-- select --</option>
                                            {freeLocations.map((l) => (
                                                <option key={l.code} value={l.code}>
                                                    {l.code}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <button onClick={() => handlePlace(code)}>Save</button>
                                    </td>
                                    <td>
                                        {placeMsg[code] && (
                                            <span
                                                className={placeMsg[code].ok ? 'ok' : 'error'}
                                            >
                                                {placeMsg[code].text}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <button onClick={handleReset}>New Shipment</button>
                </section>
            )}
        </div>
    );
}

export default Tsd;