// Logika halaman ruang konsultasi (konsultasi.html)
// Mendukung dua mode:
//  - PASIEN: diakses via ?kode=ROOM_CODE tanpa login, pakai RPC function.
//  - DOKTER: diakses saat sudah login (Supabase Auth), akses tabel langsung.

const params = new URLSearchParams(window.location.search);
const roomCode = (params.get("kode") || "").trim().toLowerCase();

let mode = "pasien";
let currentUser = null;
let booking = null;
let currentDoctorName = null;
let realtimeChannel = null;

const chatWindow = document.getElementById("chatWindow");

function badgeClass(status) {
  return {
    pending: "badge-pending",
    confirmed: "badge-confirmed",
    ongoing: "badge-ongoing",
    completed: "badge-completed",
    cancelled: "badge-cancelled",
    no_show: "badge-cancelled",
  }[status] || "badge-pending";
}

function statusLabel(status) {
  return {
    pending: "Menunggu Konfirmasi",
    confirmed: "Terkonfirmasi",
    ongoing: "Sedang Berlangsung",
    completed: "Selesai",
    cancelled: "Dibatalkan",
    no_show: "Tidak Hadir",
  }[status] || status;
}

function renderChatMessage(msg) {
  const div = document.createElement("div");
  div.className = `chat-bubble chat-${msg.sender_type}`;
  const time = new Date(msg.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  div.innerHTML = `<div>${escapeHtml(msg.message)}</div><div class="meta">${escapeHtml(msg.sender_name || msg.sender_type)} &middot; ${time}</div>`;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

function setupVideoFrame() {
  const jitsiRoomName = "RSAllamMedica-" + roomCode.replace(/[^a-z0-9]/gi, "");
  const url = `https://${CONFIG.JITSI_DOMAIN}/${jitsiRoomName}#config.prejoinPageEnabled=true`;
  document.getElementById("videoFrame").src = url;
}

async function loadBookingPasien() {
  const { data, error } = await supabaseClient.rpc("get_booking_by_room_code", { p_room_code: roomCode });
  if (error || !data || data.length === 0) {
    throw new Error("Kode akses tidak ditemukan atau sudah tidak berlaku.");
  }
  return data[0];
}

async function loadBookingDokter() {
  const { data, error } = await supabaseClient
    .from("bookings")
    .select("*, doctors(name, specialization)")
    .eq("room_code", roomCode)
    .single();
  if (error || !data) {
    throw new Error("Kode akses tidak ditemukan.");
  }
  return {
    id: data.id,
    room_code: data.room_code,
    patient_name: data.patient_name,
    doctor_id: data.doctor_id,
    doctor_name: data.doctors ? data.doctors.name : "-",
    doctor_specialization: data.doctors ? data.doctors.specialization : "-",
    booking_date: data.booking_date,
    booking_time: data.booking_time,
    consultation_type: data.consultation_type,
    complaint: data.complaint,
    status: data.status,
    diagnosis: data.diagnosis,
    doctor_notes: data.doctor_notes,
  };
}

async function loadChatHistory() {
  chatWindow.innerHTML = "";
  if (mode === "pasien") {
    const { data, error } = await supabaseClient.rpc("get_chat_by_room_code", { p_room_code: roomCode });
    if (!error && data) data.forEach(renderChatMessage);
  } else {
    const { data, error } = await supabaseClient
      .from("chat_messages")
      .select("*")
      .eq("booking_id", booking.id)
      .order("created_at", { ascending: true });
    if (!error && data) data.forEach(renderChatMessage);
  }
}

function subscribeRealtimeChat() {
  realtimeChannel = supabaseClient
    .channel(`chat-${booking.id}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages", filter: `booking_id=eq.${booking.id}` },
      (payload) => renderChatMessage(payload.new)
    )
    .subscribe();
}

async function sendChatMessage(text) {
  if (!text.trim()) return;
  if (mode === "pasien") {
    const { error } = await supabaseClient.rpc("send_chat_as_patient", {
      p_room_code: roomCode,
      p_message: text.trim(),
    });
    if (error) alert("Gagal mengirim pesan: " + error.message);
  } else {
    const { error } = await supabaseClient.from("chat_messages").insert({
      booking_id: booking.id,
      sender_type: "dokter",
      sender_name: currentDoctorName || "Dokter",
      message: text.trim(),
    });
    if (error) alert("Gagal mengirim pesan: " + error.message);
  }
}

function renderStatus() {
  const badge = document.getElementById("statusBadge");
  badge.textContent = statusLabel(booking.status);
  badge.className = "badge " + badgeClass(booking.status);

  document.getElementById("bookingSummary").textContent =
    `${booking.doctor_name} (${booking.doctor_specialization}) — ${formatTanggalIndonesia(booking.booking_date)}, ${booking.booking_time.slice ? booking.booking_time.slice(0,5) : booking.booking_time} WIB — Pasien: ${booking.patient_name}`;

  document.getElementById("complaintText").textContent = booking.complaint || "-";

  if (mode === "pasien") {
    document.getElementById("prescriptionLinkForPatient").style.display = "inline";
    document.getElementById("prescriptionLinkForPatient").href = `resep.html?kode=${roomCode}`;
  }
}

function setupDoctorControls() {
  document.getElementById("doctorNotesCard").style.display = "block";
  document.getElementById("doctorNotesInput").value = booking.doctor_notes || "";
  document.getElementById("diagnosisInput").value = booking.diagnosis || "";
  document.getElementById("goToPrescriptionBtn").href = `resep.html?kode=${roomCode}&mode=dokter`;

  document.getElementById("saveNotesBtn").addEventListener("click", async () => {
    const notes = document.getElementById("doctorNotesInput").value.trim();
    const diagnosis = document.getElementById("diagnosisInput").value.trim();
    const { error } = await supabaseClient
      .from("bookings")
      .update({ doctor_notes: notes, diagnosis: diagnosis })
      .eq("id", booking.id);
    if (error) {
      alert("Gagal menyimpan catatan: " + error.message);
    } else {
      alert("Catatan tersimpan.");
    }
  });

  document.getElementById("completeConsultationBtn").addEventListener("click", async () => {
    if (!confirm("Yakin ingin menyelesaikan konsultasi ini?")) return;
    const { error } = await supabaseClient
      .from("bookings")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", booking.id);
    if (error) {
      alert("Gagal menyelesaikan konsultasi: " + error.message);
    } else {
      booking.status = "completed";
      renderStatus();
      alert("Konsultasi telah ditandai selesai.");
    }
  });

  // Tandai 'ongoing' otomatis saat dokter membuka ruang konsultasi yang masih 'confirmed'
  if (booking.status === "confirmed") {
    supabaseClient
      .from("bookings")
      .update({ status: "ongoing", started_at: new Date().toISOString() })
      .eq("id", booking.id)
      .then(() => {
        booking.status = "ongoing";
        renderStatus();
      });
  }
}

async function init() {
  if (!roomCode) {
    document.getElementById("loadingContainer").innerHTML =
      '<div class="card error-box">Kode akses tidak ditemukan di URL. Silakan gunakan link/kode yang dikirim via WhatsApp.</div>';
    return;
  }

  const { data: sessionData } = await supabaseClient.auth.getSession();
  currentUser = sessionData?.session?.user || null;
  mode = currentUser ? "dokter" : "pasien";

  try {
    booking = mode === "dokter" ? await loadBookingDokter() : await loadBookingPasien();
  } catch (err) {
    document.getElementById("loadingContainer").innerHTML =
      `<div class="card error-box">${err.message}</div>`;
    return;
  }

  if (mode === "dokter") {
    const { data: docRow } = await supabaseClient
      .from("doctors")
      .select("name")
      .eq("id", booking.doctor_id)
      .maybeSingle();
    currentDoctorName = docRow ? docRow.name : "Dokter";
  }

  document.getElementById("loadingContainer").style.display = "none";
  document.getElementById("mainContainer").style.display = "block";

  renderStatus();
  setupVideoFrame();
  await loadChatHistory();
  subscribeRealtimeChat();

  if (mode === "dokter") setupDoctorControls();

  document.getElementById("sendChatBtn").addEventListener("click", async () => {
    const input = document.getElementById("chatInput");
    const text = input.value;
    input.value = "";
    await sendChatMessage(text);
  });

  document.getElementById("chatInput").addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const input = document.getElementById("chatInput");
      const text = input.value;
      input.value = "";
      await sendChatMessage(text);
    }
  });
}

init();
