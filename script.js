const HEADER_ALIASES = {
    appliedAt: ['Tarikh Mohon'],
    approvedAt: ['Tarikh Kelulusan'],
    scheme: ['Schemes â†’ Name', 'Schemes -> Name', 'Schemes → Name'],
    applicationType: ['Application Type'],
    branch: ['Branches â†’ Name', 'Branches -> Name', 'Branches → Name']
};

const REQUIRED_FIELDS = ['appliedAt', 'approvedAt', 'scheme', 'applicationType'];
const HOLIDAY_DATES_2026 = new Set([
    '2026-01-01',
    '2026-02-02',
    '2026-02-17',
    '2026-02-18',
    '2026-03-23',
    '2026-05-01',
    '2026-05-27',
    '2026-06-01',
    '2026-06-02',
    '2026-06-17',
    '2026-08-25',
    '2026-08-31',
    '2026-09-16',
    '2026-11-09',
    '2026-12-25'
]);

const monthLabels = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogos', 'Sept', 'Okt', 'Nov', 'Dis'];
const typeLabels = { new: 'Baharu', renewal: 'Penyambungan', appeal: 'Rayuan', addrate: 'Tambah Kadar' };
const ADMIN_EMAILS = new Set(['wfadhli@maiwp.gov.my']);

let headerMap = {};
let rows = [];
let filteredRows = [];
let approvedFilteredRows = [];
let schemeOptions = [];
let tableSchemeOptions = [];
let selectedSchemes = [];
let selectedTableSchemes = [];
let selectedType = 'all';
let selectedTableType = 'all';
let typeOptions = [];
let tableTypeOptions = [];
let metricMode = 'count';
let currentSummaryRows = [];
let dataRange = { first: null, last: null };
let supabaseClient = null;
let latestRun = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('workingDayCount').textContent = getWorkingDaysIn2026().length;
    document.getElementById('holidayCount').textContent = 365 - getWorkingDaysIn2026().length;

    document.getElementById('authForm').addEventListener('submit', handleLogin);
    document.getElementById('profileButton').addEventListener('click', toggleProfileMenu);
    document.getElementById('profileLogoutBtn').addEventListener('click', handleLogout);
    document.getElementById('chooseFileBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', event => {
        if (event.target.files[0]) handleFile(event.target.files[0]);
    });

    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    setupSingleSelectEvents({
        menuId: 'typeFilterMenu',
        onChange: updateDashboard,
        optionsId: 'typeFilterOptions',
        searchId: 'typeFilterSearch',
        selectedKey: 'dashboardType',
        toggleId: 'typeFilterToggle'
    });
    setupSingleSelectEvents({
        menuId: 'tableTypeFilterMenu',
        onChange: updateSummaryTable,
        optionsId: 'tableTypeFilterOptions',
        searchId: 'tableTypeFilterSearch',
        selectedKey: 'tableType',
        toggleId: 'tableTypeFilterToggle'
    });
    setupMultiSelectEvents({
        clearButtonId: 'schemeClearBtn',
        menuId: 'schemeFilterMenu',
        onChange: updateDashboard,
        optionsId: 'schemeFilterOptions',
        selectAllButtonId: 'schemeSelectAllBtn',
        selectedKey: 'dashboard',
        toggleId: 'schemeFilterToggle'
    });
    setupMultiSelectEvents({
        clearButtonId: 'tableSchemeClearBtn',
        menuId: 'tableSchemeFilterMenu',
        onChange: updateSummaryTable,
        optionsId: 'tableSchemeFilterOptions',
        selectAllButtonId: 'tableSchemeSelectAllBtn',
        selectedKey: 'table',
        toggleId: 'tableSchemeFilterToggle'
    });
    document.addEventListener('click', () => {
        closeMultiSelectMenus();
        closeSingleSelectMenus();
        closeProfileMenu();
    });

    document.querySelectorAll('input[name="metricMode"]').forEach(input => {
        input.addEventListener('change', event => {
            metricMode = event.target.value;
            updateTrendChart(approvedFilteredRows);
        });
    });

    document.getElementById('downloadSummaryBtn').addEventListener('click', downloadSummaryTable);

    initializeSupabase();
});

