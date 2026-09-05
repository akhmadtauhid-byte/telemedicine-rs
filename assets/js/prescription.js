// Logika halaman E-Resep (resep.html)

const params = new URLSearchParams(window.location.search);
const roomCode = (params.get("kode") || "").trim().toLowerCase();
const requestedMode = params.get("mode"); // "dokter" jika datang dari dashboard dokter

let mode = "pasien";
let booking = null;
let doctorRow = null;
let prescription = null; // { id, notes, status, issued_at }
let items = []; // array of {medicine_name, dosage, frequency, duration, quantity, instructions}

function itemRowHtml(item = {}, index) {
  return `
    <div class="rx-item-row" data-index="${index}">
      <input type="text" placeholder="Nama obat" class="item-name" value="${item.medicine_name || ""}" />
      <input type="text" placeholder="Dosis (mis. 500mg)" class="item-dosage" value="${item.dosage || ""}" />
      <input type="text" placeholder="Frekuensi (mis. 3x1)" class="item-frequency" value="${item.frequency || ""}" />
      <input type="text" placeholder="Jumlah" class="item-quantity" value="${item.quantity || ""}" />
      <input type="text" placeholder="Aturan pakai" class="item-instructions" value="${item.instructions || ""}" style="grid-column: span 2;" />
      <button type="button" class="btn-danger remove-item-btn" style="padding:6px 10px;">Hapus</button>
    </div>
  `;
}

function renderItemForm() {
  const container = document.getElementById("itemsContainer");
  if (items.length === 0) items.push({});
  container.innerHTML = items.map((it, i) => itemRowHtml(it, i)).join("");
  container.querySelectorAll(".remove-item-btn").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      items.splice(i, 1);
      renderItemForm();
    });
  });
}

function readItemsFromForm() {
  const rows = document.querySelectorAll("#itemsContainer .rx-item-row");
  const result = [];
  rows.forEach(row => {
    const medicine_name = row.querySelector(".item-name").value.trim();
    if (!medicine_name) return;
    result.push({
      medicine_name,
      dosage: row.querySelector(".item-dosage").value.trim(),
      frequency: row.querySelector(".item-frequency").value.trim(),
      quantity: row.querySelector(".item-quantity").value.trim(),
      instructions: row.querySelector(".item-instructions").value.trim(),
    });
  });
  return result;
}

async function loadBookingDokter() {
  const { data, error } = await supabaseClient
    .from("bookings")
    .select("*, doctors(name, specialization, id)")
    .eq("room_code", roomCode)
    .single();
  if (error || !data) throw new Error("Kode akses tidak ditemukan.");
  return data;
}

async function ensureDraftPrescription() {
  const { data: existing, error } = await supabaseClient
    .from("prescriptions")
    .select("*")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error: createErr } = await supabaseClient
    .from("prescriptions")
    .insert({ booking_id: booking.id, doctor_id: doctorRow.id, status: "draft" })
    .select()
    .single();
  if (createErr) throw new Error("Gagal membuat draft resep: " + createErr.message);
  return created;
}

async function loadItemsFor(prescriptionId) {
  const { data, error } = await supabaseClient
    .from("prescription_items")
    .select("*")
    .eq("prescription_id", prescriptionId);
  if (error) return [];
  return data;
}

async function saveItems(publish) {
  const errorBox = document.getElementById("rxErrorBox");
  errorBox.innerHTML = "";
  const newItems = readItemsFromForm();
  if (newItems.length === 0) {
    errorBox.innerHTML = '<div class="error-box">Tambahkan minimal satu obat.</div>';
    return false;
  }

  // Ganti seluruh item: hapus lama, insert baru (paling sederhana & aman)
  await supabaseClient.from("prescription_items").delete().eq("prescription_id", prescription.id);
  const toInsert = newItems.map(it => ({ ...it, prescription_id: prescription.id }));
  const { error: insErr } = await supabaseClient.from("prescription_items").insert(toInsert);
  if (insErr) {
    errorBox.innerHTML = `<div class="error-box">Gagal menyimpan obat: ${insErr.message}</div>`;
    return false;
  }

  const notes = document.getElementById("rxNotes").value.trim();
  const updatePayload = { notes };
  if (publish) {
    updatePayload.status = "issued";
    updatePayload.issued_at = new Date().toISOString();
  }
  const { error: updErr } = await supabaseClient
    .from("prescriptions")
    .update(updatePayload)
    .eq("id", prescription.id);

  if (updErr) {
    errorBox.innerHTML = `<div class="error-box">Gagal menyimpan resep: ${updErr.message}</div>`;
    return false;
  }
  return true;
}

