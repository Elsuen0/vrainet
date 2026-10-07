(() => {
'use strict';
const $ = (s) => document.querySelector(s);
const ORDRE = ['urssaf', 'impot', 'cfe', 'tva', 'salaire', 'securite', 'invest', 'pro'];
const DUES = ['urssaf', 'impot', 'cfe', 'tva'];
const NOM = { urssaf: 'URSSAF', impot: 'Impôt sur le revenu', cfe: 'CFE', tva: 'TVA', salaire: 'À te verser', securite: 'Matelas de sécurité', invest: 'Investissement', pro: 'Budget pro' };
const ACT = { bnc: 'Libérale (BNC)', bic_serv: 'Commerciale ou artisanale (BIC)', bic_vente: 'Vente (BIC)' };
const ACT_COURT = { bnc: 'BNC', bic_serv: 'BIC services', bic_vente: 'BIC vente' };
const LS = 'vrainet.v1';
const suivre = (nom) => { try { if (typeof window.va === 'function') window.va('event', { name: nom }); } catch (e) {} };
let dejaSaisi = false;

// Segments de la barre, dans l'ordre d'affichage. Impôt et CFE partagent un segment (même destinataire : les impôts).
function segments(parts) {
  const fisc = (parts.impot || 0) + (parts.cfe || 0);
  const nomFisc = parts.impot > 0 && parts.cfe > 0 ? 'Impôt sur le revenu + CFE' : parts.cfe > 0 ? 'CFE' : 'Impôt sur le revenu';
  const l = [['tva', parts.tva || 0, 'TVA', 0], ['impot', fisc, nomFisc, 0], ['urssaf', parts.urssaf || 0, 'URSSAF', 0],
    ['salaire', parts.salaire || 0, NOM.salaire, 1], ['securite', parts.securite || 0, NOM.securite, 1], ['invest', parts.invest || 0, NOM.invest, 1], ['pro', parts.pro || 0, NOM.pro, 1]]
    .filter((x) => x[1] > 0).map((x) => ({ g: x[0], c: x[1], nom: x[2], toi: x[3] }));
  let vu = false; l.forEach((x, i) => { if (x.toi && !vu) { vu = true; x.frontiere = i > 0; } });
  return l;
}
const GROUPE = { cfe: 'impot' };
const clone = (o) => JSON.parse(JSON.stringify(o));
function fusion(base, x) {
  const o = clone(base);
  if (!x || typeof x !== 'object') return o;
  for (const k in o) {
    if (x[k] === undefined || x[k] === null) continue;
    if (o[k] && typeof o[k] === 'object') o[k] = fusion(o[k], x[k]);
    else if (typeof x[k] === typeof o[k]) o[k] = x[k];
  }
  return o;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { settings: clone(Core.DEFAUTS), virements: [], masque: false, touche: false, exemple: true, activiteChoisie: false };
let remote = null;

/* ---------- formats ---------- */
const fEur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fEur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur = (c) => state.masque ? '•••• €' : fEur.format(c / 100);
const eur0 = (e) => state.masque ? '•••• €' : fEur0.format(e);
const pct = (c, tot) => tot > 0 ? (c / tot * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' : '0,0 %';
const nb = (n, d) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 2 : d });
function aujourdhui() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dateFr(d, avecAn) { return d.toLocaleDateString('fr-FR', avecAn ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }); }
function dateStrFr(s) { const a = s.split('-').map(Number); return dateFr(new Date(a[0], a[1] - 1, a[2]), a[0] !== new Date().getFullYear()); }

/* ---------- stockage ---------- */
function lsRead() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
function lsWrite() { try { localStorage.setItem(LS, JSON.stringify({ settings: state.settings, virements: state.virements, touche: state.touche })); } catch (e) {} }
function setSync(etat) {
  const txt = { attente: 'Connexion à ton compte…', compte: 'Sauvegardé dans ton compte', local: 'Sauvegardé sur cet appareil uniquement' }[etat];
  $('#sync').dataset.etat = etat; $('#sync-txt').textContent = txt;
}
function echecDistant() { remote = null; setSync('local'); toast('Sauvegarde dans ton compte impossible : tes données restent sur cet appareil.'); }
async function pushVirement(v) {
  if (!remote) return;
  try { const body = clone(v); delete body._s; delete body.id; await remote.doc(v.id).set(body); v._s = true; lsWrite(); }
  catch (e) { echecDistant(); }
}
async function dropVirement(id) { if (!remote) return; try { await remote.doc(id).delete(); } catch (e) { echecDistant(); } }
let chaine = Promise.resolve(), minuteur = null;
async function pushSettings() {
  if (!remote) return;
  try { await remote.doc('settings').set(Object.assign({ kind: 'settings' }, clone(state.settings))); }
  catch (e) { echecDistant(); }
}
function planifierSettings() {
  state.touche = true; lsWrite();
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { chaine = chaine.then(pushSettings); }, 700);
}
async function connecter() {
  if (!window.claude || typeof window.claude.use !== 'function') return setSync('local');
  try {
    const res = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    const db = res[0], user = res[1];
    const uid = user ? await user.id() : null;
    if (!db || !uid) return setSync('local');
    const col = db.collection('data/users/' + uid);
    const snap = await col.limit(1000).get();
    remote = col;
    let distSettings = null; const dist = [];
    snap.docs.forEach((d) => {
      const x = d.data(); if (!x) return;
      if (d.id === 'settings') distSettings = x;
      else if (x.kind === 'virement') dist.push(Object.assign(clone(x), { id: d.id, _s: true }));
    });
    const ids = new Set(dist.map((v) => v.id));
    const locaux = state.virements.filter((v) => !v._s && !ids.has(v.id));
    state.virements = dist.concat(locaux);
    if (distSettings) { state.settings = fusion(Core.DEFAUTS, distSettings); state.touche = true; }
    setSync('compte'); lsWrite(); remplirReglages(); renderAll();
    if (!distSettings && state.touche) await pushSettings();
    for (const v of locaux) await pushVirement(v);
  } catch (e) { remote = null; setSync('local'); }
}

