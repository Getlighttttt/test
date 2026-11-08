import { useEffect, useState } from 'react';
import { api } from '../api';
import './Tsd.css';
import './Dashboard.css';
import './MasterData.css';

const emptyMaterial = { code: '', name: '', unit: 'ks' };
const emptyLine = { code: '', name: '', location: '' };

function MasterData() {
    const [tab, setTab] = useState('orders');
    const [materials, setMaterials] = useState([]);
    const [orders, setOrders] = useState([]);
    const [lines, setLines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [saving, setSaving] = useState(false);

    const [materialForm, setMaterialForm] = useState(emptyMaterial);
    const [editingMaterial, setEditingMaterial] = useState(null);
    const [lineForm, setLineForm] = useState(emptyLine);
    const [editingLine, setEditingLine] = useState(null);

    const [orderNumber, setOrderNumber] = useState('');
    const [supplierName, setSupplierName] = useState('');
    const [orderProduct, setOrderProduct] = useState('');
    const [orderQty, setOrderQty] = useState('');
    const [orderItems, setOrderItems] = useState([]);

    async function loadAll() {
        setLoading(true);
        setError('');
        try {
            const [materialRes, orderRes, lineRes] = await Promise.all([
                api('/api/master-data/materials'),
                api('/api/master-data/orders'),
                api('/api/master-data/lines'),
            ]);
            if (!materialRes.ok || !orderRes.ok || !lineRes.ok) {
                setError(materialRes.data?.message || orderRes.data?.message || lineRes.data?.message || 'Unable to load master data.');
                return;
            }
            setMaterials(materialRes.data);
            setOrders(orderRes.data);
            setLines(lineRes.data);
            if (!orderProduct && materialRes.data.length) {
                setOrderProduct(materialRes.data.find(m => m.isActive)?.code ?? '');
            }
        } catch {
            setError('Cannot connect to the backend.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadAll(); }, []);

    function showResult(text) {
        setNotice(text);
        setError('');
    }

    async function submitMaterial(e) {
        e.preventDefault();
        setSaving(true);
        const isEdit = editingMaterial !== null;
        const result = isEdit
            ? await api(`/api/master-data/materials/${editingMaterial.id}`, 'PUT', {
                name: materialForm.name, unit: materialForm.unit,
            })
            : await api('/api/master-data/materials', 'POST', materialForm);
        setSaving(false);
        if (!result.ok) {
            setError(result.data?.message ?? 'Unable to save material.');
            return;
        }
        setMaterialForm(emptyMaterial);
        setEditingMaterial(null);
        showResult(isEdit ? 'Material updated.' : 'Material created.');
        await loadAll();
    }

    async function toggleMaterial(material) {
        const action = material.isActive ? 'deactivate' : 'activate';
        const result = await api(`/api/master-data/materials/${material.id}/${action}`, 'POST');
        if (!result.ok) {
            setError(result.data?.message ?? 'Unable to update material status.');
            return;
        }
        showResult(`Material ${material.code} ${material.isActive ? 'deactivated' : 'activated'}.`);
        await loadAll();
    }

    async function submitLine(e) {
        e.preventDefault();
        setSaving(true);
        const isEdit = editingLine !== null;
        const result = isEdit
            ? await api(`/api/master-data/lines/${editingLine.id}`, 'PUT', {
                name: lineForm.name, location: lineForm.location,
            })
            : await api('/api/master-data/lines', 'POST', lineForm);
        setSaving(false);
        if (!result.ok) {
            setError(result.data?.message ?? 'Unable to save production line.');
            return;
        }
        setLineForm(emptyLine);
        setEditingLine(null);
        showResult(isEdit ? 'Production line updated.' : 'Production line created.');
        await loadAll();
    }

    async function toggleLine(line) {
        const action = line.isActive ? 'deactivate' : 'activate';
        const result = await api(`/api/master-data/lines/${line.id}/${action}`, 'POST');
        if (!result.ok) {
            setError(result.data?.message ?? 'Unable to update production line status.');
            return;
        }
        showResult(`Production line ${line.code} ${line.isActive ? 'deactivated' : 'activated'}.`);
        await loadAll();
    }

    function addOrderItem() {
        const qty = Number(orderQty);
        if (!orderProduct || !Number.isSafeInteger(qty) || qty <= 0) {
            setError('Select a material and enter a positive whole-number quantity.');
            return;
        }
        if (orderItems.some(item => item.productCode === orderProduct)) {
            setError('This material is already in the order.');
            return;
        }
        setOrderItems(current => [...current, { productCode: orderProduct, expectedQty: qty }]);
        setOrderQty('');
        setError('');
    }

    async function submitOrder(e) {
        e.preventDefault();
        setSaving(true);
        const result = await api('/api/master-data/orders', 'POST', {
            orderNumber, supplierName, items: orderItems,
        });
        setSaving(false);
        if (!result.ok) {
            setError(result.data?.message ?? 'Unable to create order.');
            return;
        }
        setOrderNumber('');
        setSupplierName('');
        setOrderItems([]);
        showResult(`Order ${result.data.orderNumber} created.`);
        await loadAll();
    }

    const activeMaterials = materials.filter(m => m.isActive);

    return (
        <div className="tsd dash master-data">
            <div className="row-between master-heading">
                <div>
                    <h1>Master Data</h1>
                    <p>Manage supplier orders, materials and production lines.</p>
                </div>
                <button type="button" onClick={loadAll} disabled={loading}>Refresh</button>
            </div>

            <div className="master-tabs" role="tablist" aria-label="Master data categories">
                <button className={tab === 'orders' ? 'active' : ''} onClick={() => { setTab('orders'); setError(''); }}>ORD · Orders</button>
                <button className={tab === 'materials' ? 'active' : ''} onClick={() => { setTab('materials'); setError(''); }}>MAT · Materials</button>
                <button className={tab === 'lines' ? 'active' : ''} onClick={() => { setTab('lines'); setError(''); }}>L · Production Lines</button>
            </div>

            {error && <p className="error master-message">{error}</p>}
            {notice && <p className="ok master-message">{notice}</p>}
            {loading && <p>Loading master data...</p>}

            {!loading && tab === 'orders' && (
                <>
                    <section className="card">
                        <h3>Create supplier order</h3>
                        <form onSubmit={submitOrder}>
                            <div className="master-form-grid">
                                <label>Order number
                                    <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="ORD-002" required />
                                </label>
                                <label>Supplier
                                    <input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Supplier name" required />
                                </label>
                            </div>
                            <div className="master-item-builder">
                                <label>Material
                                    <select value={orderProduct} onChange={e => setOrderProduct(e.target.value)}>
                                        {activeMaterials.map(m => <option key={m.id} value={m.code}>{m.code} — {m.name}</option>)}
                                    </select>
                                </label>
                                <label>Expected quantity
                                    <input type="number" min="1" step="1" value={orderQty} onChange={e => setOrderQty(e.target.value)} placeholder="100" />
                                </label>
                                <button type="button" onClick={addOrderItem} disabled={!activeMaterials.length}>Add material</button>
                            </div>
                            {orderItems.length > 0 && (
                                <div className="master-order-items">
                                    <b>Order items</b>
                                    {orderItems.map(item => {
                                        const material = materials.find(m => m.code === item.productCode);
                                        return <div className="row-between" key={item.productCode}>
                                            <span>{item.productCode} — {material?.name ?? ''}</span>
                                            <span>{item.expectedQty} {material?.unit}</span>
                                            <button type="button" className="master-remove" onClick={() => setOrderItems(current => current.filter(x => x.productCode !== item.productCode))}>Remove</button>
                                        </div>;
                                    })}
                                </div>
                            )}
                            <button className="primary" type="submit" disabled={saving || orderItems.length === 0}>{saving ? 'Saving...' : 'Create order'}</button>
                        </form>
                    </section>

                    <section className="card">
                        <h3>Supplier orders ({orders.length})</h3>
                        {orders.length === 0 ? <p>No orders found.</p> : (
                            <table>
                                <thead><tr><th>Order</th><th>Supplier</th><th>Items</th><th>Status</th><th>Created</th></tr></thead>
                                <tbody>
                                    {orders.map(order => (
                                        <tr key={order.id}>
                                            <td><b>{order.orderNumber}</b></td>
                                            <td>{order.supplierName}</td>
                                            <td>{order.items.map(item => `${item.productCode} (${item.expectedQty} ${item.unit})`).join(', ')}</td>
                                            <td><span className="master-status">{order.status}</span></td>
                                            <td>{new Date(order.createdAt).toLocaleDateString('sk-SK')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </section>
                </>
            )}

            {!loading && tab === 'materials' && (
                <>
                    <section className="card">
                        <h3>{editingMaterial ? `Edit ${editingMaterial.code}` : 'Add material'}</h3>
                        <form onSubmit={submitMaterial}>
                            <div className="master-form-grid">
                                <label>Material code
                                    <input value={materialForm.code} disabled={editingMaterial !== null} onChange={e => setMaterialForm({ ...materialForm, code: e.target.value })} placeholder="MAT-004" required />
                                </label>
                                <label>Material name
                                    <input value={materialForm.name} onChange={e => setMaterialForm({ ...materialForm, name: e.target.value })} placeholder="Aluminium profile" required />
                                </label>
                                <label>Unit
                                    <input value={materialForm.unit} onChange={e => setMaterialForm({ ...materialForm, unit: e.target.value })} placeholder="ks, kg, m" required />
                                </label>
                            </div>
                            <div className="row">
                                <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editingMaterial ? 'Save changes' : 'Add material'}</button>
                                {editingMaterial && <button type="button" onClick={() => { setEditingMaterial(null); setMaterialForm(emptyMaterial); }}>Cancel</button>}
                            </div>
                        </form>
                    </section>
                    <section className="card">
                        <h3>Materials ({materials.length})</h3>
                        <table>
                            <thead><tr><th>Code</th><th>Name</th><th>Unit</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                {materials.map(m => (
                                    <tr key={m.id}>
                                        <td><b>{m.code}</b></td><td>{m.name}</td><td>{m.unit}</td>
                                        <td><span className={m.isActive ? 'master-status active' : 'master-status inactive'}>{m.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
                                        <td className="master-actions">
                                            <button type="button" onClick={() => { setEditingMaterial(m); setMaterialForm({ code: m.code, name: m.name, unit: m.unit }); }}>Edit</button>
                                            <button type="button" className={m.isActive ? 'danger' : 'success'} onClick={() => toggleMaterial(m)}>{m.isActive ? 'Deactivate' : 'Activate'}</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </>
            )}

            {!loading && tab === 'lines' && (
                <>
                    <section className="card">
                        <h3>{editingLine ? `Edit ${editingLine.code}` : 'Add production line'}</h3>
                        <form onSubmit={submitLine}>
                            <div className="master-form-grid">
                                <label>Line code
                                    <input value={lineForm.code} disabled={editingLine !== null} onChange={e => setLineForm({ ...lineForm, code: e.target.value })} placeholder="L3" required />
                                </label>
                                <label>Line name
                                    <input value={lineForm.name} onChange={e => setLineForm({ ...lineForm, name: e.target.value })} placeholder="Assembly Line 3" required />
                                </label>
                                <label>Location
                                    <input value={lineForm.location} onChange={e => setLineForm({ ...lineForm, location: e.target.value })} placeholder="Production Hall 2" />
                                </label>
                            </div>
                            <div className="row">
                                <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editingLine ? 'Save changes' : 'Add production line'}</button>
                                {editingLine && <button type="button" onClick={() => { setEditingLine(null); setLineForm(emptyLine); }}>Cancel</button>}
                            </div>
                        </form>
                    </section>
                    <section className="card">
                        <h3>Production lines ({lines.length})</h3>
                        <table>
                            <thead><tr><th>Code</th><th>Name</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                {lines.map(line => (
                                    <tr key={line.id}>
                                        <td><b>{line.code}</b></td><td>{line.name}</td><td>{line.location || '—'}</td>
                                        <td><span className={line.isActive ? 'master-status active' : 'master-status inactive'}>{line.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
                                        <td className="master-actions">
                                            <button type="button" onClick={() => { setEditingLine(line); setLineForm({ code: line.code, name: line.name, location: line.location }); }}>Edit</button>
                                            <button type="button" className={line.isActive ? 'danger' : 'success'} onClick={() => toggleLine(line)}>{line.isActive ? 'Deactivate' : 'Activate'}</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </>
            )}
        </div>
    );
}

export default MasterData;
