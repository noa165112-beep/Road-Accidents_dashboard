/**
 * Israel Road Accidents 2024 - Interactive Data Visualization
 * Full client-side dashboard with 2 tabs, linked views (cross-filtering),
 * brush selection, dual-axis charts, and heatmap.
 */

// --- Global Palette & Config ---
const COLORS = {
    fatal: '#ef4444',
    severe: '#f97316',
    light: '#3b82f6',
    share: '#eab308',
    grid: '#23314e',
    text: '#94a3b8',
    textLight: '#f8fafc',
    barBg: '#6366f1'
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Global chart settings
if (typeof Chart !== 'undefined') {
    Chart.defaults.color = COLORS.text;
    Chart.defaults.borderColor = COLORS.grid;
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.95)';
    Chart.defaults.plugins.tooltip.titleColor = COLORS.textLight;
    Chart.defaults.plugins.tooltip.bodyColor = COLORS.text;
    Chart.defaults.plugins.tooltip.borderColor = '#334155';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
}

// --- State Management ---
let allData = [];
let filteredData = [];

const state = {
    view: 'overview',         // 'overview' | 'severity'
    mapMode: 'points',        // 'points' | 'density'
    heatMetric: 'count',      // 'count' | 'share'
    isBrushing: false,
    filters: {
        severity: 'All',      // 'All' | 'Fatal' | 'Severe' | 'Light'
        light: 'All',         // 'All' | 'Day' | 'Night'
        day: null,            // string
        month: null,          // 1..12
        type: null,           // string
        hour: null,           // 0..23
        road: null,           // string
        bounds: null          // L.latLngBounds
    }
};

// Chart instances
let dayChart, monthChart, typeChart, bubbleChart, roadChart;

// --- Map Initialization (Standard Leaflet SVG, No preferCanvas) ---
const map = L.map('map').setView([31.5, 34.85], 8);

// Esri Dark Gray Canvas base
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; OpenStreetMap contributors',
    maxZoom: 16
}).addTo(map);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16
}).addTo(map);

// Map Layers
const pointsLayer = L.layerGroup().addTo(map);
let heatLayer = null;
let brushRectangle = null;

// Add Map Legend
const mapLegend = L.control({ position: 'bottomright' });
mapLegend.onAdd = function() {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML = `
        <div style="font-weight:700; margin-bottom:4px; color:#fff;">Severity</div>
        <div class="map-legend-item"><i class="dot fatal"></i> Fatal (קטלנית)</div>
        <div class="map-legend-item"><i class="dot severe"></i> Severe (קשה)</div>
        <div class="map-legend-item"><i class="dot light"></i> Light (קלה)</div>
    `;
    return div;
};
mapLegend.addTo(map);

// --- Data Filtering Pipeline ---
function applyFilters() {
    filteredData = allData.filter(d => {
        if (state.filters.severity !== 'All' && d.severity_label !== state.filters.severity) return false;
        if (state.filters.light !== 'All' && d.light !== state.filters.light) return false;
        if (state.filters.day && d.day_name !== state.filters.day) return false;
        if (state.filters.month && d.HODESH_TEUNA !== state.filters.month) return false;
        if (state.filters.type && d.accident_type !== state.filters.type) return false;
        if (state.filters.hour !== null && d.hour !== state.filters.hour) return false;
        if (state.filters.road && d.road_type !== state.filters.road) return false;
        if (state.filters.bounds) {
            if (!state.filters.bounds.contains([d.lat, d.lon])) return false;
        }
        return true;
    });

    updateKPIs();
    updateFilterChips();
    updateMap();

    // Render charts based on currently active view to avoid zero-dimension canvas issues
    if (state.view === 'overview') {
        updateOverviewCharts();
    } else {
        updateDashboard2Charts();
        updateHeatmap();
    }
}

