from fastapi import APIRouter, UploadFile, File, Query, Depends
from app.schemas.bill_schema import (
    BillUploadResponse,
    BillListResponse,
    BillDetailResponse,
    BillDeleteResponse,
    BillVerificationRequest,
    BillVerificationResponse,
    LegalReviewBriefResponse,
)
from app.api.controllers.bill_controller import BillController
from app.middleware.auth import get_current_user
from typing import Dict, Any, Optional

router = APIRouter(
    prefix="/bills",
    tags=["Bills"]
)

@router.post("/upload", response_model=BillUploadResponse)
async def upload_bill(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Upload a government bill PDF to extract text and analyze impact using Gemini AI.
    """
    return await BillController.upload_bill_flow(file, current_user)

@router.get("", response_model=BillListResponse)
async def get_bills(
    search: Optional[str] = Query(None, description="Search bills by keyword"),
    status: Optional[str] = Query(None, description="Filter bills by status"),
    document_type: Optional[str] = Query(None, description="Filter by document type"),
    jurisdiction: Optional[str] = Query(None, description="Filter by jurisdiction"),
    category: Optional[str] = Query(None, description="Filter by category"),
    verification_status: Optional[str] = Query(None, description="Filter by verification status"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Retrieve paginated lists of uploaded bills with keyword search and clause/document filters.
    """
    return await BillController.get_bills_flow(
        search=search,
        status_filter=status,
        document_type=document_type,
        jurisdiction=jurisdiction,
        category=category,
        verification_status=verification_status,
        risk_level=risk_level,
        page=page,
        limit=limit,
        current_user=current_user
    )


@router.get("/{id}", response_model=BillDetailResponse)
async def get_bill_by_id(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Fetch the complete details, extracted text, and AI analysis for a specific bill.
    """
    return await BillController.get_bill_by_id_flow(id)

@router.patch("/{id}/verification", response_model=BillVerificationResponse)
async def update_bill_verification(
    id: str,
    body: BillVerificationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Update verification status and reviewer notes for a legal record/bill.
    Allowed statuses: draft, needs_review, verified, rejected.
    """
    return await BillController.update_verification_flow(
        bill_id=id,
        verification_data=body,
        current_user=current_user
    )

@router.post("/{id}/review-brief", response_model=LegalReviewBriefResponse)
async def generate_review_brief(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Generate a structured Legal Review Brief for the selected bill/legal record.
    Uses existing Gemini AI integration and Firestore data.
    verificationStatus and reviewerNotes always come from the database.
    """
    return await BillController.generate_review_brief_flow(
        bill_id=id,
        current_user=current_user
    )

@router.delete("/{id}", response_model=BillDeleteResponse)
async def delete_bill(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Delete a bill from history and clean up its stored document on disk.
    """
    return await BillController.delete_bill_flow(id)

