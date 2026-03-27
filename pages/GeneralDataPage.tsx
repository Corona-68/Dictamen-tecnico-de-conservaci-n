import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ScatterChart, Scatter, ZAxis } from 'recharts';
import { GeneralData, PavementLayer } from '../types';
import { DEFAULT_GENERAL_DATA, LAYER_CATALOG, CUSTOM_LAYER_NAME, DEFAULT_COMPOSITION } from '../constants';
import { calculateEjesResults, calculateEsalRows } from '../utils/calculations';

const GeneralDataPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<GeneralData>(DEFAULT_GENERAL_DATA);
  const [isSaved, setIsSaved] = useState(false);

  // -- Custom Layer Modal State --
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [customLayerForm, setCustomLayerForm] = useState({
      code: '',
      name: '',
      mr: 0,
      a: 0,
      m: 1.0
  });

  // -- FWD Calculator Modal State --
  const [isFwdModalOpen, setIsFwdModalOpen] = useState(false);
  const [fwdForm, setFwdForm] = useState({
      P: 9000, // lbs
      D: 0,    // in
      a: 5.91, // in
      sensors: [
          { r: 0, dr: 0 },
          { r: 12, dr: 0 },
          { r: 18, dr: 0 },
          { r: 24, dr: 0 },
          { r: 36, dr: 0 },
          { r: 48, dr: 0 },
          { r: 72, dr: 0 }
      ]
  });
  const [fwdResult, setFwdResult] = useState<{ mrDesign: number, snEf: number, Ep: number, sensorUsed: number } | null>(null);

  // -- ESAL Calculation State --
  const [compData, setCompData] = useState<number[]>(DEFAULT_COMPOSITION);
  const [tabularInput, setTabularInput] = useState('');

  const handleApplyTabular = () => {
    const values = tabularInput.trim().split(/[\s\t,]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (values.length === 7) {
      const newComp = [...compData];
      const indices = [0, 1, 5, 7, 14, 15, 24];
      indices.forEach((idx, i) => {
        newComp[idx] = values[i];
      });
      setCompData(newComp);
      localStorage.setItem('compVehData', JSON.stringify(newComp));
      setTabularInput('');
      alert("Composición actualizada con éxito (7 vehículos)");
    } else {
      alert("Por favor ingrese exactamente 7 valores numéricos (A, B, C2, C3, T3S2, T3S3, T3S2R4) separados por espacios o tabulaciones.");
    }
  };

  // -- Layer Property Calculator State --
  const [isCalcModalOpen, setIsCalcModalOpen] = useState(false);
  const [calcLayerData, setCalcLayerData] = useState<{ id: string, name: string, mr: number, a: number } | null>(null);

  // -- Growth Rate Calculator State --
  const [isGrowthModalOpen, setIsGrowthModalOpen] = useState(false);
  const [showGrowthGraph, setShowGrowthGraph] = useState(false);
  const [selectedGraphModel, setSelectedGraphModel] = useState<string>('Lineal');
  const [growthChartData, setGrowthChartData] = useState<{ 
      year: number, 
      actual: number, 
      pred: number,
      linear: number,
      exponential: number,
      logarithmic: number
  }[]>([]);
  const [growthForm, setGrowthForm] = useState({
      initialYear: 2010,
      tdpaValues: '6563, 6008, 6653, 6125, 5215, 6217, 6316, 6406, 6199, 6035, 6155, 5876, 5815, 5711, 5782',
      maxGrowthRate: 7, // %
  });
  const [growthResult, setGrowthResult] = useState<{
      selectedRate: number,
      method: string,
      r2: number,
      models: { name: string, rate: number, r2: number }[],
      tf: number
  } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('datosGeneralesData');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure all layers have 'm' property (migration)
        if (parsed.layers) {
            parsed.layers = parsed.layers.map((l: any) => ({ ...l, m: l.m !== undefined ? l.m : 1.0 }));
        }
        // Merge with defaults to ensure new fields exist if loading old data
        setFormData({ ...DEFAULT_GENERAL_DATA, ...parsed });
      } catch (e) {
        console.error("Error loading general data", e);
      }
    }

    const savedComp = localStorage.getItem('compVehData');
    if (savedComp) {
      try {
        setCompData(JSON.parse(savedComp));
      } catch (e) {
        console.error("Error loading composition data", e);
      }
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value
    }));
    setIsSaved(false);
  };

  const handleRadioChange = (name: keyof GeneralData, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    setIsSaved(false);
  };

  // --- Layer Logic ---

  const getLayerValues = (layerName: string, rigidity: 'low' | 'medium' | 'high') => {
    const layerData = LAYER_CATALOG.find(l => l.name === layerName);
    if (!layerData) return { mr: 0, a: 0, m: 1.0 };
    return layerData.values[rigidity];
  };

  const handleRigidityChange = (level: 'low' | 'medium' | 'high') => {
    // Update rigidity AND recalculate all existing layers EXCEPT Custom ones
    const updatedLayers = formData.layers.map(layer => {
        // If it's a custom layer (identified by name or existing customCode), don't auto-update
        if (layer.name === CUSTOM_LAYER_NAME || layer.customCode) {
            return layer;
        }

        const newValues = getLayerValues(layer.name, level);
        return { ...layer, ...newValues };
    });

    setFormData(prev => ({
        ...prev,
        rigidityLevel: level,
        layers: updatedLayers
    }));
    setIsSaved(false);
  };

  const handleAddLayer = (position: 'top' | 'bottom' = 'bottom') => {
    // Default to the first type if adding new
    const defaultType = LAYER_CATALOG[0].name;
    const values = getLayerValues(defaultType, formData.rigidityLevel);
    
    const newLayer: PavementLayer = {
        id: `l_${Date.now()}`,
        name: defaultType,
        mr: values.mr,
        a: values.a,
        m: values.m || 1.0
    };

    setFormData(prev => ({
        ...prev,
        layers: position === 'top' ? [newLayer, ...prev.layers] : [...prev.layers, newLayer]
    }));
    setIsSaved(false);
  };

  const handleLayerChange = (id: string, field: keyof PavementLayer, value: string | number) => {
    // Intercept Name Change for Custom Layer
    if (field === 'name' && value === CUSTOM_LAYER_NAME) {
        setEditingLayerId(id);
        setCustomLayerForm({
            code: '',
            name: '',
            mr: 0,
            a: 0,
            m: 1.0
        });
        setIsModalOpen(true);
        return; // Don't update state yet, wait for modal
    }

    setFormData(prev => {
        const newLayers = prev.layers.map(layer => {
            if (layer.id !== id) return layer;
            
            // If changing name to a standard layer, auto-update values
            if (field === 'name') {
                const newValues = getLayerValues(value as string, prev.rigidityLevel);
                // Clear custom code if switching back to standard
                return { 
                    ...layer, 
                    name: value as string, 
                    ...newValues,
                    customCode: undefined 
                };
            }

            return { ...layer, [field]: value };
        });
        return { ...prev, layers: newLayers };
    });
    setIsSaved(false);
  };

  const handleSaveCustomLayer = () => {
      if (!editingLayerId) return;

      setFormData(prev => ({
          ...prev,
          layers: prev.layers.map(l => {
              if (l.id !== editingLayerId) return l;
              return {
                  ...l,
                  name: customLayerForm.name || CUSTOM_LAYER_NAME,
                  mr: customLayerForm.mr,
                  a: customLayerForm.a,
                  m: customLayerForm.m,
                  customCode: customLayerForm.code.toUpperCase().substring(0, 2) // Force 2 chars upper
              };
          })
      }));
      setIsModalOpen(false);
      setIsSaved(false);
  };

  const handleRemoveLayer = (id: string) => {
      setFormData(prev => ({
          ...prev,
          layers: prev.layers.filter(l => l.id !== id)
      }));
      setIsSaved(false);
  };

  // --- FWD Calculation Logic ---
  const handleCalculateFwd = () => {
      const { P, D, a, sensors } = fwdForm;
      const dr0 = sensors.find(s => s.r === 0)?.dr;
      if (!dr0 || dr0 <= 0) {
          alert("La deflexión en el centro (r=0) debe ser mayor a cero.");
          return;
      }

      const p = P / (Math.PI * a * a);
      const K1 = 1.5 * p * a;
      const K2 = D / a;

      for (let i = 0; i < sensors.length; i++) {
          const { r, dr } = sensors[i];
          if (r === 0 || dr <= 0) continue;

          // MR calculation for sensor i
          const MR = (0.24 * P) / (dr * r);

          // Solve for K3 using dr0
          let K3 = 2.0;
          let Er = 1.0;
          let iterations = 0;
          const maxIterations = 50000;

          const calcEr = (k: number) => {
              const Ep_val = k * MR;
              const den_val = MR * Math.sqrt(1 + Math.pow(K2 * Math.pow(k, 1/3), 2));
              const num_val = 1 - (1 / Math.sqrt(1 + K2 * K2));
              return ((1 / den_val) + (num_val / Ep_val)) * K1 - dr0;
          };

          Er = calcEr(K3);
          if (Er > 0) {
              while (Er > 0.001 && iterations < maxIterations) {
                  K3 += 0.001;
                  Er = calcEr(K3);
                  iterations++;
              }
          } else if (Er < -0.001) {
              while (Er < -0.001 && K3 > 0.001 && iterations < maxIterations) {
                  K3 -= 0.001;
                  Er = calcEr(K3);
                  iterations++;
              }
          }

          const Ep = K3 * MR;
          const ae = Math.sqrt(a * a + Math.pow(D * Math.pow(K3, 1/3), 2));

          if (r >= 0.7 * ae) {
              setFwdResult({
                  mrDesign: 0.33 * MR,
                  snEf: 0.0045 * D * Math.pow(Ep, 1/3),
                  Ep,
                  sensorUsed: i
              });
              return;
          }
      }
      alert("No se encontró un sensor que cumpla la condición r >= 0.7 * ae. Verifique los datos.");
      setFwdResult(null);
  };

  const handleApplyFwd = () => {
      if (fwdResult) {
          setFormData(prev => ({ ...prev, subgradeMr: Math.round(fwdResult.mrDesign) }));
          setIsFwdModalOpen(false);
          setIsSaved(false);
      }
  };

  // --- Layer Property Calculator Logic ---
  const getFormulaType = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("alto desempeño")) return 1;
    if (n.includes("carpeta asfáltica normal") || n === "base asfáltica") return 2;
    if (n.includes("cementada")) return 3;
    if (n === "base hidráulica") return 4;
    if (n === "sub-base hidráulica") return 5;
    return 0;
  };

  const calculateAFromMR = (name: string, mr: number) => {
    const type = getFormulaType(name);
    if (type === 0 || mr <= 0) return 0;
    let a = 0;
    if (type === 1) a = 0.171 * Math.log(mr) - 1.784;
    if (type === 2) a = 0.184 * Math.log(mr) - 1.9547;
    if (type === 3) a = 0.0000004 * mr - 0.0702;
    if (type === 4) a = 0.249 * Math.log10(mr) - 0.977;
    if (type === 5) a = 0.227 * Math.log10(mr) - 0.839;
    return Math.max(0, parseFloat(a.toFixed(2)));
  };

  const calculateMRFromA = (name: string, a: number) => {
    const type = getFormulaType(name);
    if (type === 0 || a <= 0) return 0;
    let mr = 0;
    if (type === 1) mr = Math.exp((a + 1.784) / 0.171);
    if (type === 2) mr = Math.exp((a + 1.9547) / 0.184);
    if (type === 3) mr = (a + 0.0702) / 0.0000004;
    if (type === 4) mr = Math.pow(10, (a + 0.977) / 0.249);
    if (type === 5) mr = Math.pow(10, (a + 0.839) / 0.227);
    return Math.round(mr);
  };

  const handleOpenCalc = (layer: PavementLayer) => {
    setCalcLayerData({ id: layer.id, name: layer.name, mr: layer.mr, a: layer.a });
    setIsCalcModalOpen(true);
  };

  const handleApplyCalc = () => {
    if (!calcLayerData) return;
    setFormData(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === calcLayerData.id ? { ...l, mr: calcLayerData.mr, a: calcLayerData.a } : l)
    }));
    setIsCalcModalOpen(false);
    setIsSaved(false);
  };

  // --- Growth Rate Calculation Logic ---
  const linearRegression = (x: number[], y: number[]) => {
      const n = x.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
      for (let i = 0; i < n; i++) {
          sumX += x[i];
          sumY += y[i];
          sumXY += x[i] * y[i];
          sumX2 += x[i] * x[i];
          sumY2 += y[i] * y[i];
      }
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      const yMean = sumY / n;
      let ssRes = 0, ssTot = 0;
      for (let i = 0; i < n; i++) {
          const yPred = intercept + slope * x[i];
          ssRes += Math.pow(y[i] - yPred, 2);
          ssTot += Math.pow(y[i] - yMean, 2);
      }
      const r2 = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);
      return { slope, intercept, r2 };
  };

  const handleCalculateGrowth = () => {
      const values = growthForm.tdpaValues.split(/[\s,]+/).map(v => parseFloat(v)).filter(v => !isNaN(v));
      if (values.length < 2) {
          alert("Ingrese al menos 2 valores de TDPA.");
          return;
      }

      const n = values.length;
      // The user enters from most recent to initial.
      // We reverse it to have chronological order for regression.
      const v = [...values].reverse(); 
      const x = Array.from({ length: n }, (_, i) => i);
      const y = v;

      // 1. Interannual rates (following User's Excel: Geometric Mean of Rates)
      const interannualRates: number[] = [];
      for (let i = 1; i < n; i++) {
          const rate = (v[i] / v[i - 1]) - 1;
          interannualRates.push(rate);
      }

      const maxRateDec = growthForm.maxGrowthRate / 100;
      // Filter rates: 0 < r <= maxRate
      const filteredRates = interannualRates.filter(r => r > 0 && r <= maxRateDec);
      
      let tf = 0;
      if (filteredRates.length > 0) {
          // User's Excel: (Product of rates)^(1/n)
          const product = filteredRates.reduce((acc, r) => acc * r, 1);
          tf = Math.pow(product, 1 / filteredRates.length);
      } else {
          // Fallback: Simple CAGR if no rates are valid
          const simpleRate = Math.pow(v[n-1] / v[0], 1 / (n-1)) - 1;
          tf = simpleRate > 0 ? simpleRate : 0;
      }

      // 2. Regressions
      const models: { name: string, rate: number, r2: number }[] = [];

      // Linear: y = a + bx => r = b/a
      const lin = linearRegression(x, y);
      const linRate = lin.intercept !== 0 ? lin.slope / lin.intercept : 0;
      models.push({ name: 'Lineal', rate: linRate, r2: lin.r2 });

      // Exponential: y = a(1+r)^x => ln(y) = ln(a) + x*ln(1+r)
      const logY = y.map(val => Math.log(val));
      const exp = linearRegression(x, logY);
      const expRate = Math.exp(exp.slope) - 1;
      models.push({ name: 'Exponencial', rate: expRate, r2: exp.r2 });

      // Logarithmic: y = a + b*ln(x+1)
      const logX = x.map(val => Math.log(val + 1));
      const logModel = linearRegression(logX, y);
      // For logarithmic, the "rate" is not constant. We'll use an average or initial slope.
      const logRate = logModel.intercept !== 0 ? logModel.slope / logModel.intercept : 0;
      models.push({ name: 'Logarítmica', rate: logRate, r2: logModel.r2 });

      // Find best model among those with positive rates
      let bestModel = models.find(m => m.rate > 0) || models[0];
      for (const m of models) {
          if (m.rate > 0 && m.r2 > bestModel.r2) {
              bestModel = m;
          }
      }

      let finalRate = tf;
      let method = 'Media Geométrica (Tf)';
      let finalR2 = 0;

      // Threshold for regression
      if (bestModel.r2 > 0.8 && bestModel.rate > 0 && bestModel.rate <= maxRateDec) {
          finalRate = bestModel.rate;
          method = bestModel.name;
          finalR2 = bestModel.r2;
      } else if (tf > maxRateDec) {
          finalRate = maxRateDec;
          method = 'Limitado a Tasa Máxima';
      } else if (tf < 0) {
          finalRate = 0;
          method = 'Sin Crecimiento (Tf < 0)';
      }

      setGrowthResult({
          selectedRate: finalRate * 100,
          method,
          r2: finalR2,
          models: models.map(m => ({ ...m, rate: m.rate * 100 })),
          tf: tf * 100
      });

      // Calculate chart data
      const chartData = x.map((xi, i) => {
          const year = growthForm.initialYear + xi;
          const actual = y[i];
          
          const linear = lin.intercept + lin.slope * xi;
          const exponential = Math.exp(exp.intercept + exp.slope * xi);
          const logarithmic = logModel.intercept + logModel.slope * Math.log(xi + 1);
          
          let pred = actual;
          if (method === 'Lineal') pred = linear;
          else if (method === 'Exponencial') pred = exponential;
          else if (method === 'Logarítmica') pred = logarithmic;
          else pred = v[0] * Math.pow(1 + tf, xi);
          
          return { 
              year, 
              actual, 
              pred: parseFloat(pred.toFixed(0)),
              linear: parseFloat(linear.toFixed(0)),
              exponential: parseFloat(exponential.toFixed(0)),
              logarithmic: parseFloat(logarithmic.toFixed(0))
          };
      });
      setGrowthChartData(chartData);
      setSelectedGraphModel(method.includes('Media') ? 'Media Geométrica' : method);
  };

  const handleApplyGrowth = () => {
      if (growthResult) {
          setFormData(prev => ({ ...prev, growthRate: parseFloat(growthResult.selectedRate.toFixed(2)) }));
          setIsGrowthModalOpen(false);
          setIsSaved(false);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('datosGeneralesData', JSON.stringify(formData));
    setIsSaved(true);
    
    // Auto-hide success message
    setTimeout(() => setIsSaved(false), 3000);
  };

  // --- ESAL Calculation Logic ---
  const ejesResults = useMemo(() => calculateEjesResults(formData, compData), [formData, compData]);
  const esalRows = useMemo(() => calculateEsalRows(formData, formData.snSeed, ejesResults), [formData, ejesResults]);
  const totalESALs1Year = useMemo(() => esalRows.reduce((acc, r) => acc + r.esalAnio, 0), [esalRows]);

  const formatNum = (n: number, d: number = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  const InputClass = "w-full bg-white border border-slate-300 rounded px-3 py-3 text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors";
  const LabelClass = "block text-sm font-semibold text-slate-700 mb-1";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-24">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Datos Generales</h1>
        <p className="text-slate-600">Parámetros fundamentales para el cálculo de ejes y diseño AASHTO.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Section 1: Project Info */}
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
            <i className="fas fa-map-marked-alt text-orange-500"></i> Información del Camino
          </h3>
          
          <div className="grid gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className={LabelClass}>Nombre del Proyecto</label>
                    <input
                        type="text"
                        name="projectName"
                        value={formData.projectName}
                        onChange={handleChange}
                        className={InputClass}
                        placeholder="Ej. Carretera Federal 57"
                    />
                </div>
                <div>
                    <label className={LabelClass}>Tramo</label>
                    <input
                        type="text"
                        name="section"
                        value={formData.section}
                        onChange={handleChange}
                        className={InputClass}
                        placeholder="Ej. Km 20+000 - Km 50+000"
                    />
                </div>
            </div>

            <div>
              <label className={LabelClass}>Clasificación oficial (para cargas máximas)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                {[
                    { val: 'ET_A', label: 'Tipo A' },
                    { val: 'B', label: 'Tipo B' },
                    { val: 'C', label: 'Tipo C' },
                    { val: 'D', label: 'Tipo D' }
                ].map((opt) => (
                  <label 
                    key={opt.val} 
                    className={`cursor-pointer flex flex-col items-center justify-center p-3 rounded border transition-all active:scale-95 ${
                        formData.roadType === opt.val 
                        ? 'bg-blue-50 border-blue-500 text-blue-600' 
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="roadType"
                      value={opt.val}
                      checked={formData.roadType === opt.val}
                      onChange={() => handleRadioChange('roadType', opt.val as any)}
                      className="hidden"
                    />
                    <span className="font-medium text-sm text-center">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={LabelClass}>Tipo de Red (DGCC)</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                {[
                    { val: 'Corredor', label: 'Corredor' },
                    { val: 'Red Básica', label: 'Red Básica' },
                    { val: 'Red Secundaria', label: 'Red Secundaria' }
                ].map((opt) => (
                  <label 
                    key={opt.val} 
                    className={`cursor-pointer flex flex-col items-center justify-center p-3 rounded border transition-all active:scale-95 ${
                        formData.networkType === opt.val 
                        ? 'bg-blue-50 border-blue-500 text-blue-600' 
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="networkType"
                      value={opt.val}
                      checked={formData.networkType === opt.val}
                      onChange={() => handleRadioChange('networkType', opt.val as any)}
                      className="hidden"
                    />
                    <span className="font-medium text-sm text-center">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2 & 3 Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Section 2: Traffic Params */}
            <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm h-full">
                <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <i className="fas fa-truck-moving text-emerald-600"></i> Parámetros de Tránsito
                </h3>

                <div className="grid grid-cols-1 gap-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={LabelClass}>TDPA (Vehículos)</label>
                            <input
                                type="number"
                                name="tdpa"
                                value={formData.tdpa}
                                onChange={handleChange}
                                className={InputClass}
                                min="0"
                            />
                        </div>
                        <div>
                            <label className={LabelClass}>% Vehículos Cargados (Pvc)</label>
                            <input
                                type="number"
                                name="pvc"
                                value={formData.pvc}
                                onChange={handleChange}
                                className={InputClass}
                                min="0"
                                max="100"
                            />
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                             <label className={LabelClass}>Tasa Crecimiento (r) en %</label>
                             <div className="flex gap-2">
                                 <input
                                     type="number"
                                     name="growthRate"
                                     value={formData.growthRate}
                                     onChange={handleChange}
                                     className={InputClass}
                                     step="0.1"
                                 />
                                 <button
                                     type="button"
                                     onClick={() => setIsGrowthModalOpen(true)}
                                     className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 rounded border border-slate-300 transition-colors flex items-center justify-center"
                                     title="Calcular tasa de crecimiento"
                                 >
                                     <i className="fas fa-chart-line"></i>
                                 </button>
                             </div>
                        </div>
                        <div>
                             <label className={LabelClass}>Periodo Diseño (n)</label>
                             <div className="relative">
                                <input
                                    type="number"
                                    name="designPeriod"
                                    value={formData.designPeriod}
                                    onChange={handleChange}
                                    className={InputClass}
                                    min="1"
                                />
                                <span className="absolute right-4 top-3 text-slate-400">años</span>
                            </div>
                        </div>
                     </div>

                    <div>
                        <label className={LabelClass}>Ingreso Tabular (7 Vehículos: A, B, C2, C3, T3S2, T3S3, T3S2R4)</label>
                        <div className="flex gap-2 mt-1">
                            <input
                                type="text"
                                value={tabularInput}
                                onChange={(e) => setTabularInput(e.target.value)}
                                placeholder="Ej: 85 2 2 2 2 5 2"
                                className={InputClass}
                            />
                            <button
                                type="button"
                                onClick={handleApplyTabular}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded font-bold transition-colors shadow-sm whitespace-nowrap"
                            >
                                Aplicar
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Pegue los 7 valores separados por espacios o tabulaciones.</p>
                    </div>
                </div>
            </div>

            {/* Section 3: Design Factors */}
            <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm h-full">
                <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <i className="fas fa-ruler-combined text-blue-600"></i> Factores de Diseño (AASHTO)
                </h3>

                <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={LabelClass}>Confiabilidad (R) en %</label>
                            <input
                                type="number"
                                name="reliability"
                                value={formData.reliability}
                                onChange={handleChange}
                                className={InputClass}
                                min="50" max="99.9" step="0.1"
                            />
                        </div>
                        <div>
                            <label className={LabelClass}>Desv. Estándar (So)</label>
                            <input
                                type="number"
                                name="standardDeviation"
                                value={formData.standardDeviation}
                                onChange={handleChange}
                                className={InputClass}
                                step="0.01"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                             <label className={LabelClass}>Serviciabilidad (Pt)</label>
                             <input
                                type="number"
                                name="finalServiceability"
                                value={formData.finalServiceability}
                                onChange={handleChange}
                                className={InputClass}
                                step="0.1"
                                min="1.5"
                                max="3.0"
                             />
                        </div>
                        <div>
                             <label className={LabelClass}>Módulo MR (Subrasante)</label>
                             <div className="flex gap-2">
                                <div className="relative flex-grow">
                                    <input
                                        type="number"
                                        name="subgradeMr"
                                        value={formData.subgradeMr}
                                        onChange={handleChange}
                                        className={InputClass}
                                        min="0"
                                    />
                                    <span className="absolute right-4 top-3 text-slate-400 text-xs mt-0.5">psi</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        // Auto-calculate D from current layers if possible
                                        // Assuming layers have thickness? Wait, layers in GeneralData don't have thickness yet?
                                        // Ah, thicknesses are calculated in EsalsPage. 
                                        // But the algorithm needs D. Let's let user input it or try to guess.
                                        setIsFwdModalOpen(true);
                                    }}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 rounded border border-slate-300 transition-colors flex items-center justify-center"
                                    title="Calcular por deflexiones"
                                >
                                    <i className="fas fa-calculator"></i>
                                </button>
                             </div>
                        </div>
                    </div>

                    <div className="mt-2">
                        <label className={LabelClass}>Número de Carriles (sentido)</label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                        {[
                            { val: '1', label: '1' },
                            { val: '2', label: '2' },
                            { val: '3+', label: '3+' }
                        ].map((opt) => (
                            <label 
                                key={opt.val}
                                className={`cursor-pointer flex items-center justify-center p-3 rounded border transition-all active:scale-95 ${
                                    formData.lanes === opt.val 
                                    ? 'bg-blue-50 border-blue-500 text-blue-600' 
                                    : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="lanes"
                                    value={opt.val}
                                    checked={formData.lanes === opt.val}
                                    onChange={() => handleRadioChange('lanes', opt.val)}
                                    className="hidden"
                                />
                                <span className="font-medium">{opt.label}</span>
                            </label>
                        ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Section 3.5: Physical Diagnosis (New) */}
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
             <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <i className="fas fa-notes-medical text-blue-600"></i> Descripción o diagnóstico del estado físico del tramo
            </h3>
            <textarea
                name="diagnosis"
                value={formData.diagnosis || ""}
                onChange={handleChange}
                placeholder="Ingrese aquí la descripción o diagnóstico del estado físico del tramo..."
                className={`${InputClass} min-h-[120px] resize-y`}
            />
        </div>

        {/* Section 3.6: Required Asphalt Grade (New) */}
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
             <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <i className="fas fa-oil-can text-amber-600"></i> Tipo de asfalto requerido grado PG
            </h3>
            <input
                type="text"
                name="asphaltGrade"
                value={formData.asphaltGrade || ""}
                onChange={handleChange}
                placeholder="Ej: 70H-16"
                className={InputClass}
            />
        </div>

        {/* Section 4: Pavement Structure (New) */}
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
             <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <i className="fas fa-layer-group text-purple-600"></i> Estructuración de Capas
            </h3>

            {/* Config Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                    <label className={LabelClass}>Nivel de Rigidez (Valores Típicos)</label>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                        {[
                            { val: 'low', label: 'Bajo' },
                            { val: 'medium', label: 'Medio' },
                            { val: 'high', label: 'Alto' }
                        ].map((opt) => (
                            <button
                                type="button"
                                key={opt.val}
                                onClick={() => handleRigidityChange(opt.val as 'low'|'medium'|'high')}
                                className={`
                                    p-3 rounded border transition-all active:scale-95 text-sm font-medium
                                    ${formData.rigidityLevel === opt.val 
                                        ? 'bg-purple-50 border-purple-500 text-purple-600 shadow-sm' 
                                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'}
                                `}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className={LabelClass}>Coeficiente de Drenaje (m)</label>
                    <input
                        type="number"
                        name="drainageCoefficient"
                        value={formData.drainageCoefficient || 0.9}
                        onChange={handleChange}
                        className={InputClass}
                        step="0.01"
                        min="0"
                    />
                </div>
            </div>

            {/* Dynamic Layers List */}
            <div className="space-y-4">
                {/* Header - Desktop Only */}
                <div className="hidden md:flex justify-between items-center mb-2">
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-400 uppercase px-1 flex-grow">
                        <div className="col-span-1 text-center">#</div>
                        <div className="col-span-4">Capa</div>
                        <div className="col-span-3">Módulo (psi)</div>
                        <div className="col-span-2 text-center">Aporte (a)</div>
                        <div className="col-span-2 text-center">Drenaje (m)</div>
                    </div>
                    <div className="w-8"></div>
                </div>

                {formData.layers?.map((layer, index) => (
                    <div key={layer.id} className={`bg-white p-4 rounded-xl border transition-all ${layer.customCode ? 'border-purple-300 shadow-sm shadow-purple-100' : 'border-slate-200 shadow-sm'}`}>
                        {/* Mobile Header */}
                        <div className="flex justify-between items-center md:hidden mb-4 border-b border-slate-100 pb-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Capa #{index + 1}</span>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => handleOpenCalc(layer)}
                                    className="text-blue-600 hover:text-blue-700 p-2 rounded hover:bg-blue-50"
                                    title="Calcular propiedades"
                                >
                                    <i className="fas fa-calculator"></i>
                                </button>
                                {formData.layers.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveLayer(layer.id)}
                                        className="text-red-600 hover:text-red-700 p-2 rounded hover:bg-red-50"
                                        title="Eliminar capa"
                                    >
                                        <i className="fas fa-trash-alt"></i>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Desktop & Mobile Content */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-2 items-center">
                            {/* Index - Desktop Only */}
                            <div className="hidden md:block col-span-1 text-center font-bold text-slate-400">
                                {index + 1}
                            </div>

                            {/* Name/Select */}
                            <div className="md:col-span-4">
                                <label className="block md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1">Tipo de Capa</label>
                                <select
                                    value={layer.customCode ? CUSTOM_LAYER_NAME : layer.name}
                                    onChange={(e) => handleLayerChange(layer.id, 'name', e.target.value)}
                                    className={`${InputClass} py-2 text-sm ${layer.customCode ? 'text-purple-600' : ''}`}
                                >
                                    {LAYER_CATALOG.map(cat => (
                                        <option key={cat.name} value={cat.name}>
                                            {cat.name === CUSTOM_LAYER_NAME && layer.customCode ? `${layer.name} (${layer.customCode})` : cat.name}
                                        </option>
                                    ))}
                                </select>
                                {layer.customCode && <div className="text-[10px] text-purple-500 mt-1 pl-1">Personalizada: {layer.name} ({layer.customCode})</div>}
                            </div>

                            {/* Module */}
                            <div className="md:col-span-3">
                                <label className="block md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1">Módulo Resiliente (psi)</label>
                                <input 
                                    type="text" 
                                    value={layer.mr.toLocaleString('en-US')}
                                    onChange={(e) => {
                                        const rawValue = e.target.value.replace(/,/g, '');
                                        const numValue = parseFloat(rawValue);
                                        handleLayerChange(layer.id, 'mr', isNaN(numValue) ? 0 : numValue);
                                    }}
                                    className={`${InputClass} py-2 text-sm font-mono`}
                                    readOnly={!!layer.customCode}
                                    disabled={!!layer.customCode}
                                />
                            </div>

                            {/* Coef A */}
                            <div className="md:col-span-2">
                                <label className="block md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1">Coef. Estructural (a)</label>
                                <input 
                                    type="number" 
                                    value={layer.a}
                                    step="0.01"
                                    onChange={(e) => handleLayerChange(layer.id, 'a', parseFloat(e.target.value))}
                                    className={`${InputClass} py-2 text-sm text-center font-mono`}
                                    disabled={!!layer.customCode}
                                />
                            </div>

                            {/* Coef M */}
                            <div className="md:col-span-1">
                                <label className="block md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1">Drenaje (m)</label>
                                <input 
                                    type="number" 
                                    value={layer.m}
                                    step="0.01"
                                    onChange={(e) => handleLayerChange(layer.id, 'm', parseFloat(e.target.value))}
                                    className={`${InputClass} py-2 text-sm text-center font-mono`}
                                    disabled={!!layer.customCode}
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex md:col-span-1 justify-center md:justify-end gap-2 mt-2 md:mt-0">
                                <button
                                    type="button"
                                    onClick={() => handleOpenCalc(layer)}
                                    className="flex-1 md:flex-none text-blue-600 hover:text-blue-700 p-2 rounded bg-blue-50 md:bg-transparent md:hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 md:gap-0"
                                    title="Calcular propiedades"
                                >
                                    <i className="fas fa-calculator"></i>
                                    <span className="md:hidden text-[10px] font-bold uppercase">Calcular</span>
                                </button>
                                {formData.layers.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveLayer(layer.id)}
                                        className="flex-1 md:flex-none text-red-600 hover:text-red-700 p-2 rounded bg-red-50 md:bg-transparent md:hover:bg-red-50 transition-colors flex items-center justify-center gap-2 md:gap-0"
                                        title="Eliminar capa"
                                    >
                                        <i className="fas fa-trash-alt"></i>
                                        <span className="md:hidden text-[10px] font-bold uppercase">Eliminar</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                        type="button"
                        onClick={() => handleAddLayer('top')}
                        className="py-3 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-colors flex items-center justify-center gap-2 font-semibold"
                    >
                        <i className="fas fa-plus-circle"></i> Adicionar capa (Arriba)
                    </button>
                    <button
                        type="button"
                        onClick={() => handleAddLayer('bottom')}
                        className="py-3 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-colors flex items-center justify-center gap-2 font-semibold"
                    >
                        <i className="fas fa-plus-circle"></i> Adicionar capa (Abajo)
                    </button>
                </div>
            </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button
                type="submit"
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 active:scale-95 shadow-md"
            >
                <i className="fas fa-save"></i>
                Guardar Todo
            </button>
            <button
                type="button"
                onClick={() => navigate('/composicion')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 active:scale-95 shadow-md"
            >
                Siguiente <i className="fas fa-arrow-right"></i>
            </button>
        </div>

        {/* Success Feedback */}
        {isSaved && (
            <div className="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 bg-green-600 text-white px-6 py-4 rounded-lg shadow-lg flex items-center justify-center gap-3 animate-bounce z-50">
                <i className="fas fa-check-circle"></i> Datos guardados
            </div>
        )}

      </form>

      {/* LAYER PROPERTY CALCULATOR MODAL */}
      {isCalcModalOpen && calcLayerData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-500/40 backdrop-blur-sm overflow-y-auto">
              <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md p-6 my-auto">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Calculadora de Capa</h3>
                  <p className="text-slate-500 text-sm mb-6">{calcLayerData.name}</p>
                  
                  <div className="space-y-6">
                      <div>
                          <label className={LabelClass}>Módulo Resiliente (psi)</label>
                          <div className="flex gap-2">
                            <input 
                                type="number" 
                                value={calcLayerData.mr}
                                onChange={(e) => setCalcLayerData(prev => prev ? ({ ...prev, mr: parseFloat(e.target.value) || 0 }) : null)}
                                className={InputClass}
                            />
                            <button 
                                onClick={() => {
                                    const newA = calculateAFromMR(calcLayerData.name, calcLayerData.mr);
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
                          <label className={LabelClass}>Coeficiente Estructural (a)</label>
                          <div className="flex gap-2">
                            <input 
                                type="number" 
                                step="0.01"
                                value={calcLayerData.a}
                                onChange={(e) => setCalcLayerData(prev => prev ? ({ ...prev, a: parseFloat(e.target.value) || 0 }) : null)}
                                className={InputClass}
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

                      {getFormulaType(calcLayerData.name) === 0 && (
                          <div className="bg-amber-50 border border-amber-200 p-3 rounded text-xs text-amber-700">
                            <i className="fas fa-exclamation-triangle mr-2"></i>
                            No hay fórmulas predefinidas para este tipo de capa. Ingrese los valores manualmente.
                          </div>
                      )}
                  </div>

                  <div className="flex justify-end gap-3 mt-8">
                      <button 
                          onClick={() => setIsCalcModalOpen(false)}
                          className="px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                      >
                          Cancelar
                      </button>
                      <button 
                          onClick={handleApplyCalc}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
                      >
                          Aplicar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* CUSTOM LAYER MODAL */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-500/40 backdrop-blur-sm overflow-y-auto">
              <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md p-6 my-auto">
                  <h3 className="text-xl font-bold text-slate-900 mb-4">Nueva Capa Personalizada</h3>
                  
                  <div className="space-y-4">
                      <div>
                          <label className={LabelClass}>Clave (2 letras - para móvil)</label>
                          <input 
                              type="text" 
                              maxLength={2}
                              value={customLayerForm.code}
                              onChange={(e) => setCustomLayerForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                              className={InputClass}
                              placeholder="Ej. MC"
                              autoFocus
                          />
                      </div>
                      <div>
                          <label className={LabelClass}>Nombre de la Capa</label>
                          <input 
                              type="text" 
                              value={customLayerForm.name}
                              onChange={(e) => setCustomLayerForm(prev => ({ ...prev, name: e.target.value }))}
                              className={InputClass}
                              placeholder="Ej. Mezcla Caliente Modificada"
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={LabelClass}>Módulo (psi)</label>
                            <input 
                                type="number" 
                                value={customLayerForm.mr || ''}
                                onChange={(e) => setCustomLayerForm(prev => ({ ...prev, mr: parseFloat(e.target.value) }))}
                                className={InputClass}
                            />
                        </div>
                        <div>
                            <label className={LabelClass}>Aporte (a)</label>
                            <input 
                                type="number" 
                                step="0.01"
                                value={customLayerForm.a || ''}
                                onChange={(e) => setCustomLayerForm(prev => ({ ...prev, a: parseFloat(e.target.value) }))}
                                className={InputClass}
                            />
                        </div>
                        <div>
                            <label className={LabelClass}>Coef. Drenaje (m)</label>
                            <input 
                                type="number" 
                                step="0.01"
                                value={customLayerForm.m || ''}
                                onChange={(e) => setCustomLayerForm(prev => ({ ...prev, m: parseFloat(e.target.value) }))}
                                className={InputClass}
                            />
                        </div>
                      </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-8">
                      <button 
                          onClick={() => setIsModalOpen(false)}
                          className="px-4 py-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                      >
                          Cancelar
                      </button>
                      <button 
                          onClick={handleSaveCustomLayer}
                          disabled={!customLayerForm.code || !customLayerForm.name || !customLayerForm.mr || !customLayerForm.a}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          Aceptar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* FWD CALCULATOR MODAL */}
      {isFwdModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-500/50 backdrop-blur-sm overflow-y-auto">
              <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-2xl my-auto max-h-[90vh] flex flex-col">
                  <div className="p-6 border-b border-slate-200 flex justify-between items-center shrink-0">
                      <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                          <i className="fas fa-wave-square text-blue-600"></i> Cálculo de MR por Deflexiones
                      </h3>
                      <button onClick={() => setIsFwdModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                          <i className="fas fa-times"></i>
                      </button>
                  </div>
                  
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
                      <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Parámetros FWD</h4>
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className={LabelClass}>Carga P (lbs)</label>
                                  <input 
                                      type="number" 
                                      value={fwdForm.P}
                                      onChange={(e) => setFwdForm(prev => ({ ...prev, P: parseFloat(e.target.value) }))}
                                      className={InputClass}
                                  />
                              </div>
                              <div>
                                  <label className={LabelClass}>Espesor D (in)</label>
                                  <input 
                                      type="number" 
                                      value={fwdForm.D}
                                      onChange={(e) => setFwdForm(prev => ({ ...prev, D: parseFloat(e.target.value) }))}
                                      className={InputClass}
                                  />
                              </div>
                          </div>
                          <div>
                              <label className={LabelClass}>Radio Plato a (in)</label>
                              <input 
                                  type="number" 
                                  step="0.01"
                                  value={fwdForm.a}
                                  onChange={(e) => setFwdForm(prev => ({ ...prev, a: parseFloat(e.target.value) }))}
                                  className={InputClass}
                              />
                          </div>

                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                              <h5 className="text-xs font-bold text-slate-500 mb-3 uppercase">Resultados</h5>
                              {fwdResult ? (
                                  <div className="space-y-2">
                                      <div className="flex justify-between items-center">
                                          <span className="text-sm text-slate-600">MR Diseño (0.33*MR):</span>
                                          <span className="text-lg font-bold text-emerald-600">{Math.round(fwdResult.mrDesign).toLocaleString()} psi</span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                          <span className="text-sm text-slate-600">SN Efectivo:</span>
                                          <span className="text-lg font-bold text-blue-600">{fwdResult.snEf.toFixed(2)}</span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                          <span className="text-sm text-slate-600">Módulo Ep:</span>
                                          <span className="text-sm font-mono text-slate-700">{Math.round(fwdResult.Ep).toLocaleString()} psi</span>
                                      </div>
                                      <div className="text-[10px] text-slate-400 mt-2">
                                          Calculado con Sensor #{fwdResult.sensorUsed + 1} (r={fwdForm.sensors[fwdResult.sensorUsed].r}")
                                      </div>
                                  </div>
                              ) : (
                                  <div className="text-center py-4 text-slate-400 text-sm italic">
                                      Ingrese datos y presione Calcular
                                  </div>
                              )}
                          </div>
                      </div>

                      <div className="space-y-4">
                          <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Lecturas de Sensores</h4>
                          <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded bg-slate-50">
                              <table className="w-full text-xs">
                                  <thead className="bg-slate-100 sticky top-0">
                                      <tr>
                                          <th className="p-2 text-left text-slate-600">Sensor</th>
                                          <th className="p-2 text-right text-slate-600">r (in)</th>
                                          <th className="p-2 text-right text-slate-600">dr (mils)</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200">
                                      {fwdForm.sensors.map((s, idx) => (
                                          <tr key={idx}>
                                              <td className="p-2 text-slate-400">#{idx + 1}</td>
                                              <td className="p-1">
                                                  <input 
                                                      type="number" 
                                                      value={s.r}
                                                      onChange={(e) => {
                                                          const newSensors = [...fwdForm.sensors];
                                                          newSensors[idx].r = parseFloat(e.target.value);
                                                          setFwdForm(prev => ({ ...prev, sensors: newSensors }));
                                                      }}
                                                      className="w-full bg-transparent text-right p-1 focus:bg-white outline-none text-slate-700"
                                                  />
                                              </td>
                                              <td className="p-1">
                                                  <input 
                                                      type="number" 
                                                      value={s.dr}
                                                      onChange={(e) => {
                                                          const newSensors = [...fwdForm.sensors];
                                                          newSensors[idx].dr = parseFloat(e.target.value);
                                                          setFwdForm(prev => ({ ...prev, sensors: newSensors }));
                                                      }}
                                                      className="w-full bg-transparent text-right p-1 focus:bg-white outline-none font-bold text-slate-900"
                                                  />
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  </div>

                  <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                      <button 
                          onClick={handleCalculateFwd}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors shadow-sm"
                      >
                          Calcular
                      </button>
                      <button 
                          onClick={handleApplyFwd}
                          disabled={!fwdResult}
                          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                          Aplicar MR
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* GROWTH RATE CALCULATOR MODAL */}
      {isGrowthModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-500/50 backdrop-blur-sm overflow-y-auto">
              <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-4xl my-auto max-h-[90vh] flex flex-col">
                  <div className="p-6 border-b border-slate-200 flex justify-between items-center shrink-0">
                      <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                          <i className="fas fa-chart-line text-emerald-600"></i> Calculadora de Tasa de Crecimiento
                      </h3>
                      <div className="flex items-center gap-4">
                          {growthResult && (
                              <button 
                                  onClick={() => setShowGrowthGraph(!showGrowthGraph)}
                                  className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-2 ${
                                      showGrowthGraph 
                                      ? 'bg-emerald-600 text-white' 
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                              >
                                  <i className={`fas ${showGrowthGraph ? 'fa-calculator' : 'fa-chart-area'}`}></i>
                                  {showGrowthGraph ? 'Ver Calculadora' : 'Ver Gráfica y Tabla'}
                              </button>
                          )}
                          <button onClick={() => {
                              setIsGrowthModalOpen(false);
                              setShowGrowthGraph(false);
                          }} className="text-slate-400 hover:text-slate-600">
                              <i className="fas fa-times"></i>
                          </button>
                      </div>
                  </div>
                  
                  <div className="p-6 overflow-y-auto">
                      {!showGrowthGraph ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-4">
                                  <div>
                                      <label className={LabelClass}>Año Inicial</label>
                                      <input 
                                          type="number" 
                                          value={growthForm.initialYear}
                                          onChange={(e) => setGrowthForm(prev => ({ ...prev, initialYear: parseInt(e.target.value) }))}
                                          className={InputClass}
                                      />
                                  </div>
                                  <div>
                                      <label className={LabelClass}>Tasa Máxima Aceptada (%)</label>
                                      <input 
                                          type="number" 
                                          value={growthForm.maxGrowthRate}
                                          onChange={(e) => setGrowthForm(prev => ({ ...prev, maxGrowthRate: parseFloat(e.target.value) }))}
                                          className={InputClass}
                                      />
                                  </div>
                                  <div>
                                      <label className={LabelClass}>Volúmenes TDPA (Año Reciente a Inicial)</label>
                                      <div className="relative">
                                          <textarea 
                                              value={growthForm.tdpaValues}
                                              onChange={(e) => setGrowthForm(prev => ({ ...prev, tdpaValues: e.target.value }))}
                                              className={`${InputClass} h-32 resize-none font-mono text-sm`}
                                              placeholder="Ej: 5500, 5300, 5100, 4900, 4700"
                                          />
                                          <button 
                                              type="button"
                                              onClick={() => {
                                                  const vals = growthForm.tdpaValues.split(/[\s,]+/).filter(v => v.trim() !== '').reverse().join(', ');
                                                  setGrowthForm(prev => ({ ...prev, tdpaValues: vals }));
                                              }}
                                              className="absolute right-2 bottom-2 bg-slate-100 hover:bg-slate-200 text-[10px] px-2 py-1 rounded text-slate-600 border border-slate-300"
                                              title="Invertir orden"
                                          >
                                              <i className="fas fa-exchange-alt"></i> Invertir
                                          </button>
                                      </div>
                                      <p className="text-[10px] text-slate-400 mt-1">Separe los valores por comas, espacios o saltos de línea.</p>
                                  </div>
                              </div>

                              <div className="space-y-4">
                                  <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Resultados del Análisis</h4>
                                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 min-h-[200px]">
                                      {growthResult ? (
                                          <div className="space-y-4">
                                              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded">
                                                  <div className="text-xs text-emerald-600 font-bold uppercase mb-1">Tasa Seleccionada</div>
                                                  <div className="text-2xl font-bold text-slate-900">{growthResult.selectedRate.toFixed(2)}%</div>
                                                  <div className="text-[10px] text-emerald-600 mt-1">Método: {growthResult.method} {growthResult.r2 > 0 ? `(R²=${growthResult.r2.toFixed(3)})` : ''}</div>
                                              </div>

                                              <div className="space-y-2">
                                                  <div className="text-[10px] text-slate-400 font-bold uppercase">Comparativa de Modelos</div>
                                                  {growthResult.models.map((m, idx) => (
                                                      <div key={idx} className="flex justify-between items-center text-xs">
                                                          <span className="text-slate-600">{m.name}:</span>
                                                          <span className="font-mono text-slate-900">{m.rate.toFixed(2)}% (R²={m.r2.toFixed(3)})</span>
                                                      </div>
                                                  ))}
                                                  <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200">
                                                      <span className="text-slate-600">Media Geométrica (Tf):</span>
                                                      <span className="font-mono text-slate-900">{growthResult.tf.toFixed(2)}%</span>
                                                  </div>
                                              </div>
                                          </div>
                                      ) : (
                                          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 italic text-sm">
                                              <i className="fas fa-chart-area text-3xl mb-2 opacity-20"></i>
                                              Ingrese los datos históricos y presione Calcular
                                          </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              <div className="lg:col-span-2 flex flex-col gap-4">
                                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 h-[300px] md:h-[350px]">
                                      <h4 className="text-xs font-bold text-slate-500 uppercase mb-4">Gráfica de Tendencia (TDPA vs Tiempo)</h4>
                                      <ResponsiveContainer width="100%" height="90%">
                                          <LineChart data={growthChartData}>
                                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                              <XAxis 
                                                  dataKey="year" 
                                                  stroke="#64748b" 
                                                  fontSize={10} 
                                                  tickLine={false} 
                                                  axisLine={false}
                                              />
                                              <YAxis 
                                                  stroke="#64748b" 
                                                  fontSize={10} 
                                                  tickLine={false} 
                                                  axisLine={false}
                                                  tickFormatter={(val) => val.toLocaleString()}
                                              />
                                              <Tooltip 
                                                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                                                  itemStyle={{ color: '#0f172a' }}
                                              />
                                              <Legend verticalAlign="top" height={36} iconType="circle" />
                                              <Line 
                                                  name="Datos Reales" 
                                                  type="monotone" 
                                                  dataKey="actual" 
                                                  stroke="#10b981" 
                                                  strokeWidth={3} 
                                                  dot={{ r: 5, fill: '#10b981' }} 
                                                  activeDot={{ r: 7 }}
                                                  zIndex={10}
                                              />
                                              {selectedGraphModel === 'Lineal' && (
                                                  <Line 
                                                      name="Reg. Lineal" 
                                                      type="monotone" 
                                                      dataKey="linear" 
                                                      stroke="#3b82f6" 
                                                      strokeWidth={2} 
                                                      strokeDasharray="3 3"
                                                      dot={false}
                                                  />
                                              )}
                                              {selectedGraphModel === 'Exponencial' && (
                                                  <Line 
                                                      name="Reg. Exponencial" 
                                                      type="monotone" 
                                                      dataKey="exponential" 
                                                      stroke="#f59e0b" 
                                                      strokeWidth={2} 
                                                      strokeDasharray="3 3"
                                                      dot={false}
                                                  />
                                              )}
                                              {selectedGraphModel === 'Logarítmica' && (
                                                  <Line 
                                                      name="Reg. Logarítmica" 
                                                      type="monotone" 
                                                      dataKey="logarithmic" 
                                                      stroke="#8b5cf6" 
                                                      strokeWidth={2} 
                                                      strokeDasharray="3 3"
                                                      dot={false}
                                                  />
                                              )}
                                              {selectedGraphModel === 'Media Geométrica' && (
                                                   <Line 
                                                      name="Media Geométrica" 
                                                      type="monotone" 
                                                      dataKey="pred" 
                                                      stroke="#ef4444" 
                                                      strokeWidth={2} 
                                                      strokeDasharray="3 3"
                                                      dot={false}
                                                  />
                                              )}
                                          </LineChart>
                                      </ResponsiveContainer>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                      {[
                                          { id: 'Lineal', label: 'Lineal', color: 'border-blue-500 text-blue-600' },
                                          { id: 'Exponencial', label: 'Exponencial', color: 'border-amber-500 text-amber-600' },
                                          { id: 'Logarítmica', label: 'Logarítmica', color: 'border-violet-500 text-violet-600' },
                                          { id: 'Media Geométrica', label: 'Media Geom.', color: 'border-red-500 text-red-600' }
                                      ].map(btn => (
                                          <button
                                              key={btn.id}
                                              onClick={() => setSelectedGraphModel(btn.id)}
                                              className={`px-3 py-2 rounded-lg border text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                                                  selectedGraphModel === btn.id
                                                  ? `bg-slate-50 ${btn.color} ring-1 ring-offset-1 ring-offset-white ring-current`
                                                  : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                                              }`}
                                          >
                                              <span>{btn.label}</span>
                                              {growthResult?.method === btn.id || (btn.id === 'Media Geométrica' && growthResult?.method.includes('Media')) ? (
                                                  <span className="text-[8px] bg-emerald-100 text-emerald-600 px-1 rounded uppercase">Recomendado</span>
                                              ) : null}
                                          </button>
                                      ))}
                                  </div>
                              </div>

                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[300px] md:h-[420px]">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-4">Tabla de Datos</h4>
                                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                                      <table className="w-full text-xs">
                                          <thead className="sticky top-0 bg-slate-100 text-slate-600">
                                              <tr>
                                                  <th className="p-2 text-left border-b border-slate-200">Año</th>
                                                  <th className="p-2 text-right border-b border-slate-200">Real</th>
                                                  <th className="p-2 text-right border-b border-slate-200">Ajuste</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-200">
                                              {growthChartData.map((row, idx) => (
                                                  <tr key={idx} className="hover:bg-white">
                                                      <td className="p-2 text-slate-700 font-medium">{row.year}</td>
                                                      <td className="p-2 text-right text-emerald-600 font-mono">{row.actual.toLocaleString()}</td>
                                                      <td className="p-2 text-right text-blue-600 font-mono">{row.pred.toLocaleString()}</td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>

                  <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
                      <button 
                          type="button"
                          onClick={handleCalculateGrowth}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors shadow-sm"
                      >
                          Calcular
                      </button>
                      <button 
                          type="button"
                          onClick={handleApplyGrowth}
                          disabled={!growthResult}
                          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                          Aplicar Tasa
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default GeneralDataPage;