// --- KPI Cards ---
function updateKPIs() {
    const total = filteredData.length;
    let fatal = 0, severe = 0, light = 0;
    filteredData.forEach(d => {
        if (d.severity_label === 'Fatal') fatal++;
        else if (d.severity_label === 'Severe') severe++;
        else if (d.severity_label === 'Light') light++;
    });

    const share = total > 0 ? (((fatal + severe) / total) * 100).toFixed(1) : 0;

    document.getElementById('kpiTotal').textContent = total.toLocaleString();
    document.getElementById('kpiFatal').textContent = fatal.toLocaleString();
    document.getElementById('kpiSevere').textContent = severe.toLocaleString();
    document.getElementById('kpiLight').textContent = light.toLocaleString();
    document.getElementById('kpiShare').textContent = share + '%';

    document.getElementById('kpiFatalSub').textContent = total > 0 ? `(${((fatal / total) * 100).toFixed(1)}%)` : '';
    document.getElementById('kpiSevereSub').textContent = total > 0 ? `(${((severe / total) * 100).toFixed(1)}%)` : '';
    document.getElementById('kpiLightSub').textContent = total > 0 ? `(${((light / total) * 100).toFixed(1)}%)` : '';
}

// --- Active Filter Chips ---
function updateFilterChips() {
    const container = document.getElementById('activeFilters');
    container.innerHTML = '';
    const resetBtn = document.getElementById('resetAll');

    const activeList = [];
    if (state.filters.severity !== 'All') activeList.push({ key: 'severity', label: `Severity: ${state.filters.severity}` });
    if (state.filters.light !== 'All') activeList.push({ key: 'light', label: `Time: ${state.filters.light}` });
    if (state.filters.day) activeList.push({ key: 'day', label: `Day: ${state.filters.day}` });
    if (state.filters.month) activeList.push({ key: 'month', label: `Month: ${MONTHS[state.filters.month - 1]}` });
    if (state.filters.type) activeList.push({ key: 'type', label: `Type: ${state.filters.type}` });
    if (state.filters.hour !== null) activeList.push({ key: 'hour', label: `Hour: ${String(state.filters.hour).padStart(2,'0')}:00` });
    if (state.filters.road) activeList.push({ key: 'road', label: `Road: ${state.filters.road}` });
    if (state.filters.bounds) activeList.push({ key: 'bounds', label: `Area: Custom Area` });

    if (activeList.length === 0) {
        resetBtn.hidden = true;
        return;
    }

    resetBtn.hidden = false;
    activeList.forEach(item => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = `${item.label} <span class="chip-close" data-key="${item.key}">&times;</span>`;
        chip.querySelector('.chip-close').addEventListener('click', (e) => {
            const k = e.target.getAttribute('data-key');
            if (k === 'severity') {
                state.filters.severity = 'All';
                syncSegmented('severityFilter', 'All');
            } else if (k === 'light') {
                state.filters.light = 'All';
                syncSegmented('lightFilter', 'All');
            } else if (k === 'bounds') {
                state.filters.bounds = null;
                if (brushRectangle) { map.removeLayer(brushRectangle); brushRectangle = null; }
            } else {
                state.filters[k] = null;
            }
            applyFilters();
        });
        container.appendChild(chip);
    });
}

function syncSegmented(containerId, activeVal) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll('.seg').forEach(b => {
        if (b.getAttribute('data-value') === activeVal) b.classList.add('active');
        else b.classList.remove('active');
    });
}

