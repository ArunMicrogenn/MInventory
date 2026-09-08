import {
  Item,
  Store,
  Department,
  Supplier,
  User,
  Role,
  SystemConfig,
  PRHeader,
  POHeader,
  MRHeader,
  GRNHeader,
  ReceiptReturnHeader,
  RateModHeader,
  IssueHeader,
  IssueReturnHeader,
  StoreOpeningHeader,
  ReconciliationHeader,
  StockLedgerEntry,
  StockBalance,
  DayClosureRecord
} from "./types";

export const initialUsers: User[] = [
  {
    id: "U-01",
    name: "Chef John Doe",
    role: Role.Requester,
    department: "Kitchen",
    permissions: ["raise-PR", "raise-MR"]
  },
  {
    id: "U-02",
    name: "Jane Smith (Keeper)",
    role: Role.StoreKeeper,
    department: "Main Store",
    permissions: ["post-GRN", "post-Issue", "do-Reconciliation"]
  },
  {
    id: "U-03",
    name: "Robert King (Manager)",
    role: Role.StoreManager,
    department: "Procurement",
    permissions: ["confirm-GRN", "amend-PO", "approve-Reconciliation", "post-StoreOpening"]
  },
  {
    id: "U-04",
    name: "Alice Finance",
    role: Role.Approver,
    department: "Finance",
    permissions: ["approve-PR", "approve-PO", "approve-MR", "approve-RateMod"]
  },
  {
    id: "U-05",
    name: "Peter Purchase",
    role: Role.PurchaseOfficer,
    department: "Procurement",
    permissions: ["convert-PR-to-PO", "raise-PO"]
  }
];

export const initialItems: Item[] = [
  {
    id: "I-01",
    name: "Roma Tomato",
    sku: "SKU-TOM-01",
    group: "Perishables",
    standardRate: 2.50,
    lastPurchaseRate: 2.40,
    unit: "KG",
    qcRequired: true,
    isActive: true,
    minOrderLevel: 40
  },
  {
    id: "I-02",
    name: "Basmati Rice (25kg)",
    sku: "SKU-RIC-25",
    group: "Groceries",
    standardRate: 45.00,
    lastPurchaseRate: 42.00,
    unit: "BAG",
    qcRequired: false,
    isActive: true,
    minOrderLevel: 15
  },
  {
    id: "I-03",
    name: "Industrial Detergent",
    sku: "SKU-DET-05",
    group: "Housekeeping",
    standardRate: 12.00,
    lastPurchaseRate: 12.00,
    unit: "LITER",
    qcRequired: false,
    isActive: true,
    minOrderLevel: 25
  },
  {
    id: "I-04",
    name: "Premium Chef Knife",
    sku: "SKU-KNF-09",
    group: "Capex",
    standardRate: 85.00,
    lastPurchaseRate: 85.00,
    unit: "PCS",
    qcRequired: false,
    isActive: true,
    minOrderLevel: 5
  }
];

export const initialStores: Store[] = [
  { id: "S-01", name: "F&B Main Store", code: "FB-MAIN" },
  { id: "S-02", name: "Housekeeping Store", code: "HK-STORE" },
  { id: "S-03", name: "Kitchen Sub-Store", code: "KIT-SUB" }
];

export const initialDepartments: Department[] = [
  { id: "D-01", name: "Kitchen", costCenter: "CC-KIT" },
  { id: "D-02", name: "Housekeeping", costCenter: "CC-HK" },
  { id: "D-03", name: "Food & Beverage Service", costCenter: "CC-FBS" }
];

export const initialSuppliers: Supplier[] = [
  { id: "SP-01", name: "Fresh Farms Ltd.", code: "SUP-FF", paymentTerms: "Net 30" },
  { id: "SP-02", name: "Global Kitchen Supplies", code: "SUP-GKS", paymentTerms: "Net 15" },
  { id: "SP-03", name: "CleanPro Solutions", code: "SUP-CPS", paymentTerms: "Cash on Delivery" }
];