async function initializeSupabase() {
    const config = window.DASHBOARD_SUPABASE_CONFIG || {};
    if (!config.url || !config.anonKey) {
        showAuthMessage('Supabase belum dikonfigurasi. Isi supabase-config.js atau guna fallback CSV lokal.', false);
        return;
    }
    if (!window.supabase?.createClient) {
        showAuthMessage('Library Supabase tidak dapat dimuatkan. Semak sambungan internet atau CDN.', true);
        return;
    }

    supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        updateAuthUi(session);
        if (session) loadSupabaseData();
    });

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        showAuthMessage(error.message, true);
        return;
    }
    updateAuthUi(data.session);
    if (data.session) await loadSupabaseData();
}

async function handleLogin(event) {
    event.preventDefault();
    clearError();
    if (!supabaseClient) {
        showAuthMessage('Supabase belum dikonfigurasi.', true);
        return;
    }

    const email = document.getElementById('emailInput').value.trim();
    const password = document.getElementById('passwordInput').value;
    if (!email || !password) return;

    const loginButton = document.getElementById('loginBtn');
    loginButton.disabled = true;
    loginButton.textContent = 'Sedang Log Masuk...';

    const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        showAuthMessage('Log masuk gagal. Semak emel, kata laluan, dan akses yang dibenarkan.', true);
        loginButton.disabled = false;
        loginButton.textContent = 'Log Masuk';
        return;
    }
    document.getElementById('passwordInput').value = '';
}

async function handleLogout() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    rows = [];
    filteredRows = [];
    approvedFilteredRows = [];
    currentSummaryRows = [];
    latestRun = null;
    document.getElementById('dashboard').hidden = true;
    document.getElementById('dateRangeText').textContent = '';
    document.getElementById('fileStatus').textContent = 'Belum ada fail dipilih.';
    updateAuthUi(null);
    closeProfileMenu();
    showAuthMessage('Sesi telah ditamatkan.', false);
}

async function loadSupabaseData() {
    clearError();
    showAuthMessage('Memuatkan data Supabase...', false);

    const { data: runRows, error: runError } = await supabaseClient
        .from('dashboard_aging_runs')
        .select('run_id,data_start_date,data_end_date,generated_at,source_record_count,status')
        .eq('status', 'success')
        .order('generated_at', { ascending: false })
        .limit(1);

    if (runError) {
        showAuthMessage(`Data tidak dapat dibaca: ${runError.message}`, true);
        return;
    }
    if (!runRows?.length) {
        showAuthMessage('Tiada data Supabase ditemui untuk akaun ini.', true);
        return;
    }

    latestRun = runRows[0];
    const { data: aggregates, error: aggregateError } = await supabaseClient
        .from('dashboard_aging_aggregates')
        .select('year,month,scheme,application_type,total_applications,approved_count,pending_count,approved_5_days_count,approved_over_5_days_count')
        .eq('run_id', latestRun.run_id);

    if (aggregateError) {
        showAuthMessage(`Agregat tidak dapat dibaca: ${aggregateError.message}`, true);
        return;
    }

    rows = expandAggregateRows(aggregates || []);
    if (!rows.length) {
        showAuthMessage('Agregat Supabase kosong untuk run terkini.', true);
        return;
    }

    dataRange = {
        first: parseAppDate(latestRun.data_start_date) || getDateRange(rows).first,
        last: parseAppDate(latestRun.data_end_date) || getDateRange(rows).last
    };
    setupFilters();
    updateDashboard();
    updateSummaryTable();

    document.getElementById('fileStatus').textContent = `Data Supabase dimuatkan (${Number(latestRun.source_record_count || rows.length).toLocaleString('ms-MY')} rekod sumber).`;
    document.getElementById('dateRangeText').textContent = `Data permohonan: ${formatShortDate(dataRange.first)} hingga ${formatShortDate(dataRange.last)}. Dikemaskini pada ${formatDateTime(latestRun.generated_at)}.`;
    document.getElementById('dashboard').hidden = false;
    showAuthMessage('Data Supabase berjaya dimuatkan.', false);
}

