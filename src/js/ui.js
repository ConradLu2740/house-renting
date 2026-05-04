// =============================================
// UI 渲染与交互
// =============================================

function getGradientColor(value) {
    if (value <= 0.5) {
        const ratio = value * 2;
        const r = Math.round(82 + (250 - 82) * ratio);
        const g = Math.round(196 + (173 - 196) * ratio);
        const b = Math.round(26 + (20 - 26) * ratio);
        return `rgb(${r}, ${g}, ${b})`;
    } else {
        const ratio = (value - 0.5) * 2;
        const r = Math.round(250 + (245 - 250) * ratio);
        const g = Math.round(173 * (1 - ratio));
        const b = Math.round(20 + (45 - 20) * ratio);
        return `rgb(${r}, ${g}, ${b})`;
    }
}

function drawIsochrone() {
    const maxCommute = parseInt(document.getElementById('max-commute').value) || 60;
    const radii = [
        { minutes: 15, color: '#52c41a', radius: 3000 },
        { minutes: 30, color: '#faad14', radius: 7000 },
        { minutes: 60, color: '#f5222d', radius: 15000 }
    ];

    radii.forEach(r => {
        if (r.minutes <= maxCommute) {
            const circle = new AMap.Circle({
                center: companyPosition,
                radius: r.radius,
                fillColor: 'transparent',
                strokeColor: r.color,
                strokeWeight: 2,
                strokeStyle: 'dashed',
                strokeOpacity: 0.6
            });
            circle.setMap(map);
            districtOverlays.push(circle);
        }
    });
}

function drawOverlays(results) {
    districtOverlays.forEach(p => p.setMap(null));
    districtOverlays = [];

    if (results.length === 0) return;

    const scores = results.map(r => r.comprehensiveScore);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    results.forEach((area) => {
        const normalized = (area.comprehensiveScore - minScore) / (maxScore - minScore || 1);
        const color = getGradientColor(normalized);

        let overlay;

        if (area.boundaries && area.boundaries.length > 0) {
            overlay = new AMap.Polygon({
                path: area.boundaries,
                fillColor: color, fillOpacity: 0.5,
                strokeColor: '#999', strokeWeight: 1,
                extData: area
            });
        } else if (area.center) {
            const center = Array.isArray(area.center) ? area.center : [area.center.lng, area.center.lat];
            overlay = new AMap.Circle({
                center: center,
                radius: 800,
                fillColor: color, fillOpacity: 0.4,
                strokeColor: color, strokeWeight: 2, strokeOpacity: 0.8,
                extData: area
            });
        } else {
            return;
        }

        overlay.setMap(map);

        overlay.on('mouseover', () => {
            overlay.setOptions({ fillOpacity: 0.7 });
            showInfoWindow(area);
        });

        overlay.on('mouseout', () => {
            overlay.setOptions({ fillOpacity: area.boundaries && area.boundaries.length > 0 ? 0.5 : 0.4 });
            infoWindow.close();
        });

        overlay.on('click', () => {
            highlightTableRow(area);
        });

        districtOverlays.push(overlay);
    });

    drawIsochrone();
    map.setFitView();
}

function showInfoWindow(area) {
    const rentArea = parseFloat(document.getElementById('rent-area').value) || 30;
    const estimatedRent = area.estimatedRent || getEstimatedRent(companyDistrict ? companyDistrict.name : '', rentArea);
    const content = `
        <div style="padding: 8px; min-width: 200px;">
            <h4 style="margin: 0 0 8px 0; color: #333;">${area.name}</h4>
            <p style="margin: 4px 0; font-size: 12px; color: #666;">
                <strong>通勤方式：</strong>${area.commuteMode || '-'}
            </p>
            <p style="margin: 4px 0; font-size: 12px; color: #666;">
                <strong>单程耗时：</strong>${area.hasEdgeData && area.edgeDurationMax !== area.durationMinutes
                    ? `${area.edgeDurationMin}-${area.edgeDurationMax}分钟` : `${area.durationMinutes}分钟`}
            </p>
            <p style="margin: 4px 0; font-size: 12px; color: #666;">
                <strong>痛苦指数：</strong>${area.painIndex}
            </p>
            <p style="margin: 4px 0; font-size: 12px; color: #666;">
                <strong>参考月租：</strong>¥${estimatedRent}
            </p>
            <p style="margin: 4px 0; font-size: 12px; color: #666;">
                <strong>月总成本：</strong>¥${area.totalCost || '—'}
            </p>
            <p style="margin: 4px 0; font-size: 12px; color: #666;">
                <strong>综合评分：</strong>${area.comprehensiveScore || '—'}
            </p>
        </div>
    `;

    let position = area.center;
    if (position && !Array.isArray(position)) {
        position = [position.lng, position.lat];
    }

    if (position) {
        infoWindow.setContent(content);
        infoWindow.open(map, position);
    }
}

