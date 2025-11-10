$(document).ready(function () {
  // Fungsi utama autocomplete untuk tiap level
  function setupSearch(inputId, listId, level) {
    const $input = $(inputId);
    const $list = $(listId);

    $input.on("keyup", function () {
      const q = $(this).val().trim();
      if (q.length < 2) {
        $list.empty();
        return;
      }

      $.getJSON("/search", { q: q, level: level }, function (data) {
        $list.empty();
        if (data.length === 0) {
          $list.append('<li class="list-group-item text-muted">Tidak ada hasil</li>');
          return;
        }

        data.forEach((item) => {
          let text = "";
          switch (level) {
            case "provinsi":
              text = `[${padCode(item.kode_provinsi, 2)}] ${item.nama_provinsi}`;
              break;
            case "kabupaten":
              text = `[${padCode(item.kode_kabupaten_kota, 2)}] ${item.nama_kabupaten_kota} — [${padCode(item.kode_provinsi, 2)}] ${item.nama_provinsi}`;
              break;
            case "kecamatan":
              text = `[${padCode(item.kode_kecamatan, 3)}] ${item.nama_kecamatan} — [${padCode(item.kode_kabupaten_kota, 2)}] ${item.nama_kabupaten_kota}, [${padCode(item.kode_provinsi, 2)}] ${item.nama_provinsi}`;
              break;
            case "desa":
              text = `[${padCode(item.kode_desa_kelurahan, 3)}] ${item.nama_desa_kelurahan} — [${padCode(item.kode_kecamatan, 3)}] ${item.nama_kecamatan}, [${padCode(item.kode_kabupaten_kota, 2)}] ${item.nama_kabupaten_kota}, [${padCode(item.kode_provinsi, 2)}] ${item.nama_provinsi}`;
              break;
          }

          const encoded = encodeURIComponent(JSON.stringify(item));
          $list.append(
            `<li class="list-group-item list-item" data-item='${encoded}'>${text}</li>`
          );
        });
      });
    });

    // Klik hasil autocomplete
    $list.on("click", ".list-item", function () {
      const item = JSON.parse(decodeURIComponent($(this).attr("data-item")));

      // Isi hasil hierarki lengkap
      $("#prov").text(item.nama_provinsi || "-");
      $("#kab").text(item.nama_kabupaten_kota || "-");
      $("#kec").text(item.nama_kecamatan || "-");
      $("#desa").text(item.nama_desa_kelurahan || "-");

      // Isi kode
      $("#kode-prov").text(item.kode_provinsi || "-");
      $("#kode-kab").text(item.kode_kabupaten_kota || "-");
      $("#kode-kec").text(item.kode_kecamatan || "-");
      $("#kode-desa").text(item.kode_desa_kelurahan || "-");

      // Simpan ke tombol copy
      $("#btn-copy").data("kode", {
        prov: item.kode_provinsi,
        kab: item.kode_kabupaten_kota,
        kec: item.kode_kecamatan,
        desa: item.kode_desa_kelurahan,
      });

      $("#hasil").slideDown(200);
      $list.empty();
      $input.val(item.nama || "");
    });
  }

  // Format kode dengan leading zero
  function padCode(code, length) {
    code = String(code || "");
    while (code.length < length) code = "0" + code;
    return code;
  }

  // Tombol copy ke clipboard
  $("#btn-copy").on("click", function () {
    const kode = $(this).data("kode");
    if (!kode) {
      $("#copy-success").hide();
      alert("Pilih dulu data yang ingin disalin.");
      return;
    }

    // Tentukan format kode berdasarkan data yang tersedia (hindari kode default seperti "000")
    let kodeArray = [];

    // Periksa elemen kode di UI — jika bukan "-" maka sertakan
    const kodeProvText = $("#kode-prov").text().trim();
    const kodeKabText = $("#kode-kab").text().trim();
    const kodeKecText = $("#kode-kec").text().trim();
    const kodeDesaText = $("#kode-desa").text().trim();

    if (kodeProvText !== "-" && kodeProvText !== "") kodeArray.push(padCode(kode.prov, 2));
    if (kodeKabText !== "-" && kodeKabText !== "") kodeArray.push(padCode(kode.kab, 2));
    if (kodeKecText !== "-" && kodeKecText !== "") kodeArray.push(padCode(kode.kec, 3));
    if (kodeDesaText !== "-" && kodeDesaText !== "") kodeArray.push(padCode(kode.desa, 3));

    const hasil = kodeArray.join("\t");

    navigator.clipboard.writeText(hasil).then(() => {
      $("#copy-success").slideDown(200);
      setTimeout(() => {
        $("#copy-success").slideUp(200);
      }, 2000); // Pesan akan hilang setelah 2 detik
    }).catch(() => {
      // Jika gagal (mis. permission), sembunyikan pesan sukses
      $("#copy-success").hide();
    });
  });

  // Jalankan untuk semua level input
  setupSearch("#search-provinsi", "#list-provinsi", "provinsi");
  setupSearch("#search-kabupaten", "#list-kabupaten", "kabupaten");
  setupSearch("#search-kecamatan", "#list-kecamatan", "kecamatan");
  setupSearch("#search-desa", "#list-desa", "desa");
});

