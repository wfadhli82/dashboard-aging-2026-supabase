const HEADER_ALIASES = {
    appliedAt: ['Tarikh Mohon'],
    approvedAt: ['Tarikh Kelulusan'],
    scheme: ['Schemes â†’ Name', 'Schemes -> Name', 'Schemes → Name'],
    applicationType: ['Application Type'],
    subBranch: ['Sub Branches → Name', 'Sub Branches -> Name'],
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
const applicationTypeOrder = ['new', 'renewal', 'appeal', 'addrate'];
const applicationTypeColors = {
    new: '#0f6bce',
    renewal: '#00a88f',
    appeal: '#d72657',
    addrate: '#f4b400',
    other: '#64748b'
};

let headerMap = {};
let rows = [];
let filteredRows = [];
let approvedFilteredRows = [];
let schemeOptions = [];
let tableSchemeOptions = [];
let branchOptions = [];
let tableBranchOptions = [];
let selectedSchemes = [];
let selectedTableSchemes = [];
let selectedBranches = [];
let selectedTableBranches = [];
let selectedTypes = [];
let selectedTableTypes = [];
let typeOptions = [];
let tableTypeOptions = [];
let officialBranchOptions = [];
let officialSchemeOptions = [];
let officialTypeOptions = [];
let applicationRows = [];
let applicationBranchOptions = [];
let applicationSchemeOptions = [];
let applicationTypeOptions = [];
let selectedOfficialBranches = [];
let selectedOfficialSchemes = [];
let selectedOfficialTypes = [];
let selectedApplicationBranches = [];
let selectedApplicationSchemes = [];
let selectedApplicationTypes = [];
let metricMode = 'count';
let officialMetricMode = 'count';
let currentSummaryRows = [];
let dataRange = { first: null, last: null };
let dailyZoom = { start: 0, end: 0 };
let dailyLabels = [];
let supabaseClient = null;
let latestRun = null;
let officialSchemes = [];
let mappingsBySystemScheme = new Map();

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
    document.getElementById('drawerToggle').addEventListener('click', toggleDashboardDrawer);

    getMultiSelectConfigs().forEach(setupMultiSelectEvents);
    document.addEventListener('click', () => {
        closeMultiSelectMenus();
        closeProfileMenu();
        closeDashboardDrawer();
    });

    document.querySelectorAll('input[name="metricMode"]').forEach(input => {
        input.addEventListener('change', event => {
            metricMode = event.target.value;
            updateTrendChart(approvedFilteredRows);
        });
    });
    document.querySelectorAll('input[name="officialMetricMode"]').forEach(input => {
        input.addEventListener('change', event => {
            officialMetricMode = event.target.value;
            updateOfficialDashboard();
        });
    });

    document.getElementById('dailyStartRange').addEventListener('input', updateDailyZoomFromInputs);
    document.getElementById('dailyEndRange').addEventListener('input', updateDailyZoomFromInputs);
    document.getElementById('dailyZoomResetBtn').addEventListener('click', resetDailyZoom);
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
    const [aggregateResult, dailyAggregateResult, officialResult, mappingResult] = await Promise.all([
        fetchAllAggregates(latestRun.run_id),
        fetchAllDailyApplicationAggregates(latestRun.run_id),
        supabaseClient
            .from('dashboard_official_schemes')
            .select('name,cluster,display_order')
            .order('display_order'),
        supabaseClient
            .from('dashboard_scheme_mappings')
            .select('system_scheme,official_scheme,division')
    ]);
    const { data: aggregates, error: aggregateError } = aggregateResult;
    const { data: dailyAggregates, error: dailyAggregateError } = dailyAggregateResult;

    if (aggregateError) {
        showAuthMessage(`Agregat tidak dapat dibaca: ${aggregateError.message}`, true);
        return;
    }
    if (officialResult.error || mappingResult.error) {
        showAuthMessage(`Mapping skim tidak dapat dibaca: ${(officialResult.error || mappingResult.error).message}`, true);
        return;
    }

    officialSchemes = officialResult.data || [];
    mappingsBySystemScheme = new Map((mappingResult.data || []).map(item => [item.system_scheme, item]));

    rows = applySchemeMappings(expandAggregateRows(aggregates || []));
    applicationRows = applySchemeMappingsToApplicationRows(normalizeDailyApplicationRows(dailyAggregates || []));
    if (!rows.length) {
        showAuthMessage('Agregat Supabase kosong untuk run terkini.', true);
        return;
    }

    dataRange = {
        first: parseAppDate(latestRun.data_start_date) || getDateRange(rows).first,
        last: parseAppDate(latestRun.data_end_date) || getDateRange(rows).last
    };
    setupFilters();
    setupOfficialFilters();
    setupApplicationFilters();
    updateDashboard();
    updateSummaryTable();
    updateOfficialDashboard();
    updateApplicationDashboard();

    document.getElementById('fileStatus').textContent = `Data Supabase dimuatkan (${Number(latestRun.source_record_count || rows.length).toLocaleString('ms-MY')} rekod sumber).`;
    document.getElementById('dateRangeText').textContent = `Data permohonan: ${formatShortDate(dataRange.first)} hingga ${formatShortDate(dataRange.last)}. Dikemaskini pada ${formatDateTime(latestRun.generated_at)}.`;
    document.getElementById('dashboard').hidden = false;
    showAuthMessage(dailyAggregateError
        ? `Data Supabase berjaya dimuatkan. Nota: agregat harian belum tersedia (${dailyAggregateError.message}).`
        : 'Data Supabase berjaya dimuatkan.', false);
}

