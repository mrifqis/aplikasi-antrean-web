# Kebijakan keamanan

## Melaporkan kerentanan

Jangan menuliskan kredensial, data tiket produksi, alamat internal, atau detail eksploitasi pada issue publik. Laporkan kerentanan melalui **GitHub Security Advisory** pada repositori ini agar dapat ditinjau secara privat.

Sertakan versi/commit, langkah reproduksi minimal, dampak, dan saran mitigasi bila tersedia.

## Hardening produksi

- Gunakan HTTPS dan aktifkan pembaruan keamanan sistem operasi.
- Pakai pengguna database khusus dengan hak hanya pada database aplikasi.
- Simpan `config.php` di luar version control dengan izin baca terbatas untuk PHP-FPM.
- Hapus atau blokir `install.php` setelah instalasi.
- Jangan membuka port MariaDB/MySQL ke internet.
- Gunakan password administrator yang unik dan kuat.
- Lakukan backup terenkripsi dan uji pemulihannya secara berkala.
- Tinjau log web server serta batasi percobaan login di reverse proxy bila aplikasi dipublikasikan.

Versi yang didukung adalah commit terbaru pada branch `main`.

