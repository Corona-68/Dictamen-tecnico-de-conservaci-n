import React, { useState, useEffect, useMemo } from 'react';
import { GeneralData, CompositionData, RowResult, CalculationMethod } from '../types';
import { DEFAULT_COMPOSITION, DEFAULT_GENERAL_DATA, TABLE_STATIC_ROWS, VEHICLE_NAMES } from '../constants';
import { calculateUnamDamage, calculateUnamTotalAccumulated } from '../utils/calculations';

const UnamPage: React.FC = () => {
    const [method, setMethod] = useState<CalculationMethod>('vehicles');
    const [genData, setGenData] = useState<GeneralData>(DEFAULT_GENERAL_DATA);
    const [compData, setCompData] = useState<CompositionData>(DEFAULT_COMPOSITION);
    const [zDepth, setZDepth] = useState<number>(0);

    useEffect(() => {
        const savedMethod = localStorage.getItem('calculationMethod') as CalculationMethod | null;
        if (savedMethod) setMethod(savedMethod);

        const savedGen = localStorage.getItem('datosGeneralesData');
        if (savedGen) setGenData(JSON.parse(savedGen));

        const savedComp = localStorage.getItem('compVehData');
        if (savedComp) setCompData(JSON.parse(savedComp));
    }, []);

    const formatNumber = (num: number) => Math.round(num).toLocaleString('en-US');
    const formatDecimal = (num: number) => num.toFixed(5);

    // --- ACCUMULATION CALCULATIONS ---
    const { totalEquiv1stYear, ct, totalAccumulated, rows } = useMemo(() => {
        return calculateUnamTotalAccumulated(genData, compData, zDepth);
    }, [genData, compData, zDepth]);

    const filteredRows = useMemo(() => rows.filter(r => r.equiv > 0), [rows]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 pb-24">
            <header className="mb-6">
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Análisis UNAM</h1>
                <p className="text-slate-500">Concentrado de cargas y daño unitario</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm border-l-4 border-l-blue-500">
                        <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Suma Ejes Equiv. 1er Año</div>
                        <div className="text-2xl font-bold text-slate-900 font-mono">{formatNumber(totalEquiv1stYear)}</div>
                    </div>
                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm border-l-4 border-l-amber-500">
                        <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Coef. Acumulación (CT)</div>
                        <div className="text-2xl font-bold text-slate-900 font-mono">{ct.toFixed(4)}</div>
                        <div className="text-[10px] text-slate-400 mt-1">r: {genData.growthRate}% | n: {genData.designPeriod} años</div>
                    </div>
                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm border-l-4 border-l-emerald-500">
                        <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Total Ejes Equiv. Acumulados</div>
                        <div className="text-2xl font-bold text-emerald-600 font-mono">{formatNumber(totalAccumulated)}</div>
                        <div className="text-[10px] text-slate-400 mt-1 italic">Fórmula: Σ(Ejes 1er Año * Daño) * CT</div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-4 mt-6 items-end">
                    <div className="bg-white px-3 py-1 rounded text-slate-600 border border-slate-200 shadow-sm flex items-center h-10">
                        Clasificación: <strong className="text-slate-900 ml-2">{genData.roadType === 'ET_A' ? 'Tipo A' : `Tipo ${genData.roadType}`}</strong>
                    </div>
                    <div className="bg-white px-3 py-1 rounded text-slate-600 border border-slate-200 shadow-sm flex items-center gap-2 h-10">
                        <label className="text-[10px] font-bold uppercase text-slate-400 leading-none">Profundidad Z (cm)</label>
                        <input 
                            type="number" 
                            value={zDepth}
                            onChange={(e) => setZDepth(parseFloat(e.target.value) || 0)}
                            className="bg-transparent border-none outline-none text-slate-900 font-bold w-12 p-0 leading-none"
                        />
                    </div>
                </div>
            </header>

            {method === 'direct' ? (
                <div className="bg-amber-50 border border-amber-200 p-6 rounded-xl text-amber-800 flex items-center gap-4">
                    <i className="fas fa-exclamation-triangle text-2xl"></i>
                    <div>
                        <h3 className="font-bold">Modo de Ingreso Directo Detectado</h3>
                        <p className="text-sm">Esta sección requiere la composición vehicular por tipo de vehículo (NOM-012) para realizar el análisis UNAM. Por favor, regrese a la pestaña "Comp. Ejes" y seleccione el método 1 o 2.</p>
                    </div>
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-8">
                    <div className="p-4">
                        {/* Header - Desktop Only */}
                        <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-400 uppercase px-4 mb-2">
                            <div className="col-span-1 text-center">NO.</div>
                            <div className="col-span-2">TIPO</div>
                            <div className="col-span-2">ESTADO</div>
                            <div className="col-span-1 text-right">W(TON)</div>
                            <div className="col-span-2 text-right">EJES 1er AÑO</div>
                            <div className="col-span-2 text-right">Daño Unitario</div>
                            <div className="col-span-2 text-right">EjesEquiv.1er.año</div>
                        </div>

                        <div className="space-y-4">
                            {filteredRows.map((row, index) => {
                                return (
                                    <div key={index} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm md:border-none md:p-0 md:shadow-none">
                                        {/* Mobile Header */}
                                        <div className="flex justify-between items-center md:hidden mb-4 border-b border-slate-100 pb-2">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registro #{row.no}</span>
                                            <span className="text-sm font-bold text-slate-900">{row.tipo}</span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-2 items-center">
                                            {/* NO - Desktop Only */}
                                            <div className="hidden md:block col-span-1 text-center text-slate-400">{row.no}</div>
                                            
                                            {/* TIPO - Desktop Only */}
                                            <div className="hidden md:block col-span-2 font-medium text-slate-900">{row.tipo}</div>

                                            {/* ESTADO */}
                                            <div className="md:col-span-2">
                                                <label className="block md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1">Estado</label>
                                                <div className="text-sm text-slate-700">{row.estado}</div>
                                            </div>

                                            {/* W(TON) */}
                                            <div className="md:col-span-1">
                                                <label className="block md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1 text-right">W(TON)</label>
                                                <div className="text-sm font-mono text-right">{row.wTon.toFixed(1)}</div>
                                            </div>

                                            {/* EJES 1er AÑO */}
                                            <div className="md:col-span-2">
                                                <label className="block md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1 text-right">EJES 1er AÑO</label>
                                                <div className="text-sm font-mono text-right">{formatNumber(row.ejes)}</div>
                                            </div>

                                            {/* Daño Unitario */}
                                            <div className="md:col-span-2">
                                                <label className="block md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1 text-right">Daño Unitario</label>
                                                <div className="text-sm font-mono text-right text-blue-600 font-bold">{formatDecimal(row.damage)}</div>
                                            </div>

                                            {/* EjesEquiv.1er.año */}
                                            <div className="md:col-span-2">
                                                <label className="block md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1 text-right">EjesEquiv.1er.año</label>
                                                <div className="text-sm font-mono text-right text-emerald-600 font-bold">{formatNumber(row.equiv)}</div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 px-4">
                            <div className="flex justify-between w-full md:w-auto gap-8">
                                <div className="text-center md:text-left">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase">Total Ejes 1er Año</div>
                                    <div className="text-lg font-bold text-slate-900 font-mono">
                                        {formatNumber(rows.reduce((sum, r) => sum + r.ejes, 0))}
                                    </div>
                                </div>
                                <div className="text-center md:text-right">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase">Total Ejes Equiv.</div>
                                    <div className="text-lg font-bold text-emerald-600 font-mono">
                                        {formatNumber(totalEquiv1stYear)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-end no-print">
                <button 
                    onClick={() => window.print()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold transition-all shadow-md"
                >
                    <i className="fas fa-print mr-2"></i> Imprimir Análisis
                </button>
            </div>
        </div>
    );
};

export default UnamPage;
