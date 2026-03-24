
import { GeneralData } from '../types';
import { TABLE_STATIC_ROWS, VEHICLE_NAMES } from '../constants';

// Approximation of Inverse Standard Normal Distribution (Probit)
export function inverseNormalCDF(p: number): number {
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

export function calculateEjesResults(genData: GeneralData, compData: number[]) {
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
    
    return TABLE_STATIC_ROWS.map((row, i) => formulas[i] ? formulas[i]() : 0);
}

export function calculateEsalRows(genData: GeneralData, snSeed: number, ejesResults: number[]) {
    const log10 = Math.log10;
    const pow = Math.pow;
    
    const pt = genData.finalServiceability;
    const Gt = log10((4.2 - pt) / 2.7);
    const beta18 = 0.4 + (1094 / pow(snSeed + 1, 5.19));

    return TABLE_STATIC_ROWS.map((staticRow, index) => {
        const rowNo = staticRow[0];
        const rowTipo = staticRow[1];
        const rowEstado = staticRow[2];
        
        let l2 = 1;
        if (rowTipo === "Tándem") l2 = 2;
        if (rowTipo === "Trídem") l2 = 3;

        let weightTon = 0;
        switch(genData.roadType) {
            case 'ET_A': weightTon = staticRow[4] as number; break;
            case 'B':    weightTon = staticRow[5] as number; break;
            case 'C':    weightTon = staticRow[6] as number; break;
            case 'D':    weightTon = staticRow[7] as number; break;
            default:     weightTon = staticRow[4] as number;
        }
        const lxKip = weightTon * 2.20462; 

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

        const ejes = ejesResults[index] || 0;
        const esal = fx * ejes;

        return {
            no: rowNo as number,
            tipo: rowTipo as string,
            estado: rowEstado as string,
            l2,
            lxKip,
            ejesAnio: ejes,
            fx,
            esalAnio: esal
        };
    });
}

// --- Layer Property Calculator Utilities ---

export function getLayerFormulaType(name: string): number {
    const n = name.toLowerCase();
    if (n.includes("alto desempeño")) return 1;
    if (n.includes("carpeta asfáltica normal") || n === "base asfáltica" || n.includes("carpeta asfáltica nueva") || n.includes("base asfáltica nueva")) return 2;
    if (n.includes("cementada")) return 3;
    if (n.includes("base hidráulica")) return 4;
    if (n.includes("sub-base hidráulica")) return 5;
    return 0;
}

export function calculateAFromMR(name: string, mr: number): number {
    const type = getLayerFormulaType(name);
    if (type === 0 || mr <= 0) return 0;
    let a = 0;
    if (type === 1) a = 0.171 * Math.log(mr) - 1.784;
    if (type === 2) a = 0.184 * Math.log(mr) - 1.9547;
    if (type === 3) a = 0.0000004 * mr - 0.0702;
    if (type === 4) a = 0.249 * Math.log10(mr) - 0.977;
    if (type === 5) a = 0.227 * Math.log10(mr) - 0.839;
    return Math.max(0, parseFloat(a.toFixed(3)));
}

export function calculateMRFromA(name: string, a: number): number {
    const type = getLayerFormulaType(name);
    if (type === 0 || a <= 0) return 0;
    let mr = 0;
    if (type === 1) mr = Math.exp((a + 1.784) / 0.171);
    if (type === 2) mr = Math.exp((a + 1.9547) / 0.184);
    if (type === 3) mr = (a + 0.0702) / 0.0000004;
    if (type === 4) mr = Math.pow(10, (a + 0.977) / 0.249);
    if (type === 5) mr = Math.pow(10, (a + 0.839) / 0.227);
    return Math.round(mr);
}

export function calculateUnamDamage(P: number, type: string, index: number, Z: number) {
    const q = index === 0 ? 2 : 6;
    const sigmaZst = 5.8 * (1 - (Math.pow(Z, 3) / Math.pow(225 + Z * Z, 1.5)));
    let a = 0;
    const typeLower = type.toLowerCase();
    if (typeLower.includes('sencillo')) {
        a = Math.sqrt((1000 * P) / (2 * Math.PI * q));
    } else if (typeLower.includes('tándem') || typeLower.includes('tandem')) {
        const factor = Z < 30 ? 1000 : 1111;
        a = Math.sqrt((factor * P) / (4 * Math.PI * q));
    } else if (typeLower.includes('trídem') || typeLower.includes('tridem')) {
        const factor = Z < 30 ? 1000 : 1333;
        a = Math.sqrt((factor * P) / (6 * Math.PI * q));
    }
    const sigmaZi = q * (1 - (Math.pow(Z, 3) / Math.pow(a * a + Z * Z, 1.5)));
    if (sigmaZi <= 0 || sigmaZst <= 0) return 0;
    let d = Math.pow(10, (Math.log10(sigmaZi) - Math.log10(sigmaZst)) / Math.log10(1.5));
    if (Z < 30) {
        if (typeLower.includes('tándem') || typeLower.includes('tandem')) {
            d = 2 * d;
        } else if (typeLower.includes('trídem') || typeLower.includes('tridem')) {
            d = 3 * d;
        }
    }
    return d;
}

export function calculateUnamTotalAccumulated(genData: GeneralData, compData: number[], zDepth: number = 0) {
    const ejesResults = calculateEjesResults(genData, compData);
    let sum = 0;
    TABLE_STATIC_ROWS.forEach((staticRow, index) => {
        const rowTipo = staticRow[1] as string;
        let wTon = 0;
        switch (genData.roadType) {
            case 'ET_A': wTon = staticRow[4] as number; break;
            case 'B': wTon = staticRow[5] as number; break;
            case 'C': wTon = staticRow[6] as number; break;
            case 'D': wTon = staticRow[7] as number; break;
            default: wTon = staticRow[4] as number;
        }
        const damage = calculateUnamDamage(wTon, rowTipo, index, zDepth);
        sum += (ejesResults[index] || 0) * damage;
    });

    const r = genData.growthRate / 100;
    const n = genData.designPeriod;
    let ct = n;
    if (r > 0) {
        ct = (Math.pow(1 + r, n) - 1) / r;
    }
    return { totalEquiv1stYear: sum, ct, totalAccumulated: sum * ct };
}
