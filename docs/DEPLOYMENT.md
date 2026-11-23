# Deployment produksi

Panduan ini memakai contoh Ubuntu, Nginx, PHP-FPM, dan MariaDB. Sesuaikan nama domain, versi socket PHP, jalur aplikasi, dan kebijakan server Anda.

## 1. Buat database

Masuk ke MariaDB sebagai administrator, lalu gunakan password acak yang kuat:

```sql
CREATE DATABASE queue_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'queue_app'@'localhost'
  IDENTIFIED BY 'GANTI_DENGAN_PASSWORD_ACAK_YANG_KUAT';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON queue_app.* TO 'queue_app'@'localhost';

FLUSH PRIVILEGES;
```

Jangan membuka port database ke internet. Aplikasi dan database pada mesin yang sama dapat memakai `127.0.0.1`.

## 2. Tempatkan kode

```bash
sudo install -d -o root -g www-data -m 0750 /var/www/queue-app
sudo cp -a . /var/www/queue-app/
sudo chown -R root:www-data /var/www/queue-app
sudo find /var/www/queue-app -type d -exec chmod 750 {} \;
sudo find /var/www/queue-app -type f -exec chmod 640 {} \;
```

Jangan menyalin direktori `.git` ke document root bila server tidak memerlukannya.

## 3. Buat konfigurasi

```bash
sudo cp /var/www/queue-app/config.example.php /var/www/queue-app/config.php
sudo editor /var/www/queue-app/config.php
sudo chown root:www-data /var/www/queue-app/config.php
sudo chmod 640 /var/www/queue-app/config.php
```

Isi database, username, password, zona waktu, dan `app_url` publik. Jangan menambahkan `config.php` ke Git.

## 4. Konfigurasi Nginx

Salin `deploy/nginx-example.conf`, ubah `server_name`, document root, dan socket PHP-FPM:

```bash
sudo cp deploy/nginx-example.conf /etc/nginx/sites-available/queue-app
sudo editor /etc/nginx/sites-available/queue-app
sudo ln -s /etc/nginx/sites-available/queue-app /etc/nginx/sites-enabled/queue-app
sudo nginx -t
sudo systemctl reload nginx
```

Jika `nginx -t` gagal, jangan reload. Perbaiki pesan kesalahan terlebih dahulu. Pastikan tidak ada dua blok `location /` dalam server block yang sama.

## 5. Instalasi awal

1. Buka `http://domain-anda/install.php`.
2. Isi nama kantor, slug, administrator, dan password minimal 10 karakter.
3. Masuk ke panel operator dan buat layanan, loket, serta akun petugas.
4. Hapus installer:

```bash
sudo rm /var/www/queue-app/install.php
```

Penghapusan installer hanya dilakukan setelah instalasi berhasil dan backup kode tersedia dari Git.

## 6. Aktifkan HTTPS

Gunakan penyedia sertifikat yang sesuai. Contoh dengan Certbot:

```bash
sudo certbot --nginx -d queue.example.com
sudo nginx -t
sudo systemctl reload nginx
```

Setelah HTTPS aktif, pastikan `app_url` menggunakan `https://` agar QR tiket menghasilkan tautan yang benar.

## 7. Verifikasi

```bash
curl -I https://queue.example.com
curl -I https://queue.example.com/config.php
```

Halaman utama seharusnya merespons `200`. Permintaan ke `config.php` harus ditolak (`403` atau `404`). Uji juga penerbitan tiket, QR, suara layar, login, panggil berikutnya, belum hadir, hadir kembali, dan penyelesaian tiket.

## 8. Backup dan pembaruan

Backup minimal mencakup database dan `config.php`. Simpan backup di lokasi terenkripsi yang tidak berada di document root.

Sebelum memperbarui:

1. Backup database dan konfigurasi.
2. Tinjau perubahan skema dan catatan rilis.
3. Perbarui file aplikasi tanpa menimpa `config.php`.
4. Pulihkan owner/permission, jalankan `nginx -t`, lalu uji alur utama.