/* ---------- calculs dérivés ---------- */
const cumulSecurite = () => state.virements.reduce((a, v) => a + (v.parts.securite || 0), 0);
function lireVirement() {
  const m = Core.parseEur($('#montant').value);
  return { m: m > 0 ? m : null, act: $('#activite').value, date: $('#date').value || aujourdhui() };
}
function conseil(k, r, act, date) {
  const s = state.settings, t = s.taux[act];
  switch (k) {
    case 'urssaf': {
      const p = Core.periodeDe(date, s.periodicite), e = Core.echeance(p);
      return 'Cotisations ' + nb(t.cotis) + ' % + formation ' + nb(t.cfp) + ' % · à déclarer avant le ' + dateFr(e, e.getFullYear() !== new Date().getFullYear()) + ' (' + p.label + ')';
    }
    case 'impot':
      if (r.irMode === 'vl') return 'Versement libératoire ' + nb(t.vl) + ' %, payé avec l\'URSSAF';
      if (r.irMode === 'manuel') return 'Provision à ' + nb(r.tauxIr) + ' % du CA, à garder jusqu\'au prélèvement';
      return 'Provision estimée au barème, ' + nb(r.tauxIr) + ' % du CA';
    case 'cfe': return 'Provision pour l\'avis de fin d\'année';
    case 'tva': return 'Collectée pour l\'État, à reverser';
    case 'salaire': return 'Ce que tu peux dépenser';
    case 'securite': return r.plafonne ? 'Objectif atteint avec ce virement : le surplus part en investissement' : 'Épargne de précaution · encore ' + eur(Math.max(0, r.cibleRestante - r.parts.securite)) + ' avant l\'objectif';
    case 'invest': return 'À placer sur le long terme';
    case 'pro': return 'Matériel, logiciels, formation';
  }
  return '';
}

