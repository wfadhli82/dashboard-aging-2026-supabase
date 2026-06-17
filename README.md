# Dashboard Aging Kelulusan 2026 Supabase

Versi ini menggunakan Supabase Auth dan table agregat Supabase. UI kekal dua tab:

1. Dashboard Kelulusan 5 Hari
2. Jadual Prestasi Keseluruhan

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

## Aliran Data

- Pengguna login melalui Supabase magic link.
- Browser baca run terkini daripada `dashboard_aging_runs`.
- Browser baca agregat daripada `dashboard_aging_aggregates`.
- Paparan akan tunjuk teks `Dikemaskini pada ...`.
- CSV upload lokal kekal sebagai fallback sahaja.

## Keselamatan Data

- Supabase hanya menyimpan agregat bulanan ikut skim dan jenis permohonan.
- Tiada nama, No KP, telefon, alamat, reference number, atau rekod individu.
- RLS mesti aktif untuk semua table.
- Automation service role key hanya disimpan dalam `.env` lokal di `automation-supabase`.
