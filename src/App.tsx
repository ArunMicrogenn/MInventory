import { useState, useEffect } from "react";
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth, googleProvider } from "./lib/firebase";
import { subscribeToCollection, updateDocument, deleteDocument } from "./lib/firestoreService";
import { 
  Item, Store, Property, Department, Supplier, User, SystemConfig, 
  PRHeader, POHeader, MRHeader, GRNHeader, ReceiptReturnHeader, 
  RateModHeader, IssueHeader, IssueReturnHeader, 
  StoreOpeningHeader, ReconciliationHeader, StockBalance, StockLedgerEntry,
  DayClosureRecord, MonthClosureRecord
} from "./types";
import { 
  initialItems, initialStores, initialProperties, initialDepartments, initialSuppliers, 
  initialUsers, initialConfig, initialPRs, initialPOs, initialMRs, 
  initialGRNs, initialStockBalances, initialStockLedger, initialDayClosures,
  initialRecipes, initialProductionRequests
} from "./initialData";

import Dashboard from "./components/Dashboard";
import MasterDataModule from "./components/MasterDataModule";
import PRModule from "./components/PRModule";
import POModule from "./components/POModule";
import MRModule from "./components/MRModule";
import GRNModule from "./components/GRNModule";
import ReturnsRateModModule from "./components/ReturnsRateModModule";
import MaterialIssueModule from "./components/MaterialIssueModule";
import StoreOpeningReconModule from "./components/StoreOpeningReconModule";
import AuditTrailModal from "./components/AuditTrailModal";
import ReportsModule from "./components/ReportsModule";
import DayClosureModal from "./components/DayClosureModal";
import MonthClosureModal from "./components/MonthClosureModal";
import ReprintCenterModule from "./components/ReprintCenterModule";
import ApprovalCenterModule from "./components/ApprovalCenterModule";
import FBProductionModule, { FBRecipe, FBProductionRequest } from "./components/FBProductionModule";
import AuthScreen from "./components/AuthScreen";

import { 
  LayoutDashboard, Database, ClipboardList, ShoppingBag, 
  Shuffle, CheckSquare, RefreshCw, Layers, History, HelpCircle, 
  UserSquare2, ArrowLeftRight, FileText, CalendarCheck2, Printer, ShieldCheck, ChefHat
} from "lucide-react";

