export interface PavementLayer {
  id: string; // Unique ID for React keys
  name: string;
  mr: number; // Modulus (psi)
  a: number;  // Structural Coefficient
  m: number;  // Drainage Coefficient
  customCode?: string; // For custom user layers (Mobile view abbreviation)
}

export interface GeneralData {
  projectName: string;
  section: string;
  roadType: 'ET_A' | 'B' | 'C' | 'D';
  networkType: 'Corredor' | 'Red Básica' | 'Red Secundaria';
  tdpa: number;
  pvc: number;
  lanes: '1' | '2' | '3+';
  reliability: number;         // R (%)
  standardDeviation: number;   // So
  subgradeMr: number;          // MRsr (psi)
  finalServiceability: number; // Pt
  designPeriod: number;        // n (years)
  growthRate: number;          // r (%)
  snSeed: number;              // SN (Structural Number)
  
  // New Pavement Structure Fields
  rigidityLevel: 'low' | 'medium' | 'high';
  drainageCoefficient: number; // m
  layers: PavementLayer[];
}

export type VehicleName = 
  | "A2" | "B2" | "B36" | "B38" | "B4" 
  | "C2" | "C36" | "C38" | "C2R2" | "C3R2"
  | "C3R3" | "C2R3" | "T2S1" | "T2S2" | "T3S2" 
  | "T3S3" | "T2S3" | "T3S1" | "T2S1R2" | "T2S1R3"
  | "T2S2R2" | "T3S1R2" | "T3S1R3" | "T3S2R2" | "T3S2R4" 
  | "T3S2R3" | "T3S3S2" | "T2S2S2" | "T3S2S2";

// The composition data is simply an array of 29 numbers (percentages)
// indexed consistently with the NOMBRES array.
export type CompositionData = number[]; 

// For Mode 3: Direct Axle Input
export interface AxleInputRow {
  id: string;
  l2: 1 | 2 | 3; // 1: Simple, 2: Tandem, 3: Tridem
  lxKip: number; // Load in Kips
  count: number; // Ejes 1er año
}

export type CalculationMethod = 'vehicles' | 'direct';

export interface RowResult {
  no: number;
  tipo: string;
  estado: string;
  llantas: number;
  etya: number;
  b: number;
  c: number;
  d: number;
  result: number;
}