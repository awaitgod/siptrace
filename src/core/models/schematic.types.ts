import { Point2D, Units } from './common.types';
import { PatternDef } from './pattern.types';
import { ComponentDef } from './symbol.types';
export type SheetFormatId = 'A4_P' | 'A4_L' | 'A3_L' | 'A2_L' | 'A1_L' | 'A0_L';
export type TitleBlockForm = 'Form1' | 'Form2' | 'Form2a' | 'None';
export interface GostTitleBlockData {
    enabled: boolean;
    form: TitleBlockForm;
    showZones: boolean;
    showCornerStamp26: boolean;
    designation: string; // Графа 2: например, "ГТРС.468364.001 Э3"
    name: string; // Графа 1: "Гальваническая развязка RS-485"
    subName?: string; // "Схема электрическая принципиальная"
    organization: string; // Графа 9
    litera: string; // Графа 4 ("О", "А", "Б")
    mass: string;
    scale: string;
    sheetNumber: number;
    totalSheets: number;
    developer: string; // Разраб.
    checker: string; // Пров.
    techControl: string; // Т. контр.
    normControl: string; // Н. контр.
    approver: string; // Утв.
    date: string;
    documentCode: string; // Э3
}
export interface PlacedComponent {
    id: string;
    componentDefId: string;
    libraryId: string;
    refDes: string; // e.g., "R1", "VD1", "DA1"
    value: string;
    typeName: string;
    partIndex: number;
    x: number; // mm in schematic coordinates
    y: number;
    angle: 0 | 90 | 180 | 270;
    flipX: boolean;
    flipY: boolean;
    patternId: string;
    refDesOffset: Point2D;
    valueOffset: Point2D;
    showRefDes: boolean;
    showValue: boolean;
    doNotMount?: boolean;
    autoPower?: boolean;
    gostNote?: string;
    gostStandard?: string;
    manufacturer?: string;
    /** Stable physical package identity shared by all placed sections. */
    instanceId?: string;
    labelAngle?: number;
    customAttributes?: Record<string, string>;
}
export interface SchWire {
    id: string;
    points: Point2D[]; // polyline vertices
    netName: string;
    netClassId?: string;
    color?: string;
    width?: number;
}
export interface SchBus {
    id: string;
    points: Point2D[];
    busName: string; // e.g., "D[0..7]"
}
export interface SchBusTap {
    id: string;
    x: number;
    y: number;
    busId: string;
    wireId: string;
    signalName: string;
    angle?: number;
}
export interface SchJunction {
    id: string;
    x: number;
    y: number;
    netName: string;
}
export interface SchNetPort {
    id: string;
    x: number;
    y: number;
    angle: 0 | 90 | 180 | 270;
    netName: string;
    style: 'Ground' | 'Power' | 'PortLeft' | 'PortRight' | 'OffPageIn' | 'OffPageOut';
    electricalType?: 'Input' | 'Output' | 'Bidirectional' | 'Power';
}
export interface SchDiffPairTag {
    id: string;
    x: number;
    y: number;
    pairName: string;
    angle?: number;
    posNet: string;
    negNet: string;
}
export interface SchHierarchyBlock {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    name: string;
    targetSheetId: string;
    angle?: number;
    flipX?: boolean;
    flipY?: boolean;
    pins: {
        id: string;
        name: string;
        side: 'left' | 'right';
        offset: number;
    }[];
}
export type SchShape = ({
    id: string;
    type: 'line';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width: number;
    color?: string;
    dashed?: boolean;
} | {
    id: string;
    type: 'rect';
    x: number;
    y: number;
    w: number;
    h: number;
    width: number;
    fill?: boolean;
    color?: string;
} | {
    id: string;
    type: 'circle';
    cx: number;
    cy: number;
    r: number;
    width: number;
    fill?: boolean;
    color?: string;
} | {
    id: string;
    type: 'text';
    x: number;
    y: number;
    text: string;
    size: number;
    color?: string;
    bold?: boolean;
    italic?: boolean;
} | {
    id: string;
    type: 'table';
    x: number;
    y: number;
    colWidths: number[];
    rowHeight: number;
    rows: string[][];
    color?: string;
}) & {
    angle?: number;
    flipX?: boolean;
    flipY?: boolean;
    source?: 'bom';
};
export interface SchematicSheet {
    id: string;
    name: string;
    format: SheetFormatId;
    titleBlock: GostTitleBlockData;
    components: PlacedComponent[];
    wires: SchWire[];
    buses: SchBus[];
    busTaps: SchBusTap[];
    junctions: SchJunction[];
    netPorts: SchNetPort[];
    diffPairs: SchDiffPairTag[];
    hierarchyBlocks: SchHierarchyBlock[];
    shapes: SchShape[];
    isHierarchicalSheet?: boolean;
}
export interface NetClassDef {
    id: string;
    name: string;
    traceWidth: number; // mm
    minWidth: number;
    maxWidth: number;
    clearance: number; // mm
    viaOuterDiameter: number;
    viaHoleDiameter: number;
    diffPairGap?: number;
    diffPairTolerance?: number;
    color?: string;
}
export interface SchematicProject {
    version: string;
    filePath: string;
    projectName: string;
    units: Units;
    gridSize: number; // mm (default 2.5)
    origin: Point2D;
    sheets: SchematicSheet[];
    activeSheetId: string;
    netClasses: NetClassDef[];
    netClassAssignments: Record<string, string>; // netName -> netClassId
    customComponentDefs: Record<string, ComponentDef>;
    customPatternDefs: Record<string, PatternDef>;
}