function expandAggregateRows(aggregates) {
    const expanded = [];
    aggregates.forEach(item => {
        const year = Number(item.year);
        const monthIndex = Number(item.month) - 1;
        if (!Number.isFinite(year) || monthIndex < 0 || monthIndex > 11) return;

        const scheme = item.scheme || '(Tiada skim)';
        const applicationType = item.application_type || 'lain-lain';
        const applicationTypeLabel = typeLabels[applicationType] || titleCase(applicationType);
        const base = {
            scheme,
            branch: '(Agregat Supabase)',
            applicationType,
            applicationTypeLabel
        };

        appendSyntheticRows(expanded, item.approved_5_days_count, {
            ...base,
            appliedDate: new Date(year, monthIndex, 1),
            approvedDate: new Date(year, monthIndex, 1),
            aging: 5,
            isApproved: true
        });
        appendSyntheticRows(expanded, item.approved_over_5_days_count, {
            ...base,
            appliedDate: new Date(year, monthIndex, 1),
            approvedDate: new Date(year, monthIndex, 8),
            aging: 6,
            isApproved: true
        });
        appendSyntheticRows(expanded, item.pending_count, {
            ...base,
            appliedDate: new Date(year, monthIndex, 1),
            approvedDate: null,
            aging: null,
            isApproved: false
        });
    });
    return expanded;
}

function appendSyntheticRows(target, count, row) {
    const total = Math.max(0, Number(count || 0));
    for (let index = 0; index < total; index++) {
        target.push({ ...row });
    }
}

function updateAuthUi(session) {
    const isLoggedIn = Boolean(session);
    const email = session?.user?.email?.toLowerCase() || '';
    const uploadCard = document.getElementById('uploadCard');
    const canUseCsvFallback = ADMIN_EMAILS.has(email);
    document.getElementById('loginView').hidden = isLoggedIn;
    document.getElementById('appContent').hidden = !isLoggedIn;
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginBtn').textContent = 'Log Masuk';
    document.getElementById('profileEmail').textContent = email || '-';
    document.getElementById('profileInitial').textContent = email ? email.charAt(0).toUpperCase() : '?';
    uploadCard.hidden = !canUseCsvFallback;
    uploadCard.style.display = canUseCsvFallback ? '' : 'none';
}

function toggleProfileMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('profileMenu');
    const button = document.getElementById('profileButton');
    const shouldOpen = menu.hidden;
    menu.hidden = !shouldOpen;
    button.setAttribute('aria-expanded', String(shouldOpen));
}

function closeProfileMenu() {
    const menu = document.getElementById('profileMenu');
    const button = document.getElementById('profileButton');
    if (!menu || !button) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
}

function showAuthMessage(message, isError) {
    const element = document.getElementById('authMessage');
    element.hidden = false;
    element.textContent = message;
    element.className = `message ${isError ? 'error' : 'info'}`;
}

function handleFile(file) {
    clearError();
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showError('Sila pilih fail CSV sahaja.');
        return;
    }

    const reader = new FileReader();
    reader.onload = event => {
        try {
            const parsed = parseCsv(event.target.result);
            headerMap = resolveHeaders(parsed.headers);
            rows = normalizeRows(parsed.records);
            if (!rows.length) throw new Error('Tiada rekod tarikh permohonan yang sah dijumpai.');

            dataRange = getDateRange(rows);
            setupFilters();
            updateDashboard();
            updateSummaryTable();

            document.getElementById('fileStatus').textContent = `${file.name} dimuatkan (${rows.length.toLocaleString('ms-MY')} rekod).`;
            document.getElementById('dateRangeText').textContent = `Data permohonan: ${formatShortDate(dataRange.first)} hingga ${formatShortDate(dataRange.last)}.`;
            document.getElementById('dashboard').hidden = false;
        } catch (error) {
            showError(error.message);
        }
    };
    reader.onerror = () => showError('Fail CSV tidak dapat dibaca.');
    reader.readAsText(file, 'utf-8');
}

function parseCsv(text) {
    const output = [];
    let row = [];
    let value = '';
    let inQuotes = false;
    const cleaned = text.replace(/^\uFEFF/, '');

    for (let index = 0; index < cleaned.length; index++) {
        const char = cleaned[index];
        const next = cleaned[index + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                value += '"';
                index++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(value);
            value = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') index++;
            row.push(value);
            if (row.some(cell => cell.trim())) output.push(row);
            row = [];
            value = '';
        } else {
            value += char;
        }
    }

    row.push(value);
    if (row.some(cell => cell.trim())) output.push(row);
    if (output.length < 2) throw new Error('CSV tiada data.');

    const headers = output[0].map(header => header.trim());
    const records = output.slice(1).map(cells => {
        const record = {};
        headers.forEach((header, index) => {
            record[header] = (cells[index] || '').trim();
        });
        return record;
    });

    return { headers, records };
}

