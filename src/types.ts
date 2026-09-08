export enum Role {
  Requester = "Requester",
  StoreKeeper = "Store Keeper",
  StoreManager = "Store Manager",
  Approver = "Approver",
  PurchaseOfficer = "Purchase Officer",
}

export interface User {
  id: string;
  name: string;
  role: Role;
  department: string;
  permissions: string[];
}

export interface Item {
  id: string;
  name: string;
  sku: string;
  group: "Perishables" | "Groceries" | "Housekeeping" | "Capex";
  standardRate: number;
  lastPurchaseRate: number;
  unit: string;
  qcRequired: boolean;
  isActive: boolean;
  minOrderLevel?: number;
}

export interface Store {
  id: string;
  name: string;
  code: string;
}

export interface Property {
  id: string;
  name: string;
  code: string;
  location: string;
}

export interface Department {
  id: string;
  name: string;
  costCenter: string;
}

export interface Supplier {
  id: string;
  name: string;
  code: string;
  paymentTerms: string;
}

// Global System Configuration
export interface SystemConfig {
  costingMethod: "Moving Average" | "FIFO";
  overReceiptTolerancePct: number; // e.g. 10 for 10%
  amendmentTolerancePct: number; // e.g. 0 for 0%
  reconciliationThresholdValue: number; // e.g. 100
  freezeStoreDuringReconciliation: boolean;
}

// Common Transaction status lifecycles
export type TransactionStatus =
  | "Draft"
  | "Submitted"
  | "Pending Approval"
  | "Approved"
  | "Open"
  | "Partially Fulfilled"
  | "Partially Received"
  | "Closed"
  | "Rejected"
  | "Short Closed"
  | "Cancelled"
  | "Posted"
  | "Reversed"
  | "Counted";

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string; // e.g. "Create", "Amend", "Approve", "Cancel"
  details: string; // Detail what changed old-vs-new
}

// 1. Purchase Requisition (PR)
export interface PRLine {
  id: string;
  itemId: string;
  quantity: number;
  requiredByDate: string;
  remarks: string;
  poConvertedQty: number; // quantity already converted to PO
}

export interface PRHeader {
  id: string; // PR-YYYY-0001
  propertyId?: string;
  property: string;
  storeId: string;
  departmentId: string;
  status: TransactionStatus;
  requesterId: string;
  requiredByDate: string;
  purpose: string;
  remarks: string;
  lines: PRLine[];
  estimatedValue: number;
  amendmentNumber: number; // e.g. 0 (original), 1 (PR-001-AMD-01)...
  auditTrail: AuditLog[];
  reasonCode?: string;
  approverRemarks?: string;
}

// 2. Purchase Order (PO)
export interface POLine {
  id: string;
  itemId: string;
  quantity: number;
  rate: number;
  taxPct: number; // e.g. 5 for 5%
  discountPct: number; // e.g. 0 for 0%
  receivedQty: number; // tracked as GRNs are posted
  isShortClosed: boolean;
  sourcePRLineId?: string; // Optional linkage
}

export interface POHeader {
  id: string; // PO-YYYY-0001
  propertyId?: string;
  supplierId: string;
  purchaseType: "Capex" | "Opex" | "Emergency" | "Regular";
  deliveryStoreId: string;
  paymentTerms: string;
  deliveryDate: string;
  status: TransactionStatus;
  lines: POLine[];
  subTotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  amendmentNumber: number;
  auditTrail: AuditLog[];
  reasonCode?: string;
  approverRemarks?: string;
}

// 3. Material Request (MR)
export interface MRLine {
  id: string;
  itemId: string;
  quantity: number;
  issuedQty: number;
  isShortClosed: boolean;
}

export interface MRHeader {
  id: string; // MR-YYYY-0001
  propertyId?: string;
  fromStoreId: string;
  requestingDeptId: string;
  status: TransactionStatus;
  requiredDate: string;
  purpose: string;
  remarks: string;
  lines: MRLine[];
  estimatedValue: number;
  amendmentNumber: number;
  auditTrail: AuditLog[];
  reasonCode?: string;
  approverRemarks?: string;
}

// 4. Material Receipt (GRN)
export interface GRNLine {
  id: string;
  itemId: string;
  orderedQty?: number; // empty if direct
  receivedQty: number;
  rate: number;
  taxPct: number;
  discountPct: number;
  batchLotNumber: string;
  expiryDate?: string;
  qcPassed: boolean;
  returnedQty: number; // tracks Receipt Returns
  sourcePOLineId?: string;
}

export interface GRNHeader {
  id: string; // GRN-YYYY-0001
  propertyId?: string;
  sourcePOId?: string; // empty if direct receipt
  deliveryStoreId: string;
  supplierId?: string;
  receivedDate: string;
  isDirect: boolean;
  reasonCode?: string; // mandatory if direct
  status: "Draft" | "Posted" | "Reversed";
  lines: GRNLine[];
  subTotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
}

// 5. Receipt Return (Supplier Return)
export interface ReceiptReturnLine {
  id: string;
  itemId: string;
  grnLineId: string;
  returnQty: number;
  reasonCode: string;
}

export interface ReceiptReturnHeader {
  id: string; // RET-YYYY-0001
  propertyId?: string;
  grnId: string;
  supplierId: string;
  status: "Draft" | "Pending Approval" | "Posted" | "Rejected";
  debitNoteRef?: string;
  returnDate: string;
  lines: ReceiptReturnLine[];
  auditTrail: AuditLog[];
}

// 6. Receipt Rate Modification
export interface RateModLine {
  id: string;
  grnLineId: string;
  itemId: string;
  oldRate: number;
  newRate: number;
  receivedQty: number;
  valueImpact: number; // (newRate - oldRate) * receivedQty
  reasonCode: string;
}