export const initialConfig: SystemConfig = {
  costingMethod: "Moving Average",
  overReceiptTolerancePct: 10, // 10% maximum over-receipt allowed
  amendmentTolerancePct: 0, // 0% means any value increase re-triggers approvals
  reconciliationThresholdValue: 100, // Value above $100 needs approval
  freezeStoreDuringReconciliation: true
};

// Seed PRs
export const initialPRs: PRHeader[] = [
  {
    id: "PR-2026-0001",
    property: "Grand Plaza Resort",
    storeId: "S-01",
    departmentId: "D-01",
    status: "Approved",
    requesterId: "U-01",
    requiredByDate: "2026-10-15",
    purpose: "Ingredients for upcoming winter menu release",
    remarks: "Priority items, standard specifications",
    lines: [
      {
        id: "PRL-001",
        itemId: "I-01",
        quantity: 100,
        requiredByDate: "2026-10-15",
        remarks: "Need ripe and firm tomatoes",
        poConvertedQty: 40 // Partially converted to PO-2026-0001
      },
      {
        id: "PRL-002",
        itemId: "I-02",
        quantity: 10,
        requiredByDate: "2026-10-15",
        remarks: "Long grain quality preferred",
        poConvertedQty: 0
      }
    ],
    estimatedValue: 690, // (100 * 2.40) + (10 * 45.00)
    amendmentNumber: 0,
    auditTrail: [
      {
        id: "AUD-01",
        timestamp: "2026-09-01T10:00:00Z",
        userId: "U-01",
        userName: "Chef John Doe",
        action: "Created Draft",
        details: "Initial PR created"
      },
      {
        id: "AUD-02",
        timestamp: "2026-09-01T10:15:00Z",
        userId: "U-01",
        userName: "Chef John Doe",
        action: "Submitted",
        details: "Requisition sent for approval"
      },
      {
        id: "AUD-03",
        timestamp: "2026-09-01T14:30:00Z",
        userId: "U-04",
        userName: "Alice Finance",
        action: "Approved",
        details: "PR estimate of $690 approved within department budget."
      }
    ]
  },
  {
    id: "PR-2026-0002",
    property: "Grand Plaza Resort",
    storeId: "S-02",
    departmentId: "D-02",
    status: "Pending Approval",
    requesterId: "U-01",
    requiredByDate: "2026-09-25",
    purpose: "Monthly floor replenishment",
    remarks: "",
    lines: [
      {
        id: "PRL-003",
        itemId: "I-03",
        quantity: 50,
        requiredByDate: "2026-09-25",
        remarks: "Standard 5L gallons",
        poConvertedQty: 0
      }
    ],
    estimatedValue: 600, // 50 * 12.00
    amendmentNumber: 0,
    auditTrail: [
      {
        id: "AUD-04",
        timestamp: "2026-09-05T09:00:00Z",
        userId: "U-01",
        userName: "Chef John Doe",
        action: "Submitted",
        details: "Requisition sent for approval"
      }
    ]
  }
];

// Seed POs
export const initialPOs: POHeader[] = [
  {
    id: "PO-2026-0001",
    supplierId: "SP-01",
    purchaseType: "Regular",
    deliveryStoreId: "S-01",
    paymentTerms: "Net 30",
    deliveryDate: "2026-09-30",
    status: "Approved",
    lines: [
      {
        id: "POL-001",
        itemId: "I-01",
        quantity: 40, // Pulled from PR-2026-0001 Line 1
        rate: 2.30, // Supplier discount rate
        taxPct: 5,
        discountPct: 0,
        receivedQty: 30, // partially received via GRN-2026-0001
        isShortClosed: false,
        sourcePRLineId: "PRL-001"
      }
    ],
    subTotal: 92, // 40 * 2.30
    taxTotal: 4.6, // 5% of 92
    discountTotal: 0,
    grandTotal: 96.6,
    amendmentNumber: 0,
    auditTrail: [
      {
        id: "AUD-05",
        timestamp: "2026-09-02T11:00:00Z",
        userId: "U-05",
        userName: "Peter Purchase",
        action: "Created from PR",
        details: "Generated PO-2026-0001 from PR-2026-0001 lines."
      },
      {
        id: "AUD-06",
        timestamp: "2026-09-02T11:15:00Z",
        userId: "U-05",
        userName: "Peter Purchase",
        action: "Submitted",
        details: "PO submitted to workflow engine."
      },
      {
        id: "AUD-07",
        timestamp: "2026-09-02T16:00:00Z",
        userId: "U-04",
        userName: "Alice Finance",
        action: "Approved",
        details: "Approved regular PO under $10,000 threshold."
      }
    ]
  }
];