/* ---------- rendu : guichet ---------- */
function renderCalc() {
  const s = state.settings, { m, act, date } = lireVirement();
  const nominal = !m, base = m || 100000;
  const r = Core.ventiler(base, act, s, cumulSecurite());
  const due = DUES.reduce((a, k) => a + r.parts[k], 0), toi = base - due;
  $('#v-toi').textContent = nominal ? pct(toi, base) : eur(toi);
  $('#v-due').textContent = nominal ? pct(due, base) : eur(due);
  $('#accolades').innerHTML =
    (due > 0 ? '<div style="flex-grow:' + due + '"><span>Pas à toi ' + pct(due, base) + '</span></div>' : '') +
    (toi > 0 ? '<div style="flex-grow:' + toi + '"><span>À toi ' + pct(toi, base) + '</span></div>' : '');
  const segs = segments(r.parts);
  $('#barre').innerHTML = segs.map((x) =>
    '<div class="seg' + (x.frontiere ? ' frontiere' : '') + '" data-k="' + x.g + '" style="flex-grow:' + x.c + ';background:var(--s-' + x.g + ')" title="' + x.nom + ' · ' + pct(x.c, base) + (nominal ? '' : ' · ' + eur(x.c)) + '"></div>').join('');
  $('#barre').setAttribute('aria-label', 'Découpe du virement : ' + segs.map((x) => x.nom + ' ' + pct(x.c, base)).join(', '));
  const ligne = (k) => {
    const c = r.parts[k];
    if (c <= 0 && !(k === 'securite' && s.split.securite > 0)) return '';
    const h = (k === 'securite' && c <= 0) ? 'Objectif atteint : sa part passe en investissement' : conseil(k, r, act, date);
    return '<li class="lg" data-k="' + (GROUPE[k] || k) + '"><span class="chip" style="background:var(--s-' + k + ')"></span>' +
      '<span class="lg-t"><b>' + NOM[k] + '</b><small>' + h + '</small></span>' +
      '<span class="lg-p">' + pct(c, base) + '</span><span class="lg-a">' + (nominal ? '—' : eur(c)) + '</span></li>';
  };
  $('#lg-due').innerHTML = DUES.map(ligne).join('');
  $('#lg-toi').innerHTML = ORDRE.filter((k) => !DUES.includes(k)).map(ligne).join('');
  $('#btn-save').disabled = nominal;
  $('#exemple').hidden = !state.exemple;
  if (nominal && !state.exemple) { $('#exemple').hidden = false; $('#exemple').textContent = 'Saisis un montant : en attendant, voici tes règles en pourcentage.'; }
}