// --- Map Render (Clean & Reliable) ---
function updateMap() {
    pointsLayer.clearLayers();
    if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
    }

    if (state.mapMode === 'points') {
        const markerRadius = filteredData.length > 3000 ? 4.5 : (filteredData.length > 500 ? 5.5 : 7);

        filteredData.forEach(d => {
            if (!d.lat || !d.lon) return;
            const color = d.severity_label === 'Fatal' ? COLORS.fatal :
                         (d.severity_label === 'Severe' ? COLORS.severe : COLORS.light);
            
            L.circleMarker([d.lat, d.lon], {
                radius: markerRadius,
                fillColor: color,
                color: '#1e293b',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(pointsLayer)
            .bindPopup(`
                <div style="color:#0f172a; font-family:sans-serif; font-size:12px; line-height:1.4;">
                    <div style="font-weight:700; font-size:13px; margin-bottom:4px; color:${color};">
                        ${d.severity_label} Accident
                    </div>
                    <b>Type:</b> ${d.accident_type}<br>
                    <b>Day & Time:</b> ${d.day_name}, ${d.hour !== null ? String(d.hour).padStart(2,'0') + ':00' : 'Unknown'} (${d.light || ''})<br>
                    <b>Setting:</b> ${d.road_type || 'Unknown'}
                </div>
            `);
        });
    } else {
        // Density Heatmap mode
        if (typeof L.heatLayer === 'function') {
            const heatPoints = filteredData.map(d => {
                const weight = d.severity_label === 'Fatal' ? 1.0 : (d.severity_label === 'Severe' ? 0.7 : 0.4);
                return [d.lat, d.lon, weight];
            });
            heatLayer = L.heatLayer(heatPoints, {
                radius: 18,
                blur: 15,
                maxZoom: 14,
                gradient: { 0.2: '#0284c7', 0.5: '#eab308', 0.8: '#f97316', 1.0: '#ef4444' }
            }).addTo(map);
        }
    }
}

// --- Map Brushing / Select Area ---
let brushStart = null;
const brushBtn = document.getElementById('brushBtn');

brushBtn.addEventListener('click', () => {
    state.isBrushing = !state.isBrushing;
    if (state.isBrushing) {
        brushBtn.classList.add('active');
        map.dragging.disable();
        map.getContainer().style.cursor = 'crosshair';
    } else {
        disableBrushing();
    }
});

function disableBrushing() {
    state.isBrushing = false;
    brushBtn.classList.remove('active');
    map.dragging.enable();
    map.getContainer().style.cursor = '';
    brushStart = null;
}

map.on('mousedown', (e) => {
    if (!state.isBrushing) return;
    brushStart = e.latlng;
    if (brushRectangle) {
        map.removeLayer(brushRectangle);
        brushRectangle = null;
    }
});

map.on('mousemove', (e) => {
    if (!state.isBrushing || !brushStart) return;
    const current = e.latlng;
    const bounds = L.latLngBounds(brushStart, current);
    if (!brushRectangle) {
        brushRectangle = L.rectangle(bounds, { color: COLORS.accent, weight: 2, fillOpacity: 0.15 }).addTo(map);
    } else {
        brushRectangle.setBounds(bounds);
    }
});

map.on('mouseup', (e) => {
    if (!state.isBrushing || !brushStart) return;
    const bounds = L.latLngBounds(brushStart, e.latlng);
    state.filters.bounds = bounds;
    disableBrushing();
    applyFilters();
});

// --- Dashboard 1 Charts (Dual-Axis & Linked) ---
function updateOverviewCharts() {
    // 1. Day of Week Chart (Dual-Axis: Bar = Counts, Line = % Serious)
    const dayCounts = {};
    const daySerious = {};
    DAYS.forEach(d => { dayCounts[d] = 0; daySerious[d] = 0; });
    filteredData.forEach(d => {
        if (dayCounts[d.day_name] !== undefined) {
            dayCounts[d.day_name]++;
            if (d.severity_label === 'Fatal' || d.severity_label === 'Severe') daySerious[d.day_name]++;
        }
    });

    const dayShares = DAYS.map(d => dayCounts[d] > 0 ? +((daySerious[d] / dayCounts[d]) * 100).toFixed(1) : 0);

    const dayEl = document.getElementById('dayChart');
    if (dayEl) {
        if (dayChart) dayChart.destroy();
        dayChart = new Chart(dayEl, {
            data: {
                labels: DAYS,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Accidents',
                        data: DAYS.map(d => dayCounts[d]),
                        backgroundColor: DAYS.map(d => state.filters.day === d ? '#38bdf8' : '#6366f1'),
                        borderRadius: 4,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: '% Serious (Fatal + Severe)',
                        data: dayShares,
                        borderColor: COLORS.share,
                        backgroundColor: COLORS.share,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (evt, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const clickedDay = DAYS[idx];
                        state.filters.day = (state.filters.day === clickedDay) ? null : clickedDay;
                        applyFilters();
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Day of the Week' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        title: { display: true, text: 'Number of Accidents' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        max: 60,
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: '% Serious Rate' },
                        ticks: { callback: v => v + '%' }
                    }
                }
            }
        });
    }

    const satShare = dayShares[6];
    const tueShare = dayShares[2];
    const dayInsEl = document.getElementById('dayInsight');
    if (dayInsEl) {
        dayInsEl.innerHTML = `
            💡 <b>Weekend Lethality Paradox:</b> Saturday has the lowest volume of accidents, yet its serious rate is <b>${satShare}%</b> compared to <b>${tueShare}%</b> on Tuesday.
        `;
    }

    // 2. Month Chart (Dual-Axis, beginAtZero: true)
    const monthCounts = Array(12).fill(0);
    const monthSerious = Array(12).fill(0);
    filteredData.forEach(d => {
        if (d.HODESH_TEUNA >= 1 && d.HODESH_TEUNA <= 12) {
            monthCounts[d.HODESH_TEUNA - 1]++;
            if (d.severity_label === 'Fatal' || d.severity_label === 'Severe') {
                monthSerious[d.HODESH_TEUNA - 1]++;
            }
        }
    });
    const monthShares = monthCounts.map((c, i) => c > 0 ? +((monthSerious[i] / c) * 100).toFixed(1) : 0);

    const monthEl = document.getElementById('monthChart');
    if (monthEl) {
        if (monthChart) monthChart.destroy();
        monthChart = new Chart(monthEl, {
            data: {
                labels: MONTHS,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Accidents',
                        data: monthCounts,
                        backgroundColor: MONTHS.map((_, i) => state.filters.month === (i + 1) ? '#38bdf8' : '#0284c7'),
                        borderRadius: 4,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: '% Serious',
                        data: monthShares,
                        borderColor: COLORS.share,
                        backgroundColor: COLORS.share,
                        borderWidth: 2.5,
                        pointRadius: 4,
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (evt, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const clickedMonth = idx + 1;
                        state.filters.month = (state.filters.month === clickedMonth) ? null : clickedMonth;
                        applyFilters();
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Month (2024)' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        title: { display: true, text: 'Number of Accidents' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        max: 60,
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: '% Serious Rate' },
                        ticks: { callback: v => v + '%' }
                    }
                }
            }
        });
    }

    const monthInsEl = document.getElementById('monthInsight');
    if (monthInsEl) {
        monthInsEl.innerHTML = `
            💡 <b>True Scale:</b> With the Y-axis fixed to begin at zero, we observe seasonal steady volumes across spring and summer with slight reduction in late Q4.
        `;
    }

    // 3. Top Accident Types (Stacked Bar Chart by Severity)
    const typeMap = {};
    filteredData.forEach(d => {
        const t = d.accident_type || 'Other';
        if (!typeMap[t]) typeMap[t] = { Fatal: 0, Severe: 0, Light: 0, total: 0 };
        typeMap[t][d.severity_label]++;
        typeMap[t].total++;
    });

    const sortedTypes = Object.entries(typeMap)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 7);

    const typeLabels = sortedTypes.map(x => x[0]);
    const typeEl = document.getElementById('typeChart');

    if (typeEl) {
        if (typeChart) typeChart.destroy();
        typeChart = new Chart(typeEl, {
            type: 'bar',
            data: {
                labels: typeLabels,
                datasets: [
                    {
                        label: 'Fatal',
                        data: sortedTypes.map(x => x[1].Fatal),
                        backgroundColor: COLORS.fatal
                    },
                    {
                        label: 'Severe',
                        data: sortedTypes.map(x => x[1].Severe),
                        backgroundColor: COLORS.severe
                    },
                    {
                        label: 'Light',
                        data: sortedTypes.map(x => x[1].Light),
                        backgroundColor: COLORS.light
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: {
                        stacked: true,
                        title: { display: true, text: 'Total Accidents (Split by Severity)' }
                    },
                    y: {
                        stacked: true,
                        title: { display: true, text: 'Accident Category' }
                    }
                },
                onClick: (evt, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const clickedType = typeLabels[idx];
                        state.filters.type = (state.filters.type === clickedType) ? null : clickedType;
                        applyFilters();
                    }
                }
            }
        });
    }
}

