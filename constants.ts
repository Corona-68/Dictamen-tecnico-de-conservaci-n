import { GeneralData, VehicleName } from './types';

export const CUSTOM_LAYER_NAME = "Ingresada por el usuario";

export const VEHICLE_NAMES: VehicleName[] = [
    "A2", "B2", "B36", "B38", "B4", 
    "C2", "C36", "C38", "C2R2", "C3R2",
    "C3R3", "C2R3", "T2S1", "T2S2", "T3S2", 
    "T3S3", "T2S3", "T3S1", "T2S1R2", "T2S1R3",
    "T2S2R2", "T3S1R2", "T3S1R3", "T3S2R2", "T3S2R4", 
    "T3S2R3", "T3S3S2", "T2S2S2", "T3S2S2"
];

export const DEFAULT_COMPOSITION: number[] = [
    85, 2, 0, 0, 0, 2, 0, 2, 0, 0, 
    0, 0, 0, 0, 2, 5, 0, 0, 0, 0, 
    0, 0, 0, 0, 2, 0, 0, 0, 0
];

export const DEFAULT_GENERAL_DATA: GeneralData = {
    projectName: "Carretera Tuxtla Gutiérrez - Cd. Cuauhtemoc",
    section: "Chiapa de Corzo - San Cristóbal de las Casas",
    roadType: "ET_A",
    networkType: "Corredor",
    tdpa: 7500,
    pvc: 80,
    lanes: "1",
    reliability: 90,
    standardDeviation: 0.45,
    subgradeMr: 7500,
    finalServiceability: 2.5,
    designPeriod: 10,
    growthRate: 2,
    snSeed: 4.0,
    diagnosis: "",
    asphaltGrade: "70H-16",
    
    // Default Pavement Structure
    rigidityLevel: 'low',
    drainageCoefficient: 0.9,
    layers: [
        { id: 'l_init_1', name: "Carpeta asfáltica normal", mr: 361234, a: 0.400, m: 1.0 }
    ]
};

// Data Structure for Layer Suggestions based on Image
export const LAYER_CATALOG = [
    { 
        name: "Carpeta asfáltica alto desempeño", 
        values: {
            low: { mr: 725790, a: 0.524, m: 1.0 },
            medium: { mr: 768452, a: 0.534, m: 1.0 },
            high: { mr: 811114, a: 0.543, m: 1.0 }
        }
    },
    { 
        name: "Carpeta asfáltica normal", 
        values: {
            low: { mr: 361234, a: 0.400, m: 1.0 },
            medium: { mr: 402713, a: 0.420, m: 1.0 },
            high: { mr: 448953, a: 0.440, m: 1.0 }
        }
    },
    { 
        name: "Base asfáltica", 
        values: {
            low: { mr: 256745, a: 0.254, m: 1.0 },
            medium: { mr: 326164, a: 0.278, m: 1.0 },
            high: { mr: 395583, a: 0.302, m: 1.0 }
        }
    },
    { 
        name: "Base Cementada", 
        values: {
            low: { mr: 570000, a: 0.140, m: 1.0 },
            medium: { mr: 620000, a: 0.160, m: 1.0 },
            high: { mr: 680000, a: 0.180, m: 1.0 }
        }
    },
    { 
        name: "Base hidráulica", 
        values: {
            low: { mr: 21150, a: 0.100, m: 1.0 },
            medium: { mr: 25446, a: 0.120, m: 1.0 },
            high: { mr: 30616, a: 0.140, m: 1.0 }
        }
    },
    { 
        name: "Sub-Base Hidráulica", 
        values: {
            low: { mr: 11180, a: 0.080, m: 1.0 },
            medium: { mr: 13695, a: 0.100, m: 1.0 },
            high: { mr: 16775, a: 0.120, m: 1.0 }
        }
    },
    {
        name: CUSTOM_LAYER_NAME,
        values: {
            low: { mr: 0, a: 0, m: 1.0 },
            medium: { mr: 0, a: 0, m: 1.0 },
            high: { mr: 0, a: 0, m: 1.0 }
        }
    }
];

// Static data for the table rows (Columns 1-8)
// [No, Tipo, Estado, Llantas, ET y A, B, C, D]
export const TABLE_STATIC_ROWS: [number, string, string, number, number, number, number, number][] = [
    [0,"Sencillo","Cargado",2, 1.0, 1.0, 1.0, 1.0],
    [1,"Sencillo","Cargado",2, 6.5, 6.0, 5.5, 5.0],
    [2,"Sencillo","Cargado",4, 12.5,10.5, 9.0, 8.0],
    [3,"Sencillo","Cargado",4, 10.0, 9.5, 8.0, 7.0],
    [4,"Sencillo","Cargado",4, 11.0, 9.5, 8.0, 7.0],
    [5,"Sencillo","Cargado",4, 11.0,10.5, 9.0, 8.0],
    [6,"Sencillo","Vacío" ,2, 4.0, 4.0, 4.0, 4.0],
    [7,"Sencillo","Vacío" ,4, 7.0, 7.0, 7.0, 7.0],
    [8,"Tándem"  ,"Cargado",6, 17.5,13.0,11.5,11.0],
    [9,"Tándem"  ,"Cargado",8, 21.0,17.0,14.5,13.5],
    [10,"Tándem" ,"Cargado",8, 17.0,15.0,13.5,12.0],
    [11,"Tándem" ,"Cargado",8, 19.0,15.0,13.5,12.0],
    [12,"Tándem" ,"Cargado",8, 18.0,17.0,14.5,13.5],
    [13,"Tándem" ,"Vacío" ,8, 4.5, 4.5, 4.5, 4.5],
    [14,"Trídem" ,"Cargado",12,23.5,22.5,20.0,18.0],
    [15,"Trídem" ,"Cargado",12,26.5,22.5,20.0,18.0],
    [16,"Trídem" ,"Vacío" ,12,5.0, 5.0, 5.0, 5.0]
];