/* ---------- rendu : colonne d'état ---------- */
function totalPeriode(p) {
  const s = state.settings; let du = 0; const ca = {};
  state.virements.forEach((v) => {
    if (Core.periodeDe(v.date, s.periodicite).cle !== p.cle) return;
    du += v.parts.urssaf + (v.irMode === 'vl' ? v.parts.impot : 0);
    ca[v.activite] = (ca[v.activite] || 0) + v.ca;
  });
  return { du, ca };
}
function renderUrssaf() {
  const s = state.settings, t = aujourdhui(), now = new Date(); now.setHours(0, 0, 0, 0);
  const cours = Core.periodeDe(t, s.periodicite), prec = Core.precedente(cours, s.periodicite);
  const rang = (p, enCours) => {
    const e = Core.echeance(p), jours = Math.round((e - now) / 86400000), x = totalPeriode(p);
    const cas = Object.keys(x.ca).map((a) => eur(x.ca[a]) + ' en ' + ACT_COURT[a]).join(' + ');
    return '<div class="due-row"><div><b>' + p.label + (enCours ? '' : (jours <= 10 ? '<span class="pill">J-' + jours + '</span>' : '')) + '</b>' +
      '<small>' + (enCours ? 'En cours · ' : 'Période close · ') + 'à déclarer avant le ' + dateFr(e, e.getFullYear() !== now.getFullYear()) + (enCours ? '' : ', dans ' + jours + ' jour' + (jours > 1 ? 's' : '')) + '</small>' +
      '<small>' + (cas ? 'CA à déclarer : ' + cas : 'Aucun encaissement enregistré') + '</small></div>' +
      '<span class="num">' + eur(x.du) + '</span></div>';
  };
  let h = '';
  if (Core.echeance(prec) >= now) h += rang(prec, false);
  h += rang(cours, true);
  if (s.ir === 'vl') h += '<p>Montants cotisations, formation et versement libératoire compris.</p>';
  $('#urssaf-body').innerHTML = '<div style="display:flex;flex-direction:column;gap:12px">' + h + '</div>';
}
function renderCA() {
  const s = state.settings, an = new Date().getFullYear();
  const seuils = s.activite === 'bic_vente' ? Core.SEUILS.vente : Core.SEUILS.services;
  const ca = state.virements.filter((v) => +v.date.slice(0, 4) === an).reduce((a, v) => a + v.ca, 0) / 100;
  $('#h-ca').textContent = 'Chiffre d\'affaires ' + an;
  let etat, niv;
  if (ca >= seuils.micro) { niv = 'crit'; etat = 'Plafond du régime micro dépassé cette année.'; }
  else if (ca >= seuils.tvaMaj) { niv = 'crit'; etat = 'Seuil majoré dépassé : la TVA s\'applique depuis le jour du dépassement.'; }
  else if (ca >= seuils.tvaBase) { niv = 'warn'; etat = 'Seuil de base dépassé : TVA à facturer au 1er janvier. Encore ' + eur0(seuils.tvaMaj - ca) + ' avant le seuil majoré, qui la déclenche tout de suite.'; }
  else { niv = 'ok'; etat = 'Franchise de TVA : encore ' + eur0(seuils.tvaBase - ca) + ' avant le seuil de ' + nb(seuils.tvaBase, 0) + ' €.'; }
  const p = (x) => Math.min(100, x / seuils.micro * 100).toFixed(2) + '%';
  $('#ca-body').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:8px"><span class="grand">' + eur0(ca) + '</span>' +
    '<div><div class="jauge" role="img" aria-label="Chiffre d\'affaires encaissé rapporté au plafond micro de ' + nb(seuils.micro, 0) + ' euros">' +
    '<i style="width:' + p(ca) + '"></i><b style="left:' + p(seuils.tvaBase) + ';width:' + p(seuils.tvaMaj - seuils.tvaBase) + '"></b></div>' +
    '<div class="jauge-leg"><span style="left:0">0</span><span style="left:' + p((seuils.tvaBase + seuils.tvaMaj) / 2) + ';transform:translateX(-50%)">TVA ' + nb(seuils.tvaBase / 1000, 2) + '–' + nb(seuils.tvaMaj / 1000, 2) + ' k</span><span style="right:0">' + nb(seuils.micro / 1000, 1) + ' k</span></div></div>' +
    '<p><span class="etat" data-n="' + niv + '">' + (niv === 'ok' ? 'Sous les seuils.' : niv === 'warn' ? 'Attention.' : 'Seuil franchi.') + '</span> ' + etat + '</p></div>';
}
function renderCumul() {
  const an = new Date().getFullYear(), liste = state.virements.filter((v) => +v.date.slice(0, 4) === an);
  $('#h-cumul').textContent = 'Cumul ' + an;
  if (!liste.length) { $('#cumul-body').innerHTML = '<p class="vide">Aucun virement enregistré en ' + an + '. Le total par enveloppe s\'affichera ici dès le premier.</p>'; return; }
  const tot = {}; let enc = 0;
  liste.forEach((v) => { enc += v.montant; ORDRE.forEach((k) => { tot[k] = (tot[k] || 0) + (v.parts[k] || 0); }); });
  $('#cumul-body').innerHTML = '<ul class="cumul">' + ORDRE.filter((k) => tot[k] > 0).map((k) =>
    '<li><span class="chip" style="background:var(--s-' + k + ')"></span><span>' + NOM[k] + '</span><span class="num">' + eur(tot[k]) + '</span></li>').join('') +
    '<li class="tot"><span></span><span>Encaissé, ' + liste.length + ' virement' + (liste.length > 1 ? 's' : '') + '</span><span class="num">' + eur(enc) + '</span></li></ul>';
}
function renderMatelas() {
  const s = state.settings, acquis = s.matelasDeja + cumulSecurite() / 100, cible = s.matelasCible;
  if (!(cible > 0)) { $('#matelas-body').innerHTML = '<p class="vide">Aucun objectif défini. Fixe-le dans les réglages.</p>'; return; }
  const w = Math.min(100, acquis / cible * 100).toFixed(2);
  $('#matelas-body').innerHTML = '<div style="display:flex;flex-direction:column;gap:8px"><div class="jauge" role="img" aria-label="Matelas constitué"><i style="width:' + w + '%;background:var(--s-securite)"></i></div>' +
    '<p><span class="num">' + eur0(acquis) + '</span> sur ' + eur0(cible) + (acquis >= cible ? ' · objectif atteint, sa part passe en investissement.' : '.') + '</p></div>';
}