function resolveHeaders(headers) {
    const map = {};
    const normalized = new Map(headers.map(header => [normalizeHeader(header), header]));
    Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
        const match = aliases.find(alias => normalized.has(normalizeHeader(alias)));
        map[field] = match ? normalized.get(normalizeHeader(match)) : undefined;
    });
    if (!map.scheme) {
        map.scheme = headers.find(header => /^schemes\b.*name$/i.test(normalizeHeader(header)));
    }
    if (!map.branch) {
        map.branch = headers.find(header => /^branches\b.*name$/i.test(normalizeHeader(header)));
    }

    const missing = REQUIRED_FIELDS.filter(field => !map[field]).map(field => HEADER_ALIASES[field][0]);
    if (missing.length) {
        throw new Error(`Header CSV tidak lengkap. Tiada: ${missing.join(', ')}`);
    }
    return map;
}

function normalizeHeader(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeRows(records) {
    return records.map(record => {
        const appliedDate = parseAppDate(record[headerMap.appliedAt]);
        const approvedDate = parseAppDate(record[headerMap.approvedAt]);
        if (!appliedDate) return null;

        const type = (record[headerMap.applicationType] || '').toLowerCase();
        const isApproved = Boolean(approvedDate);
        return {
            appliedDate,
            approvedDate,
            aging: isApproved ? calculateWorkingDays(appliedDate, approvedDate) : null,
            isApproved,
            scheme: record[headerMap.scheme] || '(Tiada skim)',
            branch: headerMap.branch ? (record[headerMap.branch] || '(Tiada cawangan)') : '(Tiada cawangan)',
            applicationType: type,
            applicationTypeLabel: typeLabels[type] || titleCase(type || 'Lain-lain')
        };
    }).filter(Boolean);
}

function setupFilters() {
    schemeOptions = getUniqueValues(rows.map(row => row.scheme));
    tableSchemeOptions = [...schemeOptions];
    selectedSchemes = [...schemeOptions];
    selectedTableSchemes = [...tableSchemeOptions];
    typeOptions = getUniqueValues(rows.map(row => row.applicationTypeLabel));
    tableTypeOptions = [...typeOptions];
    selectedType = 'all';
    selectedTableType = 'all';
    renderMultiSelect({
        allLabel: 'Semua skim',
        onChange: updateDashboard,
        options: schemeOptions,
        optionsId: 'schemeFilterOptions',
        selected: selectedSchemes,
        selectedKey: 'dashboard',
        toggleId: 'schemeFilterToggle'
    });
    renderMultiSelect({
        allLabel: 'Semua skim',
        onChange: updateSummaryTable,
        options: tableSchemeOptions,
        optionsId: 'tableSchemeFilterOptions',
        selected: selectedTableSchemes,
        selectedKey: 'table',
        toggleId: 'tableSchemeFilterToggle'
    });
    renderSingleSelect({
        allLabel: 'Semua jenis',
        options: typeOptions,
        optionsId: 'typeFilterOptions',
        selectedKey: 'dashboardType',
        toggleId: 'typeFilterToggle'
    });
    renderSingleSelect({
        allLabel: 'Semua jenis',
        options: tableTypeOptions,
        optionsId: 'tableTypeFilterOptions',
        selectedKey: 'tableType',
        toggleId: 'tableTypeFilterToggle'
    });
}

function updateDashboard() {
    filteredRows = rows.filter(row => {
        const schemeMatch = selectedSchemes.includes(row.scheme);
        const typeMatch = selectedType === 'all' || row.applicationTypeLabel === selectedType;
        return schemeMatch && typeMatch;
    });
    approvedFilteredRows = filteredRows.filter(row => row.isApproved);

    updateKpis(filteredRows, approvedFilteredRows);
    updateTrendChart(approvedFilteredRows);
    updateRankingTable(approvedFilteredRows);
}

function updateKpis(activeRows, approvedRows) {
    const total = activeRows.length;
    const approved = approvedRows.length;
    const pending = total - approved;
    const onTime = approvedRows.filter(row => row.aging <= 5).length;
    const late = approved - onTime;

    document.getElementById('totalApplications').textContent = total.toLocaleString('ms-MY');
    document.getElementById('approvedApplications').textContent = approved.toLocaleString('ms-MY');
    document.getElementById('pendingApplications').textContent = pending.toLocaleString('ms-MY');
    document.getElementById('onTimeApplications').textContent = onTime.toLocaleString('ms-MY');
    document.getElementById('lateApplications').textContent = late.toLocaleString('ms-MY');
    document.getElementById('onTimePercent').textContent = approved ? `${((onTime / approved) * 100).toFixed(1)}%` : '0%';
}

function updateTrendChart(approvedRows) {
    const denominator = Array(12).fill(0);
    const numerator = Array(12).fill(0);

    approvedRows.forEach(row => {
        const month = row.appliedDate.getMonth();
        denominator[month]++;
        if (row.aging <= 5) numerator[month]++;
    });

    const data = metricMode === 'percent'
        ? numerator.map((value, index) => denominator[index] ? (value / denominator[index]) * 100 : 0)
        : numerator;

    renderLineChart('trendChart', monthLabels, data, metricMode === 'percent');
}

function updateRankingTable(approvedRows) {
    const grouped = new Map();
    approvedRows.forEach(row => {
        if (!grouped.has(row.scheme)) {
            grouped.set(row.scheme, { scheme: row.scheme, approved: 0, onTime: 0 });
        }
        const item = grouped.get(row.scheme);
        item.approved++;
        if (row.aging <= 5) item.onTime++;
    });

    const rankingRows = [...grouped.values()]
        .filter(item => item.approved > 0)
        .map(item => ({
            ...item,
            percent: (item.onTime / item.approved) * 100
        }))
        .sort((a, b) => b.percent - a.percent || b.approved - a.approved || a.scheme.localeCompare(b.scheme));

    const tbody = document.getElementById('rankingTableBody');
    if (!rankingRows.length) {
        tbody.innerHTML = '<tr><td class="empty-state" colspan="4">Tiada kelulusan untuk filter ini.</td></tr>';
        return;
    }

    tbody.innerHTML = rankingRows.map((row, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(toProperCaps(row.scheme))}</td>
            <td><span class="${getPerformanceBadgeClass(row.percent)}">${formatPercent(row.percent)}</span></td>
            <td>${row.approved.toLocaleString('ms-MY')}</td>
        </tr>
    `).join('');
}

function updateSummaryTable() {
    if (!rows.length) return;

    const approvedRows = rows.filter(row => {
        const schemeMatch = selectedTableSchemes.includes(row.scheme);
        const typeMatch = selectedTableType === 'all' || row.applicationTypeLabel === selectedTableType;
        return row.isApproved && schemeMatch && typeMatch;
    });

    const grouped = monthLabels.map((month, index) => ({ month, monthIndex: index, underFive: 0, overFive: 0 }));
    approvedRows.forEach(row => {
        const item = grouped[row.appliedDate.getMonth()];
        if (row.aging <= 5) item.underFive++;
        else item.overFive++;
    });

    currentSummaryRows = grouped;
    document.getElementById('summaryTableBody').innerHTML = grouped.map(row => renderSummaryRow(row)).join('');

    const totalRow = grouped.reduce((total, row) => ({
        month: 'Jumlah Keseluruhan',
        underFive: total.underFive + row.underFive,
        overFive: total.overFive + row.overFive
    }), { month: 'Jumlah Keseluruhan', underFive: 0, overFive: 0 });

    document.getElementById('summaryTableFoot').innerHTML = renderSummaryRow(totalRow);
}

function renderSummaryRow(row) {
    const total = row.underFive + row.overFive;
    const underPercent = total ? (row.underFive / total) * 100 : 0;
    const overPercent = total ? (row.overFive / total) * 100 : 0;
    return `
        <tr>
            <td>${escapeHtml(row.month)}</td>
            <td>${total.toLocaleString('ms-MY')}</td>
            <td>${row.underFive.toLocaleString('ms-MY')}</td>
            <td>${row.overFive.toLocaleString('ms-MY')}</td>
            <td>${formatPercent(underPercent)}</td>
            <td>${formatPercent(overPercent)}</td>
        </tr>
    `;
}

function downloadSummaryTable() {
    if (!currentSummaryRows.length) {
        showError('Tiada data jadual untuk download.');
        return;
    }

    const headers = ['Bulan', 'Jumlah', '5 Hari Ke Bawah', '6 Hari Ke Atas', '% Purata Kelulusan 5 Hari', '% 6 Hari'];
    const body = currentSummaryRows.map(row => {
        const total = row.underFive + row.overFive;
        return [
            row.month,
            total,
            row.underFive,
            row.overFive,
            total ? `${((row.underFive / total) * 100).toFixed(1)}%` : '0.0%',
            total ? `${((row.overFive / total) * 100).toFixed(1)}%` : '0.0%'
        ];
    });

    const csv = [headers, ...body].map(row => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `jadual-prestasi-keseluruhan-${toIsoDate(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function renderLineChart(canvasId, labels, data, isPercent) {
    const canvas = document.getElementById(canvasId);
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(460, Math.floor(rect.width || canvas.parentElement.clientWidth || 640));
    const height = window.innerWidth < 820 ? 280 : 310;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const chart = { left: 48, top: 22, right: width - 14, bottom: height - 52 };
    chart.width = chart.right - chart.left;
    chart.height = chart.bottom - chart.top;
    const max = isPercent ? 100 : Math.max(...data, 1);
    const step = chart.width / Math.max(labels.length - 1, 1);

    ctx.strokeStyle = '#d7e1ea';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chart.left, chart.top);
    ctx.lineTo(chart.left, chart.bottom);
    ctx.lineTo(chart.right, chart.bottom);
    ctx.stroke();

    const points = data.map((value, index) => ({
        x: chart.left + index * step,
        y: chart.bottom - (value / max) * chart.height,
        value
    }));

    const gradient = ctx.createLinearGradient(0, chart.top, 0, chart.bottom);
    gradient.addColorStop(0, 'rgba(15, 107, 206, 0.24)');
    gradient.addColorStop(1, 'rgba(15, 107, 206, 0.02)');

    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.lineTo(chart.right, chart.bottom);
    ctx.lineTo(chart.left, chart.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.strokeStyle = '#0f6bce';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = '12px Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    points.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.value ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fillStyle = point.value ? '#0f6bce' : '#cbd5e1';
        ctx.fill();

        if (point.value > 0) {
            ctx.fillStyle = '#142334';
            ctx.font = '800 12px Segoe UI, Arial';
            ctx.fillText(isPercent ? `${point.value.toFixed(1)}%` : String(point.value), point.x, Math.max(chart.top, point.y - 22));
        }

        ctx.fillStyle = '#64748b';
        ctx.font = '12px Segoe UI, Arial';
        ctx.fillText(labels[index], point.x, chart.bottom + 12);
    });

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#64748b';
    for (let index = 0; index <= 4; index++) {
        const value = Math.round((max / 4) * index);
        const y = chart.bottom - (index / 4) * chart.height;
        ctx.fillText(isPercent ? `${value}%` : String(value), chart.left - 8, y);
    }

    if (!data.some(value => value > 0)) {
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.font = '800 14px Segoe UI, Arial';
        ctx.fillText('Tiada data untuk filter ini', chart.left + chart.width / 2, chart.top + chart.height / 2);
    }
}

function switchTab(panelId) {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === panelId);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === panelId);
    });
    if (panelId === 'fiveDayPanel') updateTrendChart(approvedFilteredRows);
}

