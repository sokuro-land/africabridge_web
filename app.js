/* ============================================================
   AFRIABRIDGE — app.js
   Application logic complète : auth, transferts, colis, KYC
   ============================================================ */

'use strict';

// ── CONFIGURATION ──────────────────────────────────────────────────
const CONFIG = {
  API_URL: 'https://api.afriabridge.com/api', // ← votre backend
  APP_VERSION: '1.0.0',
  QUOTE_DEBOUNCE_MS: 600,
  // Taux de secours (fallback si API indisponible)
  FALLBACK_RATES: {
    'EUR:XOF': 655.96, 'EUR:XAF': 655.96, 'EUR:GNF': 9480,
    'EUR:CDF': 2920, 'EUR:MAD': 10.85, 'EUR:NGN': 1760,
    'EUR:KES': 145, 'EUR:USD': 1.08, 'EUR:CAD': 1.47,
    'CAD:XOF': 446, 'USD:XOF': 607, 'USD:GNF': 8777,
  }
};

// ── APPLICATION STATE ──────────────────────────────────────────────
const App = {
  user: null,
  token: null,
  currentScreen: 'auth',
  screenHistory: [],
  quoteTimer: null,
  balanceVisible: true,
  transactions: [],
};

// ── INITIALISATION ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Simulation du splash 2s puis boot
  setTimeout(() => {
    const splash = document.getElementById('splash');
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
      boot();
    }, 500);
  }, 2000);
});

async function boot() {
  // Récupérer la session stockée
  const storedToken = localStorage.getItem('afb_token');
  const storedUser  = localStorage.getItem('afb_user');

  if (storedToken && storedUser) {
    App.token = storedToken;
    App.user  = JSON.parse(storedUser);
    initAuthenticatedApp();
  } else {
    showScreen('auth');
  }
}

function initAuthenticatedApp() {
  updateProfileUI();
  showScreen('home');
  loadRates();
  loadRecentTransactions();
  checkKYCBanner();
  // Rafraîchir les taux toutes les 5 minutes
  setInterval(loadRates, 5 * 60 * 1000);
}

// ── NAVIGATION ─────────────────────────────────────────────────────
function showScreen(name) {
  const prevEl = document.querySelector('.screen.active');
  const nextEl = document.getElementById(`screen-${name}`);
  if (!nextEl) return;

  // Cacher bottom nav sur certains écrans intérieurs
  const mainScreens = ['home','send-money','send-parcel','profile','history'];
  const showNav = mainScreens.includes(name) && App.user;
  document.getElementById('bottom-nav').classList.toggle('hidden', !showNav);

  if (prevEl && prevEl !== nextEl) {
    prevEl.classList.remove('active');
    prevEl.classList.add('slide-out');
    setTimeout(() => prevEl.classList.remove('slide-out'), 300);
  }

  nextEl.classList.add('active');
  if (prevEl && prevEl !== document.getElementById('screen-auth')) {
    App.screenHistory.push(App.currentScreen);
  }
  App.currentScreen = name;

  // Mettre à jour la nav bar
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });
}

function goBack() {
  if (App.screenHistory.length > 0) {
    const prev = App.screenHistory.pop();
    const el = document.getElementById(`screen-${prev}`);
    if (el) {
      const cur = document.getElementById(`screen-${App.currentScreen}`);
      if (cur) { cur.classList.remove('active'); }
      el.classList.add('active');
      App.currentScreen = prev;
      const mainScreens = ['home','send-money','send-parcel','profile','history'];
      document.getElementById('bottom-nav').classList.toggle('hidden', !mainScreens.includes(prev));
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.screen === prev);
      });
    }
  } else {
    showScreen('home');
  }
}

// ── AUTH ───────────────────────────────────────────────────────────
function showForm(name) {
  document.getElementById('form-login').classList.toggle('hidden', name !== 'login');
  document.getElementById('form-register').classList.toggle('hidden', name !== 'register');
}

