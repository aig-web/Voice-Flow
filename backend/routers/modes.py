"""
Modes Router
Endpoints to list and manage processing modes
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import SessionLocal, Mode

router = APIRouter(prefix="/api/modes", tags=["modes"])


@router.get("")
async def list_modes():
    try:
        with SessionLocal() as db:
            modes = db.query(Mode).filter(Mode.user_id == "default").order_by(Mode.sort_order).all()
            return [m.to_dict() for m in modes]
    except Exception as e:
        print(f"Error listing modes: {e}")
        return {"error": str(e)}


class ModeRequest(BaseModel):
    name: str
    description: str | None = None
    system_prompt: str | None = None


@router.post("")
async def create_mode(request: ModeRequest):
    try:
        with SessionLocal() as db:
            mode = Mode(user_id="default", name=request.name, description=request.description or "", system_prompt=request.system_prompt or "", is_default=False)
            db.add(mode)
            db.commit()
            db.refresh(mode)
            return mode.to_dict()
    except Exception as e:
        print(f"Error creating mode: {e}")
        raise HTTPException(status_code=400, detail=str(e))
