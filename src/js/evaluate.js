// =============================================
// 通勤评估引擎
// =============================================

async function evaluateArea(AMap, area, options) {
    const { transportType, hourlyWage, maxCommuteMinutes } = options;

    let centerPoint = area.center;
    if (centerPoint && !Array.isArray(centerPoint)) {
        centerPoint = [centerPoint.lng, centerPoint.lat];
    }

    if (!centerPoint) {
        return { ...area, success: false, error: '无法获取中心点' };
    }

    let result;
    if (transportType === 'transit') {
        result = await evaluateTransitRoute(AMap, centerPoint, area, options);
    } else {
        result = await evaluateDrivingRoute(AMap, centerPoint, area, options);
    }

    if (result.success && area.boundaries && area.boundaries.length > 0) {
        result.hasEdgeData = false;
        result.edgeDurationMin = result.durationMinutes;
        result.edgeDurationMax = result.durationMinutes;
    }

    return result;
}

async function evaluateTransitRoute(AMap, startPoint, area, options) {
    const { hourlyWage, maxCommuteMinutes } = options;

    return new Promise((resolve) => {
        const cityName = companyDistrict.city || companyDistrict.name;

        if (!cityName || cityName === 'unknown') {
            resolve({ ...area, success: false, error: '城市信息无效' });
            return;
        }

        const start = Array.isArray(startPoint) ? startPoint : [startPoint.lng, startPoint.lat];
        const end = Array.isArray(companyPosition) ? companyPosition : [companyPosition.lng, companyPosition.lat];

        const transfer = new AMap.Transfer({
            city: cityName,
            cityd: cityName,
            strategy: 5
        });

        transfer.search(start, end, (status, result) => {
            if (status === 'error' || !result || !result.plans) {
                resolve({ ...area, success: false, error: '公交路线规划失败' });
                return;
            }

            if (status === 'complete' && result.plans && result.plans.length > 0) {
                const plan = result.plans[0];
                const durationSeconds = plan.time || 0;
                const durationMinutes = durationSeconds / 60;

                let transitCount = 0;
                let totalWalkDistance = 0;
                let hasSubway = false;
                let busCount = 0;

                if (plan.segments) {
                    plan.segments.forEach((segment) => {
                        if (segment.transit_mode === 'WALK') {
                            totalWalkDistance += segment.distance || 0;
                        } else {
                            transitCount++;
                            if (segment.transit && segment.transit.lines && segment.transit.lines.length > 0) {
                                const lineName = segment.transit.lines[0].name || '';
                                if (lineName.includes('地铁') || lineName.includes('号线') || lineName.includes('Metro')) {
                                    hasSubway = true;
                                } else {
                                    busCount++;
                                }
                            } else {
                                busCount++;
                            }
                        }
                    });
                }

                let cost = plan.cost || 0;

                let painIndex = 0;
                painIndex += busCount * 12;
                painIndex += hasSubway ? 0 : 10;
                painIndex += (transitCount > 1 ? (transitCount - 1) * 8 : 0);
                painIndex += totalWalkDistance > 1000 ? 15 : totalWalkDistance / 100 * 5;
                if (transitCount === 1 && hasSubway && totalWalkDistance < 800) {
                    painIndex -= 10;
                }
                painIndex = Math.max(0, painIndex);

                const monthlyCommuteCost = (durationMinutes / 60) * hourlyWage * 21.75 * 2;
                const monthlyTransportCost = cost * 21.75 * 2;

                if (durationMinutes > maxCommuteMinutes) {
                    resolve({
                        ...area, success: false,
                        error: `耗时${Math.round(durationMinutes)}分钟超过上限`
                    });
                    return;
                }

                resolve({
                    ...area, success: true,
                    durationMinutes: Math.round(durationMinutes),
                    transitCount, busCount, hasSubway,
                    walkDistance: Math.round(totalWalkDistance),
                    cost, painIndex: Math.round(painIndex * 10) / 10,
                    monthlyCommuteCost: Math.round(monthlyCommuteCost),
                    monthlyTransportCost: Math.round(monthlyTransportCost),
                    commuteMode: hasSubway ? '地铁' : '公交'
                });
            } else {
                resolve({ ...area, success: false, error: '公交路线规划无结果' });
            }
        });
    });
}