function renderReadOnlyView(doctorName, notes, status, issuedAt, rows) {
  document.getElementById("viewCard").style.display = "block";
  document.getElementById("itemsTableBody").innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtmlRx(r.medicine_name)}</td>
      <td>${escapeHtmlRx(r.dosage)}</td>
      <td>${escapeHtmlRx(r.frequency)}</td>
      <td>${escapeHtmlRx(r.quantity)}</td>
      <td>${escapeHtmlRx(r.instructions)}</td>
    </tr>
  `).join("");
  document.getElementById("viewNotes").textContent = notes ? "Catatan: " + notes : "";
  document.getElementById("viewStatus").textContent =
    status === "issued" ? `Resep diterbitkan pada ${new Date(issuedAt).toLocaleString("id-ID")}` : "Draft (belum diterbitkan)";
}

function escapeHtmlRx(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

async function initDokterMode() {
  booking = await loadBookingDokter();
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const user = sessionData?.session?.user;
  const { data: docRow } = await supabaseClient.from("doctors").select("*").eq("user_id", user.id).maybeSingle();
  if (!docRow) throw new Error("Akun Anda belum terhubung ke data dokter.");
  doctorRow = docRow;

  fillInfoBox(booking.patient_name, booking.doctors.name, booking.booking_date, booking.diagnosis);

  prescription = await ensureDraftPrescription();
  items = await loadItemsFor(prescription.id);

  if (prescription.status === "issued") {
    document.getElementById("rxNotes") && (document.getElementById("rxNotes").value = prescription.notes || "");
    renderReadOnlyView(doctorRow.name, prescription.notes, prescription.status, prescription.issued_at, items);
  } else {
    document.getElementById("doctorFormCard").style.display = "block";
    document.getElementById("rxNotes").value = prescription.notes || "";
    renderItemForm();

    document.getElementById("addItemBtn").addEventListener("click", () => {
      items = readItemsFromForm();
      items.push({});
      renderItemForm();
    });

    document.getElementById("saveDraftBtn").addEventListener("click", async () => {
      const ok = await saveItems(false);
      if (ok) alert("Draft resep tersimpan.");
    });

    document.getElementById("issueBtn").addEventListener("click", async () => {
      if (!confirm("Terbitkan resep ini dan kirim notifikasi WhatsApp ke pasien?")) return;
      const ok = await saveItems(true);
      if (ok) {
        const waMessage =
          `Halo ${booking.patient_name}, e-resep dari konsultasi Anda di ${CONFIG.HOSPITAL_NAME} telah terbit.\n\n` +
          `Dokter: ${doctorRow.name}\n` +
          `Silakan lihat/cetak resep Anda di:\n` +
          `${window.location.origin}${window.location.pathname.replace("resep.html","")}resep.html?kode=${roomCode}`;
        await sendWhatsAppNotification({
          booking_id: booking.id,
          phone: booking.patient_phone,
          type: "prescription_ready",
          message: waMessage,
        });
        alert("Resep diterbitkan dan notifikasi WhatsApp terkirim.");
        window.location.reload();
      }
    });
  }
}

async function initPasienMode() {
  const { data, error } = await supabaseClient.rpc("get_prescription_by_room_code", { p_room_code: roomCode });
  if (error) throw new Error(error.message);

  const issuedRows = (data || []).filter(r => r.status === "issued");
  if (issuedRows.length === 0) {
    document.getElementById("emptyState").style.display = "block";
    return;
  }
  const first = issuedRows[0];
  fillInfoBox(null, first.doctor_name, null, null);
  document.getElementById("infoPatient").closest("p").style.display = "none";
  document.getElementById("infoDate").closest("p").style.display = "none";
  document.getElementById("infoDiagnosis").closest("p").style.display = "none";
  renderReadOnlyView(first.doctor_name, first.notes, first.status, first.issued_at, issuedRows);
}

function fillInfoBox(patientName, doctorName, date, diagnosis) {
  if (patientName !== null) document.getElementById("infoPatient").textContent = patientName;
  document.getElementById("infoDoctor").textContent = doctorName || "-";
  if (date !== null) document.getElementById("infoDate").textContent = formatTanggalIndonesia(date);
  if (diagnosis !== null) document.getElementById("infoDiagnosis").textContent = diagnosis || "-";
}

(async function init() {
  document.getElementById("printHospitalName").textContent = CONFIG.HOSPITAL_NAME;
  if (!roomCode) {
    document.getElementById("loadingContainer").innerHTML = '<div class="card error-box">Kode akses tidak ditemukan.</div>';
    return;
  }

  const { data: sessionData } = await supabaseClient.auth.getSession();
  mode = (requestedMode === "dokter" && sessionData?.session) ? "dokter" : "pasien";

  try {
    if (mode === "dokter") {
      await initDokterMode();
    } else {
      await initPasienMode();
    }
    document.getElementById("rxSummary").textContent = mode === "dokter" ? "Mode Dokter" : "Mode Pasien";
    document.getElementById("loadingContainer").style.display = "none";
    document.getElementById("mainContainer").style.display = "block";
  } catch (err) {
    document.getElementById("loadingContainer").innerHTML = `<div class="card error-box">${err.message}</div>`;
  }
})();
