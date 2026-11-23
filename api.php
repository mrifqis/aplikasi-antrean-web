<?php
declare(strict_types=1);
if(session_status()!==PHP_SESSION_ACTIVE){$https=(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off');session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>$https,'httponly'=>true,'samesite'=>'Lax']);session_start();}
require __DIR__ . '/db.php';
$action=$_GET['action']??''; $body=input_json(); $today=date('Y-m-d');
function office_or_404(string $slug): array { $o=office_by_slug($slug);if(!$o)json_response(['error'=>'Kantor tidak ditemukan.'],404);return $o; }
function service_or_404(int $serviceId,int $officeId): array { $q=db()->prepare('SELECT id,code,name FROM services WHERE id=? AND office_id=? AND active=1');$q->execute([$serviceId,$officeId]);$s=$q->fetch();if(!$s)json_response(['error'=>'Jenis layanan tidak ditemukan.'],404);return $s; }

if($action==='login'){
    csrf_check();$username=trim((string)($body['username']??''));$password=(string)($body['password']??'');
    $q=db()->prepare('SELECT u.id,u.office_id,u.name,u.username,u.password_hash,u.role,o.name office_name,o.slug office_slug FROM users u JOIN offices o ON o.id=u.office_id WHERE u.username=? AND u.active=1 AND o.active=1');$q->execute([$username]);$u=$q->fetch();
    if(!$u||!password_verify($password,$u['password_hash']))json_response(['error'=>'Username atau kata sandi salah.'],422);
    session_regenerate_id(true);unset($u['password_hash']);$_SESSION['user']=$u;$_SESSION['csrf']=bin2hex(random_bytes(32));json_response(['ok'=>true,'user'=>$u,'csrf'=>$_SESSION['csrf']]);
}
if($action==='logout'){csrf_check();$_SESSION=[];session_destroy();json_response(['ok'=>true]);}
if($action==='offices_list'){$q=db()->query('SELECT name,slug FROM offices WHERE active=1 ORDER BY name');json_response(['offices'=>$q->fetchAll()]);}
if($action==='public_init'){
    $o=office_or_404((string)($_GET['office']??''));$q=db()->prepare('SELECT id,code,name FROM services WHERE office_id=? AND active=1 ORDER BY name');$q->execute([$o['id']]);json_response(['office'=>$o,'services'=>$q->fetchAll(),'app_url'=>$config['app_url']]);
}
if($action==='public_state'){
    $o=office_or_404((string)($_GET['office']??''));
    $q=db()->prepare("SELECT c.id counter_id,c.code counter_code,c.name counter_name,t.ticket_no,t.called_at,t.call_count,s.code service_code,s.name service_name FROM counters c JOIN services s ON s.id=c.service_id LEFT JOIN tickets t ON t.counter_id=c.id AND t.ticket_date=? AND t.status='called' WHERE c.office_id=? AND c.active=1 ORDER BY c.code");$q->execute([$today,$o['id']]);$calls=$q->fetchAll();
    $q=db()->prepare("SELECT s.id,s.code,s.name,COUNT(t.id) waiting FROM services s LEFT JOIN tickets t ON t.service_id=s.id AND t.office_id=s.office_id AND t.ticket_date=? AND t.status='waiting' WHERE s.office_id=? AND s.active=1 GROUP BY s.id ORDER BY s.name");$q->execute([$today,$o['id']]);$services=$q->fetchAll();
    $q=db()->prepare("SELECT t.ticket_no,s.code service_code,c.code counter_code FROM tickets t JOIN services s ON s.id=t.service_id LEFT JOIN counters c ON c.id=t.counter_id WHERE t.office_id=? AND t.ticket_date=? AND t.status='called' ORDER BY t.called_at DESC LIMIT 6");$q->execute([$o['id'],$today]);json_response(['office'=>$o,'calls'=>$calls,'services'=>$services,'recent'=>$q->fetchAll(),'updated_at'=>date(DATE_ATOM)]);
}
if($action==='issue'){
    csrf_check();$o=office_or_404((string)($body['office']??''));$s=service_or_404((int)($body['service_id']??0),(int)$o['id']);$pdo=db();$pdo->beginTransaction();
    try{
        $q=$pdo->prepare('INSERT INTO daily_sequences(office_id,service_id,ticket_date,last_number,last_queue) VALUES(?,?,?,0,0) ON DUPLICATE KEY UPDATE office_id=VALUES(office_id)');$q->execute([$o['id'],$s['id'],$today]);
        $q=$pdo->prepare('SELECT last_number,last_queue FROM daily_sequences WHERE office_id=? AND service_id=? AND ticket_date=? FOR UPDATE');$q->execute([$o['id'],$s['id'],$today]);$seq=$q->fetch();
        $n=(int)$seq['last_number']+1;$order=(int)$seq['last_queue']+1;$ticketNo=$s['code'].'-'.str_pad((string)$n,3,'0',STR_PAD_LEFT);$code=bin2hex(random_bytes(12));
        $q=$pdo->prepare('UPDATE daily_sequences SET last_number=?,last_queue=? WHERE office_id=? AND service_id=? AND ticket_date=?');$q->execute([$n,$order,$o['id'],$s['id'],$today]);
        $q=$pdo->prepare("INSERT INTO tickets(office_id,service_id,ticket_date,ticket_no,tracking_code,queue_order,status,issued_at) VALUES(?,?,?,?,?,?,'waiting',NOW())");$q->execute([$o['id'],$s['id'],$today,$ticketNo,$code,$order]);$id=(int)$pdo->lastInsertId();$pdo->commit();
        json_response(['ok'=>true,'ticket'=>['id'=>$id,'ticket_no'=>$ticketNo,'tracking_code'=>$code,'service_name'=>$s['name'],'office_name'=>$o['name'],'office_slug'=>$o['slug'],'issued_at'=>date('d-m-Y H:i'),'track_url'=>rtrim($config['app_url'],'/').'/index.php?page=track&code='.rawurlencode($code)]]);
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();json_response(['error'=>'Tiket gagal dibuat. Coba lagi.'],500);}
}
if($action==='track'){
    $code=(string)($_GET['code']??'');$ticketNo=strtoupper(trim((string)($_GET['ticket']??'')));$officeSlug=trim((string)($_GET['office']??''));
    if($code){$q=db()->prepare('SELECT t.office_id,t.service_id,t.ticket_date,t.queue_order,t.ticket_no,t.status,t.callback,t.call_count,t.issued_at,s.name service_name,s.code service_code,o.name office_name FROM tickets t JOIN services s ON s.id=t.service_id JOIN offices o ON o.id=t.office_id WHERE t.tracking_code=?');$q->execute([$code]);}
    else{$o=office_or_404($officeSlug);$q=db()->prepare('SELECT t.office_id,t.service_id,t.ticket_date,t.queue_order,t.ticket_no,t.status,t.callback,t.call_count,t.issued_at,s.name service_name,s.code service_code,o.name office_name FROM tickets t JOIN services s ON s.id=t.service_id JOIN offices o ON o.id=t.office_id WHERE t.office_id=? AND t.ticket_date=? AND t.ticket_no=?');$q->execute([$o['id'],$today,$ticketNo]);}
    $t=$q->fetch();if(!$t)json_response(['error'=>'Nomor tiket tidak ditemukan untuk kantor dan tanggal tersebut.'],404);
    $ahead=0;if(in_array($t['status'],['waiting','called'],true)){$q=db()->prepare("SELECT COUNT(*) FROM tickets WHERE office_id=? AND service_id=? AND ticket_date=? AND status IN ('waiting','called') AND queue_order<?");$q->execute([$t['office_id'],$t['service_id'],$t['ticket_date'],$t['queue_order']]);$ahead=(int)$q->fetchColumn();}
    $q=db()->prepare("SELECT ticket_no FROM tickets WHERE office_id=? AND service_id=? AND ticket_date=? AND status='called' ORDER BY called_at DESC LIMIT 1");$q->execute([$t['office_id'],$t['service_id'],$t['ticket_date']]);json_response(['ticket'=>$t,'ahead'=>$ahead,'now_serving'=>$q->fetchColumn()?:null]);
}

$user=require_user();
if($action==='operator_init'){$q=db()->prepare('SELECT id,code,name,service_id FROM counters WHERE office_id=? AND active=1 ORDER BY code');$q->execute([$user['office_id']]);$c=$q->fetchAll();$q=db()->prepare('SELECT id,code,name FROM services WHERE office_id=? AND active=1 ORDER BY name');$q->execute([$user['office_id']]);json_response(['user'=>$user,'counters'=>$c,'services'=>$q->fetchAll(),'csrf'=>$_SESSION['csrf']]);}
if($action==='operator_state'){$q=db()->prepare("SELECT t.id,t.ticket_no,t.status,t.callback,t.call_count,t.issued_at,s.name service_name,c.code counter_code FROM tickets t JOIN services s ON s.id=t.service_id LEFT JOIN counters c ON c.id=t.counter_id WHERE t.office_id=? AND t.ticket_date=? AND t.status IN ('waiting','called','absent') ORDER BY FIELD(t.status,'called','waiting','absent'),t.queue_order LIMIT 100");$q->execute([$user['office_id'],$today]);$tickets=$q->fetchAll();json_response(['tickets'=>$tickets]);}
if($action==='admin_dashboard'){
    $admin=require_admin();$pdo=db();
    $q=$pdo->prepare("SELECT COUNT(*) issued,COALESCE(SUM(status='waiting'),0) waiting,COALESCE(SUM(status='called'),0) called,COALESCE(SUM(status='done'),0) done,COALESCE(SUM(status='absent'),0) absent,COALESCE(SUM(callback=1),0) callbacks,ROUND(AVG(CASE WHEN called_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND,issued_at,called_at)/60 END),1) avg_wait_minutes FROM tickets WHERE office_id=? AND ticket_date=?");
    $q->execute([$admin['office_id'],$today]);$summary=$q->fetch();
    $q=$pdo->prepare("SELECT s.code,s.name,COUNT(t.id) issued,COALESCE(SUM(t.status='waiting'),0) waiting,COALESCE(SUM(t.status='called'),0) called,COALESCE(SUM(t.status='done'),0) done,COALESCE(SUM(t.status='absent'),0) absent,ROUND(AVG(CASE WHEN t.called_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND,t.issued_at,t.called_at)/60 END),1) avg_wait_minutes FROM services s LEFT JOIN tickets t ON t.service_id=s.id AND t.office_id=s.office_id AND t.ticket_date=? WHERE s.office_id=? GROUP BY s.id,s.code,s.name ORDER BY s.name");
    $q->execute([$today,$admin['office_id']]);$services=$q->fetchAll();
    $start=date('Y-m-d',strtotime('-6 days'));
    $q=$pdo->prepare("SELECT ticket_date,COUNT(*) issued,COALESCE(SUM(status='done'),0) done FROM tickets WHERE office_id=? AND ticket_date BETWEEN ? AND ? GROUP BY ticket_date ORDER BY ticket_date");
    $q->execute([$admin['office_id'],$start,$today]);$rawTrend=[];foreach($q->fetchAll() as $row)$rawTrend[$row['ticket_date']]=$row;
    $trend=[];for($i=0;$i<7;$i++){$date=date('Y-m-d',strtotime($start.' +'.$i.' days'));$row=$rawTrend[$date]??null;$trend[]=['date'=>$date,'issued'=>(int)($row['issued']??0),'done'=>(int)($row['done']??0)];}
    json_response(['summary'=>$summary,'services'=>$services,'trend'=>$trend,'generated_at'=>date(DATE_ATOM)]);
}
if($action==='operator_action'){
    csrf_check();$op=(string)($body['op']??'');$ticketId=(int)($body['ticket_id']??0);$counterId=(int)($body['counter_id']??0);$pdo=db();
    try{
        if($op==='next'){$pdo->beginTransaction();$q=$pdo->prepare('SELECT id,service_id FROM counters WHERE id=? AND office_id=? AND active=1 FOR UPDATE');$q->execute([$counterId,$user['office_id']]);$counter=$q->fetch();if(!$counter){$pdo->rollBack();json_response(['error'=>'Loket tidak tersedia.'],422);}
            $q=$pdo->prepare("SELECT id FROM tickets WHERE counter_id=? AND ticket_date=? AND status='called' LIMIT 1 FOR UPDATE");$q->execute([$counterId,$today]);if($q->fetch()){$pdo->rollBack();json_response(['error'=>'Selesaikan atau tandai tidak hadir untuk nomor yang sedang dipanggil di loket ini.'],422);}
            $q=$pdo->prepare("SELECT id FROM tickets WHERE office_id=? AND service_id=? AND ticket_date=? AND status='waiting' ORDER BY queue_order LIMIT 1 FOR UPDATE");$q->execute([$user['office_id'],$counter['service_id'],$today]);$t=$q->fetch();if(!$t){$pdo->rollBack();json_response(['error'=>'Belum ada antrean yang menunggu.'],422);}
            $q=$pdo->prepare("UPDATE tickets SET status='called',counter_id=?,called_at=NOW(),call_count=call_count+1 WHERE id=? AND status='waiting'");$q->execute([$counterId,$t['id']]);$pdo->commit();json_response(['ok'=>true]);}
        if(!in_array($op,['recall','done','absent','return'],true))json_response(['error'=>'Aksi tidak dikenal.'],400);
        $pdo->beginTransaction();$q=$pdo->prepare('SELECT id,status,office_id,service_id,ticket_date FROM tickets WHERE id=? AND office_id=? FOR UPDATE');$q->execute([$ticketId,$user['office_id']]);$t=$q->fetch();if(!$t){$pdo->rollBack();json_response(['error'=>'Tiket tidak ditemukan.'],404);}
        if($op==='recall'&&$t['status']==='called'){$q=$pdo->prepare('UPDATE tickets SET called_at=NOW(),call_count=call_count+1 WHERE id=?');$q->execute([$ticketId]);}
        elseif($op==='done'&&$t['status']==='called'){$q=$pdo->prepare("UPDATE tickets SET status='done',completed_at=NOW() WHERE id=?");$q->execute([$ticketId]);}
        elseif($op==='absent'&&$t['status']==='called'){$q=$pdo->prepare("UPDATE tickets SET status='absent' WHERE id=?");$q->execute([$ticketId]);}
        elseif($op==='return'&&$t['status']==='absent'){$q=$pdo->prepare('INSERT INTO daily_sequences(office_id,service_id,ticket_date,last_number,last_queue) VALUES(?,?,?,0,0) ON DUPLICATE KEY UPDATE office_id=VALUES(office_id)');$q->execute([$t['office_id'],$t['service_id'],$t['ticket_date']]);$q=$pdo->prepare('SELECT last_queue FROM daily_sequences WHERE office_id=? AND service_id=? AND ticket_date=? FOR UPDATE');$q->execute([$t['office_id'],$t['service_id'],$t['ticket_date']]);$order=(int)$q->fetchColumn()+1;$q=$pdo->prepare('UPDATE daily_sequences SET last_queue=? WHERE office_id=? AND service_id=? AND ticket_date=?');$q->execute([$order,$t['office_id'],$t['service_id'],$t['ticket_date']]);$q=$pdo->prepare("UPDATE tickets SET status='waiting',callback=1,queue_order=?,counter_id=NULL,returned_at=NOW() WHERE id=?");$q->execute([$order,$ticketId]);}
        else{$pdo->rollBack();json_response(['error'=>'Status tiket sudah berubah. Muat ulang daftar.'],422);}
        $pdo->commit();json_response(['ok'=>true]);
    }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();json_response(['error'=>'Perubahan gagal. Muat ulang dan coba lagi.'],500);}
}
if($action==='admin_data'){$admin=require_admin();$q=db()->prepare('SELECT id,code,name,active FROM services WHERE office_id=? ORDER BY name');$q->execute([$admin['office_id']]);$services=$q->fetchAll();$q=db()->prepare('SELECT c.id,c.code,c.name,c.service_id,c.active,s.name service_name FROM counters c JOIN services s ON s.id=c.service_id WHERE c.office_id=? ORDER BY c.code');$q->execute([$admin['office_id']]);$counters=$q->fetchAll();$q=db()->prepare('SELECT id,name,username,role,active FROM users WHERE office_id=? ORDER BY name');$q->execute([$admin['office_id']]);json_response(['services'=>$services,'counters'=>$counters,'users'=>$q->fetchAll(),'office'=>$admin['office_name'],'csrf'=>$_SESSION['csrf']]);}
if($action==='admin_save'){
    $admin=require_admin();csrf_check();$type=(string)($body['type']??'');$id=(int)($body['id']??0);$active=(int)($body['active']??1);$pdo=db();
    try{
        if($type==='service'){$code=strtoupper(trim((string)($body['code']??'')));$name=trim((string)($body['name']??''));if(!$code||!$name)json_response(['error'=>'Kode dan nama layanan wajib diisi.'],422);if($id){$q=$pdo->prepare('UPDATE services SET code=?,name=?,active=? WHERE id=? AND office_id=?');$q->execute([$code,$name,$active,$id,$admin['office_id']]);}else{$q=$pdo->prepare('INSERT INTO services(office_id,code,name,active) VALUES(?,?,?,?)');$q->execute([$admin['office_id'],$code,$name,$active]);}}
        elseif($type==='counter'){$service=(int)($body['service_id']??0);$code=strtoupper(trim((string)($body['code']??'')));$name=trim((string)($body['name']??''));$q=$pdo->prepare('SELECT id FROM services WHERE id=? AND office_id=?');$q->execute([$service,$admin['office_id']]);if(!$q->fetch()||!$code||!$name)json_response(['error'=>'Pilih layanan dan lengkapi kode serta nama loket.'],422);if($id){$q=$pdo->prepare('UPDATE counters SET service_id=?,code=?,name=?,active=? WHERE id=? AND office_id=?');$q->execute([$service,$code,$name,$active,$id,$admin['office_id']]);}else{$q=$pdo->prepare('INSERT INTO counters(office_id,service_id,code,name,active) VALUES(?,?,?,?,?)');$q->execute([$admin['office_id'],$service,$code,$name,$active]);}}
        elseif($type==='user'){$name=trim((string)($body['name']??''));$username=trim((string)($body['username']??''));$password=(string)($body['password']??'');$role=($body['role']??'operator')==='admin'?'admin':'operator';if(!$name||!$username)json_response(['error'=>'Nama dan username wajib diisi.'],422);if($id){if($password){if(strlen($password)<10)json_response(['error'=>'Kata sandi minimal 10 karakter.'],422);$q=$pdo->prepare('UPDATE users SET name=?,username=?,role=?,active=?,password_hash=? WHERE id=? AND office_id=?');$q->execute([$name,$username,$role,$active,password_hash($password,PASSWORD_DEFAULT),$id,$admin['office_id']]);}else{$q=$pdo->prepare('UPDATE users SET name=?,username=?,role=?,active=? WHERE id=? AND office_id=?');$q->execute([$name,$username,$role,$active,$id,$admin['office_id']]);}}else{if(strlen($password)<10)json_response(['error'=>'Kata sandi minimal 10 karakter.'],422);$q=$pdo->prepare('INSERT INTO users(office_id,name,username,password_hash,role,active) VALUES(?,?,?,?,?,?)');$q->execute([$admin['office_id'],$name,$username,password_hash($password,PASSWORD_DEFAULT),$role,$active]);}}
        else json_response(['error'=>'Jenis data tidak dikenal.'],400);json_response(['ok'=>true]);
    }catch(Throwable $e){json_response(['error'=>'Data gagal disimpan. Pastikan kode atau username belum digunakan.'],422);}
}
json_response(['error'=>'Aksi tidak ditemukan.'],404);
