import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Capacitor } from "@capacitor/core";
import axios from "src/api/axios";
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
    FaSearch,
    FaPhoneAlt,
    FaMapMarkerAlt,
    FaMap,
    FaList,
    FaSyncAlt, // 새로고침 아이콘 추가
} from "react-icons/fa";
import AppLoadingScreen from "src/componts/common/AppLoadingScreen";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import { MdMyLocation } from "react-icons/md";

// Leaflet 기본 마커 아이콘 깨짐 방지
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

const defaultCenter = [35.8714, 128.6014]; // 대구 중심
const DEFAULT_ZOOM   = 13;
const LIST_PAGE_SIZE = 10;

/** 일반 보건소 마커 - 파란색 */
const defaultIcon = new L.Icon({
    iconUrl:       markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl:     markerShadow,
    iconSize:    [25, 41],
    iconAnchor:  [12, 41],
    popupAnchor: [1, -34],
    shadowSize:  [41, 41],
});

/** 선택된 보건소 마커 (클릭시 크게 강조) */
const selectedIcon = new L.Icon({
    iconUrl:     markerIcon2x,
    shadowUrl:   markerShadow,
    iconSize:    [30, 50],
    iconAnchor:  [15, 50],
    popupAnchor: [1, -46],
    shadowSize:  [50, 50],
});