// Seed MRs
export const initialMRs: MRHeader[] = [
  {
    id: "MR-2026-0001",
    fromStoreId: "S-01",
    requestingDeptId: "D-01",
    status: "Approved",
    requiredDate: "2026-09-12",
    purpose: "Daily banquet lunch items",
    remarks: "Deliver before 9 AM",
    lines: [
      {
        id: "MRL-001",
        itemId: "I-01",
        quantity: 20,
        issuedQty: 15, // Partially issued via ISS-2026-0001
        isShortClosed: false
      },
      {
        id: "MRL-002",
        itemId: "I-02",
        quantity: 1,
        issuedQty: 0,
        isShortClosed: false
      }
    ],
    estimatedValue: 95.0, // (20 * 2.50) + (1 * 45.00)
    amendmentNumber: 0,
    auditTrail: [
      {
        id: "AUD-08",
        timestamp: "2026-09-03T08:00:00Z",
        userId: "U-01",
        userName: "Chef John Doe",
        action: "Submitted",
        details: "MR raised internally."
      },
      {
        id: "AUD-09",
        timestamp: "2026-09-03T10:00:00Z",
        userId: "U-04",
        userName: "Alice Finance",
        action: "Approved",
        details: "MR approved."
      }
    ]
  }
];

// Seed GRNs
export const initialGRNs: GRNHeader[] = [
  {
    id: "GRN-2026-0001",
    sourcePOId: "PO-2026-0001",
    deliveryStoreId: "S-01",
    supplierId: "SP-01",
    receivedDate: "2026-09-04",
    isDirect: false,
    status: "Posted",
    lines: [
      {
        id: "GRNL-001",
        itemId: "I-01",
        orderedQty: 40,
        receivedQty: 30, // Under-receipt is allowed
        rate: 2.30,
        taxPct: 5,
        discountPct: 0,
        batchLotNumber: "LOT-TOM-01",
        expiryDate: "2026-09-15",
        qcPassed: true,
        returnedQty: 5, // 5 returned via RET-2026-0001
        sourcePOLineId: "POL-001"
      }
    ],
    subTotal: 69.0, // 30 * 2.30
    taxTotal: 3.45,
    discountTotal: 0,
    grandTotal: 72.45
  }
];

// Seed Returns
export const initialReturns: ReceiptReturnHeader[] = [
  {
    id: "RET-2026-0001",
    grnId: "GRN-2026-0001",
    supplierId: "SP-01",
    status: "Posted",
    debitNoteRef: "DN-9988",
    returnDate: "2026-09-05",
    lines: [
      {
        id: "RETL-001",
        itemId: "I-01",
        grnLineId: "GRNL-001",
        returnQty: 5,
        reasonCode: "damaged"
      }
    ],
    auditTrail: [
      {
        id: "AUD-RET-01",
        timestamp: "2026-09-05T14:00:00Z",
        userId: "U-02",
        userName: "Alice Receiver",
        action: "Posted",
        details: "Receipt return successfully executed and posted to ledger."
      }
    ]
  }
];

// Seed Rate Mods
export const initialRateMods: RateModHeader[] = [];

