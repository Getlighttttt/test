import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import './Analytics.css';

const number = value => Number(value || 0).toLocaleString('en-US');

function BarList({ items, labelKey, valueKey, unitKey }) {
    const max = Math.max(1, ...items.map(item => Number(item[valueKey] || 0)));
    if (!items.length) return <p className="analytics-empty">No recorded data for this period.</p>;
    return <div className="analytics-bars">
        {items.map((item, index) => <div className="analytics-bar-row" key={`${item[labelKey]}-${index}`}>
            <div className="analytics-bar-label"><span>{item[labelKey]}</span><b>{number(item[valueKey])} {unitKey ? item[unitKey] : ''}</b></div>
            <div className="analytics-bar-track"><div className="analytics-bar-fill" style={{ width: `${Math.max(2, Number(item[valueKey] || 0) / max * 100)}%` }} /></div>
        </div>)}
    </div>;
}

function MovementChart({ data }) {
    const width = 900, height = 300;
    const left = 58, right = 18, top = 18, bottom = 58;
    const series = [
        { key: 'received', label: 'Received', color: '#2563eb' },
        { key: 'issued', label: 'Sent to lines', color: '#f59e0b' },
        { key: 'consumed', label: 'Consumed', color: '#16a34a' },
    ];
    const max = Math.max(0, ...data.flatMap(d => series.map(s => Number(d[s.key] || 0))));
    if (!data.length || max === 0) return <div className="chart-empty-state"><strong>No operational flow data for this period</strong><span>Recorded receiving, line transfers or real production consumption will appear here. Synthetic ML training records are excluded.</span></div>;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const groupWidth = plotWidth / data.length;
    const barWidth = Math.min(22, groupWidth / 5);
    const y = value => top + plotHeight - (Number(value || 0) / max) * plotHeight;
    const tickStep = Math.pow(10, Math.floor(Math.log10(max || 1)));
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    return <div className="movement-chart-wrap">
        <svg className="movement-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grouped bar chart of received, sent to lines and consumed quantities">
            {ticks.map(t => {
                const value = Math.round(max * t);
                const yy = y(value);
                return <g key={t}><line x1={left} x2={width-right} y1={yy} y2={yy} className="chart-grid"/><text x={left-10} y={yy+4} textAnchor="end" className="chart-axis-label">{number(value)}</text></g>;
            })}
            {data.map((d, i) => {
                const center = left + groupWidth * (i + 0.5);
                return <g key={d.date}>
                    {series.map((item, j) => {
                        const value = Number(d[item.key] || 0);
                        const barHeight = value > 0 ? Math.max(1, (value / max) * plotHeight) : 0;
                        const x = center + (j - 1) * (barWidth + 3) - barWidth / 2;
                        return <g key={item.key}><rect x={x} y={y(value)} width={barWidth} height={barHeight} rx="3" fill={item.color}><title>{`${item.label}: ${number(value)}`}</title></rect></g>;
                    })}
                    <text x={center} y={height-25} textAnchor="middle" className="chart-axis-label">{d.label || d.date.slice(5)}</text>
                </g>;
            })}
        </svg>
        <div className="chart-legend">{series.map(item => <span key={item.key}><i style={{background:item.color}}/>{item.label}</span>)}</div>
    </div>;
}

const zoneColors = ['#2563eb', '#16a34a', '#0ea5e9', '#ef4444', '#a78bfa'];

function InventoryOverview({ zones }) {
    const total = zones.reduce((sum, zone) => sum + Number(zone.quantity || 0), 0);
    if (!total) return <div className="chart-empty-state"><strong>No active inventory</strong><span>There are currently no active pallets in the tracked warehouse zones.</span></div>;
    return <div className="inventory-overview-chart">
        <div className="inventory-stacked-track" role="img" aria-label={`Active pallet distribution across zones, ${total} pallets total`}>
            {zones.map((zone, index) => <div key={zone.zone} title={`${zone.zone}: ${zone.quantity} pallets`} style={{width:`${zone.quantity / total * 100}%`, background:zoneColors[index % zoneColors.length]}} />)}
        </div>
        <div className="inventory-zone-legend">{zones.map((zone, index) => <div className="inventory-zone-item" key={zone.zone}>
            <span><i style={{background:zoneColors[index % zoneColors.length]}}/>{zone.zone}</span>
            <b>{number(zone.quantity)} <small>pallets</small></b>
            <em>{Math.round(zone.quantity / total * 100)}%</em>
        </div>)}</div>
        <p className="chart-note">Counts active pallets, not material units. A pallet in quarantine is shown separately.</p>
    </div>;
}

