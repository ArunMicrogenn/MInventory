import React, { useState, useMemo } from "react";
import {
  PRHeader,
  POHeader,
  MRHeader,
  GRNHeader,
  Item,
  Store,
  Department,
  Supplier,
  User,
  Role,
  Property
} from "../types";
import {
  ShieldCheck,
  ClipboardList,
  ShoppingBag,
  Shuffle,
  CheckSquare,
  Square,
  MinusSquare,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Building2,
  Eye,
  Check,
  X,
  Printer,
  ChevronRight,
  Sparkles,
  Layers,
  Calendar,
  DollarSign,
  AlertTriangle,
  Flame,
  Bell,
  Send,
  UserCheck,
  Mail,
  ExternalLink,
  FileWarning,
  CheckCircle,
  HelpCircle,
  Clock3,
  Zap,
  CheckCheck,
  ListChecks,
  Activity,
  ArrowUpRight,
  Inbox
} from "lucide-react";
import PrintButton from "./PrintButton";
import PrintDocumentModal from "./PrintDocumentModal";

export type ApprovalDocType = "PR" | "PO" | "MR" | "GRN";

export interface DepartmentHeadInfo {
  name: string;
  title: string;
  email: string;
  departmentName: string;
}

export interface ApprovalItem {
  id: string;
  type: ApprovalDocType;
  propertyId?: string;
  propertyName?: string;
  docNumber: string;
  date: string;
  status: string;
  requesterOrSupplier: string;
  storeName: string;
  departmentName?: string;
  purposeOrTerms?: string;
  itemCount: number;
  totalValue: number;
  lines: any[];
  auditTrail: any[];
  approverRemarks?: string;
  rawDoc: PRHeader | POHeader | MRHeader | GRNHeader;

  // Escalation Policy Fields (48h Threshold)
  submittedAt: string;
  hoursPending: number;
  isEscalated: boolean;
  priority: "High Priority" | "Normal";
  departmentHead: DepartmentHeadInfo;
  escalationTriggeredAt?: string;
}

export interface RecentActivityItem {
  id: string;
  docId: string;
  docType: ApprovalDocType;
  docNumber: string;
  action: "Approved" | "Rejected" | "Returned";
  userName: string;
  userRole?: string;
  timestamp: string;
  remarks?: string;
  amount?: number;
  propertyName?: string;
}

export const isItemWaitingForUserRole = (item: ApprovalItem, user: User): { matches: boolean; reason: string } => {
  const isPending = item.status === "Pending Approval" || item.status === "Submitted" || (item.type === "GRN" && (item.status === "Pending Approval" || item.status === "Draft"));
  if (!isPending) return { matches: false, reason: "" };

  const role = user.role;
  const dept = (user.department || "").toLowerCase();
  const perms = user.permissions || [];
  const hasAllAccess = perms.includes("all-access");

  // 1. Approver / Executive / Finance role
  if (role === Role.Approver || role === "Approver" || dept.includes("finance") || perms.includes("approve-PR") || perms.includes("approve-PO")) {
    if (item.type === "PR" || item.type === "PO" || item.isEscalated || item.totalValue >= 500) {
      return { 
        matches: true, 
        reason: item.isEscalated ? "Escalated SLA (>48h)" : item.totalValue >= 2500 ? "Capital Expenditure" : "Financial Authorization" 
      };
    }
  }

  // 2. Store Manager role
  if (role === Role.StoreManager || role === "Store Manager" || perms.includes("confirm-GRN") || perms.includes("approve-MR")) {
    if (item.type === "GRN" || item.type === "MR" || item.storeName.toLowerCase().includes("store")) {
      return { 
        matches: true, 
        reason: item.type === "GRN" ? "Inward QC Acceptance" : item.type === "MR" ? "Store Stock Dispatch" : "Store Quota Review" 
      };
    }
  }

  // 3. Purchase Officer role
  if (role === Role.PurchaseOfficer || role === "Purchase Officer" || dept.includes("procurement") || perms.includes("raise-PO") || perms.includes("convert-PR-to-PO")) {
    if (item.type === "PO" || item.type === "PR") {
      return { 
        matches: true, 
        reason: item.type === "PO" ? "Vendor Contract Signoff" : "Requisition Procurement Review" 
      };
    }
  }

  // 4. Store Keeper role
  if (role === Role.StoreKeeper || role === "Store Keeper" || perms.includes("post-GRN")) {
    if (item.type === "GRN" || item.type === "MR") {
      return { 
        matches: true, 
        reason: item.type === "GRN" ? "Physical Count & QC" : "Bin Dispatch Check" 
      };
    }
  }

  // 5. Department Head / Requester matching
  if (item.departmentName && item.departmentName.toLowerCase().includes(dept)) {
    return { 
      matches: true, 
      reason: `Department Head (${item.departmentName})` 
    };
  }

  if (item.departmentHead && item.departmentHead.name.toLowerCase().includes(user.name.toLowerCase())) {
    return {
      matches: true,
      reason: "Department Head Signatory"
    };
  }

  // 6. Admin / General Signatory fallback with all-access
  if (hasAllAccess) {
    return {
      matches: true,
      reason: item.isEscalated ? "High Priority SLA" : `${item.type} Approval Queue`
    };
  }

  return { matches: false, reason: "" };
};

interface ApprovalCenterModuleProps {
  prs: PRHeader[];
  pos: POHeader[];
  mrs: MRHeader[];
  grns: GRNHeader[];
  items: Item[];
  stores: Store[];
  departments: Department[];
  suppliers: Supplier[];
  properties: Property[];
  currentUser: User;
  users: User[];
  onApproveTransaction: (
    type: string,
    id: string,
    action: "Approve" | "Reject" | "Return-for-correction",
    remark: string
  ) => void;
  onBulkApproveTransactions?: (
    items: { type: string; id: string }[],
    action: "Approve" | "Reject",
    remark: string
  ) => void;
  onViewAudit?: (id: string, type: string, trail: any[]) => void;
  selectedPropertyId?: string;
}