// --- Dashboard 2 Charts ---
function updateDashboard2Charts() {
    // 1. Bubble Chart: Frequency vs Serious Rate
    const aggTypes = {};
    filteredData.forEach(d => {
        const t = d.accident_type || 'Other';
        if (!aggTypes[t]) aggTypes[t] = { count: 0, fatal: 0, severe: 0 };
        aggTypes[t].count++;
        if (d.severity_label === 'Fatal') aggTypes[t].fatal++;
        if (d.severity_label === 'Severe') aggTypes[t].severe++;
    });

    const natAvgShare = 34.3; // National baseline ~34.3%
    const bubblePoints = [];

    Object.entries(aggTypes).forEach(([type, data]) => {
        if (data.count < 15) return; // filter tiny noise
        const seriousShare = +(((data.fatal + data.severe) / data.count) * 100).toFixed(1);
        const radius = Math.max(6, Math.min(28, Math.sqrt(data.fatal) * 2.8 + 5));

        bubblePoints.push({
            x: data.count,
            y: seriousShare,
            r: radius,
            type: type,
            fatal: data.fatal,
            severe: data.severe,
            isAbove: seriousShare > natAvgShare
        });
    });

    const bubbleEl = document.getElementById('bubbleChart');
    if (bubbleEl) {
        if (bubbleChart) bubbleChart.destroy();
        bubbleChart = new Chart(bubbleEl, {
            type: 'bubble',
            data: {
                datasets: [{
                    label: 'Accident Types',
                    data: bubblePoints,
                    backgroundColor: bubblePoints.map(p => p.isAbove ? 'rgba(239, 68, 68, 0.75)' : 'rgba(59, 130, 246, 0.75)'),
                    borderColor: bubblePoints.map(p => p.isAbove ? '#ef4444' : '#3b82f6'),
                    borderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const p = ctx.raw;
                                return [
                                    `${p.type}`,
                                    `Count: ${p.x}`,
                                    `Serious Rate: ${p.y}% (Fatal: ${p.fatal}, Severe: ${p.severe})`,
                                    `Bubble Size = Fatal Casualties`
                                ];
                            }
                        }
                    },
                    legend: { display: false }
                },
                onClick: (evt, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const clickedType = bubblePoints[idx].type;
                        state.filters.type = (state.filters.type === clickedType) ? null : clickedType;
                        applyFilters();
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Total Accidents (Frequency)' },
                        beginAtZero: true
                    },
                    y: {
                        title: { display: true, text: '% Serious (Fatal + Severe Proportion)' },
                        beginAtZero: true,
                        max: 85,
                        ticks: { callback: v => v + '%' }
                    }
                }
            }
        });
    }

    const bubbleInsEl = document.getElementById('bubbleInsight');
    if (bubbleInsEl) {
        bubbleInsEl.innerHTML = `
            🎯 <b>Insight:</b> <i>Front-to-side</i> crashes are the most common (3,057) but only <b>19%</b> serious. In stark contrast, <i>Pedestrian hits</i> and <i>Skids</i> produce the highest lethality (up to <b>79%</b> severe/fatal).
        `;
    }

    // 2. 100% Normalized Severity Mix by Road Setting
    const roadTypes = ['Urban - junction', 'Urban - not junction', 'Intercity - junction', 'Intercity - not junction'];
    const roadAgg = {};
    roadTypes.forEach(r => { roadAgg[r] = { Fatal: 0, Severe: 0, Light: 0, total: 0 }; });

    filteredData.forEach(d => {
        if (roadAgg[d.road_type]) {
            roadAgg[d.road_type][d.severity_label]++;
            roadAgg[d.road_type].total++;
        }
    });

    const fatalPct = roadTypes.map(r => roadAgg[r].total > 0 ? +((roadAgg[r].Fatal / roadAgg[r].total) * 100).toFixed(1) : 0);
    const severePct = roadTypes.map(r => roadAgg[r].total > 0 ? +((roadAgg[r].Severe / roadAgg[r].total) * 100).toFixed(1) : 0);
    const lightPct = roadTypes.map(r => roadAgg[r].total > 0 ? +((roadAgg[r].Light / roadAgg[r].total) * 100).toFixed(1) : 0);

    const roadEl = document.getElementById('roadChart');
    if (roadEl) {
        if (roadChart) roadChart.destroy();
        roadChart = new Chart(roadEl, {
            type: 'bar',
            data: {
                labels: roadTypes.map(r => r.replace(' - ', '\n')),
                datasets: [
                    { label: 'Fatal %', data: fatalPct, backgroundColor: COLORS.fatal },
                    { label: 'Severe %', data: severePct, backgroundColor: COLORS.severe },
                    { label: 'Light %', data: lightPct, backgroundColor: COLORS.light }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        title: { display: true, text: 'Road Setting' }
                    },
                    y: {
                        stacked: true,
                        max: 100,
                        beginAtZero: true,
                        title: { display: true, text: 'Severity Breakdown (%)' },
                        ticks: { callback: v => v + '%' }
                    }
                },
                onClick: (evt, elements) => {
                    if (elements.length > 0) {
                        const idx = elements[0].index;
                        const clickedRoad = roadTypes[idx];
                        state.filters.road = (state.filters.road === clickedRoad) ? null : clickedRoad;
                        applyFilters();
                    }
                }
            }
        });
    }

    const roadInsEl = document.getElementById('roadInsight');
    if (roadInsEl) {
        roadInsEl.innerHTML = `
            🛣️ <b>Intercity Highway Danger:</b> Non-junction intercity roads have more than double the proportion of fatal accidents compared to city intersections, due to high travel velocities.
        `;
    }
}