function ConsumptionTrend({ trend, period, onPeriodChange, selected, onSelectedChange }) {
    const materials = trend?.materials || [];
    const current = materials.find(x => `${x.productCode}::${x.unit}` === selected) || materials[0];
    const points = current?.points || [];
    const width = 760, height = 280, left = 54, right = 18, top = 18, bottom = 48;
    const max = Math.max(1, ...points.map(x => Number(x.quantity || 0)));
    const plotW = width-left-right, plotH = height-top-bottom;
    const x = i => left + (points.length <= 1 ? plotW/2 : i/(points.length-1)*plotW);
    const y = value => top + plotH - Number(value || 0)/max*plotH;
    const path = points.map((p,i) => `${i?'L':'M'} ${x(i)} ${y(p.quantity)}`).join(' ');
    const labelEvery = period === '24h' ? 4 : period === '7d' ? 1 : 5;
    return <div className="consumption-trend">
        <div className="chart-controls">
            <label>Period<select value={period} onChange={e=>onPeriodChange(e.target.value)}><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
            <label>Material<select value={current ? `${current.productCode}::${current.unit}` : ''} onChange={e=>onSelectedChange(e.target.value)} disabled={!materials.length}>
                {materials.map(m=><option key={`${m.productCode}::${m.unit}`} value={`${m.productCode}::${m.unit}`}>{m.productCode} ({m.unit})</option>)}
            </select></label>
        </div>
        {!current || !points.some(p=>p.quantity>0) ? <div className="chart-empty-state"><strong>No consumption records</strong><span>Real production consumption for this material and period will appear here. Synthetic training records are excluded.</span></div> : <>
            <div className="trend-chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" role="img" aria-label={`Consumption trend for ${current.productCode}`}>
                {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={left} x2={width-right} y1={y(max*t)} y2={y(max*t)} className="chart-grid"/><text x={left-9} y={y(max*t)+4} textAnchor="end" className="chart-axis-label">{number(Math.round(max*t))}</text></g>)}
                <path d={path} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                {points.map((p,i)=><g key={`${p.timestamp}-${i}`}><circle cx={x(i)} cy={y(p.quantity)} r="3.5" fill="#2563eb"><title>{`${p.label}: ${number(p.quantity)} ${current.unit}`}</title></circle>{(i%labelEvery===0 || i===points.length-1) && <text x={x(i)} y={height-18} textAnchor="middle" className="chart-axis-label">{p.label}</text>}</g>)}
            </svg></div>
            <div className="trend-summary"><strong>{number(points.reduce((sum,p)=>sum+p.quantity,0))} {current.unit}</strong><span>Total recorded consumption · {current.productCode}</span></div>
        </>}
    </div>;
}

function ShortageRisk({ items }) {
    if (!items?.length) return <div className="chart-empty-state"><strong>No ML predictions available</strong><span>Run an ML forecast to see the latest shortage risk for each production line.</span></div>;
    return <div className="risk-chart-list">{items.map(item=>{
        const risk=Math.max(0,Math.min(100,Number(item.riskPercent||0)));
        const level=risk>=70?'high':risk>=40?'medium':'low';
        return <div className="risk-line" key={item.lineName}>
            <div className="risk-line-head"><strong>{item.lineName}</strong><span className={`risk-value risk-${level}`}>{risk.toFixed(1)}% · {level.toUpperCase()} RISK</span></div>
            <div className="risk-track"><div className={`risk-fill risk-fill-${level}`} style={{width:`${risk}%`}}/></div>
            <small>Highest latest material prediction · {item.materialsEvaluated} material(s) evaluated</small>
        </div>;
    })}</div>;
}

