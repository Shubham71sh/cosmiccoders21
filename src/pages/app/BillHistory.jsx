import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Upload, Search, Filter, Trash2, Eye, Clock, CheckCircle2, AlertCircle, Loader2, RotateCcw, Landmark, Tag, ShieldCheck, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { getBills, deleteBill } from "../../services/billService";
import { SkeletonList } from "../../components/ui/Skeleton";
import EmptyState from "../../components/ui/EmptyState";

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

const RISK_CONFIG = {
  High: { label: "High Risk", color: "text-danger", bg: "bg-danger/10 border-danger/20" },
  Medium: { label: "Medium Risk", color: "text-accent", bg: "bg-accent/10 border-accent/20" },
  Low: { label: "Low Risk", color: "text-success", bg: "bg-success/10 border-success/20" },
};

const getDerivedDocType = (bill) => {
  if (bill.documentType) return bill.documentType;
  const t = (bill.title || "").toLowerCase();
  if (t.includes("act")) return "Act";
  if (t.includes("policy")) return "Policy";
  if (t.includes("regulation") || t.includes("rule")) return "Regulation";
  if (t.includes("notification") || t.includes("order")) return "Notification";
  return "Bill";
};

const getDerivedJurisdiction = (bill) => {
  if (bill.jurisdiction) return bill.jurisdiction;
  const t = (bill.title || "").toLowerCase();
  if (t.includes("state") || t.includes("pradesh") || t.includes("delhi") || t.includes("maharashtra")) return "State";
  if (t.includes("local") || t.includes("municipal") || t.includes("panchayat")) return "Local";
  return "Central";
};

const getDerivedRiskLevel = (bill) => {
  if (bill.riskLevel) return bill.riskLevel;
  const score = Number(bill.impactScore || 0);
  if (score >= 75) return "High";
  if (score >= 40) return "Medium";
  return "Low";
};

const normalizeVerificationStatus = (statusStr) => {
  if (!statusStr) return "draft";
  const s = String(statusStr).toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (s === "needs_review" || s === "needsreview") return "needs_review";
  if (s === "verified") return "verified";
  if (s === "rejected") return "rejected";
  return "draft";
};