async function fetchAllAggregates(runId) {
    const pageSize = 1000;
    const data = [];

    for (let start = 0; ; start += pageSize) {
        const { data: page, error } = await supabaseClient
            .from('dashboard_aging_aggregates')
            .select('year,month,branch,scheme,application_type,total_applications,approved_count,pending_count,approved_5_days_count,approved_over_5_days_count')
            .eq('run_id', runId)
            .order('year')
            .order('month')
            .order('branch')
            .order('scheme')
            .range(start, start + pageSize - 1);

        if (error) return { data: null, error };
        data.push(...(page || []));
        if (!page || page.length < pageSize) return { data, error: null };
    }
}

async function fetchAllDailyApplicationAggregates(runId) {
    const pageSize = 1000;
    const data = [];

    for (let start = 0; ; start += pageSize) {
        const { data: page, error } = await supabaseClient
            .from('dashboard_application_daily_aggregates')
            .select('application_date,branch,scheme,application_type,total_applications,approved_count,pending_count')
            .eq('run_id', runId)
            .order('application_date')
            .order('branch')
            .order('scheme')
            .range(start, start + pageSize - 1);

        if (error) return { data, error };
        data.push(...(page || []));
        if (!page || page.length < pageSize) return { data, error: null };
    }
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
            branch: item.branch || '(Tiada cawangan)',
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

function applySchemeMappings(sourceRows) {
    return sourceRows.map(row => {
        const mapping = mappingsBySystemScheme.get(row.scheme);
        if (!mapping) return null;
        const official = officialSchemes.find(item => item.name === mapping.official_scheme);
        if (!official) return null;
        return {
            ...row,
            officialScheme: official.name,
            cluster: official.cluster
        };
    }).filter(Boolean);
}

function normalizeDailyApplicationRows(aggregates) {
    return aggregates.map(item => {
        const appliedDate = parseAppDate(item.application_date);
        if (!appliedDate) return null;

        const applicationType = item.application_type || 'lain-lain';
        const applicationTypeLabel = typeLabels[applicationType] || titleCase(applicationType);
        return {
            appliedDate,
            dateKey: toIsoDate(appliedDate),
            branch: item.branch || '(Tiada cawangan)',
            scheme: item.scheme || '(Tiada skim)',
            applicationType,
            applicationTypeLabel,
            totalApplications: Number(item.total_applications || 0),
            approvedCount: Number(item.approved_count || 0),
            pendingCount: Number(item.pending_count || 0)
        };
    }).filter(Boolean);
}

function applySchemeMappingsToApplicationRows(sourceRows) {
    return sourceRows.map(row => {
        const mapping = mappingsBySystemScheme.get(row.scheme);
        if (!mapping) return null;
        const official = officialSchemes.find(item => item.name === mapping.official_scheme);
        if (!official) return null;
        return {
            ...row,
            officialScheme: official.name,
            cluster: official.cluster
        };
    }).filter(Boolean);
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
    document.getElementById('loginView').hidden = isLoggedIn;
    document.getElementById('appContent').hidden = !isLoggedIn;
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginBtn').textContent = 'Log Masuk';
    document.getElementById('profileEmail').textContent = email || '-';
    document.getElementById('profileInitial').textContent = email ? email.charAt(0).toUpperCase() : '?';
    uploadCard.hidden = true;
    uploadCard.style.display = 'none';
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
            rows = applySchemeMappings(normalizeRows(parsed.records));
            if (!rows.length) throw new Error('Tiada rekod tarikh permohonan yang sah dijumpai.');

            dataRange = getDateRange(rows);
            setupFilters();
            setupOfficialFilters();
            updateDashboard();
            updateSummaryTable();
            updateOfficialDashboard();

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
    if (!map.subBranch) {
        map.subBranch = headers.find(header => /^sub\s+branches\b.*name$/i.test(normalizeHeader(header)));
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
            branch: headerMap.subBranch
                ? (record[headerMap.subBranch] || '(Tiada cawangan)')
                : (headerMap.branch ? (record[headerMap.branch] || '(Tiada cawangan)') : '(Tiada cawangan)'),
            applicationType: type,
            applicationTypeLabel: typeLabels[type] || titleCase(type || 'Lain-lain')
        };
    }).filter(Boolean);
}

