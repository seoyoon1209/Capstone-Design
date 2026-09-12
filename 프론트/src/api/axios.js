// src/api/axios.js
import axios from "axios";

// 배포 백엔드 주소 (Render). 빌드 시 환경변수 VITE_API_BASE 로 덮어쓸 수 있음.
const PROD_API_BASE = "https://u7lpt81uee.onrender.com";

// - 로컬 개발(import.meta.env.DEV): baseURL "" → vite 프록시(/api → 백엔드)가 처리
// - 배포(import.meta.env.PROD): vite 프록시가 없으므로 백엔드 절대주소를 직접 사용
//   (정적 사이트에서 ""로 두면 /api 가 프론트 도메인으로 가서 404 남)
const baseURL =
    import.meta.env.VITE_API_BASE ??
    (import.meta.env.PROD ? PROD_API_BASE : "");

const instance = axios.create({
    baseURL,
    withCredentials: true,            // 쿠키나 세션 사용하는 경우 필요
    headers: {
        "Content-Type": "application/json",
    },
});

export default instance;