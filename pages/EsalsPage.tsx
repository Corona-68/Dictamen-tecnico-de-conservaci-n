import React, { useState, useEffect, useMemo } from 'react';
import { GeneralData, CompositionData, CalculationMethod, AxleInputRow, PavementLayer } from '../types';
import { DEFAULT_COMPOSITION, DEFAULT_GENERAL_DATA, TABLE_STATIC_ROWS, VEHICLE_NAMES, LAYER_CATALOG, CUSTOM_LAYER_NAME } from '../constants';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { calculateUnamTotalAccumulated } from '../utils/calculations';

const DEFAULT_ALT1_LAYERS: PavementLayer[] = [
    { id: 'alt1_l1', name: "Carpeta asfáltica nueva", mr: 448953, a: 0.44, m: 1.0 },
    { id: 'alt1_l2', name: "Base asfáltica nueva", mr: 395583, a: 0.303, m: 1.0 },
    { id: 'alt1_l3', name: "Base asfáltica", mr: 151406, a: 0.24, m: 1.0 },
];

const DEFAULT_ALT2_LAYERS: PavementLayer[] = [
    { id: 'alt2_l1', name: "Carpeta asfáltica nueva", mr: 448953, a: 0.44, m: 1.0 },
    { id: 'alt2_l2', name: "Carpeta asfáltica normal", mr: 275280, a: 0.35, m: 1.0 },
    { id: 'alt2_l3', name: "Base asfáltica", mr: 151406, a: 0.24, m: 1.0 },
];

const RIEGO_DE_SELLO_LAYER: PavementLayer = {
    id: 'riego_sello',
    name: 'Riego de sello',
    a: 0,
    mr: 0,
    m: 1.0
};

// --- UTILITY FUNCTIONS FOR AASHTO CORRELATIONS ---
const getLayerValues = (layerName: string, rigidity: 'low' | 'medium' | 'high') => {
    const layerData = LAYER_CATALOG.find(l => l.name === layerName);
    if (!layerData) return { mr: 0, a: 0, m: 1.0 };
    return layerData.values[rigidity];
};

function getLayerFormulaType(name: string): number {
    const n = name.toLowerCase();
    if (n.includes("carpeta") || n.includes("asfáltica") || n.includes("asfaltica")) return 1; // Asphalt
    if (n.includes("base") && !n.includes("subbase")) return 2; // Base
    if (n.includes("subbase")) return 3; // Subbase
    return 0;
}

function calculateAFromMR(name: string, mr: number): number {
    const type = getLayerFormulaType(name);
    if (mr <= 0) return 0;
    if (type === 1) {
        return Math.max(0.05, Math.min(0.5, 0.40 * Math.log10(mr / 450000) + 0.44));
    }
    if (type === 2) {
        return Math.max(0.05, Math.min(0.2, 0.249 * Math.log10(mr) - 0.977));
    }
    if (type === 3) {
        return Math.max(0.05, Math.min(0.15, 0.227 * Math.log10(mr) - 0.839));
    }
    return 0.14; // Default
}

function calculateMRFromA(name: string, a: number): number {
    const type = getLayerFormulaType(name);
    if (a <= 0) return 30000;
    if (type === 1) {
        return Math.pow(10, (a - 0.44) / 0.40) * 450000;
    }
    if (type === 2) {
        return Math.pow(10, (a + 0.977) / 0.249);
    }
    if (type === 3) {
        return Math.pow(10, (a + 0.839) / 0.227);
    }
    return 30000;
}

// Approximation of Inverse Standard Normal Distribution (Probit)
function inverseNormalCDF(p: number): number {
    if (p <= 0 || p >= 1) return 0;
    const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
    const c0 = 2.515517;
    const c1 = 0.802853;
    const c2 = 0.010328;
    const d1 = 1.432788;
    const d2 = 0.189269;
    const d3 = 0.001308;
    
    const x = t - ((c2 * t + c1) * t + c0) / (((d3 * t + d2) * t + d1) * t + 1);
    return p < 0.5 ? -x : x;
}