async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');

  if (!email || !password) {
    showFormError('login-error', 'Veuillez remplir tous les champs.');
    return;
  }
  if (!isValidEmail(email)) {
    showFormError('login-error', 'Adresse email invalide.');
    return;
  }

  const btn = document.querySelector('#form-login .btn-primary');
  setLoading(btn, true);

  try {
    // ── Mode démo : simuler une réponse si l'API est inaccessible ──
    const data = await apiCall('POST', '/auth/login', { email, password })
      .catch(() => simulateLogin(email));

    App.token = data.token;
    App.user  = data.user;
    localStorage.setItem('afb_token', data.token);
    localStorage.setItem('afb_user', JSON.stringify(data.user));

    errEl.classList.add('hidden');
    initAuthenticatedApp();
    showToast('Connexion réussie ! Bienvenue 👋', 'success');
  } catch (err) {
    showFormError('login-error', err.message || 'Identifiants incorrects.');
  } finally {
    setLoading(btn, false);
  }
}

async function handleRegister() {
  const firstName = document.getElementById('reg-firstname').value.trim();
  const lastName  = document.getElementById('reg-lastname').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const phone     = document.getElementById('reg-phone').value.trim();
  const dialCode  = document.getElementById('reg-dialcode').value;
  const country   = document.getElementById('reg-country').value;
  const password  = document.getElementById('reg-password').value;

  if (!firstName || !lastName || !email || !password) {
    showFormError('reg-error', 'Veuillez remplir tous les champs obligatoires.'); return;
  }
  if (!isValidEmail(email)) {
    showFormError('reg-error', 'Adresse email invalide.'); return;
  }
  if (password.length < 8) {
    showFormError('reg-error', 'Mot de passe trop court (min. 8 caractères).'); return;
  }

  const btn = document.querySelector('#form-register .btn-primary');
  setLoading(btn, true);

  try {
    const data = await apiCall('POST', '/auth/register', {
      email, password, firstName, lastName,
      phone: `${dialCode}${phone}`, countryCode: country
    }).catch(() => simulateRegister({ firstName, lastName, email, country }));

    App.token = data.token;
    App.user  = data.user;
    localStorage.setItem('afb_token', data.token);
    localStorage.setItem('afb_user', JSON.stringify(data.user));

    initAuthenticatedApp();
    showToast('Compte créé avec succès ! 🎉', 'success');
    showModal('Vérifiez votre email', `
      <p style="font-size:15px;color:var(--text-secondary);line-height:1.6">
        Un email de confirmation a été envoyé à <strong>${email}</strong>.<br/>
        Pensez également à compléter votre vérification KYC pour débloquer les transferts.
      </p>
    `, [{ label: 'Compléter le KYC', action: () => { closeModal(); showScreen('kyc'); } },
        { label: 'Plus tard', outline: true, action: closeModal }]);
  } catch (err) {
    showFormError('reg-error', err.message || 'Erreur lors de l\'inscription.');
  } finally {
    setLoading(btn, false);
  }
}

function handleLogout() {
  showModal('Déconnexion', '<p style="font-size:15px;color:var(--text-secondary)">Voulez-vous vraiment vous déconnecter ?</p>',
    [{ label: 'Se déconnecter', danger: true, action: () => {
        closeModal();
        App.user = null; App.token = null;
        App.screenHistory = [];
        localStorage.removeItem('afb_token');
        localStorage.removeItem('afb_user');
        showScreen('auth');
        showForm('login');
        showToast('Déconnecté avec succès.', 'info');
      }},
     { label: 'Annuler', outline: true, action: closeModal }
    ]);
}

// ── TRANSFER — SEND MONEY ──────────────────────────────────────────
let quoteTimer = null;

function debounceQuote() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(fetchQuote, CONFIG.QUOTE_DEBOUNCE_MS);
}