function renderTable(results) {
    const tbody = document.getElementById('result-body');
    const rentArea = parseFloat(document.getElementById('rent-area').value) || 30;
    const budgetLimit = parseFloat(document.getElementById('budget-limit').value) || 0;

    if (results.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: #999; padding: 40px;">没有符合条件的区域</td></tr>`;
        return;
    }

    tbody.innerHTML = results.map((r, index) => {
        const isBest = index === 0;
        const rent = r.rent || '';
        const estimatedRent = r.estimatedRent || getEstimatedRent(companyDistrict ? companyDistrict.name : '', rentArea);
        const modeTag = r.commuteMode === '地铁' ? '<span class="tag-metro">地铁</span>' :
            r.commuteMode === '公交' ? '<span class="tag-bus">公交</span>' :
            r.commuteMode === '驾车' ? '<span class="tag-car">驾车</span>' : '-';

        const directTag = r.directSubwayBonus ? ' <span style="color:#1677ff;font-size:11px;">⚡直达</span>' : '';

        const durationDisplay = r.hasEdgeData && r.edgeDurationMax !== r.durationMinutes
            ? `${r.edgeDurationMin}-${r.edgeDurationMax}分钟`
            : `${r.durationMinutes}分钟${r.boundaries && r.boundaries.length > 0 ? ' <button onclick="showEdgeDuration(\'' + r.name + '\')" style="font-size:11px;padding:2px 6px;background:#f0f0f0;border:none;border-radius:4px;cursor:pointer;">边缘时间</button>' : ''}`;

        const transferInfo = r.commuteMode === '驾车'
            ? `${Math.round(r.distance / 1000)}km`
            : `${r.transitCount || 0}次${r.hasSubway ? '(含地铁)' : ''}`;

        const overBudgetStyle = r.overBudget ? 'opacity:0.5;' : '';
        const overBudgetTag = r.overBudget ? '<span style="color:#f5222d;font-size:11px;">超预算</span>' : '';

        return `
            <tr class="${isBest ? 'best-row' : ''}" data-name="${r.name}" style="${overBudgetStyle}">
                <td class="rank-cell">${isBest ? '<span class="best-badge">🏆</span>' : (index + 1)}</td>
                <td>${r.name}</td>
                <td>${modeTag}${directTag}</td>
                <td>${durationDisplay}</td>
                <td>${transferInfo}</td>
                <td>${r.painIndex}</td>
                <td>¥${r.monthlyTransportCost}</td>
                <td class="ref-rent">~¥${estimatedRent}</td>
                <td>
                    <input type="number" class="rent-input" placeholder="租金"
                        value="${rent}" data-name="${r.name}" onchange="updateRent(this)">
                </td>
                <td>¥${r.totalCost || '—'} ${overBudgetTag}</td>
                <td>${r.comprehensiveScore ? r.comprehensiveScore.toFixed(2) : '—'}</td>
            </tr>
        `;
    }).join('');
}

function showEdgeDuration(name) {
    const area = evaluationResults.find(r => r.name === name);
    if (area && !area.hasEdgeData) {
        showStatus(`正在计算 ${name} 的边缘通勤时间...`);
        calculateEdgeDuration(area).then(() => {
            showStatus(`${name} 边缘时间计算完成`);
        });
    }
}

function updateRent(input) {
    const name = input.dataset.name;
    const rent = parseFloat(input.value) || 0;

    const result = evaluationResults.find(r => r.name === name);
    if (result) {
        result.rent = rent;
        calculateComprehensiveScore(evaluationResults);
        renderTable(evaluationResults);
        drawOverlays(evaluationResults);
        saveToLocalStorage();
    }
}

function highlightTableRow(area) {
    const rows = document.querySelectorAll('#result-body tr');
    rows.forEach(row => {
        row.classList.remove('active-row');
        if (row.dataset.name === area.name) {
            row.classList.add('active-row');
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    districtOverlays.forEach(p => {
        const data = p.getExtData();
        if (data && data.name === area.name) {
            p.setOptions({ fillOpacity: 0.8, strokeWeight: 3 });
            setTimeout(() => {
                p.setOptions({
                    fillOpacity: data.boundaries && data.boundaries.length > 0 ? 0.5 : 0.4,
                    strokeWeight: data.boundaries && data.boundaries.length > 0 ? 1 : 2
                });
            }, 2000);
        }
    });
}

function getStorageKey() {
    const companyAddress = document.getElementById('company-address').value;
    const transportType = document.getElementById('transport-type').value;
    const key = `renting_${companyAddress}_${transportType}`;
    return key.replace(/[^\x00-\x7F]/g, '_').substring(0, 100);
}

function saveToLocalStorage() {
    if (evaluationResults.length === 0) return;
    try {
        localStorage.setItem(getStorageKey(), JSON.stringify({
            timestamp: Date.now(),
            results: evaluationResults
        }));
    } catch (e) { console.warn('LocalStorage 存储失败:', e); }
}

function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem(getStorageKey());
        return data ? JSON.parse(data) : null;
    } catch (e) { return null; }
}

function clearAllRent() {
    evaluationResults.forEach(r => { r.rent = 0; });
    calculateComprehensiveScore(evaluationResults);
    renderTable(evaluationResults);
    drawOverlays(evaluationResults);
    saveToLocalStorage();
}

function exportCSV() {
    if (evaluationResults.length === 0) return;
    const headers = ['排名', '区域名称', '通勤方式', '单程耗时(分钟)', '换乘次数', '痛苦指数', '月交通费', '参考月租', '月租金', '月总成本', '综合评分'];
    const rows = evaluationResults.map((r, i) => [
        i + 1, r.name, r.commuteMode || '', r.durationMinutes,
        r.transitCount || 0, r.painIndex, r.monthlyTransportCost,
        r.estimatedRent || '', r.rent || 0,
        r.totalCost || 0, r.comprehensiveScore || 0
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `租房评估_${new Date().toLocaleDateString()}.csv`;
    link.click();
}

function updateProgress(percent, text) {
    document.getElementById('progress-bar').style.width = percent + '%';
    document.getElementById('progress-text').textContent = text || `已完成 ${percent}%`;
}

function showStatus(message) {
    const el = document.getElementById('status-message');
    el.textContent = message;
    el.style.display = 'block';
}

function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
