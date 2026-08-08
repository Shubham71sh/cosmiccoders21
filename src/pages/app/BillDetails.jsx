import { motion } from "framer-motion";
import { FileText, ArrowLeft, Calendar, Hash, Shield, ShieldCheck, TrendingUp, Download, Loader2, Globe, Copy, Check, AlertCircle, CheckCircle2, Gavel, BookOpen, AlertTriangle, Lightbulb, RotateCcw } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getBillById, translateBill, updateBillVerification, generateLegalReviewBrief } from "../../services/billService";
import clsx from "clsx";

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "bn", name: "Bengali" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "pa", name: "Punjabi" },
];

const STATUS_CONFIG = {
  passed: { label: "Passed", color: "text-success", bg: "bg-success/10 border-success/20" },
  pending: { label: "Pending", color: "text-accent", bg: "bg-accent/10 border-accent/20" },
  under_review: { label: "Under Review", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
  rejected: { label: "Rejected", color: "text-danger", bg: "bg-danger/10 border-danger/20" },
};

const VERIFICATION_STATUS_CONFIG = {
  draft: { label: "Draft", color: "text-textSecondary", bg: "bg-[#12141d] border-border" },
  needs_review: { label: "Needs Review", color: "text-accent", bg: "bg-accent/10 border-accent/20" },
  verified: { label: "Verified", color: "text-success", bg: "bg-success/10 border-success/20" },
  rejected: { label: "Rejected", color: "text-danger", bg: "bg-danger/10 border-danger/20" },
};

const VERIFICATION_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "needs_review", label: "Needs Review" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
];

const normalizeVerificationStatus = (statusStr) => {
  if (!statusStr) return "draft";
  const s = String(statusStr).toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (s === "needs_review" || s === "needsreview") return "needs_review";
  if (s === "verified") return "verified";
  if (s === "rejected") return "rejected";
  return "draft";
};

const getVerificationBadge = (statusStr) => {
  const norm = normalizeVerificationStatus(statusStr);
  return VERIFICATION_STATUS_CONFIG[norm] || VERIFICATION_STATUS_CONFIG.draft;
};

