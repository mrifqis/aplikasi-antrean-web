<?php
// Salin menjadi config.php. Jangan commit config.php ke repositori.
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'queue_app',
        'username' => 'queue_app',
        'password' => 'ganti-dengan-password-kuat',
        'charset' => 'utf8mb4',
    ],
    // Alamat publik aplikasi tanpa garis miring di akhir.
    'app_url' => 'https://queue.example.com',
    'timezone' => 'Asia/Makassar',
];