function Analytics() {
    const [days, setDays] = useState(30);
    const [consumptionPeriod, setConsumptionPeriod] = useState('7d');
    const [selectedMaterial, setSelectedMaterial] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        api(`/api/analytics/overview?days=${days}&consumptionPeriod=${consumptionPeriod}`)
            .then(result => {
                if (!active) return;
                if (result.ok) { setData(result.data); setError(''); }
                else setError(result.data?.message || 'Unable to load analytics.');
            })
            .catch(() => { if (active) setError('Analytics service is unavailable.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [days, consumptionPeriod]);

    const zoneTotal = useMemo(() => data?.stockByZone?.reduce((sum, x) => sum + x.quantity, 0) || 0, [data]);
    useEffect(() => {
        const first = data?.consumptionTrend?.materials?.[0];
        if (first) setSelectedMaterial(`${first.productCode}::${first.unit}`);
    }, [data?.consumptionTrend?.materials]);

    return <div className="analytics-page">
        <div className="analytics-header">
            <div><p className="analytics-eyebrow">WAREHOUSE INTELLIGENCE</p><h1>Analytics</h1><p className="analytics-subtitle">Operational overview, inventory distribution and material flow.</p></div>
            <label className="period-select">Reporting period<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label>
        </div>
        {error && <div className="analytics-error" role="alert">{error}</div>}
        {loading && <p className="analytics-empty">Loading analytics…</p>}
        {!loading && data && <>
            <div className="analytics-kpis">
                <article className="analytics-kpi"><span>Active pallets</span><strong>{number(data.kpis.totalStock)}</strong><small>Pallets not consumed or written off</small></article>
                <article className="analytics-kpi"><span>Consumption records</span><strong>{number(data.kpis.consumptionRecords)}</strong><small>Real production records; units are not mixed</small></article>
                <article className="analytics-kpi"><span>Movement events</span><strong>{number(data.kpis.movementEvents)}</strong><small>Recorded inventory movements</small></article>
                <article className="analytics-kpi kpi-alert"><span>Quarantined pallets</span><strong>{number(data.kpis.quarantinedStock)}</strong><small>{number(data.kpis.openQuarantine)} open quarantine cases</small></article>
            </div>

            <div className="analytics-grid">
                <section className="analytics-panel panel-wide"><div className="panel-heading"><div><h2>Material flow</h2><p>{days === 7 ? "Daily" : "Weekly"} totals from recorded operational events</p></div><span className="panel-tag">{days} days</span></div><MovementChart data={data.movementDays || []}/></section>
                <section className="analytics-panel panel-wide"><div className="panel-heading"><div><h2>Inventory Overview</h2><p>Current active pallet distribution across warehouse zones</p></div><span className="panel-tag">{number(zoneTotal)} active pallets</span></div><InventoryOverview zones={data.stockByZone || []}/></section>
                <section className="analytics-panel panel-wide"><div className="panel-heading"><div><h2>Material Consumption</h2><p>Real production consumption over time, by material and unit</p></div></div><ConsumptionTrend trend={data.consumptionTrend} period={consumptionPeriod} onPeriodChange={setConsumptionPeriod} selected={selectedMaterial} onSelectedChange={setSelectedMaterial}/></section>
                <section className="analytics-panel panel-wide"><div className="panel-heading"><div><h2>Shortage Risk by Production Line</h2><p>Highest latest ML-predicted material risk for each line</p></div><span className="panel-tag">Latest predictions</span></div><ShortageRisk items={data.shortageRiskByLine || []}/><p className="chart-note">Low: below 40% · Medium: 40–69.9% · High: 70% or above. Risk is based on the latest saved prediction per material and line.</p></section>
                <section className="analytics-panel"><div className="panel-heading"><div><h2>Consumption by line</h2><p>Recorded consumption during selected period</p></div></div><BarList items={data.consumptionByLine || []} labelKey="line" valueKey="quantity" unitKey="unit"/></section>
                <section className="analytics-panel"><div className="panel-heading"><div><h2>Top consumed materials</h2><p>Highest recorded usage</p></div></div><BarList items={data.topMaterials || []} labelKey="productCode" valueKey="quantity" unitKey="unit"/></section>
                <section className="analytics-panel"><div className="panel-heading"><div><h2>Replenishment overview</h2><p>Requests created during selected period</p></div></div>
                    <div className="request-summary"><div><strong>{number(data.requestStats.total)}</strong><span>Total requests</span></div><div><strong>{number(data.requestStats.completed)}</strong><span>Completed</span></div><div><strong>{number(data.requestStats.pending)}</strong><span>Still open</span></div><div><strong>{number(data.requestStats.autoGenerated)}</strong><span>Auto-generated</span></div></div>
                </section>
            </div>
            <section className="analytics-status"><h2>Operational attention</h2><div className="status-items"><div><span className="status-number">{number(data.kpis.openRequests)}</span><span>Open replenishment requests</span></div><div><span className="status-number">{number(data.kpis.openDeviations)}</span><span>Unresolved receiving deviations</span></div><div><span className="status-number">{number(data.kpis.openQuarantine)}</span><span>Open quarantine cases</span></div></div></section>
            <p className="analytics-footnote">Operational analytics use DB1 warehouse records and DB2 movement/consumption history. Synthetic ML training records are excluded; missing events are not estimated. {number(data.dataQuality?.syntheticConsumptionExcluded)} synthetic consumption records were excluded from this period.</p>
        </>}
    </div>;
}

export default Analytics;