function getUniqueValues(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function setupMultiSelectEvents(config) {
    document.getElementById(config.toggleId).addEventListener('click', event => {
        event.stopPropagation();
        toggleMultiSelectMenu(config.menuId, config.toggleId);
    });
    document.getElementById(config.selectAllButtonId).addEventListener('click', event => {
        event.stopPropagation();
        setMultiSelectSelection(config.selectedKey, getMultiSelectOptions(config.selectedKey));
        refreshMultiSelect(config);
        config.onChange();
    });
    document.getElementById(config.clearButtonId).addEventListener('click', event => {
        event.stopPropagation();
        setMultiSelectSelection(config.selectedKey, []);
        refreshMultiSelect(config);
        config.onChange();
    });
    document.getElementById(config.menuId).addEventListener('click', event => event.stopPropagation());
    const searchInput = getMultiSelectSearchInput(config.optionsId);
    if (searchInput) {
        searchInput.addEventListener('input', () => filterSelectOptions(config.optionsId, searchInput.value));
    }
}

function renderMultiSelect(config) {
    const optionsElement = document.getElementById(config.optionsId);
    if (!config.options.length) {
        optionsElement.innerHTML = '<div class="empty-state">Tiada skim dijumpai.</div>';
        updateMultiSelectToggle(config.toggleId, config.selected, config.options, config.allLabel);
        return;
    }

    optionsElement.innerHTML = config.options.map((option, index) => {
        const inputId = `${config.optionsId}-${index}`;
        return `
            <label for="${inputId}">
                <input type="checkbox" id="${inputId}" value="${escapeHtml(option)}" ${config.selected.includes(option) ? 'checked' : ''}>
                <span>${escapeHtml(toProperCaps(option))}</span>
            </label>
        `;
    }).join('');

    optionsElement.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', () => {
            const selected = [...optionsElement.querySelectorAll('input[type="checkbox"]:checked')].map(checkbox => checkbox.value);
            setMultiSelectSelection(config.selectedKey, selected);
            refreshMultiSelect(config);
            config.onChange();
        });
    });
    updateMultiSelectToggle(config.toggleId, config.selected, config.options, config.allLabel);
    const searchInput = getMultiSelectSearchInput(config.optionsId);
    if (searchInput) filterSelectOptions(config.optionsId, searchInput.value);
}