export default function BillHistory() {
  const navigate = useNavigate();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ── Search & Filter State ──────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterDocType, setFilterDocType] = useState("all");
  const [filterJurisdiction, setFilterJurisdiction] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterVerification, setFilterVerification] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  // Fetch bills from backend
  const fetchBills = async (params = {}) => {
    setLoading(true);
    setError("");
    try {
      const filters = {
        page: 1,
        limit: 100, // Fetch active dataset for smooth client-side filtering
        ...params
      };
      
      const result = await getBills(filters);
      setBills(result.bills || []);
      setPagination({
        page: result.page || 1,
        pages: result.pages || 1,
        total: result.total || 0
      });
    } catch (err) {
      console.error("[BillHistory] Failed to fetch bills:", err);
      setError(err.message || "Failed to load bills. Please try again.");
      setBills([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  // Handle bill deletion
  const handleDeleteBill = async (billId, e) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this bill?")) return;

    try {
      await deleteBill(billId);
      fetchBills();
    } catch (err) {
      console.error("[BillHistory] Delete failed:", err);
      setError(err.message || "Failed to delete bill. Please try again.");
    }
  };

  const handleViewBill = (billId) => {
    navigate(`/dashboard/bills/${billId}`);
  };

  const handleResetFilters = () => {
    setSearch("");
    setFilterDocType("all");
    setFilterJurisdiction("all");
    setFilterCategory("all");
    setFilterVerification("all");
    setFilterRisk("all");
    setFilterStatus("all");
  };

  // Derive dynamic options from current dataset
  const availableCategories = Array.from(
    new Set(
      bills.flatMap((b) => [
        b.category,
        ...(Array.isArray(b.tags) ? b.tags : []),
      ]).filter(Boolean)
    )
  );

  const availableDocTypes = Array.from(
    new Set([
      "Bill", "Act", "Policy", "Regulation", "Notification",
      ...bills.map((b) => b.documentType || getDerivedDocType(b)).filter(Boolean)
    ])
  );

  const availableJurisdictions = Array.from(
    new Set([
      "Central", "State", "Local",
      ...bills.map((b) => b.jurisdiction || getDerivedJurisdiction(b)).filter(Boolean)
    ])
  );

  // Multi-Condition Filtering Engine
  const filtered = bills.filter((bill) => {
    // 1. Keyword search (case-insensitive across relevant fields)
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const titleMatch = (bill.title || "").toLowerCase().includes(q);
      const numMatch = (bill.billNumber || "").toLowerCase().includes(q);
      const summaryMatch = (bill.summary || "").toLowerCase().includes(q);
      const userImpactMatch = (bill.userImpact || "").toLowerCase().includes(q);
      const categoryMatch = (bill.category || "").toLowerCase().includes(q);
      const docTypeMatch = (bill.documentType || getDerivedDocType(bill)).toLowerCase().includes(q);
      const jurisdictionMatch = (bill.jurisdiction || getDerivedJurisdiction(bill)).toLowerCase().includes(q);
      const tagsMatch = Array.isArray(bill.tags) && bill.tags.some((t) => t.toLowerCase().includes(q));
      const keyPointsMatch = Array.isArray(bill.keyPoints) && bill.keyPoints.some((k) => k.toLowerCase().includes(q));
      const notesMatch = (bill.reviewerNotes || "").toLowerCase().includes(q);

      if (
        !titleMatch &&
        !numMatch &&
        !summaryMatch &&
        !userImpactMatch &&
        !categoryMatch &&
        !docTypeMatch &&
        !jurisdictionMatch &&
        !tagsMatch &&
        !keyPointsMatch &&
        !notesMatch
      ) {
        return false;
      }
    }

    // 2. Document Type Filter
    if (filterDocType !== "all") {
      const docType = (bill.documentType || getDerivedDocType(bill)).toLowerCase();
      if (docType !== filterDocType.toLowerCase()) return false;
    }

    // 3. Jurisdiction Filter
    if (filterJurisdiction !== "all") {
      const jur = (bill.jurisdiction || getDerivedJurisdiction(bill)).toLowerCase();
      if (jur !== filterJurisdiction.toLowerCase()) return false;
    }

    // 4. Category Filter
    if (filterCategory !== "all") {
      const cat = (bill.category || (bill.tags && bill.tags[0]) || "").toLowerCase();
      const tags = Array.isArray(bill.tags) ? bill.tags.map((t) => t.toLowerCase()) : [];
      if (cat !== filterCategory.toLowerCase() && !tags.includes(filterCategory.toLowerCase())) {
        return false;
      }
    }

    // 5. Verification Status Filter
    if (filterVerification !== "all") {
      const vStatus = normalizeVerificationStatus(bill.verificationStatus);
      if (vStatus !== filterVerification.toLowerCase()) return false;
    }

    // 6. Risk Level Filter
    if (filterRisk !== "all") {
      const risk = (bill.riskLevel || getDerivedRiskLevel(bill)).toLowerCase();
      if (risk !== filterRisk.toLowerCase()) return false;
    }

    // 7. Legislative Status Filter
    if (filterStatus !== "all") {
      if ((bill.status || "").toLowerCase() !== filterStatus.toLowerCase()) return false;
    }

    return true;
  });

  const hasActiveFilters =
    Boolean(search.trim()) ||
    filterDocType !== "all" ||
    filterJurisdiction !== "all" ||
    filterCategory !== "all" ||
    filterVerification !== "all" ||
    filterRisk !== "all" ||
    filterStatus !== "all";

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07 } },
  };
  const itemVariants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="space-y-6 pb-20 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Bill & Legal Record History</h1>
          <p className="text-sm text-textSecondary">Search, filter, and inspect all government bills analyzed through CivicSync AI.</p>
        </div>
        <button
          onClick={() => navigate("/dashboard/upload")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-[#0a0a0f] font-bold text-sm hover:bg-accentHover transition-colors shadow-glow-accent"
        >
          <Upload className="w-4 h-4" />
          Upload New Bill
        </button>
      </div>

      {/* Advanced Clause / Document Search & Filter Bar */}
      <div className="p-5 rounded-2xl bg-[#171a21] border border-border space-y-4">
        {/* Search Bar & Reset Control */}
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" />
            <input
              id="clause-search-input"
              type="text"
              placeholder="Search legal records by title, number, keyword, tags, or jurisdiction..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#12141d] border border-border rounded-xl py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-textMuted focus:outline-none focus:border-accent/50 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-white text-xs font-semibold px-1.5 py-0.5 rounded bg-white/5"
              >
                Clear
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              id="reset-filters-btn"
              onClick={handleResetFilters}
              className="w-full md:w-auto px-4 py-2.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs font-bold hover:bg-danger/20 transition-colors flex items-center justify-center gap-1.5 flex-shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          )}
        </div>

        {/* 5 Clause / Document Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-border/50">
          {/* Filter 1: Document Type */}
          <div>
            <label htmlFor="filter-doc-type" className="block text-[11px] text-textSecondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
              <FileText className="w-3 h-3 text-accent" />
              Document Type
            </label>
            <select
              id="filter-doc-type"
              value={filterDocType}
              onChange={(e) => setFilterDocType(e.target.value)}
              className="w-full bg-[#12141d] border border-border rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-accent/50 cursor-pointer"
            >
              <option value="all">All Types</option>
              {availableDocTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Filter 2: Jurisdiction */}
          <div>
            <label htmlFor="filter-jurisdiction" className="block text-[11px] text-textSecondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
              <Landmark className="w-3 h-3 text-accent" />
              Jurisdiction
            </label>
            <select
              id="filter-jurisdiction"
              value={filterJurisdiction}
              onChange={(e) => setFilterJurisdiction(e.target.value)}
              className="w-full bg-[#12141d] border border-border rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-accent/50 cursor-pointer"
            >
              <option value="all">All Jurisdictions</option>
              {availableJurisdictions.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>

          {/* Filter 3: Category */}
          <div>
            <label htmlFor="filter-category" className="block text-[11px] text-textSecondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
              <Tag className="w-3 h-3 text-accent" />
              Category
            </label>
            <select
              id="filter-category"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full bg-[#12141d] border border-border rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-accent/50 cursor-pointer"
            >
              <option value="all">All Categories</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Filter 4: Verification Status */}
          <div>
            <label htmlFor="filter-verification" className="block text-[11px] text-textSecondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-accent" />
              Verification
            </label>
            <select
              id="filter-verification"
              value={filterVerification}
              onChange={(e) => setFilterVerification(e.target.value)}
              className="w-full bg-[#12141d] border border-border rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-accent/50 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="needs_review">Needs Review</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Filter 5: Risk Level */}
          <div>
            <label htmlFor="filter-risk" className="block text-[11px] text-textSecondary uppercase tracking-wider font-semibold mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-accent" />
              Risk Level
            </label>
            <select
              id="filter-risk"
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value)}
              className="w-full bg-[#12141d] border border-border rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:border-accent/50 cursor-pointer"
            >
              <option value="all">All Risk Levels</option>
              <option value="High">High Risk</option>
              <option value="Medium">Medium Risk</option>
              <option value="Low">Low Risk</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <div className="text-center p-6 text-danger bg-danger/5 border border-danger/20 rounded-2xl">
          <p className="mb-2">{error}</p>
          <button 
            onClick={() => fetchBills()} 
            className="px-4 py-2 text-sm bg-danger/10 hover:bg-danger/20 rounded-lg transition-colors font-semibold text-danger"
          >
            Try Again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={hasActiveFilters ? "No legal records match your search or filters" : "No legal records found"}
          description={hasActiveFilters ? "Try changing your search keyword or resetting active filters." : "Upload your first bill or legal document to get started."}
          action={
            hasActiveFilters ? (
              <button
                onClick={handleResetFilters}
                className="px-6 py-2.5 rounded-xl bg-accent text-[#0a0a0f] font-bold text-sm hover:bg-accentHover transition-colors shadow-glow-accent"
              >
                Reset All Filters
              </button>
            ) : (
              <button
                onClick={() => navigate("/dashboard/upload")}
                className="px-6 py-2.5 rounded-xl bg-accent text-[#0a0a0f] font-bold text-sm hover:bg-accentHover transition-colors shadow-glow-accent"
              >
                Upload First Bill
              </button>
            )
          }
        />
      ) : (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-3">
          {filtered.map((bill) => {
            const status = STATUS_CONFIG[bill.status] || STATUS_CONFIG.pending;
            const docType = bill.documentType || getDerivedDocType(bill);
            const jur = bill.jurisdiction || getDerivedJurisdiction(bill);
            const riskLevel = bill.riskLevel || getDerivedRiskLevel(bill);
            const vStatusNorm = normalizeVerificationStatus(bill.verificationStatus);
            const vBadge = VERIFICATION_STATUS_CONFIG[vStatusNorm] || VERIFICATION_STATUS_CONFIG.draft;
            const rBadge = RISK_CONFIG[riskLevel] || RISK_CONFIG.Medium;

            return (
              <motion.div
                key={bill._id}
                variants={itemVariants}
                onClick={() => handleViewBill(bill._id)}
                className="p-5 rounded-2xl bg-[#171a21] border border-border hover:border-accent/40 transition-all cursor-pointer group space-y-3"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <FileText className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1.5 flex-wrap">
                      <div>
                        <h3 className="font-bold text-white text-base truncate group-hover:text-accent transition-colors">{bill.title}</h3>
                        <p className="text-xs text-textSecondary mt-0.5 font-mono">{bill.billNumber}</p>
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Document Type Badge */}
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#12141d] border border-border text-textSecondary">
                          {docType}
                        </span>

                        {/* Jurisdiction Badge */}
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#12141d] border border-border text-textSecondary">
                          {jur}
                        </span>

                        {/* Risk Level Badge */}
                        <span className={clsx("text-[11px] font-semibold px-2 py-0.5 rounded-md border", rBadge.color, rBadge.bg)}>
                          {rBadge.label}
                        </span>

                        {/* Verification Status Badge */}
                        <span className={clsx("text-[11px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1", vBadge.color, vBadge.bg)}>
                          <ShieldCheck className="w-3 h-3" />
                          {vBadge.label}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-textSecondary leading-relaxed mb-3 line-clamp-2">{bill.summary}</p>

                    {/* Metadata Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className="flex items-center gap-1.5 text-xs text-textSecondary">
                          <Clock className="w-3 h-3" />
                          {new Date(bill.uploadedAt).toLocaleDateString()}
                        </span>
                        <span className="text-xs font-semibold text-accent">Impact Score: {bill.impactScore}%</span>
                        {bill.tags && bill.tags.length > 0 && (
                          <div className="hidden sm:flex items-center gap-1">
                            {bill.tags.slice(0, 3).map((tag, idx) => (
                              <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-textSecondary font-mono">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleViewBill(bill._id); }}
                          title="View Details"
                          className="p-1.5 rounded-lg hover:bg-[#2a2e3d] text-textSecondary hover:text-white transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => handleDeleteBill(bill._id, e)}
                          title="Delete Bill"
                          className="p-1.5 rounded-lg hover:bg-danger/10 text-textSecondary hover:text-danger transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

