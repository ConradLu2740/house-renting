// =============================================
// 全局变量与常量
// =============================================

let map = null;
let companyMarker = null;
let companyPosition = null;
let companyDistrict = null;
let districtOverlays = [];
let allAreas = [];
let evaluationResults = [];
let isEvaluating = false;
let isCancelled = false;
let infoWindow = null;

const AMAP_PLUGINS = [
    'AMap.Autocomplete',
    'AMap.Geocoder',
    'AMap.PlaceSearch',
    'AMap.DistrictSearch',
    'AMap.Transfer',
    'AMap.Driving',
    'AMap.Polygon',
    'AMap.Circle',
    'AMap.InfoWindow'
];

const RENT_DATA = {
    '上城区': 85, '拱墅区': 75, '西湖区': 80, '滨江区': 90,
    '萧山区': 55, '余杭区': 60, '临平区': 55, '钱塘区': 50,
    '富阳区': 40, '临安区': 35, '桐庐县': 30, '淳安县': 25,
    '建德市': 30,
    '海淀区': 95, '朝阳区': 100, '西城区': 110, '东城区': 105,
    '丰台区': 75, '石景山区': 70, '通州区': 55, '大兴区': 50,
    '浦东新区': 90, '黄浦区': 110, '静安区': 105, '徐汇区': 95,
    '天河区': 85, '越秀区': 80, '番禺区': 55, '白云区': 50,
    '南山区': 95, '福田区': 100, '宝安区': 60, '龙岗区': 50
};