/* ---------- rendu : journal ---------- */
function renderJournal() {
  const l = state.virements.slice().sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : (b.cree || 0) - (a.cree || 0)));
  if (!l.length) {
    $('#journal-body').innerHTML = '<p class="vide">Ton journal est vide. Saisis un montant ci-dessus puis « Enregistrer ce virement » : il apparaîtra ici avec sa découpe, et alimentera l\'échéance URSSAF et les cumuls.</p>';
    return;
  }
  $('#journal-body').innerHTML = '<div class="jr jr-head"><span>Date</span><span>Virement</span><span>Découpe</span><span style="text-align:right">Reçu</span><span style="text-align:right">À toi</span><span></span></div>' +
    l.map((v) => {
      const toi = v.montant - DUES.reduce((a, k) => a + (v.parts[k] || 0), 0);
      return '<div class="jr"><span class="d">' + dateStrFr(v.date) + '</span>' +
        '<span class="l"><b>' + (v.libelle ? esc(v.libelle) : 'Sans libellé') + '</b><small>' + (ACT[v.activite] || '') + '</small></span>' +
        '<span class="mini" aria-hidden="true">' + segments(v.parts).map((x) => '<i' + (x.frontiere ? ' class="frontiere"' : '') + ' style="flex-grow:' + x.c + ';background:var(--s-' + x.g + ')"></i>').join('') + '</span>' +
        '<span class="m">' + eur(v.montant) + '</span><span class="t"><small>à toi </small>' + eur(toi) + '</span>' +
        '<span class="x"><button type="button" class="suppr" data-id="' + esc(v.id) + '">Supprimer</button></span></div>';
    }).join('');
}