// --- STRUCTURE TABLE COMPONENT ---
const StructureTable = ({ 
    title, 
    data, 
    genData, 
    handleRealThicknessChange, 
    formatNum,
    isEditable = false,
    onLayerChange,
    onAddLayer,
    onRemoveLayer,
    onOpenCalc
}: { 
    title: string; 
    data: any; 
    genData: GeneralData; 
    handleRealThicknessChange: (id: string, val: string) => void;
    formatNum: (n: number, d?: number) => string;
    isEditable?: boolean;
    onLayerChange?: (id: string, field: keyof PavementLayer, val: any) => void;
    onAddLayer?: () => void;
    onRemoveLayer?: (id: string) => void;
    onOpenCalc?: (layer: PavementLayer) => void;
}) => {
    const { layers, snTotalProvided, esalsForSnTotal, remainingLifeYears } = data;

    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
                {isEditable && (
                    <button 
                        onClick={onAddLayer}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                    >
                        <i className="fas fa-plus"></i>
                        <span>Adicionar Capa</span>
                    </button>
                )}
            </div>
            <div className="p-4">
                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-600">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-100">
                            <tr>
                                <th className="px-4 py-3">Capa</th>
                                <th className="px-4 py-3 text-center">a</th>
                                <th className="px-4 py-3 text-center">m</th>
                                <th className="px-4 py-3 text-right">E(psi)</th>
                                <th className="px-4 py-3 text-right text-orange-600">SN Req</th>
                                <th className="px-4 py-3 text-right">Esp. Calc (cm)</th>
                                <th className="px-4 py-3 text-right font-bold text-slate-900 w-32">Esp. Real (cm)</th>
                                <th className="px-4 py-3 text-right text-emerald-600">SN Aportado</th>
                                {isEditable && <th className="px-4 py-3 text-right">Acciones</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {layers.map((layer: any) => (
                                <tr key={layer.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        {isEditable ? (
                                                <select 
                                                    value={layer.customCode ? CUSTOM_LAYER_NAME : layer.name} 
                                                    onChange={(e) => onLayerChange?.(layer.id, 'name', e.target.value)}
                                                    className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none font-medium text-slate-900"
                                                >
                                                    {LAYER_CATALOG.map(cat => (
                                                        <option key={cat.name} value={cat.name}>
                                                            {cat.name === CUSTOM_LAYER_NAME && layer.customCode ? `${layer.name} (${layer.customCode})` : cat.name}
                                                        </option>
                                                    ))}
                                                </select>
                                        ) : (
                                            <span className="font-medium text-slate-900">{layer.name}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {isEditable ? (
                                            <input 
                                                type="number" 
                                                step="0.001"
                                                value={layer.a} 
                                                onChange={(e) => onLayerChange?.(layer.id, 'a', e.target.value)}
                                                className="w-16 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none text-center"
                                            />
                                        ) : layer.a}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {isEditable ? (
                                            <input 
                                                type="number" 
                                                step="0.01"
                                                value={layer.m} 
                                                onChange={(e) => onLayerChange?.(layer.id, 'm', e.target.value)}
                                                className="w-16 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none text-center"
                                            />
                                        ) : layer.m}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {isEditable ? (
                                            <input 
                                                type="text" 
                                                value={(layer.mr || 0).toLocaleString('en-US')} 
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/,/g, '');
                                                    if (!isNaN(Number(val))) {
                                                        onLayerChange?.(layer.id, 'mr', val);
                                                    }
                                                }}
                                                className="w-24 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none text-right font-mono"
                                            />
                                        ) : formatNum(layer.mr, 0)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-orange-600">{formatNum(layer.snReq)}</td>
                                    <td className="px-4 py-3 text-right font-mono">{formatNum(layer.h_cm_calc)}</td>
                                    <td className="px-4 py-3">
                                        <input
                                            type="number"
                                            value={layer.h_cm_real}
                                            onChange={(e) => handleRealThicknessChange(layer.id, e.target.value)}
                                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-right text-slate-900 font-bold focus:border-blue-500 outline-none"
                                            onClick={(e) => (e.target as HTMLInputElement).select()}
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatNum(layer.snProvided)}</td>
                                    {isEditable && (
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-1">
                                                <button 
                                                    onClick={() => onOpenCalc?.(layer)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                    title="Calcular propiedades"
                                                >
                                                    <i className="fas fa-calculator text-xs"></i>
                                                </button>
                                                <button 
                                                    onClick={() => onRemoveLayer?.(layer.id)}
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                                    title="Eliminar capa"
                                                >
                                                    <i className="fas fa-trash-alt text-xs"></i>
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                                <td colSpan={4} className="px-4 py-3 text-right text-slate-700">Terracerías / Subrasante</td>
                                <td className="px-4 py-3 text-right text-xs text-slate-500 font-normal">
                                    Módulo Resiliente: <span className="text-blue-600 font-mono text-sm font-bold">{formatNum(genData.subgradeMr, 0)} psi</span>
                                </td>
                                <td colSpan={2}></td>
                                <td className="px-4 py-3 text-right text-emerald-600">
                                    SN Total: {formatNum(snTotalProvided)}
                                </td>
                                {isEditable && <td></td>}
                            </tr>
                            <tr className="bg-white border-t border-slate-200">
                                <td colSpan={5} className="px-4 py-4 text-right text-slate-500 font-medium">
                                    ESAL's Soportados por la Estructura (W18):
                                </td>
                                <td colSpan={3} className="px-4 py-4 text-right text-blue-600 font-mono text-xl">
                                    {formatNum(esalsForSnTotal, 0)}
                                </td>
                                {isEditable && <td></td>}
                            </tr>
                            <tr className="bg-white border-t border-slate-200">
                                <td colSpan={5} className="px-4 py-4 text-right text-slate-500 font-medium">
                                    Vida Remanente Estimada:
                                </td>
                                <td colSpan={3} className="px-4 py-4 text-right text-emerald-600 font-mono text-xl">
                                    {formatNum(remainingLifeYears, 1)} años
                                </td>
                                {isEditable && <td></td>}
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Mobile View */}
                <div className="md:hidden space-y-3">
                    {layers.map((layer: any) => (
                        <div key={layer.id} className="bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    {isEditable ? (
                                        <input 
                                            type="text" 
                                            value={layer.name} 
                                            onChange={(e) => onLayerChange?.(layer.id, 'name', e.target.value)}
                                            className="text-sm font-bold text-slate-900 border-b border-slate-100 focus:border-blue-500 outline-none flex-1"
                                        />
                                    ) : (
                                        <div className="text-sm font-bold text-slate-900">{layer.name}</div>
                                    )}
                                    {isEditable && (
                                        <div className="flex gap-2 ml-2">
                                            <button onClick={() => onOpenCalc?.(layer)} className="text-blue-600 p-1"><i className="fas fa-calculator"></i></button>
                                            <button onClick={() => onRemoveLayer?.(layer.id)} className="text-red-600 p-1"><i className="fas fa-trash-alt"></i></button>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                                    <div className="flex justify-between">
                                        <span>E(psi):</span>
                                        {isEditable ? (
                                            <input 
                                                type="text" 
                                                value={(layer.mr || 0).toLocaleString('en-US')} 
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/,/g, '');
                                                    if (!isNaN(Number(val))) {
                                                        onLayerChange?.(layer.id, 'mr', val);
                                                    }
                                                }}
                                                className="w-20 text-right border-b border-slate-100"
                                            />
                                        ) : <span className="text-slate-700">{formatNum(layer.mr, 0)}</span>}
                                    </div>
                                    <div className="flex justify-between">
                                        <span>a:</span>
                                        {isEditable ? (
                                            <input 
                                                type="number" 
                                                step="0.001"
                                                value={layer.a} 
                                                onChange={(e) => onLayerChange?.(layer.id, 'a', e.target.value)}
                                                className="w-12 text-right border-b border-slate-100"
                                            />
                                        ) : <span className="text-slate-700">{layer.a}</span>}
                                    </div>
                                    <div className="flex justify-between">
                                        <span>m:</span>
                                        {isEditable ? (
                                            <input 
                                                type="number" 
                                                step="0.01"
                                                value={layer.m} 
                                                onChange={(e) => onLayerChange?.(layer.id, 'm', e.target.value)}
                                                className="w-12 text-right border-b border-slate-100"
                                            />
                                        ) : <span className="text-slate-700">{layer.m}</span>}
                                    </div>
                                    <div className="flex justify-between text-orange-600 font-semibold">
                                        <span>SN Req:</span>
                                        <span>{formatNum(layer.snReq)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 pt-2 border-t border-slate-50">
                                    <div className="flex-1">
                                        <div className="text-[9px] text-slate-400 uppercase">Esp. Calc</div>
                                        <div className="text-xs font-mono">{formatNum(layer.h_cm_calc)} cm</div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-[9px] text-slate-400 uppercase">Esp. Real</div>
                                        <input
                                            type="number"
                                            value={layer.h_cm_real}
                                            onChange={(e) => handleRealThicknessChange(layer.id, e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded px-1 py-1 text-center text-slate-900 font-bold text-xs"
                                        />
                                    </div>
                                    <div className="flex-1 text-right">
                                        <div className="text-[9px] text-slate-400 uppercase">SN Aport.</div>
                                        <div className="text-xs font-mono text-emerald-600 font-bold">{formatNum(layer.snProvided)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-2">
                        <div className="flex justify-between">
                            <span className="text-slate-500">Subrasante Mr:</span>
                            <span className="font-bold text-blue-600">{formatNum(genData.subgradeMr, 0)} psi</span>
                        </div>
                        <div className="flex justify-between border-t border-slate-200 pt-2">
                            <span className="font-bold text-emerald-600">SN Total:</span>
                            <span className="font-bold text-emerald-600">{formatNum(snTotalProvided)}</span>
                        </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 shadow-sm">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] text-slate-500 uppercase font-bold">W18 Soportados:</span>
                            <span className="text-sm font-mono text-blue-600 font-bold">{formatNum(esalsForSnTotal, 0)}</span>
                        </div>
                        <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                            <span className="text-[10px] text-slate-500 uppercase font-bold">Vida Remanente:</span>
                            <span className="text-sm font-mono text-emerald-600 font-bold">{formatNum(remainingLifeYears, 1)} años</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const EsalsPage: React.FC = () => {
  // Inputs for AASHTO Design
  const [snSeed, setSnSeed] = useState<number>(2.0); 
  const [manualThicknesses, setManualThicknesses] = useState<Record<string, number>>({});
  const [alt1Layers, setAlt1Layers] = useState<PavementLayer[]>(DEFAULT_ALT1_LAYERS);
  const [alt2Layers, setAlt2Layers] = useState<PavementLayer[]>(DEFAULT_ALT2_LAYERS);
  const [isSaved, setIsSaved] = useState(false);

  // -- Custom Layer Modal State --
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingAltSource, setEditingAltSource] = useState<1 | 2 | null>(null);
  const [customLayerForm, setCustomLayerForm] = useState({
      code: '',
      name: '',
      mr: 0,
      a: 0,
      m: 1.0
  });

  // --- Layer Property Calculator State ---
  const [isCalcModalOpen, setIsCalcModalOpen] = useState(false);
  const [calcLayerData, setCalcLayerData] = useState<PavementLayer | null>(null);
  const [calcAltSource, setCalcAltSource] = useState<1 | 2 | null>(null);

  const handleOpenAltCalc = (layer: PavementLayer, alt: 1 | 2) => {
      setCalcLayerData({ ...layer });
      setCalcAltSource(alt);
      setIsCalcModalOpen(true);
  };

  const handleApplyAltCalc = () => {
      if (!calcLayerData || !calcAltSource) return;
      if (calcAltSource === 1) {
          setAlt1Layers(prev => prev.map(l => l.id === calcLayerData.id ? calcLayerData : l));
      } else {
          setAlt2Layers(prev => prev.map(l => l.id === calcLayerData.id ? calcLayerData : l));
      }
      setIsCalcModalOpen(false);
  };

  const handleAddAltLayer = (alt: 1 | 2) => {
      const newLayer: PavementLayer = {
          id: `alt${alt}_l${Date.now()}`,
          name: "Nueva Capa",
          mr: 30000,
          a: 0.14,
          m: 1.0
      };
      if (alt === 1) setAlt1Layers(prev => [newLayer, ...prev]);
      else setAlt2Layers(prev => [newLayer, ...prev]);
  };

  const handleRemoveAltLayer = (id: string, alt: 1 | 2) => {
      if (alt === 1) setAlt1Layers(prev => prev.filter(l => l.id !== id));
      else setAlt2Layers(prev => prev.filter(l => l.id !== id));
  };

  // Data from previous steps
  const [method, setMethod] = useState<CalculationMethod>('vehicles');
  const [genData, setGenData] = useState<GeneralData>(DEFAULT_GENERAL_DATA);
  const [compData, setCompData] = useState<CompositionData>(DEFAULT_COMPOSITION);
  const [directRows, setDirectRows] = useState<AxleInputRow[]>([]);

  useEffect(() => {
    // Load general inputs
    const savedGen = localStorage.getItem('datosGeneralesData');
    let currentGen = DEFAULT_GENERAL_DATA;
    if (savedGen) {
        currentGen = { ...DEFAULT_GENERAL_DATA, ...JSON.parse(savedGen) };
        setGenData(currentGen);
    }

    // Load Calculation Method
    const savedMethod = localStorage.getItem('calculationMethod') as CalculationMethod | null;
    if (savedMethod) setMethod(savedMethod);

    // Load Traffic Data sources
    const savedComp = localStorage.getItem('compVehData');
    if (savedComp) setCompData(JSON.parse(savedComp));

    const savedDirect = localStorage.getItem('directAxleData');
    if (savedDirect) setDirectRows(JSON.parse(savedDirect));

    // Load saved calculations specific to this page
    const savedEsals = localStorage.getItem('esalsData');
    if (savedEsals) {
        try {
            const parsed = JSON.parse(savedEsals);
            // Prioritize global SN seed if it was updated in the new ESAL's page
            setSnSeed(currentGen.snSeed !== undefined ? currentGen.snSeed : (parsed.snSeed !== undefined ? parsed.snSeed : 4.0));
            if (parsed.manualThicknesses) setManualThicknesses(parsed.manualThicknesses);
            if (parsed.alt1Layers) setAlt1Layers(parsed.alt1Layers);
            if (parsed.alt2Layers) setAlt2Layers(parsed.alt2Layers);
        } catch (e) { console.error(e); }
    } else {
        setSnSeed(currentGen.snSeed || 4.0);
    }
  }, []);

  const handleSaveCalculations = () => {
      const dataToSave = { snSeed, manualThicknesses, alt1Layers, alt2Layers };
      localStorage.setItem('esalsData', JSON.stringify(dataToSave));
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
  };

  // --- 1. PREPARE TRAFFIC DATA STREAM ---
  const trafficStream = useMemo(() => {
      if (method === 'direct') {
          return directRows.map((r, i) => ({
              id: r.id,
              no: i + 1,
              tipo: r.l2 === 1 ? 'Sencillo' : r.l2 === 2 ? 'Tándem' : 'Trídem',
              l2: r.l2,
              lxKip: r.lxKip,
              count: r.count
          }));
      } else {
          const compObj: Record<string, number> = {};
          VEHICLE_NAMES.forEach((name, idx) => { compObj[name] = compData[idx] || 0; });
          const getVal = (key: string) => compObj[key] || 0;

          const Pvc = genData.pvc;
          const TDPA = genData.tdpa;
          let fcp = 0.5;
          if (genData.lanes === '2') fcp = 0.45;
          if (genData.lanes === '3+') fcp = 0.4;
          const TDPAcd = fcp * TDPA;
          const fvp = 0.0365 * Pvc * TDPAcd;
          const fvv = 0.0365 * (100 - Pvc) * TDPAcd;

          const formulas = [
              () => 2 * getVal("A2") * (fvp + fvv),
              () => (100 - getVal("A2") + getVal("B4")) * fvp,
              () => (getVal("B2") + getVal("C2") + getVal("T2S1") + getVal("T2S2") + getVal("T2S3") + getVal("T2S2S2")) * fvp,
              () => (2*getVal("C2R2") + 2*getVal("C3R2") + getVal("C3R3") + getVal("C2R3") + 3*getVal("T2S1R2") + 2*getVal("T2S1R3") + 2*getVal("T2S2R2") + 3*getVal("T3S1R2") + 2*getVal("T3S1R3") + 2*getVal("T3S2R2") + getVal("T3S2R3")) * fvp,
              () => (getVal("T2S1") + getVal("T3S1")) * fvp,
              () => (getVal("C2R2") + getVal("C2R3") + getVal("T2S1R2") + getVal("T2S1R3") + getVal("T2S2R2")) * fvp,
              () => (getVal("B2") + getVal("B36") + getVal("B38") + 2*getVal("B4") + 2*getVal("C2") + getVal("C36") + getVal("C38") + 4*getVal("C2R2") + 3*getVal("C3R2") + 2*getVal("C3R3") + 3*getVal("C2R3") + 3*getVal("T2S1") + 2*getVal("T2S2") + getVal("T3S2") + getVal("T3S3") + 2*getVal("T3S1") + 5*getVal("T2S1R2") + 4*getVal("T2S1R3") + 4*getVal("T2S2R2") + 4*getVal("T3S1R2") + 3*getVal("T3S1R3") + 3*getVal("T3S2R2") + getVal("T3S2R4") + 2*getVal("T3S2R3") + getVal("T3S3S2") + 2*getVal("T2S2S2") + getVal("T3S2S2")) * fvv,
              () => (getVal("B2") + getVal("B36") + getVal("B38") + getVal("B4")) * fvv,
              () => (getVal("B36") + getVal("B4") + getVal("C36") + getVal("T3S1R3")) * fvp,
              () => (getVal("B38") + getVal("C38") + getVal("T3S2") + getVal("T3S3") + getVal("T3S1") + getVal("T3S2S2")) * fvp,
              () => (getVal("C3R3") + getVal("C2R3") + getVal("T2S1R3") + getVal("T2S2R2") + getVal("T3S1R3") + getVal("T3S2R2") + 3*getVal("T3S2R4") + 2*getVal("T3S2R3") + 2*getVal("T2S2S2") + 2*getVal("T3S2S2")) * fvp,
              () => (getVal("T2S2") + getVal("T3S2") + getVal("T3S3S2")) * fvp,
              () => (getVal("C3R2") + getVal("C3R3") + getVal("T3S1R2") + getVal("T3S2R2") + getVal("T3S2R4") + getVal("T3S2R3") + getVal("T3S3S2")) * fvp,
              () => (getVal("C36") + getVal("C38") + getVal("C3R2") + 2*getVal("C3R3") + getVal("C2R3") + getVal("T2S2") + 2*getVal("T3S2") + getVal("T3S3") + getVal("T3S1") + getVal("T2S1R3") + getVal("T2S2R2") + getVal("T3S1R2") + 2*getVal("T3S1R3") + 2*getVal("T3S2R2") + 4*getVal("T3S2R4") + 3*getVal("T3S2R3") + 2*getVal("T3S3S2") + 2*getVal("T2S2S2") + 3*getVal("T3S2S2")) * fvv,
              () => getVal("T3S3S2") * fvp,
              () => (getVal("T3S3") + getVal("T2S3")) * fvp,
              () => getVal("T3S3S2") * fvv
          ];

          return TABLE_STATIC_ROWS.map((staticRow, index) => {
              let l2 = 1;
              if (staticRow[1] === "Tándem") l2 = 2;
              if (staticRow[1] === "Trídem") l2 = 3;

              let weightTon = 0;
              switch(genData.roadType) {
                  case 'ET_A': weightTon = staticRow[4]; break;
                  case 'B':    weightTon = staticRow[5]; break;
                  case 'C':    weightTon = staticRow[6]; break;
                  case 'D':    weightTon = staticRow[7]; break;
                  default:     weightTon = staticRow[4];
              }
              const lxKip = weightTon * 2.20462; 
              
              const count = formulas[index] ? formulas[index]() : 0;

              return {
                  id: `v_row_${index}`,
                  no: staticRow[0],
                  tipo: staticRow[1],
                  l2,
                  lxKip,
                  count
              };
          });
      }
  }, [method, directRows, genData, compData]);

  // --- 2. CALCULATE ESALS ---
  const { esalRows, growthFactor } = useMemo(() => {
    const log10 = Math.log10;
    const pow = Math.pow;
    
    const pt = genData.finalServiceability;
    const Gt = log10((4.2 - pt) / 2.7);

    const beta18 = 0.4 + (1094 / pow(snSeed + 1, 5.19));

    const r = genData.growthRate / 100;
    const n = genData.designPeriod;
    let gf = n; 
    if (r !== 0) {
        gf = (pow(1 + r, n) - 1) / r;
    }

    const rows = trafficStream.map(item => {
        const { l2, lxKip, count } = item;
        const numeratorBx = 0.081 * pow(lxKip + l2, 3.23);
        const denominatorBx = pow(snSeed + 1, 5.19) * pow(l2, 3.23);
        const betaX = 0.4 + (numeratorBx / denominatorBx);

        const term1 = 4.79 * log10(18 + 1); 
        const term2 = 4.79 * log10(lxKip + l2);
        const term3 = 4.33 * log10(l2);
        const term4 = Gt / betaX;
        const term5 = Gt / beta18;

        const exponent = term1 - term2 + term3 + term4 - term5;
        const fx = 1 / pow(10, exponent);
        const esal = fx * count;

        return { ...item, ejesAnio: count, fx, esalAnio: esal };
    });

    return { esalRows: rows, growthFactor: gf };
  }, [snSeed, genData.finalServiceability, genData.growthRate, genData.designPeriod, trafficStream]);

  const totalESALs1Year = useMemo(() => esalRows.reduce((acc, r) => acc + r.esalAnio, 0), [esalRows]);
  const totalESALsDesign = totalESALs1Year * growthFactor;

  // --- 3 & 4. SN CALCULATIONS ---
  const solveAashtoIterative = (Mr: number, W18: number): number => {
    if (W18 <= 0 || Mr <= 0) return 0;
    const log10 = Math.log10;
    const pow = Math.pow;
    const abs = Math.abs;
    const p = 1 - (genData.reliability / 100);
    const Zr = inverseNormalCDF(p);
    const So = genData.standardDeviation;
    const Pt = genData.finalServiceability;
    const dPSI = 4.2 - Pt; 
    const logW18 = log10(W18);
    const zrSo = Zr * So;
    const logMrTerm = 2.32 * log10(Mr);
    const psiTerm = log10(dPSI / 2.7); 
    let currentSeed = 2.0; 
    let snReq = 0;
    let error = 1.0;
    let iterations = 0;
    while (error > 0.001 && iterations < 100) {
        iterations++;
        const denominator = 0.4 + (1094 / pow(currentSeed + 1, 5.19));
        const fraction = psiTerm / denominator;
        const beta = logW18 - zrSo - fraction - logMrTerm + 8.27;
        snReq = -1 + pow(10, beta / 9.36);
        error = abs(snReq - currentSeed);
        if (error >= 0.001) currentSeed = snReq;
    }
    return snReq > 0 ? snReq : 0;
  };

  const calculateManualSN = (Mr: number, W18: number, seed: number): number => {
    if (W18 <= 0 || Mr <= 0) return 0;
    const log10 = Math.log10;
    const pow = Math.pow;
    const p = 1 - (genData.reliability / 100);
    const Zr = inverseNormalCDF(p);
    const So = genData.standardDeviation;
    const Pt = genData.finalServiceability;
    const dPSI = 4.2 - Pt;
    const logW18 = log10(W18);
    const zrSo = Zr * So;
    const logMrTerm = 2.32 * log10(Mr);
    const psiTerm = log10(dPSI / 2.7);
    const denominator = 0.4 + (1094 / pow(seed + 1, 5.19));
    const fraction = psiTerm / denominator;
    const beta = logW18 - zrSo - fraction - logMrTerm + 8.27;
    const snReq = -1 + pow(10, beta / 9.36);
    return snReq > 0 ? snReq : 0;
  };

  const snRequiredTotalManual = useMemo(() => {
    return calculateManualSN(genData.subgradeMr, totalESALsDesign, snSeed);
  }, [totalESALsDesign, genData, snSeed]);

  // --- 5. STRUCTURE CALCULATION HELPER ---
  const calculateStructure = (layers: PavementLayer[]) => {
      let accumulatedSN = 0;
      const asphaltLayerNames = ["Carpeta asfáltica alto desempeño", "Carpeta asfáltica normal", "Base asfáltica", "Carpeta asfáltica nueva", "Base asfáltica nueva"];
      
      const processedLayers = layers.map((layer, index) => {
          const isLast = index === layers.length - 1;
          const supportMr = isLast ? genData.subgradeMr : layers[index + 1].mr;
          const snRequiredForSupport = solveAashtoIterative(supportMr, totalESALsDesign);
          let snNeededFromLayer = Math.max(0, snRequiredForSupport - accumulatedSN);
          
          const m = layer.m !== undefined 
            ? layer.m 
            : (asphaltLayerNames.some(name => layer.name.includes(name))
                ? 1.0 
                : (genData.drainageCoefficient || 1.0));
          
          const h_in_calc = (layer.a * m) > 0 ? snNeededFromLayer / (layer.a * m) : 0;
          const h_cm_calc = h_in_calc * 2.54;
          const manualVal = manualThicknesses[layer.id];
          const h_cm_real = manualVal !== undefined ? manualVal : Math.ceil(h_cm_calc * 2) / 2;

          const snProvided = (h_cm_real / 2.54) * layer.a * m;
          accumulatedSN += snProvided; 

          return { ...layer, supportMr, snReq: snRequiredForSupport, m, h_in_calc, h_cm_calc, h_cm_real, snProvided };
      });

      const snTotalProvided = processedLayers.reduce((acc, l) => acc + l.snProvided, 0);

      // ESALs and Life
      let esalsForSnTotal = 0;
      let remainingLifeYears = 0;

      if (snTotalProvided > 0) {
          const log10 = Math.log10;
          const pow = Math.pow;
          const p = 1 - (genData.reliability / 100);
          const Zr = inverseNormalCDF(p);
          const So = genData.standardDeviation;
          const Pt = genData.finalServiceability;
          const dPSI = 4.2 - Pt;
          const zrSo = Zr * So;
          const logMrTerm = 2.32 * log10(genData.subgradeMr);
          const psiTerm = log10(dPSI / 2.7);
          const denominator = 0.4 + (1094 / pow(snTotalProvided + 1, 5.19));
          const fraction = psiTerm / denominator;
          
          const logW18 = zrSo + 9.36 * log10(snTotalProvided + 1) + fraction + logMrTerm - 8.27;
          esalsForSnTotal = pow(10, logW18);
          
          const r = genData.growthRate / 100;
          if (totalESALs1Year > 0) {
              if (r === 0) {
                  remainingLifeYears = esalsForSnTotal / totalESALs1Year;
              } else {
                  const val = (esalsForSnTotal * r / totalESALs1Year) + 1;
                  if (val > 0) {
                      remainingLifeYears = Math.log(val) / Math.log(1 + r);
                  }
              }
          }
      }

      return { layers: processedLayers, snTotalProvided, esalsForSnTotal, remainingLifeYears };
  };

  const structureActual = useMemo(() => calculateStructure(genData.layers), [genData.layers, genData.subgradeMr, genData.drainageCoefficient, totalESALsDesign, manualThicknesses, totalESALs1Year]);
  const structureAlt1 = useMemo(() => calculateStructure(alt1Layers), [alt1Layers, genData.subgradeMr, genData.drainageCoefficient, totalESALsDesign, manualThicknesses, totalESALs1Year]);
  const structureAlt2 = useMemo(() => calculateStructure(alt2Layers), [alt2Layers, genData.subgradeMr, genData.drainageCoefficient, totalESALsDesign, manualThicknesses, totalESALs1Year]);
  const structureAlt3 = useMemo(() => calculateStructure([RIEGO_DE_SELLO_LAYER, ...genData.layers]), [genData.layers, genData.subgradeMr, genData.drainageCoefficient, totalESALsDesign, manualThicknesses, totalESALs1Year]);

  const handleRealThicknessChange = (layerId: string, val: string, _alt?: number) => {
      const num = parseFloat(val);
      const newThickness = isNaN(num) ? 0 : num;

      setManualThicknesses(prev => {
          const next = { ...prev, [layerId]: newThickness };

          // If changing actual structure (no _alt provided), replicate to alternatives by name
          if (_alt === undefined) {
              const sourceLayer = genData.layers.find(l => l.id === layerId);
              if (sourceLayer) {
                  // Replicate to Alt 1
                  alt1Layers.forEach(l => {
                      if (l.name === sourceLayer.name) {
                          next[l.id] = newThickness;
                      }
                  });
                  // Replicate to Alt 2
                  alt2Layers.forEach(l => {
                      if (l.name === sourceLayer.name) {
                          next[l.id] = newThickness;
                      }
                  });
              }
          }

          return next;
      });
  };

  const handleAltLayerChange = (alt: 1 | 2, layerId: string, field: keyof PavementLayer, value: any) => {
      // Intercept Name Change for Custom Layer
      if (field === 'name' && value === CUSTOM_LAYER_NAME) {
          setEditingLayerId(layerId);
          setEditingAltSource(alt);
          setCustomLayerForm({
              code: '',
              name: '',
              mr: 0,
              a: 0,
              m: 1.0
          });
          setIsModalOpen(true);
          return;
      }

      const setter = alt === 1 ? setAlt1Layers : setAlt2Layers;
      setter(prev => prev.map(l => {
          if (l.id !== layerId) return l;

          // If changing name to a standard layer, auto-update values
          if (field === 'name') {
              const newValues = getLayerValues(value as string, genData.rigidityLevel || 'low');
              return { 
                  ...l, 
                  name: value as string, 
                  ...newValues,
                  customCode: undefined 
              };
          }

          return { ...l, [field]: field === 'mr' || field === 'a' || field === 'm' ? parseFloat(value) || 0 : value };
      }));
  };

  const handleSaveCustomAltLayer = () => {
      if (!editingLayerId || !editingAltSource) return;

      const setter = editingAltSource === 1 ? setAlt1Layers : setAlt2Layers;
      setter(prev => prev.map(l => {
          if (l.id !== editingLayerId) return l;
          return {
              ...l,
              name: customLayerForm.name || CUSTOM_LAYER_NAME,
              mr: customLayerForm.mr,
              a: customLayerForm.a,
              m: customLayerForm.m,
              customCode: customLayerForm.code.toUpperCase().substring(0, 2)
          };
      }));
      setIsModalOpen(false);
  };

  const handleSyncSeed = () => {
    setSnSeed(Number(snRequiredTotalManual.toFixed(2)));
  };

  const formatNum = (n: number | undefined, d: number = 2) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Title
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text("Dictámenes técnicos de conservación periódica 2026", pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generado el: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, pageWidth / 2, 28, { align: "center" });

    // 0. Project Information
    doc.setFontSize(14);
    doc.setTextColor(51, 65, 85);
    doc.text("0. Información del Proyecto", 14, 40);
    
    autoTable(doc, {
      startY: 45,
      head: [['Concepto', 'Descripción']],
      body: [
        ['Carretera', genData.projectName || '-'],
        ['Tramo', genData.section || '-'],
        ['Clasificación oficial', genData.roadType || '-'],
        ['Tipo de Red (DGCC)', genData.networkType || '-'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85] }
    });

    // 1. General Data
    doc.setFontSize(14);
    doc.setTextColor(51, 65, 85);
    doc.text("1. Parámetros de Diseño", 14, (doc as any).lastAutoTable.finalY + 15);
    
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Parámetro', 'Valor', 'Unidad']],
      body: [
        ['Tránsito Diario Inicial (TDPA)', formatNum(genData.tdpa, 0), 'Vehículos'],
        ['Vehículos Cargados (Pvc)', formatNum(genData.pvc, 1), '%'],
        ['Carriles por Sentido', genData.lanes, '-'],
        ['Tasa de Crecimiento', formatNum(genData.growthRate, 2), '%'],
        ['Periodo de Diseño', genData.designPeriod, 'Años'],
        ['Confiabilidad (R)', formatNum(genData.reliability, 1), '%'],
        ['Desviación Estándar (So)', formatNum(genData.standardDeviation, 2), '-'],
        ['Módulo Resiliente Subrasante (Mr)', formatNum(genData.subgradeMr, 0), 'psi'],
        ['Servicialidad Inicial (Po)', '4.2', '-'],
        ['Servicialidad Final (Pt)', formatNum(genData.finalServiceability, 1), '-'],
      ],
      theme: 'striped',
      headStyles: { fillColor: [71, 85, 105] }
    });

    // 1.1 Vehicle Composition (if applicable)
    if (method === 'vehicles') {
      doc.addPage();
      doc.setFontSize(14);
      doc.text("1.1 Composición Vehicular", 14, 20);
      
      const compBody = VEHICLE_NAMES
        .map((name, idx) => ({ name, value: compData[idx] || 0 }))
        .filter(item => item.value > 0)
        .map(item => [item.name, formatNum(item.value, 2) + '%']);
      
      autoTable(doc, {
        startY: 25,
        head: [['Vehículo', 'Participación (%)']],
        body: compBody,
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85] }
      });
    }

    // 2. Requerimiento de calidad de mezcla asfáltica
    const unamResults = calculateUnamTotalAccumulated(genData, compData, 0); // Z=0 as requested
    const totalUnam = unamResults.totalAccumulated;
    const isPerformance = totalUnam > 10000000;

    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(51, 65, 85);
    doc.text("2. Requerimiento de calidad de mezcla asfáltica", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const unamText = `Para uniformizar el criterio y establecer los requisitos de selección del tipo de asfalto, de los materiales pétreos, del nivel de tránsito para diseño de mezclas, se obtiene el número de ejes equivalentes de 8,2 t acumulados durante el periodo de servicio del pavimento en el carril de diseño que en ningún caso será menor de diez (10) años; obtenido con el método de Instituto de Ingeniería de la UNAM para condición de daño superficial (L Z=0). el cual es ${formatNum(totalUnam, 0)}, ${isPerformance ? "por lo que se requiere que se diseñe por el método por desempeño" : "por lo que se requiere que se diseñe por el método Marshall"}.`;
    
    const splitText = doc.splitTextToSize(unamText, pageWidth - 28);
    doc.text(splitText, 14, 30);

    // 3. Traffic Analysis
    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(51, 65, 85);
    doc.text("3. Análisis de Tránsito (ESALs)", 14, 20);
    autoTable(doc, {
      startY: 25,
      head: [['Concepto', 'Valor']],
      body: [
        ['ESALs Primer Año (W18_1)', formatNum(totalESALs1Year, 0)],
        ['Factor de Crecimiento', formatNum(growthFactor, 2)],
        ['ESALs de Diseño (W18_design)', formatNum(totalESALsDesign, 0)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] }
    });

    // 4. SN Requirements
    doc.setFontSize(14);
    doc.setTextColor(51, 65, 85);
    doc.text("4. Requerimientos Estructurales (AASHTO-93)", 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Parámetro', 'Valor']],
      body: [
        ['Diferencia de Servicialidad (ΔPSI)', formatNum(4.2 - genData.finalServiceability, 1)],
        ['Número Estructural Requerido (SN)', formatNum(snRequiredTotalManual, 2)],
      ],
      theme: 'plain',
    });

    // 5. Structure Alternatives
    const addStructureToPdf = (title: string, data: any, index: number) => {
        doc.addPage();
        doc.setFontSize(16);
        doc.text(`5.${index} ${title}`, 14, 20);
        
        autoTable(doc, {
            startY: 25,
            head: [['Capa', 'a', 'm', 'E(psi)', 'Esp. Real (cm)', 'SN Aportado']],
            body: [
                ...data.layers.map((l: any) => [
                    l.name,
                    l.a,
                    l.m,
                    formatNum(l.mr, 0),
                    formatNum(l.h_cm_real, 1),
                    formatNum(l.snProvided, 2)
                ]),
                ['Subrasante', '-', '-', formatNum(genData.subgradeMr, 0), '-', '-']
            ],
            foot: [[
                'TOTAL', '', '', '', '', formatNum(data.snTotalProvided, 2)
            ]],
            theme: 'striped',
            headStyles: { fillColor: [15, 118, 110] }
        });

        const finalY = (doc as any).lastAutoTable.finalY;
        doc.setFontSize(12);
        doc.text(`ESAL's Soportados (W18): ${formatNum(data.esalsForSnTotal, 0)}`, 14, finalY + 15);
        doc.text(`Vida Remanente Estimada: ${formatNum(data.remainingLifeYears, 1)} años`, 14, finalY + 25);
    };

    addStructureToPdf("Estructura Actual", structureActual, 1);
    addStructureToPdf("Alternativa 1: Recuperación + CA", structureAlt1, 2);
    addStructureToPdf("Alternativa 2: Fresado + CA", structureAlt2, 3);
    addStructureToPdf("Alternativa 3: Riego de sello", structureAlt3, 4);

    doc.save("Dictamenes_Tecnicos_Conservacion_Periodica_2026.pdf");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-32">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1">Estructuración</h1>
          <p className="text-slate-500">Cálculo de espesores según AASHTO-93</p>
        </div>
      </header>

      {/* Inputs Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-8 shadow-sm">
         <h3 className="text-xl font-bold text-slate-900 mb-4">Configuración de Diseño</h3>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div>
                 <label className="block text-sm text-slate-500 mb-1">SN Semilla (Iteración)</label>
                 <div className="flex items-center gap-4">
                     <input
                        type="number"
                        value={snSeed}
                        onChange={(e) => setSnSeed(parseFloat(e.target.value))}
                        step="0.1"
                        className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 focus:border-blue-500 outline-none"
                     />
                     <div className="text-xs text-slate-400">
                        Valor inicial para iteraciones.
                     </div>
                 </div>
             </div>
         </div>
      </div>

      {/* Results Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
              <div className="text-sm text-slate-500 mb-1">ESALs DE DISEÑO</div>
              <div className="text-3xl font-bold text-blue-600">{formatNum(totalESALsDesign, 0)}</div>
              <div className="text-xs text-slate-400 mt-2">
                  1er Año: {formatNum(totalESALs1Year, 0)}
              </div>
          </div>
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
              <div className="text-sm text-slate-500 mb-1">SN REQUERIDO</div>
              <div className="text-3xl font-bold text-emerald-600">{formatNum(snRequiredTotalManual, 2)}</div>
              <div className="text-xs text-slate-400 mt-2">
                 Calculado con MR Subrasante
              </div>
          </div>
          
          {/* Sync Button Card - PERMANENT */}
          <div className="bg-white border border-slate-200 p-6 rounded-xl flex flex-col items-center justify-center relative overflow-hidden shadow-sm">
                <div className={`absolute top-0 left-0 w-1 h-full ${Math.abs(snRequiredTotalManual - snSeed) > 0.1 ? 'bg-orange-500' : 'bg-green-500'}`}></div>
                
                <div className={`font-bold mb-2 text-sm text-center ${Math.abs(snRequiredTotalManual - snSeed) > 0.1 ? 'text-orange-600' : 'text-green-600'}`}>
                    {Math.abs(snRequiredTotalManual - snSeed) > 0.1 
                        ? <><i className="fas fa-exclamation-triangle"></i> Diferencia Detectada</> 
                        : <><i className="fas fa-check-circle"></i> Convergencia OK</>}
                </div>
                
                <button 
                    onClick={handleSyncSeed}
                    className={`px-4 py-2 rounded-full text-xs font-bold shadow-md transition-all active:scale-95 flex items-center gap-2 ${
                        Math.abs(snRequiredTotalManual - snSeed) > 0.1 
                        ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-100' 
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                    }`}
                >
                    <i className="fas fa-sync-alt"></i> Igualar a {formatNum(snRequiredTotalManual)}
                </button>
                
                <div className="text-[10px] text-slate-400 mt-2 text-center">
                    Semilla actual: {formatNum(snSeed)}
                </div>
          </div>
      </div>

      {/* Layer Structure Tables */}
      <div className="space-y-12">
          {/* 1. Estructura Actual */}
          <StructureTable 
            title="Estructura Actual" 
            data={structureActual} 
            genData={genData} 
            handleRealThicknessChange={handleRealThicknessChange}
            formatNum={formatNum}
          />

          {/* 2. Alternativa 1: Recuperación + CA */}
          <StructureTable 
            title="Recuperación + CA" 
            data={structureAlt1} 
            genData={genData} 
            handleRealThicknessChange={(id, val) => handleRealThicknessChange(id, val, 1)}
            formatNum={formatNum}
            isEditable={true}
            onLayerChange={(id, field, val) => handleAltLayerChange(1, id, field, val)}
            onAddLayer={() => handleAddAltLayer(1)}
            onRemoveLayer={(id) => handleRemoveAltLayer(id, 1)}
            onOpenCalc={(layer) => handleOpenAltCalc(layer, 1)}
          />

          {/* 3. Alternativa 2: Fresado + CA */}
          <StructureTable 
            title="Fresado + CA" 
            data={structureAlt2} 
            genData={genData} 
            handleRealThicknessChange={(id, val) => handleRealThicknessChange(id, val, 2)}
            formatNum={formatNum}
            isEditable={true}
            onLayerChange={(id, field, val) => handleAltLayerChange(2, id, field, val)}
            onAddLayer={() => handleAddAltLayer(2)}
            onRemoveLayer={(id) => handleRemoveAltLayer(id, 2)}
            onOpenCalc={(layer) => handleOpenAltCalc(layer, 2)}
          />

          {/* 4. Alternativa 3: Riego de sello */}
          <StructureTable 
            title="Riego de sello" 
            data={structureAlt3} 
            genData={genData} 
            handleRealThicknessChange={handleRealThicknessChange}
            formatNum={formatNum}
          />
      </div>

      {/* Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 p-4 z-40 shadow-lg no-print">
        <div className="max-w-7xl mx-auto flex justify-end gap-4">
             <button 
                onClick={handleSaveCalculations}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-lg font-bold flex items-center gap-2 border border-slate-200"
            >
                <i className="fas fa-save"></i> <span className="hidden sm:inline">Guardar</span>
            </button>
            <button 
                onClick={generatePDF}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-blue-200"
            >
                <i className="fas fa-file-pdf"></i> Generar Reporte
            </button>
        </div>
      </div>

      {isSaved && (
            <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-full shadow-lg z-50 animate-fade-in-up">
                <i className="fas fa-check mr-2"></i> Cálculo Guardado
            </div>
      )}

      {/* CUSTOM LAYER MODAL */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-500/40 backdrop-blur-sm overflow-y-auto">
              <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md p-6 my-auto max-h-[90vh] flex flex-col">
                  <div className="shrink-0 mb-4">
                      <h3 className="text-xl font-bold text-slate-900">Nueva Capa Personalizada</h3>
                  </div>
                  
                  <div className="space-y-4 text-left overflow-y-auto pr-2">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Clave (2 letras - para móvil)</label>
                          <input 
                              type="text" 
                              maxLength={2}
                              value={customLayerForm.code}
                              onChange={(e) => setCustomLayerForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                              className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-900 focus:border-blue-500 outline-none"
                              placeholder="Ej. MC"
                              autoFocus
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre de la Capa</label>
                          <input 
                              type="text" 
                              value={customLayerForm.name}
                              onChange={(e) => setCustomLayerForm(prev => ({ ...prev, name: e.target.value }))}
                              className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-900 focus:border-blue-500 outline-none"
                              placeholder="Ej. Mezcla Caliente Modificada"
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Módulo (psi)</label>
                            <input 
                                type="number" 
                                value={customLayerForm.mr || ''}
                                onChange={(e) => setCustomLayerForm(prev => ({ ...prev, mr: parseFloat(e.target.value) }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-900 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Aporte (a)</label>
                            <input 
                                type="number" 
                                step="0.01"
                                value={customLayerForm.a || ''}
                                onChange={(e) => setCustomLayerForm(prev => ({ ...prev, a: parseFloat(e.target.value) }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-900 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Coef. Drenaje (m)</label>
                            <input 
                                type="number" 
                                step="0.01"
                                value={customLayerForm.m || ''}
                                onChange={(e) => setCustomLayerForm(prev => ({ ...prev, m: parseFloat(e.target.value) }))}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-900 focus:border-blue-500 outline-none"
                            />
                        </div>
                      </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-8 shrink-0">
                      <button 
                          onClick={() => setIsModalOpen(false)}
                          className="px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                      >
                          Cancelar
                      </button>
                      <button 
                          onClick={handleSaveCustomAltLayer}
                          disabled={!customLayerForm.code || !customLayerForm.name || !customLayerForm.mr || !customLayerForm.a}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          Aceptar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* LAYER PROPERTY CALCULATOR MODAL */}
      {isCalcModalOpen && calcLayerData && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-500/40 backdrop-blur-sm no-print overflow-y-auto">
              <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md p-6 my-auto max-h-[90vh] flex flex-col">
                  <div className="flex justify-between items-center mb-6 shrink-0">
                      <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                          <i className="fas fa-calculator text-blue-600"></i> Calculadora de Propiedades
                      </h3>
                      <button onClick={() => setIsCalcModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                          <i className="fas fa-times"></i>
                      </button>
                  </div>
                  
                  <div className="space-y-6 overflow-y-auto pr-2">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre de la Capa</label>
                          <div className="p-3 bg-slate-50 rounded border border-slate-200 font-medium text-slate-700">
                              {calcLayerData.name}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 italic">
                              Las fórmulas dependen del nombre (ej. "Carpeta", "Base hidráulica").
                          </p>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Módulo Resiliente (psi)</label>
                          <div className="flex gap-2">
                              <input 
                                  type="text" 
                                  value={(calcLayerData.mr || 0).toLocaleString('en-US')}
                                  onChange={(e) => {
                                      const val = e.target.value.replace(/,/g, '');
                                      if (!isNaN(Number(val))) {
                                          setCalcLayerData(prev => prev ? ({ ...prev, mr: parseFloat(val) || 0 }) : null);
                                      }
                                  }}
                                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 focus:border-blue-500 outline-none"
                              />
                              <button 
                                  onClick={() => {
                                      const newA = calculateAFromMR(calcLayerData.name, calcLayerData.mr || 0);
                                      setCalcLayerData(prev => prev ? ({ ...prev, a: newA }) : null);
                                  }}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded flex items-center justify-center"
                                  title="Calcular Aporte (a) desde Módulo (E)"
                              >
                                  <i className="fas fa-arrow-down"></i>
                              </button>
                          </div>
                      </div>

                      <div className="flex justify-center">
                          <div className="h-px bg-slate-200 w-full relative">
                              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-[10px] text-slate-400 uppercase font-bold tracking-widest">Fórmulas AASHTO</span>
                          </div>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Coeficiente Estructural (a)</label>
                          <div className="flex gap-2">
                              <input 
                                  type="number" 
                                  step="0.001"
                                  value={calcLayerData.a}
                                  onChange={(e) => setCalcLayerData(prev => prev ? ({ ...prev, a: parseFloat(e.target.value) || 0 }) : null)}
                                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 focus:border-blue-500 outline-none"
                              />
                              <button 
                                  onClick={() => {
                                      const newMR = calculateMRFromA(calcLayerData.name, calcLayerData.a);
                                      setCalcLayerData(prev => prev ? ({ ...prev, mr: newMR }) : null);
                                  }}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 rounded flex items-center justify-center"
                                  title="Calcular Módulo (E) desde Aporte (a)"
                              >
                                  <i className="fas fa-arrow-up"></i>
                              </button>
                          </div>
                      </div>

                      {getLayerFormulaType(calcLayerData.name) === 0 && (
                          <div className="bg-amber-50 border border-amber-200 p-3 rounded text-xs text-amber-700">
                              <i className="fas fa-exclamation-triangle mr-2"></i>
                              No hay fórmulas predefinidas para este tipo de capa. Ingrese los valores manualmente.
                          </div>
                      )}
                  </div>

                  <div className="flex justify-end gap-3 mt-8 shrink-0">
                      <button 
                          onClick={() => setIsCalcModalOpen(false)}
                          className="px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                      >
                          Cancelar
                      </button>
                      <button 
                          onClick={handleApplyAltCalc}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
                      >
                          Aplicar
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default EsalsPage;