import React, { useState, useEffect, useMemo } from 'react';
import { GeneralData, CompositionData, CalculationMethod, AxleInputRow, PavementLayer } from '../types';
import { DEFAULT_COMPOSITION, DEFAULT_GENERAL_DATA, TABLE_STATIC_ROWS, VEHICLE_NAMES, LAYER_CATALOG, CUSTOM_LAYER_NAME } from '../constants';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from 'html2canvas';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Cell,
  ReferenceLine,
  LabelList
} from 'recharts';
import { calculateUnamTotalAccumulated } from '../utils/calculations';

const DEFAULT_ALT1_LAYERS: PavementLayer[] = [
    { id: 'alt1_l1', name: "Capa de rodadura", mr: 450000, a: 0.44, m: 1.0 },
    { id: 'alt1_l2', name: "Base estabilizada", mr: 300000, a: 0.30, m: 1.0 },
    { id: 'alt1_l3', name: "Carpeta asfáltica (CA)", mr: 400000, a: 0.42, m: 1.0 },
    { id: 'alt1_l4', name: "Base hidráulica", mr: 30000, a: 0.14, m: 1.0 },
];

const DEFAULT_ALT2_LAYERS: PavementLayer[] = [
    { id: 'alt2_l1', name: "Capa de rodadura", mr: 450000, a: 0.44, m: 1.0 },
    { id: 'alt2_l2', name: "Carpeta asfáltica (CA)", mr: 400000, a: 0.42, m: 1.0 },
    { id: 'alt2_l3', name: "Base hidráulica", mr: 30000, a: 0.14, m: 1.0 },
];