/* ---------- réglages ---------- */
const CHAMPS = [
  ['set-activite', 'activite', 's'], ['set-periodicite', 'periodicite', 's'], ['set-ir', 'ir', 's'], ['set-situation', 'situation', 's'],
  ['set-ca', 'caAnnuel', 'n'], ['set-cfe', 'cfe', 'n'], ['set-parts', 'parts', 'n'], ['set-autres', 'autresRevenus', 'n'], ['set-irmanuel', 'tauxIrManuel', 'n'],
  ['set-tva', 'tva', 'b'], ['set-tauxtva', 'tauxTva', 'n'],
  ['set-w-salaire', 'split.salaire', 'n'], ['set-w-securite', 'split.securite', 'n'], ['set-w-invest', 'split.invest', 'n'], ['set-w-pro', 'split.pro', 'n'],
  ['set-matelas-cible', 'matelasCible', 'n'], ['set-matelas-deja', 'matelasDeja', 'n']
];
['bnc', 'bic_serv', 'bic_vente'].forEach((a) => ['cotis', 'cfp', 'vl', 'abatt'].forEach((k) => CHAMPS.push(['tx-' + a + '-' + k, 'taux.' + a + '.' + k, 'n'])));
const lire = (o, chemin) => chemin.split('.').reduce((x, k) => x[k], o);
function ecrire(o, chemin, v) { const ks = chemin.split('.'); const d = ks.pop(); ks.reduce((x, k) => x[k], o)[d] = v; }
function construireTaux() {
  $('#taux-body').innerHTML = ['bnc', 'bic_serv', 'bic_vente'].map((a) => '<tr><th scope="row">' + ACT[a] + '</th>' +
    ['cotis', 'cfp', 'vl', 'abatt'].map((k) => '<td><input id="tx-' + a + '-' + k + '" type="number" min="0" max="100" step="0.1" inputmode="decimal" aria-label="' + ACT[a] + ', ' + k + '"></td>').join('') + '</tr>').join('');
}
function remplirReglages() {
  CHAMPS.forEach(([id, chemin, type]) => {
    const el = document.getElementById(id); if (!el || el === document.activeElement) return;
    const v = lire(state.settings, chemin);
    if (type === 'b') el.checked = !!v; else el.value = v;
  });
  if (!state.activiteChoisie) $('#activite').value = state.settings.activite;
  renderReglagesInfos();
}
function lireReglages() {
  CHAMPS.forEach(([id, chemin, type]) => {
    const el = document.getElementById(id); if (!el) return;
    if (type === 'b') ecrire(state.settings, chemin, el.checked);
    else if (type === 's') ecrire(state.settings, chemin, el.value);
    else { const n = parseFloat(String(el.value).replace(',', '.')); if (Number.isFinite(n) && n >= 0) ecrire(state.settings, chemin, n); }
  });
  if (!(state.settings.parts >= 1)) state.settings.parts = 1;
}
function renderReglagesInfos() {
  const s = state.settings;
  document.querySelectorAll('[data-si]').forEach((el) => {
    const c = el.dataset.si;
    el.hidden = c === 'tva' ? !s.tva : s.ir !== c;
  });
  const t = Core.tauxImpot(s, s.activite);
  let ir;
  if (s.ir === 'vl') ir = 'Versement libératoire : ' + nb(t) + ' % de chaque encaissement, payé en même temps que l\'URSSAF. Si tu y as renoncé, il s\'arrête au 1er janvier suivant : passe alors au barème ici.';
  else if (s.ir === 'manuel') ir = 'Tu provisionnes ' + nb(t) + ' % de chaque encaissement pour l\'impôt.';
  else ir = 'Provision calculée : ' + nb(t) + ' % de chaque encaissement, soit environ ' + eur0(Math.round(t * s.caAnnuel / 100)) + ' d\'impôt pour ' + eur0(s.caAnnuel) + ' de CA (abattement de ' + nb(s.taux[s.activite].abatt) + ' %, barème 2026).';
  $('#ir-info').textContent = ir;
  const w = s.split, sum = w.salaire + w.securite + w.invest + w.pro;
  $('#split-info').textContent = sum === 100 ? 'Total 100 %.' : sum > 0 ? 'Total ' + nb(sum) + ' % : les parts sont ramenées proportionnellement à 100 %.' : 'Tout est à 0 : la totalité passe dans « À te verser ».';
}

