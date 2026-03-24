
import React, { useState, useEffect, useMemo } from 'react';
import { GeneralData, CompositionData } from '../types';
import { DEFAULT_COMPOSITION, DEFAULT_GENERAL_DATA, VEHICLE_NAMES } from '../constants';
import { calculateEjesResults, calculateEsalRows } from '../utils/calculations';

const EsalCalculationPage: React.FC = () => {
    const [genData, setGenData] = useState<GeneralData>(DEFAULT_GENERAL_DATA);
    const [compData, setCompData] = useState<CompositionData>(DEFAULT_COMPOSITION);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        const savedGen = localStorage.getItem('datosGeneralesData');
        if (savedGen) {
            try {
                setGenData({ ...DEFAULT_GENERAL_DATA, ...JSON.parse(savedGen) });
            } catch (e) { console.error(e); }
        }

        const savedComp = localStorage.getItem('compVehData');
        if (savedComp) {
            try {
                setCompData(JSON.parse(savedComp));
            } catch (e) { console.error(e); }
        }
    }, []);

    const handleChangeSN = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setGenData(prev => ({ ...prev, snSeed: isNaN(val) ? 0 : val }));
    };

    const handleSave = () => {
        localStorage.setItem('datosGeneralesData', JSON.stringify(genData));
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
    };

    const ejesResults = useMemo(() => calculateEjesResults(genData, compData), [genData, compData]);
    const esalRows = useMemo(() => calculateEsalRows(genData, genData.snSeed, ejesResults), [genData, ejesResults]);
    const totalESALs1Year = useMemo(() => esalRows.reduce((acc, r) => acc + r.esalAnio, 0), [esalRows]);

    const growthFactor = useMemo(() => {
        const r = genData.growthRate / 100;
        const n = genData.designPeriod;
        if (r === 0) return n;
        return (Math.pow(1 + r, n) - 1) / r;
    }, [genData.growthRate, genData.designPeriod]);

    const totalESALsDesign = totalESALs1Year * growthFactor;

    const formatNum = (n: number, d: number = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 pb-32">
            <header className="mb-8 text-center border-b-2 border-slate-900 pb-6">
                <h1 className="text-3xl font-bold text-slate-900 mb-2 uppercase tracking-tight">Dictámenes técnicos de conservación periódica 2026</h1>
                <p className="text-slate-500 font-medium">Memoria de Cálculo de Pavimentos (AASHTO 93)</p>
            </header>

            {/* Project & Traffic Info Section (Report Style) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Información del Camino</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between border-b border-slate-100 pb-1">
                            <span className="text-slate-500 text-sm">Carretera:</span>
                            <span className="text-slate-900 font-bold text-sm">{genData.projectName}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1">
                            <span className="text-slate-500 text-sm">Tramo:</span>
                            <span className="text-slate-900 font-bold text-sm">{genData.section}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1">
                            <span className="text-slate-500 text-sm">Clasificación oficial:</span>
                            <span className="text-slate-900 font-bold text-sm">{genData.roadType.replace('ET_', '')}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1">
                            <span className="text-slate-500 text-sm">Tipo de Red:</span>
                            <span className="text-slate-900 font-bold text-sm">{genData.networkType}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Información de Tránsito</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between border-b border-slate-100 pb-1">
                            <span className="text-slate-500 text-sm">TDPA:</span>
                            <span className="text-slate-900 font-bold text-sm">{genData.tdpa.toLocaleString()} Vehículos</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1">
                            <span className="text-slate-500 text-sm">% Vehículos Cargados (Pvc):</span>
                            <span className="text-slate-900 font-bold text-sm">{genData.pvc}%</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1">
                            <span className="text-slate-500 text-sm">Carriles por sentido:</span>
                            <span className="text-slate-900 font-bold text-sm">{genData.lanes}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1">
                            <span className="text-slate-500 text-sm">Periodo de diseño:</span>
                            <span className="text-slate-900 font-bold text-sm">{genData.designPeriod} años</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                {/* Left: Summary and Composition */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-blue-600 text-white p-6 rounded-2xl shadow-xl shadow-blue-200">
                        <div className="text-blue-100 text-[10px] font-bold uppercase tracking-widest mb-1">ESALs de Diseño Totales</div>
                        <div className="text-4xl font-black mb-4">
                            {formatNum(totalESALsDesign, 0)}
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-blue-500/50">
                            <div>
                                <div className="text-blue-200 text-[10px] font-bold uppercase">1er Año</div>
                                <div className="text-lg font-bold">{formatNum(totalESALs1Year, 0)}</div>
                            </div>
                            <div>
                                <div className="text-blue-200 text-[10px] font-bold uppercase">Factor Crec.</div>
                                <div className="text-lg font-bold">{formatNum(growthFactor, 2)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
                            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Composición Vehicular</h4>
                        </div>
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-slate-400 uppercase font-bold">
                                <tr>
                                    <th className="px-4 py-2 text-left">Tipo</th>
                                    <th className="px-4 py-2 text-right">%</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {compData.map((val, idx) => {
                                    if (val <= 0) return null;
                                    return (
                                        <tr key={idx}>
                                            <td className="px-4 py-2 text-slate-700 font-medium">{VEHICLE_NAMES[idx]}</td>
                                            <td className="px-4 py-2 text-right font-mono text-slate-900">{val.toFixed(2)}%</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-white border border-blue-200 p-6 rounded-xl shadow-sm">
                        <label className="block text-[10px] uppercase tracking-widest text-blue-600 font-bold mb-2">SN (Nº Estructural Sugerido)</label>
                        <div className="flex items-center gap-3">
                             <input
                                type="number"
                                value={genData.snSeed}
                                onChange={handleChangeSN}
                                step="0.1"
                                min="0"
                                className="text-3xl font-black text-slate-900 border-none focus:ring-0 w-full p-0 bg-transparent"
                            />
                            <span className="text-slate-300 text-2xl">|</span>
                            <div className="text-slate-400 text-xs italic">Ajuste este valor para recalcular Fx</div>
                        </div>
                    </div>
                </div>

                {/* Right: Detailed Table */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Desglose de Ejes Equivalentes</h4>
                            <div className="text-[10px] text-slate-400">Pt = {genData.finalServiceability}</div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="text-slate-500 uppercase font-bold border-b border-slate-200 bg-slate-50">
                                    <tr>
                                        <th className="py-3 px-4">No.</th>
                                        <th className="py-3 px-4">Tipo</th>
                                        <th className="py-3 px-4">Estado</th>
                                        <th className="py-3 px-4 text-right">W(Kip´s)</th>
                                        <th className="py-3 px-4 text-right">Fx</th>
                                        <th className="py-3 px-4 text-right text-orange-600">Esal´s 1er. año</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {esalRows.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-2 px-4 text-slate-400">{row.no}</td>
                                            <td className="py-2 px-4 text-slate-900 font-medium">{row.tipo}</td>
                                            <td className="py-2 px-4 text-slate-500">{row.estado}</td>
                                            <td className="py-2 px-4 text-right font-mono text-blue-600">{formatNum(row.lxKip, 1)}</td>
                                            <td className="py-2 px-4 text-right font-mono text-emerald-600">{formatNum(row.fx, 4)}</td>
                                            <td className="py-2 px-4 text-right font-mono text-orange-600">{formatNum(row.esalAnio, 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="border-t border-slate-200 font-bold bg-slate-50">
                                    <tr>
                                        <td colSpan={5} className="py-4 px-4 text-right text-slate-500">Total ESAL's 1er Año:</td>
                                        <td className="py-4 px-4 text-right text-orange-600 font-mono text-xl">{formatNum(totalESALs1Year, 0)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 p-4 z-40 no-print">
                <div className="max-w-7xl mx-auto flex justify-end gap-4">
                    <button 
                        onClick={handleSave}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                    >
                        <i className="fas fa-save"></i> Guardar SN
                    </button>
                    <button 
                        onClick={() => window.print()}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3 rounded-lg font-bold transition-all border border-slate-200"
                    >
                        <i className="fas fa-print mr-2"></i> Imprimir
                    </button>
                </div>
            </div>

            {isSaved && (
                <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-full shadow-lg z-50 animate-bounce">
                    <i className="fas fa-check mr-2"></i> SN Guardado Correctamente
                </div>
            )}
        </div>
    );
};

export default EsalCalculationPage;
