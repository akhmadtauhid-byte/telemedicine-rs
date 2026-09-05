// Logika dashboard admin (admin/dashboard.html)

let doctorsCache = [];

async function guardAdmin() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) {
    window.location.href = "../dokter/login.html";
    return null;
  }
  const { data: roleRow } = await supabaseClient
    .from("staff_roles")
    .select("role, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!roleRow || roleRow.role !== "admin") {
    if (roleRow && roleRow.role === "dokter") {
      window.location.href = "../dokter/dashboard.html";
    } else {
      await supabaseClient.auth.signOut();
      window.location.href = "../dokter/login.html";
    }
    return null;
  }
  document.getElementById("adminLabel").textContent = roleRow.full_name || user.email;
  return roleRow;
}

// ---------- TAB SWITCHING ----------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    ["Dokter", "Jadwal", "Booking"].forEach(t => {
      document.getElementById("tab" + t).style.display = "none";
    });
    const tabId = "tab" + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1);
    document.getElementById(tabId).style.display = "block";
    if (btn.dataset.tab === "booking") loadBookingsTable();
    if (btn.dataset.tab === "jadwal") populateScheduleDoctorSelect();
  });
});

// ---------- TAB DOKTER ----------
function escapeHtmlAdm(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

async function loadDoctorsList() {
  const { data, error } = await supabaseClient.from("doctors").select("*").order("name");
  const container = document.getElementById("doctorListContainer");
  if (error) {
    container.innerHTML = `<div class="error-box">${error.message}</div>`;
    return;
  }
  doctorsCache = data || [];
  if (doctorsCache.length === 0) {
    container.innerHTML = '<p class="empty-state">Belum ada dokter terdaftar.</p>';
    return;
  }
  container.innerHTML = doctorsCache.map(d => `
    <div class="list-item">
      <div>
        <strong>${escapeHtmlAdm(d.name)}</strong> — ${escapeHtmlAdm(d.specialization)}
        <div class="helper-text">WA: ${escapeHtmlAdm(d.whatsapp_number)} · ${d.is_active ? "Aktif" : "Nonaktif"} · user_id: ${d.user_id ? "terhubung" : "belum terhubung"}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn-secondary edit-doctor-btn" data-id="${d.id}" type="button">Edit</button>
        <button class="btn-danger toggle-doctor-btn" data-id="${d.id}" data-active="${d.is_active}" type="button">${d.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".edit-doctor-btn").forEach(btn => {
    btn.addEventListener("click", () => fillDoctorForm(btn.dataset.id));
  });
  container.querySelectorAll(".toggle-doctor-btn").forEach(btn => {
    btn.addEventListener("click", () => toggleDoctorActive(btn.dataset.id, btn.dataset.active === "true"));
  });
}

function fillDoctorForm(id) {
  const d = doctorsCache.find(x => x.id === id);
  if (!d) return;
  document.getElementById("doctorEditId").value = d.id;
  document.getElementById("doctorName").value = d.name;
  document.getElementById("doctorSpecialization").value = d.specialization;
  document.getElementById("doctorWhatsapp").value = d.whatsapp_number;
  document.getElementById("doctorStr").value = d.str_number || "";
  document.getElementById("doctorUserId").value = d.user_id || "";
  document.getElementById("cancelEditDoctorBtn").style.display = "inline-flex";
  window.scrollTo(0, 0);
}

function clearDoctorForm() {
  document.getElementById("doctorEditId").value = "";
  document.getElementById("doctorName").value = "";
  document.getElementById("doctorSpecialization").value = "";
  document.getElementById("doctorWhatsapp").value = "";
  document.getElementById("doctorStr").value = "";
  document.getElementById("doctorUserId").value = "";
  document.getElementById("cancelEditDoctorBtn").style.display = "none";
}

document.getElementById("cancelEditDoctorBtn").addEventListener("click", clearDoctorForm);

document.getElementById("saveDoctorBtn").addEventListener("click", async () => {
  const errorBox = document.getElementById("doctorFormErrorBox");
  errorBox.innerHTML = "";

  const id = document.getElementById("doctorEditId").value;
  const name = document.getElementById("doctorName").value.trim();
  const specialization = document.getElementById("doctorSpecialization").value.trim();
  const whatsapp = normalizePhone(document.getElementById("doctorWhatsapp").value.trim());
  const str = document.getElementById("doctorStr").value.trim() || null;
  const userId = document.getElementById("doctorUserId").value.trim() || null;

  if (!name || !specialization || !whatsapp) {
    errorBox.innerHTML = '<div class="error-box">Nama, spesialisasi, dan WhatsApp wajib diisi.</div>';
    return;
  }

  const payload = { name, specialization, whatsapp_number: whatsapp, str_number: str, user_id: userId };

  let result;
  if (id) {
    result = await supabaseClient.from("doctors").update(payload).eq("id", id);
  } else {
    result = await supabaseClient.from("doctors").insert(payload);
  }

  if (result.error) {
    errorBox.innerHTML = `<div class="error-box">Gagal menyimpan: ${result.error.message}</div>`;
    return;
  }

  clearDoctorForm();
  await loadDoctorsList();
});

async function toggleDoctorActive(id, currentActive) {
  const { error } = await supabaseClient.from("doctors").update({ is_active: !currentActive }).eq("id", id);
  if (error) {
    alert("Gagal mengubah status: " + error.message);
    return;
  }
  await loadDoctorsList();
}

// ---------- TAB JADWAL ----------
function populateScheduleDoctorSelect() {
  const sel = document.getElementById("scheduleDoctorSelect");
  sel.innerHTML = doctorsCache.map(d => `<option value="${d.id}">${escapeHtmlAdm(d.name)}</option>`).join("");
  if (doctorsCache.length > 0) loadSchedulesForSelectedDoctor();
}

document.getElementById("scheduleDoctorSelect").addEventListener("change", loadSchedulesForSelectedDoctor);

const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

async function loadSchedulesForSelectedDoctor() {
  const doctorId = document.getElementById("scheduleDoctorSelect").value;
  const container = document.getElementById("scheduleListContainer");
  if (!doctorId) {
    container.innerHTML = '<p class="empty-state">Pilih dokter untuk melihat jadwal.</p>';
    return;
  }
  const { data, error } = await supabaseClient
    .from("doctor_schedules")
    .select("*")
    .eq("doctor_id", doctorId)
    .order("day_of_week");

  if (error) {
    container.innerHTML = `<div class="error-box">${error.message}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="empty-state">Belum ada jadwal untuk dokter ini.</p>';
    return;
  }
  container.innerHTML = data.map(s => `
    <div class="list-item">
      <div>
        <strong>${dayNames[s.day_of_week]}</strong>, ${s.start_time.slice(0,5)}–${s.end_time.slice(0,5)}
        <div class="helper-text">Slot ${s.slot_duration_minutes} menit · kuota ${s.quota_per_slot}/slot · ${s.is_active ? "Aktif" : "Nonaktif"}</div>
      </div>
      <button class="btn-danger delete-schedule-btn" data-id="${s.id}" type="button">Hapus</button>
    </div>
  `).join("");

  container.querySelectorAll(".delete-schedule-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Hapus jadwal ini?")) return;
      await supabaseClient.from("doctor_schedules").delete().eq("id", btn.dataset.id);
      await loadSchedulesForSelectedDoctor();
    });
  });
}