function refreshMultiSelect(config) {
    renderMultiSelect({
        ...config,
        allLabel: 'Semua skim',
        options: getMultiSelectOptions(config.selectedKey),
        selected: getMultiSelectSelection(config.selectedKey)
    });
}

function getMultiSelectOptions(key) {
    return key === 'table' ? tableSchemeOptions : schemeOptions;
}

function getMultiSelectSelection(key) {
    return key === 'table' ? selectedTableSchemes : selectedSchemes;
}

function setMultiSelectSelection(key, selected) {
    if (key === 'table') selectedTableSchemes = [...selected];
    else selectedSchemes = [...selected];
}

function updateMultiSelectToggle(toggleId, selected, options, allLabel) {
    const toggle = document.getElementById(toggleId);
    if (!selected.length) {
        toggle.textContent = 'Tiada skim dipilih';
    } else if (selected.length === options.length) {
        toggle.textContent = `${allLabel} (${options.length})`;
    } else if (selected.length === 1) {
        toggle.textContent = toProperCaps(selected[0]);
    } else {
        toggle.textContent = `${selected.length} skim dipilih`;
    }
}

function toggleMultiSelectMenu(menuId, toggleId) {
    const menu = document.getElementById(menuId);
    const toggle = document.getElementById(toggleId);
    const shouldOpen = menu.hidden;
    closeMultiSelectMenus();
    menu.hidden = !shouldOpen;
    toggle.setAttribute('aria-expanded', String(shouldOpen));
}

