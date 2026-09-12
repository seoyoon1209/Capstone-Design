from fastapi import APIRouter, HTTPException
from db.dbpool import DbPoolDep
import uuid

router = APIRouter(prefix="/user_delete", tags=["회원탈퇴"])

@router.delete("/{user_id}")
async def delete_user(user_id: uuid.UUID, conn: DbPoolDep):
    try:
        # DB에서 유저 삭제 (CASCADE 설정에 의해 연관된 profile, snapshot 등도 함께 삭제됨)
        result = await conn.execute("DELETE FROM app_user WHERE user_id = $1", user_id)
        
        # 삭제된 행이 있는지 확인
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
            
        return {"ok": True, "message": "회원 탈퇴가 완료되었습니다."}
    except Exception as e:
        print("Delete Error:", e)
        raise HTTPException(status_code=500, detail=str(e))