document.getElementById("addScheduleBtn").addEventListener("click", async () => {
  const errorBox = document.getElementById("scheduleFormErrorBox");
  errorBox.innerHTML = "";
  const doctorId = document.getElementById("scheduleDoctorSelect").value;
  if (!doctorId) {
    errorBox.innerHTML = '<div class="error-box">Pilih dokter terlebih dahulu.</div>';
    return;
  }
  const payload = {
    doctor_id: doctorId,
    day_of_week: Number(document.getElementById("schDay").value),
    start_time: document.getElementById("schStart").value,
    end_time: document.getElementById("schEnd").value,
    slot_duration_minutes: Number(document.getElementById("schDuration").value),
    quota_per_slot: Number(document.getElementById("schQuota").value),
  };
  if (payload.start_time >= payload.end_time) {
    errorBox.innerHTML = '<div class="error-box">Jam mulai harus lebih awal dari jam selesai.</div>';
    return;
  }
  const { error } = await supabaseClient.from("doctor_schedules").insert(payload);
  if (error) {
    errorBox.innerHTML = `<div class="error-box">Gagal menambah jadwal: ${error.message}</div>`;
    return;
  }
  await loadSchedulesForSelectedDoctor();
});

// ---------- TAB BOOKING ----------
function badgeClassAdm(status) {
  return {
    pending: "badge-pending", confirmed: "badge-confirmed", ongoing: "badge-ongoing",
    completed: "badge-completed", cancelled: "badge-cancelled", no_show: "badge-cancelled",
  }[status] || "badge-pending";
}
function statusLabelAdm(status) {
  return {
    pending: "Menunggu", confirmed: "Terkonfirmasi", ongoing: "Berlangsung",
    completed: "Selesai", cancelled: "Dibatalkan", no_show: "Tidak Hadir",
  }[status] || status;
}

async function loadBookingsTable() {
  const container = document.getElementById("bookingTableContainer");
  container.innerHTML = '<p class="empty-state">Memuat...</p>';

  let query = supabaseClient
    .from("bookings")
    .select("*, doctors(name)")
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: false })
    .limit(200);

  const dateFilter = document.getElementById("filterDate").value;
  const statusFilter = document.getElementById("filterStatus").value;
  if (dateFilter) query = query.eq("booking_date", dateFilter);
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data, error } = await query;
  if (error) {
    container.innerHTML = `<div class="error-box">${error.message}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="empty-state">Tidak ada data.</p>';
    return;
  }

  container.innerHTML = `
    <div style="overflow-x:auto;">
    <table>
      <thead><tr><th>Tanggal</th><th>Jam</th><th>Pasien</th><th>Dokter</th><th>Status</th><th>Aksi</th></tr></thead>
      <tbody>
        ${data.map(b => `
          <tr>
            <td>${formatTanggalIndonesia(b.booking_date)}</td>
            <td>${b.booking_time.slice(0,5)}</td>
            <td>${escapeHtmlAdm(b.patient_name)}</td>
            <td>${escapeHtmlAdm(b.doctors ? b.doctors.name : "-")}</td>
            <td><span class="badge ${badgeClassAdm(b.status)}">${statusLabelAdm(b.status)}</span></td>
            <td><a class="link-plain" href="../konsultasi.html?kode=${b.room_code}" target="_blank">Buka</a></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    </div>
  `;
}

document.getElementById("applyFilterBtn").addEventListener("click", loadBookingsTable);

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "../dokter/login.html";
});

(async function init() {
  const role = await guardAdmin();
  if (!role) return;
  await loadDoctorsList();
})();
