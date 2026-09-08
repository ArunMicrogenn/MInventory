import { useState } from "react";
import { 
  Item, Store, Department, Supplier, User, SystemConfig, 
  PRHeader, POHeader, MRHeader, GRNHeader, ReceiptReturnHeader, 
  RateModHeader, IssueHeader, IssueReturnHeader, 
  StoreOpeningHeader, ReconciliationHeader, StockBalance, StockLedgerEntry 
} from "./types";
import { 
  initialItems, initialStores, initialDepartments, initialSuppliers, 
  initialUsers, initialConfig, initialPRs, initialPOs, initialMRs, 
  initialGRNs, initialStockBalances, initialStockLedger 
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

import { 
  LayoutDashboard, Database, ClipboardList, ShoppingBag, 
  Shuffle, CheckSquare, RefreshCw, Layers, History, HelpCircle, 
  UserSquare2, ArrowLeftRight 
} from "lucide-react";

export default function App() {
  // Navigation Routing
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Master Data States
  const [items, setItems] = useState<Item[]>(initialItems);
  const [stores, setStores] = useState<Store[]>(initialStores);
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [config, setConfig] = useState<SystemConfig>(initialConfig);

  // Actor Selection (Simulation Helper)
  const [currentUser, setCurrentUser] = useState<User>(initialUsers[0]); // Default: Chef/Requester

  // Transactional States
  const [prs, setPrs] = useState<PRHeader[]>(initialPRs);
  const [pos, setPos] = useState<POHeader[]>(initialPOs);
  const [mrs, setMrs] = useState<MRHeader[]>(initialMRs);
  const [grns, setGrns] = useState<GRNHeader[]>(initialGRNs);
  const [returns, setReturns] = useState<ReceiptReturnHeader[]>([]);
  const [rateMods, setRateMods] = useState<RateModHeader[]>([]);
  const [issues, setIssues] = useState<IssueHeader[]>([]);
  const [issueReturns, setIssueReturns] = useState<IssueReturnHeader[]>([]);
  const [openings, setOpenings] = useState<StoreOpeningHeader[]>([]);
  const [recons, setRecons] = useState<ReconciliationHeader[]>([]);

  // Stock Ledger & Balance State
  const [balances, setBalances] = useState<StockBalance[]>(initialStockBalances);
  const [ledger, setLedger] = useState<StockLedgerEntry[]>(initialStockLedger);

  // Stock Ledger Summary & Filter States
  const [ledgerSearch, setLedgerSearch] = useState<string>("");
  const [ledgerStoreFilter, setLedgerStoreFilter] = useState<string>("all");
  const [ledgerItemFilter, setLedgerItemFilter] = useState<string>("all");

  // ----------------------------------------------------
  // WEIGHTED MOVING AVERAGE COSTING & STOCK LEDGER ENGINE
  // ----------------------------------------------------
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
      ...oldAudit,
      {
        id: `AUD-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        action: action === "Approve" ? "Approved" : action === "Reject" ? "Rejected" : "Returned for Correction",
        details: `${action} decision by ${currentUser.name}. Remark: "${remark}"`
      }
    ];

    if (type === "PR") {
      setPrs(prs.map(p => p.id === id ? { ...p, status: nextStatus, approverRemarks: remark, auditTrail: newAuditLog(p.auditTrail) } : p));
    } else if (type === "PO") {
      setPos(pos.map(p => p.id === id ? { ...p, status: nextStatus, approverRemarks: remark, auditTrail: newAuditLog(p.auditTrail) } : p));
    } else if (type === "MR") {
      setMrs(mrs.map(m => m.id === id ? { ...m, status: nextStatus, approverRemarks: remark, auditTrail: newAuditLog(m.auditTrail) } : m));
    } else if (type === "Return") {
      const retStatus = action === "Approve" ? "Posted" : action === "Reject" ? "Rejected" : "Draft";
      setReturns(returns.map(r => r.id === id ? { ...r, status: retStatus as any } : r));
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
      setRateMods(rateMods.map(r => r.id === id ? { ...r, status: modStatus as any, auditTrail: newAuditLog(r.auditTrail) } : r));
    } else if (type === "Opening") {
      const opStatus = action === "Approve" ? "Posted" : "Draft";
      setOpenings(openings.map(o => o.id === id ? { ...o, status: opStatus as any } : o));
    } else if (type === "Reconciliation") {
      const recStatus = action === "Approve" ? "Posted" : action === "Reject" ? "Rejected" : "Draft";
      setRecons(recons.map(r => r.id === id ? { ...r, status: recStatus as any } : r));
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

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-600 antialiased overflow-hidden" id="pim-app-shell">
      {/* LEFT PERSISTENT SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0">
        <div className="p-5 border-b border-slate-800 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-extrabold text-white text-base shadow-sm">I</div>
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
              activeTab === "dashboard" ? "bg-indigo-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <LayoutDashboard size={15} />
            Command Center
          </button>
          
          <div className="pt-3 pb-1 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">DATABASES</div>
          <button
            onClick={() => setActiveTab("masters")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "masters" ? "bg-indigo-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Database size={15} />
            Master Data Setup
          </button>

          <div className="pt-3 pb-1 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">PROCUREMENT PIEPLINE</div>
          <button
            onClick={() => setActiveTab("pr")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "pr" ? "bg-indigo-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <ClipboardList size={15} />
            Purchase Requisition (PR)
          </button>
          <button
            onClick={() => setActiveTab("po")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "po" ? "bg-indigo-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <ShoppingBag size={15} />
            Purchase Orders (PO)
          </button>

          <div className="pt-3 pb-1 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">STORE INVENTORY</div>
          <button
            onClick={() => setActiveTab("mr")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "mr" ? "bg-indigo-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Shuffle size={15} />
            Material Request (MR)
          </button>
          <button
            onClick={() => setActiveTab("grn")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "grn" ? "bg-indigo-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <CheckSquare size={15} />
            Material Receipts (GRN)
          </button>
          <button
            onClick={() => setActiveTab("returns")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "returns" ? "bg-indigo-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <RefreshCw size={15} />
            Returns & Rate Mods
          </button>
          <button
            onClick={() => setActiveTab("issues")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "issues" ? "bg-indigo-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <ArrowLeftRight size={15} />
            Material Issue & Cons
          </button>
          <button
            onClick={() => setActiveTab("recons")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "recons" ? "bg-indigo-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Layers size={15} />
            Reconciliations
          </button>

          <div className="pt-3 pb-1 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">LEDGER</div>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "ledger" ? "bg-indigo-600 text-white" : "hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <History size={15} />
            Stock Ledger Cards
          </button>
        </nav>

        {/* BOTTOM USER/ROLE QUICK CHANGE FOR EASY DEMO */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-2">
          <div className="flex items-center gap-2">
            <UserSquare2 size={16} className="text-indigo-400" />
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
            <span>Property Name:</span>
            <span className="text-slate-800 font-extrabold bg-slate-100 px-2 py-0.5 rounded">Grand Regency Hotel, London</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-xs font-bold text-slate-800 block">{currentUser.name}</span>
              <span className="text-[10px] text-slate-400 font-bold block">{currentUser.departmentId === "all" ? "Corporate Executive" : departments.find(d => d.id === currentUser.departmentId)?.name}</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-extrabold text-indigo-600 text-xs">
              {currentUser.name.slice(0,2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* ROUTED COMPONENT BODY */}
        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === "dashboard" && (
            <Dashboard 
              prs={prs}
              pos={pos}
              mrs={mrs}
              grns={grns}
              returns={returns}
              rateMods={rateMods}
              openings={openings}
              reconciliations={recons}
              balances={balances}
              items={items}
              stores={stores}
              config={config}
              setConfig={setConfig}
              currentUser={currentUser}
              setCurrentUser={setCurrentUser}
              users={users}
              onApproveTransaction={handleApproveTransaction}
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
              prs={prs} setPrs={setPrs}
              items={items}
              stores={stores}
              departments={departments}
              currentUser={currentUser}
              onConvertToPO={handleConvertToPO}
            />
          )}

          {activeTab === "po" && (
            <POModule 
              pos={pos} setPos={setPos}
              items={items}
              stores={stores}
              suppliers={suppliers}
              currentUser={currentUser}
            />
          )}

          {activeTab === "mr" && (
            <MRModule 
              mrs={mrs} setMrs={setMrs}
              items={items}
              stores={stores}
              departments={departments}
              currentUser={currentUser}
            />
          )}

          {activeTab === "grn" && (
            <GRNModule 
              grns={grns} setGrns={setGrns}
              pos={pos} setPos={setPos}
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
              returns={returns} setReturns={setReturns}
              rateMods={rateMods} setRateMods={setRateMods}
              grns={grns} setGrns={setGrns}
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
              issues={issues} setIssues={setIssues}
              issueReturns={issueReturns} setIssueReturns={setIssueReturns}
              mrs={mrs} setMrs={setMrs}
              items={items}
              stores={stores}
              departments={departments}
              balances={balances}
              currentUser={currentUser}
              onPostStockLedger={handlePostStockLedger}
            />
          )}

          {activeTab === "recons" && (
            <StoreOpeningReconModule 
              openings={openings} setOpenings={setOpenings}
              recons={recons} setRecons={setRecons}
              items={items}
              stores={stores}
              balances={balances}
              currentUser={currentUser}
              onPostStockLedger={handlePostStockLedger}
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
                      // Resolve filtered lists for dynamic export calculation
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
                    className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all cursor-pointer"
                  >
                    Print Report
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
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Store Location</label>
                  <select
                    value={ledgerStoreFilter}
                    onChange={(e) => setLedgerStoreFilter(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="all">All Categories</option>
                    <option value="Dry Stores">Dry Stores / Groceries</option>
                    <option value="Cold Storage">Cold Storage / Meat & Dairy</option>
                    <option value="Beverage Store">Beverage / Wine Store</option>
                    <option value="General Supplies">General / Kitchen Supplies</option>
                  </select>
                </div>
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
                    {/* Summary Statistics Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/50 flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Filtered Valuation</span>
                        <div className="mt-2 flex items-baseline gap-1.5">
                          <span className="text-xl font-extrabold text-slate-800">${totalAssetVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded-full">Asset Value</span>
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

                    {/* Active Stock Cards List */}
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

                    {/* Filtered History logs */}
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
        </div>
      </main>
    </div>
  );
}
