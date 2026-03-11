import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { VEHICLE_NAMES, DEFAULT_COMPOSITION } from '../constants';
import { CompositionData, CalculationMethod, AxleInputRow } from '../types';

// The indices of the "Common" vehicles as requested (1, 2, 6, 8, 15, 16, 25 in 1-based view)
// Mapped to 0-based index: A2(0), B2(1), C2(5), C38(7), T3S2(14), T3S3(15), T3S2R4(24)
const COMMON_INDICES = [0, 1, 5, 7, 14, 15, 24];

const CompositionPage: React.FC = () => {
  const navigate = useNavigate();
  
  // -- State --
  const [method, setMethod] = useState<CalculationMethod>('vehicles');
  const [viewMode, setViewMode] = useState<'common' | 'all'>('all'); // Sub-mode for 'vehicles'
  
  // Data for Method 1 & 2 (Vehicles)
  const [vehicleValues, setVehicleValues] = useState<CompositionData>(DEFAULT_COMPOSITION);
  
  // Data for Method 3 (Direct Axles)
  const [directRows, setDirectRows] = useState<AxleInputRow[]>([]);

  // Load initial data
  useEffect(() => {
    // 1. Load Method
    const savedMethod = localStorage.getItem('calculationMethod') as CalculationMethod | null;
    if (savedMethod) {
        setMethod(savedMethod);
        // If we loaded 'vehicles' method, we default to 'all' view, unless user logic suggests otherwise.
        // But the prompt says "default is form 2 (All)".
    }

    // 2. Load Vehicle Data
    const savedVeh = localStorage.getItem('compVehData');
    if (savedVeh) {
      try {
        setVehicleValues(JSON.parse(savedVeh));
      } catch (e) {
        console.error("Error loading composition data", e);
      }
    }

    // 3. Load Direct Axle Data
    const savedDirect = localStorage.getItem('directAxleData');
    if (savedDirect) {
        try {
            setDirectRows(JSON.parse(savedDirect));
        } catch (e) { console.error(e); }
    } else {
        // Init with one empty row if nothing exists
        setDirectRows([{ id: 'row_1', l2: 1, lxKip: 18, count: 0 }]);
    }
  }, []);

  // --- Logic for Vehicle Mode ---
  const totalPercentage = useMemo(() => {
    return vehicleValues.reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [vehicleValues]);

  const isVehicleValid = Math.abs(totalPercentage - 100.0) < 0.01;

  const handleVehicleChange = (index: number, valStr: string) => {
    const newVal = parseFloat(valStr);
    const newValues = [...vehicleValues];
    newValues[index] = isNaN(newVal) ? 0 : newVal;
    setVehicleValues(newValues);
  };

  // --- Logic for Direct Axle Mode ---
  const handleAddRow = () => {
      setDirectRows(prev => [
          ...prev, 
          { id: `row_${Date.now()}`, l2: 1, lxKip: 0, count: 0 }
      ]);
  };

  const handleRemoveRow = (id: string) => {
      setDirectRows(prev => prev.filter(r => r.id !== id));
  };

  const handleRowChange = (id: string, field: keyof AxleInputRow, value: number) => {
      setDirectRows(prev => prev.map(r => {
          if (r.id !== id) return r;
          return { ...r, [field]: value };
      }));
  };

  const isDirectValid = directRows.length > 0 && directRows.every(r => r.count > 0 && r.lxKip > 0);

  // --- Global Save ---
  const handleSave = () => {
    if (method === 'vehicles' && !isVehicleValid) {
      alert("La sumatoria vehicular debe ser exactamente 100.00% para continuar.");
      return;
    }
    if (method === 'direct' && !isDirectValid) {
        alert("Asegúrese de ingresar al menos un eje con carga y cantidad mayor a cero.");
        return;
    }

    // Save common state
    localStorage.setItem('calculationMethod', method);

    if (method === 'vehicles') {
        localStorage.setItem('compVehData', JSON.stringify(vehicleValues));
    } else {
        localStorage.setItem('directAxleData', JSON.stringify(directRows));
    }

    navigate('/ejes');
  };

  const handleResetVehicles = () => {
    if(window.confirm("¿Restablecer porcentajes a los valores por defecto?")) {
        setVehicleValues(DEFAULT_COMPOSITION);
    }
  };

  const handleTabChange = (mode: 'common' | 'all' | 'direct') => {
      if (mode === 'direct') {
          setMethod('direct');
      } else {
          setMethod('vehicles');
          setViewMode(mode);
      }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-32">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Composición vehicular en %</h1>
        <p className="text-slate-500">Seleccione el método de ingreso de datos.</p>
      </header>

      {/* Mode Tabs */}
      <div className="flex flex-col sm:flex-row gap-2 bg-white p-1 rounded-lg mb-8 border border-slate-200 shadow-sm">
          <button
            onClick={() => handleTabChange('common')}
            className={`flex-1 py-3 px-4 rounded-md font-bold text-sm transition-all ${
                method === 'vehicles' && viewMode === 'common'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
              <i className="fas fa-car-side mr-2"></i> 1. Datos Viales (Comunes)
          </button>
          <button
            onClick={() => handleTabChange('all')}
            className={`flex-1 py-3 px-4 rounded-md font-bold text-sm transition-all ${
                method === 'vehicles' && viewMode === 'all'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
              <i className="fas fa-list mr-2"></i> 2. Todos (NOM-012)
          </button>
          <button
            onClick={() => handleTabChange('direct')}
            className={`flex-1 py-3 px-4 rounded-md font-bold text-sm transition-all ${
                method === 'direct'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
              <i className="fas fa-pencil-alt mr-2"></i> 3. Eje por Eje (Directo)
          </button>
      </div>
      
      {/* ---------------- METHOD 1 & 2: VEHICLES ---------------- */}
      {method === 'vehicles' && (
        <>
            <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-slate-500">
                    {viewMode === 'common' 
                        ? 'Mostrando solo los 7 tipos vehiculares más frecuentes.' 
                        : 'Mostrando los 29 tipos vehiculares de la normativa.'}
                </div>
                <div className="flex items-center gap-4">
                    <button 
                        onClick={handleResetVehicles}
                        className="text-xs text-slate-400 hover:text-slate-600 underline"
                    >
                        Restablecer
                    </button>
                    <div className={`
                        px-4 py-2 rounded font-mono font-bold border flex items-center gap-2
                        ${isVehicleValid 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                            : 'bg-red-50 border-red-200 text-red-600'}
                    `}>
                        <span>Total: {totalPercentage.toFixed(2)}%</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {VEHICLE_NAMES.map((name, index) => {
                    // Filter Logic: If mode is 'common', only show if index is in COMMON_INDICES
                    if (viewMode === 'common' && !COMMON_INDICES.includes(index)) {
                        return null;
                    }

                    const isCommon = COMMON_INDICES.includes(index);
                    const isVisible = viewMode === 'all' || isCommon;

                    if (!isVisible) return null;

                    return (
                        <div 
                            key={name} 
                            className={`
                                relative border rounded-lg p-4 flex items-center gap-4 transition-all duration-200
                                ${isCommon 
                                    ? 'bg-white border-blue-200 shadow-sm' 
                                    : 'bg-white border-slate-200'
                                }
                            `}
                        >
                            <div className="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 border border-slate-200">
                                {index + 1}
                            </div>
                            
                            <div className="flex-grow">
                                <label className="block text-xs mb-1 text-slate-500 font-semibold">
                                    {name}
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={vehicleValues[index]}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => handleVehicleChange(index, e.target.value)}
                                        className={`
                                            w-full rounded px-3 py-2 text-right focus:outline-none focus:ring-1 font-mono bg-white border border-slate-300 text-slate-900 focus:border-blue-500 focus:ring-blue-500
                                        `}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {!isVehicleValid && (
                 <div className="mt-4 text-center text-red-600 text-sm font-semibold bg-red-50 py-2 rounded border border-red-200">
                    <i className="fas fa-exclamation-circle mr-2"></i>
                    La suma debe ser 100%. Diferencia: {(100 - totalPercentage).toFixed(2)}%
                 </div>
            )}
        </>
      )}

      {/* ---------------- METHOD 3: DIRECT AXLES ---------------- */}
      {method === 'direct' && (
          <div className="max-w-4xl mx-auto">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                      <h3 className="font-bold text-emerald-600 flex items-center gap-2">
                          <i className="fas fa-table"></i> Ingreso Manual de Ejes
                      </h3>
                      <button 
                        onClick={handleAddRow}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-sm font-bold flex items-center gap-2 transition-colors shadow-sm"
                      >
                          <i className="fas fa-plus"></i> Agregar Eje
                      </button>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-100 text-slate-700 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 text-center w-16">No.</th>
                                <th className="px-4 py-3 w-40">Tipo de Eje (L2)</th>
                                <th className="px-4 py-3 text-right">Carga LX (kip)</th>
                                <th className="px-4 py-3 text-right">Ejes 1er Año</th>
                                <th className="px-4 py-3 text-center w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {directRows.map((row, index) => (
                                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-center font-mono text-slate-400">
                                        {index + 1}
                                    </td>
                                    <td className="px-4 py-3">
                                        <select 
                                            value={row.l2}
                                            onChange={(e) => handleRowChange(row.id, 'l2', parseInt(e.target.value) as 1|2|3)}
                                            className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-slate-900 focus:border-emerald-500 focus:outline-none"
                                        >
                                            <option value={1}>1 - Sencillo</option>
                                            <option value={2}>2 - Tándem</option>
                                            <option value={3}>3 - Trídem</option>
                                        </select>
                                    </td>
                                    <td className="px-4 py-3">
                                        <input 
                                            type="number"
                                            min="0"
                                            value={row.lxKip}
                                            onChange={(e) => handleRowChange(row.id, 'lxKip', parseFloat(e.target.value))}
                                            className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-right text-slate-900 focus:border-emerald-500 focus:outline-none font-mono"
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <input 
                                            type="number"
                                            min="0"
                                            value={row.count}
                                            onChange={(e) => handleRowChange(row.id, 'count', parseFloat(e.target.value))}
                                            className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-right text-slate-900 focus:border-emerald-500 focus:outline-none font-mono"
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {directRows.length > 1 && (
                                            <button 
                                                onClick={() => handleRemoveRow(row.id)}
                                                className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition-colors"
                                            >
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {directRows.length > 0 && (
                            <tfoot className="bg-slate-50 font-bold text-slate-700">
                                <tr>
                                    <td colSpan={3} className="px-4 py-3 text-right">TOTAL EJES:</td>
                                    <td className="px-4 py-3 text-right text-emerald-600">
                                        {Math.round(directRows.reduce((acc, r) => acc + (r.count || 0), 0)).toLocaleString()}
                                    </td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                  </div>
              </div>
          </div>
      )}

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 p-4 z-40 shadow-lg no-print">
        <div className="max-w-7xl mx-auto flex justify-end items-center">
            <button 
                onClick={handleSave}
                className={`
                    px-8 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-all
                    ${(method === 'vehicles' ? isVehicleValid : isDirectValid)
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200' 
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
                `}
            >
                <i className="fas fa-save"></i>
                {method === 'vehicles' ? 'Calcular Ejes' : 'Ir a Diseño'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default CompositionPage;