// --- Interactive Heatmap (Hour x Day) ---
function updateHeatmap() {
    const container = document.getElementById('heatmap');
    if (!container) return;
    container.innerHTML = '';

    // Matrix 7 days x 24 hours
    const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ total: 0, serious: 0 })));

    filteredData.forEach(d => {
        const dayIdx = DAYS.indexOf(d.day_name);
        if (dayIdx >= 0 && d.hour !== null && d.hour >= 0 && d.hour < 24) {
            matrix[dayIdx][d.hour].total++;
            if (d.severity_label === 'Fatal' || d.severity_label === 'Severe') {
                matrix[dayIdx][d.hour].serious++;
            }
        }
    });

    // Find max value for color scale
    let maxVal = 1;
    for (let day = 0; day < 7; day++) {
        for (let h = 0; h < 24; h++) {
            const val = state.heatMetric === 'count' 
                ? matrix[day][h].total 
                : (matrix[day][h].total >= 5 ? (matrix[day][h].serious / matrix[day][h].total) * 100 : 0);
            if (val > maxVal) maxVal = val;
        }
    }

    // Header row with Hour labels
    const headerRow = document.createElement('div');
    headerRow.className = 'heat-row';
    headerRow.innerHTML = '<div class="heat-day-label" style="cursor:default;">Day / Hour</div>';
    for (let h = 0; h < 24; h++) {
        const lbl = document.createElement('div');
        lbl.className = 'heat-hour-label';
        lbl.textContent = String(h);
        lbl.title = `Filter by hour ${h}:00`;
        lbl.addEventListener('click', () => {
            state.filters.hour = (state.filters.hour === h) ? null : h;
            applyFilters();
        });
        headerRow.appendChild(lbl);
    }
    container.appendChild(headerRow);

    // Days rows
    const tooltip = document.getElementById('tooltip');

    DAYS.forEach((dayName, dayIdx) => {
        const row = document.createElement('div');
        row.className = 'heat-row';

        const dayLbl = document.createElement('div');
        dayLbl.className = 'heat-day-label';
        dayLbl.textContent = dayName;
        dayLbl.addEventListener('click', () => {
            state.filters.day = (state.filters.day === dayName) ? null : dayName;
            applyFilters();
        });
        row.appendChild(dayLbl);

        for (let h = 0; h < 24; h++) {
            const cellData = matrix[dayIdx][h];
            const cell = document.createElement('div');
            cell.className = 'heat-cell';

            const val = state.heatMetric === 'count' 
                ? cellData.total 
                : (cellData.total >= 5 ? ((cellData.serious / cellData.total) * 100).toFixed(0) : 0);

            // Interpolate color
            const ratio = maxVal > 0 ? (val / maxVal) : 0;
            let bg;
            if (state.heatMetric === 'count') {
                bg = cellData.total === 0 ? '#151d2f' :
                     ratio < 0.25 ? '#0c4a6e' :
                     ratio < 0.55 ? '#0284c7' :
                     ratio < 0.8  ? '#f97316' : '#ef4444';
            } else {
                bg = cellData.total < 5 ? '#151d2f' :
                     ratio < 0.35 ? '#1e3a8a' :
                     ratio < 0.65 ? '#d97706' : '#dc2626';
            }
            cell.style.backgroundColor = bg;
            if (val > 0 && cellData.total >= 5) cell.textContent = val;

            // Cell hover tooltip
            cell.addEventListener('mouseenter', (e) => {
                if (!tooltip) return;
                tooltip.style.display = 'block';
                const pct = cellData.total > 0 ? ((cellData.serious / cellData.total) * 100).toFixed(1) : 0;
                tooltip.innerHTML = `
                    <b>${dayName}, ${String(h).padStart(2,'0')}:00 - ${String(h).padStart(2,'0')}:59</b><br>
                    Accidents: <b>${cellData.total}</b><br>
                    Serious: <b>${cellData.serious}</b> (${pct}%)
                `;
            });
            cell.addEventListener('mousemove', (e) => {
                if (!tooltip) return;
                tooltip.style.left = (e.clientX + 14) + 'px';
                tooltip.style.top = (e.clientY + 14) + 'px';
            });
            cell.addEventListener('mouseleave', () => {
                if (tooltip) tooltip.style.display = 'none';
            });

            // Cell click cross-filter
            cell.addEventListener('click', () => {
                state.filters.day = dayName;
                state.filters.hour = h;
                applyFilters();
            });

            row.appendChild(cell);
        }
        container.appendChild(row);
    });

    // Update Heatmap legend
    const legendEl = document.getElementById('heatLegend');
    if (legendEl) {
        legendEl.innerHTML = `
            <span>Low (0)</span>
            <div class="heat-legend-bar"></div>
            <span>High (${Math.round(maxVal)}${state.heatMetric === 'share' ? '%' : ''})</span>
        `;
    }

    const heatInsEl = document.getElementById('heatInsight');
    if (heatInsEl) {
        heatInsEl.innerHTML = state.heatMetric === 'count'
            ? `🔥 <b>Peak Rush Hours:</b> Commuting hours on weekdays (16:00 - 18:00) experience maximum crash frequencies.`
            : `⚠️ <b>Deadliest Driving Windows:</b> Late night and weekend early morning hours (01:00 - 04:00) exhibit serious injury shares upwards of <b>50%</b>.`;
    }
}

