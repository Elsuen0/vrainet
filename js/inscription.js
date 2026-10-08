/* Inscription email. Seule l'adresse saisie part du navigateur : elle est envoyée à Web3Forms,
   qui la transmet par mail. Les montants, eux, ne quittent jamais l'appareil.
   Colle ta clé d'accès Web3Forms dans CLE. Tant qu'elle est vide, le bloc reste masqué. */
(() => {
'use strict';
const CLE = '6a4c035c-ebca-46f2-b7ce-b9e29a9ad56d';
const ENVOI = 'https://api.web3forms.com/submit';
const LS = 'vrainet.v1.inscrit';
const DELAI = 12000;

const $ = (s) => document.querySelector(s);
const suivre = (nom) => { try { if (typeof window.va === 'function') window.va('event', { name: nom }); } catch (e) {} };
const bloc = $('#inscription');
if (!bloc || !CLE) return;

const form = $('#ins-form'), champ = $('#ins-email'), bouton = $('#ins-btn'), etat = $('#ins-etat');
const valide = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

function dire(msg, niveau) { etat.textContent = msg; if (niveau) etat.dataset.n = niveau; else delete etat.dataset.n; }
function inscrit(msg) {
  form.hidden = true; $('#ins-texte').hidden = true; $('#ins-note').hidden = true;
  dire(msg, 'ok');
}
function occupe(oui) { bouton.disabled = oui; bouton.textContent = oui ? 'Envoi…' : 'Me prévenir'; }

async function envoyer(email) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), DELAI);
  try {
    const rep = await fetch(ENVOI, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: CLE, subject: 'VraiNet : nouvel inscrit', from_name: 'VraiNet', email, origine: location.hostname })
    });
    let json = null; try { json = await rep.json(); } catch (e) {}
    if (rep.status === 200 && json && json.success) return 'ok';
    return rep.status === 429 ? 'trop' : 'echec';
  } catch (e) { return 'reseau'; }
  finally { clearTimeout(t); }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (bouton.disabled) return;
  const email = champ.value.trim();
  if (!valide(email)) {
    champ.setAttribute('aria-invalid', 'true'); champ.focus();
    return dire(email ? 'Cette adresse ne semble pas valide. Vérifie-la.' : 'Saisis ton adresse email.', 'crit');
  }
  champ.removeAttribute('aria-invalid');
  // Champ piège : invisible pour un humain, donc coché seulement par un robot. On fait comme si de rien n'était.
  if ($('#ins-piege').checked) return inscrit('C\'est noté.');
  occupe(true); dire('');
  const r = await envoyer(email);
  if (r === 'ok') {
    try { localStorage.setItem(LS, '1'); } catch (err) {}
    inscrit('C\'est noté. Tu recevras un email à la prochaine mise à jour.');
    return suivre('email_inscrit');
  }
  occupe(false);
  dire(r === 'trop' ? 'Trop de demandes d\'un coup. Réessaie dans une minute.'
    : r === 'reseau' ? 'Pas de connexion, ou le service ne répond pas. Réessaie dans un instant.'
    : 'L\'inscription n\'a pas abouti. Réessaie dans un instant.', 'crit');
});
champ.addEventListener('input', () => { if (champ.hasAttribute('aria-invalid')) { champ.removeAttribute('aria-invalid'); dire(''); } });

let deja = false;
try { deja = localStorage.getItem(LS) === '1'; } catch (e) {}
if (deja) inscrit('Tu es inscrit aux mises à jour de VraiNet.');
bloc.hidden = false;
})();
