/** Maps a reference designator prefix to a default GOST library component and footprint. */
export function guessGostComponentDef(refDes: string): { defId: string; libId: string; patternId: string } {
  const prefix = refDes.replace(/\d+$/, '');
  if (prefix === 'R') return { defId: 'COMP_R_R1_12_0805', libId: 'lib_gost_res', patternId: 'PAT_CHIP_2012M' };
  if (prefix === 'C') return { defId: 'COMP_C_K10_17V_0805', libId: 'lib_gost_cap', patternId: 'PAT_CHIP_2012M' };
  if (prefix === 'L') return { defId: 'COMP_L_DM01', libId: 'lib_gost_ind', patternId: 'PAT_CHIP_2012M' };
  if (prefix === 'VD' || prefix === 'HL') return { defId: 'COMP_VD_KD522', libId: 'lib_gost_diode', patternId: 'PAT_CHIP_2012M' };
  if (prefix === 'VT') return { defId: 'COMP_VT_KT315B', libId: 'lib_gost_trans', patternId: 'PAT_KT26_TO92' };
  return { defId: 'COMP_DA_KR140UD708', libId: 'lib_gost_analog', patternId: 'PAT_DIP8' };
}
