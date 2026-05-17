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
import { calculateUnamTotalAccumulated, calculateAFromMR, calculateMRFromA, getLayerFormulaType } from '../utils/calculations';

const DEFAULT_ALT1_LAYERS: PavementLayer[] = [];

const DEFAULT_ALT2_LAYERS: PavementLayer[] = [];

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
    onOpenCalc,
    onClone,
    onClearAlternatives,
    mode = 'alternative'
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
    onClone?: () => void;
    onClearAlternatives?: () => void;
    mode?: 'actual' | 'alternative';
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
                        className={`w-full font-bold text-slate-900 text-lg bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500 rounded px-1 transition-all ${mode === 'actual' ? 'pointer-events-none' : ''}`}
                        placeholder="Nombre de la estructura"
                        readOnly={mode === 'actual'}
                    />
                </div>
                <div className="flex items-center gap-2">
                    {onClone && (
                        <div className="flex gap-2">
                             <button 
                                onClick={onClone}
                                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                                title="Clonar esta estructura para crear una nueva alternativa"
                            >
                                <i className="fas fa-copy"></i>
                                <span>Clonar Pavimento Actual</span>
                            </button>
                            {onClearAlternatives && (
                                <button 
                                    onClick={onClearAlternatives}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-lg transition-all border border-red-200"
                                    title="Eliminar todas las alternativas propuestas"
                                >
                                    <i className="fas fa-trash-alt"></i>
                                    <span>Eliminar Alternativas</span>
                                </button>
                            )}
                        </div>
                    )}
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
            </div>
            <div className="p-4">
                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-600">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-100">
                            <tr>
                                <th className="px-4 py-3">Capa</th>
                                <th className="px-4 py-3 text-center">A</th>
                                <th className="px-4 py-3 text-right">E(psi)</th>
                                <th className="px-4 py-3 text-right font-bold text-slate-900 w-32">Espesor (cm)</th>
                                <th className="px-4 py-3 text-right text-emerald-600">SN Aportado</th>
                                {isEditable && <th className="px-4 py-3 text-right">Acciones</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {layers.map((layer: any) => (
                                <tr key={layer.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {(() => {
                                                const cat = LAYER_CATALOG.find(c => c.name === layer.name);
                                                return <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: layer.customCode ? '#94a3b8' : (cat?.color || '#cbd5e1') }}></div>;
                                            })()}
                                            {isEditable ? (
                                                 <select 
                                                     value={layer.customCode ? CUSTOM_LAYER_NAME : layer.name} 
                                                     onChange={(e) => onLayerChange?.(layer.id, 'name', e.target.value)}
                                                     className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none font-medium text-slate-900"
                                                 >
                                                     {LAYER_CATALOG.map(cat => (
                                                         <option key={cat.name} value={cat.name}>
                                                             {cat.name === CUSTOM_LAYER_NAME && layer.customCode 
                                                                 ? `${layer.name} (${layer.customCode})` 
                                                                 : (cat.code && cat.code !== '??' ? `[${cat.code}] ${cat.name}` : cat.name)}
                                                         </option>
                                                     ))}
                                                 </select>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-slate-900">{layer.name}</span>
                                                    {layer.customCode ? (
                                                        <span className="text-[9px] bg-purple-100 text-purple-700 px-1 rounded font-bold">{layer.customCode}</span>
                                                    ) : (
                                                        (() => {
                                                            const cat = LAYER_CATALOG.find(c => c.name === layer.name);
                                                            if (cat && cat.code && cat.code !== '??') {
                                                                return <span className="text-[9px] bg-slate-200 text-slate-700 px-1 rounded font-bold">{cat.code}</span>;
                                                            }
                                                            return null;
                                                        })()
                                                    )}
                                                </div>
                                            )}
                                        </div>
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
                                    <td className="px-4 py-3">
                                        {mode === 'actual' ? (
                                            <div className="text-right font-bold text-slate-900 pr-2">{formatNum(layer.h_cm_real, 1)}</div>
                                        ) : (
                                            <input
                                                type="number"
                                                value={layer.h_cm_real}
                                                onChange={(e) => handleRealThicknessChange(layer.id, e.target.value)}
                                                className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-right text-slate-900 font-bold focus:border-blue-500 outline-none"
                                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                            />
                                        )}
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
                                <td className="px-4 py-3 text-right text-emerald-600">
                                    SN Total: {formatNum(snTotalProvided)}
                                </td>
                                {isEditable && <td></td>}
                            </tr>
                            <tr className="bg-white border-t border-slate-200">
                                <td colSpan={5} className="px-4 py-4 text-right text-slate-500 font-medium">
                                    ESAL's Soportados por la Estructura (W18):
                                </td>
                                <td colSpan={1} className="px-4 py-4 text-right text-blue-600 font-mono text-xl">
                                    {formatNum(esalsForSnTotal, 0)}
                                </td>
                                {isEditable && <td></td>}
                            </tr>
                            <tr className="bg-white border-t border-slate-200">
                                <td colSpan={5} className="px-4 py-4 text-right text-slate-500 font-medium">
                                    Vida Remanente Estimada:
                                </td>
                                <td colSpan={1} className="px-4 py-4 text-right text-emerald-600 font-mono text-xl">
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
                                        <span>Espesor (cm):</span>
                                        <span className="text-slate-900 font-bold">{formatNum(layer.h_cm_real, 1)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>A:</span>
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
                                </div>

                                <div className="flex items-center gap-4 pt-2 border-t border-slate-50">
                                    <div className="flex-1">
                                        <div className="text-[9px] text-slate-400 uppercase">Espesor</div>
                                        {mode === 'actual' ? (
                                            <div className="text-xs font-bold text-slate-900">{formatNum(layer.h_cm_real, 1)} cm</div>
                                        ) : (
                                            <input
                                                type="number"
                                                value={layer.h_cm_real}
                                                onChange={(e) => handleRealThicknessChange(layer.id, e.target.value)}
                                                className="w-full bg-slate-50 border border-slate-200 rounded px-1 py-1 text-center text-slate-900 font-bold text-xs"
                                            />
                                        )}
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

interface PavementAlternative {
    id: string;
    title: string;
    layers: PavementLayer[];
}

const EsalsPage: React.FC = () => {
  // Inputs for AASHTO Design
  const [snSeed, setSnSeed] = useState<number>(2.0); 
  const [manualThicknesses, setManualThicknesses] = useState<Record<string, number>>({});
  const [alternatives, setAlternatives] = useState<PavementAlternative[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // -- Custom Titles for Structures --
  const [titleActual, setTitleActual] = useState("PAV. Actual");

  // -- Custom Layer Modal State --
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingAltId, setEditingAltId] = useState<string | null>(null);
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
  const [calcAltId, setCalcAltId] = useState<string | null>(null);

  const handleOpenAltCalc = (layer: PavementLayer, altId: string) => {
      setCalcLayerData({ ...layer });
      setCalcAltId(altId);
      setIsCalcModalOpen(true);
  };

  const handleApplyAltCalc = () => {
      if (!calcLayerData || !calcAltId) return;
      setAlternatives(prev => prev.map(alt => {
          if (alt.id !== calcAltId) return alt;
          return {
              ...alt,
              layers: alt.layers.map(l => l.id === calcLayerData.id ? calcLayerData : l)
          };
      }));
      setIsCalcModalOpen(false);
  };

  const handleAddAltLayer = (altId: string) => {
      const defaultRigidity = genData.rigidityLevel || 'medium';
      const defaultLayer = LAYER_CATALOG[0];
      const defaultValues = defaultLayer.values[defaultRigidity];

      const newLayer: PavementLayer = {
          id: `alt_${altId}_l${Date.now()}`,
          name: defaultLayer.name,
          mr: defaultValues.mr,
          a: defaultValues.a,
          m: 1.0
      };
      setAlternatives(prev => prev.map(alt => {
          if (alt.id !== altId) return alt;
          return { ...alt, layers: [newLayer, ...alt.layers] };
      }));
  };

  const handleRemoveAltLayer = (layerId: string, altId: string) => {
      setAlternatives(prev => prev.map(alt => {
          if (alt.id !== altId) return alt;
          return { ...alt, layers: alt.layers.filter(l => l.id !== layerId) };
      }));
  };

  const handleClone = (sourceLayers: any[], sourceTitle: string) => {
      const newAltId = `alt_${Date.now()}`;
      
      // We need to map the layers to new IDs to avoid collisions
      const newLayers = sourceLayers.map((l, idx) => ({
          id: `${newAltId}_${idx}`,
          name: l.name,
          mr: l.mr,
          a: l.a,
          m: l.m,
          h_cm_existing: l.h_cm_existing,
          customCode: l.customCode
      }));

      const newManualThicknesses = { ...manualThicknesses };
      sourceLayers.forEach((l, idx) => {
          const newId = newLayers[idx].id;
          // Use the real thickness that was displayed in the source table
          // This ensures that cloned alternatives match exactly what the user sees
          newManualThicknesses[newId] = l.h_cm_real;
      });

      setManualThicknesses(newManualThicknesses);
      
      const newAlt: PavementAlternative = {
          id: newAltId,
          title: `Alt. ${alternatives.length + 1} (${sourceTitle})`,
          layers: newLayers
      };

      setAlternatives(prev => [...prev, newAlt]);
      
      // Scroll to bottom after a short delay
      setTimeout(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
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
            
            setAlternatives(parsed.alternatives || []);
            setManualThicknesses(parsed.manualThicknesses || {});
            
            if (parsed.titleActual) setTitleActual(parsed.titleActual);
            if (parsed.showComparison !== undefined) setShowComparison(parsed.showComparison);
        } catch (e) { console.error(e); }
    } else {
        setSnSeed(currentGen.snSeed || 4.0);
        setAlternatives([]);
    }
  }, []);

  const handleSaveCalculations = () => {
      const dataToSave = { 
          snSeed, 
          manualThicknesses, 
          alternatives,
          titleActual,
          showComparison
      };
      localStorage.setItem('esalsData', JSON.stringify(dataToSave));
      
      // Also update the global snSeed in datosGeneralesData for other pages
      const savedGen = localStorage.getItem('datosGeneralesData');
      if (savedGen) {
          try {
              const currentGen = JSON.parse(savedGen);
              currentGen.snSeed = snSeed;
              localStorage.setItem('datosGeneralesData', JSON.stringify(currentGen));
          } catch (e) { console.error(e); }
      }

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
  const calculateStructure = (layers: PavementLayer[], isActual = false) => {
      let accumulatedSN = 0;
      const asphaltLayerNames = ["Carpeta asfáltica alto desempeño", "Carpeta asfáltica normal", "Base asfáltica", "Carpeta asfáltica nueva", "Base asfáltica nueva"];
      
      const processedLayers = layers.map((layer, index) => {
          const isLast = index === layers.length - 1;
          const supportMr = isLast ? genData.subgradeMr : layers[index + 1].mr;
          const snRequiredForSupport = solveAashtoIterative(supportMr, totalESALsDesign);
          let snNeededFromLayer = Math.max(0, snRequiredForSupport - accumulatedSN);
          
          const cat = LAYER_CATALOG.find(c => c.name === layer.name);
          const m = (cat?.code === 'BH' || cat?.code === 'SB') 
            ? (genData.drainageCoefficient || 0.9) 
            : 1.0;
          
          const h_in_calc = (layer.a * m) > 0 ? snNeededFromLayer / (layer.a * m) : 0;
          const h_cm_calc = h_in_calc * 2.54;
          const manualVal = manualThicknesses[layer.id];
          
          // For actual pavement, we use h_cm_existing. 
          // For alternatives, we use manualVal or calculated.
          const h_cm_real = isActual 
            ? (layer.h_cm_existing || 0)
            : (manualVal !== undefined ? manualVal : Math.ceil(h_cm_calc * 2) / 2);

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

  const structureActual = useMemo(() => calculateStructure(genData.layers, true), [genData.layers, genData.subgradeMr, genData.drainageCoefficient, totalESALsDesign, manualThicknesses, totalESALs1Year]);
  const structuresAlternatives = useMemo(() => alternatives.map(alt => ({
      ...alt,
      data: calculateStructure(alt.layers)
  })), [alternatives, genData.subgradeMr, genData.drainageCoefficient, totalESALsDesign, manualThicknesses, totalESALs1Year]);

  const handleRealThicknessChange = (layerId: string, val: string) => {
    const num = parseFloat(val);
    const newThickness = isNaN(num) ? 0 : num;

    setManualThicknesses(prev => ({ ...prev, [layerId]: newThickness }));
  };

  const handleAltLayerChange = (altId: string, layerId: string, field: keyof PavementLayer, value: any) => {
      // Intercept Name Change for Custom Layer
      if (field === 'name' && value === CUSTOM_LAYER_NAME) {
          setEditingLayerId(layerId);
          setEditingAltId(altId);
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

      setAlternatives(prev => prev.map(alt => {
          if (alt.id !== altId) return alt;
          return {
              ...alt,
              layers: alt.layers.map(l => {
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
              })
          };
      }));
  };

  const handleSaveCustomAltLayer = () => {
      if (!editingLayerId || !editingAltId) return;

      setAlternatives(prev => prev.map(alt => {
          if (alt.id !== editingAltId) return alt;
          return {
              ...alt,
              layers: alt.layers.map(l => {
                  if (l.id !== editingLayerId) return l;
                  return {
                      ...l,
                      name: customLayerForm.name || CUSTOM_LAYER_NAME,
                      mr: customLayerForm.mr,
                      a: Math.round(customLayerForm.a * 100) / 100,
                      m: customLayerForm.m,
                      customCode: customLayerForm.code.toUpperCase().substring(0, 2)
                  };
              })
          };
      }));
      setIsModalOpen(false);
  };

  const handleSyncSeed = () => {
    setSnSeed(Number(snRequiredTotalManual.toFixed(2)));
  };

  const chartData = useMemo(() => [
    { name: titleActual, sn: structureActual.snTotalProvided },
    ...structuresAlternatives.map(alt => ({ name: alt.title, sn: alt.data.snTotalProvided }))
  ], [titleActual, structureActual.snTotalProvided, structuresAlternatives]);

  const structuralChartData = useMemo(() => {
    return [
      { 
        name: titleActual, 
        totalThickness: structureActual.layers.reduce((sum, l) => sum + l.h_cm_real, 0),
        ...structureActual.layers.reduce((acc, l, i) => {
            const cat = LAYER_CATALOG.find(c => c.name === l.name);
            const code = l.customCode || (cat ? cat.code : '??');
            return { ...acc, [`layer_${i}`]: l.h_cm_real, [`layer_${i}_name`]: l.name, [`layer_${i}_code`]: code };
        }, {})
      },
      ...structuresAlternatives.map(alt => ({
        name: alt.title,
        totalThickness: alt.data.layers.reduce((sum, l) => sum + l.h_cm_real, 0),
        ...alt.data.layers.reduce((acc, l, i) => {
            const cat = LAYER_CATALOG.find(c => c.name === l.name);
            const code = l.customCode || (cat ? cat.code : '??');
            return { ...acc, [`layer_${i}`]: l.h_cm_real, [`layer_${i}_name`]: l.name, [`layer_${i}_code`]: code };
        }, {})
      }))
    ];
  }, [titleActual, structureActual.layers, structuresAlternatives]);

  const actualTotalThickness = structuralChartData[0]?.totalThickness || 0;

  const getLayerColor = (name: string) => {
    const layer = LAYER_CATALOG.find(l => l.name === name);
    if (layer && layer.color) return layer.color;
    
    // Fallback for custom or unknown layers
    const n = name.toLowerCase();
    if (n.includes("carpeta") || n.includes("asfáltica")) return "#334155"; 
    if (n.includes("base") && !n.includes("subbase")) return "#64748b"; 
    if (n.includes("subbase")) return "#94a3b8"; 
    return "#cbd5e1"; 
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
    
    const comparisonRows = [
        [titleActual, formatNum(structureActual.snTotalProvided, 2), formatNum(structureActual.esalsForSnTotal, 0), formatNum(structureActual.remainingLifeYears, 1), structureActual.snTotalProvided >= snRequiredTotalManual ? 'SI' : 'NO'],
        ...structuresAlternatives.map(alt => [
            alt.title, 
            formatNum(alt.data.snTotalProvided, 2), 
            formatNum(alt.data.esalsForSnTotal, 0), 
            formatNum(alt.data.remainingLifeYears, 1), 
            alt.data.snTotalProvided >= snRequiredTotalManual ? 'SI' : 'NO'
        ])
    ];

    autoTable(doc, {
        startY: 28,
        head: [['Alternativa', 'SN Total', 'W18 Soportado', 'Vida (Años)', 'Cumple']],
        body: comparisonRows,
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85] },
        columnStyles: {
            4: { fontStyle: 'bold' }
        }
    });

    // Add Charts to PDF if visible
    const chartSn = document.getElementById('chart-sn');
    const chartStructural = document.getElementById('chart-structural');
    
    currentY = (doc as any).lastAutoTable.finalY + 20;

    const addChartToPdf = async (element: HTMLElement, title: string) => {
        try {
            if (currentY > doc.internal.pageSize.getHeight() - 100) {
                doc.addPage();
                currentY = 20;
            }

            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 41, 59);
            doc.text(title, pageWidth / 2, currentY, { align: 'center' });
            currentY += 12;

            const canvas = await html2canvas(element, { 
                scale: 1.5,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                allowTaint: true,
                width: element.offsetWidth,
                height: element.offsetHeight
            });
            const imgData = canvas.toDataURL('image/png');
            const imgWidth = pageWidth - 40;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            const xPos = (pageWidth - imgWidth) / 2;
            
            doc.addImage(imgData, 'PNG', xPos, currentY, imgWidth, imgHeight);
            currentY += imgHeight + 20;
        } catch (err) {
            console.error(`Error capturing chart ${title}:`, err);
        }
    };

    if (chartSn) {
        await addChartToPdf(chartSn, "Cuadro Comparativo de Alternativas (SN)");
    }

    if (chartStructural) {
        await addChartToPdf(chartStructural, "Comparativa de Espesores de Estructura (cm)");
    }

    // 5. Structure Alternatives
    const addStructureToPdf = (title: string, data: any, index: number) => {
        doc.addPage();
        doc.setFontSize(16);
        doc.text(`5.${index} ${title}`, 14, 20);
        
        autoTable(doc, {
            startY: 25,
            head: [['Capa', 'a', 'E(psi)', 'Espesor (cm)', 'SN Aportado']],
            body: [
                ...data.layers.map((l: any) => [
                    l.name,
                    formatNum(l.a, 2),
                    formatNum(l.mr, 0),
                    formatNum(l.h_cm_real, 1),
                    formatNum(l.snProvided, 2)
                ]),
                ['Subrasante', '-', formatNum(genData.subgradeMr, 0), '-', '-']
            ],
            foot: [[
                'TOTAL', '', '', '', formatNum(data.snTotalProvided, 2)
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
    structuresAlternatives.forEach((alt, idx) => {
        addStructureToPdf(alt.title, alt.data, idx + 2);
    });

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
                 <label className="block text-sm text-slate-500 mb-1">SN (Número Estructural Sugerido)</label>
                 <div className="flex items-center gap-4">
                     <input
                        type="number"
                        value={snSeed}
                        onChange={(e) => setSnSeed(parseFloat(e.target.value))}
                        step="0.1"
                        className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 focus:border-blue-500 outline-none"
                     />
                     <div className="text-xs text-slate-400">
                        Valor inicial para el cálculo de aportes.
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

      {/* 3. Estructuración de Capas */}
      <div id="estructuracion" className="space-y-8 mt-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                  <h2 className="text-2xl font-bold text-slate-900">Estructuración de Capas</h2>
                  <p className="text-slate-500">Propuesta de espesores para cumplir con el SN Requerido</p>
              </div>
              <div className="flex items-center gap-3">
                  <button 
                      onClick={handleSyncSeed}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95"
                  >
                      <i className="fas fa-sync-alt"></i>
                      <span>Igualar SN Semilla con SN Req.</span>
                  </button>
              </div>
          </div>

          {/* Actual Pavement Structure */}
          <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                      <i className="fas fa-road"></i>
                  </div>
                  <h3>Pavimento Actual</h3>
              </div>
              <StructureTable 
                  title={titleActual}
                  onTitleChange={setTitleActual}
                  data={structureActual}
                  genData={genData}
                  handleRealThicknessChange={handleRealThicknessChange}
                  formatNum={formatNum}
                  mode="actual"
                  onClone={() => handleClone(structureActual.layers, titleActual)}
                  onClearAlternatives={() => {
                      if (window.confirm("¿Está seguro de que desea eliminar todas las alternativas de estructuración?")) {
                          setAlternatives([]);
                          // Limpiar manualThicknesses que no pertenecen al pavimento actual
                          const actualLayerIds = new Set(genData.layers.map(l => l.id));
                          setManualThicknesses(prev => {
                              const next: Record<string, number> = {};
                              Object.keys(prev).forEach(key => {
                                  if (actualLayerIds.has(key)) {
                                      next[key] = prev[key];
                                  }
                              });
                              return next;
                          });
                      }
                  }}
              />
          </div>

          {/* Dynamic Alternatives */}
          {structuresAlternatives.map((alt, index) => (
              <div key={alt.id} className="space-y-4 pt-8 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                              <span className="text-xs">{index + 1}</span>
                          </div>
                          <h3>Alternativa {index + 1}</h3>
                      </div>
                      <button 
                          onClick={() => setAlternatives(prev => prev.filter(a => a.id !== alt.id))}
                          className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1 px-3 py-1 hover:bg-red-50 rounded-lg transition-colors"
                      >
                          <i className="fas fa-trash-alt"></i>
                          <span>Eliminar</span>
                      </button>
                  </div>
                  <StructureTable 
                      title={alt.title}
                      onTitleChange={(newTitle) => setAlternatives(prev => prev.map(a => a.id === alt.id ? { ...a, title: newTitle } : a))}
                      data={alt.data}
                      genData={genData}
                      handleRealThicknessChange={handleRealThicknessChange}
                      formatNum={formatNum}
                      isEditable={true}
                      mode="alternative"
                      onLayerChange={(layerId, field, val) => handleAltLayerChange(alt.id, layerId, field, val)}
                      onAddLayer={() => handleAddAltLayer(alt.id)}
                      onRemoveLayer={(layerId) => handleRemoveAltLayer(layerId, alt.id)}
                      onOpenCalc={(layer) => handleOpenAltCalc(layer, alt.id)}
                      onClone={() => handleClone(alt.data.layers, alt.title)}
                  />
              </div>
          ))}

          {/* Comparison Table Toggle */}
          <div className="pt-12 flex flex-col items-center gap-8">
              <button 
                  onClick={() => setShowComparison(!showComparison)}
                  className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg transition-all shadow-xl hover:shadow-2xl active:scale-95 ${showComparison ? 'bg-slate-800 text-white' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
              >
                  <i className={`fas ${showComparison ? 'fa-eye-slash' : 'fa-balance-scale'}`}></i>
                  <span>{showComparison ? 'Ocultar Comparativa' : 'Generar Cuadro Comparativo'}</span>
              </button>

              {showComparison && (
                  <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl">
                          <div className="p-6 bg-slate-900 text-white">
                              <h3 className="text-xl font-bold flex items-center gap-3">
                                  <i className="fas fa-table text-emerald-400"></i>
                                  Cuadro Comparativo de Alternativas
                              </h3>
                          </div>
                          <div className="overflow-x-auto">
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-slate-50 text-slate-700 uppercase text-xs font-bold border-b border-slate-200">
                                      <tr>
                                          <th className="px-6 py-4">Alternativa</th>
                                          <th className="px-6 py-4 text-center">SN Aportado</th>
                                          <th className="px-6 py-4 text-right">W18 Soportados</th>
                                          <th className="px-6 py-4 text-right">Vida (Años)</th>
                                          <th className="px-6 py-4">Capas Principales</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      <tr className="hover:bg-slate-50 transition-colors">
                                          <td className="px-6 py-4 font-bold text-slate-900">{titleActual}</td>
                                          <td className="px-6 py-4 text-center font-mono">{formatNum(structureActual.snTotalProvided)}</td>
                                          <td className="px-6 py-4 text-right font-mono text-blue-600 font-bold">{formatNum(structureActual.esalsForSnTotal, 0)}</td>
                                          <td className="px-6 py-4 text-right font-mono text-emerald-600 font-bold">{formatNum(structureActual.remainingLifeYears, 1)}</td>
                                          <td className="px-6 py-4 text-slate-500 italic text-xs">
                                              {structureActual.layers.map(l => l.name).join(', ')}
                                          </td>
                                      </tr>
                                      {structuresAlternatives.map((alt) => (
                                          <tr key={alt.id} className="hover:bg-slate-50 transition-colors">
                                              <td className="px-6 py-4 font-bold text-slate-900">{alt.title}</td>
                                              <td className="px-6 py-4 text-center font-mono">{formatNum(alt.data.snTotalProvided)}</td>
                                              <td className="px-6 py-4 text-right font-mono text-blue-600 font-bold">{formatNum(alt.data.esalsForSnTotal, 0)}</td>
                                              <td className="px-6 py-4 text-right font-mono text-emerald-600 font-bold">{formatNum(alt.data.remainingLifeYears, 1)}</td>
                                              <td className="px-6 py-4 text-slate-500 italic text-xs">
                                                  {alt.data.layers.map(l => l.name).join(', ')}
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>

                      {/* SN Comparison Chart */}
                      <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-xl" id="chart-sn">
                          <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                              <i className="fas fa-chart-bar text-blue-600"></i>
                              Comparativa de SN Aportado vs Requerido
                          </h4>
                          <div className="h-[400px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                  <BarChart
                                      data={chartData}
                                      margin={{ top: 20, right: 30, left: 20, bottom: 40 }}
                                  >
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                      <XAxis 
                                          dataKey="name" 
                                          height={60} 
                                          interval={0}
                                          tick={{ fontSize: 13, fontWeight: 600, fill: '#475569' }}
                                          angle={0}
                                          dy={5}
                                      />
                                      <YAxis 
                                          label={{ value: 'SN Aportado', angle: -90, position: 'insideLeft', offset: 0, style: { fill: '#64748b', fontSize: 12, fontWeight: 600 } }}
                                          tick={{ fontSize: 11, fill: '#64748b' }}
                                      />
                                      <Tooltip 
                                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                          cursor={{ fill: '#f8fafc' }}
                                      />
                                      <Legend verticalAlign="top" height={36} />
                                      <ReferenceLine 
                                          y={snRequiredTotalManual} 
                                          stroke="#ef4444" 
                                          strokeDasharray="5 5" 
                                          label={{ 
                                              position: 'top', 
                                              value: `SN req. = ${formatNum(snRequiredTotalManual)}`, 
                                              fill: '#ef4444', 
                                              fontSize: 14, 
                                              fontWeight: 'bold' 
                                          }} 
                                      />
                                      <Bar dataKey="sn" name="SN Aportado" radius={[6, 6, 0, 0]} barSize={110}>
                                          {chartData.map((entry, index) => (
                                              <Cell 
                                                  key={`cell-${index}`} 
                                                  fill={entry.sn >= snRequiredTotalManual ? '#10b981' : '#f59e0b'} 
                                              />
                                          ))}
                                          <LabelList 
                                              dataKey="sn" 
                                              position="top" 
                                              formatter={(val: number) => formatNum(val)}
                                              style={{ fontSize: 12, fontWeight: 'bold', fill: '#1e293b' }}
                                          />
                                      </Bar>
                                  </BarChart>
                              </ResponsiveContainer>
                          </div>
                          <div className="mt-4 flex justify-center gap-6 text-xs">
                              <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded bg-emerald-500"></div>
                                  <span className="text-slate-600 font-medium">Cumple (SN ≥ SN Req)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded bg-amber-500"></div>
                                  <span className="text-slate-600 font-medium">No Cumple (SN &lt; SN Req)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                  <div className="w-3 h-0.5 bg-red-500 border-t border-dashed border-red-500"></div>
                                  <span className="text-slate-600 font-medium">SN Requerido</span>
                              </div>
                          </div>

                          {/* Structural Comparison Chart */}
                          <div className="mt-12 bg-white border border-slate-200 rounded-2xl p-6 shadow-xl" id="chart-structural">
                              <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                                  <i className="fas fa-layer-group text-emerald-600"></i>
                                  Comparativa de Espesores de Estructura (cm)
                              </h4>
                              <div className="h-[400px] w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                      <BarChart
                                          data={structuralChartData}
                                          margin={{ top: 20, right: 30, left: 20, bottom: 40 }}
                                      >
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                          <XAxis 
                                              dataKey="name" 
                                              height={60} 
                                              interval={0}
                                              tick={{ fontSize: 13, fontWeight: 600, fill: '#475569' }}
                                              angle={0}
                                              dy={5}
                                          />
                                          <YAxis 
                                              label={{ value: 'Espesor Total (cm)', angle: -90, position: 'insideLeft', offset: 0, style: { fill: '#64748b', fontSize: 12, fontWeight: 600 } }}
                                              tick={{ fontSize: 11, fill: '#64748b' }}
                                          />
                                          <Tooltip 
                                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                              formatter={(value: number, name: string, props: any) => {
                                                  const layerName = props.payload[`${name}_name`];
                                                  return [`${value} cm`, layerName || name];
                                              }}
                                          />
                                          <ReferenceLine 
                                               y={actualTotalThickness} 
                                               stroke="#ef4444" 
                                               strokeWidth={2}
                                               label={{ 
                                                   position: 'top', 
                                                   value: 'Rasante', 
                                                   fill: '#ef4444', 
                                                   fontSize: 14, 
                                                   fontWeight: 'bold'
                                               }} 
                                          />
                                          {/* We need to render Bars for each possible layer index in reverse to show first layer at top */}
                                          {/* Assuming max 10 layers for safety */}
                                          {[...Array(10)].map((_, index) => {
                                              const i = 9 - index;
                                              return (
                                                <Bar 
                                                    key={`layer_${i}`}
                                                    dataKey={`layer_${i}`} 
                                                    stackId="a"
                                                    barSize={110}
                                                >
                                                    {structuralChartData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={getLayerColor(entry[`layer_${i}_name`] || '')} />
                                                    ))}
                                                    <LabelList 
                                                        dataKey={`layer_${i}`} 
                                                        position="center" 
                                                        content={(props: any) => {
                                                            const { x, y, width, height, value, payload } = props;
                                                            if (!payload || height < 18) return null;
                                                            
                                                            const layerName = payload[`layer_${i}_name`] || '';
                                                            const code = payload[`layer_${i}_code`] || '??';
                                                            
                                                            // SB is a light color, so we use dark text for it
                                                            const isLight = layerName.toLowerCase().includes('sub-base') || layerName.toLowerCase().includes('subbase');
                                                            const textColor = isLight ? '#1e293b' : '#ffffff';
                                                            
                                                            return (
                                                                <g>
                                                                    {/* White box for the code label */}
                                                                    <rect 
                                                                       x={x + width / 2 - 20} 
                                                                       y={y + height / 2 - 20} 
                                                                       width={40} 
                                                                       height={22} 
                                                                       fill="white" 
                                                                       stroke="#cbd5e1"
                                                                       strokeWidth={0.5}
                                                                       rx={2}
                                                                    />
                                                                    <text 
                                                                        x={x + width / 2} 
                                                                        y={y + height / 2 - 9} 
                                                                        fill="#1e293b" 
                                                                        textAnchor="middle" 
                                                                        dominantBaseline="middle" 
                                                                        fontSize={12} 
                                                                        fontWeight="bold"
                                                                    >
                                                                        {code}
                                                                    </text>
                                                                    <text 
                                                                        x={x + width / 2} 
                                                                        y={y + height / 2 + 15} 
                                                                        fill={textColor} 
                                                                        fillOpacity={0.9}
                                                                        textAnchor="middle" 
                                                                        dominantBaseline="middle" 
                                                                        fontSize={11} 
                                                                        fontWeight="bold"
                                                                    >
                                                                        {value} cm
                                                                    </text>
                                                                </g>
                                                            );
                                                        }}
                                                    />
                                                </Bar>
                                              );
                                          })}
                                          {/* Invisible bar to show the total +X thickness labels */}
                                          <Bar dataKey="totalThickness" stackId="a" fill="transparent">
                                               <LabelList 
                                                   dataKey="totalThickness" 
                                                   position="top" 
                                                   content={(props: any) => {
                                                       const { x, y, width, value, index } = props;
                                                       if (index === 0) return null;
                                                       const diff = Math.round(value - actualTotalThickness);
                                                       if (diff <= 0) return null;
                                                       return (
                                                           <text 
                                                               x={x + width / 2} 
                                                               y={y - 12} 
                                                               fill="#ef4444" 
                                                               textAnchor="middle" 
                                                               fontSize={18} 
                                                               fontWeight="bold"
                                                           >
                                                               +{diff}
                                                           </text>
                                                       );
                                                   }}
                                               />
                                          </Bar>
                                      </BarChart>
                                  </ResponsiveContainer>
                              </div>
                              <div className="mt-4 text-center text-[10px] text-slate-400 italic">
                                  * Los espesores se muestran en centímetros (cm) y están apilados por capa.
                              </div>
                          </div>
                      </div>
                  </div>
              )}
          </div>
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
                          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded border border-slate-200 font-medium text-slate-700">
                              {calcLayerData.name}
                              {(() => {
                                  const cat = LAYER_CATALOG.find(c => c.name === calcLayerData.name);
                                  return <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat?.color || '#cbd5e1' }}></div>;
                              })()}
                          </div>
                      </div>

                      <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Valores de Tabla (Rigidez)</label>
                          <div className="grid grid-cols-3 gap-2">
                              {[
                                  { val: 'low', label: 'Bajo' },
                                  { val: 'medium', label: 'Medio' },
                                  { val: 'high', label: 'Alto' }
                              ].map((opt) => (
                                  <button
                                      key={opt.val}
                                      onClick={() => {
                                          const newValues = getLayerValues(calcLayerData.name, opt.val as any);
                                          setCalcLayerData(prev => prev ? ({ ...prev, mr: newValues.mr, a: newValues.a }) : null);
                                      }}
                                      className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded border border-slate-200 text-xs font-semibold transition-colors"
                                  >
                                      {opt.label}
                                  </button>
                              ))}
                          </div>
                      </div>
                          <p className="text-[10px] text-slate-400 mt-1 italic">
                              Las fórmulas dependen del nombre (ej. "Carpeta", "Base hidráulica").
                          </p>

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