from db import dbpool
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from router.UserLoginRouter import router as UserLoginRouter
from router.MembershipRouter import router as MembershipRouter
from router.EmailRouter import router as EmailRouter
from router.SmokingDay import router as SmokingDayRouter
from router.TestRouter import router as TestRouter
from router.Bogunso import router as BogunsoRouter
from router.gpt.GptTast import router as GptTastRouter
from router.AiModel.TestModel import router as TestModelRouter
from router.UserInformation import router as UserInformationRouter
from router.UserDeleteRouter import router as UserDeleteRouter
from router.UserHeart import router as UserHeartRouter
from router.MotionData import router as MotionDataRouter
from router.SmsRouter import router as SmsRouter
from scheduler import start_scheduler, stop_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    await dbpool.init()
    print("DB 실행")
    start_scheduler()
    print("스케줄러 시작")
    yield
    stop_scheduler()
    print("스케줄러 종료")
    await dbpool.dispose()
    print("DB 청소")

app = FastAPI(lifespan=lifespan)


# CORS 설정: 모든 오리진 허용 (LAN 테스트 및 모바일 앱 접속용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://2-can2.onrender.com",
        "capacitor://localhost",
        "http://localhost",
        "http://localhost:5173",
        "https://2-h58i.onrender.com"
    ],

    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(UserLoginRouter, prefix="/api")
app.include_router(MembershipRouter, prefix="/api")
app.include_router(EmailRouter, prefix='/api')
app.include_router(SmokingDayRouter, prefix='/api')
app.include_router(TestRouter, prefix='/api')
app.include_router(BogunsoRouter, prefix='/api')
app.include_router(GptTastRouter, prefix='/api')
app.include_router(TestModelRouter, prefix='/api')
app.include_router(UserInformationRouter, prefix='/api')
app.include_router(UserDeleteRouter, prefix='/api')
app.include_router(UserHeartRouter, prefix='/api')
app.include_router(MotionDataRouter, prefix='/api')
app.include_router(SmsRouter, prefix='/api')
