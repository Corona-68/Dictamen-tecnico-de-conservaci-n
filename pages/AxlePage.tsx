import React, { useState, useEffect, useMemo } from 'react';
import { GeneralData, CompositionData, RowResult, CalculationMethod, AxleInputRow } from '../types';
import { DEFAULT_COMPOSITION, DEFAULT_GENERAL_DATA, TABLE_STATIC_ROWS, VEHICLE_NAMES } from '../constants';

const AxlePage: React.FC = () => {
    const [method, setMethod] = useState<CalculationMethod>('vehicles');
    const [genData, setGenData] = useState<GeneralData>(DEFAULT_GENERAL_DATA);
    const [compData, setCompData] = useState<CompositionData>(DEFAULT_COMPOSITION);
    const [directRows, setDirectRows] = useState<AxleInputRow[]>([]);

    useEffect(() => {
        const savedMethod = localStorage.getItem('calculationMethod') as CalculationMethod | null;
        if (savedMethod) setMethod(savedMethod);

        const savedGen = localStorage.getItem('datosGeneralesData');
        if (savedGen) setGenData(JSON.parse(savedGen));

        const savedComp = localStorage.getItem('compVehData');
        if (savedComp) setCompData(JSON.parse(savedComp));
        
        const savedDirect = localStorage.getItem('directAxleData');
        if (savedDirect) setDirectRows(JSON.parse(savedDirect));
    }, []);

    // --- LOGIC FOR METHOD 1 & 2: VEHICLE COMPOSITION ---
    const vehicleResults: RowResult[] = useMemo(() => {
        if (method !== 'vehicles') return [];

        const compObj: Record<string, number> = {};
        VEHICLE_NAMES.forEach((name, idx) => {
            compObj[name] = compData[idx] || 0;
        });

        const getVal = (key: string) => compObj[key] || 0;

        const Pvc = genData.pvc;
        const TDPA = genData.tdpa;
        
        let fcp = 0.5;
        if (genData.lanes === '2') fcp = 0.45;
        if (genData.lanes === '3+') fcp = 0.4;

        const TDPAcd = fcp * TDPA;
        const fvp = 0.0365 * Pvc * TDPAcd;
        const fvv = 0.0365 * (100 - Pvc) * TDPAcd;

        // The formulas
        const formulas = [
            // 0
            () => 2 * getVal("A2") * (fvp + fvv),
            // 1
            () => (100 - getVal("A2") + getVal("B4")) * fvp,
            // 2
            () => (getVal("B2") + getVal("C2") + getVal("T2S1") + getVal("T2S2") + getVal("T2S3") + getVal("T2S2S2")) * fvp,
            // 3
            () => (2*getVal("C2R2") + 2*getVal("C3R2") + getVal("C3R3") + getVal("C2R3") + 3*getVal("T2S1R2") + 2*getVal("T2S1R3") + 2*getVal("T2S2R2") + 3*getVal("T3S1R2") + 2*getVal("T3S1R3") + 2*getVal("T3S2R2") + getVal("T3S2R3")) * fvp,
            // 4
            () => (getVal("T2S1") + getVal("T3S1")) * fvp,
            // 5
            () => (getVal("C2R2") + getVal("C2R3") + getVal("T2S1R2") + getVal("T2S1R3") + getVal("T2S2R2")) * fvp,
            // 6
            () => (getVal("B2") + getVal("B36") + getVal("B38") + 2*getVal("B4") + 2*getVal("C2") + getVal("C36") + getVal("C38") + 4*getVal("C2R2") + 3*getVal("C3R2") + 2*getVal("C3R3") + 3*getVal("C2R3") + 3*getVal("T2S1") + 2*getVal("T2S2") + getVal("T3S2") + getVal("T3S3") + 2*getVal("T3S1") + 5*getVal("T2S1R2") + 4*getVal("T2S1R3") + 4*getVal("T2S2R2") + 4*getVal("T3S1R2") + 3*getVal("T3S1R3") + 3*getVal("T3S2R2") + getVal("T3S2R4") + 2*getVal("T3S2R3") + getVal("T3S3S2") + 2*getVal("T2S2S2") + getVal("T3S2S2")) * fvv,
            // 7
            () => (getVal("B2") + getVal("B36") + getVal("B38") + getVal("B4")) * fvv,
            // 8
            () => (getVal("B36") + getVal("B4") + getVal("C36") + getVal("T3S1R3")) * fvp,
            // 9
            () => (getVal("B38") + getVal("C38") + getVal("T3S2") + getVal("T3S3") + getVal("T3S1") + getVal("T3S2S2")) * fvp,
            // 10
            () => (getVal("C3R3") + getVal("C2R3") + getVal("T2S1R3") + getVal("T2S2R2") + getVal("T3S1R3") + getVal("T3S2R2") + 3*getVal("T3S2R4") + 2*getVal("T3S2R3") + 2*getVal("T2S2S2") + 2*getVal("T3S2S2")) * fvp,
            // 11
            () => (getVal("T2S2") + getVal("T3S2") + getVal("T3S3S2")) * fvp,
            // 12
            () => (getVal("C3R2") + getVal("C3R3") + getVal("T3S1R2") + getVal("T3S2R2") + getVal("T3S2R4") + getVal("T3S2R3") + getVal("T3S3S2")) * fvp,
            // 13
            () => (getVal("C36") + getVal("C38") + getVal("C3R2") + 2*getVal("C3R3") + getVal("C2R3") + getVal("T2S2") + 2*getVal("T3S2") + getVal("T3S3") + getVal("T3S1") + getVal("T2S1R3") + getVal("T2S2R2") + getVal("T3S1R2") + 2*getVal("T3S1R3") + 2*getVal("T3S2R2") + 4*getVal("T3S2R4") + 3*getVal("T3S2R3") + 2*getVal("T3S3S2") + 2*getVal("T2S2S2") + 3*getVal("T3S2S2")) * fvv,
            // 14
            () => getVal("T3S3S2") * fvp,
            // 15
            () => (getVal("T3S3") + getVal("T2S3")) * fvp,
            // 16
            () => getVal("T3S3S2") * fvv
        ];

        return TABLE_STATIC_ROWS.map((staticRow, index) => {
            const calculatedVal = formulas[index] ? formulas[index]() : 0;
            return {
                no: staticRow[0],
                tipo: staticRow[1],
                estado: staticRow[2],
                llantas: staticRow[3],
                etya: staticRow[4],
                b: staticRow[5],
                c: staticRow[6],
                d: staticRow[7],
                result: calculatedVal
            };
        });

    }, [genData, compData, method]);

    // Calculate Total
    const totalEjes = useMemo(() => {
        if (method === 'direct') {
            return directRows.reduce((sum, row) => sum + (row.count || 0), 0);
        }
        return vehicleResults.reduce((sum, row) => sum + row.result, 0);
    }, [vehicleResults, directRows, method]);

    const formatNumber = (num: number) => Math.round(num).toLocaleString('en-US');

    // --- RENDER ---
    return (
        <div className="max-w-7xl mx-auto px-4 py-8 pb-24">
            <header className="mb-6">
                <h1 className="text-3xl font-bold text-slate-900">Resultados de Ejes</h1>
                <p className="text-slate-500">Año 1 de operación</p>
                
                {method === 'direct' ? (
                     <div className="mt-4 bg-emerald-50 border border-emerald-200 p-3 rounded-lg inline-block">
                         <strong className="text-emerald-600"><i className="fas fa-info-circle"></i> Modo Directo:</strong> Se están usando los ejes ingresados manualmente.
                     </div>
                ) : (
                    <div className="flex flex-wrap gap-2 md:gap-4 mt-4 text-xs md:text-sm">
                        <div className="bg-white px-3 py-1 rounded text-slate-600 border border-slate-200 shadow-sm">
                            TDPA: <strong className="text-slate-900">{genData.tdpa}</strong>
                        </div>
                        <div className="bg-white px-3 py-1 rounded text-slate-600 border border-slate-200 shadow-sm">
                            PVC: <strong className="text-slate-900">{genData.pvc}%</strong>
                        </div>
                        <div className="bg-white px-3 py-1 rounded text-slate-600 border border-slate-200 shadow-sm">
                            Carriles: <strong className="text-slate-900">{genData.lanes}</strong>
                        </div>
                    </div>
                )}
            </header>

            {/* Total Highlight */}
            <div className="bg-white border-l-4 border-emerald-500 p-4 rounded mb-8 shadow-md max-w-sm border border-slate-200">
                <div className="text-sm text-slate-500 mb-1">Total Ejes Acumulados (1er Año)</div>
                <div className="text-3xl font-bold text-emerald-600">{formatNumber(totalEjes)}</div>
            </div>

            {/* ---------------- DIRECT MODE TABLE ---------------- */}
            {method === 'direct' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-8">
                    <table className="w-full text-sm text-left text-slate-600">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                            <tr>
                                <th className="px-6 py-3 text-center">No.</th>
                                <th className="px-6 py-3">Tipo (L2)</th>
                                <th className="px-6 py-3 text-right">Carga (Lx)</th>
                                <th className="px-6 py-3 text-right font-bold text-emerald-600">Ejes 1er Año</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {directRows.map((row, index) => (
                                <tr key={row.id || index} className="hover:bg-slate-50">
                                    <td className="px-6 py-3 text-center">{index + 1}</td>
                                    <td className="px-6 py-3">
                                        {row.l2 === 1 && "Sencillo"}
                                        {row.l2 === 2 && "Tándem"}
                                        {row.l2 === 3 && "Trídem"}
                                    </td>
                                    <td className="px-6 py-3 text-right font-mono">{row.lxKip} kip</td>
                                    <td className="px-6 py-3 text-right font-bold text-emerald-600 font-mono">
                                        {formatNumber(row.count)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ---------------- VEHICLE MODE TABLE ---------------- */}
            {method === 'vehicles' && (
                <>
                    {/* Desktop Table */}
                    <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-8">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-slate-600">
                                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-center">No.</th>
                                        <th className="px-4 py-3">Tipo</th>
                                        <th className="px-4 py-3">Estado</th>
                                        <th className="px-4 py-3 text-center">Llantas</th>
                                        <th className="px-4 py-3 text-right">ET y A</th>
                                        <th className="px-4 py-3 text-right">B</th>
                                        <th className="px-4 py-3 text-right">C</th>
                                        <th className="px-4 py-3 text-right">D</th>
                                        <th className="px-4 py-3 text-right bg-slate-100 text-emerald-600 font-bold">Ejes 1er Año</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vehicleResults.map((row, index) => (
                                        <tr key={index} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 text-center">{row.no}</td>
                                            <td className="px-4 py-3 font-medium text-slate-900">{row.tipo}</td>
                                            <td className="px-4 py-3">{row.estado}</td>
                                            <td className="px-4 py-3 text-center">{row.llantas}</td>
                                            <td className="px-4 py-3 text-right">{row.etya.toFixed(1)}</td>
                                            <td className="px-4 py-3 text-right">{row.b.toFixed(1)}</td>
                                            <td className="px-4 py-3 text-right">{row.c.toFixed(1)}</td>
                                            <td className="px-4 py-3 text-right">{row.d.toFixed(1)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-600 bg-emerald-50/30">
                                                {formatNumber(row.result)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-4 mb-8">
                        {vehicleResults.map((row) => (
                            <div key={row.no} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                                <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-2">
                                    <div>
                                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded mr-2">#{row.no}</span>
                                        <span className="font-bold text-slate-900 text-lg">{row.tipo}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-slate-400 mb-0.5">Resultado</div>
                                        <div className="font-bold text-emerald-600 text-lg">{formatNumber(row.result)}</div>
                                    </div>
                                </div>
                                <div className="text-xs text-slate-500 flex gap-4">
                                    <span>{row.estado}</span>
                                    <span>{row.llantas} llantas</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div className="flex justify-end no-print">
                <button 
                    onClick={() => window.print()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold transition-all shadow-md"
                >
                    <i className="fas fa-print mr-2"></i> Imprimir Reporte
                </button>
            </div>
        </div>
    );
};

export default AxlePage;