async function fetchQuote() {
  const amount = parseFloat(document.getElementById('send-amount').value);
  const from   = document.getElementById('send-from').value;
  const to     = document.getElementById('send-to').value;

  const receivedEl  = document.getElementById('amount-received');
  const detailsEl   = document.getElementById('quote-details');
  const loadingEl   = document.getElementById('quote-loading');

  if (!amount || amount < 5 || from === to) {
    receivedEl.textContent = '—';
    detailsEl.classList.add('hidden');
    return;
  }

  detailsEl.classList.add('hidden');
  loadingEl.classList.remove('hidden');

  try {
    const quote = await apiCall('GET', `/transfers/quote?amount=${amount}&from=${from}&to=${to}`)
      .catch(() => computeLocalQuote(amount, from, to));

    receivedEl.textContent = formatAmount(quote.amountReceived, quote.toCurrency);
    document.getElementById('q-rate').textContent = `1 ${from} = ${formatNumber(quote.rate)} ${to}`;
    document.getElementById('q-fee').textContent  = `${quote.feeAmount.toFixed(2)} ${from} (${quote.feePercent}%)`;
    document.getElementById('q-total').textContent = `${(amount + quote.feeAmount).toFixed(2)} ${from}`;

    detailsEl.classList.remove('hidden');

    // Sauvegarder le devis courant
    App.currentQuote = quote;
  } catch (err) {
    receivedEl.textContent = '—';
  } finally {
    loadingEl.classList.add('hidden');
  }
}

async function handleSendMoney() {
  const amount      = parseFloat(document.getElementById('send-amount').value);
  const fromCur     = document.getElementById('send-from').value;
  const toCur       = document.getElementById('send-to').value;
  const recipient   = document.getElementById('recipient-email').value.trim();
  const note        = document.getElementById('transfer-note').value.trim();
  const payMethod   = document.querySelector('input[name="payment"]:checked')?.value;

  if (!amount || amount < 5) { showFormError('send-error', 'Montant minimum : 5 €.'); return; }
  if (amount > 10000) { showFormError('send-error', 'Montant maximum : 10 000 €.'); return; }
  if (!recipient) { showFormError('send-error', 'Veuillez renseigner l\'email du bénéficiaire.'); return; }
  if (!isValidEmail(recipient)) { showFormError('send-error', 'Email bénéficiaire invalide.'); return; }
  if (!App.user || App.user.kycLevel < 1) {
    showModal('KYC requis', '<p style="font-size:15px;color:var(--text-secondary);line-height:1.6">Vous devez compléter votre vérification d\'identité avant d\'effectuer un transfert.</p>',
      [{ label: 'Vérifier mon identité', action: () => { closeModal(); showScreen('kyc'); }},
       { label: 'Annuler', outline: true, action: closeModal }]);
    return;
  }

  const btn = document.querySelector('#screen-send-money .btn-primary');
  setLoading(btn, true);

  try {
    const result = await apiCall('POST', '/transfers', {
      recipientEmail: recipient, amount, currencyFrom: fromCur,
      currencyTo: toCur, paymentMethod: payMethod, notes: note
    }).catch(() => simulateTransfer(amount, fromCur, toCur, recipient));

    document.getElementById('send-error').classList.add('hidden');

    // Ajouter à la liste locale
    addLocalTransaction({
      type: 'transfer', direction: 'sent',
      amount: `-${amount.toFixed(2)} ${fromCur}`,
      description: `Transfert vers ${recipient}`,
      status: 'pending', date: new Date()
    });

    showModal('Transfert initié ✅', `
      <div style="text-align:center;padding:12px 0">
        <div style="font-size:48px;margin-bottom:16px">💸</div>
        <p style="font-size:15px;color:var(--text-secondary);line-height:1.7">
          Votre transfert de <strong>${amount} ${fromCur}</strong> vers <strong>${recipient}</strong> est en cours de traitement.<br/>
          Le bénéficiaire recevra <strong style="color:var(--brand)">${App.currentQuote?.amountReceived?.toFixed(2) || '—'} ${toCur}</strong>.
        </p>
        <div style="background:var(--brand-pale);border-radius:10px;padding:12px 16px;margin-top:16px;font-size:13px;color:var(--text-secondary)">
          Référence : <strong style="font-family:var(--font-display)">${result?.transfer?.escrow_reference || 'AFB-' + Date.now()}</strong>
        </div>
      </div>
    `, [{ label: 'Voir l\'historique', action: () => { closeModal(); showScreen('history'); }},
        { label: 'Fermer', outline: true, action: closeModal }]);

    // Reset form
    document.getElementById('send-amount').value = '';
    document.getElementById('amount-received').textContent = '—';
    document.getElementById('quote-details').classList.add('hidden');

  } catch (err) {
    showFormError('send-error', err.message || 'Erreur lors du transfert.');
  } finally {
    setLoading(btn, false);
  }
}