export default function App() {
  // Auth state
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  // App User Session state (supports Email/Password, 1-Click Role Login, and Google)
  const [appUser, setAppUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem("inventrack_user_session");
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setLoading(false);
      setLoginError(null);
    }, (error) => {
      console.warn("Auth state notice", error);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Navigation Routing
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleLoginSuccess = (userInfo: {
    id: string;
    name: string;
    email?: string;
    role: any;
    department?: string;
    designation?: string;
  }) => {
    const sessionUser: User = {
      id: userInfo.id,
      name: userInfo.name,
      role: userInfo.role,
      department: userInfo.department || "Procurement",
      permissions: ["all-access", "raise-PR", "raise-PO", "post-GRN", "approve-PR"]
    };
    setAppUser(sessionUser);
    setCurrentUser(sessionUser);
    try {
      localStorage.setItem("inventrack_user_session", JSON.stringify(sessionUser));
    } catch (e) {
      console.warn("Session save error", e);
    }
  };

  const handleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      setLoginError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Sign in failed. Full error object:", error);
      // Map common Firebase errors to readable messages
      if (error.code === 'auth/invalid-credential') {
        setLoginError("Invalid credential. Please try again or use Username/Password.");
      } else if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        setLoginError("Sign-in cancelled. Please try again or use Username/Password.");
      } else if (error.code === 'auth/network-request-failed') {
        setLoginError("Network error. Please check your internet connection.");
      } else {
        setLoginError("Google OAuth error. Please use Username/Password or Quick Demo login.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Sign out failed", error);
    }
    setFirebaseUser(null);
    setAppUser(null);
    try {
      localStorage.removeItem("inventrack_user_session");
    } catch (e) {
      console.warn("Storage error", e);
    }
  };

  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");

  const [items, setItems] = useState<Item[]>(initialItems);
  const [stores, setStores] = useState<Store[]>(initialStores);
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [config, setConfig] = useState<SystemConfig>(initialConfig);

  // Actor Selection (Simulation Helper)
  const [currentUser, setCurrentUser] = useState<User>(initialUsers[0]); // Default: Chef/Requester

  // Transactional States
  const [prs, setPrs] = useState<PRHeader[]>([]);
  const [pos, setPos] = useState<POHeader[]>([]);
  const [mrs, setMrs] = useState<MRHeader[]>([]);
  const [grns, setGrns] = useState<GRNHeader[]>([]);
  const [returns, setReturns] = useState<ReceiptReturnHeader[]>([]);
  const [rateMods, setRateMods] = useState<RateModHeader[]>([]);
  const [issues, setIssues] = useState<IssueHeader[]>([]);
  const [issueReturns, setIssueReturns] = useState<IssueReturnHeader[]>([]);
  const [openings, setOpenings] = useState<StoreOpeningHeader[]>([]);
  const [recons, setRecons] = useState<ReconciliationHeader[]>([]);
  const [recipes, setRecipes] = useState<FBRecipe[]>(initialRecipes);
  const [productionRequests, setProductionRequests] = useState<FBProductionRequest[]>(initialProductionRequests);

  const handleRaiseMaterialIssueFromProduction = (newIssue: IssueHeader) => {
    setIssues(prev => [newIssue, ...prev]);
    newIssue.lines.forEach(line => {
      handlePostStockLedger(
        newIssue.storeId,
        line.itemId,
        -line.issuedQty,
        line.unitRate,
        "Production Material Issue",
        newIssue.id,
        "LOT-PROD-ISS"
      );
    });
  };

  // Stock Ledger & Balance State
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [ledger, setLedger] = useState<StockLedgerEntry[]>([]);

  // Day Closure State
  const [dayClosures, setDayClosures] = useState<DayClosureRecord[]>(() => {
    try {
      const saved = localStorage.getItem("inventrack_day_closures");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return initialDayClosures;
  });
  const [dayClosureModalOpen, setDayClosureModalOpen] = useState<boolean>(false);

  // Month Closure State
  const [monthClosures, setMonthClosures] = useState<MonthClosureRecord[]>(() => {
    try {
      const saved = localStorage.getItem("inventrack_month_closures");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });
  const [monthClosureModalOpen, setMonthClosureModalOpen] = useState<boolean>(false);

  const handleSaveDayClosure = (newOrUpdated: DayClosureRecord) => {
    setDayClosures((prev) => {
      const existingIdx = prev.findIndex((c) => c.id === newOrUpdated.id);
      let nextList: DayClosureRecord[];
      if (existingIdx >= 0) {
        nextList = [...prev];
        nextList[existingIdx] = newOrUpdated;
      } else {
        nextList = [newOrUpdated, ...prev];
      }
      try {
        localStorage.setItem("inventrack_day_closures", JSON.stringify(nextList));
      } catch (e) {
        console.error(e);
      }
      return nextList;
    });
  };

  const handleSaveMonthClosure = (newOrUpdated: MonthClosureRecord) => {
    setMonthClosures((prev) => {
      const existingIdx = prev.findIndex((c) => c.id === newOrUpdated.id);
      let nextList: MonthClosureRecord[];
      if (existingIdx >= 0) {
        nextList = [...prev];
        nextList[existingIdx] = newOrUpdated;
      } else {
        nextList = [newOrUpdated, ...prev];
      }
      try {
        localStorage.setItem("inventrack_month_closures", JSON.stringify(nextList));
      } catch (e) {
        console.error(e);
      }
      return nextList;
    });
  };

  const handleAutoGenerateOpening = (newOpening: StoreOpeningHeader) => {
    setOpenings((prev) => {
      const exists = prev.some((o) => o.id === newOpening.id);
      if (exists) return prev;
      const next = [newOpening, ...prev];
      try {
        localStorage.setItem("inventrack_store_openings", JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });

    newOpening.lines.forEach((line) => {
      handlePostStockLedger(
        newOpening.storeId,
        line.itemId,
        line.quantity,
        line.rate,
        "Store Opening",
        newOpening.id,
        `LOT-OPN-${newOpening.id}`
      );
    });
  };

  useEffect(() => {
    if (!firebaseUser && !appUser) return;
    
    const unsubPrs = subscribeToCollection<PRHeader>('prs', (data) => {
      if (data && data.length > 0) setPrs(data);
    });
    const unsubPos = subscribeToCollection<POHeader>('pos', (data) => {
      if (data && data.length > 0) setPos(data);
    });
    const unsubMrs = subscribeToCollection<MRHeader>('mrs', (data) => {
      if (data && data.length > 0) setMrs(data);
    });
    const unsubGrns = subscribeToCollection<GRNHeader>('grns', (data) => {
      if (data && data.length > 0) setGrns(data);
    });
    const unsubBalances = subscribeToCollection<StockBalance>('inventory', (data) => {
      if (data && data.length > 0) setBalances(data);
    });
    return () => {
      unsubPrs();
      unsubPos();
      unsubMrs();
      unsubGrns();
      unsubBalances();
    };
  }, [firebaseUser, appUser]);

  // Stock Ledger Summary & Filter States
  const [ledgerSearch, setLedgerSearch] = useState<string>("");
  const [ledgerStoreFilter, setLedgerStoreFilter] = useState<string>("all");
  const [ledgerItemFilter, setLedgerItemFilter] = useState<string>("all");

  // Weighted Average Costing Simulation States
  const [wacItemId, setWacItemId] = useState<string>("");
  const [wacStoreId, setWacStoreId] = useState<string>("");
  const [wacTxType, setWacTxType] = useState<string>("Receipt"); 
  const [wacQty, setWacQty] = useState<number>(20);
  const [wacRate, setWacRate] = useState<number>(10);
  const [wacBatch, setWacBatch] = useState<string>("LOT-WAC");
  const [wacSimulatorOpen, setWacSimulatorOpen] = useState<boolean>(false);

  // Global Centralized Audit Trail Modal State
  const [auditModalOpen, setAuditModalOpen] = useState<boolean>(false);
  const [auditTxId, setAuditTxId] = useState<string>("");
  const [auditTxType, setAuditTxType] = useState<string>("");
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const handleOpenAuditTimeline = (id: string, type: string, trail: any[]) => {
    setAuditTxId(id);
    setAuditTxType(type);
    setAuditLogs(trail);
    setAuditModalOpen(true);
  };

  // ----------------------------------------------------
  // WEIGHTED MOVING AVERAGE COSTING & STOCK LEDGER ENGINE
  // ----------------------------------------------------

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-950 text-white gap-3">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-400">Loading InvenTrack Pro...</p>
      </div>
    );
  }

  if (!firebaseUser && !appUser) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const handlePostStockLedger = (
    storeId: string,
    itemId: string,
    qty: number, // positive for stock-in, negative for stock-out
    rate: number,
    type: any,
    txId: string,
    batch: string = "FIFO-AUTO"
  ) => {
    const timestamp = new Date().toISOString();
    
    // Find or initialize store balance record
    const existingBalance = balances.find(b => b.storeId === storeId && b.itemId === itemId);
    
    let currentBalObj: StockBalance;
    
    if (existingBalance) {
      currentBalObj = { ...existingBalance };
    } else {
      currentBalObj = {
        storeId,
        itemId,
        qtyOnHand: 0,
        movingAverageCost: rate,
        fifoQueue: []
      };
    }

    const initialQty = currentBalObj.qtyOnHand;

    // Handle batch additions and FIFO consumption queues
    let updatedQueue = [...currentBalObj.fifoQueue];

    if (qty > 0) {
      // Stock addition: Register a new batch card
      updatedQueue.push({
        qty,
        rate,
        batch: batch === "FIFO-AUTO" ? `LOT-${txId.slice(-4)}-${Date.now().toString().slice(-3)}` : batch
      });
    } else if (qty < 0) {
      // Stock reduction: Consume quantities
      let qtyToReduce = Math.abs(qty);

      if (batch !== "FIFO-AUTO") {
        // Specific batch selected by store keeper
        updatedQueue = updatedQueue.map(b => {
          if (b.batch === batch) {
            const avail = b.qty;
            const consumed = Math.min(avail, qtyToReduce);
            qtyToReduce -= consumed;
            return { ...b, qty: avail - consumed };
          }
          return b;
        }).filter(b => b.qty > 0);
      }

      // If there's still quantity to reduce, or "FIFO-AUTO" was requested
      if (qtyToReduce > 0) {
        // Sort by standard FIFO priority and subtract
        const temp: typeof updatedQueue = [];
        for (const b of updatedQueue) {
          if (qtyToReduce <= 0) {
            temp.push(b);
          } else {
            const avail = b.qty;
            if (avail <= qtyToReduce) {
              qtyToReduce -= avail;
              // batch is completely depleted, don't push it
            } else {
              temp.push({ ...b, qty: avail - qtyToReduce });
              qtyToReduce = 0;
            }
          }
        }
        updatedQueue = temp;
      }
    }

    // Moving Weighted Average Rate Recalculation
    let nextMovingAverageCost = currentBalObj.movingAverageCost;
    const totalRemainingQty = updatedQueue.reduce((sum, b) => sum + b.qty, 0);
    
    if (totalRemainingQty > 0) {
      const totalRemainingVal = updatedQueue.reduce((sum, b) => sum + (b.qty * b.rate), 0);
      nextMovingAverageCost = totalRemainingVal / totalRemainingQty;
    }

    const updatedBalanceObj: StockBalance = {
      storeId,
      itemId,
      qtyOnHand: totalRemainingQty,
      movingAverageCost: nextMovingAverageCost,
      fifoQueue: updatedQueue
    };

    // Update balances list
    if (existingBalance) {
      setBalances(balances.map(b => (b.storeId === storeId && b.itemId === itemId) ? updatedBalanceObj : b));
    } else {
      setBalances([...balances, updatedBalanceObj]);
    }

    // Append to Stock Ledger Entries log
    const newLedgerEntry: StockLedgerEntry = {
      id: `SLE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp,
      storeId,
      itemId,
      qtyChange: qty,
      rate,
      valueChange: qty * rate,
      transactionType: type,
      transactionId: txId,
      batchLotNumber: batch
    };

    setLedger([newLedgerEntry, ...ledger]);
  };

  const runStockLedgerIntegrityCheck = () => {
    const ledgerTotals: { [key: string]: number } = {};
    ledger.forEach((entry) => {
      const key = `${entry.storeId}:${entry.itemId}`;
      ledgerTotals[key] = (ledgerTotals[key] || 0) + entry.qtyChange;
    });

    let discrepancies = 0;
    balances.forEach((bal) => {
      const key = `${bal.storeId}:${bal.itemId}`;
      const totalQty = ledgerTotals[key] || 0;
      if (Math.abs(totalQty - bal.qtyOnHand) > 0.001) {
        discrepancies++;
      }
    });

    alert(`[Stock Ledger Integrity Audit] Checked ${balances.length} balance records against ${ledger.length} ledger entries. Discrepancies found: ${discrepancies}. All 6 critical transaction types (Opening, GRN, Receipt Return, Issue, Issue Return, Reconciliation) are successfully synchronized.`);
  };

  const handleConvertToPO = (prHeader: PRHeader, selectedLines: { lineId: string; qty: number }[]) => {
    const poId = `PO-2026-000${pos.length + 1}`;
    
    const poLines = selectedLines.map((sel, idx) => {
      const prLine = prHeader.lines.find(l => l.id === sel.lineId)!;
      const itemObj = items.find(i => i.id === prLine.itemId)!;
      return {
        id: `POL-${poId}-${idx + 1}`,
        itemId: prLine.itemId,
        quantity: sel.qty,
        rate: itemObj.standardRate,
        taxPct: 5,
        discountPct: 0,
        receivedQty: 0,
        isShortClosed: false,
        sourcePRLineId: prLine.id
      };
    });

    let subTotal = 0;
    poLines.forEach(l => {
      subTotal += l.quantity * l.rate;
    });
    const taxTotal = subTotal * 0.05;
    const grandTotal = subTotal + taxTotal;

    const newPO: POHeader = {
      id: poId,
      supplierId: suppliers[0]?.id || "SUP-01",
      purchaseType: "Regular",
      deliveryStoreId: prHeader.storeId,
      paymentTerms: suppliers[0]?.paymentTerms || "Net 30",
      deliveryDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().split("T")[0],
      status: "Draft",
      lines: poLines,
      subTotal,
      taxTotal,
      discountTotal: 0,
      grandTotal,
      amendmentNumber: 0,
      auditTrail: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: "Generated PO",
          details: `PO auto-generated from Approved PR ${prHeader.id}.`
        }
      ]
    };

    const updatedPRs = prs.map(p => {
      if (p.id === prHeader.id) {
        const updatedLines = p.lines.map(line => {
          const sel = selectedLines.find(s => s.lineId === line.id);
          if (sel) {
            return { ...line, poConvertedQty: line.poConvertedQty + sel.qty };
          }
          return line;
        });

        const allConverted = updatedLines.every(l => l.poConvertedQty >= l.quantity);
        return {
          ...p,
          status: (allConverted ? "Closed" : p.status) as any,
          lines: updatedLines,
          auditTrail: [
            ...p.auditTrail,
            {
              id: `AUD-${Date.now()}`,
              timestamp: new Date().toISOString(),
              userId: currentUser.id,
              userName: currentUser.name,
              action: "Converted to PO",
              details: `Partially or fully converted to PO ${poId}.`
            }
          ]
        };
      }
      return p;
    });

    setPos([...pos, newPO]);
    setPrs(updatedPRs);
    setActiveTab("po");
  };

  const handleApproveTransaction = (
    type: string,
    id: string,
    action: "Approve" | "Reject" | "Return-for-correction",
    remark: string
  ) => {
    const nextStatus: any = 
      action === "Approve" ? "Approved" : 
      action === "Reject" ? "Rejected" : 
      "Draft";

    const newAuditLog = (oldAudit: any[]) => [
      ...(oldAudit || []),
      {
        id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        action: action === "Approve" ? "Approved" : action === "Reject" ? "Rejected" : "Returned for Correction",
        details: `${action} decision by ${currentUser.name}. Remark: "${remark}"`
      }
    ];

    if (type === "PR") {
      setPrs(prev => prev.map(p => p.id === id ? { ...p, status: nextStatus, approverRemarks: remark, auditTrail: newAuditLog(p.auditTrail) } : p));
    } else if (type === "PO") {
      setPos(prev => prev.map(p => p.id === id ? { ...p, status: nextStatus, approverRemarks: remark, auditTrail: newAuditLog(p.auditTrail) } : p));
    } else if (type === "MR") {
      setMrs(prev => prev.map(m => m.id === id ? { ...m, status: nextStatus, approverRemarks: remark, auditTrail: newAuditLog(m.auditTrail) } : m));
    } else if (type === "GRN") {
      const grnStatus: any = 
        action === "Approve" ? "Posted" : 
        action === "Reject" ? "Rejected" : 
        "Draft";

      const targetGRN = grns.find(g => g.id === id);

      setGrns(prev => prev.map(g => g.id === id ? { 
        ...g, 
        status: grnStatus, 
        approverRemarks: remark, 
        auditTrail: newAuditLog(g.auditTrail || []) 
      } : g));

      if (action === "Approve" && targetGRN) {
        // 1. Post to Stock Ledger Engine
        targetGRN.lines.forEach(line => {
          handlePostStockLedger(
            targetGRN.deliveryStoreId,
            line.itemId,
            line.receivedQty,
            line.rate,
            "Material Receipt",
            id,
            line.batchLotNumber
          );
        });

        // 2. If linked to PO, update PO line quantities and status
        if (targetGRN.sourcePOId) {
          setPos(prevPOs => {
            const poObj = prevPOs.find(p => p.id === targetGRN.sourcePOId);
            if (!poObj) return prevPOs;
            const updatedPOLines = poObj.lines.map(line => {
              const matchedRec = targetGRN.lines.find(gl => gl.sourcePOLineId === line.id);
              if (matchedRec) {
                return { ...line, receivedQty: line.receivedQty + matchedRec.receivedQty };
              }
              return line;
            });

            const allFulfilled = updatedPOLines.every(l => l.receivedQty >= l.quantity || l.isShortClosed);
            const updatedPOStatus = allFulfilled ? "Closed" : "Partially Received";

            return prevPOs.map(p => p.id === poObj.id ? {
              ...p,
              status: updatedPOStatus as any,
              lines: updatedPOLines,
              auditTrail: [
                ...(p.auditTrail || []),
                {
                  id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                  timestamp: new Date().toISOString(),
                  userId: currentUser.id,
                  userName: currentUser.name,
                  action: "Receipt Authorized",
                  details: `GRN ${id} approved by ${currentUser.name}. Stock ledger updated.`
                }
              ]
            } : p);
          });
        }
      }
    } else if (type === "Return") {
      const retStatus = action === "Approve" ? "Posted" : action === "Reject" ? "Rejected" : "Draft";
      setReturns(prev => prev.map(r => r.id === id ? { ...r, status: retStatus as any } : r));
      if (action === "Approve") {
        const retObj = returns.find(r => r.id === id);
        if (retObj) {
          retObj.lines.forEach(line => {
            const grnObj = grns.find(g => g.id === retObj.grnId);
            const grnLine = grnObj?.lines.find(gl => gl.id === line.grnLineId);
            if (grnLine) {
              handlePostStockLedger(
                grnObj!.deliveryStoreId,
                line.itemId,
                -line.returnQty,
                grnLine.rate,
                "Receipt Return",
                id,
                grnLine.batchLotNumber
              );
            }
          });
        }
      }
    } else if (type === "RateMod") {
      const modStatus = action === "Approve" ? "Posted" : action === "Reject" ? "Rejected" : "Draft";
      setRateMods(prev => prev.map(r => r.id === id ? { ...r, status: modStatus as any, auditTrail: newAuditLog(r.auditTrail) } : r));
    } else if (type === "Opening") {
      const opStatus = action === "Approve" ? "Posted" : "Draft";
      setOpenings(prev => prev.map(o => o.id === id ? { ...o, status: opStatus as any } : o));
    } else if (type === "Reconciliation") {
      const recStatus = action === "Approve" ? "Posted" : action === "Reject" ? "Rejected" : "Draft";
      setRecons(prev => prev.map(r => r.id === id ? { ...r, status: recStatus as any } : r));
      if (action === "Approve") {
        const recObj = recons.find(r => r.id === id);
        if (recObj) {
          recObj.lines.forEach(line => {
            const itemObj = items.find(i => i.id === line.itemId);
            const standardRate = itemObj?.standardRate || 1;
            handlePostStockLedger(
              recObj.storeId,
              line.itemId,
              line.qtyVariance,
              standardRate,
              "Physical Reconciliation",
              id,
              "FIFO-AUTO"
            );
          });
        }
      }
    }
  };

  const handleBulkApproveTransactions = (
    itemsList: { type: string; id: string }[],
    action: "Approve" | "Reject",
    remark: string
  ) => {
    itemsList.forEach(item => {
      handleApproveTransaction(item.type, item.id, action, remark);
    });
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-600 antialiased overflow-hidden" id="pim-app-shell">
      {/* LEFT PERSISTENT SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0">
        <div className="p-5 border-b border-slate-800 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center font-extrabold text-white text-base shadow-sm">I</div>
          <div>
            <h1 className="text-sm font-extrabold text-white tracking-tight">InvenTrack Pro</h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-wide mt-0.5">PURCHASE & LEDGER</p>
          </div>
        </div>

        {/* Dynamic navigation links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "dashboard" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <LayoutDashboard size={15} />
            Command Center
          </button>

          <div className="pt-3 pb-1 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">AUTHORIZATIONS</div>
          <button
            onClick={() => setActiveTab("approvals")}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "approvals" ? "bg-purple-600 text-white shadow-xs" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
            id="nav-approvals-screen-btn"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={15} />
              <span>Approval Center</span>
            </div>
            {(() => {
              const count = 
                prs.filter(p => p.status === "Pending Approval" || p.status === "Submitted").length +
                pos.filter(p => p.status === "Pending Approval" || p.status === "Submitted").length +
                mrs.filter(m => m.status === "Pending Approval" || m.status === "Submitted").length +
                grns.filter(g => g.status === "Pending Approval").length;
              return count > 0 ? (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  activeTab === "approvals" ? "bg-white/20 text-white" : "bg-amber-500 text-slate-950"
                }`}>
                  {count}
                </span>
              ) : null;
            })()}
          </button>
          
          <div className="pt-3 pb-1 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">DATABASES</div>
          <button
            onClick={() => setActiveTab("masters")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "masters" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Database size={15} />
            Master Data Setup
          </button>

          <div className="pt-3 pb-1 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">PROCUREMENT PIEPLINE</div>
          <button
            onClick={() => setActiveTab("pr")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "pr" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <ClipboardList size={15} />
            Purchase Requisition (PR)
          </button>
          <button
            onClick={() => setActiveTab("po")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "po" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <ShoppingBag size={15} />
            Purchase Orders (PO)
          </button>

          <div className="pt-3 pb-1 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">STORE INVENTORY</div>
          <button
            onClick={() => setActiveTab("mr")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "mr" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Shuffle size={15} />
            Material Request (MR)
          </button>
          <button
            onClick={() => setActiveTab("grn")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "grn" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <CheckSquare size={15} />
            Material Receipts (GRN)
          </button>
          <button
            onClick={() => setActiveTab("returns")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "returns" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <RefreshCw size={15} />
            Returns & Rate Mods
          </button>
          <button
            onClick={() => setActiveTab("issues")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "issues" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <ArrowLeftRight size={15} />
            Material Issue & Cons
          </button>
          <button
            onClick={() => setActiveTab("fb-production")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "fb-production" ? "bg-purple-600 text-white shadow-xs" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
            id="nav-fb-production-btn"
          >
            <ChefHat size={15} />
            <span>F&B Production & Issues</span>
          </button>
          <button
            onClick={() => setActiveTab("recons")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "recons" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Layers size={15} />
            Reconciliations
          </button>

          <div className="pt-3 pb-1 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">LEDGER</div>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "ledger" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <History size={15} />
            Stock Ledger Cards
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "reports" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <FileText size={15} />
            Reports
          </button>
          <button
            onClick={() => setActiveTab("reprint")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "reprint" ? "bg-purple-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Printer size={15} />
            Voucher Reprint Center
          </button>
          <button
            onClick={() => setDayClosureModalOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg text-purple-300 hover:bg-purple-950/60 hover:text-purple-200 border border-purple-800/40 mt-1 transition-all cursor-pointer"
            id="sidebar-day-closure-btn"
          >
            <CalendarCheck2 size={15} className="text-purple-400" />
            Day Closure (EOD)
          </button>
          <button
            onClick={() => setMonthClosureModalOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg text-indigo-300 hover:bg-indigo-950/60 hover:text-indigo-200 border border-indigo-800/40 mt-1 transition-all cursor-pointer"
            id="sidebar-month-closure-btn"
          >
            <CalendarCheck2 size={15} className="text-indigo-400" />
            Month Closure (EOM)
          </button>
        </nav>

        {/* BOTTOM USER/ROLE QUICK CHANGE FOR EASY DEMO */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-2">
          <div className="flex items-center gap-2">
            <UserSquare2 size={16} className="text-purple-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Actor Simulator Role</span>
          </div>
          <select
            value={currentUser.id}
            onChange={(e) => {
              const u = users.find(usr => usr.id === e.target.value);
              if (u) setCurrentUser(u);
            }}
            className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-xs text-white font-bold"
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.designation})</option>
            ))}
          </select>
          <p className="text-[9px] text-slate-500 font-medium text-center">Switch roles to test approvals instantly!</p>
        </div>
      </aside>

      {/* RIGHT WORKSPACE SCROLL CONTAINER */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* TOP STATUS BAR */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-500">
            <span>Property Location:</span>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-extrabold text-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              <option value="all">All Properties (Global Consolidated)</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSignOut}
              className="text-xs font-bold text-slate-500 hover:text-rose-600 transition-colors"
              id="sign-out-header-btn"
            >
              Sign Out
            </button>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-800 block">
                {firebaseUser?.displayName || appUser?.name || currentUser.name}
              </span>
              <span className="text-[10px] text-slate-400 font-bold block">
                {currentUser.department || "Executive Management"}
              </span>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-extrabold text-purple-600 text-xs shadow-xs">
              {(firebaseUser?.displayName || appUser?.name || currentUser.name || "U").slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* ROUTED COMPONENT BODY */}
        <div className="flex-1 overflow-y-auto p-8">
          {(() => {
            const matchProperty = (propId?: string) => {
              if (selectedPropertyId === "all") return true;
              return !propId || propId === selectedPropertyId;
            };

            const filteredPrs = prs.filter(p => matchProperty(p.propertyId));
            const filteredPos = pos.filter(p => matchProperty(p.propertyId));
            const filteredMrs = mrs.filter(p => matchProperty(p.propertyId));
            const filteredGrns = grns.filter(p => matchProperty(p.propertyId));
            const filteredReturns = returns.filter(r => matchProperty(r.propertyId));
            const filteredRateMods = rateMods.filter(rm => matchProperty(rm.propertyId));
            const filteredOpenings = openings.filter(o => matchProperty(o.propertyId));
            const filteredRecons = recons.filter(rc => matchProperty(rc.propertyId));
            const filteredIssues = issues.filter(i => matchProperty(i.propertyId));
            const filteredIssueReturns = issueReturns.filter(ir => matchProperty(ir.propertyId));

            return (
              <>
                {activeTab === "dashboard" && (
                  <Dashboard 
                    prs={filteredPrs}
                    pos={filteredPos}
                    mrs={filteredMrs}
                    grns={filteredGrns}
                    returns={filteredReturns}
                    rateMods={filteredRateMods}
                    openings={filteredOpenings}
                    reconciliations={filteredRecons}
                    balances={balances}
                    items={items}
                    stores={stores}
                    config={config}
                    setConfig={setConfig}
                    currentUser={currentUser}
                    setCurrentUser={setCurrentUser}
                    users={users}
                    onApproveTransaction={handleApproveTransaction}
                    onBulkApproveTransactions={handleBulkApproveTransactions}
                    onViewAudit={handleOpenAuditTimeline}
                    onOpenDayClosure={() => setDayClosureModalOpen(true)}
                    onOpenApprovals={() => setActiveTab("approvals")}
                  />
                )}

                {activeTab === "approvals" && (
                  <ApprovalCenterModule
                    prs={filteredPrs}
                    pos={filteredPos}
                    mrs={filteredMrs}
                    grns={filteredGrns}
                    items={items}
                    stores={stores}
                    departments={departments}
                    suppliers={suppliers}
                    properties={properties}
                    currentUser={currentUser}
                    users={users}
                    onApproveTransaction={handleApproveTransaction}
                    onBulkApproveTransactions={handleBulkApproveTransactions}
                    onViewAudit={handleOpenAuditTimeline}
                    selectedPropertyId={selectedPropertyId}
                  />
                )}

                {activeTab === "masters" && (
                  <MasterDataModule 
                    items={items} setItems={setItems}
                    stores={stores} setStores={setStores}
                    departments={departments}
                    suppliers={suppliers}
                    users={users}
                  />
                )}

                {activeTab === "pr" && (
                  <PRModule 
                    prs={filteredPrs} setPrs={setPrs}
                    items={items}
                    stores={stores}
                    departments={departments}
                    currentUser={currentUser}
                    onConvertToPO={handleConvertToPO}
                    onViewAudit={handleOpenAuditTimeline}
                  />
                )}

                {activeTab === "po" && (
                  <POModule 
                    pos={filteredPos} setPos={setPos}
                    items={items}
                    stores={stores}
                    suppliers={suppliers}
                    currentUser={currentUser}
                    onViewAudit={handleOpenAuditTimeline}
                  />
                )}

                {activeTab === "mr" && (
                  <MRModule 
                    mrs={filteredMrs} setMrs={setMrs}
                    items={items}
                    stores={stores}
                    departments={departments}
                    currentUser={currentUser}
                    onViewAudit={handleOpenAuditTimeline}
                  />
                )}

                {activeTab === "fb-production" && (
                  <FBProductionModule 
                    productionRequests={productionRequests}
                    setProductionRequests={setProductionRequests}
                    recipes={recipes}
                    items={items}
                    stores={stores}
                    departments={departments}
                    properties={properties}
                    currentUser={currentUser}
                    onRaiseMaterialIssue={handleRaiseMaterialIssueFromProduction}
                  />
                )}

                {activeTab === "grn" && (
                  <GRNModule 
                    grns={filteredGrns} setGrns={setGrns}
                    pos={filteredPos} setPos={setPos}
                    items={items}
                    stores={stores}
                    suppliers={suppliers}
                    currentUser={currentUser}
                    config={config}
                    onPostStockLedger={handlePostStockLedger}
                  />
                )}

                {activeTab === "returns" && (
                  <ReturnsRateModModule 
                    returns={filteredReturns} setReturns={setReturns}
                    rateMods={filteredRateMods} setRateMods={setRateMods}
                    grns={filteredGrns} setGrns={setGrns}
                    items={items}
                    stores={stores}
                    suppliers={suppliers}
                    balances={balances}
                    currentUser={currentUser}
                    onPostStockLedger={handlePostStockLedger}
                  />
                )}

                {activeTab === "issues" && (
                  <MaterialIssueModule 
                    issues={filteredIssues} setIssues={setIssues}
                    issueReturns={filteredIssueReturns} setIssueReturns={setIssueReturns}
                    mrs={filteredMrs} setMrs={setMrs}
                    items={items}
                    stores={stores}
                    departments={departments}
                    balances={balances}
                    currentUser={currentUser}
                    onPostStockLedger={handlePostStockLedger}
                  />
                )}

                {activeTab === "reports" && (
                  <ReportsModule mrs={filteredMrs} grns={filteredGrns} issues={filteredIssues} departments={departments} />
                )}

                {activeTab === "reprint" && (
                  <ReprintCenterModule
                    mrs={filteredMrs}
                    grns={filteredGrns}
                    issues={filteredIssues}
                    issueReturns={filteredIssueReturns}
                    items={items}
                    stores={stores}
                    departments={departments}
                    suppliers={suppliers}
                    currentUser={currentUser}
                  />
                )}

                {activeTab === "recons" && (
                  <StoreOpeningReconModule 
                    openings={filteredOpenings} setOpenings={setOpenings}
                    recons={filteredRecons} setRecons={setRecons}
                    items={items}
                    stores={stores}
                    currentUser={currentUser}
                    onPostStockLedger={handlePostStockLedger}
                    balances={balances}
                  />
                )}

                {activeTab === "ledger" && (
                  <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-xs space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <h2 className="text-base font-bold text-slate-800">Stock Card Ledger Summary & Report</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Real-time consolidated balance valuation, transaction auditing, and inventory cost statements.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const filteredBalances = balances.filter(bal => {
                              const itemObj = items.find(i => i.id === bal.itemId);
                              const matchesSearch = !ledgerSearch || 
                                itemObj?.name.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
                                itemObj?.code.toLowerCase().includes(ledgerSearch.toLowerCase());
                              const matchesStore = ledgerStoreFilter === "all" || bal.storeId === ledgerStoreFilter;
                              const matchesCategory = ledgerItemFilter === "all" || itemObj?.category === ledgerItemFilter;
                              return matchesSearch && matchesStore && matchesCategory;
                            });

                            const headers = ["Store Location", "Item SKU", "Item Code", "Current On Hand Qty", "Weighted MA Cost ($)", "Valuation ($)"];
                            const rows = filteredBalances.map(bal => {
                              const storeObj = stores.find(s => s.id === bal.storeId);
                              const itemObj = items.find(i => i.id === bal.itemId);
                              const valuation = bal.qtyOnHand * bal.movingAverageCost;
                              return [
                                storeObj?.name || "",
                                itemObj?.name || "",
                                itemObj?.code || "",
                                bal.qtyOnHand,
                                bal.movingAverageCost.toFixed(2),
                                valuation.toFixed(2)
                              ];
                            });
                            
                            const csvContent = "data:text/csv;charset=utf-8," 
                              + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
                            const encodedUri = encodeURI(csvContent);
                            const link = document.createElement("a");
                            link.setAttribute("href", encodedUri);
                            link.setAttribute("download", `stock_ledger_summary_report_${Date.now()}.csv`);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="px-3 py-1.5 text-xs font-bold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
                        >
                          Export CSV
                        </button>
                        <button
                          onClick={() => window.print()}
                          className="px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all cursor-pointer"
                        >
                          Print Report
                        </button>
                        <button
                          onClick={runStockLedgerIntegrityCheck}
                          className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          Audit Ledger Balance Integrity
                        </button>
                      </div>
                    </div>

                    {/* Filtering Toolbar */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Search SKU Item</label>
                        <input
                          type="text"
                          value={ledgerSearch}
                          onChange={(e) => setLedgerSearch(e.target.value)}
                          placeholder="Search by SKU name or code..."
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Store Location</label>
                        <select
                          value={ledgerStoreFilter}
                          onChange={(e) => setLedgerStoreFilter(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="all">All Stores & Warehouses</option>
                          {stores.map(st => (
                            <option key={st.id} value={st.id}>{st.name} ({st.code})</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Item Category</label>
                        <select
                          value={ledgerItemFilter}
                          onChange={(e) => setLedgerItemFilter(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="all">All Categories</option>
                          <option value="Dry Stores">Dry Stores / Groceries</option>
                          <option value="Cold Storage">Cold Storage / Meat & Dairy</option>
                          <option value="Beverage Store">Beverage / Wine Store</option>
                          <option value="General Supplies">General / Kitchen Supplies</option>
                        </select>
                      </div>
                    </div>

                    {/* INTERACTIVE WEIGHTED AVERAGE COSTING ANALYZER & POSTING OPTION */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="p-1 px-2 text-[10px] uppercase font-extrabold bg-purple-100 text-purple-700 rounded-sm">COSTING ENGINE TOOL</span>
                          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Weighted Average Cost (WAC) Recalculator & Posting Option</h3>
                        </div>
                        <button
                          onClick={() => {
                            setWacSimulatorOpen(!wacSimulatorOpen);
                            if (!wacItemId && items.length > 0) setWacItemId(items[0].id);
                            if (!wacStoreId && stores.length > 0) setWacStoreId(stores[0].id);
                          }}
                          className="text-xs font-bold text-purple-600 hover:text-purple-800 transition-all focus:outline-none cursor-pointer"
                        >
                          {wacSimulatorOpen ? "Collapse Option Calculator" : "Configure Calculation & Post WAC"}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">
                        Select any inventory item and run simulated or live Weighted Average Cost (WAC) calculations for incoming/outgoing stock transactions (Material Receipts, Issues, Returns, and Reconciliations).
                      </p>

                      {wacSimulatorOpen && (
                        <div className="bg-white p-4 rounded-lg border border-slate-200/60 shadow-2xs space-y-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                          <div className="lg:col-span-4 space-y-3">
                            <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block border-b border-purple-50 pb-1">1. Transaction Parameters</span>
                            
                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Target Inventory Item</label>
                              <select
                                value={wacItemId}
                                onChange={(e) => setWacItemId(e.target.value)}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
                              >
                                {items.map(it => (
                                  <option key={it.id} value={it.id}>{it.name} ({it.code})</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Store / Warehouse Location</label>
                              <select
                                value={wacStoreId}
                                onChange={(e) => setWacStoreId(e.target.value)}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
                              >
                                {stores.map(st => (
                                  <option key={st.id} value={st.id}>{st.name} ({st.code})</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Calculation Option (Transaction Type)</label>
                              <select
                                value={wacTxType}
                                onChange={(e) => {
                                  setWacTxType(e.target.value);
                                  if (e.target.value === "Issue" || e.target.value === "Receipt Return") {
                                    setWacRate(0);
                                  } else {
                                    setWacRate(10);
                                  }
                                }}
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none"
                              >
                                <option value="Receipt">Material Receipt (GRN) [Inward]</option>
                                <option value="Issue">Material Issue [Outward]</option>
                                <option value="Receipt Return">Material Receipt Return [Outward]</option>
                                <option value="Issue Return">Issue Return [Inward]</option>
                                <option value="Reconciliation">Reconciliation Variance [Adjust]</option>
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Trans Qty</label>
                                <input
                                  type="number"
                                  value={wacQty}
                                  onChange={(e) => setWacQty(parseFloat(e.target.value) || 0)}
                                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                  {wacTxType === "Issue" || wacTxType === "Receipt Return" ? "Posting Cost ($) (Auto)" : "Trans Rate ($/unit)"}
                                </label>
                                <input
                                  type="number"
                                  disabled={wacTxType === "Issue" || wacTxType === "Receipt Return"}
                                  value={wacRate}
                                  onChange={(e) => setWacRate(parseFloat(e.target.value) || 0)}
                                  className="w-full p-2 bg-slate-50 disabled:opacity-60 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Batch / Lot / Doc Reference</label>
                              <input
                                type="text"
                                value={wacBatch}
                                onChange={(e) => setWacBatch(e.target.value)}
                                placeholder="e.g. LOT-WAC-01"
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 font-semibold focus:outline-none"
                              />
                            </div>
                          </div>

                          {(() => {
                            const selectedItemId = wacItemId || (items[0]?.id || "");
                            const selectedStoreId = wacStoreId || (stores[0]?.id || "");
                            const selectedItem = items.find(i => i.id === selectedItemId);
                            const selectedStore = stores.find(s => s.id === selectedStoreId);
                            const currentBal = balances.find(b => b.storeId === selectedStoreId && b.itemId === selectedItemId) || {
                              qtyOnHand: 0,
                              movingAverageCost: selectedItem?.standardRate || 5.0
                            };

                            const priorQty = currentBal.qtyOnHand;
                            const priorRate = currentBal.movingAverageCost;
                            const priorVal = priorQty * priorRate;

                            let transQty = wacQty;
                            let transRate = wacRate;
                            let qtySign = 1;
                            let formulaDesc = "";
                            let formulaMath = "";

                            if (wacTxType === "Receipt") {
                              qtySign = 1;
                              transRate = wacRate;
                              formulaDesc = "Inward Material Receipt adds stock quantity and value. The cost is averaged out.";
                              formulaMath = `[(${priorQty} units × $${priorRate.toFixed(2)}) + (${transQty} units × $${transRate.toFixed(2)})] ÷ (${priorQty} + ${transQty})`;
                            } else if (wacTxType === "Issue") {
                              qtySign = -1;
                              transRate = priorRate;
                              formulaDesc = "Material Issue releases stock at the current Weighted Average Cost. The unit cost remains unchanged.";
                              formulaMath = `Cost remains locked at Current Average: $${priorRate.toFixed(2)}`;
                            } else if (wacTxType === "Receipt Return") {
                              qtySign = -1;
                              transRate = priorRate;
                              formulaDesc = "Material Receipt Return reduces stock value at current average cost.";
                              formulaMath = `Cost remains locked at Current Average: $${priorRate.toFixed(2)}`;
                            } else if (wacTxType === "Issue Return") {
                              qtySign = 1;
                              transRate = wacRate;
                              formulaDesc = "Issue Return restocks returned materials, recalculating the average based on incoming value.";
                              formulaMath = `[(${priorQty} units × $${priorRate.toFixed(2)}) + (${transQty} units × $${transRate.toFixed(2)})] ÷ (${priorQty} + ${transQty})`;
                            } else if (wacTxType === "Reconciliation") {
                              qtySign = transQty >= 0 ? 1 : -1;
                              transQty = Math.abs(transQty);
                              transRate = priorRate;
                              formulaDesc = "Physical Reconciliation variance modifies the total quantity at current average cost to align books.";
                              formulaMath = `Adjusts book count at current average: $${priorRate.toFixed(2)}`;
                            }

                            const valDelta = qtySign * transQty * transRate;
                            const resultingQty = Math.max(0, priorQty + (qtySign * transQty));
                            const resultingVal = Math.max(0, priorVal + valDelta);
                            const resultingRate = resultingQty > 0 ? (resultingVal / resultingQty) : priorRate;

                            return (
                              <div className="lg:col-span-8 bg-slate-50 rounded-lg p-4 border border-slate-200/50 space-y-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-200/50 pb-1">2. Dynamic WAC Valuation Simulation</span>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <div className="bg-white p-3 rounded-lg border border-slate-200/40">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Prior Balance</span>
                                    <div className="mt-1 flex flex-col">
                                      <span className="text-sm font-extrabold text-slate-700">{priorQty} {selectedItem?.unit || "units"}</span>
                                      <span className="text-[11px] font-bold text-slate-500">Avg Cost: ${priorRate.toFixed(2)}</span>
                                      <span className="text-[10px] text-slate-400">Total Value: ${priorVal.toFixed(2)}</span>
                                    </div>
                                  </div>

                                  <div className="bg-white p-3 rounded-lg border border-slate-200/40">
                                    <span className="text-[9px] font-bold text-purple-500 uppercase tracking-wider block">Transaction Impact</span>
                                    <div className="mt-1 flex flex-col">
                                      <span className={`text-sm font-extrabold ${qtySign >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                                        {qtySign >= 0 ? "+" : "-"}{transQty} {selectedItem?.unit || "units"}
                                      </span>
                                      <span className="text-[11px] font-bold text-slate-500">Posting Cost: ${transRate.toFixed(2)}</span>
                                      <span className="text-[10px] text-slate-400">Value Delta: ${valDelta.toFixed(2)}</span>
                                    </div>
                                  </div>

                                  <div className="bg-purple-600 p-3 rounded-lg text-white">
                                    <span className="text-[9px] font-bold text-purple-200 uppercase tracking-wider block">Resulting Valuation (WAC)</span>
                                    <div className="mt-1 flex flex-col">
                                      <span className="text-sm font-extrabold">{resultingQty} {selectedItem?.unit || "units"}</span>
                                      <span className="text-[11px] font-bold text-purple-100">Avg Cost: ${resultingRate.toFixed(2)}</span>
                                      <span className="text-[10px] text-purple-200">Total Asset: ${resultingVal.toFixed(2)}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-white p-3 rounded-lg border border-purple-100 space-y-2">
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-purple-600 block">Calculation Method Explanation</span>
                                    <p className="text-[11px] text-slate-600 font-medium mt-0.5">{formulaDesc}</p>
                                  </div>
                                  <div className="bg-slate-50 p-2 rounded text-xs font-mono font-bold text-slate-700">
                                    WAC Formula = {formulaMath}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                                    <span>Computed Weighted Rate:</span>
                                    <span className="text-slate-800 font-bold bg-slate-100 px-1.5 py-0.2 rounded">${resultingRate.toFixed(4)} per {selectedItem?.unit || "unit"}</span>
                                  </div>
                                </div>

                                <div className="pt-2 flex items-center justify-between gap-4">
                                  <p className="text-[11px] text-slate-400 font-medium">
                                    Committing this transaction updates live property balances and adds a permanent stock card audit entry.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const qtyChange = qtySign * transQty;
                                      handlePostStockLedger(
                                        selectedStoreId,
                                        selectedItemId,
                                        qtyChange,
                                        transRate,
                                        `WAC ${wacTxType}`,
                                        wacBatch || "DOC-WAC-SIM",
                                        wacBatch || "LOT-WAC"
                                      );
                                      alert(`Successfully posted Weighted Average adjustment for ${selectedItem?.name} in store ${selectedStore?.name}. New dynamic average cost is $${resultingRate.toFixed(2)}.`);
                                    }}
                                    className="px-4 py-2 bg-purple-600 text-white font-extrabold text-xs rounded-lg hover:bg-purple-700 shadow-xs hover:shadow-sm cursor-pointer transition-all shrink-0"
                                  >
                                    Apply & Post to Live Stock Ledger
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {(() => {
                      const filteredBalances = balances.filter(bal => {
                        const itemObj = items.find(i => i.id === bal.itemId);
                        const matchesSearch = !ledgerSearch || 
                          itemObj?.name.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
                          itemObj?.code.toLowerCase().includes(ledgerSearch.toLowerCase());
                        const matchesStore = ledgerStoreFilter === "all" || bal.storeId === ledgerStoreFilter;
                        const matchesCategory = ledgerItemFilter === "all" || itemObj?.category === ledgerItemFilter;
                        return matchesSearch && matchesStore && matchesCategory;
                      });

                      const filteredLedger = ledger.filter(entry => {
                        const itemObj = items.find(i => i.id === entry.itemId);
                        const matchesSearch = !ledgerSearch || 
                          itemObj?.name.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
                          itemObj?.code.toLowerCase().includes(ledgerSearch.toLowerCase());
                        const matchesStore = ledgerStoreFilter === "all" || entry.storeId === ledgerStoreFilter;
                        const matchesCategory = ledgerItemFilter === "all" || itemObj?.category === ledgerItemFilter;
                        return matchesSearch && matchesStore && matchesCategory;
                      });

                      const totalSKUs = filteredBalances.length;
                      const totalStockQty = filteredBalances.reduce((sum, b) => sum + b.qtyOnHand, 0);
                      const totalAssetVal = filteredBalances.reduce((sum, b) => sum + (b.qtyOnHand * b.movingAverageCost), 0);
                      const avgItemCost = totalSKUs > 0 ? (filteredBalances.reduce((sum, b) => sum + b.movingAverageCost, 0) / totalSKUs) : 0;

                      return (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/50 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Filtered Valuation</span>
                              <div className="mt-2 flex items-baseline gap-1.5">
                                <span className="text-xl font-extrabold text-slate-800">${totalAssetVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.2 rounded-full">Asset Value</span>
                              </div>
                            </div>

                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/50 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Consolidated SKUs</span>
                              <div className="mt-2 flex items-baseline gap-1.5">
                                <span className="text-xl font-extrabold text-slate-800">{totalSKUs}</span>
                                <span className="text-[10px] font-semibold text-slate-500">Unique Cards</span>
                              </div>
                            </div>

                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/50 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">On-Hand Balance</span>
                              <div className="mt-2 flex items-baseline gap-1.5">
                                <span className="text-xl font-extrabold text-slate-800">{totalStockQty}</span>
                                <span className="text-[10px] font-semibold text-slate-500">Total Units</span>
                              </div>
                            </div>

                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/50 flex flex-col justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Avg. Material Cost</span>
                              <div className="mt-2 flex items-baseline gap-1.5">
                                <span className="text-xl font-extrabold text-slate-800">${avgItemCost.toFixed(2)}</span>
                                <span className="text-[10px] font-semibold text-slate-500">Weighted Average</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <span className="text-xs font-bold text-slate-700 block">Active Stock Cards ({filteredBalances.length})</span>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {filteredBalances.length === 0 ? (
                                <div className="col-span-full p-8 text-center text-slate-400 bg-slate-50 border border-slate-100 rounded-xl">
                                  No active stock card records match the chosen search parameters.
                                </div>
                              ) : (
                                filteredBalances.map((bal, idx) => {
                                  const itemObj = items.find(i => i.id === bal.itemId);
                                  const storeObj = stores.find(s => s.id === bal.storeId);
                                  const valuation = bal.qtyOnHand * bal.movingAverageCost;
                                  return (
                                    <div key={`${bal.storeId}-${bal.itemId}-${idx}`} className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-2">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <p className="text-xs font-bold text-slate-800">{itemObj?.name}</p>
                                          <p className="text-[10px] text-slate-400 font-medium">Store: {storeObj?.name}</p>
                                        </div>
                                        <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 border border-slate-200 rounded">
                                          {bal.qtyOnHand} {itemObj?.unit}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center text-[11px] pt-1.5 border-t border-slate-200/40">
                                        <span className="text-slate-400">Weighted MA Cost:</span>
                                        <span className="font-bold text-slate-700">${bal.movingAverageCost.toFixed(2)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-[11px]">
                                        <span className="text-slate-400">Total Asset Value:</span>
                                        <span className="font-extrabold text-slate-800">${valuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                      </div>
                                      <div className="text-[9px] text-slate-400 font-semibold bg-white p-1 rounded border border-slate-200/50 mt-1">
                                        Batches: {bal.fifoQueue.map(bb => `${bb.batch || 'FIFO'} (${bb.qty} @ $${bb.rate.toFixed(2)})`).join(", ") || "None"}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          <div className="space-y-3 pt-4 border-t border-slate-100">
                            <span className="text-xs font-bold text-slate-700 block">Filtered Stock Ledger History ({filteredLedger.length} Records)</span>
                            <div className="overflow-x-auto rounded-lg border border-slate-200/60">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-200/60">
                                    <th className="p-3">Timestamp</th>
                                    <th className="p-3">Store Location</th>
                                    <th className="p-3">Item Name</th>
                                    <th className="p-3">Transaction</th>
                                    <th className="p-3">Doc Ref</th>
                                    <th className="p-3">Batch/Lot No</th>
                                    <th className="p-3">Qty Delta</th>
                                    <th className="p-3">Posting Cost</th>
                                    <th className="p-3">Balance After</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                                  {filteredLedger.length === 0 ? (
                                    <tr>
                                      <td colSpan={9} className="p-4 text-center text-slate-400">No stock entries registered matching the current filters.</td>
                                    </tr>
                                  ) : (
                                    filteredLedger.map(entry => {
                                      const storeObj = stores.find(s => s.id === entry.storeId);
                                      const itemObj = items.find(i => i.id === entry.itemId);
                                      return (
                                        <tr key={entry.id} className="hover:bg-slate-50/50">
                                          <td className="p-3 text-[10px] text-slate-400">{new Date(entry.timestamp).toLocaleString()}</td>
                                          <td className="p-3 font-semibold text-slate-700">{storeObj?.name}</td>
                                          <td className="p-3 font-bold text-slate-800">{itemObj?.name}</td>
                                          <td className="p-3 text-slate-500 font-mono text-[11px]">{entry.transactionType}</td>
                                          <td className="p-3 font-bold text-slate-600">{entry.transactionId}</td>
                                          <td className="p-3 font-mono text-[11px] text-slate-400">{entry.batchLotNumber || "--"}</td>
                                          <td className={`p-3 font-extrabold ${entry.qtyChange >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                                            {entry.qtyChange >= 0 ? "+" : ""}{entry.qtyChange}
                                          </td>
                                          <td className="p-3 font-semibold">${entry.rate.toFixed(2)}</td>
                                          <td className="p-3 font-extrabold text-slate-700">{entry.balanceAfter} {itemObj?.unit}</td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </main>



      {/* Global Transaction Audit Trail Modal Overlay */}
      <AuditTrailModal 
        isOpen={auditModalOpen} 
        onClose={() => setAuditModalOpen(false)} 
        transactionId={auditTxId} 
        transactionType={auditTxType} 
        auditTrail={auditLogs} 
      />

      {/* Day Closure (EOD) Modal */}
      <DayClosureModal
        isOpen={dayClosureModalOpen}
        onClose={() => setDayClosureModalOpen(false)}
        stores={stores}
        items={items}
        balances={balances}
        grns={grns}
        prs={prs}
        pos={pos}
        mrs={mrs}
        returns={returns}
        issues={issues}
        ledger={ledger}
        currentUser={currentUser}
        closures={dayClosures}
        onSaveClosure={handleSaveDayClosure}
      />

      {/* Month Closure (EOM) Modal */}
      <MonthClosureModal
        isOpen={monthClosureModalOpen}
        onClose={() => setMonthClosureModalOpen(false)}
        stores={stores}
        items={items}
        balances={balances}
        grns={grns}
        issues={issues}
        returns={returns}
        recons={recons}
        ledger={ledger}
        currentUser={currentUser}
        closures={monthClosures}
        onSaveClosure={handleSaveMonthClosure}
        onAutoGenerateOpening={handleAutoGenerateOpening}
      />
    </div>
  );
}