/** 현재 내 위치 마커 - 보건소 마커와 같은 디자인의 빨간색 버전 */
const myLocationIcon = L.divIcon({
    html: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="40" height="50">
            <ellipse cx="16" cy="38" rx="8" ry="3" fill="rgba(0,0,0,0.2)" />
            <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26c0-8.84-7.16-16-16-16z" fill="#ef4444" stroke="white" stroke-width="1.5"/>
            <circle cx="16" cy="16" r="6" fill="white" />
        </svg>`,
    className: "",
    iconSize: [32, 42],
    iconAnchor: [16, 42], // 뾰족한 하단 끝점이 좌표에 오도록 설정
    popupAnchor: [0, -40],
});

// flyTo.key 가 바뀔 때마다 지도 이동
function MoveMap({ flyTo }) {
    const map = useMap();

    useEffect(() => {
        if (flyTo?.center) {
            // setView -> flyTo로 변경
            map.flyTo(flyTo.center, flyTo.zoom, {
                animate: true,
                duration: 1.5,      // 이동 시간 (초)
                easeLinearity: 0.25 // 애니메이션 감속의 부드러움 (낮을수록 부드러움)
            });
        }
    }, [flyTo, map]);
    return null;
}

function MapBoundsTracker({ onBoundsChange }) {
    const map           = useRef(useMap()).current;
    const prevBoundsRef = useRef(null);

    useEffect(() => {
        const update = () => {
            const b    = map.getBounds();
            const bStr = JSON.stringify({ sw: b.getSouthWest(), ne: b.getNorthEast() });

            if (prevBoundsRef.current !== bStr) {
                prevBoundsRef.current = bStr;
                onBoundsChange(b);
            }
        };

        map.on("moveend", update);
        map.on("zoomend", update);
        update();

        return () => {
            map.off("moveend", update);
            map.off("zoomend", update);
        };
    }, [map, onBoundsChange]);

    return null;
}

// 두 지점 사이의 거리를 계산하는 하버사인 공식 (단위: km)
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export default function Bogunso() {
    const [items,         setItems]         = useState([]);
    const [loading,       setLoading]       = useState(true);
    const [err,           setErr]           = useState("");
    const [search,        setSearch]        = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [selected,      setSelected]      = useState(null);
    const [myLocation,    setMyLocation]    = useState(null);
    const [flyTo,         setFlyTo]         = useState({ center: defaultCenter, zoom: DEFAULT_ZOOM, key: 0 });
    const [activeTab,     setActiveTab]     = useState("map");
    const [mapBounds,     setMapBounds]     = useState(null);
    const [displayCount,  setDisplayCount]  = useState(LIST_PAGE_SIZE);
    const [lastSearchedBounds, setLastSearchedBounds] = useState(null);
    const [isMapMoved, setIsMapMoved] = useState(false);
    const [locating, setLocating] = useState(false);
    const [showLocationPrompt, setShowLocationPrompt] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");
    const scrollRef = useRef(null);

    useEffect(() => {
        fetchBogunsoList();
    }, []);

    // appliedSearch·탭 변경 시 목록 스크롤/페이지 초기화
    useEffect(() => {
        setDisplayCount(LIST_PAGE_SIZE);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [appliedSearch, activeTab]);

    // 보건소 목록 호출
    const fetchBogunsoList = async () => {
        try {
            setLoading(true);
            setErr("");
            const res  = await axios.get("/api/bogunso/list");
            const list = res?.data?.items ?? [];
            setItems(Array.isArray(list) ? list : []);
        } catch (e) {
            setErr(e?.response?.data?.detail || "보건소 목록을 불러오지 못했습니다.");
        } finally {
            setLoading(false);
        }
    };

    // 내 위치 요청
    const requestMyLocation = async (showAlert = false) => {
        setLocating(true);
        try {
            // 네이티브(iOS 앱)에서만 명시적 권한 요청.
            // 웹은 @capacitor/geolocation의 requestPermissions()가 미구현(throw)이라,
            // getCurrentPosition()을 바로 호출해 브라우저 권한 프롬프트를 띄운다.
            if (Capacitor.isNativePlatform()) {
                const permission = await Geolocation.requestPermissions();
                if (permission.location === "denied") {
                    if (showAlert) setAlertMsg("위치 권한이 거부되었습니다. 앱 설정에서 위치 권한을 허용한 뒤 다시 시도해주세요.");
                    return;
                }
            }
            const result = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
            const pos = [result.coords.latitude, result.coords.longitude];
            setMyLocation(pos);
            setFlyTo({ center: pos, zoom: 15, key: Date.now() });
            if (showAlert) setActiveTab("map");
        } catch (error) {
            if (!showAlert) return;
            const msg = error?.message ?? "";
            if (msg.includes("denied") || msg.includes("permission")) {
                setAlertMsg("위치 권한이 거부되었습니다. 앱 설정에서 위치 권한을 허용한 뒤 다시 시도해주세요.");
            } else if (msg.includes("timeout") || msg.includes("timed out")) {
                setAlertMsg("현재 위치 확인 시간이 초과되었습니다. 네트워크나 GPS 상태를 확인한 뒤 다시 시도해주세요.");
            } else {
                setAlertMsg("현재 위치를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.");
            }
        } finally {
            setLocating(false);
        }
    };

    const handleMyLocationClick = () => {
        if (myLocation) {
            setFlyTo({ center: myLocation, zoom: 15, key: Date.now() });
            setActiveTab("map");
            return;
        }

        setShowLocationPrompt(true);
    };

    const handleConfirmLocationPrompt = () => {
        setShowLocationPrompt(false);
        requestMyLocation(true);
    };

    // 검색
    const handleSearch = useCallback(() => {
        const keyword = search.trim();
        setAppliedSearch(keyword);

        if (!keyword) return;

        const matched = items.find((item) => {
            const name    = String(item.name    || "").toLowerCase();
            const address = String(item.address || "").toLowerCase();
            return name.includes(keyword.toLowerCase()) || address.includes(keyword.toLowerCase());
        });

        if (matched?.lat != null && matched?.lng != null) {
            setFlyTo({ center: [matched.lat, matched.lng], zoom: 12, key: Date.now() });
            setActiveTab("map");
        }
    }, [search, items]);

    const handleKeyDown = (e) => {
        if (e.key === "Enter") handleSearch();
    };

    // 보건소 선택
    const handleSelectBogunso = (item) => {
        if (item.lat == null || item.lng == null) return;
        setSelected(item);
        setFlyTo({ center: [item.lat, item.lng], zoom: 16, key: Date.now() });
        setActiveTab("map");
    };

    // 수정된 영역 감지
    const handleBoundsChange = useCallback((bounds) => {
        setMapBounds(bounds);

        // 초기 로딩 시 검색 기준 영역 설정
        if (!lastSearchedBounds) {
            setLastSearchedBounds(bounds);
        } else {
            // 이미 기준 영역이 있을 때 지도가 움직이면 버튼 노출
            setIsMapMoved(true);
        }
    }, [lastSearchedBounds]);

    // 추가된 지역 검색 실행
    const handleRegionSearch = () => {
        setLastSearchedBounds(mapBounds);
        setIsMapMoved(false);
        setDisplayCount(LIST_PAGE_SIZE);
    };

    // 무한 스크롤
    const handleScroll = ({ currentTarget: el }) => {
        if (el.scrollHeight - el.scrollTop <= el.clientHeight + 10) {
            setDisplayCount((prev) =>
                prev < visibleItems.length ? prev + LIST_PAGE_SIZE : prev
            );
        }
    };

    // 입력한 검색어가 포함된 항목만
    const filteredItems = useMemo(() => {
        const keyword = appliedSearch.trim().toLowerCase();
        if (!keyword) return items;

        return items.filter((item) => {
            const name    = String(item.name    || "").toLowerCase();
            const address = String(item.address || "").toLowerCase();
            return name.includes(keyword) || address.includes(keyword);
        });
    }, [items, appliedSearch]);

    const visibleItems = useMemo(() => {
        const targetBounds = lastSearchedBounds || mapBounds;
        if (!targetBounds) return [];

        const filtered = filteredItems.filter(
            (item) =>
                item.lat != null &&
                item.lng != null &&
                targetBounds.contains([item.lat, item.lng])
        );

        if (myLocation) {
            return [...filtered].sort((a, b) => {
                const distA = getDistance(myLocation[0], myLocation[1], a.lat, a.lng);
                const distB = getDistance(myLocation[0], myLocation[1], b.lat, b.lng);
                return distA - distB;
            });
        }

        return filtered;
    }, [filteredItems, lastSearchedBounds, mapBounds, myLocation]);

    /** 무한 스크롤 적용된 화면 출력 목록 */
    const displayedItems = useMemo(
        () => visibleItems.slice(0, displayCount),
        [visibleItems, displayCount]
    );

    // 렌더
    return (
        <div className="relative h-screen w-full overflow-hidden bg-white">

            {/* 상단 검색바 */}
            <div className="absolute top-16 left-0 z-[1000] w-full px-6">
                <div className="relative mx-auto max-w-md">
                    <button
                        type="button"
                        onClick={handleSearch}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-blue-500"
                    >
                        <FaSearch />
                    </button>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="보건소명 또는 주소 검색 후 Enter"
                        className="w-full rounded-full border-none bg-white py-4 pl-12 pr-5 shadow-2xl outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-blue-500"
                    />

                    {/* 이 지역 검색 버튼 */}
                    {isMapMoved && activeTab === "map" && (
                        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 transition-all">
                            <button
                                onClick={handleRegionSearch}
                                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-5 py-2.5 text-[13px] font-bold text-black-600 shadow-xl ring-1 ring-slate-200 transition hover:bg-blue-50 active:scale-95"
                            >
                                <FaSyncAlt size={12} className={isMapMoved ? "animate-spin-slow" : ""} />
                                이 지역 검색
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {loading && (
                <AppLoadingScreen overlay title="보건소 정보를 불러오고 있어요" />
            )}

            {!loading && err && (
                <div className="absolute top-28 left-1/2 z-[2000] -translate-x-1/2 rounded-full bg-red-50 px-6 py-2 text-sm font-medium text-red-600 shadow-lg">
                    {err}
                </div>
            )}

            {/* 메인 */}
            {!loading && !err && (
                <>
                    {/* 지도 탭  */}
                    {activeTab === "map" && (
                        <div className="h-full w-full">
                            <MapContainer
                                center={defaultCenter}
                                zoom={DEFAULT_ZOOM}
                                zoomControl={false}
                                scrollWheelZoom
                                className="h-full w-full z-0"
                            >
                                <MoveMap flyTo={flyTo} />
                                <MapBoundsTracker onBoundsChange={handleBoundsChange} />

                                <TileLayer
                                    attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />

                                {/* 보건소 마커 */}
                                {visibleItems.map((item) => (
                                    <Marker
                                        key={item.id}
                                        position={[item.lat, item.lng]}
                                        icon={selected?.id === item.id ? selectedIcon : defaultIcon}
                                        eventHandlers={{ click: () => setSelected(item) }}
                                    >
                                        <Popup closeButton={false}>
                                            <div className="min-w-[220px] py-1">
                                                <div className="mb-2 flex items-baseline gap-2">
                                                    <span className="text-base font-bold text-slate-900">{item.name || "보건소"}</span>
                                                    {myLocation && item.lat && (
                                                        <span className="text-xs font-semibold text-blue-500">
                                                            {getDistance(myLocation[0], myLocation[1], item.lat, item.lng).toFixed(1)}km
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mb-1 flex items-start gap-1.5 text-sm text-slate-600">
                                                    <FaMapMarkerAlt className="mt-0.5 shrink-0 text-rose-400" />
                                                    <span>{item.address || "주소 정보 없음"}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                                                        <FaPhoneAlt className="shrink-0 text-emerald-400" />
                                                        <span>{item.tel || "전화번호 정보 없음"}</span>
                                                    </div>
                                                    {item.tel && (
                                                        <a href={`tel:${item.tel}`} className="shrink-0 rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600 transition hover:bg-blue-600 hover:text-white">전화하기</a>
                                                    )}
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                ))}

                                {/* 내 위치 마커 */}
                                {myLocation && (
                                    <Marker position={myLocation} icon={myLocationIcon}>
                                        <Popup closeButton={false}>
                                            <p className="py-0.5 text-sm font-semibold text-slate-900">
                                                현재 내 위치
                                            </p>
                                        </Popup>
                                    </Marker>
                                )}
                            </MapContainer>
                        </div>
                    )}

                    {/* 목록 탭 */}
                    {activeTab === "list" && (
                        <div
                            ref={scrollRef}
                            onScroll={handleScroll}
                            className="absolute inset-0 z-[1001] bg-white pt-32 pb-20 overflow-y-auto px-6"
                        >
                            {/* 목록 헤더 */}
                            <div className="mb-6 flex items-center justify-between border-b pb-4">
                                <h2 className="text-xl font-bold text-slate-900">지도 내 보건소</h2>
                                <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-600">
                                    {visibleItems.length}개
                                </span>
                            </div>

                            {/* 빈 상태 */}
                            {visibleItems.length === 0 && (
                                <div className="py-20 text-center text-slate-500">
                                    {appliedSearch ? (
                                        <>
                                            <span className="font-bold text-blue-500">"{appliedSearch}"</span>
                                            {" "}검색 결과가 현재 지도 범위에 없습니다.
                                            <br />
                                            지도를 이동하거나 축소해 보세요.
                                        </>
                                    ) : mapBounds ? (
                                        <>
                                            현재 지도 범위에 보건소가 없습니다.
                                            <br />
                                            지도를 이동하거나 축소해 보세요.
                                        </>
                                    ) : (
                                        "지도 탭을 먼저 열어주세요."
                                    )}
                                </div>
                            )}

                            {/* 목록 카드 */}
                            <div className="flex flex-col gap-4">
                                {displayedItems.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleSelectBogunso(item)}
                                        className={`group cursor-pointer rounded-3xl border bg-white p-6 transition-all hover:border-blue-300 hover:shadow-lg ${
                                            selected?.id === item.id
                                                ? "border-blue-400 shadow-md"
                                                : "border-slate-200"
                                        }`}
                                    >
                                        <div className="flex items-baseline gap-3">
                                            <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600">
                                                {item.name || "보건소"}
                                            </h3>
                                            {myLocation && item.lat && (
                                                <span className="text-sm font-bold text-blue-500">
                                                    {getDistance(myLocation[0], myLocation[1], item.lat, item.lng).toFixed(1)}km
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-3 space-y-2">
                                            <div className="flex items-start gap-2 text-[15px] leading-snug text-slate-600">
                                                <FaMapMarkerAlt className="mt-1 shrink-0 text-rose-400" />
                                                <span>{item.address || "주소 정보 없음"}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 text-[15px] text-slate-600">
                                                <div className="flex items-center gap-2">
                                                    <FaPhoneAlt className="shrink-0 text-emerald-400" />
                                                    <span>{item.tel || "전화번호 정보 없음"}</span>
                                                </div>
                                                {item.tel && (
                                                    <a href={`tel:${item.tel}`} onClick={(e) => e.stopPropagation()} className="shrink-0 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 shadow-sm transition hover:bg-blue-600 hover:text-white">전화하기</a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* 더보기 인디케이터 */}
                                {displayCount < visibleItems.length && (
                                    <div className="py-4 text-center text-sm text-slate-400">
                                        스크롤하여 더보기...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 내 위치 버튼  */}
                    <button
                        type="button"
                        onClick={handleMyLocationClick}
                        title="내 위치로 이동"
                        disabled={locating}
                        className="absolute bottom-16 right-4 z-[1002] flex h-14 w-14 items-center justify-center rounded-full bg-white text-blue-600 shadow-2xl ring-1 ring-slate-100 transition-all hover:scale-110 active:scale-95"
                    >
                        {locating ? (
                            <AiOutlineLoading3Quarters size={24} className="animate-spin" />
                        ) : (
                            <MdMyLocation size={24} />
                        )}
                    </button>

                    {/* 지도/목록 탭 버튼  */}
                    <div className="absolute bottom-16 left-1/2 z-[1002] flex -translate-x-1/2 gap-2 rounded-full bg-slate-900/80 p-1.5 backdrop-blur-md shadow-2xl">
                        <button
                            onClick={() => setActiveTab("map")}
                            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${
                                activeTab === "map" ? "bg-white text-slate-900 shadow-md" : "text-white hover:bg-white/10"
                            }`}
                        >
                            <FaMap /> 지도
                        </button>
                        <button
                            onClick={() => setActiveTab("list")}
                            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${
                                activeTab === "list" ? "bg-white text-slate-900 shadow-md" : "text-white hover:bg-white/10"
                            }`}
                        >
                            <FaList /> 목록
                        </button>
                    </div>
                </>
            )}

            {showLocationPrompt && (
                <div className="absolute inset-0 z-[2001] flex items-center justify-center bg-black/45 px-6">
                    <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
                        <h2 className="text-lg font-bold text-slate-900">현재 위치 사용</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                            내 위치로 지도를 이동하려면 위치 권한이 필요합니다. 확인을 누르면 위치 접근 허용 여부를 묻는 시스템 알림이 표시됩니다.
                        </p>

                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setShowLocationPrompt(false)}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                                취소
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmLocationPrompt}
                                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {alertMsg && (
                <div className="absolute inset-0 z-[2002] flex items-center justify-center bg-black/45 px-6">
                    <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
                        <h2 className="text-lg font-bold text-slate-900">알림</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{alertMsg}</p>
                        <button
                            type="button"
                            onClick={() => setAlertMsg("")}
                            className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                        >
                            확인
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}