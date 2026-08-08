"""
review_brief_service.py — Elite Bounty: Legal Review Brief Generator

Generates a structured legal review brief for an existing CivicSync bill record.

Key design rules:
- verificationStatus and reviewerNotes ALWAYS come from Firestore (never from Gemini)
- Gemini is used ONLY for executiveSummary, keyClauses, detectedIssues, keyTakeaways
- If Gemini is unavailable/fails, gracefully falls back to existing DB fields
- Anti-hallucination prompt strictly limits Gemini to the provided bill data
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from app.config.gemini import get_gemini_client

logger = logging.getLogger("uvicorn.error")

DISCLAIMER = (
    "This brief is an AI-assisted review summary and does not replace "
    "professional legal advice or the original legal document."
)


def generate_brief(bill_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main entry point called by BillController.generate_review_brief_flow().

    Takes the full Firestore bill document and returns a structured brief dict.
    Trusted fields (verificationStatus, reviewerNotes, title, etc.) are always
    taken from the DB. Gemini is only used to enrich AI-generated sections.
    """
    # ── 1. Extract trusted fields from Firestore (NEVER let Gemini override these) ──
    title = bill_data.get("title", "Unknown Document")
    bill_number = bill_data.get("billNumber", "N/A")
    document_type = bill_data.get("documentType", "Bill")
    jurisdiction = bill_data.get("jurisdiction", "Central")
    category = bill_data.get("category") or (
        bill_data.get("tags", [None])[0] if bill_data.get("tags") else None
    )
    uploaded_at = bill_data.get("uploadedAt", "")
    impact_score = bill_data.get("impactScore", 0)
    user_impact = bill_data.get("userImpact", "")
    key_points = bill_data.get("keyPoints", [])
    summary = bill_data.get("summary", "")
    tags = bill_data.get("tags", [])

    # TRUSTED — NEVER from Gemini
    verification_status = bill_data.get("verificationStatus") or "draft"
    reviewer_notes = bill_data.get("reviewerNotes") or ""

    # Risk level: use stored value or derive from impactScore
    risk_level = bill_data.get("riskLevel")
    if not risk_level:
        score = int(impact_score or 0)
        risk_level = "High" if score >= 75 else "Medium" if score >= 40 else "Low"

    generated_at = datetime.now(timezone.utc).isoformat()

    # ── 2. Attempt Gemini AI generation ──────────────────────────────────────
    ai_generated = False
    executive_summary = ""
    key_clauses = []
    detected_issues = []
    key_takeaways = []

    client = get_gemini_client()
    if client:
        try:
            ai_result = _call_gemini_for_brief(
                client=client,
                title=title,
                bill_number=bill_number,
                summary=summary,
                key_points=key_points,
                user_impact=user_impact,
                tags=tags,
                impact_score=impact_score,
                document_type=document_type,
                jurisdiction=jurisdiction,
            )
            executive_summary = ai_result.get("executiveSummary", "")
            key_clauses = ai_result.get("keyClauses", [])
            detected_issues = ai_result.get("detectedIssues", [])
            key_takeaways = ai_result.get("keyTakeaways", [])
            ai_generated = True
            logger.info(f"[ReviewBrief] Gemini successfully generated brief for bill '{title}'.")
        except Exception as e:
            logger.warning(f"[ReviewBrief] Gemini generation failed: {e}. Falling back to DB fields.")

    # ── 3. Fallback: use existing DB fields if Gemini failed ─────────────────
    if not executive_summary:
        executive_summary = summary or "No summary available for this record."

    if not key_clauses:
        key_clauses = key_points if key_points else [
            "No key clauses were extracted from this record."
        ]

    if not detected_issues:
        # Derive issues from existing bill data
        issues = _derive_issues_from_db(bill_data, risk_level, impact_score)
        detected_issues = issues

    if not key_takeaways:
        # Build takeaways from key points and user impact
        key_takeaways = _derive_takeaways_from_db(key_points, user_impact)

    return {
        "title": title,
        "billNumber": bill_number,
        "documentType": document_type,
        "jurisdiction": jurisdiction,
        "category": category,
        "uploadedAt": uploaded_at,
        "executiveSummary": executive_summary,
        "keyClauses": key_clauses,
        "detectedIssues": detected_issues,
        "verificationStatus": verification_status,     # ALWAYS from DB
        "reviewerNotes": reviewer_notes,               # ALWAYS from DB
        "riskLevel": risk_level,
        "impactScore": impact_score,
        "keyTakeaways": key_takeaways,
        "disclaimer": DISCLAIMER,
        "generatedAt": generated_at,
        "aiGenerated": ai_generated,
    }