// ── PARCEL ─────────────────────────────────────────────────────────
function switchParcelTab(tab, btn) {
  document.querySelectorAll('.parcel-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-send').classList.toggle('hidden', tab !== 'send');
  document.getElementById('tab-carry').classList.toggle('hidden', tab !== 'carry');
}

async function handleSendParcel() {
  const title    = document.getElementById('parcel-title').value.trim();
  const desc     = document.getElementById('parcel-desc').value.trim();
  const weight   = parseFloat(document.getElementById('parcel-weight').value);
  const value    = parseFloat(document.getElementById('parcel-value').value);
  const from     = document.getElementById('parcel-from').value;
  const to       = document.getElementById('parcel-to').value;
  const date     = document.getElementById('parcel-date').value;
  const price    = parseFloat(document.getElementById('parcel-price').value);
  const insured  = document.getElementById('parcel-insurance').checked;

  if (!title) { showFormError('parcel-error', 'Veuillez décrire votre colis.'); return; }
  if (!weight || weight <= 0) { showFormError('parcel-error', 'Poids invalide.'); return; }
  if (!date) { showFormError('parcel-error', 'Date de voyage requise.'); return; }
  if (!price || price < 5) { showFormError('parcel-error', 'Budget minimum : 5 €.'); return; }

  const btn = document.querySelector('#tab-send .btn-primary');
  setLoading(btn, true);

  try {
    const result = await apiCall('POST', '/parcels', {
      title, description: desc, weightKg: weight, declaredValue: value || 0,
      currency: 'EUR', originCountry: from, destinationCountry: to,
      travelDate: date, priceOffered: price, insuranceOpted: insured
    }).catch(() => simulateParcel(title, from, to, date));

    document.getElementById('parcel-error').classList.add('hidden');

    addLocalTransaction({
      type: 'parcel', direction: 'sent',
      amount: `${weight} kg`,
      description: title,
      status: 'searching', date: new Date()
    });

    showModal('Annonce publiée 📦', `
      <div style="text-align:center;padding:12px 0">
        <div style="font-size:48px;margin-bottom:16px">📦</div>
        <p style="font-size:15px;color:var(--text-secondary);line-height:1.7">
          Votre annonce "<strong>${title}</strong>" est en ligne.<br/>
          Les voyageurs vérifiés peuvent maintenant vous contacter.
        </p>
        <div style="background:var(--brand-pale);border-radius:10px;padding:12px 16px;margin-top:16px">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Numéro de suivi</div>
          <div style="font-family:var(--font-display);font-size:20px;font-weight:800;color:var(--brand)">${result?.tracking_code || 'AFB-' + Math.random().toString(36).slice(2,8).toUpperCase()}</div>
        </div>
      </div>
    `, [{ label: 'Suivre mon colis', action: () => { closeModal(); showScreen('track'); }},
        { label: 'Fermer', outline: true, action: closeModal }]);

    // Reset
    ['parcel-title','parcel-desc','parcel-weight','parcel-value','parcel-price','parcel-date']
      .forEach(id => document.getElementById(id).value = '');

  } catch (err) {
    showFormError('parcel-error', err.message || 'Erreur lors de la publication.');
  } finally {
    setLoading(btn, false);
  }
}