function setupFilters() {
    branchOptions = getUniqueValues(rows.map(row => row.branch));
    tableBranchOptions = [...branchOptions];
    schemeOptions = getUniqueValues(rows.map(row => row.scheme));
    tableSchemeOptions = [...schemeOptions];
    typeOptions = getUniqueValues(rows.map(row => row.applicationTypeLabel));
    tableTypeOptions = [...typeOptions];
    selectedBranches = [...branchOptions];
    selectedTableBranches = [...tableBranchOptions];
    selectedSchemes = [...schemeOptions];
    selectedTableSchemes = [...tableSchemeOptions];
    selectedTypes = [...typeOptions];
    selectedTableTypes = [...tableTypeOptions];
}

function setupOfficialFilters() {
    officialBranchOptions = getUniqueValues(rows.map(row => row.branch));
    officialSchemeOptions = officialSchemes.map(item => item.name);
    officialTypeOptions = getUniqueValues(rows.map(row => row.applicationTypeLabel));
    selectedOfficialBranches = [...officialBranchOptions];
    selectedOfficialSchemes = [...officialSchemeOptions];
    selectedOfficialTypes = [...officialTypeOptions];
    getMultiSelectConfigs().forEach(renderMultiSelect);
}

function setupApplicationFilters() {
    applicationBranchOptions = getUniqueValues(applicationRows.map(row => row.branch));
    applicationSchemeOptions = officialSchemes.map(item => item.name).filter(name => applicationRows.some(row => row.officialScheme === name));
    applicationTypeOptions = getUniqueValues(applicationRows.map(row => row.applicationTypeLabel));
    selectedApplicationBranches = [...applicationBranchOptions];
    selectedApplicationSchemes = [...applicationSchemeOptions];
    selectedApplicationTypes = [...applicationTypeOptions];
    getMultiSelectConfigs().forEach(renderMultiSelect);
}

function getMultiSelectConfigs() {
    return [
        multiConfig('dashboardBranch', 'Semua cawangan', 'branchFilter', updateDashboard),
        multiConfig('dashboardScheme', 'Semua skim', 'schemeFilter', updateDashboard),
        multiConfig('dashboardType', 'Semua jenis', 'typeFilter', updateDashboard),
        multiConfig('tableBranch', 'Semua cawangan', 'tableBranchFilter', updateSummaryTable),
        multiConfig('tableScheme', 'Semua skim', 'tableSchemeFilter', updateSummaryTable),
        multiConfig('tableType', 'Semua jenis', 'tableTypeFilter', updateSummaryTable),
        multiConfig('applicationBranch', 'Semua cawangan', 'applicationBranchFilter', updateApplicationDashboard),
        multiConfig('applicationScheme', 'Semua skim rasmi', 'applicationSchemeFilter', updateApplicationDashboard, true),
        multiConfig('applicationType', 'Semua jenis', 'applicationTypeFilter', updateApplicationDashboard),
        multiConfig('officialBranch', 'Semua cawangan', 'officialBranchFilter', updateOfficialDashboard),
        multiConfig('officialScheme', 'Semua skim rasmi', 'officialSchemeFilter', updateOfficialDashboard, true),
        multiConfig('officialType', 'Semua jenis', 'officialTypeFilter', updateOfficialDashboard)
    ];
}

function multiConfig(selectedKey, allLabel, prefix, onChange, preserveCase = false) {
    return {
        allLabel,
        clearButtonId: `${prefix}ClearBtn`,
        menuId: `${prefix}Menu`,
        onChange,
        options: getMultiSelectOptions(selectedKey),
        optionsId: `${prefix}Options`,
        emptyLabel: allLabel.includes('cawangan')
            ? 'Tiada cawangan dipilih'
            : (allLabel.includes('jenis') ? 'Tiada jenis dipilih' : 'Tiada skim dipilih'),
        preserveCase,
        selectAllButtonId: `${prefix}SelectAllBtn`,
        selected: getMultiSelectSelection(selectedKey),
        selectedKey,
        toggleId: `${prefix}Toggle`
    };
}

function updateDashboard() {
    filteredRows = rows.filter(row => {
        const branchMatch = selectedBranches.includes(row.branch);
        const schemeMatch = selectedSchemes.includes(row.scheme);
        const typeMatch = selectedTypes.includes(row.applicationTypeLabel);
        return branchMatch && schemeMatch && typeMatch;
    });
    approvedFilteredRows = filteredRows.filter(row => row.isApproved);

    updateKpis(filteredRows, approvedFilteredRows);
    updateTrendChart(approvedFilteredRows);
    updateRankingTable(approvedFilteredRows);
}

function updateOfficialDashboard() {
    if (!rows.length) return;
    const activeRows = rows.filter(row => {
        return selectedOfficialBranches.includes(row.branch)
            && selectedOfficialSchemes.includes(row.officialScheme)
            && selectedOfficialTypes.includes(row.applicationTypeLabel);
    });
    const approvedRows = activeRows.filter(row => row.isApproved);
    updateOfficialKpis(activeRows, approvedRows);
    updateTrendChart(approvedRows, 'officialTrendChart', officialMetricMode);
    updateRankingTable(approvedRows, 'officialRankingTableBody', 'officialScheme');
}

