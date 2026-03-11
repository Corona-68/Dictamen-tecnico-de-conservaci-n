import React, { useState, useEffect, useMemo } from 'react';
import { GeneralData, CompositionData, CalculationMethod, AxleInputRow } from '../types';
import { DEFAULT_COMPOSITION, DEFAULT_GENERAL_DATA, TABLE_STATIC_ROWS, VEHICLE_NAMES } from '../constants';
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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

const EsalsPage: React.FC = () => {
  // Inputs for AASHTO Design
  const [snSeed, setSnSeed] = useState<number>(2.0); 
  const [structureType, setStructureType] = useState<string>("Requerida");
  const [manualThicknesses, setManualThicknesses] = useState<Record<string, number>>({});
  const [isSaved, setIsSaved] = useState(false);

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
            if (parsed.structureType !== undefined) setStructureType(parsed.structureType);
            if (parsed.manualThicknesses) setManualThicknesses(parsed.manualThicknesses);
        } catch (e) { console.error(e); }
    } else {
        setSnSeed(currentGen.snSeed || 4.0);
    }
  }, []);

  const handleSaveCalculations = () => {
      const dataToSave = { snSeed, structureType, manualThicknesses };
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

  // --- 5. LAYER STRUCTURE ---
  const structureLayers = useMemo(() => {
      let accumulatedSN = 0;
      return genData.layers.map((layer, index) => {
          const isLast = index === genData.layers.length - 1;
          const supportMr = isLast ? genData.subgradeMr : genData.layers[index + 1].mr;
          const snRequiredForSupport = solveAashtoIterative(supportMr, totalESALsDesign);
          let snNeededFromLayer = Math.max(0, snRequiredForSupport - accumulatedSN);
          
          const asphaltLayerNames = ["Carpeta asfáltica alto desempeño", "Carpeta asfáltica normal", "Base asfáltica"];
          const m = asphaltLayerNames.includes(layer.name) 
            ? 1.0 
            : (layer.customCode ? (layer.m || 1.0) : (genData.drainageCoefficient || 1.0));
          
          const h_in_calc = snNeededFromLayer / (layer.a * m);
          const h_cm_calc = h_in_calc * 2.54;
          const manualVal = manualThicknesses[layer.id];
          const h_cm_real = manualVal !== undefined ? manualVal : Math.ceil(h_cm_calc * 2) / 2;

          const snProvided = (h_cm_real / 2.54) * layer.a * m;
          accumulatedSN += snProvided; 

          return { ...layer, supportMr, snReq: snRequiredForSupport, m, h_in_calc, h_cm_calc, h_cm_real, snProvided };
      });
  }, [genData.layers, genData.subgradeMr, genData.drainageCoefficient, totalESALsDesign, manualThicknesses]);

  const snTotalProvided = useMemo(() => structureLayers.reduce((acc, l) => acc + l.snProvided, 0), [structureLayers]);

  const { esalsForSnTotal, remainingLifeYears } = useMemo(() => {
    if (snTotalProvided <= 0) return { esalsForSnTotal: 0, remainingLifeYears: 0 };
    
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
    const w18 = pow(10, logW18);
    
    // Calculate remaining life
    const r = genData.growthRate / 100;
    let n = 0;
    if (totalESALs1Year > 0) {
        if (r === 0) {
            n = w18 / totalESALs1Year;
        } else {
            const val = (w18 * r / totalESALs1Year) + 1;
            if (val > 0) {
                n = Math.log(val) / Math.log(1 + r);
            }
        }
    }
    
    return { esalsForSnTotal: w18, remainingLifeYears: n };
  }, [snTotalProvided, genData, totalESALs1Year]);

  const handleRealThicknessChange = (layerId: string, val: string) => {
      const num = parseFloat(val);
      setManualThicknesses(prev => ({ ...prev, [layerId]: isNaN(num) ? 0 : num }));
  };

  const handleSyncSeed = () => {
    setSnSeed(Number(snRequiredTotalManual.toFixed(2)));
  };

  const formatNum = (n: number, d: number = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Memoria de Cálculo - Diseño de Pavimento", 14, 20);
    doc.setFontSize(10);
    doc.text(`Proyecto: ${genData.projectName}`, 14, 30);
    
    // Summary
    const datosBody = [
        ["TDPA", genData.tdpa, "Confiabilidad (R)", `${genData.reliability}%`],
        ["Periodo Diseño", `${genData.designPeriod} años`, "Módulo Subrasante", `${formatNum(genData.subgradeMr, 0)} psi`],
        ["Método Tránsito", method === 'direct' ? "Directo (Ejes Manuales)" : "Calculado (Composición)", "", ""]
    ];
    autoTable(doc, {
        startY: 35,
        head: [['Parámetro', 'Valor', 'Parámetro', 'Valor']],
        body: datosBody,
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] },
    });

    let finalY = (doc as any).lastAutoTable.finalY || 60;
    
    // Detailed ESAL Calculation Parameters (New Request)
    doc.text("Parámetros de Ecuación AASHTO", 14, finalY + 10);
    const paramsBody = [
        ["Desv. Estándar (So)", genData.standardDeviation, "Diferencia PSI", (4.2 - genData.finalServiceability).toFixed(1)],
        ["Módulo Resiliente (Mr)", `${formatNum(genData.subgradeMr, 0)} psi`, "Factor Crecimiento", growthFactor.toFixed(2)],
        ["SN Semilla Usado", snSeed.toFixed(2), "SN Calculado", formatNum(snRequiredTotalManual, 2)]
    ];
    autoTable(doc, {
        startY: finalY + 15,
        body: paramsBody,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [44, 62, 80] } // Slate color
    });
    finalY = (doc as any).lastAutoTable.finalY;

    // Detailed ESAL Breakdown Table (New Request)
    doc.text("Desglose de Cálculo de ESALs (1er año)", 14, finalY + 10);
    const esalDetailBody = esalRows.filter(r => r.esalAnio > 0).map(row => [
        row.no,
        row.tipo.length > 20 ? row.tipo.substring(0, 20) + '...' : row.tipo,
        row.l2, // Axle type
        formatNum(row.lxKip, 2),
        formatNum(row.ejesAnio, 0),
        formatNum(row.fx, 4), // Changed to decimal from scientific
        formatNum(row.esalAnio, 1)
    ]);

    autoTable(doc, {
        startY: finalY + 15,
        head: [['No.', 'Vehículo/Eje', 'L2', 'Carga (kips)', 'Repeticiones', 'Fx', 'ESALs']],
        body: esalDetailBody,
        foot: [['', '', '', '', '', 'Total 1er Año:', formatNum(totalESALs1Year, 1)]],
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [52, 152, 219], halign: 'center' }, // Blue & Center Headers
        footStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold', halign: 'right' },
        columnStyles: { 
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 40, halign: 'left' },
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right', fontStyle: 'bold' },
            6: { halign: 'right' }
        }
    });
    finalY = (doc as any).lastAutoTable.finalY;

    // CT Factor below table
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    // Align to the right side of the page to match the totals column approximately
    doc.text(`Factor de acumulación de tránsito CT: ${formatNum(growthFactor, 2)}`, 195, finalY + 8, { align: "right" });
    doc.setFont("helvetica", "normal");
    
    // Results (Simplified Summary)
    doc.setFontSize(12);
    doc.text("Resultados Finales", 14, finalY + 20);
    
    const resultsBody = [
        ["Ejes Equivalentes (ESALs) de Diseño", formatNum(totalESALsDesign, 0)],
        ["Número Estructural (SN) Requerido", formatNum(snRequiredTotalManual, 2)],
    ];
    
    autoTable(doc, {
        startY: finalY + 25,
        body: resultsBody,
        theme: 'plain',
        styles: { fontSize: 11, fontStyle: 'bold' }
    });
    
    finalY = (doc as any).lastAutoTable.finalY;

    // Structure
    doc.text(`Estructura de Pavimento ${structureType}`, 14, finalY + 15);
    const structureBody = structureLayers.map(l => [
        l.name,
        formatNum(l.mr, 0),
        l.a,
        l.m,
        formatNum(l.snReq, 2),
        formatNum(l.h_cm_calc, 2),
        formatNum(l.h_cm_real, 2)
    ]);

    autoTable(doc, {
        startY: finalY + 20,
        head: [['Capa', 'E(psi)', 'a', 'm', 'SN Req', 'Esp. Calc', 'Esp. Real']],
        body: structureBody,
        theme: 'grid',
        headStyles: { fillColor: [22, 160, 133] }
    });

    finalY = (doc as any).lastAutoTable.finalY;

    // Structure Totals in PDF
    const structureTotalsBody = [
        ["SN Total Aportado", formatNum(snTotalProvided, 2)],
        ["ESALs Soportados (W18)", formatNum(esalsForSnTotal, 0)],
        ["Vida Remanente Estimada", `${formatNum(remainingLifeYears, 1)} años`]
    ];

    autoTable(doc, {
        startY: finalY + 5,
        body: structureTotalsBody,
        theme: 'plain',
        styles: { fontSize: 10, fontStyle: 'bold', halign: 'right' },
        columnStyles: { 0: { cellWidth: 140 }, 1: { halign: 'right' } }
    });

    doc.save("diseno_pavimento.pdf");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-32">
      <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1">Estructuración</h1>
          <p className="text-slate-500">Cálculo de espesores según AASHTO-93</p>
        </div>
        <div className="w-full sm:w-64">
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1 ml-1">Tipo de Estructura</label>
          <input
            type="text"
            value={structureType}
            onChange={(e) => setStructureType(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2 text-slate-900 font-bold focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
            placeholder="Ej. Requerida"
          />
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

      {/* Layer Structure Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-8">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-lg">Estructura {structureType}</h3>
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
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {structureLayers.map((layer) => (
                            <tr key={layer.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 font-medium text-slate-900">{layer.name}</td>
                                <td className="px-4 py-3 text-center">{layer.a}</td>
                                <td className="px-4 py-3 text-center">{layer.m}</td>
                                <td className="px-4 py-3 text-right font-mono">{formatNum(layer.mr, 0)}</td>
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
                        </tr>
                        <tr className="bg-white border-t border-slate-200">
                            <td colSpan={5} className="px-4 py-4 text-right text-slate-500 font-medium">
                                ESAL's Soportados por la Estructura (W18):
                            </td>
                            <td colSpan={3} className="px-4 py-4 text-right text-blue-600 font-mono text-xl">
                                {formatNum(esalsForSnTotal, 0)}
                            </td>
                        </tr>
                        <tr className="bg-white border-t border-slate-200">
                            <td colSpan={5} className="px-4 py-4 text-right text-slate-500 font-medium">
                                Vida Remanente Estimada:
                            </td>
                            <td colSpan={3} className="px-4 py-4 text-right text-emerald-600 font-mono text-xl">
                                {formatNum(remainingLifeYears, 1)} años
                            </td>
                        </tr>
                    </tbody>
                </table>
              </div>

              {/* Mobile View - Enhanced for Readability */}
              <div className="md:hidden space-y-3">
                    <div className="flex text-xs font-bold text-slate-400 px-3 uppercase tracking-wider">
                        <div className="flex-grow">Capa</div>
                        <div className="w-16 text-center">Calc</div>
                        <div className="w-20 text-center">Real (cm)</div>
                    </div>
                    {structureLayers.map((layer, index) => (
                        <div key={layer.id} className="bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
                            <div className="flex items-center gap-3">
                                {/* Layer Name & Details */}
                                <div className="flex-grow min-w-0">
                                    <div className="text-sm font-bold text-slate-900 leading-tight mb-1 break-words">
                                        {layer.name}
                                    </div>
                                    {/* Compact Details Grid */}
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-500">
                                        <div>E(psi): <span className="text-slate-700">{formatNum(layer.mr, 0)}</span></div>
                                        <div>a: <span className="text-slate-700">{layer.a}</span></div>
                                        <div>m: <span className="text-slate-700">{layer.m}</span></div>
                                        <div className="text-orange-600 font-semibold">SN: {formatNum(layer.snReq)}</div>
                                    </div>
                                </div>

                                {/* Calculated Thickness */}
                                <div className="w-16 flex flex-col items-center justify-center border-l border-slate-100 pl-2">
                                    <span className="text-xs font-mono text-slate-500">{formatNum(layer.h_cm_calc)}</span>
                                </div>

                                {/* Input Real Thickness */}
                                <div className="w-20 pl-2">
                                    <input
                                        type="number"
                                        value={layer.h_cm_real}
                                        onChange={(e) => handleRealThicknessChange(layer.id, e.target.value)}
                                        className="w-full bg-white border border-slate-300 rounded px-1 py-2 text-center text-slate-900 font-bold text-sm focus:border-blue-500 outline-none transition-colors"
                                        onClick={(e) => (e.target as HTMLInputElement).select()}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {/* Subgrade Info Mobile */}
                    <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs text-slate-500 flex flex-col gap-2">
                         <div className="flex justify-between items-center">
                            <span>Terracerías / Subrasante</span>
                            <span>Módulo Resiliente: <strong className="text-blue-600">{formatNum(genData.subgradeMr, 0)} psi</strong></span>
                         </div>
                         <div className="flex justify-between items-center border-t border-slate-200 pt-2">
                            <span className="font-bold text-emerald-600">SN Total:</span>
                            <span className="font-bold text-emerald-600">{formatNum(snTotalProvided)}</span>
                         </div>
                    </div>

                    {/* ESALs and Remaining Life Mobile */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-md">
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">ESAL's Soportados (W18)</div>
                            <div className="text-xl font-mono text-blue-600 font-bold">{formatNum(esalsForSnTotal, 0)}</div>
                        </div>
                        <div className="pt-2 border-t border-slate-100">
                            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Vida Remanente Estimada</div>
                            <div className="text-xl font-mono text-emerald-600 font-bold">{formatNum(remainingLifeYears, 1)} años</div>
                        </div>
                    </div>
              </div>
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
    </div>
  );
};

export default EsalsPage;