/* ---------- divers ---------- */
let toastT = null;
function toast(msg) { const el = $('#toast'); el.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => { el.textContent = ''; }, 5000); }
function renderAll() { renderCalc(); renderUrssaf(); renderCA(); renderCumul(); renderMatelas(); renderJournal(); renderReglagesInfos(); }

function enregistrer() {
  const { m, act, date } = lireVirement(); if (!m) return;
  const r = Core.ventiler(m, act, state.settings, cumulSecurite());
  const v = { id: 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), kind: 'virement', date, libelle: $('#libelle').value.trim().slice(0, 80), activite: act, montant: m, ca: r.ca, parts: r.parts, irMode: r.irMode, cree: Date.now() };
  state.virements.push(v); state.exemple = false;
  $('#montant').value = ''; $('#libelle').value = '';
  lsWrite(); renderAll(); toast('Virement enregistré.');
  suivre('virement_enregistre');
  pushVirement(v);
}

/* ---------- démarrage ---------- */
function demarrer() {
  const local = lsRead();
  if (local) {
    state.settings = fusion(Core.DEFAUTS, local.settings);
    state.virements = Array.isArray(local.virements) ? local.virements.filter((v) => v && v.parts && v.date) : [];
    state.touche = !!local.touche;
  }
  try { state.masque = localStorage.getItem(LS + '.masque') === '1'; } catch (e) {}
  if (state.virements.length) { state.exemple = false; $('#montant').value = ''; }
  $('#date').value = aujourdhui();
  construireTaux(); remplirReglages();
  $('#page').classList.toggle('masque', state.masque);
  $('#btn-masque').setAttribute('aria-pressed', String(state.masque));
  renderAll();

  $('#montant').addEventListener('input', () => { state.exemple = false; $('#exemple').textContent = ''; renderCalc(); if (!dejaSaisi) { dejaSaisi = true; suivre('montant_saisi'); } });
  $('#montant').addEventListener('keydown', (e) => { if (e.key === 'Enter') enregistrer(); });
  $('#date').addEventListener('change', renderCalc);
  $('#activite').addEventListener('change', () => { state.activiteChoisie = true; renderCalc(); });
  $('#btn-save').addEventListener('click', enregistrer);
  $('#btn-masque').addEventListener('click', () => {
    state.masque = !state.masque;
    try { localStorage.setItem(LS + '.masque', state.masque ? '1' : '0'); } catch (e) {}
    $('#page').classList.toggle('masque', state.masque);
    $('#btn-masque').setAttribute('aria-pressed', String(state.masque));
    renderAll();
  });
  $('#reglages').addEventListener('input', (e) => {
    if (!e.target.id) return;
    lireReglages();
    if (e.target.id === 'set-activite') { state.activiteChoisie = false; $('#activite').value = state.settings.activite; }
    renderAll(); planifierSettings();
  });
  $('#journal-body').addEventListener('click', (e) => {
    const b = e.target.closest('.suppr'); if (!b) return;
    if (b.dataset.arme !== '1') {
      b.dataset.arme = '1'; b.textContent = 'Confirmer la suppression';
      setTimeout(() => { if (b.isConnected) { b.dataset.arme = ''; b.textContent = 'Supprimer'; } }, 4000);
      return;
    }
    const id = b.dataset.id;
    state.virements = state.virements.filter((v) => v.id !== id);
    lsWrite(); renderAll(); toast('Virement supprimé.'); dropVirement(id);
  });
  const survol = (k) => {
    $('#barre').classList.toggle('survol', !!k);
    document.querySelectorAll('.calc [data-k]').forEach((el) => el.classList.toggle('actif', !!k && el.dataset.k === k));
  };
  document.querySelector('.calc').addEventListener('mouseover', (e) => { const el = e.target.closest('[data-k]'); survol(el ? el.dataset.k : null); });
  document.querySelector('.calc').addEventListener('mouseleave', () => survol(null));

  connecter();
}
demarrer();
})();