function updateApplicationDashboard() {
    const activeRows = applicationRows.filter(row => {
        return selectedApplicationBranches.includes(row.branch)
            && selectedApplicationSchemes.includes(row.officialScheme)
            && selectedApplicationTypes.includes(row.applicationTypeLabel);
    });

    const range = getApplicationAggregateRange(activeRows);
    document.getElementById('applicationDateRange').textContent = range.first && range.last
        ? `Data permohonan: ${formatShortDate(range.first)} hingga ${formatShortDate(range.last)}`
        : 'Data agregat harian belum tersedia.';

    updateApplicationKpis(activeRows, range);
    updateApplicationCharts(activeRows);
    updateApplicationLeaderboards(activeRows);
}

function updateApplicationKpis(activeRows, range) {
    const totals = getApplicationTypeTotals(activeRows);
    const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
    const workingDays = range.first && range.last
        ? getWorkingDaysIn2026().filter(date => date >= toIsoDate(range.first) && date <= toIsoDate(range.last)).length
        : 0;

    document.getElementById('applicationTotal').textContent = total.toLocaleString('ms-MY');
    document.getElementById('applicationNewTotal').textContent = (totals.new || 0).toLocaleString('ms-MY');
    document.getElementById('applicationRenewalTotal').textContent = (totals.renewal || 0).toLocaleString('ms-MY');
    document.getElementById('applicationAppealTotal').textContent = (totals.appeal || 0).toLocaleString('ms-MY');
    document.getElementById('applicationAddrateTotal').textContent = (totals.addrate || 0).toLocaleString('ms-MY');
    document.getElementById('applicationWorkingAverage').textContent = workingDays ? (total / workingDays).toFixed(1) : '0';
}

function getApplicationTypeTotals(activeRows) {
    return activeRows.reduce((totals, row) => {
        totals[row.applicationType] = (totals[row.applicationType] || 0) + row.totalApplications;
        return totals;
    }, {});
}

function updateApplicationCharts(activeRows) {
    const daily = buildDailyApplicationSeries(activeRows);
    dailyLabels = daily.keys;
    syncDailyZoomInputs(dailyLabels.length);

    const start = Math.min(dailyZoom.start, Math.max(dailyLabels.length - 1, 0));
    const end = Math.min(Math.max(dailyZoom.end, start), Math.max(dailyLabels.length - 1, 0));
    dailyZoom = { start, end };
    const slicedDaily = {
        labels: daily.labels.slice(start, end + 1),
        keys: daily.keys.slice(start, end + 1),
        series: daily.series.map(item => ({ ...item, data: item.data.slice(start, end + 1) }))
    };

    document.getElementById('dailyZoomLabel').textContent = slicedDaily.keys.length
        ? `${formatDateFromIso(slicedDaily.keys[0])} hingga ${formatDateFromIso(slicedDaily.keys[slicedDaily.keys.length - 1])}`
        : 'Tiada data';

    renderMultiSeriesLineChart('applicationDailyChart', slicedDaily.labels, slicedDaily.series, {
        labelEvery: getDailyLabelStep(slicedDaily.labels.length),
        large: true,
        valueLabels: 'peak'
    });

    const weekly = buildGroupedApplicationSeries(activeRows, getWeekKey, formatWeekLabel);
    renderMultiSeriesLineChart('applicationWeeklyChart', weekly.labels, weekly.series, {
        labelEvery: getGroupedLabelStep(weekly.labels.length),
        valueLabels: 'peak'
    });

    const monthly = buildGroupedApplicationSeries(activeRows, row => `${row.appliedDate.getFullYear()}-${String(row.appliedDate.getMonth() + 1).padStart(2, '0')}`, key => {
        const month = Number(key.split('-')[1]);
        return monthLabels[month - 1];
    });
    renderMultiSeriesLineChart('applicationMonthlyChart', monthly.labels, monthly.series, {
        valueLabels: 'all'
    });
}

function updateApplicationLeaderboards(activeRows) {
    renderLeaderboard('applicationTopSchemes', getTopAggregateCounts(activeRows, row => row.officialScheme, 5));
    renderLeaderboard('applicationTopDays', getTopAggregateCounts(activeRows, row => row.dateKey, 5).map(item => ({ ...item, label: formatDateFromIso(item.label) })));
    renderLeaderboard('applicationTopWeeks', getTopAggregateCounts(activeRows, getWeekKey, 5).map(item => ({ ...item, label: formatWeekLabel(item.label) })));
}