async function handlePublishCarrier() {
  const from   = document.getElementById('carrier-from').value;
  const to     = document.getElementById('carrier-to').value;
  const date   = document.getElementById('carrier-date').value;
  const weight = document.getElementById('carrier-weight').value;

  if (!date || !weight) {
    showToast('Remplissez la date et le poids disponible.', 'error'); return;
  }

  const btn = document.querySelector('#tab-carry .btn-primary');
  setLoading(btn, true);
  await sleep(1200);
  setLoading(btn, false);

  showToast('Votre trajet est publié ! 🛫 Les expéditeurs peuvent vous contacter.', 'success');
}

// ── TRACKING ───────────────────────────────────────────────────────
async function handleTrack() {
  const code = document.getElementById('track-code').value.trim().toUpperCase();
  if (!code) { showToast('Entrez un numéro de suivi.', 'error'); return; }

  const resultEl = document.getElementById('track-result');
  resultEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Recherche en cours…</div>';
  resultEl.classList.remove('hidden');

  try {
    const data = await apiCall('GET', `/parcels/track/${code}`)
      .catch(() => simulateTracking(code));

    const statusIcons = {
      searching: '🔍', booked: '✅', in_transit: '✈️',
      delivered: '🎉', disputed: '⚠️', cancelled: '❌'
    };

    const steps = [
      { label: 'Annonce publiée', done: true },
      { label: 'Transporteur trouvé', done: ['booked','in_transit','delivered'].includes(data.status) },
      { label: 'En transit', done: ['in_transit','delivered'].includes(data.status), active: data.status === 'in_transit' },
      { label: 'Livré', done: data.status === 'delivered' },
    ];

    resultEl.innerHTML = `
      <div class="track-status-header">
        <div class="track-status-icon">${statusIcons[data.status] || '📦'}</div>
        <div>
          <div class="track-status-title">#${data.trackingCode}</div>
          <div class="track-status-msg">${data.statusMessage}</div>
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
        ${data.originCountry} → ${data.destinationCountry}
        ${data.travelDate ? `• Voyage le ${formatDate(data.travelDate)}` : ''}
      </div>
      <div class="track-timeline">
        ${steps.map((step, i) => `
          <div class="track-step">
            <div class="track-step-left">
              <div class="track-step-dot ${step.done ? 'done' : ''} ${step.active ? 'active' : ''}"></div>
              ${i < steps.length - 1 ? `<div class="track-step-line ${step.done ? 'done' : ''}"></div>` : ''}
            </div>
            <div class="track-step-info">
              <div class="track-step-label" style="color:${step.done ? 'var(--text-primary)' : 'var(--text-muted)'}">${step.label}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    resultEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--danger)">Colis introuvable. Vérifiez le numéro de suivi.</div>`;
  }
}

// ── KYC ────────────────────────────────────────────────────────────
function handleKYCUpload(type, input) {
  const file = input.files[0];
  if (!file) return;

  const uploadZone = document.getElementById('kyc-upload-id');
  uploadZone.style.borderColor = 'var(--brand)';
  uploadZone.style.background  = 'var(--brand-pale)';
  const label = uploadZone.querySelector('.upload-label');
  label.innerHTML = `
    <span style="font-size:36px">✅</span>
    <span class="upload-text" style="color:var(--brand)">${file.name}</span>
    <span class="upload-hint">${(file.size / 1024 / 1024).toFixed(2)} Mo • Cliquez pour changer</span>
  `;
  App.kycFile = file;
  document.getElementById('kstep-1-status').textContent = '✅';
  showToast('Document chargé avec succès.', 'success');
}

