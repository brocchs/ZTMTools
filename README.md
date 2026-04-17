# ZTMTools

App lokal sederhana untuk membaca respons JSON email delivery agar penyebab email gagal terkirim lebih mudah dianalisis.

## Fungsi

- Tempel JSON hasil API langsung ke dashboard
- Ringkasan total email, total recipient, bounce, gagal total, dan gagal parsial
- Kelompok penyebab gagal kirim seperti `bad-mailbox` dan `quota-issues`
- Daftar alamat email yang paling sering bermasalah
- Tabel event lengkap beserta pesan diagnostik SMTP

## Jalankan

```powershell
cd d:\foldermu
npm install
npm start
```

Buka:

```text
http://localhost:3000
```

## Cara pakai

1. Tanya diana
2. Tempel JSON ke kotak input, atau buka file `.json`
3. Klik `Analisis data`
4. Baca ringkasan penyebab gagal kirim dan daftar alamat bermasalah

## Arti penyebab umum

- `bad-mailbox`: alamat email tidak ada, typo, atau mailbox penerima sudah tidak valid
- `quota-issues`: mailbox penerima penuh atau kuota server penerima habis
