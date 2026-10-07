const Core = (() => {
  const DEFAUTS = {
    activite: 'bnc', periodicite: 'trimestre', ir: 'vl',
    caAnnuel: 30000, situation: 'seul', parts: 1, autresRevenus: 0, tauxIrManuel: 2,
    tva: false, tauxTva: 20, cfe: 300,
    split: { salaire: 60, securite: 15, invest: 15, pro: 10 },
    matelasCible: 6000, matelasDeja: 0,
    taux: {
      bnc:       { cotis: 25.6, cfp: 0.2, vl: 2.2, abatt: 34 },
      bic_serv:  { cotis: 21.2, cfp: 0.3, vl: 1.7, abatt: 50 },
      bic_vente: { cotis: 12.3, cfp: 0.1, vl: 1.0, abatt: 71 }
    }
  };
  const SEUILS = {
    services: { tvaBase: 37500, tvaMaj: 41250, micro: 83600 },
    vente:    { tvaBase: 85000, tvaMaj: 93500, micro: 203100 }
  };
  const BAREME = [[11600, 0], [29579, 0.11], [84577, 0.30], [181917, 0.41], [Infinity, 0.45]];
  const DECOTE = { seul: { seuil: 1982, base: 897 }, couple: { seuil: 3277, base: 1483 }, taux: 0.4525 };
  const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

  function parseEur(str) {
    const c = String(str == null ? '' : str).replace(/[\s  €]/g, '').replace(',', '.');
    if (c === '' || c === '.' || !/^\d*\.?\d*$/.test(c)) return null;
    const n = Math.round(parseFloat(c) * 100);
    return Number.isFinite(n) ? n : null;
  }

  function impotFoyer(revenu, parts, situation) {
    if (!(revenu > 0)) return 0;
    const p = parts > 0 ? parts : 1, q = revenu / p;
    let t = 0, bas = 0;
    for (const [haut, taux] of BAREME) { if (q > bas) t += (Math.min(q, haut) - bas) * taux; bas = haut; }
    let imp = t * p;
    const d = situation === 'couple' ? DECOTE.couple : DECOTE.seul;
    if (imp < d.seuil) imp = Math.max(0, imp - Math.max(0, d.base - DECOTE.taux * imp));
    return imp;
  }

  // Taux d'impôt appliqué à chaque encaissement, en % du CA.
  function tauxImpot(s, act) {
    if (s.ir === 'vl') return s.taux[act].vl;
    if (s.ir === 'manuel') return s.tauxIrManuel;
    if (!(s.caAnnuel > 0)) return 0;
    const micro = s.caAnnuel * (1 - s.taux[s.activite].abatt / 100);
    const sup = impotFoyer(s.autresRevenus + micro, s.parts, s.situation) - impotFoyer(s.autresRevenus, s.parts, s.situation);
    return Math.max(0, sup / s.caAnnuel * 100);
  }

  // m et cumulSecurite en centimes. Renvoie des parts en centimes dont la somme vaut exactement m.
  function ventiler(m, act, s, cumulSecurite) {
    const t = s.taux[act] || s.taux.bnc;
    const tva = s.tva ? Math.round(m - m / (1 + s.tauxTva / 100)) : 0;
    const ca = m - tva;
    const urssaf = Math.round(ca * (t.cotis + t.cfp) / 100);
    const tIr = tauxImpot(s, act);
    const impot = Math.round(ca * tIr / 100);
    const cfe = s.caAnnuel > 0 ? Math.round(ca * s.cfe / s.caAnnuel) : 0;
    const net = m - tva - urssaf - impot - cfe;
    const w = s.split, sum = w.salaire + w.securite + w.invest + w.pro;
    const cibleRestante = Math.max(0, Math.round((s.matelasCible - s.matelasDeja) * 100) - (cumulSecurite || 0));
    let salaire = net, securite = 0, invest = 0, pro = 0, plafonne = false;
    if (sum > 0 && net > 0) {
      salaire = Math.round(net * w.salaire / sum);
      pro = Math.round(net * w.pro / sum);
      securite = Math.round(net * w.securite / sum);
      if (securite > cibleRestante) { securite = cibleRestante; plafonne = true; }
      invest = net - salaire - pro - securite;
      if (invest < 0 || (w.invest <= 0 && !plafonne)) { salaire += invest; invest = 0; }
    }
    return {
      montant: m, ca, net, tauxIr: tIr, irMode: s.ir, cibleRestante, plafonne,
      parts: { urssaf, impot, cfe, tva, salaire, securite, invest, pro }
    };
  }

  function periode(y, m, per) {
    if (per === 'mois') return { cle: y + '-M' + m, label: MOIS[m - 1] + ' ' + y, an: y, finMois: m };
    const q = Math.ceil(m / 3);
    return { cle: y + '-T' + q, label: 'T' + q + ' ' + y, an: y, finMois: q * 3 };
  }
  function periodeDe(dateStr, per) { const a = dateStr.split('-').map(Number); return periode(a[0], a[1], per); }
  function precedente(p, per) {
    const pas = per === 'mois' ? 1 : 3; let m = p.finMois - pas, y = p.an;
    if (m < 1) { m += 12; y -= 1; }
    return periode(y, m, per);
  }
  // Dernier jour du mois qui suit la fin de la période.
  function echeance(p) { let m = p.finMois + 1, y = p.an; if (m > 12) { m = 1; y += 1; } return new Date(y, m, 0); }

  return { DEFAUTS, SEUILS, MOIS, parseEur, impotFoyer, tauxImpot, ventiler, periode, periodeDe, precedente, echeance };
})();