function closeMultiSelectMenus() {
    [
        ['schemeFilterMenu', 'schemeFilterToggle'],
        ['tableSchemeFilterMenu', 'tableSchemeFilterToggle']
    ].forEach(([menuId, toggleId]) => {
        const menu = document.getElementById(menuId);
        const toggle = document.getElementById(toggleId);
        if (menu && toggle) {
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
        }
    });
}

function setupSingleSelectEvents(config) {
    document.getElementById(config.toggleId).addEventListener('click', event => {
        event.stopPropagation();
        toggleSingleSelectMenu(config.menuId, config.toggleId, config.searchId);
    });
    document.getElementById(config.menuId).addEventListener('click', event => event.stopPropagation());
    document.getElementById(config.searchId).addEventListener('input', event => {
        filterSelectOptions(config.optionsId, event.target.value);
    });
}

function renderSingleSelect(config) {
    const optionsElement = document.getElementById(config.optionsId);
    const options = [
        { value: 'all', label: config.allLabel },
        ...config.options.map(option => ({ value: option, label: toProperCaps(option) }))
    ];

    optionsElement.innerHTML = options.map((option, index) => {
        const selected = getSingleSelectValue(config.selectedKey) === option.value;
        return `
            <button type="button" class="single-select-option ${selected ? 'selected' : ''}" data-value="${escapeHtml(option.value)}">
                ${escapeHtml(option.label)}
            </button>
        `;
    }).join('');

    optionsElement.querySelectorAll('.single-select-option').forEach(button => {
        button.addEventListener('click', () => {
            setSingleSelectValue(config.selectedKey, button.dataset.value);
            updateSingleSelectToggle(config.toggleId, config.selectedKey, config.allLabel);
            closeSingleSelectMenus();
            config.selectedKey === 'tableType' ? updateSummaryTable() : updateDashboard();
        });
    });
    updateSingleSelectToggle(config.toggleId, config.selectedKey, config.allLabel);
}

function getSingleSelectValue(key) {
    return key === 'tableType' ? selectedTableType : selectedType;
}

function setSingleSelectValue(key, value) {
    if (key === 'tableType') selectedTableType = value;
    else selectedType = value;
}

function updateSingleSelectToggle(toggleId, selectedKey, allLabel) {
    const value = getSingleSelectValue(selectedKey);
    document.getElementById(toggleId).textContent = value === 'all' ? allLabel : toProperCaps(value);
}

