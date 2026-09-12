from fastapi import APIRouter, HTTPException
from settings.Settings import get_settings
from db.dbpool import DbPoolDep
import aiohttp     # request 대신 aiohttp로 비동기 HTTP 요청 처리. 라이브러리 설치필요: pip install aiohttp
import asyncio
import json
import os

router = APIRouter(prefix="/bogunso", tags=["보건소"])

# 현재 모든 주소를 완벽히 위도/경도 값으로 변환을 못해 해당 값이 null로 저장되는 보건소들이 있음. 추후에 필터링을 빡세게 해서 최대한 줄여보겠음

# 프로그램 실행 시 bogunso_coords.json(위도/경도 정보를 저장하는 캐시 파일)이 생성됨
COORDS_CACHE_FILE = "bogunso_coords.json"
# 동시 요청 제한 (카카오 API 부하 방지)
SEMAPHORE_LIMIT = 20


def to_float(v):
    try:
        return float(v) if v not in (None, "", "null") else None
    except (ValueError, TypeError):
        return None

#  캐시파일 읽어오는거
def load_coords_cache() -> dict:
    if not os.path.exists(COORDS_CACHE_FILE):
        return {}
    try:
        with open(COORDS_CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return {}


def save_coords_cache(coords_map: dict):
    tmp_path = COORDS_CACHE_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(coords_map, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, COORDS_CACHE_FILE)
    print(f"좌표 캐시 저장 완료: {COORDS_CACHE_FILE}")

#  카카오 지오코딩
async def kakao_geocode(session, semaphore, address: str, kakao_key: str):
    #  주소 -> 위도/경도 변환
    if not address:
        return None, None

    async with semaphore:
        kakao_url = "https://dapi.kakao.com/v2/local/search/address.json"
        headers = {"Authorization": f"KakaoAK {kakao_key}"}
        params = {"query": address}

        try:
            async with session.get(
                kakao_url,
                headers=headers,
                params=params,
                timeout=aiohttp.ClientTimeout(total=5)
            ) as res:
                data = await res.json()
                docs = data.get("documents", [])
                if docs:
                    return to_float(docs[0]["y"]), to_float(docs[0]["x"])  # y = lat, x = lng
        except Exception as e:
            print(f"지오코딩 실패 [{address}]: {e}")

        return None, None


async def geocode_missing(items: list[dict], kakao_key: str, coords_map: dict) -> dict:
    # 이미 캐시에 있는 주소는 건너뛰고 처음 보는 주소만 추림
    # set으로 같은 주소인 보건소들 한 번에 처리하도록
    missing_addresses = list({
        item["address"] for item in items
        if item["address"] and item["address"] not in coords_map
    })

    if not missing_addresses:
        print("모든 주소가 좌표 캐시에 존재합니다.")
        return coords_map

    print(f"지오코딩 필요 주소: {len(missing_addresses)}건")
    semaphore = asyncio.Semaphore(SEMAPHORE_LIMIT)

    #  병렬처리
    async with aiohttp.ClientSession() as session:
        tasks = [
            kakao_geocode(session, semaphore, address, kakao_key)
            for address in missing_addresses
        ]
        coords_list = await asyncio.gather(*tasks)

    new_count = 0

    # 기존 캐시에 업데이트 시킴
    for address, (lat, lng) in zip(missing_addresses, coords_list):
        coords_map[address] = {"lat": lat, "lng": lng}
        new_count += 1

    print(f"신규 좌표 {new_count}건 획득 완료.")
    return coords_map


@router.get("/list")
async def get_bogunso_list(conn: DbPoolDep):
    settings = get_settings()
    items = []

    # DB에서 보건소 목록 조회
    # 실제 DB 컬럼명: center_id, name, center_type, address, phone, sido, sigungu
    try:
        rows = await conn.fetch(
            "SELECT center_id as id, name, center_type as type, address, "
            "phone as tel, sido, sigungu "
            "FROM health_center WHERE is_active = true ORDER BY name ASC"
        )
        if rows:
            print(f"DB에서 {len(rows)}건의 보건소 데이터를 불러왔습니다.")
            items = [dict(r) for r in rows]
        else:
            print("DB에 활성화된 보건소 데이터가 없습니다.")
    except Exception as e:
        print(f"DB 조회 중 오류 발생: {e}")

    # DB에 데이터가 없거나 조회 실패 시 공공 API 호출
    if not items:
        print("공공 API 호출 시작...")
        try:
            # 서비스키 인코딩/디코딩 문제 방지를 위해 unquote 처리 고려 (필요시)
            import urllib.parse
            service_key = urllib.parse.unquote(settings.public_data_api_key)

            url = "https://api.odcloud.kr/api/3072692/v1/uddi:19379761-9b1a-4c49-a2ad-ffc7f935bbc4"
            params = {
                "serviceKey": service_key,
                "page": 1,
                "perPage": 4000
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as res:
                    print(f"공공 API 응답 상태 코드: {res.status}")
                    
                    # 텍스트로 먼저 받아서 JSON인지 확인 (XML 방지)
                    res_text = await res.text()
                    
                    if res.status != 200:
                        print(f"공공 API 에러 응답: {res_text}")
                        raise HTTPException(
                            status_code=502,
                            detail=f"공공데이터 API 오류: HTTP {res.status}"
                        )
                    
                    try:
                        response_data = json.loads(res_text)
                    except json.JSONDecodeError:
                        print(f"공공 API 응답이 JSON 형식이 아닙니다: {res_text[:200]}...")
                        raise HTTPException(
                            status_code=502,
                            detail="공공데이터 서버로부터 유효하지 않은 응답을 받았습니다."
                        )

            raw_items = response_data.get("data", [])
            print(f"공공 API로부터 {len(raw_items)}건의 데이터를 수신했습니다.")
            
            data_to_insert = []
            for idx, item in enumerate(raw_items):
                obj = {
                    "id": idx + 1,
                    "name": item.get("보건기관명", "") or item.get("기관명", ""),
                    "type": item.get("기관유형", "") or item.get("보건기관 유형", ""),
                    "address": item.get("주소", ""),
                    "tel": item.get("대표 전화번호", "") or item.get("대표전화번호", ""),
                    "sido": item.get("시도", ""),
                    "sigungu": item.get("시군구", "")
                }
                items.append(obj)
                data_to_insert.append((
                    obj["name"], obj["type"], obj["address"],
                    obj["tel"], obj["sido"], obj["sigungu"]
                ))

            if data_to_insert:
                try:
                    # DB 저장 실패 시 로그만 남기고 중단하지 않음
                    await conn.executemany("""
                        INSERT INTO health_center (name, center_type, address, phone, sido, sigungu)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (name, address) DO UPDATE 
                        SET center_type = EXCLUDED.center_type,
                            phone = EXCLUDED.phone,
                            sido = EXCLUDED.sido,
                            sigungu = EXCLUDED.sigungu,
                            updated_at = now()
                    """, data_to_insert)
                    print(f"새로운 보건소 데이터 {len(data_to_insert)}건을 DB에 저장/업데이트 완료.")
                except Exception as insert_err:
                    print(f"DB 저장 중 오류 발생 (데이터 반환은 계속함): {insert_err}")

        except HTTPException:
            raise
        except Exception as e:
            print(f"처리 중 예기치 않은 오류 발생: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"서버 내부 오류: {str(e)}")

    # 좌표 캐시 로드 → 누락 주소만 지오코딩 → 캐시 업데이트
    coords_map = load_coords_cache()
    coords_map = await geocode_missing(items, settings.kakao_rest_api_key, coords_map)
    save_coords_cache(coords_map)

    # 목록에 위도/경도 병합 후 반환 - 보건소 정보 + 좌표값
    result_items = []
    for item in items:
        coords = coords_map.get(item.get("address") or "", {})
        result_items.append({
            **item,
            "lat": coords.get("lat"),
            "lng": coords.get("lng")
        })

    return {
        "total_count": len(result_items),
        "items": result_items
    }