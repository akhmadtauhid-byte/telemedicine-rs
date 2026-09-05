// Logika halaman pendaftaran konsultasi (index.html)

document.getElementById("hospitalTitle").textContent = "Layanan Telemedicine " + CONFIG.HOSPITAL_NAME;
document.getElementById("hospitalFooter").textContent = CONFIG.HOSPITAL_NAME;

const doctorSelect = document.getElementById("doctorSelect");
const bookingDateInput = document.getElementById("bookingDate");
const bookingTimeSelect = document.getElementById("bookingTime");
const errorBox = document.getElementById("errorBox");

let doctorsCache = [];
let schedulesCache = [];

// Batasi tanggal minimal = hari ini
const todayStr = new Date().toISOString().slice(0, 10);
bookingDateInput.min = todayStr;

function showError(msg) {
  errorBox.innerHTML = `<div class="error-box">${msg}</div>`;
}
function clearError() {
  errorBox.innerHTML = "";
}

async function loadDoctors() {
  const { data, error } = await supabaseClient
    .from("doctors")
    .select("id, name, specialization")
    .eq("is_active", true)
    .order("name");

  if (error) {
    showError("Gagal memuat daftar dokter: " + error.message);
    return;
  }
  doctorsCache = data;
  doctorSelect.innerHTML = '<option value="">-- Pilih Dokter --</option>' +
    data.map(d => `<option value="${d.id}">${d.name} — ${d.specialization}</option>`).join("");
}

