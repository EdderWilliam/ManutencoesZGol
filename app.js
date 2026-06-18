// ==== VEÍCULOS ====
const VEHICLES = {
  z400: {
    label: 'Kawasaki Z400',
    short: 'Z400',
    SHEET_CSV_URL:   'https://docs.google.com/spreadsheets/d/12haryd4Q0eZem44_FACWyfOBI6430GlX3SpeLUtX_Pc/pub?output=csv',
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbybW4YiYdSqi0xH1muKzUwKtdrUh8JqC-MqwLnhb6oqUXBFtEIrBzgLWC--WF3-XOUNfQ/exec',
  },
  gol: {
    label: 'VW Gol 2008',
    short: 'Gol 2008',
    SHEET_CSV_URL:   'https://docs.google.com/spreadsheets/d/1yzJzHTF-WNxL4SqqFi-EMpmVTBOhOqQ0PkzGKX0qb-Y/pub?output=csv',
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzXc1Qx_L5c38MsCgi9wcMpv6VUquK4miI84YphuCgpeBlOhllqJC1QPoFjAomkxrvp/exec',
  },
};

// ==== ÍNDICES DAS COLUNAS DA PLANILHA ====
const COL = {
  ID: 0, DESC: 1, DATA: 2, KM: 3, CUSTO: 4,
  LOCAL: 5, PECAS: 6, PROX_DATA: 7, PROX_KM: 8, ALERTA_KM: 9
};

// ==== ESTADO ====
let currentVehicle = 'z400';
let records = [];
let sortConfig = { field: 'data', dir: 'desc' };

// ==== INIT ====

document.addEventListener('DOMContentLoaded', () => {
  setupListeners();
  setupVehicleTabs();
  if (isConfigured()) {
    loadRecords();
  } else {
    showSetupMessage();
  }
});

function isConfigured() {
  const v = VEHICLES[currentVehicle];
  return !v.SHEET_CSV_URL.startsWith('COLE_AQUI') && !v.APPS_SCRIPT_URL.startsWith('COLE_AQUI');
}

// ==== ABAS DE VEÍCULO ====

function setupVehicleTabs() {
  document.getElementById('vehicleTabs').addEventListener('click', e => {
    const tab = e.target.closest('[data-vehicle]');
    if (!tab) return;
    switchVehicle(tab.dataset.vehicle);
  });
}

function switchVehicle(key) {
  if (key === currentVehicle) return;
  currentVehicle = key;
  records = [];

  document.querySelectorAll('.vehicle-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.vehicle === key);
  });

  updateVehicleHeader();

  if (isConfigured()) {
    loadRecords();
  } else {
    showSetupMessage();
  }
}

function updateVehicleHeader() {
  document.getElementById('vehicleLabel').textContent = VEHICLES[currentVehicle].short;
}

// ==== CARREGAMENTO DE DADOS ====

async function loadRecords() {
  showLoading();
  try {
    const url = VEHICLES[currentVehicle].SHEET_CSV_URL + '&t=' + Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    records = rows.slice(1).map(rowToRecord).filter(r => r.id);
    render();
  } catch (err) {
    showError(
      'Não foi possível carregar os dados.<br>' +
      'Verifique se a planilha está pública e a URL está correta.<br>' +
      '<small>' + escapeHtml(err.message) + '</small>'
    );
  }
}

// ==== PARSER CSV ====

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuote) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        row.push(cell.trim());
        cell = '';
      } else if (ch === '\n') {
        row.push(cell.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
        cell = '';
      } else if (ch !== '\r') {
        cell += ch;
      }
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some(c => c !== '')) rows.push(row);
  }
  return rows;
}

function rowToRecord(row) {
  return {
    id:          row[COL.ID]        || '',
    descricao:   row[COL.DESC]      || '',
    data:        row[COL.DATA]      || '',
    km:          toNum(row[COL.KM]),
    custo:       row[COL.CUSTO]     ? toNum(row[COL.CUSTO])     : null,
    local:       row[COL.LOCAL]     || '',
    pecas:       row[COL.PECAS]     || '',
    proximaData: row[COL.PROX_DATA] || '',
    proximaKm:   row[COL.PROX_KM]   ? toNum(row[COL.PROX_KM])   : null,
    alertaKm:    row[COL.ALERTA_KM] ? toNum(row[COL.ALERTA_KM]) : null,
  };
}

function toNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const s = String(val).replace(/[^\d,.-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    return parseFloat(s.replace('.', '').replace(',', '.')) || 0;
  }
  return parseFloat(s.replace(',', '.')) || 0;
}

// ==== KM ATUAL & ALERTAS ====

function getCurrentKm() {
  if (!records.length) return 0;
  return [...records].sort((a, b) => b.data.localeCompare(a.data))[0].km;
}

function getAlertStatus(record, currentKm) {
  if (!record.proximaKm) return 'none';
  if (currentKm >= record.proximaKm) return 'overdue';
  if (record.alertaKm !== null && (record.proximaKm - currentKm) <= record.alertaKm) return 'warning';
  return 'ok';
}

// ==== ORDENAÇÃO ====

