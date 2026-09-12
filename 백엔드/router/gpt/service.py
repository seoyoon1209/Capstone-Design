from openai import OpenAI
from fastapi import HTTPException
from settings.Settings import get_settings

settings = get_settings()

def ask_gpt(user_message: str) -> str:
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY가 설정되지 않았습니다.")

    client = OpenAI(api_key=settings.openai_api_key)

    try:
        #최신 OpenAI SDK 문법 (Chat Completions)
        response = client.chat.completions.create(
            model=settings.openai_model or "gpt-4o",
            messages=[
                {
                    "role": "system", 
                    "content": "너는 금연 전문 AI 컨설턴트야. 사용자의 금연 실패 위험도(%)를 입력받으면, 그에 맞는 따뜻하고 구체적인 조언을 '현재 상태 분석', '주의해야 할 순간', '실천 전략' 세 가지 항목으로 나누어 친절하게 설명해줘. 응답은 한국어로 하고, 각 항목은 명확하게 구분해줘."

                },
                {"role": "user", "content": user_message}
            ],
            temperature=0.7
        )
        return response.choices[0].message.content

    except Exception as e:
        print(f"GPT API 호출 에러: {e}")
        raise HTTPException(status_code=500, detail=f"GPT 호출 실패: {str(e)}")