async function handleSubmitKYC() {
  if (!App.kycFile) {
    showToast('Veuillez d\'abord charger une pièce d\'identité.', 'error'); return;
  }

  const btn = document.querySelector('#screen-kyc .btn-primary');
  setLoading(btn, true);

  try {
    await sleep(2000); // Simulation upload
    document.getElementById('kstep-1-status').textContent = '✅';
    document.getElementById('kstep-2-status').textContent = '⏳';

    showModal('KYC soumis ✅', `
      <div style="text-align:center;padding:12px 0">
        <div style="font-size:52px;margin-bottom:16px">🛡️</div>
        <p style="font-size:15px;color:var(--text-secondary);line-height:1.7">
          Vos documents ont été soumis pour vérification.<br/>
          La validation prend généralement <strong>moins de 24 heures</strong>.<br/>
          Vous recevrez une notification dès la confirmation.
        </p>
      </div>
    `, [{ label: 'Compris', action: () => { closeModal(); goBack(); }}]);
  } finally {
    setLoading(btn, false);
  }
}

// ── RATES ──────────────────────────────────────────────────────────
async function loadRates() {
  const pairs = [
    ['EUR','XOF'], ['EUR','XAF'], ['CAD','XOF'], ['USD','GNF']
  ];

  const items = document.querySelectorAll('#rate-list .rate-value');

  for (let i = 0; i < pairs.length; i++) {
    const [from, to] = pairs[i];
    try {
      const rate = await getRate(from, to);
      if (items[i]) {
        items[i].textContent = formatNumber(rate);
        items[i].classList.remove('loading');
      }
    } catch {
      if (items[i]) items[i].textContent = 'N/A';
    }
  }
}

async function getRate(from, to) {
  try {
    const data = await apiCall('GET', `/transfers/quote?amount=1&from=${from}&to=${to}`);
    return data.rate;
  } catch {
    return CONFIG.FALLBACK_RATES[`${from}:${to}`] || null;
  }
}

function computeLocalQuote(amount, from, to) {
  const rate = CONFIG.FALLBACK_RATES[`${from}:${to}`];
  if (!rate) throw new Error('Paire non disponible');
  const feePercent = amount > 500 ? 2.0 : amount > 100 ? 2.5 : 3.5;
  const feeAmount  = parseFloat(((amount * feePercent) / 100).toFixed(2));
  const amountReceived = parseFloat(((amount - feeAmount) * rate).toFixed(2));
  return { rate, feePercent, feeAmount, amountReceived, fromCurrency: from, toCurrency: to };
}

// ── TRANSACTIONS ───────────────────────────────────────────────────
function addLocalTransaction(txn) {
  App.transactions.unshift({ ...txn, id: Date.now() });
  renderTransactions(document.getElementById('recent-transactions'), App.transactions.slice(0, 5));
  renderTransactions(document.getElementById('history-list'), App.transactions);
}