function getSorted() {
  const { field, dir } = sortConfig;
  return [...records].sort((a, b) => {
    let va = a[field] ?? (typeof a[field] === 'number' ? 0 : '');
    let vb = b[field] ?? (typeof b[field] === 'number' ? 0 : '');
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

// ==== RENDER ====

function render() {
  updateVehicleHeader();
  const currentKm = getCurrentKm();
  document.getElementById('currentKm').textContent = currentKm ? formatKm(currentKm) : '—';
  document.getElementById('totalRecords').textContent = records.length;

  const grid = document.getElementById('cardsGrid');
  const sorted = getSorted();

  if (!sorted.length) {
    grid.innerHTML = '<div class="empty-state">Nenhuma manutenção registrada ainda.<br>Clique em <strong>+ Nova Manutenção</strong> para começar.</div>';
    return;
  }

  grid.innerHTML = sorted.map(r => buildCard(r, currentKm)).join('');
}

function buildCard(r, currentKm) {
  const status = getAlertStatus(r, currentKm);
  const cardClass = status === 'overdue' ? 'card card--overdue' : status === 'warning' ? 'card card--warning' : 'card';

  const alertBadge = status === 'overdue'
    ? '<div class="card__alert">⚠ Manutenção vencida</div>'
    : status === 'warning'
    ? '<div class="card__alert">⚠ Manutenção próxima</div>'
    : '';

  const pecasHTML = r.pecas
    ? `<p class="card__pecas"><span class="label">Peças:</span> ${escapeHtml(r.pecas)}</p>`
    : '';

  const footerLeft = r.local
    ? `<span class="card__local">${escapeHtml(r.local)}</span>`
    : '<span></span>';

  const footerRight = r.custo !== null
    ? `<span class="card__cost">${formatCurrency(r.custo)}</span>`
    : '';

  const nextParts = [];
  if (r.proximaKm)   nextParts.push(formatKm(r.proximaKm));
  if (r.proximaData) nextParts.push(formatDate(r.proximaData));
  const nextHTML = nextParts.length
    ? `<div class="card__next"><span class="label">Próxima</span>${nextParts.map(p => `<span>${escapeHtml(p)}</span>`).join(' · ')}</div>`
    : '';

  return `
<div class="${cardClass}">
  ${alertBadge}
  <div class="card__header">
    <span class="card__date">${escapeHtml(formatDate(r.data))}</span>
    <span class="card__km">${escapeHtml(formatKm(r.km))}</span>
  </div>
  <div class="card__body">
    <p class="card__desc">${escapeHtml(r.descricao)}</p>
    ${pecasHTML}
  </div>
  <div class="card__footer">
    ${footerLeft}
    ${footerRight}
  </div>
  ${nextHTML}
</div>`;
}

// ==== FORMULÁRIO ====

function setupListeners() {
  document.getElementById('sortSelect').addEventListener('change', e => {
    const [field, dir] = e.target.value.split(':');
    sortConfig = { field, dir };
    render();
  });

  document.getElementById('btnRecarregar').addEventListener('click', () => {
    if (isConfigured()) loadRecords();
  });

  document.getElementById('btnNovaManutencao').addEventListener('click', openModal);
  document.getElementById('btnFecharModal').addEventListener('click', closeModal);
  document.getElementById('btnCancelar').addEventListener('click', closeModal);

  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  document.getElementById('formManutencao').addEventListener('submit', handleSubmit);
}

function openModal() {
  const form = document.getElementById('formManutencao');
  form.reset();
  document.getElementById('dataField').value = todayISO();
  const btn = document.getElementById('btnSalvar');
  btn.disabled = false;
  btn.textContent = 'Salvar';
  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('descricao').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

async function handleSubmit(e) {
  e.preventDefault();

  const descricao = document.getElementById('descricao').value.trim();
  const dataVal   = document.getElementById('dataField').value;
  const kmVal     = document.getElementById('km').value;

  if (!descricao || !dataVal || !kmVal) {
    alert('Preencha os campos obrigatórios: Descrição, Data e Quilometragem.');
    return;
  }

  const payload = {
    id:          new Date().toISOString(),
    descricao,
    data:        dataVal,
    km:          kmVal,
    custo:       document.getElementById('custo').value,
    local:       document.getElementById('local').value.trim(),
    pecas:       document.getElementById('pecas').value.trim(),
    proximaData: document.getElementById('proximaData').value,
    proximaKm:   document.getElementById('proximaKm').value,
    alertaKm:    document.getElementById('alertaKm').value,
  };

  const btn = document.getElementById('btnSalvar');
  btn.disabled = true;
  btn.textContent = 'Salvando…';

  try {
    await fetch(VEHICLES[currentVehicle].APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload),
    });

    btn.textContent = 'Salvo!';
    closeModal();

    setTimeout(() => loadRecords(), 2500);
  } catch (err) {
    btn.textContent = 'Erro — tente novamente';
    btn.disabled = false;
  }
}

// ==== HELPERS DE UI ====

function showLoading() {
  document.getElementById('cardsGrid').innerHTML = '<div class="loading">Carregando registros…</div>';
}

function showError(html) {
  document.getElementById('cardsGrid').innerHTML = `<div class="error-state">${html}</div>`;
}

function showSetupMessage() {
  const v = VEHICLES[currentVehicle];
  document.getElementById('cardsGrid').innerHTML = `
<div class="error-state">
  Configuração necessária para <strong>${escapeHtml(v.label)}</strong>.<br>
  Abra <strong>js/app.js</strong> e substitua as URLs em <code>VEHICLES.${currentVehicle}</code>.<br>
  Consulte o <strong>SETUP.md</strong> para instruções detalhadas.
</div>`;
}

// ==== FORMATADORES ====

function formatDate(iso) {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return iso;
}

function formatKm(value) {
  return Number(value).toLocaleString('pt-BR') + ' km';
}

function formatCurrency(value) {
  return 'R$ ' + Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}
