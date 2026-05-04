// =============================================
// 主流程与事件绑定
// =============================================

async function startEvaluation() {
    if (isEvaluating) return;

    if (!companyPosition) {
        showStatus('请先输入并选择公司地址');
        return;
    }

    isEvaluating = true;
    isCancelled = false;

    const btn = document.getElementById('start-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    btn.style.display = 'none';
    cancelBtn.style.display = 'inline-block';

    document.getElementById('progress-container').style.display = 'block';
    updateProgress(0, '准备中...');

    try {
        const transportType = document.getElementById('transport-type').value;
        const hourlyWage = parseFloat(document.getElementById('hourly-wage').value) || 50;
        const maxCommute = parseFloat(document.getElementById('max-commute').value) || 60;
        const resultLimit = parseInt(document.getElementById('result-limit').value) || 0;

        const options = { transportType, hourlyWage, maxCommuteMinutes: maxCommute };

        if (!companyDistrict) {
            updateProgress(5, '正在定位公司区划...');
            await getCompanyDistrict(AMap);
            if (!companyDistrict) {
                throw new Error('无法获取公司所在区划，请尝试重新选择地址');
            }
        }

        if (isCancelled) throw new Error('评估已取消');

        updateProgress(10, '正在搜索范围内街道...');
        allAreas = await getSearchAreas(AMap);

        if (isCancelled) throw new Error('评估已取消');

        if (allAreas.length === 0) {
            throw new Error('未找到附近街道，请检查公司地址或扩大搜索范围');
        }

        showStatus(`共找到 ${allAreas.length} 个街道，开始评估...`);

        const results = await evaluateAllAreas(AMap, allAreas, options);

        if (isCancelled) throw new Error('评估已取消');

        updateProgress(90, '正在处理结果...');

        evaluationResults = filterAndSortResults(results, resultLimit);

        if (evaluationResults.length === 0) {
            throw new Error('没有符合条件的区域，请尝试增加最长通勤时间或扩大搜索范围');
        }

        const savedData = loadFromLocalStorage();
        if (savedData && savedData.results) {
            savedData.results.forEach(saved => {
                const current = evaluationResults.find(r => r.name === saved.name);
                if (current && saved.rent) current.rent = saved.rent;
            });
        }

        calculateComprehensiveScore(evaluationResults);

        updateProgress(95, '正在绘制地图...');

        drawOverlays(evaluationResults);
        renderTable(evaluationResults);

        updateProgress(100, '评估完成！');

        saveHistory();

        document.getElementById('export-btn').disabled = false;
        document.getElementById('clear-btn').disabled = false;

        showStatus(`评估完成！共 ${evaluationResults.length} 个候选区域，绿色区域为最优选择`);

    } catch (error) {
        console.error('评估中断/失败:', error);
        if (error.message === '评估已取消') {
            showStatus('评估已取消');
        } else {
            showStatus('评估失败: ' + error.message);
        }
    } finally {
        isEvaluating = false;
        isCancelled = false;
        cancelBtn.style.display = 'none';
        btn.style.display = 'inline-block';
        btn.disabled = false;
        btn.textContent = '开始区域覆盖评估';
        setTimeout(() => {
            document.getElementById('progress-container').style.display = 'none';
        }, 2000);
    }
}

function cancelEvaluation() {
    if (isEvaluating) {
        isCancelled = true;
        showStatus('正在取消评估...');
    }
}

// =============================================
// 历史记录管理
// =============================================

const MAX_HISTORY = 10;

function getFullAreaName(area) {
    if (!companyDistrict) return area.name;
    return area.name;
}

function saveHistory() {
    if (evaluationResults.length === 0) return;
    try {
        const histories = JSON.parse(localStorage.getItem('renting_history') || '[]');
        histories.unshift({
            id: Date.now(),
            company: document.getElementById('company-address').value,
            companyLng: companyPosition ? companyPosition[0] : null,
            companyLat: companyPosition ? companyPosition[1] : null,
            date: new Date().toLocaleString('zh-CN'),
            transportType: document.getElementById('transport-type').value,
            maxCommute: document.getElementById('max-commute').value,
            searchRadius: document.getElementById('search-radius').value,
            results: evaluationResults.map(r => ({
                name: r.name,
                durationMinutes: r.durationMinutes,
                painIndex: r.painIndex,
                monthlyTransportCost: r.monthlyTransportCost,
                estimatedRent: r.estimatedRent,
                rent: r.rent,
                totalCost: r.totalCost,
                comprehensiveScore: r.comprehensiveScore,
                commuteMode: r.commuteMode,
                hasSubway: r.hasSubway,
                directSubwayBonus: r.directSubwayBonus,
                center: r.center,
                boundaries: r.boundaries,
                transitCount: r.transitCount
            }))
        });

        if (histories.length > MAX_HISTORY) {
            histories.length = MAX_HISTORY;
        }

        localStorage.setItem('renting_history', JSON.stringify(histories));
        renderHistoryPanel();
    } catch (e) {
        console.warn('历史记录保存失败:', e);
    }
}

function loadHistories() {
    try {
        return JSON.parse(localStorage.getItem('renting_history') || '[]');
    } catch (e) {
        return [];
    }
}

function restoreHistory(historyId) {
    const histories = loadHistories();
    const history = histories.find(h => h.id === historyId);
    if (!history) return;

    if (history.companyLng && history.companyLat) {
        companyPosition = [history.companyLng, history.companyLat];

        if (companyMarker) companyMarker.setMap(null);
        companyMarker = new AMap.Marker({
            position: companyPosition,
            content: '<div style="background:#1677ff;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(22,119,255,0.5);"></div>',
            offset: new AMap.Pixel(-10, -10)
        });
        companyMarker.setMap(map);
        map.setFitView(companyMarker);

        document.getElementById('company-address').value = history.company;
        document.getElementById('transport-type').value = history.transportType;
        document.getElementById('max-commute').value = history.maxCommute;
        document.getElementById('search-radius').value = history.searchRadius;

        const AMap = window.AMap;
        if (AMap) {
            getCompanyDistrict(AMap).then(() => {
                if (companyDistrict && history.results[0]) {
                    history.results[0].estimatedRent = getEstimatedRent(
                        companyDistrict.name,
                        parseFloat(document.getElementById('rent-area').value) || 30
                    );
                }
            });
        }
    }

    evaluationResults = history.results.map(r => ({
        ...r,
        boundaries: r.boundaries || [],
        hasEdgeData: false
    }));

    calculateComprehensiveScore(evaluationResults);
    drawOverlays(evaluationResults);
    renderTable(evaluationResults);

    document.getElementById('export-btn').disabled = false;
    document.getElementById('clear-btn').disabled = false;

    showStatus(`已恢复 ${history.date} 的评估结果 (${evaluationResults.length} 个区域)`);
}

function deleteHistory(historyId) {
    const histories = loadHistories();
    const filtered = histories.filter(h => h.id !== historyId);
    localStorage.setItem('renting_history', JSON.stringify(filtered));
    renderHistoryPanel();
}

function clearAllHistory() {
    localStorage.removeItem('renting_history');
    renderHistoryPanel();
}

function renderHistoryPanel() {
    const panel = document.getElementById('history-list');
    if (!panel) return;
    const histories = loadHistories();

    if (histories.length === 0) {
        panel.innerHTML = '<div style="color:#999;font-size:12px;padding:12px;text-align:center;">暂无历史记录</div>';
        return;
    }

    panel.innerHTML = histories.map(h => {
        const best = h.results && h.results.length > 0 ? h.results[0] : null;
        const bestInfo = best
            ? `🏆 ${best.name} · ${best.durationMinutes}分钟 · ¥${best.totalCost}/月 · 评分${best.comprehensiveScore}`
            : '无数据';

        return `
            <div class="history-item" onclick="restoreHistory(${h.id})">
                <div class="history-item-header">
                    <span class="history-item-date">${h.date}</span>
                    <button class="history-item-delete" onclick="event.stopPropagation();deleteHistory(${h.id})" title="删除">✕</button>
                </div>
                <div class="history-item-company">📍 ${h.company}</div>
                <div class="history-item-summary">${bestInfo}</div>
            </div>
        `;
    }).join('');
}

// =============================================
// 初始化
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    initMap();

    document.getElementById('start-btn').addEventListener('click', startEvaluation);
    document.getElementById('cancel-btn').addEventListener('click', cancelEvaluation);
    document.getElementById('export-btn').addEventListener('click', exportCSV);
    document.getElementById('clear-btn').addEventListener('click', clearAllRent);

    document.getElementById('result-body').addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (row && row.dataset.name) {
            const area = evaluationResults.find(r => r.name === row.dataset.name);
            if (area) {
                const center = area.center;
                if (center) {
                    const pos = Array.isArray(center) ? center : [center.lng, center.lat];
                    map.setZoomAndCenter(14, pos);
                }
                highlightTableRow(area);
            }
        }
    });

    renderHistoryPanel();
});