function buildDailyApplicationSeries(activeRows) {
    const range = getApplicationAggregateRange(activeRows);
    if (!range.first || !range.last) {
        return { keys: [], labels: [], series: getApplicationSeriesMeta(activeRows).map(item => ({ ...item, data: [] })) };
    }

    const keys = [];
    const current = toDateOnly(range.first);
    const end = toDateOnly(range.last);
    while (current <= end) {
        keys.push(toIsoDate(current));
        current.setDate(current.getDate() + 1);
    }

    const grouped = groupApplicationAggregates(activeRows, row => row.dateKey);
    return {
        keys,
        labels: keys.map(key => {
            const [, month, day] = key.split('-');
            return `${Number(day)}/${Number(month)}`;
        }),
        series: getApplicationSeriesMeta(activeRows).map(item => ({
            ...item,
            data: keys.map(key => grouped.get(key)?.get(item.type) || 0)
        }))
    };
}

function buildGroupedApplicationSeries(activeRows, keyGetter, labelFormatter) {
    const keys = [...new Set(activeRows.map(keyGetter))].sort();
    const grouped = groupApplicationAggregates(activeRows, keyGetter);
    return {
        labels: keys.map(labelFormatter),
        series: getApplicationSeriesMeta(activeRows).map(item => ({
            ...item,
            data: keys.map(key => grouped.get(key)?.get(item.type) || 0)
        }))
    };
}

function groupApplicationAggregates(activeRows, keyGetter) {
    const grouped = new Map();
    activeRows.forEach(row => {
        const key = keyGetter(row);
        if (!grouped.has(key)) grouped.set(key, new Map());
        const typeMap = grouped.get(key);
        typeMap.set(row.applicationType, (typeMap.get(row.applicationType) || 0) + row.totalApplications);
    });
    return grouped;
}

function getApplicationSeriesMeta(activeRows) {
    const types = applicationTypeOrder.filter(type => activeRows.some(row => row.applicationType === type));
    const extras = getUniqueValues(activeRows.map(row => row.applicationType)).filter(type => !types.includes(type));
    return [...types, ...extras].map(type => ({
        type,
        label: typeLabels[type] || titleCase(type),
        color: applicationTypeColors[type] || applicationTypeColors.other
    }));
}

function getApplicationAggregateRange(activeRows) {
    const dates = activeRows.map(row => row.appliedDate).sort((a, b) => a - b);
    return { first: dates[0] || null, last: dates[dates.length - 1] || null };
}

function getTopAggregateCounts(activeRows, getter, limit) {
    const counts = new Map();
    activeRows.forEach(row => {
        const label = getter(row);
        counts.set(label, (counts.get(label) || 0) + row.totalApplications);
    });
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .slice(0, limit)
        .map(([label, count]) => ({ label, count }));
}

function renderLeaderboard(id, items) {
    const element = document.getElementById(id);
    if (!items.length) {
        element.innerHTML = '<li><span>Tiada data</span><strong>0</strong></li>';
        return;
    }
    element.innerHTML = items.map(item => `
        <li>
            <span>${escapeHtml(item.label)}</span>
            <strong>${item.count.toLocaleString('ms-MY')}</strong>
        </li>
    `).join('');
}

function syncDailyZoomInputs(length) {
    const startInput = document.getElementById('dailyStartRange');
    const endInput = document.getElementById('dailyEndRange');
    const max = Math.max(length - 1, 0);
    if (dailyZoom.end > max || dailyZoom.start > max || dailyZoom.end === 0) {
        dailyZoom = { start: 0, end: max };
    }
    [startInput, endInput].forEach(input => {
        input.max = String(max);
        input.disabled = length <= 1;
    });
    startInput.value = String(dailyZoom.start);
    endInput.value = String(dailyZoom.end);
}

function updateDailyZoomFromInputs() {
    const startInput = document.getElementById('dailyStartRange');
    const endInput = document.getElementById('dailyEndRange');
    let start = Number(startInput.value);
    let end = Number(endInput.value);
    if (start > end) {
        if (document.activeElement === startInput) end = start;
        else start = end;
    }
    dailyZoom = { start, end };
    startInput.value = String(start);
    endInput.value = String(end);
    updateApplicationDashboard();
}

function resetDailyZoom() {
    dailyZoom = { start: 0, end: Math.max(dailyLabels.length - 1, 0) };
    updateApplicationDashboard();
}

function getDailyLabelStep(count) {
    const mobile = window.innerWidth < 820;
    if (count <= (mobile ? 8 : 14)) return 1;
    if (count <= (mobile ? 30 : 45)) return mobile ? 5 : 3;
    if (count <= (mobile ? 75 : 90)) return mobile ? 10 : 7;
    return mobile ? 21 : 14;
}

