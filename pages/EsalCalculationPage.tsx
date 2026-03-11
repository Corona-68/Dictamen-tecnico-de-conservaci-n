
import React, { useState, useEffect, useMemo } from 'react';
import { GeneralData, CompositionData } from '../types';
import { DEFAULT_COMPOSITION, DEFAULT_GENERAL_DATA } from '../constants';
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
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Cálculo de ejes equivalentes ESAL's</h1>
                <div className="flex flex-wrap items-end gap-6 mt-6">
                    <div className="bg-white border border-slate-200 px-6 py-3 rounded-xl shadow-sm">
                        <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">TDPA</label>
                        <div className="text-xl font-mono text-slate-900">{genData.tdpa.toLocaleString()}</div>
                    </div>
                    <div className="bg-white border border-slate-200 px-6 py-3 rounded-xl shadow-sm">
                        <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Pt (Vida Terminal)</label>
                        <div className="text-xl font-mono text-slate-900">{genData.finalServiceability}</div>
                    </div>
                    <div className="bg-white border border-blue-200 px-6 py-3 rounded-xl shadow-lg shadow-blue-500/5">
                        <label className="block text-[10px] uppercase tracking-widest text-blue-600 font-bold mb-1">SN (Nº Estructural)</label>
                        <input
                            type="number"
                            value={genData.snSeed}
                            onChange={handleChangeSN}
                            step="0.1"
                            min="0"
                            className="bg-transparent text-xl font-mono text-slate-900 border-none focus:ring-0 w-24 p-0"
                        />
                    </div>

                    {/* ESAL Summary Card */}
                    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-md min-w-[240px]">
                        <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">ESALs DE DISEÑO</div>
                        <div className="text-4xl font-bold text-blue-600 mb-2">
                            {formatNum(totalESALsDesign, 0)}
                        </div>
                        <div className="text-slate-600 text-sm font-medium">
                            1er Año: <span className="text-slate-900">{formatNum(totalESALs1Year, 0)}</span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-slate-500 uppercase font-bold border-b border-slate-200 bg-slate-50">
                            <tr>
                                <th className="py-4 px-6">No.</th>
                                <th className="py-4 px-6">Tipo</th>
                                <th className="py-4 px-6">Estado</th>
                                <th className="py-4 px-6 text-right">W(Kip´s)</th>
                                <th className="py-4 px-6 text-right">Fx</th>
                                <th className="py-4 px-6 text-right text-orange-600">Esal´s 1er. año</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {esalRows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-3 px-6 text-slate-400">{row.no}</td>
                                    <td className="py-3 px-6 text-slate-900 font-medium">{row.tipo}</td>
                                    <td className="py-3 px-6 text-slate-500">{row.estado}</td>
                                    <td className="py-3 px-6 text-right font-mono text-blue-600">{formatNum(row.lxKip, 1)}</td>
                                    <td className="py-3 px-6 text-right font-mono text-emerald-600">{formatNum(row.fx, 4)}</td>
                                    <td className="py-3 px-6 text-right font-mono text-orange-600">{formatNum(row.esalAnio, 0)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="border-t border-slate-200 font-bold bg-slate-50">
                            <tr>
                                <td colSpan={5} className="py-6 px-6 text-right text-slate-500 text-base">Total ESAL's 1er Año:</td>
                                <td className="py-6 px-6 text-right text-orange-600 font-mono text-2xl">{formatNum(totalESALs1Year, 0)}</td>
                            </tr>
                        </tfoot>
                    </table>
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