def _call_gemini_for_brief(
    client,
    title: str,
    bill_number: str,
    summary: str,
    key_points: List[str],
    user_impact: str,
    tags: List[str],
    impact_score: int,
    document_type: str,
    jurisdiction: str,
) -> Dict[str, Any]:
    """
    Calls Gemini with a strict, anti-hallucination prompt to generate only the
    AI-enrichable sections of the legal review brief.
    """
    key_points_text = "\n".join(f"- {kp}" for kp in key_points) if key_points else "Not specified."
    tags_text = ", ".join(tags) if tags else "Not specified."

    prompt = f"""You are a professional legal analyst AI assisting in generating a Legal Review Brief for a government document.

You have been given the following EXISTING data from the CivicSync legal database for the document:

DOCUMENT TITLE: {title}
DOCUMENT NUMBER: {bill_number}
DOCUMENT TYPE: {document_type}
JURISDICTION: {jurisdiction}
IMPACT SCORE: {impact_score}/100
CATEGORY TAGS: {tags_text}

EXISTING AI-GENERATED SUMMARY:
\"\"\"
{summary}
\"\"\"

EXISTING KEY POINTS / PROVISIONS:
{key_points_text}

CITIZEN IMPACT ANALYSIS:
\"\"\"
{user_impact}
\"\"\"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES — READ BEFORE GENERATING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. BASE YOUR ENTIRE OUTPUT ONLY ON THE PROVIDED DATA ABOVE.
   → Do NOT invent clauses, legal requirements, section numbers, or facts.
   → Do NOT use external knowledge about similar laws or bills.
   → Do NOT generate fictional content under any circumstance.

2. VERIFICATION STATUS AND REVIEWER NOTES:
   → Do NOT generate, modify, or include verification status.
   → Do NOT generate, modify, or include reviewer notes.
   → These are managed separately from trusted database fields.

3. IF INFORMATION IS MISSING:
   → Write "Not specified in the available record." for that field.
   → Never fabricate placeholder content.

4. KEY CLAUSES:
   → Extract directly from the key points and summary provided.
   → Rephrase into clear "Clause N — [description]" format.
   → Do not invent any new clause that is not in the provided data.

5. DETECTED ISSUES:
   → Only include issues that are EVIDENT from the provided data:
     - Risk areas mentioned in the summary
     - Compliance concerns derivable from key points
     - Ambiguous language noted in the provisions
     - Areas where impact score indicates concern
   → If no real issues exist, write: "No significant issues detected in the available analysis."
   → Do NOT invent or fabricate issues.

6. LANGUAGE:
   → Use plain, professional language suitable for a legal review brief.
   → Avoid excessive jargon.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — VALID JSON ONLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY a valid JSON object inside a ```json ... ``` code block.
Do NOT write any explanation, preamble, or text outside the JSON block.

```json
{{
  "executiveSummary": "<2-3 concise paragraphs summarizing this document based ONLY on the provided summary and key points. Do not invent facts.>",
  "keyClauses": [
    "<Clause 1 — derived from key points/summary>",
    "<Clause 2 — derived from key points/summary>",
    "<Clause 3 — derived from key points/summary>",
    "<Add more clauses as warranted by the provided data>"
  ],
  "detectedIssues": [
    "<Issue 1 — based ONLY on risks or concerns evident in the provided data>",
    "<Issue 2 — if applicable>",
    "<Or write: No significant issues detected in the available analysis.>"
  ],
  "keyTakeaways": [
    "<Takeaway 1 — most important point for a reviewer, based on the provided data>",
    "<Takeaway 2>",
    "<Takeaway 3>",
    "<Takeaway 4>",
    "<Takeaway 5>",
    "<Add more if warranted by the data>"
  ]
}}
```
"""

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt
    )

    if not response or not hasattr(response, "text") or not response.text:
        raise ValueError("Gemini returned an empty response for legal review brief.")

    raw = response.text.strip()
    return _parse_brief_json(raw)


def _parse_brief_json(response_text: str) -> Dict[str, Any]:
    """Extracts and parses the JSON object from Gemini's response."""
    cleaned = response_text

    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", cleaned)
    if match:
        cleaned = match.group(1).strip()
    else:
        first_brace = cleaned.find("{")
        last_brace = cleaned.rfind("}")
        if first_brace != -1 and last_brace != -1:
            cleaned = cleaned[first_brace:last_brace + 1]

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"[ReviewBrief] JSON parse failed: {e}")
        raise ValueError(f"Gemini returned invalid JSON for brief: {e}") from e


def _derive_issues_from_db(
    bill_data: Dict[str, Any],
    risk_level: str,
    impact_score: int
) -> List[str]:
    """
    Derive detected issues from existing DB fields when Gemini is unavailable.
    Only uses information present in the record — never invents issues.
    """
    issues = []
    score = int(impact_score or 0)

    if risk_level == "High" or score >= 75:
        issues.append(
            f"High citizen impact detected (Impact Score: {score}/100). "
            "This record may require priority review and stakeholder consultation."
        )
    if risk_level == "Medium" or (40 <= score < 75):
        issues.append(
            f"Moderate impact identified (Impact Score: {score}/100). "
            "Compliance implications should be assessed before final approval."
        )

    verification_status = bill_data.get("verificationStatus") or "draft"
    if verification_status == "draft":
        issues.append(
            "This record has not yet been verified. Verification review is pending."
        )
    elif verification_status == "needs_review":
        issues.append(
            "This record has been flagged as requiring additional review before verification."
        )
    elif verification_status == "rejected":
        issues.append(
            "This record was previously rejected. Review the reviewer notes for details."
        )

    if not issues:
        issues.append("No significant issues detected in the available analysis.")

    return issues


def _derive_takeaways_from_db(
    key_points: List[str],
    user_impact: str
) -> List[str]:
    """
    Build key takeaways from existing DB key points and user impact.
    """
    takeaways = list(key_points[:5]) if key_points else []
    if user_impact and user_impact.strip():
        takeaways.append(f"Citizen Impact: {user_impact.strip()}")
    if not takeaways:
        takeaways = ["No key takeaways could be derived from the available record."]
    return takeaways
