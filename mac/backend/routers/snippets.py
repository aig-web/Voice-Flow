"""
Snippets Router
Voice shortcut management endpoints
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.snippet_service import snippet_service

router = APIRouter(prefix="/api/snippets", tags=["snippets"])


class SnippetRequest(BaseModel):
    trigger: str
    content: str


@router.get("")
async def get_snippets():
    """Get all snippets"""
    return snippet_service.get_snippets()


@router.post("")
async def add_snippet(request: SnippetRequest):
    """Add or update a snippet"""
    success, message, snippet = snippet_service.add_snippet(
        request.trigger,
        request.content
    )

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return {"status": "success", "message": message, "snippet": snippet}


@router.delete("/{snippet_id}")
async def delete_snippet(snippet_id: int):
    """Delete a snippet"""
    if snippet_service.delete_snippet(snippet_id):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Snippet not found")
