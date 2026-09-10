import React, { useState, useMemo } from "react";
import { 
  Item, Store, Department, User, Property, TransactionStatus, AuditLog, IssueHeader 
} from "../types";
import { 
  ChefHat, Utensils, ClipboardCheck, CheckCircle2, XCircle, Plus, Eye, 
  ArrowRight, Send, Printer, RefreshCw, Calendar, Sparkles, AlertCircle, Layers,
  BarChart3, DollarSign, TrendingUp, PackageCheck, Calculator, Sliders
} from "lucide-react";
import PrintButton from "./PrintButton";
import PrintDocumentModal from "./PrintDocumentModal";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";

export interface FBRecipeBOMItem {
  itemId: string;
  standardQty: number;
}

export interface FBRecipe {
  id: string;
  name: string;
  category: string;
  standardPortions: number;
  unit: string;
  ingredients: FBRecipeBOMItem[];
}

export interface FBProductionRequest {
  id: string;
  propertyId: string;
  recipeId: string;
  recipeName: string;
  targetPortions: number;
  departmentId: string;
  storeId: string;
  requiredDate: string;
  status: TransactionStatus;
  requesterId: string;
  requesterName: string;
  remarks: string;
  estimatedCost: number;
  ingredients: { itemId: string; requiredQty: number; standardRate: number }[];
  actualProduction?: {
    actualPortions: number;
    wastePortions: number;
    yieldPercentage: number;
    expiryDate: string;
    productionDate: string;
    chefName: string;
    remarks: string;
    actualIngredientsUsed: { itemId: string; usedQty: number }[];
  };
  expiryDate?: string;
  materialIssueId?: string;
  auditTrail: AuditLog[];
}

interface FBProductionModuleProps {
  productionRequests: FBProductionRequest[];
  setProductionRequests: (reqs: FBProductionRequest[]) => void;
  recipes: FBRecipe[];
  items: Item[];
  stores: Store[];
  departments: Department[];
  properties: Property[];
  currentUser: User;
  onRaiseMaterialIssue: (issue: IssueHeader) => void;
}

