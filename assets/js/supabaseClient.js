// Inisialisasi Supabase client (dipakai di semua halaman).
// Membutuhkan CONFIG dari config.js dan library @supabase/supabase-js dari CDN.

const supabaseClient = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);

// Helper: kirim notifikasi WhatsApp lewat Edge Function (aman, token
// Fonnte tidak pernah dikirim dari browser).
async function sendWhatsAppNotification({ booking_id, phone, type, message }) {
  try {
    const res = await fetch(CONFIG.EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Key project (publishable ATAU anon lama) dikirim di header "apikey"
        // sesuai anjuran Supabase terbaru (bukan sekadar Authorization Bearer,
        // karena key format baru sb_publishable_... bukan JWT).
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ booking_id, phone, type, message }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Gagal kirim WhatsApp:", data);
    }
    return data;
  } catch (err) {
    console.error("Error memanggil edge function WhatsApp:", err);
    return { ok: false, error: String(err) };
  }
}

// Helper format tanggal Indonesia
function formatTanggalIndonesia(dateStr) {
  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

// Helper format nomor telepon ke format 62xxxxxxxxxx (dipakai Fonnte)
function normalizePhone(phone) {
  let p = phone.replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (p.startsWith("8")) p = "62" + p;
  return p;
}