function toggleSingleSelectMenu(menuId, toggleId, searchId) {
    const menu = document.getElementById(menuId);
    const toggle = document.getElementById(toggleId);
    const shouldOpen = menu.hidden;
    closeMultiSelectMenus();
    closeSingleSelectMenus();
    menu.hidden = !shouldOpen;
    toggle.setAttribute('aria-expanded', String(shouldOpen));
    if (shouldOpen) {
        const search = document.getElementById(searchId);
        search.value = '';
        filterSelectOptions(menu.querySelector('.single-select-options').id, '');
        search.focus();
    }
}

function closeSingleSelectMenus() {
    [
        ['typeFilterMenu', 'typeFilterToggle'],
        ['tableTypeFilterMenu', 'tableTypeFilterToggle']
    ].forEach(([menuId, toggleId]) => {
        const menu = document.getElementById(menuId);
        const toggle = document.getElementById(toggleId);
        if (menu && toggle) {
            menu.hidden = true;
            toggle.setAttribute('aria-expanded', 'false');
        }
    });
}

function getMultiSelectSearchInput(optionsId) {
    if (optionsId === 'schemeFilterOptions') return document.getElementById('schemeFilterSearch');
    if (optionsId === 'tableSchemeFilterOptions') return document.getElementById('tableSchemeFilterSearch');
    return null;
}

function filterSelectOptions(optionsId, query) {
    const optionsElement = document.getElementById(optionsId);
    const needle = normalizeSearch(query);
    [...optionsElement.children].forEach(option => {
        option.hidden = needle && !normalizeSearch(option.textContent).includes(needle);
    });
}

function normalizeSearch(value) {
    return String(value || '').toLocaleLowerCase('ms-MY').trim();
}

function parseAppDate(value) {
    if (!value) return null;
    const text = String(value).trim();

    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (iso) {
        const [, year, month, day, hour = '0', minute = '0', second = '0'] = iso;
        return buildDate(year, month, day, hour, minute, second);
    }

    const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (slash) {
        const [, day, month, year, hour = '0', minute = '0', second = '0'] = slash;
        return buildDate(year, month, day, hour, minute, second);
    }

    const native = new Date(text);
    return Number.isNaN(native.getTime()) ? null : native;
}

function buildDate(year, month, day, hour, minute, second) {
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calculateWorkingDays(startDate, endDate) {
    const start = toDateOnly(startDate);
    const end = toDateOnly(endDate);
    if (end < start) return 0;

    let count = 0;
    const current = new Date(start);
    while (current <= end) {
        if (isWorkingDay(current)) count++;
        current.setDate(current.getDate() + 1);
    }
    return count;
}

function isWorkingDay(date) {
    const day = date.getDay();
    return day !== 0 && day !== 6 && !HOLIDAY_DATES_2026.has(toIsoDate(date));
}

function getWorkingDaysIn2026() {
    const dates = [];
    const current = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 31);
    while (current <= end) {
        if (isWorkingDay(current)) dates.push(toIsoDate(current));
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

function getDateRange(activeRows) {
    const dates = activeRows.map(row => row.appliedDate).filter(Boolean).sort((a, b) => a - b);
    return { first: dates[0] || null, last: dates[dates.length - 1] || null };
}

function toDateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatShortDate(date) {
    if (!date) return '-';
    return date.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ms-MY', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kuala_Lumpur'
    });
}

function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
}

function getPerformanceBadgeClass(percent) {
    if (percent >= 80) return 'performance-badge good';
    if (percent >= 50) return 'performance-badge warn';
    return 'performance-badge risk';
}

function toProperCaps(value) {
    const smallWords = new Set(['dan', 'di', 'ke', 'dalam', 'serta', 'atau']);
    return String(value || '')
        .toLocaleLowerCase('ms-MY')
        .split(/\s+/)
        .map((word, index) => {
            if (index > 0 && smallWords.has(word)) return word;
            return word.split(/([-/()])/).map(part => /^[a-z]/i.test(part)
                ? part.charAt(0).toLocaleUpperCase('ms-MY') + part.slice(1)
                : part).join('');
        })
        .join(' ');
}

function titleCase(value) {
    return String(value || '').replace(/\b\w/g, char => char.toUpperCase());
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function showError(message) {
    const element = document.getElementById('errorMessage');
    element.hidden = false;
    element.textContent = message;
}

function clearError() {
    const element = document.getElementById('errorMessage');
    element.hidden = true;
    element.textContent = '';
}
