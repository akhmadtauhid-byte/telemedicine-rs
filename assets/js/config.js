// =====================================================================
// KONFIGURASI SISTEM TELEMEDICINE RSU ALLAM MEDICA
// PENTING: Setiap kali file ini di-overwrite/diganti total, PASTIKAN
// nilai di bawah ini dikembalikan ke kredensial asli sebelum deploy!
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY
//   - EDGE_FUNCTION_URL (untuk kirim WhatsApp)
// Nilai ini AMAN untuk ditaruh di frontend publik (bukan secret),
// karena akses data tetap dibatasi oleh RLS + RPC di database.
// Token Fonnte TIDAK pernah ditaruh di sini — itu hanya tersimpan
// sebagai secret di Supabase Edge Function.
// =====================================================================

const CONFIG = {
  // Ganti dengan URL project Supabase Anda, contoh:
  // "https://xxxxxxxxxxxx.supabase.co"
  SUPABASE_URL: "https://oaotqyhqnakvewpnykcj.supabase.co",

  // Ganti dengan "Publishable key" (format sb_publishable_xxx) dari
  // Supabase > Project Settings > API Keys > tab "Publishable and secret API keys".
  // Kalau project Anda masih pakai sistem lama, boleh juga pakai "anon public"
  // key (format JWT panjang) dari tab "Legacy anon, service_role API keys" —
  // keduanya berfungsi sama persis untuk sistem ini (sama-sama dibatasi RLS).
  // JANGAN PERNAH memakai Secret key / service_role key di sini — itu HANYA
  // untuk backend (Edge Function), karena bisa melewati semua batasan keamanan (RLS).
  SUPABASE_ANON_KEY: "sb_publishable_X50aBGFqNl_578yRmknCQw_f4MFGThN",

  // URL Edge Function pengirim WhatsApp (Fonnte), contoh:
  // "https://xxxxxxxxxxxx.supabase.co/functions/v1/send-whatsapp"
  EDGE_FUNCTION_URL: "https://oaotqyhqnakvewpnykcj.supabase.co/functions/v1/send-whatsapp",

  // Nama server Jitsi Meet publik untuk video call (tidak perlu diubah
  // kecuali RS punya server Jitsi sendiri)
  JITSI_DOMAIN: "meet.jit.si",

  // Nama & identitas RS untuk ditampilkan di halaman & pesan WhatsApp
  HOSPITAL_NAME: "RSU Allam Medica",
};