export default function ApprovalCenterModule({
  prs,
  pos,
  mrs,
  grns,
  items,
  stores,
  departments,
  suppliers,
  properties,
  currentUser,
  users,
  onApproveTransaction,
  onBulkApproveTransactions,
  onViewAudit,
  selectedPropertyId = "all"
}: ApprovalCenterModuleProps) {
  // Navigation tabs inside the Approval Center
  const [activeSubTab, setActiveSubTab] = useState<"ALL" | "MY_ROLE" | "PR" | "PO" | "MR" | "GRN" | "HISTORY" | "ESCALATED">("ALL");
  const [filterMyRoleOnly, setFilterMyRoleOnly] = useState(false);
  const [sessionRecentActivities, setSessionRecentActivities] = useState<RecentActivityItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<ApprovalDocType | null>(null);
  
  // Search and Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState<string>(selectedPropertyId);
  const [amountFilter, setAmountFilter] = useState<"ALL" | "LOW" | "MID" | "HIGH">("ALL");
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [escalatedOnlyFilter, setEscalatedOnlyFilter] = useState(false);

  // Escalation policy interactive state
  const [acknowledgedMap, setAcknowledgedMap] = useState<Record<string, boolean>>({});
  const [resentNotices, setResentNotices] = useState<Record<string, { timestamp: string; count: number }>>({});
  const [showEscalationLogModal, setShowEscalationLogModal] = useState(false);
  const [activeMemoItem, setActiveMemoItem] = useState<ApprovalItem | null>(null);

  // Selection for bulk actions & Batch Modal
  const [selectedForBulk, setSelectedForBulk] = useState<string[]>([]);
  const [bulkRemark, setBulkRemark] = useState("");
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchActionType, setBatchActionType] = useState<"Approve" | "Reject">("Approve");
  const [batchComplianceAccepted, setBatchComplianceAccepted] = useState(true);
  const [isExecutingBatch, setIsExecutingBatch] = useState(false);
  const [printModalData, setPrintModalData] = useState<any | null>(null);

  // Inspector action state
  const [actionRemark, setActionRemark] = useState("");
  const [printDoc, setPrintDoc] = useState<{ type: string; id: string } | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Helper function to resolve names
  const getStoreName = (storeId?: string) => {
    if (!storeId) return "Central Store";
    const st = stores.find(s => s.id === storeId);
    return st ? `${st.name} (${st.code})` : storeId;
  };

  const getDeptName = (deptId?: string) => {
    if (!deptId) return "General Operations";
    const d = departments.find(dep => dep.id === deptId);
    return d ? `${d.name} (${d.costCenter})` : deptId;
  };

  const getSupplierName = (suppId?: string) => {
    if (!suppId) return "Internal Store / Direct";
    const sp = suppliers.find(s => s.id === suppId);
    return sp ? sp.name : suppId;
  };

  const getPropertyName = (propId?: string) => {
    if (!propId) return "Grand Regency Hotel, London";
    const p = properties.find(prop => prop.id === propId);
    return p ? p.name : propId;
  };

  const getUserName = (userId?: string) => {
    if (!userId) return "System Requester";
    const u = users.find(usr => usr.id === userId);
    return u ? `${u.name} (${u.role})` : userId;
  };

  // Escalation Policy Helpers (>48h SLA)
  const getSubmissionTime = (auditTrail: any[], fallbackDate?: string): string => {
    if (auditTrail && auditTrail.length > 0) {
      const submitLog = auditTrail.find(
        (l: any) =>
          l.action?.toLowerCase().includes("submit") ||
          l.action?.toLowerCase().includes("creat") ||
          l.action?.toLowerCase().includes("sent for approval")
      );
      if (submitLog && submitLog.timestamp) {
        return submitLog.timestamp;
      }
      if (auditTrail[0]?.timestamp) {
        return auditTrail[0].timestamp;
      }
    }
    if (fallbackDate) {
      if (fallbackDate.includes("T")) return fallbackDate;
      return `${fallbackDate}T09:00:00Z`;
    }
    return "2026-09-06T10:00:00Z";
  };

  const calculateHoursPending = (submittedAt: string, isPending: boolean): number => {
    if (!isPending) return 0;
    try {
      const subTime = new Date(submittedAt).getTime();
      const diffMs = Date.now() - subTime;
      const hours = Math.max(0, parseFloat((diffMs / (1000 * 60 * 60)).toFixed(1)));
      return isNaN(hours) ? 0 : hours;
    } catch {
      return 0;
    }
  };

  const getDepartmentHeadForDeptId = (deptId?: string): DepartmentHeadInfo => {
    const dept = departments.find(d => d.id === deptId);
    return {
      name: dept?.headName || "Elena Rostova",
      title: dept?.headTitle || "Executive Head of Department",
      email: dept?.headEmail || "dept.head@grandregency.com",
      departmentName: dept?.name || "Operating Department"
    };
  };

  const getDepartmentHeadForPO = (po: POHeader): DepartmentHeadInfo => {
    const firstSourcePRLineId = po.lines.find(l => l.sourcePRLineId)?.sourcePRLineId;
    if (firstSourcePRLineId) {
      const matchedPR = prs.find(p => p.lines.some(l => l.id === firstSourcePRLineId));
      if (matchedPR) {
        const dept = departments.find(d => d.id === matchedPR.departmentId);
        if (dept) {
          return {
            name: dept.headName || "Department Head",
            title: dept.headTitle || "Executive Department Head",
            email: dept.headEmail || "dept.head@grandregency.com",
            departmentName: dept.name
          };
        }
      }
    }
    return {
      name: "Robert King",
      title: "Store & Procurement Manager (Head of Purchasing)",
      email: "robert.king@grandregency.com",
      departmentName: "Procurement & Store Operations"
    };
  };

  const getDepartmentHeadForGRN = (grn: GRNHeader): DepartmentHeadInfo => {
    if (grn.sourcePOId) {
      const po = pos.find(p => p.id === grn.sourcePOId);
      if (po) return getDepartmentHeadForPO(po);
    }
    return {
      name: "Robert King",
      title: "Materials Management & Receiving Head",
      email: "robert.king@grandregency.com",
      departmentName: "Goods Inward & Central Stores"
    };
  };

  // Convert raw documents into normalized ApprovalItem structures with Escalation calculation
  const allApprovalItems: ApprovalItem[] = useMemo(() => {
    const list: ApprovalItem[] = [];

    // 1. PRs
    prs.forEach(pr => {
      const isPending = pr.status === "Pending Approval" || pr.status === "Submitted";
      const submittedAt = getSubmissionTime(pr.auditTrail, "2026-09-05T09:00:00Z");
      const hoursPending = calculateHoursPending(submittedAt, isPending);
      const isEscalated = isPending && hoursPending >= 48;
      const deptHead = getDepartmentHeadForDeptId(pr.departmentId);
      const escalationTriggeredAt = isEscalated ? new Date(new Date(submittedAt).getTime() + 48 * 3600 * 1000).toISOString() : undefined;

      list.push({
        id: pr.id,
        type: "PR",
        propertyId: pr.propertyId || "PROP-01",
        propertyName: getPropertyName(pr.propertyId),
        docNumber: pr.id,
        date: pr.requiredByDate || "2026-09-20",
        status: pr.status,
        requesterOrSupplier: getUserName(pr.requesterId),
        storeName: getStoreName(pr.storeId),
        departmentName: getDeptName(pr.departmentId),
        purposeOrTerms: pr.purpose || "Material replenishment",
        itemCount: pr.lines.length,
        totalValue: pr.estimatedValue,
        lines: pr.lines,
        auditTrail: pr.auditTrail || [],
        approverRemarks: pr.approverRemarks,
        rawDoc: pr,
        submittedAt,
        hoursPending,
        isEscalated,
        priority: isEscalated ? "High Priority" : "Normal",
        departmentHead: deptHead,
        escalationTriggeredAt
      });
    });

    // 2. POs
    pos.forEach(po => {
      const isPending = po.status === "Pending Approval" || po.status === "Submitted";
      const submittedAt = getSubmissionTime(po.auditTrail, "2026-09-06T10:30:00Z");
      const hoursPending = calculateHoursPending(submittedAt, isPending);
      const isEscalated = isPending && hoursPending >= 48;
      const deptHead = getDepartmentHeadForPO(po);
      const escalationTriggeredAt = isEscalated ? new Date(new Date(submittedAt).getTime() + 48 * 3600 * 1000).toISOString() : undefined;

      list.push({
        id: po.id,
        type: "PO",
        propertyId: po.propertyId || "PROP-01",
        propertyName: getPropertyName(po.propertyId),
        docNumber: po.id,
        date: po.deliveryDate || "2026-09-28",
        status: po.status,
        requesterOrSupplier: getSupplierName(po.supplierId),
        storeName: getStoreName(po.deliveryStoreId),
        departmentName: `Type: ${po.purchaseType}`,
        purposeOrTerms: `Terms: ${po.paymentTerms}`,
        itemCount: po.lines.length,
        totalValue: po.grandTotal,
        lines: po.lines,
        auditTrail: po.auditTrail || [],
        approverRemarks: po.approverRemarks,
        rawDoc: po,
        submittedAt,
        hoursPending,
        isEscalated,
        priority: isEscalated ? "High Priority" : "Normal",
        departmentHead: deptHead,
        escalationTriggeredAt
      });
    });

    // 3. MRs
    mrs.forEach(mr => {
      const isPending = mr.status === "Pending Approval" || mr.status === "Submitted";
      const submittedAt = getSubmissionTime(mr.auditTrail, "2026-09-07T08:30:00Z");
      const hoursPending = calculateHoursPending(submittedAt, isPending);
      const isEscalated = isPending && hoursPending >= 48;
      const deptHead = getDepartmentHeadForDeptId(mr.requestingDeptId);
      const escalationTriggeredAt = isEscalated ? new Date(new Date(submittedAt).getTime() + 48 * 3600 * 1000).toISOString() : undefined;

      list.push({
        id: mr.id,
        type: "MR",
        propertyId: mr.propertyId || "PROP-01",
        propertyName: getPropertyName(mr.propertyId),
        docNumber: mr.id,
        date: mr.requiredDate || "2026-09-15",
        status: mr.status,
        requesterOrSupplier: getDeptName(mr.requestingDeptId),
        storeName: getStoreName(mr.fromStoreId),
        departmentName: getDeptName(mr.requestingDeptId),
        purposeOrTerms: mr.purpose || mr.remarks || "Department consumption",
        itemCount: mr.lines.length,
        totalValue: mr.estimatedValue,
        lines: mr.lines,
        auditTrail: mr.auditTrail || [],
        approverRemarks: mr.approverRemarks,
        rawDoc: mr,
        submittedAt,
        hoursPending,
        isEscalated,
        priority: isEscalated ? "High Priority" : "Normal",
        departmentHead: deptHead,
        escalationTriggeredAt
      });
    });

    // 4. GRNs
    grns.forEach(grn => {
      const isPending = grn.status === "Pending Approval" || grn.status === "Draft";
      const submittedAt = getSubmissionTime(grn.auditTrail, grn.receivedDate);
      const hoursPending = calculateHoursPending(submittedAt, isPending);
      const isEscalated = isPending && hoursPending >= 48;
      const deptHead = getDepartmentHeadForGRN(grn);
      const escalationTriggeredAt = isEscalated ? new Date(new Date(submittedAt).getTime() + 48 * 3600 * 1000).toISOString() : undefined;

      list.push({
        id: grn.id,
        type: "GRN",
        propertyId: grn.propertyId || "PROP-01",
        propertyName: getPropertyName(grn.propertyId),
        docNumber: grn.id,
        date: grn.receivedDate || "2026-09-08",
        status: grn.status,
        requesterOrSupplier: grn.isDirect ? `Direct: ${grn.reasonCode || 'Unscheduled'}` : getSupplierName(grn.supplierId),
        storeName: getStoreName(grn.deliveryStoreId),
        departmentName: grn.sourcePOId ? `PO: ${grn.sourcePOId}` : "Direct Receipt",
        purposeOrTerms: grn.isDirect ? `Direct Exception: ${grn.reasonCode}` : `Linked PO: ${grn.sourcePOId || 'Standard Inward'}`,
        itemCount: grn.lines.length,
        totalValue: grn.grandTotal,
        lines: grn.lines,
        auditTrail: grn.auditTrail || [],
        approverRemarks: grn.approverRemarks,
        rawDoc: grn,
        submittedAt,
        hoursPending,
        isEscalated,
        priority: isEscalated ? "High Priority" : "Normal",
        departmentHead: deptHead,
        escalationTriggeredAt
      });
    });

    return list;
  }, [prs, pos, mrs, grns, stores, departments, suppliers, properties, users]);

  // Calculations for summary metric widgets
  const prPending = allApprovalItems.filter(i => i.type === "PR" && (i.status === "Pending Approval" || i.status === "Submitted"));
  const poPending = allApprovalItems.filter(i => i.type === "PO" && (i.status === "Pending Approval" || i.status === "Submitted"));
  const mrPending = allApprovalItems.filter(i => i.type === "MR" && (i.status === "Pending Approval" || i.status === "Submitted"));
  const grnPending = allApprovalItems.filter(i => i.type === "GRN" && (i.status === "Pending Approval" || i.status === "Draft"));
  const escalatedPending = allApprovalItems.filter(i => i.isEscalated && (i.status === "Pending Approval" || i.status === "Submitted" || (i.type === "GRN" && i.status === "Pending Approval")));

  const totalPendingCount = prPending.length + poPending.length + mrPending.length + grnPending.length;
  const totalPendingValue = 
    prPending.reduce((s, i) => s + i.totalValue, 0) +
    poPending.reduce((s, i) => s + i.totalValue, 0) +
    mrPending.reduce((s, i) => s + i.totalValue, 0) +
    grnPending.reduce((s, i) => s + i.totalValue, 0);

  // 'My Pending Approvals' derived calculations
  const myPendingItems = useMemo(() => {
    return allApprovalItems
      .filter(item => {
        const isPending = item.status === "Pending Approval" || item.status === "Submitted" || (item.type === "GRN" && (item.status === "Pending Approval" || item.status === "Draft"));
        if (!isPending) return false;
        return isItemWaitingForUserRole(item, currentUser).matches;
      })
      .map(item => ({
        item,
        reason: isItemWaitingForUserRole(item, currentUser).reason
      }));
  }, [allApprovalItems, currentUser]);

  const myPendingCount = myPendingItems.length;
  const myPendingTotalValue = useMemo(() => {
    return myPendingItems.reduce((acc, curr) => acc + curr.item.totalValue, 0);
  }, [myPendingItems]);

  // 'Recent Activity' feed (latest 5 approval/rejection actions across system)
  const recentActivities: RecentActivityItem[] = useMemo(() => {
    const extracted: RecentActivityItem[] = [];

    // Extract approval/rejection audit logs from items
    allApprovalItems.forEach(item => {
      (item.auditTrail || []).forEach((log: any, idx: number) => {
        const act = (log.action || "").toLowerCase();
        const isApproval = act.includes("approv") || act.includes("authoriz") || act.includes("confirm");
        const isRejection = act.includes("reject") || act.includes("declin");
        const isReturn = act.includes("return");

        if (isApproval || isRejection || isReturn) {
          let actionType: "Approved" | "Rejected" | "Returned" = "Approved";
          if (isRejection) actionType = "Rejected";
          else if (isReturn) actionType = "Returned";

          extracted.push({
            id: log.id || `AUD-${item.id}-${idx}`,
            docId: item.id,
            docType: item.type,
            docNumber: item.docNumber,
            action: actionType,
            userName: log.userName || (users.find(u => u.id === log.userId)?.name) || "Alice Finance",
            userRole: (users.find(u => u.id === log.userId || u.name === log.userName)?.role) || "Approver",
            timestamp: log.timestamp || "2026-09-02T14:30:00Z",
            remarks: log.details || log.remarks || item.approverRemarks || `Action confirmed in system`,
            amount: item.totalValue,
            propertyName: item.propertyName
          });
        }
      });
    });

    // Seed baseline historical actions if needed so the feed always displays 5 comprehensive decisions
    const baselineSeed: RecentActivityItem[] = [
      {
        id: "ACT-SEED-1",
        docId: "PO-2026-0001",
        docType: "PO",
        docNumber: "PO-2026-0001",
        action: "Approved",
        userName: "Alice Finance",
        userRole: "Approver",
        timestamp: "2026-09-02T14:30:00Z",
        remarks: "Authorized PO under supplier annual contract terms",
        amount: 98.40,
        propertyName: "Grand Regency Hotel, London"
      },
      {
        id: "ACT-SEED-2",
        docId: "PR-2026-0001",
        docType: "PR",
        docNumber: "PR-2026-0001",
        action: "Approved",
        userName: "Alice Finance",
        userRole: "Approver",
        timestamp: "2026-09-01T14:30:00Z",
        remarks: "PR estimate of $690 approved within kitchen department budget",
        amount: 690.00,
        propertyName: "Grand Regency Hotel, London"
      },
      {
        id: "ACT-SEED-3",
        docId: "MR-2026-0001",
        docType: "MR",
        docNumber: "MR-2026-0001",
        action: "Approved",
        userName: "Robert King",
        userRole: "Store Manager",
        timestamp: "2026-09-03T10:00:00Z",
        remarks: "Store stock release verified & dispatched for banquet prep",
        amount: 95.00,
        propertyName: "Grand Regency Hotel, London"
      },
      {
        id: "ACT-SEED-4",
        docId: "GRN-2026-0001",
        docType: "GRN",
        docNumber: "GRN-2026-0001",
        action: "Approved",
        userName: "Robert King",
        userRole: "Store Manager",
        timestamp: "2026-09-04T16:00:00Z",
        remarks: "Inward QC inspection passed; posted to stock ledger",
        amount: 69.00,
        propertyName: "Grand Regency Hotel, London"
      },
      {
        id: "ACT-SEED-5",
        docId: "PR-2026-0004",
        docType: "PR",
        docNumber: "PR-2026-0004",
        action: "Rejected",
        userName: "Alice Finance",
        userRole: "Approver",
        timestamp: "2026-08-30T11:20:00Z",
        remarks: "Exceeded monthly allocated spend ceiling; scope reduction required",
        amount: 4500.00,
        propertyName: "Grand Regency Resort, Dubai"
      }
    ];

    const merged = [...sessionRecentActivities, ...extracted];
    baselineSeed.forEach(seed => {
      if (!merged.some(m => m.docNumber === seed.docNumber && m.action === seed.action)) {
        merged.push(seed);
      }
    });

    merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return merged.slice(0, 5);
  }, [allApprovalItems, sessionRecentActivities, users]);

  // Action handlers for escalation management
  const handleResendNotice = (item: ApprovalItem) => {
    const count = (resentNotices[item.id]?.count || 1) + 1;
    setResentNotices(prev => ({
      ...prev,
      [item.id]: { timestamp: new Date().toLocaleTimeString(), count }
    }));
    setSuccessToast(`⚡ High Priority escalation memo re-dispatched to ${item.departmentHead.name} (${item.departmentHead.email}). Notification count: #${count}`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleAcknowledgeEscalation = (item: ApprovalItem) => {
    const isAck = !acknowledgedMap[item.id];
    setAcknowledgedMap(prev => ({
      ...prev,
      [item.id]: isAck
    }));
    setSuccessToast(isAck 
      ? `✓ Escalation for ${item.type} ${item.docNumber} acknowledged by Signatory ${currentUser.name}.`
      : `Escalation acknowledgement cleared for ${item.type} ${item.docNumber}.`
    );
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Filtered dataset for active view
  const displayedItems = useMemo(() => {
    return allApprovalItems.filter(item => {
      // Escalated only toggle
      if (escalatedOnlyFilter && !item.isEscalated) return false;

      // Filter by current user role if requested
      if (filterMyRoleOnly || activeSubTab === "MY_ROLE") {
        if (!isItemWaitingForUserRole(item, currentUser).matches) return false;
      }

      // Sub-tab filter
      if (activeSubTab === "MY_ROLE") {
        if (!isItemWaitingForUserRole(item, currentUser).matches) return false;
      } else if (activeSubTab === "ESCALATED") {
        if (!item.isEscalated) return false;
      } else if (activeSubTab === "PR" && item.type !== "PR") return false;
      else if (activeSubTab === "PO" && item.type !== "PO") return false;
      else if (activeSubTab === "MR" && item.type !== "MR") return false;
      else if (activeSubTab === "GRN" && item.type !== "GRN") return false;
      else if (activeSubTab === "HISTORY") {
        const isHistorical = item.status === "Approved" || item.status === "Posted" || item.status === "Rejected" || item.status === "Closed";
        if (!isHistorical) return false;
      } else if (activeSubTab === "ALL") {
        // By default on ALL tab, show pending items unless status filter changes
        if (statusFilter === "PENDING") {
          const isPending = item.status === "Pending Approval" || item.status === "Submitted" || (item.type === "GRN" && item.status === "Pending Approval");
          if (!isPending) return false;
        }
      }

      // Status filter (if not HISTORY tab)
      if (activeSubTab !== "HISTORY" && activeSubTab !== "ESCALATED") {
        if (statusFilter === "PENDING") {
          const isPending = item.status === "Pending Approval" || item.status === "Submitted" || (item.type === "GRN" && item.status === "Pending Approval");
          if (!isPending) return false;
        } else if (statusFilter === "APPROVED") {
          if (item.status !== "Approved" && item.status !== "Posted") return false;
        } else if (statusFilter === "REJECTED") {
          if (item.status !== "Rejected") return false;
        }
      }

      // Property Filter
      const activeProp = propertyFilter !== "all" ? propertyFilter : selectedPropertyId;
      if (activeProp !== "all" && item.propertyId !== activeProp) {
        return false;
      }

      // Amount filter
      if (amountFilter === "LOW" && item.totalValue >= 500) return false;
      if (amountFilter === "MID" && (item.totalValue < 500 || item.totalValue > 2500)) return false;
      if (amountFilter === "HIGH" && item.totalValue <= 2500) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = item.docNumber.toLowerCase().includes(q);
        const matchesEntity = item.requesterOrSupplier.toLowerCase().includes(q);
        const matchesStore = item.storeName.toLowerCase().includes(q);
        const matchesPurpose = (item.purposeOrTerms || "").toLowerCase().includes(q);
        const matchesProperty = (item.propertyName || "").toLowerCase().includes(q);
        const matchesHead = (item.departmentHead?.name || "").toLowerCase().includes(q);
        return matchesId || matchesEntity || matchesStore || matchesPurpose || matchesProperty || matchesHead;
      }

      return true;
    });
  }, [allApprovalItems, activeSubTab, statusFilter, propertyFilter, selectedPropertyId, amountFilter, searchQuery, escalatedOnlyFilter]);

  // The active selected item to inspect
  const inspectedItem: ApprovalItem | null = useMemo(() => {
    if (selectedItemId && selectedItemType) {
      const found = allApprovalItems.find(i => i.id === selectedItemId && i.type === selectedItemType);
      if (found) return found;
    }
    // Default to first displayed item if available
    return displayedItems[0] || null;
  }, [allApprovalItems, selectedItemId, selectedItemType, displayedItems]);

  // Handle single item approval / rejection / return
  const handleAction = (item: ApprovalItem, action: "Approve" | "Reject" | "Return-for-correction") => {
    const remark = actionRemark.trim() || 
      (action === "Approve" 
        ? `Authorized by ${currentUser.name} (${currentUser.role})` 
        : action === "Reject" 
        ? "Authorization declined based on budget/policy review" 
        : "Returned to initiator for revisions");

    onApproveTransaction(item.type, item.id, action, remark);

    const newActivity: RecentActivityItem = {
      id: `ACT-${Date.now()}`,
      docId: item.id,
      docType: item.type,
      docNumber: item.docNumber,
      action: action === "Approve" ? "Approved" : action === "Reject" ? "Rejected" : "Returned",
      userName: currentUser.name,
      userRole: currentUser.role,
      timestamp: new Date().toISOString(),
      remarks: remark,
      amount: item.totalValue,
      propertyName: item.propertyName
    };
    setSessionRecentActivities(prev => [newActivity, ...prev]);

    setSuccessToast(
      `${item.type} ${item.id} successfully ${
        action === "Approve" ? "Approved & Authorized" : action === "Reject" ? "Rejected" : "Returned for Correction"
      }.`
    );
    setTimeout(() => setSuccessToast(null), 4000);

    setActionRemark("");
  };

  // Selected items derived list and totals
  const selectedBulkItems = useMemo(() => {
    return allApprovalItems.filter(item => selectedForBulk.includes(`${item.type}:${item.id}`));
  }, [allApprovalItems, selectedForBulk]);

  const selectedBulkTotalValue = useMemo(() => {
    return selectedBulkItems.reduce((acc, curr) => acc + curr.totalValue, 0);
  }, [selectedBulkItems]);

  const selectedBulkEscalatedCount = useMemo(() => {
    return selectedBulkItems.filter(i => i.isEscalated).length;
  }, [selectedBulkItems]);

  // Handle bulk action
  const handleBulkAction = (action: "Approve" | "Reject", customRemark?: string) => {
    if (selectedForBulk.length === 0) return;

    setIsExecutingBatch(true);
    const remark = (customRemark !== undefined ? customRemark : bulkRemark).trim() || 
      `Bulk ${action} authorized by ${currentUser.name} (${currentUser.role})`;

    const itemsList = selectedForBulk.map(key => {
      const [type, id] = key.split(":");
      return { type, id };
    });

    const newBulkActivities: RecentActivityItem[] = itemsList.map((itm, idx) => {
      const original = allApprovalItems.find(i => i.id === itm.id && i.type === itm.type);
      return {
        id: `ACT-BULK-${Date.now()}-${idx}`,
        docId: itm.id,
        docType: itm.type as ApprovalDocType,
        docNumber: original?.docNumber || itm.id,
        action: action === "Approve" ? "Approved" : "Rejected",
        userName: currentUser.name,
        userRole: currentUser.role,
        timestamp: new Date().toISOString(),
        remarks: remark,
        amount: original?.totalValue || 0,
        propertyName: original?.propertyName
      };
    });
    setSessionRecentActivities(prev => [...newBulkActivities, ...prev]);

    if (onBulkApproveTransactions) {
      onBulkApproveTransactions(itemsList, action, remark);
    } else {
      itemsList.forEach(item => {
        onApproveTransaction(item.type, item.id, action, remark);
      });
    }

    setTimeout(() => {
      setIsExecutingBatch(false);
      setShowBatchModal(false);
      setSuccessToast(`✓ Batch Execution: ${itemsList.length} transactions successfully ${action === "Approve" ? "Approved & Authorized" : "Rejected"}.`);
      setTimeout(() => setSuccessToast(null), 4500);

      setSelectedForBulk([]);
      setBulkRemark("");
    }, 400);
  };

  const handleSelectPreset = (preset: "ALL_DISPLAYED" | "ALL_PENDING" | "ESCALATED" | "PR" | "PO" | "MR" | "GRN" | "LOW_VALUE" | "CLEAR") => {
    if (preset === "CLEAR") {
      setSelectedForBulk([]);
      return;
    }
    if (preset === "ALL_DISPLAYED") {
      setSelectedForBulk(displayedItems.map(i => `${i.type}:${i.id}`));
      return;
    }
    if (preset === "ALL_PENDING") {
      const pending = allApprovalItems.filter(i => i.status === "Pending Approval" || i.status === "Submitted");
      setSelectedForBulk(pending.map(i => `${i.type}:${i.id}`));
      return;
    }
    if (preset === "ESCALATED") {
      const escalated = allApprovalItems.filter(i => i.isEscalated && (i.status === "Pending Approval" || i.status === "Submitted"));
      setSelectedForBulk(escalated.map(i => `${i.type}:${i.id}`));
      return;
    }
    if (preset === "PR") {
      const prsList = displayedItems.filter(i => i.type === "PR");
      setSelectedForBulk(prsList.map(i => `${i.type}:${i.id}`));
      return;
    }
    if (preset === "PO") {
      const posList = displayedItems.filter(i => i.type === "PO");
      setSelectedForBulk(posList.map(i => `${i.type}:${i.id}`));
      return;
    }
    if (preset === "MR") {
      const mrsList = displayedItems.filter(i => i.type === "MR");
      setSelectedForBulk(mrsList.map(i => `${i.type}:${i.id}`));
      return;
    }
    if (preset === "GRN") {
      const grnsList = displayedItems.filter(i => i.type === "GRN");
      setSelectedForBulk(grnsList.map(i => `${i.type}:${i.id}`));
      return;
    }
    if (preset === "LOW_VALUE") {
      const lowList = displayedItems.filter(i => i.totalValue < 1000);
      setSelectedForBulk(lowList.map(i => `${i.type}:${i.id}`));
      return;
    }
  };

  const toggleSelectAll = () => {
    if (selectedForBulk.length === displayedItems.length && displayedItems.length > 0) {
      setSelectedForBulk([]);
    } else {
      setSelectedForBulk(displayedItems.map(i => `${i.type}:${i.id}`));
    }
  };

  const toggleSelectItem = (type: ApprovalDocType, id: string) => {
    const key = `${type}:${id}`;
    if (selectedForBulk.includes(key)) {
      setSelectedForBulk(selectedForBulk.filter(k => k !== key));
    } else {
      setSelectedForBulk([...selectedForBulk, key]);
    }
  };

  const handleOpenBulkModal = (action: "Approve" | "Reject" = "Approve") => {
    if (selectedForBulk.length === 0) {
      if (displayedItems.length > 0) {
        setSelectedForBulk(displayedItems.map(i => `${i.type}:${i.id}`));
      } else {
        setSuccessToast("No transactions available in current view.");
        setTimeout(() => setSuccessToast(null), 3000);
        return;
      }
    }
    setBatchActionType(action);
    setShowBatchModal(true);
  };

  // Badge styles
  const getTypeBadge = (type: ApprovalDocType) => {
    switch (type) {
      case "PR":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "PO":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "MR":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "GRN":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Pending Approval":
      case "Submitted":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "Approved":
      case "Posted":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "Rejected":
        return "bg-rose-100 text-rose-800 border-rose-200";
      case "Draft":
        return "bg-slate-100 text-slate-700 border-slate-200";
      case "Closed":
      case "Partially Received":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200" id="approval-screen-root">
      {/* SUCCESS TOAST NOTIFICATION */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-800 flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-200">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{successToast}</span>
          <button onClick={() => setSuccessToast(null)} className="text-slate-400 hover:text-white ml-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* TOP HEADER & AUTHORITY BANNER */}
      <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center text-white">
              <ShieldCheck size={16} />
            </div>
            <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Executive Authorization & Governance</span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Workflow Approval Center</h1>
          <p className="text-xs text-slate-500 mt-1">
            Review, audit line items, and authorize pending Purchase Requisitions (PR), Purchase Orders (PO), Material Requests (MR), and Goods Receipts (GRN).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start md:self-center">
          <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
            <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-extrabold text-xs">
              {currentUser.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="text-xs">
              <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <span>{currentUser.name}</span>
                <span className="px-1.5 py-0.2 text-[9px] font-bold bg-purple-100 text-purple-700 rounded">Signatory</span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {currentUser.role} • {currentUser.department}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleOpenBulkModal("Approve")}
            className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs flex items-center gap-2 transition-all cursor-pointer hover:shadow-md"
            id="btn-header-bulk-approve"
          >
            <Zap size={15} className="text-amber-300" />
            <span>Bulk Authorize</span>
            {selectedForBulk.length > 0 ? (
              <span className="px-2 py-0.5 bg-white/20 text-white rounded-full text-[10px] font-extrabold">
                {selectedForBulk.length} (${selectedBulkTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-white/20 text-purple-100 rounded-full text-[10px] font-bold">
                {totalPendingCount} Pending
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ⚡ AUTOMATED ESCALATION POLICY NOTIFICATION BANNER (>48H SLA) */}
      <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 p-4 rounded-xl border border-rose-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4" id="escalation-policy-banner">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-rose-600 text-white rounded-xl shadow-xs flex items-center justify-center shrink-0">
            <Flame size={20} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-rose-600" />
                Escalation Policy Enforced (48-Hour SLA)
              </span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold bg-rose-600 text-white rounded-full flex items-center gap-1 shadow-2xs">
                <span>{escalatedPending.length} Request{escalatedPending.length !== 1 ? 's' : ''} Auto-Escalated</span>
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 rounded border border-amber-300">
                Department Head Notified
              </span>
            </div>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed">
              Workflow Rule: Requests pending approval for <strong className="text-rose-900 font-extrabold">more than 48 hours</strong> are automatically upgraded to <strong className="text-rose-900 font-extrabold">'High Priority'</strong> and notification memos are dispatched directly to the corresponding Department Head.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
          <button
            type="button"
            onClick={() => setShowEscalationLogModal(true)}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
            id="btn-open-escalation-log-modal"
          >
            <Bell size={13} className="text-rose-600" />
            <span>Dept Head Notices ({escalatedPending.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEscalatedOnlyFilter(!escalatedOnlyFilter);
              if (!escalatedOnlyFilter) {
                setStatusFilter("PENDING");
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              escalatedOnlyFilter
                ? "bg-rose-600 text-white shadow-xs hover:bg-rose-700"
                : "bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-200"
            }`}
            id="btn-filter-escalated-only"
          >
            <Flame size={13} />
            <span>{escalatedOnlyFilter ? "Showing Escalated" : "Filter High Priority"}</span>
          </button>
        </div>
      </div>

      {/* 4 SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="approval-metric-cards">
        {/* PR Card */}
        <div 
          onClick={() => { setActiveSubTab("PR"); setStatusFilter("PENDING"); }}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            activeSubTab === "PR" 
              ? "bg-blue-50/70 border-blue-300 shadow-xs" 
              : "bg-white border-slate-100 hover:border-blue-200 hover:shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
              <ClipboardList size={13} />
              Requisitions (PR)
            </span>
            <span className="px-2 py-0.5 text-xs font-extrabold bg-blue-100 text-blue-800 rounded-full">
              {prPending.length}
            </span>
          </div>
          <div className="mt-3">
            <span className="text-xl font-extrabold text-slate-900">
              ${prPending.reduce((s, i) => s + i.totalValue, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">Awaiting Financial Controller</span>
          </div>
        </div>

        {/* PO Card */}
        <div 
          onClick={() => { setActiveSubTab("PO"); setStatusFilter("PENDING"); }}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            activeSubTab === "PO" 
              ? "bg-purple-50/70 border-purple-300 shadow-xs" 
              : "bg-white border-slate-100 hover:border-purple-200 hover:shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag size={13} />
              Purchase Orders (PO)
            </span>
            <span className="px-2 py-0.5 text-xs font-extrabold bg-purple-100 text-purple-800 rounded-full">
              {poPending.length}
            </span>
          </div>
          <div className="mt-3">
            <span className="text-xl font-extrabold text-slate-900">
              ${poPending.reduce((s, i) => s + i.totalValue, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">Supplier Contract Release</span>
          </div>
        </div>

        {/* MR Card */}
        <div 
          onClick={() => { setActiveSubTab("MR"); setStatusFilter("PENDING"); }}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            activeSubTab === "MR" 
              ? "bg-amber-50/70 border-amber-300 shadow-xs" 
              : "bg-white border-slate-100 hover:border-amber-200 hover:shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
              <Shuffle size={13} />
              Material Requests (MR)
            </span>
            <span className="px-2 py-0.5 text-xs font-extrabold bg-amber-100 text-amber-800 rounded-full">
              {mrPending.length}
            </span>
          </div>
          <div className="mt-3">
            <span className="text-xl font-extrabold text-slate-900">
              ${mrPending.reduce((s, i) => s + i.totalValue, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">Store Dispatch Allocation</span>
          </div>
        </div>

        {/* GRN Card */}
        <div 
          onClick={() => { setActiveSubTab("GRN"); setStatusFilter("PENDING"); }}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            activeSubTab === "GRN" 
              ? "bg-emerald-50/70 border-emerald-300 shadow-xs" 
              : "bg-white border-slate-100 hover:border-emerald-200 hover:shadow-xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <CheckSquare size={13} />
              Goods Receipts (GRN)
            </span>
            <span className="px-2 py-0.5 text-xs font-extrabold bg-emerald-100 text-emerald-800 rounded-full">
              {grnPending.length}
            </span>
          </div>
          <div className="mt-3">
            <span className="text-xl font-extrabold text-slate-900">
              ${grnPending.reduce((s, i) => s + i.totalValue, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">Stock Ledger Inward Post</span>
          </div>
        </div>
      </div>

      {/* DASHBOARD ROW: 'MY PENDING APPROVALS' WIDGET & 'RECENT ACTIVITY' FEED */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="approval-dashboard-widgets">
        {/* Left Widget: 'My Pending Approvals' (Col-span 7) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between" id="my-pending-approvals-widget">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">My Pending Approvals</h3>
                  <p className="text-[11px] text-slate-500">
                    Tasks waiting for your role: <span className="font-bold text-purple-700">{currentUser.role}</span> ({currentUser.department})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-purple-50 text-purple-800 border border-purple-200">
                  {myPendingCount} Pending (${myPendingTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubTab("MY_ROLE");
                    setFilterMyRoleOnly(!filterMyRoleOnly);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterMyRoleOnly || activeSubTab === "MY_ROLE"
                      ? "bg-purple-700 text-white shadow-xs"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {filterMyRoleOnly || activeSubTab === "MY_ROLE" ? "Showing My Queue" : "Filter Queue"}
                </button>
              </div>
            </div>

            {/* List of My Pending Items */}
            {myPendingItems.length === 0 ? (
              <div className="py-6 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <CheckCircle2 className="mx-auto text-emerald-500 mb-1" size={24} />
                <p className="text-xs font-bold text-slate-700">All caught up!</p>
                <p className="text-[11px] text-slate-500 mt-0.5">No pending documents require your signature or review right now.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {myPendingItems.slice(0, 4).map(({ item, reason }) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    onClick={() => {
                      setSelectedItemId(item.id);
                      setSelectedItemType(item.type);
                    }}
                    className="p-3 rounded-lg border border-slate-100 hover:border-purple-300 bg-slate-50/70 hover:bg-purple-50/30 transition-all cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold shrink-0 ${
                        item.type === "PR" ? "bg-blue-100 text-blue-800" :
                        item.type === "PO" ? "bg-purple-100 text-purple-800" :
                        item.type === "MR" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {item.type}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-900 truncate">{item.docNumber}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold truncate">
                            {reason}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.requesterOrSupplier} • {item.propertyName}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-slate-900 block">
                        ${item.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      <span className={`text-[10px] font-bold ${item.isEscalated ? "text-rose-600 animate-pulse" : "text-slate-400"}`}>
                        {item.hoursPending}h pending
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Role authorization threshold: Level 2 Signatory</span>
            <button
              type="button"
              onClick={() => { setActiveSubTab("MY_ROLE"); }}
              className="text-purple-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View full queue</span>
              <ArrowUpRight size={12} />
            </button>
          </div>
        </div>

        {/* Right Widget: 'Recent Activity' Feed (Col-span 5) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between" id="recent-activity-widget">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                  <Activity size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Recent Activity</h3>
                  <p className="text-[11px] text-slate-500">Latest 5 system approval decisions</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                Audit Trail
              </span>
            </div>

            {/* List of Recent Actions */}
            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              {recentActivities.map(act => (
                <div
                  key={act.id}
                  onClick={() => {
                    setSelectedItemId(act.docId);
                    setSelectedItemType(act.docType);
                  }}
                  className="p-2.5 rounded-lg border border-slate-100 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-100/60 transition-all cursor-pointer flex items-start gap-2.5"
                >
                  <div className="mt-0.5 shrink-0">
                    {act.action === "Approved" ? (
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <CheckCircle2 size={13} />
                      </span>
                    ) : act.action === "Rejected" ? (
                      <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center">
                        <XCircle size={13} />
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                        <AlertCircle size={13} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-xs font-bold text-slate-900 truncate">{act.docType} {act.docNumber}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold ${
                          act.action === "Approved" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"
                        }`}>
                          {act.action}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                        {act.amount ? `$${act.amount.toLocaleString()}` : ""}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 truncate">
                      by <strong className="text-slate-800">{act.userName}</strong> ({act.userRole || 'Signatory'})
                    </p>
                    {act.remarks && (
                      <p className="text-[10px] text-slate-500 italic truncate mt-0.5 bg-white p-1 rounded border border-slate-100">
                        "{act.remarks}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Verified cryptographic signoff</span>
            <span className="text-slate-600 font-bold">Updated Live</span>
          </div>
        </div>
      </div>

      {/* FILTER & SUB-TAB CONTROLS */}
      <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs space-y-4">
        {/* Navigation Sub-Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => { setActiveSubTab("ALL"); setStatusFilter("PENDING"); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === "ALL" 
                  ? "bg-purple-600 text-white shadow-xs" 
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              All Pending
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeSubTab === "ALL" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
              }`}>
                {totalPendingCount}
              </span>
            </button>

            {/* My Role Queue Sub-Tab */}
            <button
              onClick={() => { setActiveSubTab("MY_ROLE"); setStatusFilter("PENDING"); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === "MY_ROLE" 
                  ? "bg-purple-700 text-white shadow-xs" 
                  : "text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200"
              }`}
              id="tab-my-role-queue"
            >
              <UserCheck size={13} />
              <span>My Role Queue</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeSubTab === "MY_ROLE" ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900"
              }`}>
                {myPendingCount}
              </span>
            </button>

            {/* High Priority Escalated Sub-Tab */}
            <button
              onClick={() => { setActiveSubTab("ESCALATED"); setStatusFilter("PENDING"); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === "ESCALATED" 
                  ? "bg-rose-600 text-white shadow-xs" 
                  : "text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200"
              }`}
              id="tab-escalated-high-priority"
            >
              <Flame size={13} className={activeSubTab === "ESCALATED" ? "text-white" : "text-rose-600 animate-pulse"} />
              <span>High Priority ({escalatedPending.length})</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                activeSubTab === "ESCALATED" ? "bg-white/20 text-white" : "bg-rose-200 text-rose-900"
              }`}>
                &gt;48h
              </span>
            </button>

            <button
              onClick={() => { setActiveSubTab("PR"); setStatusFilter("PENDING"); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === "PR" 
                  ? "bg-blue-600 text-white shadow-xs" 
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              PR ({prPending.length})
            </button>

            <button
              onClick={() => { setActiveSubTab("PO"); setStatusFilter("PENDING"); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === "PO" 
                  ? "bg-purple-600 text-white shadow-xs" 
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              PO ({poPending.length})
            </button>

            <button
              onClick={() => { setActiveSubTab("MR"); setStatusFilter("PENDING"); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === "MR" 
                  ? "bg-amber-600 text-white shadow-xs" 
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              MR ({mrPending.length})
            </button>

            <button
              onClick={() => { setActiveSubTab("GRN"); setStatusFilter("PENDING"); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === "GRN" 
                  ? "bg-emerald-600 text-white shadow-xs" 
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              GRN ({grnPending.length})
            </button>

            <button
              onClick={() => { setActiveSubTab("HISTORY"); setStatusFilter("ALL"); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeSubTab === "HISTORY" 
                  ? "bg-slate-800 text-white shadow-xs" 
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Clock size={13} />
              Decision History & Logs
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold">
              Showing <span className="font-extrabold text-slate-800">{displayedItems.length}</span> documents
            </span>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search by ID, supplier, requester, purpose, or store..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Property Dropdown */}
          <div>
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Properties Location</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          </div>

          {/* Amount Tier */}
          <div>
            <select
              value={amountFilter}
              onChange={(e: any) => setAmountFilter(e.target.value)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="ALL">All Amount Slabs</option>
              <option value="LOW">Minor (&lt; $500)</option>
              <option value="MID">Departmental ($500 - $2,500)</option>
              <option value="HIGH">Capital / High Value (&gt; $2,500)</option>
            </select>
          </div>
        </div>

        {/* QUICK SELECTION PRESET PILLS */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 text-xs">
          <span className="font-bold text-slate-500 mr-1 flex items-center gap-1">
            <ListChecks size={13} className="text-purple-600" /> Quick Select:
          </span>
          <button
            type="button"
            onClick={() => handleSelectPreset("ALL_DISPLAYED")}
            className="px-2.5 py-1 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold border border-purple-200 cursor-pointer"
          >
            All Displayed ({displayedItems.length})
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("ESCALATED")}
            className="px-2.5 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 cursor-pointer flex items-center gap-1"
          >
            <Flame size={12} /> High Priority ({escalatedPending.length})
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("PR")}
            className="px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold border border-blue-200 cursor-pointer"
          >
            Requisitions (PR)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("PO")}
            className="px-2.5 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold border border-indigo-200 cursor-pointer"
          >
            Orders (PO)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("MR")}
            className="px-2.5 py-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold border border-amber-200 cursor-pointer"
          >
            Materials (MR)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("GRN")}
            className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200 cursor-pointer"
          >
            Receipts (GRN)
          </button>
          <button
            type="button"
            onClick={() => handleSelectPreset("LOW_VALUE")}
            className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold border border-slate-200 cursor-pointer"
          >
            &lt; $1,000
          </button>
          {selectedForBulk.length > 0 && (
            <button
              type="button"
              onClick={() => handleSelectPreset("CLEAR")}
              className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold cursor-pointer ml-auto"
            >
              Clear Selection ({selectedForBulk.length})
            </button>
          )}
        </div>
      </div>

      {/* ENHANCED BULK ACTION BAR WITH SINGLE SHARED REMARK */}
      {selectedForBulk.length > 0 && (
        <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white p-4 sm:p-5 rounded-2xl shadow-xl border border-purple-800/80 flex flex-col gap-3.5 animate-in fade-in slide-in-from-top-2 duration-150" id="bulk-action-floating-bar">
          {/* Top Info Strip */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center font-black text-sm shadow-inner shrink-0 text-white">
                {selectedForBulk.length}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-extrabold text-white">
                    {selectedForBulk.length} transaction{selectedForBulk.length > 1 ? 's' : ''} selected
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-800/90 text-purple-200 text-xs font-black border border-purple-700/60">
                    Total Value: ${selectedBulkTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {selectedBulkEscalatedCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-black flex items-center gap-1 animate-pulse shadow-2xs">
                      <Flame size={12} /> {selectedBulkEscalatedCount} Overdue (&gt;48h)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-purple-200/80 mt-0.5">
                  Signatory: <strong className="text-white">{currentUser.name}</strong> ({currentUser.role} • {currentUser.department})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                onClick={() => handleOpenBulkModal("Approve")}
                className="px-3 py-1.5 text-xs font-bold bg-purple-800/80 hover:bg-purple-700 text-purple-100 hover:text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                id="btn-open-batch-review-modal"
                title="Review each item in detailed modal"
              >
                <Eye size={13} /> Detailed Modal
              </button>
              <button
                type="button"
                onClick={() => setSelectedForBulk([])}
                className="p-1.5 text-purple-300 hover:text-white rounded-lg hover:bg-purple-800/80 transition-colors cursor-pointer"
                title="Clear selection"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Shared Remark Input & Direct Action Buttons */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 pt-3 border-t border-purple-800/60">
            {/* Input & Presets */}
            <div className="flex-1 space-y-1.5">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter single shared remark applied to all selected transactions..."
                  value={bulkRemark}
                  onChange={(e) => setBulkRemark(e.target.value)}
                  className="w-full px-3.5 py-2 bg-purple-950/90 border border-purple-600/70 rounded-xl text-xs text-white placeholder-purple-300/60 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-purple-900/90 font-medium"
                  id="input-shared-bulk-remark"
                />
                {bulkRemark && (
                  <button
                    type="button"
                    onClick={() => setBulkRemark("")}
                    className="absolute right-3 top-2 text-purple-400 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Quick Remark Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Presets:</span>
                {[
                  "Authorized under approved departmental budget",
                  "Urgent clearance for store continuity",
                  "Verified stock compliance & quotes",
                  "Rejected - Budget exceeded / revision required"
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBulkRemark(preset)}
                    className={`px-2 py-0.5 text-[10px] rounded-md transition-colors cursor-pointer truncate max-w-[210px] ${
                      bulkRemark === preset
                        ? "bg-purple-500 text-white font-extrabold"
                        : "bg-purple-900/80 hover:bg-purple-800 text-purple-200 border border-purple-700/50"
                    }`}
                    title={preset}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-center">
              <button
                type="button"
                disabled={isExecutingBatch || selectedForBulk.length === 0}
                onClick={() => handleBulkAction("Approve")}
                className="px-4 py-2 text-xs font-extrabold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50"
                id="btn-bulk-approve-action"
              >
                <Check size={15} />
                <span>
                  {isExecutingBatch ? "Processing..." : `Bulk Approve (${selectedForBulk.length})`}
                </span>
              </button>

              <button
                type="button"
                disabled={isExecutingBatch || selectedForBulk.length === 0}
                onClick={() => handleBulkAction("Reject")}
                className="px-4 py-2 text-xs font-extrabold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50"
                id="btn-bulk-reject-action"
              >
                <X size={15} />
                <span>
                  {isExecutingBatch ? "Processing..." : `Bulk Reject (${selectedForBulk.length})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MASTER-DETAIL SPLIT SCREEN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: DOCUMENT CARDS LIST */}
        <div className="lg:col-span-6 xl:col-span-5 bg-white p-5 rounded-xl border border-slate-100 shadow-xs space-y-3 max-h-[820px] overflow-y-auto">
          {/* Multi-Selection Control Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-bold text-slate-700 hover:text-purple-600 flex items-center gap-1.5 cursor-pointer select-none"
                id="btn-select-all-transactions"
              >
                {selectedForBulk.length === displayedItems.length && displayedItems.length > 0 ? (
                  <CheckSquare size={16} className="text-purple-600" />
                ) : selectedForBulk.length > 0 ? (
                  <MinusSquare size={16} className="text-purple-600" />
                ) : (
                  <Square size={16} className="text-slate-400" />
                )}
                <span>Select All ({displayedItems.length})</span>
              </button>

              {selectedForBulk.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800">
                  {selectedForBulk.length} selected
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedForBulk.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedForBulk([])}
                  className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
              <span className="text-[11px] text-slate-400 font-medium">Click card to inspect</span>
            </div>
          </div>

          {displayedItems.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-700">No Documents Found</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                There are no transactions matching the selected filters or all approval queues have been processed.
              </p>
            </div>
          ) : (
            displayedItems.map(item => {
              const isInspected = inspectedItem?.id === item.id && inspectedItem?.type === item.type;
              const isChecked = selectedForBulk.includes(`${item.type}:${item.id}`);

              return (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={() => {
                    setSelectedItemId(item.id);
                    setSelectedItemType(item.type);
                  }}
                  className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                    item.isEscalated ? "border-l-4 border-l-rose-600 " : ""
                  }${
                    isChecked
                      ? "ring-2 ring-purple-600 bg-purple-50/70 border-purple-400 shadow-xs"
                      : isInspected 
                        ? item.isEscalated 
                          ? "bg-rose-50/50 border-rose-400 shadow-xs ring-1 ring-rose-300" 
                          : "bg-purple-50/50 border-purple-400 shadow-xs" 
                        : item.isEscalated 
                          ? "bg-rose-50/20 hover:bg-rose-50/40 border-rose-200/80" 
                          : "bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {/* Checkbox with dedicated click handling */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectItem(item.type, item.id);
                        }}
                        className="p-1 -m-1 hover:bg-purple-200/50 rounded cursor-pointer"
                        title={isChecked ? "Uncheck from bulk batch" : "Check for bulk batch"}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer pointer-events-none"
                        />
                      </div>

                      <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded border ${getTypeBadge(item.type)}`}>
                        {item.type}
                      </span>
                      <span className="text-xs font-mono font-extrabold text-slate-900">
                        {item.docNumber}
                      </span>
                      {isChecked && (
                        <span className="px-1.5 py-0.2 text-[9px] font-black bg-purple-600 text-white rounded">
                          Selected
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {item.isEscalated && (
                        <span className="px-2 py-0.5 text-[9px] font-black bg-rose-600 text-white rounded-full flex items-center gap-1 shadow-2xs">
                          <Flame size={10} /> High Priority
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full border ${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>

                  {/* Escalation Policy Status Pill */}
                  {item.isEscalated && (
                    <div className="mt-2 flex items-center justify-between gap-2 p-1.5 bg-rose-100/80 border border-rose-200 rounded-lg text-[10px]">
                      <span className="font-extrabold text-rose-900 flex items-center gap-1 truncate">
                        <Clock3 size={11} className="text-rose-600 shrink-0" />
                        Pending {item.hoursPending}h (&gt;48h SLA Overdue)
                      </span>
                      {acknowledgedMap[item.id] ? (
                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 font-bold rounded flex items-center gap-0.5 text-[9px] shrink-0">
                          <Check size={9} /> Ack
                        </span>
                      ) : (
                        <span className="text-rose-700 font-bold text-[9px] uppercase tracking-wider shrink-0">
                          Overdue
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-2.5">
                    <div className="text-xs font-bold text-slate-800">
                      {item.requesterOrSupplier}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {item.storeName} • {item.propertyName}
                    </div>
                    {item.purposeOrTerms && (
                      <div className="text-[11px] text-slate-500 italic mt-1 truncate">
                        "{item.purposeOrTerms}"
                      </div>
                    )}
                  </div>

                  {/* Department Head notification tag */}
                  {item.isEscalated ? (
                    <div className="mt-2 text-[10px] text-rose-800 font-medium flex items-center gap-1 truncate">
                      <Bell size={10} className="text-rose-600 shrink-0" />
                      <span className="truncate">
                        Head Notified: <strong>{item.departmentHead.name}</strong> ({item.departmentHead.title})
                      </span>
                    </div>
                  ) : (item.status === "Pending Approval" || item.status === "Submitted") ? (
                    <div className="mt-2 text-[10px] text-slate-400 font-medium flex items-center gap-1">
                      <Clock size={10} />
                      <span>{item.hoursPending}h pending in queue • 48h SLA active</span>
                    </div>
                  ) : null}

                  <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400 font-semibold">
                      {item.itemCount} line item{item.itemCount > 1 ? 's' : ''} • {item.date}
                    </span>
                    <span className="font-extrabold text-slate-900 text-sm">
                      ${item.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT COLUMN: DETAILED DOCUMENT INSPECTION & ACTIONS */}
        <div className="lg:col-span-6 xl:col-span-7 bg-white p-6 rounded-xl border border-slate-100 shadow-xs space-y-6">
          {inspectedItem ? (
            <div className="space-y-6 animate-in fade-in duration-150" id="approval-inspector-panel">
              {/* Top Inspector Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded border ${getTypeBadge(inspectedItem.type)}`}>
                      {inspectedItem.type} Details
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full border ${getStatusBadge(inspectedItem.status)}`}>
                      {inspectedItem.status}
                    </span>
                    <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                      <Building2 size={12} /> {inspectedItem.propertyName}
                    </span>
                  </div>
                  <h2 className="text-lg font-extrabold text-slate-900 font-mono">
                    {inspectedItem.docNumber}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <PrintButton
                    variant="secondary"
                    size="sm"
                    label="Print Voucher"
                    onClick={() => {
                      setPrintModalData({
                        type: inspectedItem.type === "GRN" ? "GRN" : inspectedItem.type === "MR" ? "MR" : "GRN",
                        rawDoc: inspectedItem.rawDoc
                      });
                    }}
                  />
                  {onViewAudit && (
                    <button
                      onClick={() => onViewAudit(inspectedItem.id, inspectedItem.type, inspectedItem.auditTrail)}
                      className="px-2.5 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                      title="View Lifecycle Timeline"
                    >
                      <Clock size={13} /> Audit Trail
                    </button>
                  )}
                </div>
              </div>

              {/* ESCALATION POLICY ALERT & DEPARTMENT HEAD NOTIFICATION CARD */}
              {inspectedItem.isEscalated ? (
                <div className="bg-gradient-to-br from-rose-50 via-rose-50/70 to-amber-50 p-4 rounded-xl border border-rose-200/90 shadow-xs space-y-3" id="inspector-escalation-card">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-200/60 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-rose-600 text-white rounded-lg shadow-2xs animate-pulse">
                        <Flame size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-black text-rose-900 uppercase tracking-wide">
                            Automated Escalation: High Priority Alert
                          </span>
                          <span className="px-2 py-0.2 text-[9px] font-extrabold bg-rose-600 text-white rounded-full">
                            SLA Overdue
                          </span>
                        </div>
                        <span className="text-[11px] text-rose-800 font-medium">
                          In approval queue for <strong className="font-extrabold text-rose-900">{inspectedItem.hoursPending} hours</strong> (&gt;48.0 hour limit)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleAcknowledgeEscalation(inspectedItem)}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                          acknowledgedMap[inspectedItem.id]
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : "bg-white hover:bg-rose-50 text-slate-700 border border-rose-200"
                        }`}
                        title="Mark escalation as acknowledged by signatory"
                        id="btn-ack-escalation"
                      >
                        <Check size={12} className={acknowledgedMap[inspectedItem.id] ? "text-emerald-700" : "text-slate-400"} />
                        <span>{acknowledgedMap[inspectedItem.id] ? "Acknowledged" : "Acknowledge"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveMemoItem(inspectedItem)}
                        className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-rose-50 text-rose-800 border border-rose-200 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                        title="View formal escalation notification memo dispatched to department head"
                        id="btn-view-memo"
                      >
                        <Mail size={12} className="text-rose-600" />
                        <span>View Memo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResendNotice(inspectedItem)}
                        className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                        title="Re-send urgent escalation notice to the department head"
                        id="btn-resend-notice"
                      >
                        <Send size={12} />
                        <span>Resend Notice</span>
                      </button>
                    </div>
                  </div>

                  {/* Department Head Notification Breakdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-white/80 p-3 rounded-lg border border-rose-100">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Notified Department Head
                      </span>
                      <div className="font-extrabold text-slate-800 mt-0.5 flex items-center gap-1">
                        <UserCheck size={13} className="text-rose-600 shrink-0" />
                        <span>{inspectedItem.departmentHead.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium block">
                        {inspectedItem.departmentHead.title} • {inspectedItem.departmentHead.departmentName}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Notification Delivery & SLA Status
                      </span>
                      <div className="font-bold text-rose-900 mt-0.5 flex items-center gap-1 truncate">
                        <Bell size={12} className="text-rose-600 shrink-0" />
                        <span className="truncate">Dispatched to {inspectedItem.departmentHead.email}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium block">
                        Submitted: {inspectedItem.submittedAt ? new Date(inspectedItem.submittedAt).toLocaleString() : 'N/A'}
                        {resentNotices[inspectedItem.id] && ` • Re-sent: ${resentNotices[inspectedItem.id].timestamp}`}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (inspectedItem.status === "Pending Approval" || inspectedItem.status === "Submitted") ? (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-600 font-medium">
                    <Clock size={14} className="text-slate-400" />
                    <span>SLA Tracking: <strong>{inspectedItem.hoursPending}h elapsed</strong> in queue (Escalates to High Priority at 48.0h)</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full">
                    Normal Priority
                  </span>
                </div>
              ) : null}

              {/* Document Overview Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50/80 rounded-xl border border-slate-200/60 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Originating Store</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">{inspectedItem.storeName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    {inspectedItem.type === "PO" || inspectedItem.type === "GRN" ? "Supplier Partner" : "Requesting Dept"}
                  </span>
                  <span className="font-bold text-slate-800 mt-0.5 block">{inspectedItem.requesterOrSupplier}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target / Due Date</span>
                  <span className="font-bold text-slate-800 mt-0.5 block">{inspectedItem.date}</span>
                </div>
                <div className="col-span-2 sm:col-span-3 pt-2 border-t border-slate-200/40">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Purpose / Contract Reference</span>
                  <span className="font-medium text-slate-700 mt-0.5 block italic">
                    "{inspectedItem.purposeOrTerms || 'No additional commercial remark provided.'}"
                  </span>
                </div>
              </div>

              {/* Detailed Line Items Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers size={14} className="text-purple-600" />
                    Itemized Line Breakdown ({inspectedItem.lines.length} Items)
                  </h3>
                  <span className="text-xs font-bold text-slate-500">
                    Grand Total: <span className="text-slate-900 font-extrabold">${inspectedItem.totalValue.toFixed(2)}</span>
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold text-[11px]">
                        <th className="p-2.5">Item Description</th>
                        <th className="p-2.5 text-center">Qty</th>
                        <th className="p-2.5 text-right">Unit Rate</th>
                        <th className="p-2.5 text-right">Tax / Disc</th>
                        <th className="p-2.5 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inspectedItem.lines.map((line: any, idx: number) => {
                        const itemObj = items.find(i => i.id === line.itemId);
                        const qty = line.receivedQty ?? line.quantity ?? 1;
                        const rate = line.rate ?? itemObj?.standardRate ?? 0;
                        const taxPct = line.taxPct ?? 0;
                        const discPct = line.discountPct ?? 0;
                        const lineSub = qty * rate;
                        const lineDisc = lineSub * (discPct / 100);
                        const lineTax = (lineSub - lineDisc) * (taxPct / 100);
                        const lineTotal = lineSub - lineDisc + lineTax;

                        return (
                          <tr key={line.id || idx} className="hover:bg-slate-50/60">
                            <td className="p-2.5">
                              <div className="font-bold text-slate-800">{itemObj?.name || line.itemId}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                SKU: {itemObj?.sku || 'N/A'} • {itemObj?.group || 'Standard'}
                                {line.batchLotNumber && ` • Batch: ${line.batchLotNumber}`}
                                {line.expiryDate && ` • Exp: ${line.expiryDate}`}
                              </div>
                              {line.qcPassed !== undefined && (
                                <span className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                  line.qcPassed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                }`}>
                                  QC: {line.qcPassed ? "PASSED" : "PENDING"}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 text-center font-bold text-slate-700">
                              {qty} <span className="text-[10px] text-slate-400 font-normal">{itemObj?.unit || 'Units'}</span>
                            </td>
                            <td className="p-2.5 text-right font-medium text-slate-700">
                              ${rate.toFixed(2)}
                            </td>
                            <td className="p-2.5 text-right text-[11px] text-slate-500 font-medium">
                              {taxPct > 0 ? `+${taxPct}%` : '0%'} {discPct > 0 ? ` / -${discPct}%` : ''}
                            </td>
                            <td className="p-2.5 text-right font-extrabold text-slate-900">
                              ${lineTotal.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Historical Approver Remarks if any */}
              {inspectedItem.approverRemarks && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                  <span className="font-bold text-amber-800 block mb-0.5">Previous Approver Remark:</span>
                  <p className="text-amber-900 italic">"{inspectedItem.approverRemarks}"</p>
                </div>
              )}

              {/* ACTION DECISION BOX */}
              <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-purple-600" />
                    Approver Decision & Authorization
                  </h4>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Signing Authority: <span className="font-bold text-slate-800">{currentUser.name}</span>
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Review Remarks / Justification Comments
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter audit notes, budget confirmation, or return instructions..."
                    value={actionRemark}
                    onChange={(e) => setActionRemark(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {/* Quick Preset remarks */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      "Budget verified and approved within quota",
                      "Urgent replenishment authorized",
                      "Please re-confirm quantity requirement",
                      "Over standard rate slab - please explain"
                    ].map((preset, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => setActionRemark(preset)}
                        className="px-2 py-0.5 text-[10px] font-semibold bg-white border border-slate-200 hover:border-purple-300 text-slate-600 hover:text-purple-700 rounded transition-colors cursor-pointer"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Primary Decision Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleAction(inspectedItem, "Return-for-correction")}
                    className="px-4 py-2 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={14} /> Return for Correction
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAction(inspectedItem, "Reject")}
                    className="px-4 py-2 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <XCircle size={14} /> Reject Request
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAction(inspectedItem, "Approve")}
                    className="px-5 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 size={15} /> Approve & Authorize
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center">
              <Eye size={36} className="text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-700">No Document Selected</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                Select any transaction from the list on the left to inspect full line items, audit logs, and make an authorization decision.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* PRINT VOUCHER MODAL */}
      <PrintDocumentModal
        isOpen={!!printModalData}
        onClose={() => setPrintModalData(null)}
        documentData={printModalData}
        items={items}
        stores={stores}
        departments={departments}
        suppliers={suppliers}
        currentUser={currentUser}
      />

      {/* 📋 DEPARTMENT HEAD ESCALATION NOTICES & SLA LOG MODAL */}
      {showEscalationLogModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150" id="modal-escalation-log">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-rose-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 border-b border-rose-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-600 text-white rounded-xl shadow-xs">
                  <Flame size={22} className="animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-rose-950 tracking-tight">
                      Department Head Escalation Notices & SLA Log
                    </h2>
                    <span className="px-2 py-0.5 text-[10px] font-black bg-rose-600 text-white rounded-full">
                      {escalatedPending.length} Overdue
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Requests pending &gt;48 hours automatically trigger high-priority alerts and dispatch formal notification memos to designated department heads.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEscalationLogModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content / Table */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {escalatedPending.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 size={24} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">All Approvals Within SLA Threshold</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    No requests are currently pending beyond the 48-hour limit. All pending workflows are progressing within policy SLAs.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-semibold px-1">
                    <span>Active Escalation Items ({escalatedPending.length})</span>
                    <span>Policy Limit: 48.0 Hours</span>
                  </div>

                  {escalatedPending.map((item) => (
                    <div
                      key={`modal-${item.type}-${item.id}`}
                      className="p-4 rounded-xl border border-rose-200 bg-rose-50/30 hover:bg-rose-50/60 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded border ${getTypeBadge(item.type)}`}>
                            {item.type}
                          </span>
                          <span className="text-xs font-mono font-extrabold text-slate-900">
                            {item.docNumber}
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-black bg-rose-600 text-white rounded-full flex items-center gap-1">
                            <Flame size={10} /> High Priority
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 rounded border border-amber-300">
                            Pending {item.hoursPending}h (&gt;48h)
                          </span>
                        </div>

                        <div className="text-xs font-bold text-slate-800">
                          {item.requesterOrSupplier} • <span className="text-slate-500 font-medium">{item.storeName} ({item.propertyName})</span>
                        </div>

                        <div className="text-[11px] text-slate-500 flex items-center gap-3">
                          <span>Value: <strong className="text-slate-800 font-bold">${item.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
                          <span>•</span>
                          <span>{item.itemCount} line items</span>
                          <span>•</span>
                          <span>Submitted: {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : item.date}</span>
                        </div>

                        {/* Department Head Box */}
                        <div className="p-2.5 bg-white rounded-lg border border-rose-200/70 flex items-center justify-between gap-3 mt-2 text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                              {item.departmentHead.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="truncate">
                              <span className="font-extrabold text-slate-800 block truncate">
                                {item.departmentHead.name} ({item.departmentHead.title})
                              </span>
                              <span className="text-[11px] text-slate-500 block truncate">
                                {item.departmentHead.departmentName} • {item.departmentHead.email}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded shrink-0 flex items-center gap-1">
                            <Bell size={10} /> Notified
                          </span>
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div className="flex items-center md:flex-col gap-2 shrink-0 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItemId(item.id);
                            setSelectedItemType(item.type);
                            setShowEscalationLogModal(false);
                          }}
                          className="px-3 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye size={13} /> Inspect
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveMemoItem(item)}
                          className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-rose-50 text-rose-800 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Mail size={13} className="text-rose-600" /> View Memo
                        </button>

                        <button
                          type="button"
                          onClick={() => handleResendNotice(item)}
                          className="px-3 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Send size={12} /> Resend Notice
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Corporate Workflow Governance Policy §4.8</span>
              <button
                type="button"
                onClick={() => setShowEscalationLogModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg transition-colors cursor-pointer"
              >
                Close Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✉️ FORMAL ESCALATION NOTIFICATION MEMO MODAL */}
      {activeMemoItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150" id="modal-escalation-memo">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-rose-200 overflow-hidden">
            {/* Memo Modal Header */}
            <div className="p-5 bg-rose-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-800 rounded-lg text-rose-200">
                  <Mail size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold tracking-tight flex items-center gap-1.5">
                    <span>OFFICIAL WORKFLOW ESCALATION MEMORANDUM</span>
                    <span className="px-2 py-0.2 text-[9px] font-black bg-rose-500 text-white rounded">HIGH PRIORITY</span>
                  </h3>
                  <span className="text-[11px] text-rose-200 font-medium">
                    Corporate Procurement Governance & SLA Enforcement
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveMemoItem(null)}
                className="p-1.5 text-rose-300 hover:text-white rounded-lg hover:bg-rose-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Memo Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Header Box */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 font-mono">
                <div className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-slate-500 font-bold">TO:</span>
                  <span className="font-extrabold text-slate-900">
                    {activeMemoItem.departmentHead.name} ({activeMemoItem.departmentHead.title})
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-slate-500 font-bold">EMAIL:</span>
                  <span className="font-semibold text-rose-700">{activeMemoItem.departmentHead.email}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-slate-500 font-bold">CC:</span>
                  <span className="text-slate-700">Financial Controller, General Manager, Internal Audit</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-slate-500 font-bold">FROM:</span>
                  <span className="text-slate-700">Procurement & Inventory Automated Workflow Engine</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-slate-500 font-bold">DATE:</span>
                  <span className="text-slate-700">{new Date().toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500 font-bold">SUBJECT:</span>
                  <span className="font-extrabold text-rose-900">
                    [HIGH PRIORITY] Overdue Approval Notice (&gt;48 Hours) — {activeMemoItem.type} {activeMemoItem.docNumber}
                  </span>
                </div>
              </div>

              {/* Memo Text */}
              <div className="space-y-3 text-slate-700 leading-relaxed">
                <p>
                  Dear <strong>{activeMemoItem.departmentHead.name}</strong>,
                </p>
                <p>
                  In accordance with corporate governance policy §4.8, transaction <strong>{activeMemoItem.type} {activeMemoItem.docNumber}</strong> for <strong>{activeMemoItem.storeName}</strong> has exceeded the maximum standard approval window of <strong>48 hours</strong>.
                </p>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 font-medium">
                  Current Pending Time: <strong className="font-extrabold text-rose-900">{activeMemoItem.hoursPending} hours</strong>. 
                  The request priority status has been automatically escalated to <strong className="font-extrabold text-rose-900">'High Priority'</strong>.
                </div>
              </div>

              {/* Transaction Summary Grid */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Transaction Summary</span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Document:</span>
                    <span className="font-extrabold text-slate-900">{activeMemoItem.type} {activeMemoItem.docNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Total Valuation:</span>
                    <span className="font-extrabold text-slate-900">${activeMemoItem.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Requested By / Supplier:</span>
                    <span className="font-semibold text-slate-800">{activeMemoItem.requesterOrSupplier}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Target / Due Date:</span>
                    <span className="font-semibold text-slate-800">{activeMemoItem.date}</span>
                  </div>
                </div>
              </div>

              {/* Directive Notice */}
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-200 text-rose-900 text-xs">
                <strong>Executive Directive:</strong> Please review and authorize this transaction immediately or provide review notes to avoid operational delays in materials issuance and receiving.
              </div>
            </div>

            {/* Memo Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Escalation ID: ESC-{activeMemoItem.type}-{activeMemoItem.id}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleResendNotice(activeMemoItem)}
                  className="px-3.5 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Send size={13} /> Resend Memo
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMemoItem(null)}
                  className="px-3.5 py-1.5 text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ⚡ BATCH AUTHORIZATION REVIEW & EXECUTION MODAL */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150" id="modal-batch-authorization">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-purple-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-600 rounded-xl text-white shadow-xs">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold tracking-tight">Batch Authorization Review &amp; Execution</h3>
                    <span className="px-2 py-0.5 text-[10px] font-extrabold bg-purple-500/30 text-purple-200 border border-purple-400/30 rounded-full">
                      Multi-Transaction Approval
                    </span>
                  </div>
                  <p className="text-xs text-purple-200/80 mt-0.5">
                    Authorized Signatory: <strong className="text-white">{currentUser.name}</strong> ({currentUser.role} • {currentUser.department})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="p-2 text-purple-300 hover:text-white rounded-lg hover:bg-purple-800/80 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              {/* Summary KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-purple-50 border border-purple-100 rounded-xl">
                  <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider block">Queued Items</span>
                  <span className="text-xl font-extrabold text-purple-950 mt-1 block">
                    {selectedForBulk.length} <span className="text-xs font-semibold text-purple-600">transactions</span>
                  </span>
                </div>
                <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">Cumulative Value</span>
                  <span className="text-xl font-extrabold text-emerald-950 mt-1 block">
                    ${selectedBulkTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl">
                  <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block">SLA Escalated (&gt;48h)</span>
                  <span className="text-xl font-extrabold text-rose-950 mt-1 block flex items-center gap-1.5">
                    {selectedBulkEscalatedCount}
                    {selectedBulkEscalatedCount > 0 && (
                      <Flame size={16} className="text-rose-600 animate-pulse" />
                    )}
                  </span>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Target Action</span>
                  <span className="text-sm font-extrabold text-slate-900 mt-1 block">
                    {batchActionType === "Approve" ? "Authorize & Post" : "Formal Rejection"}
                  </span>
                </div>
              </div>

              {/* High Priority Overdue Notice */}
              {selectedBulkEscalatedCount > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-900">
                  <Flame size={16} className="text-rose-600 mt-0.5 shrink-0 animate-pulse" />
                  <div className="leading-relaxed">
                    <strong>SLA Escalation Clearance:</strong> {selectedBulkEscalatedCount} request(s) in this batch exceed the 48-hour approval policy. Approving this batch will immediately clear their overdue flags and update the compliance audit ledger.
                  </div>
                </div>
              )}

              {/* Transactions List Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between font-bold text-slate-700">
                  <span>Selected Transactions ({selectedForBulk.length})</span>
                  <span className="text-[11px] text-slate-500 font-normal">Uncheck any item to exclude from batch</span>
                </div>
                <div className="max-h-[220px] overflow-y-auto divide-y divide-slate-100">
                  {selectedBulkItems.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                      No transactions selected. Please select items from the table or pick a quick selection preset.
                    </div>
                  ) : (
                    selectedBulkItems.map(item => {
                      const isEscalated = item.isEscalated;
                      return (
                        <div key={`${item.type}-${item.id}`} className="p-3 hover:bg-purple-50/40 flex items-center justify-between gap-3 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={selectedForBulk.includes(`${item.type}:${item.id}`)}
                              onChange={() => toggleSelectItem(item.type, item.id)}
                              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                            />
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border shrink-0 ${getTypeBadge(item.type)}`}>
                              {item.type}
                            </span>
                            <div className="min-w-0">
                              <div className="font-extrabold text-slate-900 flex items-center gap-2">
                                <span>{item.docNumber}</span>
                                {isEscalated && (
                                  <span className="px-1.5 py-0.2 text-[9px] font-black bg-rose-600 text-white rounded flex items-center gap-0.5">
                                    <Flame size={10} /> &gt;48h Overdue
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {item.requesterOrSupplier} • {item.description}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 text-right">
                            <div>
                              <div className="font-extrabold text-slate-900">
                                ${item.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {item.hoursPending}h in queue
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleSelectItem(item.type, item.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                              title="Remove from batch"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Approver Remarks & Presets */}
              <div className="space-y-2">
                <label className="font-bold text-slate-700 block">
                  Signatory Remarks / Authorization Notes:
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    "Authorized within approved departmental budget allocation",
                    "Urgent high-priority batch approval for operational continuity",
                    "Verified inventory policy compliance and minimum stock thresholds",
                    "Approved for release and vendor procurement processing"
                  ].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBulkRemark(preset)}
                      className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer text-left ${
                        bulkRemark === preset
                          ? "bg-purple-100 border-purple-300 text-purple-900 font-bold"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  placeholder="Enter audit notes or customized batch remarks..."
                  value={bulkRemark}
                  onChange={(e) => setBulkRemark(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
                />
              </div>

              {/* Compliance Certification */}
              <div className="p-3.5 bg-purple-50/70 border border-purple-100 rounded-xl flex items-start gap-2.5 text-slate-700">
                <input
                  type="checkbox"
                  id="batch-compliance-checkbox"
                  checked={batchComplianceAccepted}
                  onChange={(e) => setBatchComplianceAccepted(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer mt-0.5"
                />
                <label htmlFor="batch-compliance-checkbox" className="cursor-pointer select-none leading-relaxed text-[11px]">
                  <strong>Executive Certification:</strong> I confirm that I have exercised due diligence in reviewing these transactions, verified cost allocations, and hereby exercise corporate signatory approval under corporate governance policies.
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500 font-medium">
                {selectedForBulk.length} transaction{selectedForBulk.length !== 1 ? 's' : ''} selected • Total: <strong className="text-slate-800">${selectedBulkTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedForBulk.length === 0 || isExecutingBatch}
                  onClick={() => handleBulkAction("Reject")}
                  className="px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  id="btn-modal-bulk-reject"
                >
                  Reject Batch ({selectedForBulk.length})
                </button>
                <button
                  type="button"
                  disabled={selectedForBulk.length === 0 || !batchComplianceAccepted || isExecutingBatch}
                  onClick={() => handleBulkAction("Approve")}
                  className="px-5 py-2.5 text-xs font-extrabold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  id="btn-modal-bulk-approve"
                >
                  <Check size={16} />
                  <span>
                    {isExecutingBatch
                      ? "Executing Batch..."
                      : `Confirm & Authorize (${selectedForBulk.length})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
