"""
Export Router
Export transcriptions to PDF, CSV, JSON formats
"""
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
import io
import csv
import json

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.units import inch

from database import SessionLocal, Transcription

router = APIRouter(prefix="/api/transcriptions", tags=["export"])


class ExportRequest(BaseModel):
    format: str
    transcription_ids: list[int]


@router.post("/export")
async def export_transcriptions(request: ExportRequest):
    """Export selected transcriptions in chosen format"""
    try:
        if not request.transcription_ids:
            return {"error": "No transcriptions selected"}

        with SessionLocal() as db:
            transcriptions = db.query(Transcription).filter(
                Transcription.id.in_(request.transcription_ids)
            ).order_by(Transcription.created_at.desc()).all()

            if not transcriptions:
                return {"error": "No transcriptions found"}

            # Convert to dicts before session closes
            transcription_data = [
                {
                    "id": t.id,
                    "raw_text": t.raw_text,
                    "polished_text": t.polished_text,
                    "created_at": t.created_at
                }
                for t in transcriptions
            ]

        if request.format == 'pdf':
            return await generate_pdf(transcription_data)
        elif request.format == 'csv':
            return await generate_csv(transcription_data)
        elif request.format == 'json':
            return await generate_json(transcription_data)
        else:
            return {"error": "Invalid format"}

    except Exception as e:
        print(f"Error exporting: {e}")
        return {"error": str(e)}


async def generate_pdf(transcriptions: list[dict]):
    """Generate PDF from transcriptions"""
    try:
        pdf_buffer = io.BytesIO()
        doc = SimpleDocTemplate(pdf_buffer, pagesize=letter)
        elements = []

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor='#3b82f6',
            spaceAfter=30,
            alignment=1
        )
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=14,
            textColor='#1e293b',
            spaceAfter=12,
            spaceBefore=12
        )

        elements.append(Paragraph("Voice-Flow Transcription Export", title_style))
        elements.append(Paragraph(
            f"Exported on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | {len(transcriptions)} transcriptions",
            styles['Normal']
        ))
        elements.append(Spacer(1, 0.5*inch))

        for i, t in enumerate(transcriptions, 1):
            created_at = t["created_at"]
            date_str = created_at.strftime('%Y-%m-%d %H:%M:%S') if hasattr(created_at, 'strftime') else str(created_at)
            elements.append(Paragraph(
                f"<b>#{t['id']}</b> - {date_str}",
                heading_style
            ))

            elements.append(Paragraph(f"<b>Polished:</b>", styles['Normal']))
            elements.append(Paragraph(t["polished_text"] or "", styles['Normal']))
            elements.append(Spacer(1, 0.2*inch))

            elements.append(Paragraph(f"<b>Raw:</b>", styles['Normal']))
            elements.append(Paragraph(t["raw_text"] or "", styles['Normal']))

            if i < len(transcriptions):
                elements.append(PageBreak())

        doc.build(elements)
        pdf_buffer.seek(0)

        return {
            "filename": f"voice-flow-{len(transcriptions)}-transcriptions-{datetime.now().strftime('%Y%m%d-%H%M%S')}.pdf",
            "data": pdf_buffer.getvalue().hex()
        }
    except Exception as e:
        return {"error": f"PDF generation failed: {str(e)}"}


async def generate_csv(transcriptions: list[dict]):
    """Generate CSV from transcriptions"""
    try:
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow(['ID', 'Date', 'Polished Text', 'Raw Text'])

        for t in transcriptions:
            created_at = t["created_at"]
            date_str = created_at.strftime('%Y-%m-%d %H:%M:%S') if hasattr(created_at, 'strftime') else str(created_at)
            writer.writerow([
                t["id"],
                date_str,
                t["polished_text"],
                t["raw_text"]
            ])

        return {
            "filename": f"voice-flow-{len(transcriptions)}-transcriptions-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv",
            "data": csv_buffer.getvalue()
        }
    except Exception as e:
        return {"error": f"CSV generation failed: {str(e)}"}


async def generate_json(transcriptions: list[dict]):
    """Generate JSON from transcriptions"""
    try:
        data = {
            "exported_at": datetime.now().isoformat(),
            "total_transcriptions": len(transcriptions),
            "transcriptions": transcriptions
        }

        return {
            "filename": f"voice-flow-{len(transcriptions)}-transcriptions-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json",
            "data": json.dumps(data, indent=2, default=str)
        }
    except Exception as e:
        return {"error": f"JSON generation failed: {str(e)}"}