export default function FBProductionModule({
  productionRequests,
  setProductionRequests,
  recipes,
  items,
  stores,
  departments,
  properties,
  currentUser,
  onRaiseMaterialIssue
}: FBProductionModuleProps) {
  const [activeTab, setActiveTab] = useState<"REQUESTS" | "RECIPES" | "SCALER" | "ANALYTICS">("REQUESTS");
  const [selectedPR, setSelectedPR] = useState<FBProductionRequest | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showActualModal, setShowActualModal] = useState<FBProductionRequest | null>(null);
  const [printDoc, setPrintDoc] = useState<any | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Recipe Scaler State
  const [scalerRecipeId, setScalerRecipeId] = useState<string>(recipes[0]?.id || "REC-01");
  const [scalerPortions, setScalerPortions] = useState<number>(recipes[0]?.standardPortions || 50);

  const activeScalerRecipe = useMemo(() => {
    return recipes.find(r => r.id === scalerRecipeId) || recipes[0];
  }, [scalerRecipeId, recipes]);

  const scalerMultiplier = activeScalerRecipe ? scalerPortions / (activeScalerRecipe.standardPortions || 1) : 1;

  const scaledIngredientsList = useMemo(() => {
    if (!activeScalerRecipe) return [];
    return activeScalerRecipe.ingredients.map(ing => {
      const itm = items.find(i => i.id === ing.itemId);
      const standardRate = itm ? (itm.lastPurchaseRate || itm.standardRate || 2.50) : 2.50;
      const requiredQty = Math.round((ing.standardQty * scalerMultiplier) * 100) / 100;
      const totalCost = requiredQty * standardRate;
      return {
        ...ing,
        itemName: itm?.name || ing.itemId,
        itemUnit: itm?.unit || "Units",
        standardRate,
        requiredQty,
        totalCost
      };
    });
  }, [activeScalerRecipe, scalerMultiplier, items]);

  const scalerTotalCost = scaledIngredientsList.reduce((acc, curr) => acc + curr.totalCost, 0);
  const scalerCostPerUnit = scalerPortions > 0 ? scalerTotalCost / scalerPortions : 0;

  const handleRaisePRFromScaler = () => {
    if (!activeScalerRecipe) return;
    const newPR: FBProductionRequest = {
      id: `PROD-2026-${String(productionRequests.length + 10).padStart(4, '0')}`,
      propertyId: properties[0]?.id || "PROP-01",
      recipeId: activeScalerRecipe.id,
      recipeName: `${activeScalerRecipe.name} (Scaled - ${scalerPortions} ${activeScalerRecipe.unit})`,
      targetPortions: scalerPortions,
      departmentId: departments[0]?.id || "D-01",
      storeId: stores[0]?.id || "S-01",
      requiredDate: new Date().toISOString().split("T")[0],
      status: "Pending Approval",
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      remarks: `Raised via Recipe Scaler for ${scalerPortions} portions.`,
      estimatedCost: scalerTotalCost,
      ingredients: scaledIngredientsList.map(ing => ({
        itemId: ing.itemId,
        requiredQty: ing.requiredQty,
        standardRate: ing.standardRate
      })),
      auditTrail: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: "Submitted",
          details: `Production request created via Recipe Scaler for ${scalerPortions} portions.`
        }
      ]
    };

    setProductionRequests([newPR, ...productionRequests]);
    setSuccessToast(`Successfully raised production request ${newPR.id} for ${activeScalerRecipe.name} (${scalerPortions} portions)!`);
    setTimeout(() => setSuccessToast(null), 4000);
    setActiveTab("REQUESTS");
    setSelectedPR(newPR);
  };

  // New Production Request Form State
  const [formPropertyId, setFormPropertyId] = useState(properties[0]?.id || "PROP-01");
  const [formRecipeId, setFormRecipeId] = useState(recipes[0]?.id || "REC-01");
  const [formTargetPortions, setFormTargetPortions] = useState<number>(50);
  const [formStoreId, setFormStoreId] = useState(stores[0]?.id || "S-01");
  const [formDeptId, setFormDeptId] = useState(departments[0]?.id || "D-01");
  const [formRequiredDate, setFormRequiredDate] = useState(new Date().toISOString().split("T")[0]);
  const [formRemarks, setFormRemarks] = useState("Banquet preparation for evening event");

  // Actual Production Entry Form State
  const [actualPortions, setActualPortions] = useState<number>(50);
  const [wastePortions, setWastePortions] = useState<number>(2);
  const [actualYieldPercentage, setActualYieldPercentage] = useState<number>(100);
  const [actualExpiryDate, setActualExpiryDate] = useState<string>(
    new Date(Date.now() + 3 * 86400 * 1000).toISOString().split("T")[0]
  );
  const [actualRemarks, setActualRemarks] = useState("Completed successfully with minor trimming waste");

  // Selected recipe computed ingredients
  const selectedRecipe = useMemo(() => {
    return recipes.find(r => r.id === formRecipeId) || recipes[0];
  }, [formRecipeId, recipes]);

  const computedIngredients = useMemo(() => {
    if (!selectedRecipe) return [];
    const ratio = formTargetPortions / (selectedRecipe.standardPortions || 1);
    return selectedRecipe.ingredients.map(ing => {
      const itm = items.find(i => i.id === ing.itemId);
      const reqQty = Math.round((ing.standardQty * ratio) * 100) / 100;
      const rate = itm ? (itm.lastPurchaseRate || itm.standardRate) : 0;
      return {
        itemId: ing.itemId,
        requiredQty: reqQty,
        standardRate: rate
      };
    });
  }, [selectedRecipe, formTargetPortions, items]);

  const estimatedTotalCost = useMemo(() => {
    return computedIngredients.reduce((acc, curr) => acc + (curr.requiredQty * curr.standardRate), 0);
  }, [computedIngredients]);

  // Handle Create Production Request
  const handleSaveRequest = (status: "Draft" | "Pending Approval") => {
    if (!selectedRecipe) return;

    const prId = `PROD-2026-000${productionRequests.length + 1}`;
    const newReq: FBProductionRequest = {
      id: prId,
      propertyId: formPropertyId,
      recipeId: selectedRecipe.id,
      recipeName: selectedRecipe.name,
      targetPortions: formTargetPortions,
      departmentId: formDeptId,
      storeId: formStoreId,
      requiredDate: formRequiredDate,
      status: status === "Pending Approval" ? "Pending Approval" : "Draft",
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      remarks: formRemarks,
      estimatedCost: estimatedTotalCost,
      ingredients: computedIngredients,
      auditTrail: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: status === "Pending Approval" ? "Submitted" : "Created Draft",
          details: `Production Request ${prId} created for ${formTargetPortions} portions of ${selectedRecipe.name}.`
        }
      ]
    };

    setProductionRequests([...productionRequests, newReq]);
    setIsCreating(false);
    setSuccessToast(`Production Request ${prId} successfully created.`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  // Handle Approval Action
  const handleApproveReject = (pr: FBProductionRequest, action: "Approved" | "Rejected") => {
    const updated = productionRequests.map(r => {
      if (r.id === pr.id) {
        return {
          ...r,
          status: action,
          auditTrail: [
            ...(r.auditTrail || []),
            {
              id: `AUD-${Date.now()}`,
              timestamp: new Date().toISOString(),
              userId: currentUser.id,
              userName: currentUser.name,
              action: action,
              details: `Production Request ${action.toLowerCase()} by ${currentUser.name} (${currentUser.role}).`
            }
          ]
        };
      }
      return r;
    });
    setProductionRequests(updated);
    if (selectedPR && selectedPR.id === pr.id) {
      setSelectedPR(updated.find(u => u.id === pr.id) || null);
    }
    setSuccessToast(`Production Request ${pr.id} ${action}.`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  // Handle Actual Production Entry Submit
  const handleSaveActualProduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showActualModal) return;

    const pr = showActualModal;
    const updated = productionRequests.map(r => {
      if (r.id === pr.id) {
        return {
          ...r,
          status: "Completed" as TransactionStatus,
          actualProduction: {
            actualPortions,
            wastePortions,
            yieldPercentage: actualYieldPercentage,
            expiryDate: actualExpiryDate,
            productionDate: new Date().toISOString().split("T")[0],
            chefName: currentUser.name,
            remarks: actualRemarks,
            actualIngredientsUsed: r.ingredients.map(ing => ({
              itemId: ing.itemId,
              usedQty: ing.requiredQty // default usage matching planned or adjusted
            }))
          },
          expiryDate: actualExpiryDate,
          auditTrail: [
            ...(r.auditTrail || []),
            {
              id: `AUD-${Date.now()}`,
              timestamp: new Date().toISOString(),
              userId: currentUser.id,
              userName: currentUser.name,
              action: "Actual Production Recorded",
              details: `Yield recorded: ${actualPortions} portions produced, ${wastePortions} waste portions.`
            }
          ]
        };
      }
      return r;
    });

    setProductionRequests(updated);
    setShowActualModal(null);
    setSuccessToast(`Actual production entry recorded for ${pr.id}. Ready for Material Issue.`);
    setTimeout(() => setSuccessToast(null), 4500);
  };

  // Raise Material Issue based on Approved/Completed Production Request
  const handleRaiseMaterialIssueForPR = (pr: FBProductionRequest) => {
    const issueId = `ISS-PROD-${pr.id}`;
    const newIssue: IssueHeader = {
      id: issueId,
      propertyId: pr.propertyId,
      storeId: pr.storeId,
      departmentId: pr.departmentId,
      issueDate: new Date().toISOString().split("T")[0],
      status: "Posted",
      issuedBy: currentUser.name,
      issuedById: currentUser.id,
      purpose: `Raw Material Issue for Production Batch ${pr.id} (${pr.recipeName})`,
      remarks: `Automated issue against approved F&B production batch`,
      lines: pr.ingredients.map((ing, idx) => ({
        id: `ISSL-${issueId}-${idx + 1}`,
        itemId: ing.itemId,
        requestedQty: ing.requiredQty,
        issuedQty: ing.requiredQty,
        unitRate: ing.standardRate,
        totalAmount: ing.requiredQty * ing.standardRate
      })),
      totalValue: pr.estimatedValue,
      amendmentNumber: 0,
      auditTrail: [
        {
          id: `AUD-ISS-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: "Material Issued for Production",
          details: `Materials issued to kitchen department against Production Batch ${pr.id}.`
        }
      ]
    };

    onRaiseMaterialIssue(newIssue);

    // Update PR status to Material Issued
    const updated = productionRequests.map(r => {
      if (r.id === pr.id) {
        return {
          ...r,
          status: "Material Issued" as TransactionStatus,
          materialIssueId: issueId,
          auditTrail: [
            ...(r.auditTrail || []),
            {
              id: `AUD-${Date.now()}`,
              timestamp: new Date().toISOString(),
              userId: currentUser.id,
              userName: currentUser.name,
              action: "Material Issue Raised",
              details: `Material issue slip ${issueId} generated and posted to stock ledger.`
            }
          ]
        };
      }
      return r;
    });
    setProductionRequests(updated);
    if (selectedPR && selectedPR.id === pr.id) {
      setSelectedPR(updated.find(u => u.id === pr.id) || null);
    }

    setSuccessToast(`✓ Material Issue slip ${issueId} successfully raised and posted for ${pr.id}!`);
    setTimeout(() => setSuccessToast(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="text-emerald-400 shrink-0" size={20} />
          <span className="text-sm font-bold">{successToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-full flex items-center gap-1">
              <ChefHat size={13} />
              Culinary Operations
            </span>
            <span className="text-xs text-slate-400">• Recipe BOM & Kitchen Batches</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1">F&B Production & Material Issue Module</h1>
          <p className="text-sm text-slate-500">Manage menu production requests, approvals, actual yield entries, and automated stock material issues.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="px-4 py-2.5 bg-amber-700 text-white font-bold text-sm rounded-xl hover:bg-amber-800 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} />
            <span>New Production Request</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab("REQUESTS")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "REQUESTS"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <ClipboardCheck size={14} />
          <span>Production Requests & Approvals ({productionRequests.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("RECIPES")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "RECIPES"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Utensils size={14} />
          <span>Recipe BOM Library ({recipes.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("SCALER")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "SCALER"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Calculator size={14} />
          <span>Recipe Scaler</span>
        </button>
        <button
          onClick={() => setActiveTab("ANALYTICS")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "ANALYTICS"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <BarChart3 size={14} />
          <span>Unit Cost & Yield Analytics</span>
        </button>
      </div>

      {/* TAB 1: PRODUCTION REQUESTS & APPROVALS */}
      {activeTab === "REQUESTS" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* List Table (Col 7) */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">Active Production Batches</h3>
              <span className="text-xs text-slate-400 font-medium">Click a row to inspect & manage</span>
            </div>
            <div className="divide-y divide-slate-100 overflow-x-auto">
              {productionRequests.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <ChefHat className="mx-auto mb-2 text-slate-300" size={32} />
                  <p className="text-sm font-medium">No production requests recorded yet.</p>
                </div>
              ) : (
                productionRequests.map(pr => {
                  const isSelected = selectedPR?.id === pr.id;
                  return (
                    <div
                      key={pr.id}
                      onClick={() => setSelectedPR(pr)}
                      className={`p-4 transition-all cursor-pointer flex items-center justify-between gap-4 ${
                        isSelected ? "bg-amber-50/70 border-l-4 border-l-amber-600" : "hover:bg-slate-50/70"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-extrabold text-slate-900">{pr.id}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            pr.status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                            pr.status === "Pending Approval" ? "bg-amber-100 text-amber-800" :
                            pr.status === "Material Issued" ? "bg-purple-100 text-purple-800" :
                            pr.status === "Completed" ? "bg-blue-100 text-blue-800" :
                            pr.status === "Rejected" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"
                          }`}>
                            {pr.status}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 mt-1 truncate">{pr.recipeName}</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Target: <strong className="text-slate-700">{pr.targetPortions} portions</strong> • Req: {pr.requiredDate}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-extrabold text-slate-900 block">
                          ${pr.estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-slate-400">{pr.requesterName}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Inspector Panel (Col 5) */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-100 shadow-xs p-5 flex flex-col justify-between">
            {selectedPR ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="font-mono text-xs font-bold text-amber-700">{selectedPR.id}</span>
                    <h3 className="text-base font-extrabold text-slate-900">{selectedPR.recipeName}</h3>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                    selectedPR.status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                    selectedPR.status === "Pending Approval" ? "bg-amber-100 text-amber-800" :
                    selectedPR.status === "Material Issued" ? "bg-purple-100 text-purple-800" :
                    selectedPR.status === "Completed" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"
                  }`}>
                    {selectedPR.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-slate-400 block">Target Portions</span>
                    <strong className="text-slate-800 text-sm">{selectedPR.targetPortions} portions</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Estimated Cost</span>
                    <strong className="text-slate-800 text-sm">${selectedPR.estimatedCost.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Required Date</span>
                    <strong className="text-slate-800">{selectedPR.requiredDate}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Requester</span>
                    <strong className="text-slate-800">{selectedPR.requesterName}</strong>
                  </div>
                </div>

                {/* Recipe Bill of Materials (BOM) Ingredients */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Recipe Bill of Materials (BOM)</h4>
                  <div className="bg-slate-50 rounded-xl border border-slate-100 divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {selectedPR.ingredients.map((ing, idx) => {
                      const itm = items.find(i => i.id === ing.itemId);
                      return (
                        <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-800">{itm?.name || ing.itemId}</span>
                          <div className="text-right">
                            <span className="font-bold text-slate-900">{ing.requiredQty} {itm?.unit || "Units"}</span>
                            <span className="text-slate-400 text-[10px] block">${(ing.requiredQty * ing.standardRate).toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actual Production Details if Completed */}
                {selectedPR.actualProduction && (
                  <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200 text-xs space-y-1">
                    <span className="font-bold text-blue-900 block">✓ Actual Production Yield Recorded</span>
                    <p className="text-blue-800">Produced: <strong>{selectedPR.actualProduction.actualPortions} portions</strong> | Waste: <strong>{selectedPR.actualProduction.wastePortions} portions</strong></p>
                    <p className="text-[11px] text-blue-600 italic">"{selectedPR.actualProduction.remarks}"</p>
                  </div>
                )}

                {/* Action Triggers */}
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  {selectedPR.status === "Pending Approval" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApproveReject(selectedPR, "Approved")}
                        className="flex-1 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 size={14} />
                        <span>Approve Batch</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApproveReject(selectedPR, "Rejected")}
                        className="flex-1 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <XCircle size={14} />
                        <span>Reject</span>
                      </button>
                    </div>
                  )}

                  {selectedPR.status === "Approved" && (
                    <button
                      type="button"
                      onClick={() => setShowActualModal(selectedPR)}
                      className="w-full py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <ChefHat size={15} />
                      <span>Record Actual Production Entry</span>
                    </button>
                  )}

                  {selectedPR.status === "Completed" && !selectedPR.materialIssueId && (
                    <button
                      type="button"
                      onClick={() => handleRaiseMaterialIssueForPR(selectedPR)}
                      className="w-full py-2.5 bg-purple-700 text-white font-bold text-xs rounded-xl hover:bg-purple-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm animate-pulse"
                    >
                      <Send size={15} />
                      <span>Raise Material Issue Slip (Store Stock Draw)</span>
                    </button>
                  )}

                  {selectedPR.materialIssueId && (
                    <div className="p-3 bg-purple-50 text-purple-900 rounded-xl border border-purple-200 text-xs text-center font-medium">
                      ✓ Material Issue <strong className="font-mono">{selectedPR.materialIssueId}</strong> posted to stock ledger!
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400">
                <Layers className="mx-auto mb-2 text-slate-300" size={32} />
                <p className="text-sm font-medium">Select a production request to view details & perform workflow steps.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: RECIPE BOM LIBRARY */}
      {activeTab === "RECIPES" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {recipes.map(recipe => (
            <div key={recipe.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 rounded text-[10px] font-bold border border-amber-200">
                    {recipe.category}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-400">{recipe.id}</span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900">{recipe.name}</h3>
                <p className="text-xs text-slate-500 mt-1">Standard Batch: <strong className="text-slate-700">{recipe.standardPortions} {recipe.unit}</strong></p>

                <div className="mt-4 space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Ingredients BOM</span>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {recipe.ingredients.map((ing, idx) => {
                      const itm = items.find(i => i.id === ing.itemId);
                      return (
                        <div key={idx} className="text-xs flex items-center justify-between text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg">
                          <span>{itm?.name || ing.itemId}</span>
                          <strong className="text-slate-900">{ing.standardQty} {itm?.unit || "Units"}</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">Ready for batch orders</span>
                <button
                  type="button"
                  onClick={() => {
                    setFormRecipeId(recipe.id);
                    setIsCreating(true);
                  }}
                  className="px-3 py-1.5 bg-amber-50 text-amber-800 font-bold text-xs rounded-lg hover:bg-amber-100 transition-all cursor-pointer"
                >
                  Create Request
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: RECIPE SCALER */}
      {activeTab === "SCALER" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Selector & Scaler Controls */}
          <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-5">
            <div>
              <span className="text-xs font-extrabold text-amber-700 uppercase tracking-wider block mb-1">Interactive Culinary Tool</span>
              <h3 className="text-lg font-extrabold text-slate-900">Recipe Scaler & Batch Calculator</h3>
              <p className="text-xs text-slate-500 mt-1">Select any finished recipe and target output quantity to instantly compute raw material requirements and estimated batch costs.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Select Finished Recipe / Dish</label>
                <select
                  value={scalerRecipeId}
                  onChange={(e) => {
                    const rId = e.target.value;
                    setScalerRecipeId(rId);
                    const rec = recipes.find(r => r.id === rId);
                    if (rec) setScalerPortions(rec.standardPortions);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                >
                  {recipes.map(rec => (
                    <option key={rec.id} value={rec.id}>
                      {rec.name} (Standard Batch: {rec.standardPortions} {rec.unit})
                    </option>
                  ))}
                </select>
              </div>

              {activeScalerRecipe && (
                <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200 text-xs space-y-1">
                  <span className="font-bold text-amber-900 block">Recipe Standard Baseline</span>
                  <p className="text-amber-800">Category: <strong>{activeScalerRecipe.category}</strong></p>
                  <p className="text-amber-800">Standard Batch Size: <strong>{activeScalerRecipe.standardPortions} {activeScalerRecipe.unit}</strong></p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">Target Output Quantity ({activeScalerRecipe?.unit || "Portions"})</label>
                  <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                    Multiplier: {scalerMultiplier.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={scalerPortions}
                  onChange={(e) => setScalerPortions(parseInt(e.target.value) || 1)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-extrabold text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Quick Multiplier Buttons */}
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Quick Multiplier Presets</span>
                <div className="grid grid-cols-4 gap-2">
                  {[0.5, 1, 2, 5].map(mult => {
                    const target = Math.round((activeScalerRecipe?.standardPortions || 50) * mult);
                    return (
                      <button
                        key={mult}
                        type="button"
                        onClick={() => setScalerPortions(target)}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          scalerPortions === target
                            ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {mult}x ({target})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleRaisePRFromScaler}
                  className="w-full py-3 bg-amber-700 text-white font-extrabold text-xs rounded-xl hover:bg-amber-800 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Plus size={16} />
                  <span>Raise Production Request ({scalerPortions} Portions)</span>
                </button>
                <p className="text-[11px] text-slate-400 text-center mt-2">Instantly queues a pending production request with scaled BOM requirements.</p>
              </div>
            </div>
          </div>

          {/* Right Column: Scaled Bill of Materials Table */}
          <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Scaled Bill of Materials (BOM)</h3>
                <p className="text-xs text-slate-500 mt-0.5">Raw material requirements calculated for {scalerPortions} {activeScalerRecipe?.unit || "Portions"}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-400 block">Total Est. Cost</span>
                <span className="text-lg font-extrabold text-slate-900">${scalerTotalCost.toFixed(2)}</span>
                <span className="text-[10px] text-purple-700 font-bold block">(${scalerCostPerUnit.toFixed(2)} / unit)</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-3">Raw Material Item</th>
                    <th className="py-3 px-3 text-center">Standard Qty ({activeScalerRecipe?.standardPortions || 50})</th>
                    <th className="py-3 px-3 text-center">Scaled Qty ({scalerPortions})</th>
                    <th className="py-3 px-3 text-right">Standard Rate</th>
                    <th className="py-3 px-3 text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {activeScalerRecipe?.ingredients.map((ing, idx) => {
                    const itm = items.find(i => i.id === ing.itemId);
                    const standardRate = itm ? (itm.lastPurchaseRate || itm.standardRate || 2.50) : 2.50;
                    const scaledQty = Math.round((ing.standardQty * scalerMultiplier) * 100) / 100;
                    const itemTotal = scaledQty * standardRate;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="py-3 px-3">
                          <span className="font-bold text-slate-800 block">{itm?.name || ing.itemId}</span>
                          <span className="text-[10px] text-slate-400 font-mono">ID: {ing.itemId}</span>
                        </td>
                        <td className="py-3 px-3 text-center font-medium text-slate-600">
                          {ing.standardQty} {itm?.unit || "Units"}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-900 font-extrabold rounded-lg border border-amber-200">
                            {scaledQty} {itm?.unit || "Units"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-slate-600 font-medium">
                          ${standardRate.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-slate-900">
                          ${itemTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: UNIT COST & YIELD ANALYTICS DASHBOARD */}
      {activeTab === "ANALYTICS" && (() => {
        const analyticsData = productionRequests.map(pr => {
          const totalMatCost = pr.ingredients.reduce((acc, ing) => acc + (ing.requiredQty * ing.standardRate), 0);
          const yieldPct = pr.actualProduction ? (pr.actualProduction.yieldPercentage ?? 100) : 100;
          const rawOutputPortions = pr.actualProduction ? pr.actualProduction.actualPortions : pr.targetPortions;
          const effectivePortions = Math.round((rawOutputPortions * (yieldPct / 100)) * 100) / 100;
          const unitCost = effectivePortions > 0 ? totalMatCost / effectivePortions : 0;
          return {
            ...pr,
            totalMatCost,
            outputPortions: rawOutputPortions,
            effectivePortions,
            yieldPct,
            unitCost
          };
        });

        const totalInvestment = analyticsData.reduce((acc, curr) => acc + curr.totalMatCost, 0);
        const totalPortions = analyticsData.reduce((acc, curr) => acc + curr.effectivePortions, 0);
        const avgUnitCost = totalPortions > 0 ? totalInvestment / totalPortions : 0;

        return (
          <div className="space-y-6">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Batches</span>
                  <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{analyticsData.length}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Active production orders</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                  <ChefHat size={22} />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Output Yield</span>
                  <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{totalPortions.toLocaleString()} <span className="text-xs font-normal text-slate-500">Portions</span></h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Finished items produced</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <PackageCheck size={22} />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Material Cost</span>
                  <h3 className="text-2xl font-extrabold text-slate-900 mt-1">${totalInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Linked PR / Issue draw</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <DollarSign size={22} />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg. Cost Per Unit</span>
                  <h3 className="text-2xl font-extrabold text-purple-700 mt-1">${avgUnitCost.toFixed(2)} <span className="text-xs font-normal text-slate-500">/ portion</span></h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Weighted average cost</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                  <TrendingUp size={22} />
                </div>
              </div>
            </div>

            {/* Cost per Produced Unit Trend Chart over Last 30 Days */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Cost per Produced Unit Trend (Last 30 Days)</h3>
                  <p className="text-xs text-slate-500">Tracking unit cost fluctuations across top-performing finished recipe batches</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-purple-50 text-purple-700 font-bold text-xs rounded-lg border border-purple-200">
                    Recharts Analytics
                  </span>
                </div>
              </div>

              <div className="h-72 w-full pt-4">
                {(() => {
                  const chartData = analyticsData
                    .slice()
                    .sort((a, b) => new Date(a.requiredDate).getTime() - new Date(b.requiredDate).getTime())
                    .map(item => ({
                      date: item.requiredDate,
                      recipeShort: item.recipeName.split('(')[0].trim(),
                      fullRecipe: item.recipeName,
                      unitCost: parseFloat(item.unitCost.toFixed(2)),
                      batchId: item.id
                    }));

                  return (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#64748b" 
                          fontSize={11} 
                          tickLine={false}
                          angle={-15}
                          textAnchor="end"
                        />
                        <YAxis 
                          stroke="#64748b" 
                          fontSize={11} 
                          tickLine={false}
                          unit="$" 
                        />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg text-xs space-y-1">
                                  <p className="font-bold text-amber-400">{data.fullRecipe}</p>
                                  <p className="text-slate-300">Batch ID: <span className="font-mono text-white">{data.batchId}</span></p>
                                  <p className="text-slate-300">Date: <span className="text-white">{label}</span></p>
                                  <p className="font-bold text-emerald-400">Unit Cost: ${payload[0].value} / portion</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="unitCost" 
                          name="Cost Per Unit ($)" 
                          stroke="#8b5cf6" 
                          strokeWidth={3}
                          dot={{ r: 5, fill: "#8b5cf6", strokeWidth: 2, stroke: "#ffffff" }}
                          activeDot={{ r: 8, fill: "#7c3aed" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
            </div>

            {/* Detailed Unit Cost Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Production Batch Unit Cost Breakdown</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Summarizing raw material issues (PR/Issue linked) against finished item output quantities</p>
                </div>
                <span className="px-3 py-1 bg-slate-100 text-slate-700 font-bold text-xs rounded-lg">
                  {analyticsData.length} Batches Analyzed
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4">Batch ID / Date</th>
                      <th className="py-3.5 px-4">Finished Recipe / Item</th>
                      <th className="py-3.5 px-4 text-center">Status & Issue Ref</th>
                      <th className="py-3.5 px-4 text-center">Output Portions</th>
                      <th className="py-3.5 px-4 text-right">Total Material Cost</th>
                      <th className="py-3.5 px-4 text-right">Cost Per Unit ($/Portion)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {analyticsData.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50/60 transition-all">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          {row.id}
                          <span className="block text-[10px] text-slate-400 font-normal">Req: {row.requiredDate}</span>
                          {row.expiryDate && (
                            <span className="block text-[10px] text-amber-700 font-bold">Exp: {row.expiryDate}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-800 block">{row.recipeName}</span>
                          <span className="text-[10px] text-slate-500">Dept: {row.departmentId} • Yield: {row.yieldPct}%</span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            row.status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                            row.status === "Material Issued" ? "bg-purple-100 text-purple-800" :
                            row.status === "Completed" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                          }`}>
                            {row.status}
                          </span>
                          {row.materialIssueId && (
                            <span className="block font-mono text-[10px] text-purple-700 font-bold mt-0.5">
                              {row.materialIssueId}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <strong className="text-slate-900">{row.effectivePortions} effective</strong>
                          <span className="block text-[10px] text-slate-500">
                            (Raw: {row.outputPortions} | Waste: {row.actualProduction ? row.actualProduction.wastePortions : 0})
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                          ${row.totalMatCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="px-2.5 py-1 bg-purple-50 text-purple-800 font-extrabold rounded-lg border border-purple-200">
                            ${row.unitCost.toFixed(2)} / unit
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: CREATE PRODUCTION REQUEST */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden animate-scale-up">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center font-bold">
                  <ChefHat size={18} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold">New F&B Production Request</h3>
                  <p className="text-xs text-slate-400">Select recipe, target portions, and calculate BOM material requirements</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Recipe / Menu Item</label>
                  <select
                    value={formRecipeId}
                    onChange={(e) => setFormRecipeId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {recipes.map(r => (
                      <option key={r.id} value={r.id}>{r.name} (Std: {r.standardPortions} {r.unit})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Target Portions / Yield</label>
                  <input
                    type="number"
                    min={1}
                    value={formTargetPortions}
                    onChange={(e) => setFormTargetPortions(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Issuing Kitchen Store</label>
                  <select
                    value={formStoreId}
                    onChange={(e) => setFormStoreId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Requesting Department</label>
                  <select
                    value={formDeptId}
                    onChange={(e) => setFormDeptId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.costCenter})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Required Date</label>
                  <input
                    type="date"
                    value={formRequiredDate}
                    onChange={(e) => setFormRequiredDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Purpose / Remarks</label>
                  <input
                    type="text"
                    value={formRemarks}
                    onChange={(e) => setFormRemarks(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Computed Ingredients Preview */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Computed Ingredient Requirements (BOM)</h4>
                  <span className="text-xs font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Est. Total Cost: ${estimatedTotalCost.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-200 max-h-48 overflow-y-auto">
                  {computedIngredients.map((ing, idx) => {
                    const itm = items.find(i => i.id === ing.itemId);
                    return (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800">{itm?.name || ing.itemId}</span>
                        <div className="text-right">
                          <strong className="text-slate-900">{ing.requiredQty} {itm?.unit || "Units"}</strong>
                          <span className="text-slate-400 text-[10px] block">${(ing.requiredQty * ing.standardRate).toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveRequest("Draft")}
                className="px-4 py-2 bg-slate-200 text-slate-800 font-bold text-xs rounded-xl hover:bg-slate-300 cursor-pointer"
              >
                Save as Draft
              </button>
              <button
                type="button"
                onClick={() => handleSaveRequest("Pending Approval")}
                className="px-4 py-2 bg-amber-700 text-white font-bold text-xs rounded-xl hover:bg-amber-800 cursor-pointer shadow-sm"
              >
                Submit for Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ACTUAL PRODUCTION ENTRY */}
      {showActualModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden animate-scale-up">
            <div className="p-5 bg-blue-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold">Record Actual Production Entry</h3>
                <p className="text-xs text-blue-300">Batch: <strong className="font-mono">{showActualModal.id}</strong> ({showActualModal.recipeName})</p>
              </div>
              <button onClick={() => setShowActualModal(null)} className="text-blue-200 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveActualProduction} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Actual Portions Produced</label>
                <input
                  type="number"
                  min={0}
                  value={actualPortions}
                  onChange={(e) => setActualPortions(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Waste / Trimming Portions</label>
                <input
                  type="number"
                  min={0}
                  value={wastePortions}
                  onChange={(e) => setWastePortions(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Yield Percentage (%)</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={actualYieldPercentage}
                  onChange={(e) => setActualYieldPercentage(parseFloat(e.target.value) || 100)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">Used to compute effective output and automatically adjust unit cost.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Batch Expiry Date</label>
                <input
                  type="date"
                  value={actualExpiryDate}
                  onChange={(e) => setActualExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Kitchen / Chef Remarks</label>
                <textarea
                  value={actualRemarks}
                  onChange={(e) => setActualRemarks(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  rows={2}
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                <span>Target was {showActualModal.targetPortions} portions. Submitting actual entry marks this batch as <strong className="text-slate-900">Completed</strong> and unlocks Material Issue generation.</span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowActualModal(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-blue-700"
                >
                  Confirm & Complete Production
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