export interface RateModHeader {
  id: string; // MOD-YYYY-0001
  propertyId?: string;
  grnId: string;
  status: "Draft" | "Pending Approval" | "Posted" | "Rejected";
  initiatedDate: string;
  lines: RateModLine[];
  totalValueImpact: number;
  auditTrail: AuditLog[];
}

// 7. Material Issue
export interface IssueLine {
  id: string;
  itemId: string;
  qtyIssued: number;
  batchLotNumber: string;
  sourceMRLineId?: string;
}

export interface IssueHeader {
  id: string; // ISS-YYYY-0001
  propertyId?: string;
  sourceMRId?: string;
  requestingDeptId: string;
  storeId: string;
  costCenter: string;
  issueDate: string;
  isDirect: boolean;
  reasonCode?: string; // mandatory if direct
  status: "Draft" | "Posted" | "Reversed";
  lines: IssueLine[];
}

// 8. Issue Return
export interface IssueReturnLine {
  id: string;
  itemId: string;
  issueLineId: string;
  returnQty: number;
  reasonCode: string;
}

export interface IssueReturnHeader {
  id: string; // ISR-YYYY-0001
  propertyId?: string;
  issueId: string;
  storeId: string;
  departmentId: string;
  returnDate: string;
  status: "Draft" | "Posted";
  lines: IssueReturnLine[];
}

// 9. Store Opening
export interface StoreOpeningLine {
  id: string;
  itemId: string;
  quantity: number;
  rate: number;
}

export interface StoreOpeningHeader {
  id: string; // OPN-YYYY-0001
  propertyId?: string;
  storeId: string;
  openingDate: string;
  status: "Draft" | "Pending Approval" | "Posted";
  lines: StoreOpeningLine[];
  auditTrail: AuditLog[];
}

// 10. Physical Inventory Reconciliation
export interface ReconciliationLine {
  id: string;
  itemId: string;
  bookQty: number;
  physicalQty: number;
  qtyVariance: number; // physicalQty - bookQty
  valueVariance: number; // qtyVariance * average/standard rate
  remarks: string;
}

export interface ReconciliationHeader {
  id: string; // REC-YYYY-0001
  propertyId?: string;
  storeId: string;
  countDate: string;
  isBlind: boolean;
  status: "Draft" | "Counted" | "Pending Approval" | "Posted" | "Rejected";
  lines: ReconciliationLine[];
  totalVarianceValue: number;
  remarks?: string;
  auditTrail: AuditLog[];
}

// Stock Ledger entry schema
export interface StockLedgerEntry {
  id: string;
  propertyId?: string;
  timestamp: string;
  storeId: string;
  itemId: string;
  transactionType: "Store Opening" | "Material Receipt" | "Receipt Return" | "Material Issue" | "Issue Return" | "Physical Reconciliation";
  transactionId: string; // Reference doc ID
  qtyChange: number; // positive for In, negative for Out
  rate: number; // Cost rate for this transaction
  valueChange: number; // qtyChange * rate
  batchLotNumber?: string;
}

// Derived stock balance per store and item
export interface StockBalance {
  storeId: string;
  itemId: string;
  qtyOnHand: number;
  movingAverageCost: number;
  // FIFO Queue to support FIFO valuation
  fifoQueue: { qty: number; rate: number; batch?: string }[];
}

// 11. Store / Financial Day Closure
export interface DayClosureChecklistItem {
  id: string;
  label: string;
  description: string;
  status: "Passed" | "Warning" | "Pending" | "Blocked";
  details?: string;
  count?: number;
}

export interface DayClosureRecord {
  id: string; // EOD-YYYYMMDD-STOREID or EOD-YYYYMMDD-ALL
  propertyId?: string;
  closureDate: string; // YYYY-MM-DD
  closedAt: string; // ISO timestamp
  closedBy: string; // User Name
  closedById: string; // User ID
  closedByRole: string;
  storeId: string; // "all" or specific storeId
  storeName: string;
  status: "Closed" | "Re-opened";
  totalInventoryValuation: number;
  totalGrnCount: number;
  totalGrnValue: number;
  totalIssueCount: number;
  totalIssueValue: number;
  totalReturnCount: number;
  pendingPrsCount: number;
  pendingPosCount: number;
  pendingApprovalsCount: number;
  stockLedgerEntriesCount: number;
  checklist: DayClosureChecklistItem[];
  remarks: string;
  auditTrail: AuditLog[];
}

// 12. Store / Financial Month Closure (EOM)
export interface MonthClosureChecklistItem {
  id: string;
  label: string;
  description: string;
  status: "Passed" | "Warning" | "Pending" | "Blocked";
  details?: string;
  count?: number;
}

export interface MonthClosureRecord {
  id: string; // EOM-YYYYMM-STOREID or EOM-YYYYMM-ALL
  propertyId?: string;
  closureMonth: string; // YYYY-MM
  closedAt: string; // ISO timestamp
  closedBy: string; // User Name
  closedById: string; // User ID
  closedByRole: string;
  storeId: string; // "all" or specific storeId
  storeName: string;
  status: "Closed" | "Re-opened";
  openingValuation: number;
  closingValuation: number;
  totalGrnCount: number;
  totalGrnValue: number;
  totalIssueCount: number;
  totalIssueValue: number;
  totalReturnCount: number;
  totalReconciliationVariance: number;
  pendingTransactionsCount: number;
  stockLedgerEntriesCount: number;
  checklist: MonthClosureChecklistItem[];
  remarks: string;
  auditTrail: AuditLog[];
}