async function loadSchedulesForDoctor(doctorId) {
  const { data, error } = await supabaseClient
    .from("doctor_schedules")
    .select("*")
    .eq("doctor_id", doctorId)
    .eq("is_active", true);
  if (error) {
    showError("Gagal memuat jadwal dokter: " + error.message);
    return [];
  }
  return data;
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

async function updateAvailableSlots() {
  bookingTimeSelect.innerHTML = '<option value="">-- Memuat slot... --</option>';
  const doctorId = doctorSelect.value;
  const dateStr = bookingDateInput.value;
  if (!doctorId || !dateStr) {
    bookingTimeSelect.innerHTML = '<option value="">-- Pilih dokter & tanggal dahulu --</option>';
    return;
  }

  const dayOfWeek = new Date(dateStr + "T00:00:00").getDay(); // 0=Minggu
  const schedules = await loadSchedulesForDoctor(doctorId);
  const todaySchedules = schedules.filter(s => s.day_of_week === dayOfWeek);

  if (todaySchedules.length === 0) {
    bookingTimeSelect.innerHTML = '<option value="">-- Dokter tidak praktik pada hari ini --</option>';
    return;
  }

  // Ambil booking yang sudah ada untuk dokter & tanggal ini (yang belum dibatalkan)
  const { data: existingBookings, error: bErr } = await supabaseClient
    .from("bookings")
    .select("booking_time, status")
    .eq("doctor_id", doctorId)
    .eq("booking_date", dateStr)
    .neq("status", "cancelled");

  if (bErr) {
    showError("Gagal memeriksa slot tersedia: " + bErr.message);
    return;
  }

  const bookedCount = {};
  (existingBookings || []).forEach(b => {
    const key = b.booking_time.slice(0, 5);
    bookedCount[key] = (bookedCount[key] || 0) + 1;
  });

  let options = [];
  const now = new Date();
  const isToday = dateStr === todayStr;

  todaySchedules.forEach(sch => {
    const start = timeToMinutes(sch.start_time.slice(0,5));
    const end = timeToMinutes(sch.end_time.slice(0,5));
    for (let t = start; t < end; t += sch.slot_duration_minutes) {
      const timeStr = minutesToTime(t);
      const used = bookedCount[timeStr] || 0;
      if (used >= sch.quota_per_slot) continue; // slot penuh

      if (isToday) {
        const slotDate = new Date(dateStr + "T" + timeStr + ":00");
        if (slotDate < now) continue; // slot sudah lewat
      }
      options.push(timeStr);
    }
  });

  options = [...new Set(options)].sort();

  if (options.length === 0) {
    bookingTimeSelect.innerHTML = '<option value="">-- Tidak ada slot tersedia --</option>';
    return;
  }

  bookingTimeSelect.innerHTML = '<option value="">-- Pilih Jam --</option>' +
    options.map(t => `<option value="${t}">${t} WIB</option>`).join("");
}

doctorSelect.addEventListener("change", updateAvailableSlots);
bookingDateInput.addEventListener("change", updateAvailableSlots);

document.getElementById("bookingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Memproses...";

  try {
    const patientName = document.getElementById("patientName").value.trim();
    const patientPhoneRaw = document.getElementById("patientPhone").value.trim();
    const patientPhone = normalizePhone(patientPhoneRaw);
    const patientNik = document.getElementById("patientNik").value.trim() || null;
    const patientBirthdate = document.getElementById("patientBirthdate").value || null;
    const doctorId = doctorSelect.value;
    const bookingDate = bookingDateInput.value;
    const bookingTime = bookingTimeSelect.value;
    const consultationType = document.getElementById("consultationType").value;
    const complaint = document.getElementById("complaint").value.trim();

    if (!doctorId || !bookingDate || !bookingTime) {
      showError("Mohon lengkapi dokter, tanggal, dan jam konsultasi.");
      return;
    }

    // Pendaftaran WAJIB lewat RPC create_booking (bukan insert langsung),
    // supaya validasi dokter aktif & slot tersedia dicek di server, dan
    // supaya tidak melanggar RLS (pasien tidak diberi hak SELECT langsung
    // ke tabel bookings — hanya lewat kode akses).
    const { data: rpcResult, error } = await supabaseClient.rpc("create_booking", {
      p_patient_name: patientName,
      p_patient_phone: patientPhone,
      p_patient_nik: patientNik,
      p_patient_birthdate: patientBirthdate,
      p_doctor_id: doctorId,
      p_booking_date: bookingDate,
      p_booking_time: bookingTime,
      p_consultation_type: consultationType,
      p_complaint: complaint,
    });

    if (error) {
      showError("Gagal mendaftar: " + error.message);
      return;
    }

    const inserted = rpcResult[0];

    const doctor = doctorsCache.find(d => d.id === doctorId);
    const tanggalIndo = formatTanggalIndonesia(bookingDate);
    const waMessage =
      `Halo ${patientName}, pendaftaran konsultasi telemedicine Anda di ${CONFIG.HOSPITAL_NAME} telah dikonfirmasi.\n\n` +
      `Dokter: ${doctor ? doctor.name : "-"}\n` +
      `Tanggal: ${tanggalIndo}\n` +
      `Jam: ${bookingTime} WIB\n` +
      `Kode Akses: ${inserted.room_code}\n\n` +
      `Silakan buka link berikut pada jadwal konsultasi Anda:\n` +
      `${window.location.origin}${window.location.pathname.replace("index.html","")}konsultasi.html?kode=${inserted.room_code}\n\n` +
      `Simpan pesan ini sebagai referensi.`;

    await sendWhatsAppNotification({
      booking_id: inserted.id,
      phone: patientPhone,
      type: "booking_confirmation",
      message: waMessage,
    });

    document.getElementById("formCard").style.display = "none";
    document.getElementById("roomCodeDisplay").textContent = inserted.room_code;
    document.getElementById("goToConsultationBtn").href = `konsultasi.html?kode=${inserted.room_code}`;
    document.getElementById("successCard").style.display = "block";
    window.scrollTo(0, 0);

  } catch (err) {
    showError("Terjadi kesalahan: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Daftar Konsultasi";
  }
});

document.getElementById("openExistingBtn").addEventListener("click", () => {
  const kode = document.getElementById("existingRoomCode").value.trim().toLowerCase();
  if (!kode) {
    showError("Masukkan kode akses terlebih dahulu.");
    return;
  }
  window.location.href = `konsultasi.html?kode=${kode}`;
});

loadDoctors();
