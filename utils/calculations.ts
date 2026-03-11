
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
