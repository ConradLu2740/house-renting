// =============================================
// 高德地图 API 相关功能
// =============================================

function getEstimatedRent(districtName, areaSize) {
    const pricePerSqm = RENT_DATA[districtName] || 50;
    return Math.round(pricePerSqm * (areaSize || 30));
}

function getDistance(lng1, lat1, lng2, lat2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCompanyDistrict(AMap) {
    return new Promise((resolve) => {
        const geocoder = new AMap.Geocoder();
        geocoder.getAddress(companyPosition, (status, result) => {
            if (status === 'complete' && result.regeocode) {
                const ac = result.regeocode.addressComponent;
                companyDistrict = {
                    adcode: ac.adcode || '',
                    name: ac.district || ac.city || ac.province || '',
                    province: ac.province || '',
                    city: ac.city || ac.district || ac.province || 'unknown'
                };
                console.log('公司所在区划:', companyDistrict);
                resolve(companyDistrict);
            } else {
                resolve(null);
            }
        });
    });
}

async function getSearchAreas(AMap) {
    if (!companyPosition || !companyDistrict) {
        throw new Error('请先选择公司地址');
    }

    showStatus('正在获取行政区边界...');
    console.log('开始获取区划:', companyDistrict.name);

    return new Promise((resolve, reject) => {
        AMap.plugin('AMap.DistrictSearch', () => {
            const districtSearch = new AMap.DistrictSearch({
                level: 'district',
                subdistrict: 3,
                extensions: 'all'
            });

            const cityName = companyDistrict.city || companyDistrict.name;
            districtSearch.search(cityName, (status, result) => {
                console.log('DistrictSearch 返回:', status, result);

                if (status === 'complete' && result.districtList) {
                    const areas = [];
                    const searchRadius = parseInt(document.getElementById('search-radius').value) * 1000;

                    function processDistrict(district, depth) {
                        if (district.districtList && depth < 3) {
                            district.districtList.forEach(sub => processDistrict(sub, depth + 1));
                        }

                        if (district.level === 'street' && district.center) {
                            const dist = getDistance(
                                companyPosition[0], companyPosition[1],
                                district.center.lng, district.center.lat
                            );

                            if (dist <= searchRadius) {
                                areas.push({
                                    name: district.name,
                                    adcode: district.adcode,
                                    center: district.center,
                                    boundaries: district.boundaries || [],
                                    distance: Math.round(dist)
                                });
                            }
                        }
                    }

                    result.districtList.forEach(d => processDistrict(d, 0));

                    areas.sort((a, b) => a.distance - b.distance);

                    console.log('搜索范围内街道数量:', areas.length);

                    if (areas.length > 80) {
                        showStatus(`⚠️ 检测到 ${areas.length} 个区域，仅评估最近的80个`);
                        areas.length = 80;
                    }

                    resolve(areas);
                } else {
                    reject(new Error('获取行政区划失败: ' + status));
                }
            });
        });
    });
}

function initAutoComplete(AMap) {
    const addressInput = document.getElementById('company-address');
    const dropdown = document.getElementById('address-dropdown');

    function showDropdown(results) {
        if (!results || results.length === 0) {
            dropdown.classList.remove('show');
            return;
        }
        dropdown.innerHTML = results.map(poi => `
            <div class="autocomplete-item" data-location="${poi.location.lng},${poi.location.lat}" data-name="${poi.name}" data-address="${poi.address || poi.name}">
                <div class="autocomplete-item-name">${poi.name}</div>
                <div class="autocomplete-item-address">${poi.address || ''}</div>
            </div>
        `).join('');
        dropdown.classList.add('show');
    }

    function hideDropdown() { dropdown.classList.remove('show'); }

    function selectAddress(item) {
        const name = item.dataset.name;
        const location = item.dataset.location.split(',');
        const lng = parseFloat(location[0]);
        const lat = parseFloat(location[1]);

        companyPosition = [lng, lat];
        addressInput.value = name;

        if (companyMarker) companyMarker.setMap(null);

        companyMarker = new AMap.Marker({
            position: companyPosition,
            title: name,
            content: '<div style="background:#1677ff;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(22,119,255,0.5);"></div>',
            offset: new AMap.Pixel(-10, -10)
        });

        companyMarker.setMap(map);
        map.setFitView(companyMarker);

        document.getElementById('company-status').style.display = 'flex';
        document.getElementById('company-name').textContent = name;

        getCompanyDistrict(AMap);
        hideDropdown();
    }

    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (item) selectAddress(item);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-container')) hideDropdown();
    });

    addressInput.addEventListener('input', debounce(() => {
        const keyword = addressInput.value.trim();
        if (keyword.length >= 2) {
            AMap.plugin('AMap.PlaceSearch', () => {
                const placeSearch = new AMap.PlaceSearch({
                    city: '全国', pageSize: 8, pageIndex: 1
                });
                placeSearch.search(keyword, (status, result) => {
                    if (status === 'complete' && result.poiList && result.poiList.pois) {
                        showDropdown(result.poiList.pois);
                    } else {
                        showDropdown([]);
                    }
                });
            });
        } else {
            hideDropdown();
        }
    }, 400));
}

function initMap() {
    AMapLoader.load({
        key: '782c461bdfca3fd424be7118eae3cd72',
        version: '2.0',
        plugins: AMAP_PLUGINS
    }).then((AMap) => {
        window.AMap = AMap;

        map = new AMap.Map('amap-container', {
            zoom: 11,
            center: [120.15, 30.28],
            viewMode: '2D',
            mapStyle: 'amap://styles/whitesmoke'
        });

        initAutoComplete(AMap);

        infoWindow = new AMap.InfoWindow({
            offset: new AMap.Pixel(0, -30)
        });

        console.log('高德地图初始化完成');
    }).catch(err => {
        console.error('地图加载失败:', err);
        showStatus('地图加载失败，请检查网络和 Key 配置');
    });
}
