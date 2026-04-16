import json
from io import BytesIO

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from app.models.schemas import (
    CleanRequest,
    CleanResponse,
    DatasetResponse,
    WorkflowCreateRequest,
    WorkflowListResponse,
)
from app.services.cleaner import DataCleaner
from app.services.file_parser import DatasetFileParser
from app.services.profiler import DataProfiler
from app.services.report_builder import PdfReportBuilder
from app.services.workflow_store import WorkflowStore


router = APIRouter(tags=["data"])

file_parser = DatasetFileParser()
profiler = DataProfiler()
cleaner = DataCleaner()
workflow_store = WorkflowStore()
report_builder = PdfReportBuilder()


@router.post("/datasets/analyze", response_model=DatasetResponse)
async def analyze_dataset(file: UploadFile = File(...)) -> DatasetResponse:
    try:
        dataframe = await file_parser.parse_upload(file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    profile = profiler.profile_dataset(dataframe, file.filename or "uploaded_file")
    return DatasetResponse(profile=profile, preview_before=profiler.preview_rows(dataframe))


@router.post("/datasets/clean", response_model=CleanResponse)
async def clean_dataset(request_json: str = Form(...), file: UploadFile = File(...)) -> CleanResponse:
    try:
        dataframe = await file_parser.parse_upload(file)
        request = CleanRequest.model_validate(json.loads(request_json))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid cleaning payload JSON") from exc

    cleaned, execution = cleaner.run(dataframe, request)
    before_profile = profiler.profile_dataset(dataframe, file.filename or "uploaded_file")
    after_profile = profiler.profile_dataset(cleaned, f"cleaned_{file.filename or 'dataset'}")

    return CleanResponse(
        profile_before=before_profile,
        profile_after=after_profile,
        preview_before=profiler.preview_rows(dataframe),
        preview_after=profiler.preview_rows(cleaned),
        execution=execution,
    )


@router.post("/datasets/export/{format_name}")
async def export_dataset(format_name: str, request_json: str = Form(...), file: UploadFile = File(...)):
    try:
        dataframe = await file_parser.parse_upload(file)
        request = CleanRequest.model_validate(json.loads(request_json))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid cleaning payload JSON") from exc

    cleaned, _ = cleaner.run(dataframe, request)
    buffer = BytesIO()

    if format_name == "csv":
        cleaned.to_csv(buffer, index=False)
        media_type = "text/csv"
        filename = "cleaned_dataset.csv"
    elif format_name == "excel":
        with profiler.excel_writer(buffer) as writer:
            cleaned.to_excel(writer, index=False, sheet_name="cleaned")
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "cleaned_dataset.xlsx"
    else:
        raise HTTPException(status_code=400, detail="Unsupported export format")

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/datasets/report")
async def dataset_report(request_json: str = Form(...), file: UploadFile = File(...)):
    try:
        dataframe = await file_parser.parse_upload(file)
        request = CleanRequest.model_validate(json.loads(request_json))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid cleaning payload JSON") from exc

    cleaned, execution = cleaner.run(dataframe, request)
    response = CleanResponse(
        profile_before=profiler.profile_dataset(dataframe, file.filename or "uploaded_file"),
        profile_after=profiler.profile_dataset(cleaned, f"cleaned_{file.filename or 'dataset'}"),
        preview_before=profiler.preview_rows(dataframe),
        preview_after=profiler.preview_rows(cleaned),
        execution=execution,
    )
    pdf_bytes = report_builder.build_report(response, file.filename or "dataset")
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="cleaning_report.pdf"'},
    )


@router.get("/workflows", response_model=WorkflowListResponse)
def list_workflows() -> WorkflowListResponse:
    return WorkflowListResponse(items=workflow_store.list_workflows())


@router.post("/workflows", response_model=dict)
def save_workflow(request: WorkflowCreateRequest = Body(...)) -> dict:
    workflow = workflow_store.save_workflow(request.name, request.request)
    return {"message": "Workflow saved successfully.", "workflow": workflow.model_dump()}