// Seed Issues
export const initialIssues: IssueHeader[] = [
  {
    id: "ISS-2026-0001",
    sourceMRId: "MR-2026-0001",
    requestingDeptId: "D-01",
    storeId: "S-01",
    costCenter: "CC-KIT",
    issueDate: "2026-09-06",
    isDirect: false,
    status: "Posted",
    lines: [
      {
        id: "ISSL-001",
        itemId: "I-01",
        qtyIssued: 15,
        batchLotNumber: "LOT-TOM-01",
        sourceMRLineId: "MRL-001"
      }
    ]
  }
];

// Seed Issue Returns
export const initialIssueReturns: IssueReturnHeader[] = [];

// Seed Store Openings
export const initialStoreOpenings: StoreOpeningHeader[] = [
  {
    id: "OPN-2026-0001",
    storeId: "S-01",
    openingDate: "2026-08-30",
    status: "Posted",
    lines: [
      { id: "OPNL-001", itemId: "I-01", quantity: 50, rate: 2.50 },
      { id: "OPNL-002", itemId: "I-02", quantity: 20, rate: 45.00 },
      { id: "OPNL-003", itemId: "I-03", quantity: 30, rate: 12.00 }
    ],
    auditTrail: [
      {
        id: "AUD-OPN-01",
        timestamp: "2026-08-30T09:00:00Z",
        userId: "U-04",
        userName: "Admin Officer",
        action: "Posted",
        details: "Go-live store balances seeded and locked."
      }
    ]
  }
];

// Seed Reconciliation
export const initialReconciliations: ReconciliationHeader[] = [];

// Seed Stock Ledger
export const initialStockLedger: StockLedgerEntry[] = [
  // Store Opening FB-MAIN (S-01) on 2026-08-30
  {
    id: "LED-001",
    timestamp: "2026-08-30T09:00:00Z",
    storeId: "S-01",
    itemId: "I-01",
    transactionType: "Store Opening",
    transactionId: "OPN-2026-0001",
    qtyChange: 50,
    rate: 2.50,
    valueChange: 125.0
  },
  {
    id: "LED-002",
    timestamp: "2026-08-30T09:00:00Z",
    storeId: "S-01",
    itemId: "I-02",
    transactionType: "Store Opening",
    transactionId: "OPN-2026-0001",
    qtyChange: 20,
    rate: 45.00,
    valueChange: 900.0
  },
  {
    id: "LED-003",
    timestamp: "2026-08-30T09:00:00Z",
    storeId: "S-01",
    itemId: "I-03",
    transactionType: "Store Opening",
    transactionId: "OPN-2026-0001",
    qtyChange: 30,
    rate: 12.00,
    valueChange: 360.0
  },
  // GRN Receipt 30 Tomatoes @ 2.30 on 2026-09-04
  {
    id: "LED-004",
    timestamp: "2026-09-04T10:00:00Z",
    storeId: "S-01",
    itemId: "I-01",
    transactionType: "Material Receipt",
    transactionId: "GRN-2026-0001",
    qtyChange: 30,
    rate: 2.30,
    valueChange: 69.0,
    batchLotNumber: "LOT-TOM-01"
  },
  // Return of 5 Tomatoes @ 2.30 to Supplier on 2026-09-05
  {
    id: "LED-005",
    timestamp: "2026-09-05T14:00:00Z",
    storeId: "S-01",
    itemId: "I-01",
    transactionType: "Receipt Return",
    transactionId: "RET-2026-0001",
    qtyChange: -5,
    rate: 2.30,
    valueChange: -11.5,
    batchLotNumber: "LOT-TOM-01"
  },
  // Issue of 15 Tomatoes to Kitchen on 2026-09-06
  // Moving Average Cost calculation:
  // Initial: 50 @ 2.50 = 125
  // GRN: +30 @ 2.30 = +69. Total on hand before return = 80, Value = 194. Cost = 2.425
  // Return: -5 @ 2.30 = -11.5. On hand = 75, Value = 182.5. Cost = 2.433
  // Issue: -15 @ 2.433 = -36.5. Remaining: 60, Value = 146.
  {
    id: "LED-006",
    timestamp: "2026-09-06T11:00:00Z",
    storeId: "S-01",
    itemId: "I-01",
    transactionType: "Material Issue",
    transactionId: "ISS-2026-0001",
    qtyChange: -15,
    rate: 2.433,
    valueChange: -36.5,
    batchLotNumber: "LOT-TOM-01"
  }
];

