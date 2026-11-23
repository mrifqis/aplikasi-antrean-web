<?php
declare(strict_types=1);
$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) { http_response_code(500); exit('Konfigurasi belum tersedia. Salin config.example.php menjadi config.php.'); }
$config = require $configFile;
date_default_timezone_set($config['timezone'] ?? 'Asia/Makassar');
function db(): PDO {
    static $pdo = null; global $config;
    if ($pdo instanceof PDO) return $pdo;
    $d=$config['db']; $dsn=sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s',$d['host'],$d['port']??3306,$d['database'],$d['charset']??'utf8mb4');
    $pdo=new PDO($dsn,$d['username'],$d['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
    return $pdo;
}
function json_response(array $data,int $status=200): never { http_response_code($status);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit; }
function current_user(): ?array { return $_SESSION['user']??null; }
function require_user(): array { $u=current_user();if(!$u)json_response(['error'=>'Silakan masuk terlebih dahulu.'],401);return $u; }
function require_admin(): array { $u=require_user();if($u['role']!=='admin')json_response(['error'=>'Akses khusus administrator.'],403);return $u; }
function csrf_check(): void { $sent=$_SERVER['HTTP_X_CSRF_TOKEN']??($_POST['csrf']??'');if(!$sent||!hash_equals($_SESSION['csrf']??'',(string)$sent))json_response(['error'=>'Sesi keamanan tidak valid. Muat ulang halaman.'],419); }
function input_json(): array { $data=json_decode(file_get_contents('php://input'),true);return is_array($data)?$data:$_POST; }
function office_by_slug(string $slug): ?array { $q=db()->prepare('SELECT id,name,slug FROM offices WHERE slug=? AND active=1');$q->execute([$slug]);return $q->fetch()?:null; }
