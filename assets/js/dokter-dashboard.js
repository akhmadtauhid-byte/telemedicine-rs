// Logika dashboard dokter (dokter/dashboard.html)

let doctorProfile = null;
let allBookings = [];
let activeFilter = "today";

async function guardAndLoadDoctor() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) {
    window.location.href = "login.html";
    return null;
  }

  const { data: roleRow } = await supabaseClient
    .from("staff_roles")
    .select("role, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!roleRow || roleRow.role !== "dokter") {
    // Bukan dokter (mungkin admin) -> arahkan sesuai peran
    if (roleRow && roleRow.role === "admin") {
      window.location.href = "../admin/dashboard.html";
    } else {
      await supabaseClient.auth.signOut();
      window.location.href = "login.html";
    }
    return null;
  }

  const { data: docRow, error: docErr } = await supabaseClient
    .from("doctors")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (docErr || !docRow) {
    document.getElementById("noDoctorProfileBox").innerHTML =
      `<div class="card error-box">Akun Anda belum terhubung ke data dokter manapun. Minta admin menghubungkan kolom <b>user_id</b> pada tabel <b>doctors</b> dengan akun Anda.</div>`;
    document.getElementById("doctorNameLabel").textContent = roleRow.full_name || user.email;
    return null;
  }

  document.getElementById("doctorNameLabel").textContent = `${docRow.name} — ${docRow.specialization}`;
  return docRow;
}

async function loadBookings() {
  const { data, error } = await supabaseClient
    .from("bookings")
    .select("*")
    .eq("doctor_id", doctorProfile.id)
    .order("booking_date", { ascending: true })
    .order("booking_time", { ascending: true });

  if (error) {
    document.getElementById("bookingList").innerHTML = `<div class="error-box">Gagal memuat data: ${error.message}</div>`;
    return;
  }
  allBookings = data || [];
  renderBookings();
}

function badgeClass(status) {
  return {
    pending: "badge-pending", confirmed: "badge-confirmed", ongoing: "badge-ongoing",
    completed: "badge-completed", cancelled: "badge-cancelled", no_show: "badge-cancelled",
  }[status] || "badge-pending";
}
function statusLabel(status) {
  return {
    pending: "Menunggu", confirmed: "Terkonfirmasi", ongoing: "Berlangsung",
    completed: "Selesai", cancelled: "Dibatalkan", no_show: "Tidak Hadir",
  }[status] || status;
}

function renderBookings() {
  const todayStr = new Date().toISOString().slice(0, 10);
  let filtered = allBookings;

  if (activeFilter === "today") {
    filtered = allBookings.filter(b => b.booking_date === todayStr && b.status !== "cancelled");
  } else if (activeFilter === "upcoming") {
    filtered = allBookings.filter(b => b.booking_date > todayStr && b.status !== "cancelled" && b.status !== "completed");
  } else if (activeFilter === "completed") {
    filtered = allBookings.filter(b => b.status === "completed");
  }

  const listEl = document.getElementById("bookingList");
  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="empty-state">Tidak ada data konsultasi pada kategori ini.</p>';
    return;
  }

  listEl.innerHTML = filtered.map(b => `
    <div class="list-item">
      <div>
        <strong>${escapeHtmlDash(b.patient_name)}</strong>
        <span class="badge ${badgeClass(b.status)}" style="margin-left:8px;">${statusLabel(b.status)}</span>
        <div class="helper-text">${formatTanggalIndonesia(b.booking_date)} · ${b.booking_time.slice(0,5)} WIB · ${escapeHtmlDash(b.complaint || "-")}</div>
      </div>
      <a class="btn" href="../konsultasi.html?kode=${b.room_code}">Buka</a>
    </div>
  `).join("");
}

function escapeHtmlDash(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    renderBookings();
  });
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "login.html";
});

(async function init() {
  doctorProfile = await guardAndLoadDoctor();
  if (!doctorProfile) return;
  await loadBookings();
  setInterval(loadBookings, 30000); // refresh tiap 30 detik
})();