function getGroupedLabelStep(count) {
    const mobile = window.innerWidth < 820;
    const target = mobile ? 5 : 8;
    return Math.max(1, Math.ceil(count / target));
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

function updateOfficialKpis(activeRows, approvedRows) {
    const total = activeRows.length;
    const approved = approvedRows.length;
    const onTime = approvedRows.filter(row => row.aging <= 5).length;
    const late = approved - onTime;
    document.getElementById('officialTotalApplications').textContent = total.toLocaleString('ms-MY');
    document.getElementById('officialApprovedApplications').textContent = approved.toLocaleString('ms-MY');
    document.getElementById('officialPendingApplications').textContent = (total - approved).toLocaleString('ms-MY');
    document.getElementById('officialOnTimeApplications').textContent = onTime.toLocaleString('ms-MY');
    document.getElementById('officialLateApplications').textContent = late.toLocaleString('ms-MY');
    document.getElementById('officialOnTimePercent').textContent = approved ? `${((onTime / approved) * 100).toFixed(1)}%` : '0%';
}

function updateTrendChart(approvedRows, canvasId = 'trendChart', mode = metricMode) {
    const denominator = Array(12).fill(0);
    const numerator = Array(12).fill(0);

    approvedRows.forEach(row => {
        const month = row.appliedDate.getMonth();
        denominator[month]++;
        if (row.aging <= 5) numerator[month]++;
    });

    const data = mode === 'percent'
        ? numerator.map((value, index) => denominator[index] ? (value / denominator[index]) * 100 : 0)
        : numerator;

    renderLineChart(canvasId, monthLabels, data, mode === 'percent');
}

function updateRankingTable(approvedRows, bodyId = 'rankingTableBody', schemeKey = 'scheme') {
    const grouped = new Map();
    approvedRows.forEach(row => {
        const scheme = row[schemeKey];
        if (!grouped.has(scheme)) {
            grouped.set(scheme, { scheme, approved: 0, onTime: 0 });
        }
        const item = grouped.get(scheme);
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

    const tbody = document.getElementById(bodyId);
    if (!rankingRows.length) {
        tbody.innerHTML = '<tr><td class="empty-state" colspan="4">Tiada kelulusan untuk filter ini.</td></tr>';
        return;
    }

    tbody.innerHTML = rankingRows.map((row, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(schemeKey === 'officialScheme' ? row.scheme : toProperCaps(row.scheme))}</td>
            <td><span class="${getPerformanceBadgeClass(row.percent)}">${formatPercent(row.percent)}</span></td>
            <td>${row.approved.toLocaleString('ms-MY')}</td>
        </tr>
    `).join('');
}

function updateSummaryTable() {
    if (!rows.length) return;

    const approvedRows = rows.filter(row => {
        const branchMatch = selectedTableBranches.includes(row.branch);
        const schemeMatch = selectedTableSchemes.includes(row.scheme);
        const typeMatch = selectedTableTypes.includes(row.applicationTypeLabel);
        return row.isApproved && branchMatch && schemeMatch && typeMatch;
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
            ctx.fillText(isPercent ? `${point.value.toFixed(1)}%` : formatChartValue(point.value), point.x, Math.max(chart.top, point.y - 22));
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
        ctx.fillText(isPercent ? `${value}%` : formatChartValue(value), chart.left - 8, y);
    }

    if (!data.some(value => value > 0)) {
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.font = '800 14px Segoe UI, Arial';
        ctx.fillText('Tiada data untuk filter ini', chart.left + chart.width / 2, chart.top + chart.height / 2);
    }
}

function renderMultiSeriesLineChart(canvasId, labels, series, options = {}) {
    const canvas = document.getElementById(canvasId);
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(460, Math.floor(rect.width || canvas.parentElement.clientWidth || 640));
    const height = options.large ? (window.innerWidth < 820 ? 340 : 410) : (window.innerWidth < 820 ? 280 : 310);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const chart = { left: 48, top: 44, right: width - 14, bottom: height - 52 };
    chart.width = chart.right - chart.left;
    chart.height = chart.bottom - chart.top;
    const values = series.flatMap(item => item.data);
    const scale = getNiceYAxisScale(Math.max(...values, 0));
    const step = chart.width / Math.max(labels.length - 1, 1);
    const labelEvery = options.labelEvery || 1;
    const valueLabels = options.valueLabels || 'peak';

    ctx.strokeStyle = '#d7e1ea';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chart.left, chart.top);
    ctx.lineTo(chart.left, chart.bottom);
    ctx.lineTo(chart.right, chart.bottom);
    ctx.stroke();

    drawMultiSeriesLegend(ctx, chart, series);

    series.forEach((item, seriesIndex) => {
        const points = item.data.map((value, index) => ({
            x: chart.left + index * step,
            y: chart.bottom - (value / scale.axisMax) * chart.height,
            value
        }));
        if (!points.length) return;

        ctx.beginPath();
        points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 3;
        ctx.stroke();

        points.forEach(point => {
            if (point.value <= 0) return;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = item.color;
            ctx.fill();
        });

        drawPointValueLabels(ctx, chart, points, valueLabels, seriesIndex);
    });

    ctx.font = '11px Segoe UI, Arial';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    labels.forEach((label, index) => {
        if (index % labelEvery === 0 || index === labels.length - 1) {
            ctx.fillText(label, chart.left + index * step, chart.bottom + 12);
        }
    });

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    scale.ticks.forEach(value => {
        const y = chart.bottom - (value / scale.axisMax) * chart.height;
        ctx.fillText(formatChartValue(value), chart.left - 8, y);
    });

    if (!values.some(value => value > 0)) {
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.font = '800 14px Segoe UI, Arial';
        ctx.fillText('Tiada data untuk filter ini', chart.left + chart.width / 2, chart.top + chart.height / 2);
    }
}

function drawPointValueLabels(ctx, chart, points, mode, seriesIndex) {
    if (mode === 'none') return;
    const candidates = mode === 'all'
        ? points.filter(point => point.value > 0)
        : [points.reduce((best, point) => point.value > best.value ? point : best, points[0])].filter(point => point?.value > 0);

    ctx.fillStyle = '#142334';
    ctx.font = '800 11px Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    candidates.forEach((point, index) => {
        const offset = mode === 'all' ? 16 + ((seriesIndex + index) % 2) * 10 : 18;
        ctx.fillText(formatChartValue(point.value), point.x, Math.max(chart.top + 2, point.y - offset));
    });
}

function getNiceYAxisScale(maxValue) {
    const targetTicks = 6;
    const value = Math.max(0, Number(maxValue || 0));
    if (!value) {
        return { axisMax: 1, tickStep: 1, ticks: [0, 1] };
    }

    const rawStep = value / Math.max(targetTicks - 1, 1);
    const tickStep = getNiceTickStep(rawStep);
    const axisMax = Math.max(tickStep, Math.ceil(value / tickStep) * tickStep);
    const ticks = [];

    for (let tick = 0; tick <= axisMax + tickStep * 0.5; tick += tickStep) {
        ticks.push(Math.round(tick));
    }

    return { axisMax, tickStep, ticks };
}

function getNiceTickStep(rawStep) {
    const exponent = Math.floor(Math.log10(Math.max(rawStep, 1)));
    const magnitude = 10 ** exponent;
    const fraction = rawStep / magnitude;
    const niceFraction = fraction <= 1
        ? 1
        : (fraction <= 2 ? 2 : (fraction <= 5 ? 5 : 10));
    return niceFraction * magnitude;
}

function drawMultiSeriesLegend(ctx, chart, series) {
    let x = chart.left;
    const y = chart.top - 24;
    ctx.font = '800 12px Segoe UI, Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    series.forEach(item => {
        const width = ctx.measureText(item.label).width;
        if (x + width + 34 > chart.right) x = chart.left;
        ctx.fillStyle = item.color;
        ctx.fillRect(x, y - 5, 10, 10);
        ctx.fillStyle = '#334155';
        ctx.fillText(item.label, x + 16, y);
        x += width + 42;
    });
}

function switchTab(panelId) {
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.toggle('active', button.dataset.tab === panelId);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === panelId);
    });
    closeDashboardDrawer();
    if (panelId === 'fiveDayPanel') updateTrendChart(approvedFilteredRows);
    if (panelId === 'applicationPanel') updateApplicationDashboard();
}

function toggleDashboardDrawer(event) {
    event.stopPropagation();
    const tabs = document.getElementById('dashboardTabs');
    const toggle = document.getElementById('drawerToggle');
    const isOpen = tabs.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
}

function closeDashboardDrawer() {
    const tabs = document.getElementById('dashboardTabs');
    const toggle = document.getElementById('drawerToggle');
    if (!tabs || !toggle) return;
    tabs.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
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
        optionsElement.innerHTML = '<div class="empty-state">Tiada pilihan dijumpai.</div>';
        updateMultiSelectToggle(config.toggleId, config.selected, config.options, config.allLabel, config.preserveCase, config.emptyLabel);
        return;
    }

    optionsElement.innerHTML = config.options.map((option, index) => {
        const inputId = `${config.optionsId}-${index}`;
        return `
            <label for="${inputId}">
                <input type="checkbox" id="${inputId}" value="${escapeHtml(option)}" ${config.selected.includes(option) ? 'checked' : ''}>
                <span>${escapeHtml(formatMultiSelectLabel(option, config.preserveCase))}</span>
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
    updateMultiSelectToggle(config.toggleId, config.selected, config.options, config.allLabel, config.preserveCase, config.emptyLabel);
    const searchInput = getMultiSelectSearchInput(config.optionsId);
    if (searchInput) filterSelectOptions(config.optionsId, searchInput.value);
}

function refreshMultiSelect(config) {
    renderMultiSelect({
        ...config,
        options: getMultiSelectOptions(config.selectedKey),
        selected: getMultiSelectSelection(config.selectedKey)
    });
}

function getMultiSelectOptions(key) {
    const options = {
        dashboardBranch: branchOptions,
        dashboardScheme: schemeOptions,
        dashboardType: typeOptions,
        tableBranch: tableBranchOptions,
        tableScheme: tableSchemeOptions,
        tableType: tableTypeOptions,
        applicationBranch: applicationBranchOptions,
        applicationScheme: applicationSchemeOptions,
        applicationType: applicationTypeOptions,
        officialBranch: officialBranchOptions,
        officialScheme: officialSchemeOptions,
        officialType: officialTypeOptions
    };
    return options[key] || [];
}

function getMultiSelectSelection(key) {
    const selections = {
        dashboardBranch: selectedBranches,
        dashboardScheme: selectedSchemes,
        dashboardType: selectedTypes,
        tableBranch: selectedTableBranches,
        tableScheme: selectedTableSchemes,
        tableType: selectedTableTypes,
        applicationBranch: selectedApplicationBranches,
        applicationScheme: selectedApplicationSchemes,
        applicationType: selectedApplicationTypes,
        officialBranch: selectedOfficialBranches,
        officialScheme: selectedOfficialSchemes,
        officialType: selectedOfficialTypes
    };
    return selections[key] || [];
}

function setMultiSelectSelection(key, selected) {
    const values = [...selected];
    if (key === 'dashboardBranch') selectedBranches = values;
    else if (key === 'dashboardScheme') selectedSchemes = values;
    else if (key === 'dashboardType') selectedTypes = values;
    else if (key === 'tableBranch') selectedTableBranches = values;
    else if (key === 'tableScheme') selectedTableSchemes = values;
    else if (key === 'tableType') selectedTableTypes = values;
    else if (key === 'applicationBranch') selectedApplicationBranches = values;
    else if (key === 'applicationScheme') selectedApplicationSchemes = values;
    else if (key === 'applicationType') selectedApplicationTypes = values;
    else if (key === 'officialBranch') selectedOfficialBranches = values;
    else if (key === 'officialScheme') selectedOfficialSchemes = values;
    else if (key === 'officialType') selectedOfficialTypes = values;
}

function updateMultiSelectToggle(toggleId, selected, options, allLabel, preserveCase = false, emptyLabel = 'Tiada skim dipilih') {
    const toggle = document.getElementById(toggleId);
    if (!selected.length) {
        toggle.textContent = emptyLabel;
    } else if (selected.length === options.length) {
        toggle.textContent = `${allLabel} (${options.length})`;
    } else if (selected.length === 1) {
        toggle.textContent = formatMultiSelectLabel(selected[0], preserveCase);
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
        ['branchFilterMenu', 'branchFilterToggle'],
        ['schemeFilterMenu', 'schemeFilterToggle'],
        ['typeFilterMenu', 'typeFilterToggle'],
        ['tableBranchFilterMenu', 'tableBranchFilterToggle'],
        ['tableSchemeFilterMenu', 'tableSchemeFilterToggle'],
        ['tableTypeFilterMenu', 'tableTypeFilterToggle'],
        ['applicationBranchFilterMenu', 'applicationBranchFilterToggle'],
        ['applicationSchemeFilterMenu', 'applicationSchemeFilterToggle'],
        ['applicationTypeFilterMenu', 'applicationTypeFilterToggle'],
        ['officialBranchFilterMenu', 'officialBranchFilterToggle'],
        ['officialSchemeFilterMenu', 'officialSchemeFilterToggle'],
        ['officialTypeFilterMenu', 'officialTypeFilterToggle']
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
    return document.getElementById(optionsId.replace(/Options$/, 'Search'));
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

function getWeekKey(row) {
    const date = row.appliedDate ? row.appliedDate : parseIsoDate(row);
    return toIsoDate(getMonday(date));
}

function getMonday(date) {
    const result = toDateOnly(date);
    const day = result.getDay();
    result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
    return result;
}

function formatWeekLabel(key) {
    const start = parseIsoDate(key);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function parseIsoDate(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day);
}

function formatDateFromIso(value) {
    return formatShortDate(parseIsoDate(value));
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
    const acronyms = new Set(['IPT', 'MAIWP', 'KPBKL', 'PICOMS', 'NGO', 'NPO', 'OKU', 'SMA', 'PAZA', 'JAWI', 'UCMI']);
    return String(value || '')
        .toLocaleLowerCase('ms-MY')
        .split(/\s+/)
        .map((word, index) => {
            if (index > 0 && smallWords.has(word)) return word;
            return word.split(/([-/()])/).map(part => {
                const upper = part.toLocaleUpperCase('ms-MY');
                if (acronyms.has(upper)) return upper;
                return /^[a-z]/i.test(part)
                    ? part.charAt(0).toLocaleUpperCase('ms-MY') + part.slice(1)
                    : part;
            }).join('');
        })
        .join(' ');
}

function formatMultiSelectLabel(value, preserveCase = false) {
    return preserveCase ? String(value || '') : toProperCaps(value);
}

function formatChartValue(value) {
    return Number(value || 0).toLocaleString('ms-MY');
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