export default function BillDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── Multilingual Bill Intelligence ────────────────────────────────────────
  const [selectedLang, setSelectedLang] = useState("en");
  const [translating, setTranslating] = useState(false);
  const [translatedSummary, setTranslatedSummary] = useState(null);
  const [translationLangName, setTranslationLangName] = useState("English");
  const [translationError, setTranslationError] = useState("");
  const [copied, setCopied] = useState(false);

  // ── Verification Controls State ────────────────────────────────────────────
  const [verificationStatus, setVerificationStatus] = useState("draft");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [savedVerificationStatus, setSavedVerificationStatus] = useState("draft");
  const [savedReviewerNotes, setSavedReviewerNotes] = useState("");
  const [savingVerification, setSavingVerification] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [verificationSuccess, setVerificationSuccess] = useState(false);

  // ── Legal Review Brief State ───────────────────────────────────────────────
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [briefData, setBriefData] = useState(null);
  const [briefError, setBriefError] = useState("");
  const briefPreviewRef = useRef(null);

  const handleTranslate = async (langCode = selectedLang) => {
    if (!bill || !id) return;
    if (langCode === "en") {
      setTranslatedSummary(bill.summary || "");
      setTranslationLangName("English");
      setTranslationError("");
      return;
    }
    setTranslating(true);
    setTranslationError("");
    try {
      const result = await translateBill(id, langCode);
      if (result && result.translated_summary) {
        setTranslatedSummary(result.translated_summary);
        setTranslationLangName(result.language || langCode);
      } else {
        setTranslationError("Translation response was empty.");
      }
    } catch (err) {
      console.error("[BillDetails] Translation failed:", err);
      setTranslationError(err.message || "Translation failed. Please try again.");
    } finally {
      setTranslating(false);
    }
  };

  const handleCopy = () => {
    const text = translatedSummary ?? bill?.summary ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveVerification = async () => {
    if (!bill || !id) return;
    setSavingVerification(true);
    setVerificationError("");
    setVerificationSuccess(false);

    try {
      const payload = {
        verificationStatus,
        reviewerNotes,
      };
      const res = await updateBillVerification(id, payload);

      setSavedVerificationStatus(verificationStatus);
      setSavedReviewerNotes(reviewerNotes);
      setVerificationSuccess(true);

      if (res && res.bill) {
        setBill(res.bill);
      } else {
        setBill((prev) => (prev ? { ...prev, verificationStatus, reviewerNotes } : prev));
      }
    } catch (err) {
      console.error("[BillDetails] Failed to save verification:", err);
      setVerificationError(err.message || "Failed to update verification status. Please try again.");
    } finally {
      setSavingVerification(false);
    }
  };
  // ── Legal Review Brief Handler ────────────────────────────────────────────
  const handleGenerateBrief = async () => {
    if (!bill || !id) return;
    setGeneratingBrief(true);
    setBriefError("");
    try {
      const result = await generateLegalReviewBrief(id);
      if (result && result.brief) {
        setBriefData(result.brief);
        // Scroll to brief preview after a short delay
        setTimeout(() => {
          if (briefPreviewRef.current) {
            briefPreviewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 200);
      } else {
        setBriefError("Failed to generate brief. Please try again.");
      }
    } catch (err) {
      console.error("[BillDetails] Failed to generate brief:", err);
      setBriefError(err.message || "Failed to generate legal review brief. Please try again.");
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleDownloadBrief = async () => {
    if (!briefData) return;

    // Dynamically import jsPDF to keep bundle size lean
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const PAGE_W = 210;
    const MARGIN = 18;
    const CONTENT_W = PAGE_W - MARGIN * 2;
    const LINE_H = 6;
    let y = MARGIN;

    const addPageIfNeeded = (needed = 12) => {
      if (y + needed > 280) {
        doc.addPage();
        y = MARGIN;
      }
    };

    const addText = (text, size = 10, style = "normal", color = [220, 220, 220]) => {
      doc.setFontSize(size);
      doc.setFont("helvetica", style);
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(String(text || ""), CONTENT_W);
      addPageIfNeeded(lines.length * LINE_H + 4);
      doc.text(lines, MARGIN, y);
      y += lines.length * LINE_H;
    };

    const addSectionHeader = (label) => {
      addPageIfNeeded(14);
      y += 4;
      doc.setFillColor(30, 35, 50);
      doc.roundedRect(MARGIN - 2, y - 4, CONTENT_W + 4, 9, 2, 2, "F");
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(244, 211, 124);
      doc.text(label, MARGIN, y + 1);
      y += 8;
    };

    const addBullet = (text, size = 9) => {
      const lines = doc.splitTextToSize(`• ${String(text || "")}`, CONTENT_W - 4);
      addPageIfNeeded(lines.length * LINE_H + 2);
      doc.setFontSize(size);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(200, 200, 200);
      doc.text(lines, MARGIN + 3, y);
      y += lines.length * LINE_H + 1;
    };

    const addDivider = () => {
      addPageIfNeeded(6);
      doc.setDrawColor(60, 65, 80);
      doc.line(MARGIN, y, PAGE_W - MARGIN, y);
      y += 5;
    };

    // ── Background ───────────────────────────────────────────────────────────
    doc.setFillColor(10, 10, 15);
    doc.rect(0, 0, PAGE_W, 297, "F");

    // ── Header ───────────────────────────────────────────────────────────────
    doc.setFillColor(20, 25, 40);
    doc.rect(0, 0, PAGE_W, 32, "F");
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(244, 211, 124);
    doc.text("CivicSync AI", MARGIN, 14);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 160, 170);
    doc.text("Legal Review Brief", MARGIN, 21);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 115);
    const genDate = briefData.generatedAt
      ? new Date(briefData.generatedAt).toLocaleString()
      : new Date().toLocaleString();
    doc.text(`Generated: ${genDate}`, PAGE_W - MARGIN, 21, { align: "right" });
    y = 38;

    addDivider();

    // ── Document Information ─────────────────────────────────────────────────
    addSectionHeader("Document Information");
    const infoRows = [
      ["Title", briefData.title],
      ["Bill / Document Number", briefData.billNumber],
      ["Document Type", briefData.documentType || "Bill"],
      ["Jurisdiction", briefData.jurisdiction || "Central"],
      ["Category", briefData.category || "—"],
      ["Date", briefData.uploadedAt ? new Date(briefData.uploadedAt).toLocaleDateString() : "—"],
    ];
    infoRows.forEach(([label, value]) => {
      addPageIfNeeded(8);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(180, 180, 195);
      doc.text(`${label}:`, MARGIN, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(220, 220, 230);
      doc.text(String(value || "—"), MARGIN + 50, y);
      y += LINE_H;
    });

    addDivider();

    // ── Executive Summary ─────────────────────────────────────────────────────
    addSectionHeader("1. Executive Summary");
    addText(briefData.executiveSummary || "Not available.", 9, "normal", [200, 200, 210]);
    y += 2;
    addDivider();

    // ── Key Clauses ───────────────────────────────────────────────────────────
    addSectionHeader("2. Key Clauses");
    if (briefData.keyClauses && briefData.keyClauses.length > 0) {
      briefData.keyClauses.forEach((clause, i) => addBullet(`Clause ${i + 1} — ${clause}`));
    } else {
      addText("No key clauses available.", 9);
    }
    y += 2;
    addDivider();

    // ── Detected Issues ───────────────────────────────────────────────────────
    addSectionHeader("3. Detected Issues");
    if (briefData.detectedIssues && briefData.detectedIssues.length > 0) {
      briefData.detectedIssues.forEach((issue) => addBullet(issue));
    } else {
      addText("No significant issues detected in the available analysis.", 9);
    }
    y += 2;
    addDivider();

    // ── Verification Status ───────────────────────────────────────────────────
    addSectionHeader("4. Verification Status");
    const vStatusLabels = { draft: "Draft", needs_review: "Needs Review", verified: "Verified", rejected: "Rejected" };
    addText(`Status: ${vStatusLabels[briefData.verificationStatus] || briefData.verificationStatus || "Draft"}`, 9, "bold", [244, 211, 124]);
    y += 2;
    addDivider();

    // ── Reviewer Notes ────────────────────────────────────────────────────────
    addSectionHeader("5. Reviewer Notes");
    addText(briefData.reviewerNotes || "No reviewer notes have been added.", 9, "normal", [200, 200, 210]);
    y += 2;
    addDivider();

    // ── Risk Information ──────────────────────────────────────────────────────
    addSectionHeader("6. Risk Information");
    addText(`Risk Level: ${briefData.riskLevel || "—"}`, 9, "bold", [244, 211, 124]);
    y += 1;
    addText(`Impact Score: ${briefData.impactScore ?? "—"}/100`, 9, "normal", [200, 200, 210]);
    y += 2;
    addDivider();

    // ── Key Takeaways ─────────────────────────────────────────────────────────
    addSectionHeader("7. Key Takeaways");
    if (briefData.keyTakeaways && briefData.keyTakeaways.length > 0) {
      briefData.keyTakeaways.forEach((t) => addBullet(t));
    } else {
      addText("No key takeaways available.", 9);
    }
    y += 4;

    // ── Disclaimer ────────────────────────────────────────────────────────────
    addPageIfNeeded(18);
    doc.setDrawColor(60, 65, 80);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 5;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 115);
    const disclaimerLines = doc.splitTextToSize(
      `DISCLAIMER: ${briefData.disclaimer || "This brief is an AI-assisted review summary and does not replace professional legal advice or the original legal document."}`,
      CONTENT_W
    );
    doc.text(disclaimerLines, MARGIN, y);

    // ── Download ──────────────────────────────────────────────────────────────
    const safeName = (briefData.billNumber || "brief").replace(/[^a-z0-9]/gi, "_");
    doc.save(`CivicSync_Legal_Review_Brief_${safeName}.pdf`);
  };

  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchBillDetails = async () => {
      if (!id) return;
      setLoading(true);
      setError("");
      
      try {
        const result = await getBillById(id);
        const b = result.bill;
        setBill(b);

        // Populate verification fields (with fallback: verificationStatus = "draft", reviewerNotes = "")
        const initialStatus = normalizeVerificationStatus(b?.verificationStatus);
        const initialNotes = b?.reviewerNotes || "";
        
        setVerificationStatus(initialStatus);
        setReviewerNotes(initialNotes);
        setSavedVerificationStatus(initialStatus);
        setSavedReviewerNotes(initialNotes);
      } catch (err) {
        console.error("[BillDetails] Failed to fetch bill:", err);
        setError(err.message || "Failed to load bill details.");
      } finally {
        setLoading(false);
      }
    };

    fetchBillDetails();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="max-w-4xl mx-auto pb-20">
        <button
          onClick={() => navigate("/dashboard/bills")}
          className="flex items-center gap-2 text-textSecondary hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Bill History
        </button>
        <div className="p-10 rounded-3xl bg-danger/5 border border-danger/20 text-center">
          <p className="text-danger mb-4">{error || "Bill not found"}</p>
          <button
            onClick={() => navigate("/dashboard/bills")}
            className="px-6 py-2.5 rounded-xl bg-danger/10 hover:bg-danger/20 text-danger font-bold transition-colors"
          >
            Return to Bill History
          </button>
        </div>
      </div>
    );
  }

  const status = STATUS_CONFIG[bill.status] || STATUS_CONFIG.pending;
  const verificationBadge = getVerificationBadge(savedVerificationStatus);

  return (
    <div className="space-y-6 pb-20 max-w-4xl mx-auto">
      {/* Back Button */}
      <button
        onClick={() => navigate("/dashboard/bills")}
        className="flex items-center gap-2 text-textSecondary hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Bill History
      </button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-3xl bg-[#171a21] border border-border"
      >
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
            <FileText className="w-7 h-7 text-accent" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">{bill.title}</h1>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1.5 text-sm text-textSecondary">
                    <Hash className="w-3 h-3" />
                    {bill.billNumber}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-textSecondary">
                    <Calendar className="w-3 h-3" />
                    {new Date(bill.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                <span className={clsx("text-xs font-semibold px-3 py-1.5 rounded-full border", status.color, status.bg)}>
                  {status.label}
                </span>
                <span id="verification-status-badge" className={clsx("text-xs font-semibold px-3 py-1.5 rounded-full border flex items-center gap-1.5", verificationBadge.color, verificationBadge.bg)}>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {verificationBadge.label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Impact Score & Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <div className="p-5 rounded-2xl bg-[#171a21] border border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-accent" />
            <p className="text-xs text-textSecondary uppercase tracking-widest font-semibold">Impact Score</p>
          </div>
          <p className="text-4xl font-bold text-accent">{bill.impactScore || 0}%</p>
        </div>
        <div className="md:col-span-2 p-5 rounded-2xl bg-[#171a21] border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-accent" />
            <p className="text-xs text-textSecondary uppercase tracking-widest font-semibold">Citizen Impact</p>
          </div>
          <p className="text-sm text-white leading-relaxed">{bill.userImpact || "No citizen impact analysis available."}</p>
        </div>
      </motion.div>

      {/* AI Summary + Multilingual Translation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="p-6 rounded-3xl bg-[#171a21] border border-border"
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" />
            AI-Generated Summary
          </h3>
          {/* Multilingual Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <Globe className="w-4 h-4 text-accent flex-shrink-0" />
            <select
              id="translation-language-select"
              value={selectedLang}
              onChange={(e) => {
                const lang = e.target.value;
                setSelectedLang(lang);
                handleTranslate(lang);
              }}
              className="text-sm bg-[#12141d] border border-border text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent/50 cursor-pointer"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
            <button
              id="translate-bill-btn"
              onClick={() => handleTranslate(selectedLang)}
              disabled={translating}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent font-semibold hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {translating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {translating ? "Translating…" : "Translate"}
            </button>
            <button
              id="copy-summary-btn"
              onClick={handleCopy}
              title="Copy summary"
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-[#12141d] border border-border text-textSecondary hover:text-white hover:border-accent/30 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {translationError && (
          <p className="text-xs text-danger mb-3">{translationError}</p>
        )}

        {translatedSummary !== null && translationLangName !== "English" && (
          <p className="text-xs text-textSecondary mb-2 flex items-center gap-1">
            <Globe className="w-3 h-3 text-accent" />
            Translated to {translationLangName}
          </p>
        )}

        <p className="text-textSecondary leading-relaxed whitespace-pre-line">
          {translatedSummary !== null ? translatedSummary : (bill.summary || "No summary available.")}
        </p>
      </motion.div>

      {/* Key Points */}
      {bill.keyPoints && bill.keyPoints.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-6 rounded-3xl bg-[#171a21] border border-border"
        >
          <h3 className="font-bold text-white mb-4">Key Points</h3>
          <ul className="space-y-3">
            {bill.keyPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-textSecondary">
                <span className="w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Verification Controls Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="p-6 rounded-3xl bg-[#171a21] border border-border"
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-accent" />
            Verification Controls
          </h3>
          <span className={clsx("text-xs font-semibold px-3 py-1 rounded-full border flex items-center gap-1.5", verificationBadge.color, verificationBadge.bg)}>
            Status: {verificationBadge.label}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="verification-status-select" className="block text-xs text-textSecondary uppercase tracking-widest font-semibold mb-2">
              Verification Status
            </label>
            <select
              id="verification-status-select"
              value={verificationStatus}
              onChange={(e) => {
                setVerificationStatus(e.target.value);
                setVerificationSuccess(false);
                setVerificationError("");
              }}
              disabled={savingVerification}
              className="w-full text-sm bg-[#12141d] border border-border text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-accent/50 cursor-pointer disabled:opacity-50"
            >
              {VERIFICATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reviewer-notes-textarea" className="block text-xs text-textSecondary uppercase tracking-widest font-semibold mb-2">
              Reviewer Notes
            </label>
            <textarea
              id="reviewer-notes-textarea"
              value={reviewerNotes}
              onChange={(e) => {
                setReviewerNotes(e.target.value);
                setVerificationSuccess(false);
                setVerificationError("");
              }}
              disabled={savingVerification}
              placeholder="Enter official reviewer notes, legal verification comments, or audit findings..."
              rows={4}
              className="w-full text-sm bg-[#12141d] border border-border text-white rounded-xl p-4 focus:outline-none focus:border-accent/50 placeholder:text-textSecondary/50 resize-y min-h-[100px] disabled:opacity-50"
            />
          </div>

          {verificationError && (
            <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-xs text-danger flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{verificationError}</span>
            </div>
          )}

          {verificationSuccess && (
            <div className="p-3.5 rounded-xl bg-success/10 border border-success/20 text-xs text-success flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Verification status and reviewer notes updated successfully!</span>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              id="save-verification-btn"
              onClick={handleSaveVerification}
              disabled={savingVerification}
              className="px-6 py-2.5 rounded-xl bg-accent text-black font-bold hover:bg-accentHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
            >
              {savingVerification ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save / Update Verification"
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Tags */}
      {bill.tags && bill.tags.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="p-6 rounded-3xl bg-[#171a21] border border-border"
        >
          <h3 className="font-bold text-white mb-4">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {bill.tags.map((tag, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-lg bg-[#12141d] border border-border text-xs text-textSecondary font-semibold hover:border-accent/50 transition-colors"
              >
                {tag}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Metadata */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="p-6 rounded-3xl bg-[#171a21] border border-border"
      >
        <h3 className="font-bold text-white mb-4">Document Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-textSecondary uppercase tracking-widest font-semibold mb-1">Document ID</p>
            <p className="text-sm text-white font-mono">{bill._id}</p>
          </div>
          <div>
            <p className="text-xs text-textSecondary uppercase tracking-widest font-semibold mb-1">Upload Date</p>
            <p className="text-sm text-white">{new Date(bill.uploadedAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-textSecondary uppercase tracking-widest font-semibold mb-1">Bill Number</p>
            <p className="text-sm text-white">{bill.billNumber}</p>
          </div>
          <div>
            <p className="text-xs text-textSecondary uppercase tracking-widest font-semibold mb-1">Legislative Status</p>
            <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-full border inline-block", status.color, status.bg)}>
              {status.label}
            </span>
          </div>
          <div>
            <p className="text-xs text-textSecondary uppercase tracking-widest font-semibold mb-1">Verification Status</p>
            <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-full border inline-block", verificationBadge.color, verificationBadge.bg)}>
              {verificationBadge.label}
            </span>
          </div>
          {savedReviewerNotes && (
            <div className="md:col-span-2">
              <p className="text-xs text-textSecondary uppercase tracking-widest font-semibold mb-1">Reviewer Notes</p>
              <p className="text-sm text-white bg-[#12141d] p-3.5 rounded-xl border border-border leading-relaxed whitespace-pre-line">
                {savedReviewerNotes}
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Elite Bounty: Generate Legal Review Brief ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="p-6 rounded-3xl bg-[#171a21] border border-border"
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Gavel className="w-5 h-5 text-accent" />
            Legal Review Brief
          </h3>
          {briefData && (
            <span className="text-xs text-textSecondary">
              Generated {briefData.aiGenerated ? "with AI" : "from existing data"} ·{" "}
              {briefData.generatedAt ? new Date(briefData.generatedAt).toLocaleTimeString() : ""}
            </span>
          )}
        </div>

        <p className="text-sm text-textSecondary mb-4">
          Generate a structured legal review brief containing key clauses, detected issues, verification status, and reviewer notes for this record.
        </p>

        {briefError && (
          <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-xs text-danger flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{briefError}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            id="generate-legal-brief-btn"
            onClick={handleGenerateBrief}
            disabled={generatingBrief}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-[#0a0a0f] font-bold text-sm hover:bg-accentHover transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-accent"
          >
            {generatingBrief ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Gavel className="w-4 h-4" />
                Generate Legal Review Brief
              </>
            )}
          </button>

          {briefData && (
            <button
              id="download-brief-btn"
              onClick={handleDownloadBrief}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#12141d] border border-border text-white font-bold text-sm hover:bg-[#1e2030] hover:border-accent/40 transition-colors"
            >
              <Download className="w-4 h-4 text-accent" />
              Download Brief (PDF)
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Brief Preview Panel ── */}
      {briefData && (
        <motion.div
          ref={briefPreviewRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-3xl border border-accent/30 bg-[#0f1018] overflow-hidden"
        >
          {/* Brief Header */}
          <div className="p-5 bg-[#12141d] border-b border-border flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-accent uppercase tracking-widest font-bold mb-0.5">CivicSync AI · Legal Review Brief</p>
              <h2 className="text-base font-bold text-white">{briefData.title}</h2>
              <p className="text-xs text-textSecondary mt-0.5 font-mono">{briefData.billNumber}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-md bg-[#171a21] border border-border text-textSecondary">{briefData.documentType || "Bill"}</span>
              <span className="text-xs px-2.5 py-1 rounded-md bg-[#171a21] border border-border text-textSecondary">{briefData.jurisdiction || "Central"}</span>
              {briefData.riskLevel && (
                <span className={clsx("text-xs font-semibold px-2.5 py-1 rounded-md border",
                  briefData.riskLevel === "High" ? "text-danger bg-danger/10 border-danger/20" :
                  briefData.riskLevel === "Medium" ? "text-accent bg-accent/10 border-accent/20" :
                  "text-success bg-success/10 border-success/20"
                )}>
                  {briefData.riskLevel} Risk
                </span>
              )}
              {briefData.aiGenerated && (
                <span className="text-xs px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 font-semibold">AI-Enhanced</span>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">

            {/* Document Information */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-accent font-bold mb-3 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Document Information
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  ["Bill Number", briefData.billNumber],
                  ["Document Type", briefData.documentType || "Bill"],
                  ["Jurisdiction", briefData.jurisdiction || "Central"],
                  ["Category", briefData.category || "—"],
                  ["Date", briefData.uploadedAt ? new Date(briefData.uploadedAt).toLocaleDateString() : "—"],
                  ["Impact Score", `${briefData.impactScore ?? "—"}/100`],
                ].map(([label, value]) => (
                  <div key={label} className="p-3 rounded-xl bg-[#171a21] border border-border/50">
                    <p className="text-[10px] text-textSecondary uppercase tracking-wider font-semibold mb-0.5">{label}</p>
                    <p className="text-xs text-white font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border/40" />

            {/* 1. Executive Summary */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-accent font-bold mb-3 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" /> 1. Executive Summary
              </h4>
              <p className="text-sm text-textSecondary leading-relaxed whitespace-pre-line bg-[#171a21] p-4 rounded-xl border border-border/50">
                {briefData.executiveSummary || "Not available."}
              </p>
            </div>

            <div className="border-t border-border/40" />

            {/* 2. Key Clauses */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-accent font-bold mb-3 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> 2. Key Clauses
              </h4>
              {briefData.keyClauses && briefData.keyClauses.length > 0 ? (
                <ul className="space-y-2">
                  {briefData.keyClauses.map((clause, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-textSecondary bg-[#171a21] p-3.5 rounded-xl border border-border/50">
                      <span className="w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">{i + 1}</span>
                      <span className="leading-relaxed">{clause}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-textSecondary">No key clauses available for this record.</p>
              )}
            </div>

            <div className="border-t border-border/40" />

            {/* 3. Detected Issues */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-accent font-bold mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> 3. Detected Issues
              </h4>
              {briefData.detectedIssues && briefData.detectedIssues.length > 0 ? (
                <ul className="space-y-2">
                  {briefData.detectedIssues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-textSecondary p-3 rounded-xl bg-danger/5 border border-danger/15">
                      <AlertTriangle className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{issue}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-textSecondary p-3 bg-success/5 border border-success/15 rounded-xl">No significant issues detected in the available analysis.</p>
              )}
            </div>

            <div className="border-t border-border/40" />

            {/* 4. Verification Status */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-accent font-bold mb-3 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> 4. Verification Status
              </h4>
              {(() => {
                const norm = briefData.verificationStatus || "draft";
                const badge = VERIFICATION_STATUS_CONFIG[norm] || VERIFICATION_STATUS_CONFIG.draft;
                return (
                  <span className={clsx("inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-xl border", badge.color, badge.bg)}>
                    <ShieldCheck className="w-4 h-4" />
                    {badge.label}
                  </span>
                );
              })()}
            </div>

            <div className="border-t border-border/40" />

            {/* 5. Reviewer Notes */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-accent font-bold mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> 5. Reviewer Notes
              </h4>
              <p className="text-sm text-textSecondary leading-relaxed bg-[#171a21] p-4 rounded-xl border border-border/50 whitespace-pre-line">
                {briefData.reviewerNotes || "No reviewer notes have been added."}
              </p>
            </div>

            <div className="border-t border-border/40" />

            {/* 6. Risk Information */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-accent font-bold mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> 6. Risk Information
              </h4>
              <div className="flex flex-wrap items-center gap-3">
                {briefData.riskLevel && (
                  <span className={clsx("text-sm font-bold px-4 py-2 rounded-xl border",
                    briefData.riskLevel === "High" ? "text-danger bg-danger/10 border-danger/20" :
                    briefData.riskLevel === "Medium" ? "text-accent bg-accent/10 border-accent/20" :
                    "text-success bg-success/10 border-success/20"
                  )}>
                    Risk Level: {briefData.riskLevel}
                  </span>
                )}
                {briefData.impactScore != null && (
                  <span className="text-sm font-bold px-4 py-2 rounded-xl bg-[#171a21] border border-border text-accent">
                    Impact Score: {briefData.impactScore}/100
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-border/40" />

            {/* 7. Key Takeaways */}
            <div>
              <h4 className="text-xs uppercase tracking-widest text-accent font-bold mb-3 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" /> 7. Key Takeaways
              </h4>
              {briefData.keyTakeaways && briefData.keyTakeaways.length > 0 ? (
                <ul className="space-y-2">
                  {briefData.keyTakeaways.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-textSecondary">
                      <span className="text-accent font-bold flex-shrink-0">→</span>
                      <span className="leading-relaxed">{t}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-textSecondary">No key takeaways available.</p>
              )}
            </div>

            {/* Disclaimer */}
            <div className="border-t border-border/40 pt-4">
              <p className="text-xs text-textSecondary/60 italic leading-relaxed">
                ⚠️ <strong>Disclaimer:</strong> {briefData.disclaimer}
              </p>
            </div>

          </div>
        </motion.div>
      )}

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="flex gap-3"
      >
        <button
          onClick={() => navigate(`/dashboard/compare?bill=${bill._id}`)}
          className="flex-1 px-6 py-3 rounded-xl bg-accent/10 border border-accent/20 text-accent font-bold hover:bg-accent/20 transition-colors"
        >
          Compare with Other Bills
        </button>
        <button
          onClick={() => navigate("/dashboard/bills")}
          className="px-6 py-3 rounded-xl bg-[#2a2e3d] text-white font-bold hover:bg-[#323749] transition-colors"
        >
          Back to History
        </button>
      </motion.div>
    </div>
  );
}