// --- UI Event Listeners ---

// 1. Tab Switching (2 Dashboards)
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        const viewId = tab.getAttribute('data-view');
        const activeView = document.getElementById(`view-${viewId}`);
        if (activeView) activeView.classList.add('active');
        state.view = viewId;

        if (viewId === 'overview') {
            setTimeout(() => {
                map.invalidateSize();
                updateOverviewCharts();
            }, 80);
        } else {
            setTimeout(() => {
                updateDashboard2Charts();
                updateHeatmap();
            }, 80);
        }
    });
});

// 2. Global Severity Segmented Filter
document.getElementById('severityFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg');
    if (!btn) return;
    document.querySelectorAll('#severityFilter .seg').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filters.severity = btn.getAttribute('data-value');
    applyFilters();
});

// 3. Global Light Segmented Filter (Day / Night)
document.getElementById('lightFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg');
    if (!btn) return;
    document.querySelectorAll('#lightFilter .seg').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filters.light = btn.getAttribute('data-value');
    applyFilters();
});

// 4. Map Mode Toggle (Points vs Density)
document.getElementById('mapMode').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg');
    if (!btn) return;
    document.querySelectorAll('#mapMode .seg').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mapMode = btn.getAttribute('data-value');
    updateMap();
});

// 5. Heatmap Metric Toggle (Accidents vs % Serious)
document.getElementById('heatMetric').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg');
    if (!btn) return;
    document.querySelectorAll('#heatMetric .seg').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.heatMetric = btn.getAttribute('data-value');
    updateHeatmap();
});

// 6. Reset All Filters
document.getElementById('resetAll').addEventListener('click', () => {
    state.filters = {
        severity: 'All',
        light: 'All',
        day: null,
        month: null,
        type: null,
        hour: null,
        road: null,
        bounds: null
    };
    syncSegmented('severityFilter', 'All');
    syncSegmented('lightFilter', 'All');
    if (brushRectangle) { map.removeLayer(brushRectangle); brushRectangle = null; }
    disableBrushing();
    applyFilters();
});

// --- Bootstrapping ---
const dataReady = (window.ACCIDENTS && Array.isArray(window.ACCIDENTS) && window.ACCIDENTS.length > 0)
    ? Promise.resolve(window.ACCIDENTS)
    : fetch('data/accidents_clean.json').catch(() => fetch('accidents_clean.json')).then(r => r.json());

dataReady
    .then(data => {
        allData = data;
        applyFilters();
        setTimeout(() => map.invalidateSize(), 200);
    })
    .catch(err => {
        console.error('Error loading dataset:', err);
    });
