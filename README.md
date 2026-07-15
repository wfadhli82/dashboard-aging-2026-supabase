# Dashboard Aging Kelulusan 2026 Supabase

Versi ini menggunakan Supabase Auth dan table agregat Supabase. UI utama merangkumi:

1. Analisis Permohonan
2. Dashboard Kelulusan 5 Hari
3. Dashboard Skim Rasmi
4. Jadual Prestasi Keseluruhan
5. Permohonan Belum Diperaku
6. Rekod Pengunjung

## Setup Frontend

Project Supabase:

- Name: `dashboard-aging-2026`
- Project ID: `tnigzateoyrowhhneoff`
- URL: `https://tnigzateoyrowhhneoff.supabase.co`

1. Schema/RLS berada dalam `automation-supabase/schema.sql`.
2. Masukkan emel yang dibenarkan ke `dashboard_allowed_users`.
3. `supabase-config.js` telah diisi:

```js
window.DASHBOARD_SUPABASE_CONFIG = {
    url: 'https://YOUR_PROJECT_REF.supabase.co',
    anonKey: 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY'
};
```

`anonKey`/publishable key boleh berada di frontend. Jangan letak `service_role` key di sini.

## Aliran Login dan Data

- Pengguna login menggunakan emel dan kata laluan Supabase Auth.
- Emel pengguna juga mesti wujud dalam `dashboard_allowed_users`.
- Browser baca run terkini daripada `dashboard_aging_runs`.
- Browser baca agregat daripada `dashboard_aging_aggregates`.
- Tab Rekod Pengunjung baca run terkini daripada `dashboard_visitor_sync_runs`, agregat PAZA/bulan daripada `dashboard_visitor_monthly_paza_aggregates`, dan Top Staf daripada `dashboard_visitor_staff_aggregates`.
- Paparan akan tunjuk teks `Dikemaskini pada ...`.
- CSV upload lokal kekal sebagai fallback sahaja.

Untuk tambah pengguna:

1. Supabase Dashboard > Authentication > Users > Add user.
2. Tetapkan emel dan kata laluan.
3. Masukkan emel sama ke `dashboard_allowed_users`.

## Keselamatan Data

- Supabase aging menyimpan agregat bulanan ikut skim dan jenis permohonan.
- Tab Rekod Pengunjung hanya membaca aggregate PAZA/bulan, Top Staf, dan metadata sync; email/nama/No KP pengunjung mentah tidak didedahkan kepada frontend.
- RLS mesti aktif untuk semua table.
- Automation service role key hanya disimpan dalam `.env` lokal di `automation-supabase`.