async function evaluateDrivingRoute(AMap, startPoint, area, options) {
    const { hourlyWage, maxCommuteMinutes } = options;

    return new Promise((resolve) => {
        const cityName = companyDistrict.city || companyDistrict.name;
        const start = Array.isArray(startPoint) ? startPoint : [startPoint.lng, startPoint.lat];
        const end = Array.isArray(companyPosition) ? companyPosition : [companyPosition.lng, companyPosition.lat];

        const driving = new AMap.Driving({
            city: cityName
        });

        driving.search(start, end, (status, result) => {
            if (status === 'complete' && result.plans && result.plans.length > 0) {
                const plan = result.plans[0];
                const durationSeconds = plan.time || 0;
                const durationMinutes = durationSeconds / 60;
                const distance = plan.distance || 0;

                let cost = plan.tolls || 0;

                const avgTimePerKm = durationMinutes / (distance / 1000 || 1);
                const congestion = avgTimePerKm > 3 ? 20 : (avgTimePerKm > 2 ? 10 : 0);
                let painIndex = (durationMinutes / 30) * 10 + congestion;

                const monthlyCommuteCost = (durationMinutes / 60) * hourlyWage * 21.75 * 2;
                const monthlyTransportCost = cost * 21.75 * 2;

                if (durationMinutes > maxCommuteMinutes) {
                    resolve({
                        ...area, success: false,
                        error: `耗时${Math.round(durationMinutes)}分钟超过上限`
                    });
                    return;
                }

                resolve({
                    ...area, success: true,
                    durationMinutes: Math.round(durationMinutes),
                    distance: Math.round(distance),
                    cost, painIndex: Math.round(painIndex * 10) / 10,
                    monthlyCommuteCost: Math.round(monthlyCommuteCost),
                    monthlyTransportCost: Math.round(monthlyTransportCost),
                    commuteMode: '驾车'
                });
            } else {
                resolve({ ...area, success: false, error: '驾车路线规划失败' });
            }
        });
    });
}

async function evaluateAllAreas(AMap, areas, options) {
    const results = [];
    const delayMs = 500;

    for (let i = 0; i < areas.length; i++) {
        if (isCancelled || !isEvaluating) break;

        const area = areas[i];
        const result = await evaluateArea(AMap, area, options);
        results.push(result);

        const progress = Math.round((results.length / areas.length) * 100);
        updateProgress(progress, `正在评估 ${results.length}/${areas.length} 个区域...`);
        showStatus(`已评估 ${results.length}/${areas.length} 个区域`);

        if (i < areas.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return results;
}

function filterAndSortResults(results, limit) {
    const successResults = results.filter(r => r.success);
    successResults.sort((a, b) => a.painIndex - b.painIndex);
    if (limit > 0) return successResults.slice(0, limit);
    return successResults;
}

function calculateComprehensiveScore(results) {
    if (results.length === 0) return;

    const rentArea = parseFloat(document.getElementById('rent-area').value) || 30;
    const budgetLimit = parseFloat(document.getElementById('budget-limit').value) || 0;

    let minTotalCost = Infinity, maxTotalCost = -Infinity;
    let minPain = Infinity, maxPain = -Infinity;

    results.forEach(r => {
        if (!r.estimatedRent) {
            const districtName = companyDistrict ? companyDistrict.name : '';
            r.estimatedRent = getEstimatedRent(districtName, rentArea);
        }
        const rent = r.rent || r.estimatedRent;
        r.effectiveRent = rent;
        r.totalCost = rent + r.monthlyTransportCost;

        if (r.hasSubway && r.transitCount === 1 && r.walkDistance < 800) {
            r.directSubwayBonus = true;
            r.painIndex = Math.max(0, r.painIndex - 5);
        }

        if (r.totalCost < minTotalCost) minTotalCost = r.totalCost;
        if (r.totalCost > maxTotalCost) maxTotalCost = r.totalCost;
        if (r.painIndex < minPain) minPain = r.painIndex;
        if (r.painIndex > maxPain) maxPain = r.painIndex;
    });

    const costRange = maxTotalCost - minTotalCost || 1;
    const painRange = maxPain - minPain || 1;

    results.forEach(r => {
        const costNorm = (r.totalCost - minTotalCost) / costRange;
        const painNorm = (r.painIndex - minPain) / painRange;
        r.comprehensiveScore = Math.round((costNorm * 0.7 + painNorm * 0.3) * 100) / 100;
        r.overBudget = budgetLimit > 0 && r.totalCost > budgetLimit;
    });

    results.sort((a, b) => a.comprehensiveScore - b.comprehensiveScore);
}

async function calculateEdgeDuration(area) {
    if (!area.boundaries || area.boundaries.length === 0 || area.hasEdgeData) {
        return;
    }

    const transportType = document.getElementById('transport-type').value;
    const options = {
        transportType,
        hourlyWage: parseFloat(document.getElementById('hourly-wage').value) || 50,
        maxCommuteMinutes: parseFloat(document.getElementById('max-commute').value) || 60
    };

    const allPoints = [];
    area.boundaries.forEach(ring => {
        ring.forEach(point => allPoints.push(point));
    });

    if (allPoints.length === 0) return;

    const distances = allPoints.map(p => ({
        point: p,
        dist: getDistance(companyPosition[0], companyPosition[1], p.lng, p.lat)
    }));

    distances.sort((a, b) => b.dist - a.dist);
    const samplePoints = distances.slice(0, 2).map(d => [d.point.lng, d.point.lat]);

    let maxDuration = area.durationMinutes;

    for (const point of samplePoints) {
        let result;
        if (transportType === 'transit') {
            result = await evaluateTransitRoute(window.AMap, point, {}, options);
        } else {
            result = await evaluateDrivingRoute(window.AMap, point, {}, options);
        }

        if (result.success && result.durationMinutes > maxDuration) {
            maxDuration = result.durationMinutes;
        }

        await new Promise(resolve => setTimeout(resolve, 300));
    }

    area.edgeDurationMin = area.durationMinutes;
    area.edgeDurationMax = maxDuration;
    area.hasEdgeData = true;

    renderTable(evaluationResults);
}