// Initial stock balances calculated from ledger entries
export const initialStockBalances: StockBalance[] = [
  {
    storeId: "S-01",
    itemId: "I-01",
    qtyOnHand: 60, // 50 + 30 - 5 - 15
    movingAverageCost: 2.433,
    fifoQueue: [
      { qty: 35, rate: 2.50 }, // 50 initially, 15 issued -> 35 left
      { qty: 25, rate: 2.30, batch: "LOT-TOM-01" } // 30 received, 5 returned -> 25 left
    ]
  },
  {
    storeId: "S-01",
    itemId: "I-02",
    qtyOnHand: 20,
    movingAverageCost: 45.00,
    fifoQueue: [{ qty: 20, rate: 45.00 }]
  },
  {
    storeId: "S-01",
    itemId: "I-03",
    qtyOnHand: 30,
    movingAverageCost: 12.00,
    fifoQueue: [{ qty: 30, rate: 12.00 }]
  }
];

export const initialDayClosures: DayClosureRecord[] = [
  {
    id: "EOD-20260907-ALL",
    closureDate: "2026-09-07",
    closedAt: "2026-09-07T23:45:00Z",
    closedBy: "David Miller",
    closedById: "U-03",
    closedByRole: "Store Manager",
    storeId: "all",
    storeName: "All Locations (Consolidated)",
    status: "Closed",
    totalInventoryValuation: 1405.98,
    totalGrnCount: 1,
    totalGrnValue: 69.0,
    totalIssueCount: 1,
    totalIssueValue: 36.5,
    totalReturnCount: 1,
    pendingPrsCount: 0,
    pendingPosCount: 0,
    pendingApprovalsCount: 0,
    stockLedgerEntriesCount: 3,
    checklist: [
      {
        id: "check-draft-grns",
        label: "Goods Receipts (GRN) Status",
        description: "All inbound shipments received today have been verified and posted",
        status: "Passed",
        details: "1 GRN(s) posted today ($69.00)"
      },
      {
        id: "check-draft-issues",
        label: "Material Issues & Requisitions",
        description: "Kitchen & department material issuances posted to ledger",
        status: "Passed",
        details: "1 issue slip(s) posted ($36.50)"
      },
      {
        id: "check-ledger-sync",
        label: "Stock Ledger Synchronization",
        description: "Inventory balance changes accurately reflected in ledger cards",
        status: "Passed",
        details: "3 inventory ledger movement(s) processed for 2026-09-07"
      },
      {
        id: "check-approvals",
        label: "Pending Management Authorizations",
        description: "PRs or POs awaiting signature before day lock",
        status: "Passed",
        details: "0 PR(s), 0 PO(s) in review queue"
      },
      {
        id: "check-costing",
        label: "Weighted Cost Engine Consistency",
        description: "All inventory prices computed and balanced with zero negative stock",
        status: "Passed",
        details: "Consolidated stock valuation: $1,405.98"
      }
    ],
    remarks: "Previous day reconciliation completed without variance. All kitchen evening issues posted.",
    auditTrail: [
      {
        id: "AUD-EOD-01",
        timestamp: "2026-09-07T23:45:00Z",
        userId: "U-03",
        userName: "David Miller",
        action: "Day Closure Executed",
        details: "Closed stock ledger for 2026-09-07 at All Locations (Consolidated)."
      }
    ]
  }
];