const RIEGO_DE_SELLO_LAYER: PavementLayer = {
    id: 'riego_sello',
    name: 'Capa de rodadura (Sello)',
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
    let a = 0.14;
    if (type === 1) {
        a = Math.max(0.05, Math.min(0.5, 0.40 * Math.log10(mr / 450000) + 0.44));
    } else if (type === 2) {
        a = Math.max(0.05, Math.min(0.2, 0.249 * Math.log10(mr) - 0.977));
    } else if (type === 3) {
        a = Math.max(0.05, Math.min(0.15, 0.227 * Math.log10(mr) - 0.839));
    }
    return Math.round(a * 100) / 100;
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
    onTitleChange,
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
    onTitleChange?: (newTitle: string) => void;
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
                <div className="flex-1 mr-4">
                    <input 
                        type="text"
                        value={title}
                        onChange={(e) => onTitleChange?.(e.target.value)}
                        className="w-full font-bold text-slate-900 text-lg bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500 rounded px-1 transition-all"
                        placeholder="Nombre de la estructura"
                    />
                </div>
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
                                        ) : formatNum(layer.a, 2)}
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
                                        ) : <span className="text-slate-700">{formatNum(layer.a, 2)}</span>}
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

  // -- Custom Titles for Structures --
  const [titleActual, setTitleActual] = useState("Estructura Actual");
  const [titleAlt1, setTitleAlt1] = useState("Recuperación + CA");
  const [titleAlt2, setTitleAlt2] = useState("Fresado + CA");
  const [titleAlt3, setTitleAlt3] = useState("Riego de sello");

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
            if (parsed.titleActual) setTitleActual(parsed.titleActual);
            if (parsed.titleAlt1) setTitleAlt1(parsed.titleAlt1);
            if (parsed.titleAlt2) setTitleAlt2(parsed.titleAlt2);
            if (parsed.titleAlt3) setTitleAlt3(parsed.titleAlt3);
        } catch (e) { console.error(e); }
    } else {
        setSnSeed(currentGen.snSeed || 4.0);
    }
  }, []);

  const handleSaveCalculations = () => {
      const dataToSave = { 
          snSeed, 
          manualThicknesses, 
          alt1Layers, 
          alt2Layers,
          titleActual,
          titleAlt1,
          titleAlt2,
          titleAlt3
      };
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

          return { ...l, [field]: field === 'a' ? Math.round((parseFloat(value) || 0) * 100) / 100 : (field === 'mr' || field === 'm' ? parseFloat(value) || 0 : value) };
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
              a: Math.round(customLayerForm.a * 100) / 100,
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

  const generatePDF = async () => {
    // Small delay to ensure charts are rendered and animations (if any) are done
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter'
    });
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

    // 2. Requerimiento de calidad de mezcla asfáltica y Análisis de Tránsito
    const unamResults = calculateUnamTotalAccumulated(genData, compData, 0); // Z=0 as requested
    const totalUnam = unamResults.totalAccumulated;
    const isPerformance = totalUnam > 10000000;

    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(51, 65, 85);
    doc.text("2. Análisis de Tránsito y Calidad de Mezcla", 14, 20);
    
    doc.setFontSize(12);
    doc.text("2.1 Requerimiento de calidad de mezcla asfáltica", 14, 30);
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const unamText = `Para uniformizar el criterio y establecer los requisitos de selección del tipo de asfalto, de los materiales pétreos, del nivel de tránsito para diseño de mezclas, se obtiene el número de ejes equivalentes de 8,2 t acumulados durante el periodo de servicio del pavimento en el carril de diseño que en ningún caso será menor de diez (10) años; obtenido con el método de Instituto de Ingeniería de la UNAM para condición de daño superficial (L Z=0). el cual es ${formatNum(totalUnam, 0)}, ${isPerformance ? "por lo que se requiere que se diseñe por el método por desempeño" : "por lo que se requiere que se diseñe por el método Marshall"}.`;
    
    const splitUnamText = doc.splitTextToSize(unamText, pageWidth - 28);
    doc.text(splitUnamText, 14, 38);

    // UNAM Table
    const unamRows = unamResults.rows
      .filter(r => r.equiv > 0)
      .map(r => [
        r.no,
        r.tipo,
        r.estado,
        formatNum(r.wTon, 1),
        formatNum(r.ejes, 0),
        r.damage.toFixed(5),
        formatNum(r.equiv, 0)
      ]);

    autoTable(doc, {
      startY: 38 + (splitUnamText.length * 5) + 5,
      head: [['No.', 'Tipo', 'Estado', 'W (Ton)', 'Ejes 1er Año', 'Daño Unit.', 'Ejes Equiv.']],
      body: unamRows,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105] },
      styles: { fontSize: 8 }
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 2,
      body: [
        ['Suma Ejes Equiv. 1er Año', formatNum(unamResults.totalEquiv1stYear, 0)],
        ['Coef. Acumulación (CT)', unamResults.ct.toFixed(4)],
        ['Total Ejes Equiv. Acumulados', formatNum(unamResults.totalAccumulated, 0)],
      ],
      theme: 'grid',
      styles: { fontSize: 9, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 100 } }
    });

    const unamTableFinalY = (doc as any).lastAutoTable.finalY;

    doc.setFontSize(12);
    doc.setTextColor(51, 65, 85);
    doc.text("2.2 Análisis de Tránsito (ESALs)", 14, unamTableFinalY + 10);
    autoTable(doc, {
      startY: unamTableFinalY + 15,
      head: [['Concepto', 'Valor']],
      body: [
        ['ESALs Primer Año (W18_1)', formatNum(totalESALs1Year, 0)],
        ['Factor de Crecimiento', formatNum(growthFactor, 2)],
        ['ESALs de Diseño (W18_design)', formatNum(totalESALsDesign, 0)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] }
    });

    // 2.3 Descripción o diagnóstico del estado físico del tramo
    const diagnosisY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.setTextColor(51, 65, 85);
    doc.text("2.3 Descripción o diagnóstico del estado físico del tramo", 14, diagnosisY);
    
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const diagnosisText = genData.diagnosis || "No se ingresó descripción o diagnóstico.";
    const splitDiagnosisText = doc.splitTextToSize(diagnosisText, pageWidth - 28);
    doc.text(splitDiagnosisText, 14, diagnosisY + 8);

    // 2.4 Tipo de asfalto requerido grado PG
    const asphaltY = diagnosisY + 8 + (splitDiagnosisText.length * 5) + 10;
    doc.setFontSize(12);
    doc.setTextColor(51, 65, 85);
    doc.text("2.4 Tipo de asfalto requerido grado PG", 14, asphaltY);
    
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(genData.asphaltGrade || "70H-16", 14, asphaltY + 8);

    // 3. SN Requirements
    const snReqY = asphaltY + 18;
    // Check if we need a new page for section 3
    let currentY = snReqY;
    if (currentY > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        currentY = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(51, 65, 85);
    doc.text("3. Requerimientos Estructurales (AASHTO-93)", 14, currentY);
    autoTable(doc, {
      startY: currentY + 5,
      head: [['Parámetro', 'Valor']],
      body: [
        ['Diferencia de Servicialidad (ΔPSI)', formatNum(4.2 - genData.finalServiceability, 1)],
        ['Número Estructural Requerido (SN)', formatNum(snRequiredTotalManual, 2)],
      ],
      theme: 'plain',
    });

    // 4. Resumen Comparativo de Alternativas
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(51, 65, 85);
    doc.text("4. Resumen Comparativo de Alternativas", 14, 20);
    
    autoTable(doc, {
        startY: 28,
        head: [['Alternativa', 'SN Total', 'W18 Soportado', 'Vida (Años)', 'Cumple']],
        body: [
            [titleActual, formatNum(structureActual.snTotalProvided, 2), formatNum(structureActual.esalsForSnTotal, 0), formatNum(structureActual.remainingLifeYears, 1), structureActual.snTotalProvided >= snRequiredTotalManual ? 'SI' : 'NO'],
            [titleAlt1, formatNum(structureAlt1.snTotalProvided, 2), formatNum(structureAlt1.esalsForSnTotal, 0), formatNum(structureAlt1.remainingLifeYears, 1), structureAlt1.snTotalProvided >= snRequiredTotalManual ? 'SI' : 'NO'],
            [titleAlt2, formatNum(structureAlt2.snTotalProvided, 2), formatNum(structureAlt2.esalsForSnTotal, 0), formatNum(structureAlt2.remainingLifeYears, 1), structureAlt2.snTotalProvided >= snRequiredTotalManual ? 'SI' : 'NO'],
            [titleAlt3, formatNum(structureAlt3.snTotalProvided, 2), formatNum(structureAlt3.esalsForSnTotal, 0), formatNum(structureAlt3.remainingLifeYears, 1), structureAlt3.snTotalProvided >= snRequiredTotalManual ? 'SI' : 'NO'],
        ],
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85] },
        columnStyles: {
            4: { fontStyle: 'bold' }
        }
    });

    // Add Charts to PDF
    const chartSn = document.getElementById('chart-sn');
    const chartLayers = document.getElementById('chart-layers');
    
    currentY = (doc as any).lastAutoTable.finalY + 20;

    if (chartSn) {
        try {
            // Add Chart Title
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.text("Cuadro Comparativo de Alternativas (SN)", pageWidth / 2, currentY, { align: 'center' });
            currentY += 12;

            const canvas = await html2canvas(chartSn, { 
                scale: 1.5, // Slightly lower scale for better compatibility
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: true,
                width: chartSn.offsetWidth,
                height: chartSn.offsetHeight
            });
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = pageWidth - 40;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            const xPos = (pageWidth - imgWidth) / 2;
            
            if (currentY + imgHeight > doc.internal.pageSize.getHeight() - 20) {
                doc.addPage();
                currentY = 20;
                doc.setFontSize(16);
                doc.setFont("helvetica", "bold");
                doc.text("Cuadro Comparativo de Alternativas (SN) - Cont.", pageWidth / 2, currentY, { align: 'center' });
                currentY += 12;
            }
            
            doc.addImage(imgData, 'PNG', xPos, currentY, imgWidth, imgHeight);
            currentY += imgHeight + 25;
        } catch (err) {
            console.error("Error capturing SN chart:", err);
            doc.setFontSize(10);
            doc.setTextColor(255, 0, 0);
            doc.text("[Error al generar gráfica SN]", 14, currentY);
            currentY += 10;
        }
    }

    if (chartLayers) {
        try {
            // Add Chart Title
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.text("Alternativas Estructurales de Pavimento", pageWidth / 2, currentY, { align: 'center' });
            currentY += 12;

            const canvas = await html2canvas(chartLayers, { 
                scale: 1.5, // Slightly lower scale for better compatibility
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: true,
                width: chartLayers.offsetWidth,
                height: chartLayers.offsetHeight
            });
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = pageWidth - 40;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            const xPos = (pageWidth - imgWidth) / 2;
            
            if (currentY + imgHeight > doc.internal.pageSize.getHeight() - 20) {
                doc.addPage();
                currentY = 20;
                doc.setFontSize(16);
                doc.setFont("helvetica", "bold");
                doc.text("Alternativas Estructurales de Pavimento - Cont.", pageWidth / 2, currentY, { align: 'center' });
                currentY += 12;
            }
            
            doc.addImage(imgData, 'PNG', xPos, currentY, imgWidth, imgHeight);
        } catch (err) {
            console.error("Error capturing layers chart:", err);
            doc.setFontSize(10);
            doc.setTextColor(255, 0, 0);
            doc.text("[Error al generar gráfica de capas]", 14, currentY);
        }
    }

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
                    formatNum(l.a, 2),
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

    addStructureToPdf(titleActual, structureActual, 1);
    addStructureToPdf(titleAlt1, structureAlt1, 2);
    addStructureToPdf(titleAlt2, structureAlt2, 3);
    addStructureToPdf(titleAlt3, structureAlt3, 4);

    const fileName = genData.projectName 
        ? `${genData.projectName.replace(/[/\\?%*:|"<>]/g, '-')}.pdf` 
        : "Memoria_Diseño_Pavimento.pdf";
    doc.save(fileName);
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

      {/* Comparative Chart Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 mb-12 shadow-sm overflow-hidden">
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <i className="fas fa-chart-bar text-blue-600"></i> Cuadro Comparativo de Alternativas
          </h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Chart */}
              <div id="chart-sn" className="h-[300px] sm:h-[350px] w-full bg-white p-4">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                          data={[
                              { name: titleActual, sn: structureActual.snTotalProvided, color: '#94a3b8' },
                              { name: titleAlt1, sn: structureAlt1.snTotalProvided, color: '#0ea5e9' },
                              { name: titleAlt2, sn: structureAlt2.snTotalProvided, color: '#8b5cf6' },
                              { name: titleAlt3, sn: structureAlt3.snTotalProvided, color: '#f59e0b' },
                          ]}
                          margin={{ top: 30, right: 50, left: 20, bottom: 60 }}
                      >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                              dataKey="name" 
                              axisLine={{ stroke: '#000', strokeWidth: 1.5 }} 
                              tickLine={{ stroke: '#000' }} 
                              tick={{ fill: '#000', fontSize: 14, fontWeight: '600' }}
                              interval={0}
                              padding={{ left: 10, right: 10 }}
                              dy={12}
                              label={{ value: 'Alternativas', position: 'insideBottom', offset: -35, style: { fill: '#000', fontSize: 14, fontWeight: 'bold' } }}
                          />
                          <YAxis 
                              axisLine={{ stroke: '#000', strokeWidth: 1.5 }} 
                              tickLine={{ stroke: '#000' }} 
                              tick={{ fill: '#000', fontSize: 12 }}
                              width={50}
                              label={{ value: 'SN Total', angle: -90, position: 'insideLeft', style: { fill: '#000', fontSize: 12, textAnchor: 'middle', fontWeight: 'bold' } }}
                          />
                          <Tooltip 
                              cursor={{ fill: '#f8fafc' }}
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          />
                          <ReferenceLine 
                              y={snRequiredTotalManual} 
                              stroke="#ef4444" 
                              strokeDasharray="5 5" 
                              label={{ position: 'top', value: `Req: ${formatNum(snRequiredTotalManual, 2)}`, fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }} 
                          />
                          <Bar dataKey="sn" radius={[4, 4, 0, 0]} barSize={45} isAnimationActive={false}>
                              {
                                [
                                    { name: titleActual, sn: structureActual.snTotalProvided, color: '#94a3b8' },
                                    { name: titleAlt1, sn: structureAlt1.snTotalProvided, color: '#0ea5e9' },
                                    { name: titleAlt2, sn: structureAlt2.snTotalProvided, color: '#8b5cf6' },
                                    { name: titleAlt3, sn: structureAlt3.snTotalProvided, color: '#f59e0b' },
                                ].map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#000" strokeWidth={1} />
                                ))
                              }
                          </Bar>
                      </BarChart>
                  </ResponsiveContainer>
              </div>

              {/* Summary Table */}
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="inline-block min-w-full align-middle">
                      <table className="min-w-full text-sm text-left">
                          <thead className="text-[10px] sm:text-xs text-slate-400 uppercase bg-slate-50">
                              <tr>
                                  <th className="px-4 py-3">Alternativa</th>
                                  <th className="px-4 py-3 text-right">SN Total</th>
                                  <th className="px-4 py-3 text-right">W18 Soportado</th>
                                  <th className="px-4 py-3 text-right">Vida (Años)</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {[
                                  { name: titleActual, data: structureActual, color: 'bg-slate-400' },
                                  { name: titleAlt1, data: structureAlt1, color: 'bg-sky-500' },
                                  { name: titleAlt2, data: structureAlt2, color: 'bg-violet-500' },
                                  { name: titleAlt3, data: structureAlt3, color: 'bg-amber-500' },
                              ].map((alt, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                      <td className="px-4 py-3 font-medium text-slate-700 flex items-center gap-2">
                                          <span className={`w-2 h-2 rounded-full shrink-0 ${alt.color}`}></span>
                                          <span className="truncate">{alt.name}</span>
                                      </td>
                                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                                          {formatNum(alt.data.snTotalProvided, 2)}
                                      </td>
                                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                                          {formatNum(alt.data.esalsForSnTotal, 0)}
                                      </td>
                                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                                          {formatNum(alt.data.remainingLifeYears, 1)}
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg text-[11px] text-blue-700 leading-relaxed">
                      <i className="fas fa-info-circle mr-1"></i>
                      El <strong>SN Requerido</strong> para el diseño es de <strong>{formatNum(snRequiredTotalManual, 2)}</strong>. 
                      Las alternativas que superen este valor cumplen con la vida de diseño proyectada ({genData.designPeriod} años).
                  </div>
              </div>
          </div>

      {/* Structural Comparison Chart (Stacked Layers) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 mb-12 shadow-sm overflow-hidden">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-700 mb-8 text-center">
              Alternativas estructurales de pavimento
          </h3>
          
          <div id="chart-layers" className="h-[450px] w-full bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                      data={(() => {
                          const structures = [
                              { name: titleActual, data: structureActual, borderColor: '#000' },
                              { name: titleAlt1, data: structureAlt1, borderColor: '#000' },
                              { name: titleAlt2, data: structureAlt2, borderColor: '#000' },
                              { name: titleAlt3, data: structureAlt3, borderColor: '#000' },
                          ];

                          const getLayerColor = (name: string) => {
                              const n = name.toLowerCase();
                              if (n.includes('subrasante')) return '#f0b084';
                              if (n.includes('base hidráulica') || n.includes('base hidraulica')) return '#8da9d4';
                              if (n.includes('recuperación') || n.includes('recuperacion') || n.includes('base estabilizada') || n.includes('base asfáltica') || n.includes('base asfaltica')) return '#a349a4';
                              if (n.includes('base emulsión') || n.includes('base emulsion')) return '#3d3d3d';
                              if (n.includes('carpeta') || n.includes('asfáltica') || n.includes('asfaltica')) return '#3d3d3d';
                              if (n.includes('rodadura') || n.includes('sello')) return '#7d3c11';
                              return '#cbd5e1';
                          };

                          return structures.map(s => {
                              const obj: any = { name: s.name, borderColor: s.borderColor };
                              let vizLayers: { name: string; h: number; color: string }[] = [];
                              
                              const layers = s.data.layers.filter(l => l.name.toLowerCase() !== 'subrasante').reverse();
                              
                              layers.forEach((l, idx) => {
                                  let h = l.h_cm_real;
                                  if (s.name === 'Riego de sello' && (l.name.toLowerCase().includes('rodadura') || l.name.toLowerCase().includes('sello'))) {
                                      h = 2;
                                  }
                                  
                                  let color = getLayerColor(l.name);
                                  if (s.name !== 'Actual' && idx === layers.length - 1) {
                                      color = '#7d3c11';
                                  }
                                  
                                  vizLayers.push({ name: l.name, h: h, color: color });
                              });

                              vizLayers.forEach((l, i) => {
                                  obj[`l${i}`] = l.h;
                                  obj[`l${i}Name`] = l.name;
                                  obj[`l${i}Color`] = l.color;
                              });
                              return obj;
                          });
                      })()}
                      margin={{ top: 40, right: 30, left: 10, bottom: 60 }}
                      barCategoryGap="35%"
                  >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                          dataKey="name" 
                          axisLine={{ stroke: '#000', strokeWidth: 1.5 }} 
                          tickLine={{ stroke: '#000' }} 
                          tick={{ fill: '#000', fontSize: 16, fontWeight: '500' }}
                          interval={0}
                          dy={12}
                      />
                      <YAxis 
                          axisLine={{ stroke: '#000', strokeWidth: 1.5 }} 
                          tickLine={{ stroke: '#000' }} 
                          tick={{ fill: '#000', fontSize: 14 }}
                          width={45}
                          domain={[0, 40]}
                          ticks={[0, 5, 10, 15, 20, 25, 30, 35, 40]}
                           label={{ value: 'Espesor (cm)', angle: -90, position: 'insideLeft', style: { fill: '#000', fontSize: 12, textAnchor: 'middle', fontWeight: 'bold' } }}
                      />
                      <Tooltip 
                          cursor={{ fill: '#f8fafc', opacity: 0.4 }}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          formatter={(value: any, name: string, props: any) => {
                              if (!props || !props.payload) return [`${value} cm`, name];
                              const layerName = props.payload[`${props.dataKey}Name`] || name;
                              return [`${value} cm`, layerName];
                          }}
                      />

                      <ReferenceLine 
                          y={structureActual.layers.filter(l => l.name.toLowerCase() !== 'subrasante').reduce((acc, l) => acc + (l.h_cm_real || 0), 0)} 
                          stroke="#64748b" 
                          strokeDasharray="5 5" 
                          strokeWidth={1.5}
                          label={{ 
                              value: 'Rasante actual', 
                              position: 'top', 
                              fill: '#000', 
                              fontSize: 12, 
                              fontWeight: 'bold',
                              offset: 15
                          }} 
                      />
                      
                      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                          <Bar 
                              key={i} 
                              dataKey={`l${i}`} 
                              stackId="a" 
                              isAnimationActive={false}
                          >
                              {(() => {
                                  const structures = [
                                      { name: 'Actual', data: structureActual, borderColor: '#000' },
                                      { name: 'REC+CA', data: structureAlt1, borderColor: '#000' },
                                      { name: 'Fresado+CA', data: structureAlt2, borderColor: '#000' },
                                      { name: 'Riego sello', data: structureAlt3, borderColor: '#000' },
                                  ];
                                  
                                  const getLayerColor = (name: string) => {
                                      const n = name.toLowerCase();
                                      if (n.includes('subrasante')) return '#f0b084';
                                      if (n.includes('base hidráulica') || n.includes('base hidraulica')) return '#8da9d4';
                                      if (n.includes('recuperación') || n.includes('recuperacion') || n.includes('base estabilizada') || n.includes('base asfáltica') || n.includes('base asfaltica')) return '#a349a4';
                                      if (n.includes('base emulsión') || n.includes('base emulsion')) return '#3d3d3d';
                                      if (n.includes('carpeta') || n.includes('asfáltica') || n.includes('asfaltica')) return '#3d3d3d';
                                      if (n.includes('rodadura') || n.includes('sello')) return '#7d3c11';
                                      return '#cbd5e1';
                                  };

                                  return structures.map((s, idx) => {
                                      let vizLayers: { name: string; color: string }[] = [];
                                      const layers = s.data.layers.filter(l => l.name.toLowerCase() !== 'subrasante').reverse();
                                      layers.forEach((l, lIdx) => {
                                          let color = getLayerColor(l.name);
                                          if (s.name !== 'Actual' && lIdx === layers.length - 1) {
                                              color = '#7d3c11';
                                          }
                                          vizLayers.push({ name: l.name, color: color });
                                      });
                                      
                                      const color = vizLayers[i]?.color || '#cbd5e1';
                                      // Apply border color from alternative
                                      return <Cell key={idx} fill={color} stroke="#000" strokeWidth={1} />;
                                  });
                              })()}
                          </Bar>
                      ))}
                      
                      <Legend 
                          verticalAlign="bottom" 
                          height={40}
                          content={() => (
                              <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 mt-6">
                                  <div className="flex items-center gap-2">
                                      <div className="w-4 h-4 border border-black bg-[#8da9d4]"></div>
                                      <span className="text-sm text-slate-700">Base hidráulica</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <div className="w-4 h-4 border border-black bg-[#a349a4]"></div>
                                      <span className="text-sm text-slate-700">Base estabilizada</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <div className="w-4 h-4 border border-black bg-[#3d3d3d]"></div>
                                      <span className="text-sm text-slate-700">Carpeta CA</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <div className="w-4 h-4 border border-black bg-[#7d3c11]"></div>
                                      <span className="text-sm text-slate-700">Capa de rodadura</span>
                                  </div>
                              </div>
                          )}
                      />
                  </BarChart>
              </ResponsiveContainer>
          </div>
      </div>

      {/* Layer Structure Tables */}
      <div className="space-y-12">
          {/* 1. Estructura Actual */}
          <StructureTable 
            title={titleActual} 
            onTitleChange={setTitleActual}
            data={structureActual} 
            genData={genData} 
            handleRealThicknessChange={handleRealThicknessChange}
            formatNum={formatNum}
          />

          {/* 2. Alternativa 1: Recuperación + CA */}
          <StructureTable 
            title={titleAlt1} 
            onTitleChange={setTitleAlt1}
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
            title={titleAlt2} 
            onTitleChange={setTitleAlt2}
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
            title={titleAlt3} 
            onTitleChange={setTitleAlt3}
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
                                  onChange={(e) => setCalcLayerData(prev => prev ? ({ ...prev, a: Math.round((parseFloat(e.target.value) || 0) * 100) / 100 }) : null)}
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