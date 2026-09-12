# from pydantic import BaseModel, Field
#
# class SmokingPredictRequest(BaseModel):
#     sex: int = Field(..., ge=1, le=2)
#     age: int = Field(..., ge=19, le=80)
#     edu: int = Field(..., ge=1, le=4)
#     marri_1: int = Field(..., ge=1, le=2)
#     occp: int = Field(..., ge=1, le=7)
#     BS1_1: int = Field(..., ge=1, le=3)
#     BS2_1: int = Field(..., ge=10, le=30)
#     BS12_37: int = Field(..., ge=1, le=2)
#     BS12_1: int = Field(..., ge=1, le=2)
#     HE_BMI: float = Field(..., ge=10.0, le=60.0)
#     mh_stress: int = Field(..., ge=0, le=1)
#     BD2_1: int = Field(..., ge=1, le=5)
#     BS8_2: int = Field(..., ge=1, le=2)
#     BS13: int = Field(..., ge=1, le=2)