function renderTransactions(container, txns) {
  if (!container) return;
  if (!txns || txns.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Aucune transaction pour le moment</p></div>`;
    return;
  }
  container.innerHTML = txns.map(t => `
    <div class="txn-item">
      <div class="txn-icon ${t.direction === 'sent' ? (t.type === 'parcel' ? 'parcel' : 'sent') : 'received'}">
        ${t.type === 'parcel' ? '📦' : (t.direction === 'sent' ? '↑' : '↓')}
      </div>
      <div class="txn-info">
        <div class="txn-title">${t.description}</div>
        <div class="txn-date">${formatDate(t.date)}</div>
      </div>
      <div>
        <div class="txn-amount ${t.direction === 'sent' ? 'negative' : 'positive'}">${t.amount}</div>
        <div class="txn-status ${t.status}">${translateStatus(t.status)}</div>
      </div>
    </div>
  `).join('');
}

async function loadRecentTransactions() {
  try {
    const data = await apiCall('GET', '/transfers?limit=10').catch(() => []);
    if (data && data.length > 0) {
      App.transactions = data.map(t => ({
        type: 'transfer',
        direction: t.sender_id === App.user?.id ? 'sent' : 'received',
        amount: `${t.amount_sent} ${t.currency_from}`,
        description: `Transfert ${t.direction === 'sent' ? 'vers' : 'de'} ${t.recipientEmail || '—'}`,
        status: t.status, date: t.created_at
      }));
      renderTransactions(document.getElementById('recent-transactions'), App.transactions.slice(0, 5));
      renderTransactions(document.getElementById('history-list'), App.transactions);
    }
  } catch {}
}

function filterHistory(type, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filtered = type === 'all' ? App.transactions : App.transactions.filter(t => t.type === type);
  renderTransactions(document.getElementById('history-list'), filtered);
}

// ── UI HELPERS ─────────────────────────────────────────────────────
function updateProfileUI() {
  if (!App.user) return;
  const initials = `${App.user.firstName?.[0] || ''}${App.user.lastName?.[0] || ''}`.toUpperCase() || 'U';
  const name     = `${App.user.firstName || ''} ${App.user.lastName || ''}`.trim();

  const homeAvatar = document.getElementById('home-avatar');
  const homeUser   = document.getElementById('home-username');
  const pAvatar    = document.getElementById('profile-avatar');
  const pName      = document.getElementById('profile-name');
  const pEmail     = document.getElementById('profile-email');
  const pKyc       = document.getElementById('profile-kyc-badge');
  const pScore     = document.getElementById('profile-score');

  if (homeAvatar) homeAvatar.textContent = initials;
  if (homeUser)   homeUser.textContent   = App.user.firstName || 'Utilisateur';
  if (pAvatar)    pAvatar.textContent    = initials;
  if (pName)      pName.textContent      = name || 'Utilisateur';
  if (pEmail)     pEmail.textContent     = App.user.email || '';
  if (pKyc)       pKyc.textContent       = `KYC Niveau ${App.user.kycLevel || 0}`;
  if (pScore)     pScore.textContent     = (App.user.reputationScore || 5.0).toFixed(1);
}

function checkKYCBanner() {
  const banner = document.getElementById('kyc-banner');
  if (banner && App.user && (App.user.kycLevel || 0) < 1) {
    banner.classList.remove('hidden');
  }
}

function toggleBalance() {
  App.balanceVisible = !App.balanceVisible;
  const el = document.getElementById('balance-display');
  if (el) el.textContent = App.balanceVisible ? '0,00 €' : '••••••';
}

function setLoading(btn, loading) {
  if (!btn) return;
  const textEl   = btn.querySelector('.btn-text');
  const loaderEl = btn.querySelector('.btn-loader');
  btn.disabled   = loading;
  if (textEl)   textEl.classList.toggle('hidden', loading);
  if (loaderEl) loaderEl.classList.toggle('hidden', !loading);
}

function showFormError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function togglePassword(id, btn) {
  const input = document.getElementById(id);
  if (input) {
    const isText = input.type === 'text';
    input.type   = isText ? 'password' : 'text';
    btn.textContent = isText ? '👁' : '🙈';
  }
}

// ── TOAST ──────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3500) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ── MODAL ──────────────────────────────────────────────────────────
function showModal(title, bodyHTML, buttons = []) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;

  const footer = document.getElementById('modal-footer');
  footer.innerHTML = '';
  buttons.forEach(btn => {
    const el = document.createElement('button');
    el.className = btn.outline
      ? 'btn-primary' : btn.danger
      ? 'btn-primary'
      : 'btn-primary';
    el.style.cssText = btn.outline
      ? 'background:var(--surface-2);color:var(--text-primary);box-shadow:none;border:1.5px solid var(--border)'
      : btn.danger
      ? 'background:var(--danger);box-shadow:0 4px 14px rgba(220,38,38,0.3)'
      : '';
    el.innerHTML = `<span class="btn-text">${btn.label}</span>`;
    el.onclick = btn.action;
    footer.appendChild(el);
  });

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function showNotifSettings() {
  showToast('Paramètres de notification à venir.', 'info');
}
function showSupport() {
  showModal('Support & Aide', `
    <div style="display:flex;flex-direction:column;gap:14px">
      <a href="mailto:support@afriabridge.com" style="display:flex;gap:12px;align-items:center;padding:14px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border)">
        <span style="font-size:22px">📧</span>
        <div><strong style="font-size:14px">Email</strong><br><span style="font-size:13px;color:var(--text-muted)">support@afriabridge.com</span></div>
      </a>
      <a href="https://wa.me/33XXXXXXXXX" style="display:flex;gap:12px;align-items:center;padding:14px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border)">
        <span style="font-size:22px">💬</span>
        <div><strong style="font-size:14px">WhatsApp</strong><br><span style="font-size:13px;color:var(--text-muted)">Réponse sous 2h</span></div>
      </a>
    </div>
  `, [{ label: 'Fermer', outline: true, action: closeModal }]);
}

// ── API CLIENT ─────────────────────────────────────────────────────
async function apiCall(method, path, body = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(App.token && { Authorization: `Bearer ${App.token}` })
  };

  const res = await fetch(`${CONFIG.API_URL}${path}`, {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) })
  });

  if (res.status === 401) {
    // Token expiré
    App.token = null; App.user = null;
    localStorage.clear();
    showScreen('auth');
    throw new Error('Session expirée.');
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

// ── SIMULATEURS (mode hors-ligne / démo) ───────────────────────────
function simulateLogin(email) {
  const name = email.split('@')[0];
  return {
    token: 'demo_token_' + Date.now(),
    user: {
      id: 'demo-' + Date.now(),
      email,
      firstName: name.charAt(0).toUpperCase() + name.slice(1),
      lastName: 'Demo',
      kycLevel: 1,
      reputationScore: 5.0
    }
  };
}

function simulateRegister(data) {
  return {
    token: 'demo_token_' + Date.now(),
    user: {
      id: 'demo-' + Date.now(),
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      kycLevel: 0,
      reputationScore: 5.0
    }
  };
}

function simulateTransfer(amount, from, to, recipient) {
  return {
    transfer: {
      id: 'txn-' + Date.now(),
      escrow_reference: 'AFB-' + Math.random().toString(36).slice(2,8).toUpperCase(),
      status: 'pending'
    }
  };
}

function simulateParcel(title, from, to, date) {
  return {
    id: 'pcl-' + Date.now(),
    tracking_code: 'AFB-' + Math.random().toString(36).slice(2,8).toUpperCase(),
    status: 'searching'
  };
}

function simulateTracking(code) {
  return {
    trackingCode: code,
    status: 'in_transit',
    statusMessage: 'Colis en transit — en route vers la destination.',
    originCountry: 'FR',
    destinationCountry: 'SN',
    travelDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    pickupAt: new Date(Date.now() - 86400000).toISOString(),
    deliveredAt: null
  };
}

// ── UTILS ──────────────────────────────────────────────────────────
function formatAmount(amount, currency) {
  if (!amount) return '—';
  return `${formatNumber(amount)} ${currency}`;
}

function formatNumber(n) {
  if (!n) return '—';
  return parseFloat(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function translateStatus(s) {
  const map = {
    completed: 'Complété', pending: 'En attente', failed: 'Échoué',
    cancelled: 'Annulé', searching: 'Recherche', booked: 'Réservé',
    in_transit: 'En transit', delivered: 'Livré', escrow_held: 'En attente'
  };
  return map[s] || s;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── CAPACITOR / NATIVE HOOKS ────────────────────────────────────────
// Ces hooks sont activés automatiquement quand l'app tourne dans Capacitor
if (window.Capacitor) {
  const { App: CapApp, StatusBar, SplashScreen, Haptics, Camera } = window.Capacitor.Plugins;

  // Cacher le splash screen natif après le nôtre
  if (SplashScreen) {
    setTimeout(() => SplashScreen.hide(), 2500);
  }

  // Status bar verte
  if (StatusBar) {
    StatusBar.setBackgroundColor({ color: '#0D4A2A' }).catch(() => {});
    StatusBar.setStyle({ style: 'LIGHT' }).catch(() => {});
  }

  // Bouton retour Android
  if (CapApp) {
    CapApp.addListener('backButton', () => {
      if (App.screenHistory.length > 0) goBack();
      else CapApp.exitApp();
    });
  }
}
