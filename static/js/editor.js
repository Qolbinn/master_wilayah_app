// Editor interactions: keyboard shortcuts, search overlay, and save
$(function(){
  // state for current target cell (row index and column name)
  let currentTarget = null; // {row, col, td}
  let currentLevel = null; // 'provinsi'|'kabupaten'|'kecamatan'|'desa'
  const overlay = $('#search-overlay');
  const input = $('#search-input');
  const results = $('#search-results');

  // Map shortcuts: Ctrl+A=prov, Ctrl+B=kab, Ctrl+C=kec, Ctrl+D=desa
  $(document).on('keydown', function(e){
    if (!e.ctrlKey) return;
    const code = e.key.toLowerCase();
    if (!['a','b','c','d'].includes(code)) return;

    e.preventDefault();
    // we need focused cell (now textareas inside tds)
    let $td = null;
    const $focusedInput = $('textarea.cell-input:focus');
    if ($focusedInput.length) {
      $td = $focusedInput.closest('td');
    } else {
      $td = $('table#editor-table td.selected').first();
    }

    if (!$td || $td.length === 0) {
      alert('Pilih sel pada baris yang ingin Anda isi dahulu');
      return;
    }

    const row = $td.closest('tr').data('row-index');
    const col = $td.data('col');

    currentTarget = {row: row, col: col, td: $td};

    switch(code){
      case 'a': currentLevel = 'provinsi'; break;
      case 'b': currentLevel = 'kabupaten'; break;
      case 'c': currentLevel = 'kecamatan'; break;
      case 'd': currentLevel = 'desa'; break;
    }

    openSearch();
  });

  // clicking a table cell marks it as selected and makes it editable
  $(document).on('click','table#editor-table td', function(){
    const $td = $(this);
    $('table#editor-table td').removeClass('selected');
    $td.addClass('selected');
    
    // If not already editable, make it editable
    if (!$td.find('textarea.cell-input').length) {
      const currentValue = $td.text().trim();
      const col = $td.data('col');
      const $textarea = $('<textarea class="cell-input form-control form-control-sm"></textarea>')
        .attr('data-col', col)
        .val(currentValue);
      $td.empty().append($textarea);
      $textarea.trigger('input'); // Trigger auto-resize
      $textarea.focus();
    }
  });

  function openSearch(){
    results.empty();
    input.val('');
    overlay.show();
    input.focus();
    input.data('level', currentLevel);
  }

  $('#search-close').on('click', function(){ overlay.hide(); });

  // perform search (debounce simple)
  let timer = null;
  input.on('keyup', function(){
    const q = $(this).val().trim();
    const level = $(this).data('level') || currentLevel;
    if (timer) clearTimeout(timer);
    timer = setTimeout(()=>{
      if (!q) { results.empty(); return; }
      $.getJSON('/search',{q:q, level:level}, function(data){
        results.empty();
        if (!data || data.length===0){
          results.append('<li class="list-group-item text-muted">Tidak ada hasil</li>');
          return;
        }
        data.forEach(function(it){
          const label = makeLabel(level,it);
          const $li = $(`<li class="list-group-item result-item">${label}</li>`);
          $li.data('item', it);
          results.append($li);
        });
      });
    }, 250);
  });

  // when user selects a result, fill the row's cells appropriately
  results.on('click','.result-item', function(){
    const it = $(this).data('item');
    // determine row tr
    if (!currentTarget){ alert('Target row not found'); overlay.hide(); return; }
    const $tr = $('tr[data-row-index="'+currentTarget.row+'"]');

    // Only fill codes based on search level
    // If searching for a higher level (e.g. provinsi), only fill that code
    // If searching for a lower level (e.g. desa), fill all parent codes too
    const codeKeys = levelToCodeKeys(currentLevel);
    if (!codeKeys || !codeKeys.length) {
      overlay.hide();
      return;
    }

    // Get the current column order to fill adjacent cells
    const colOrder = getColOrder();
    const startIdx = colOrder.indexOf(currentTarget.col);
    if (startIdx === -1) {
      overlay.hide();
      return;
    }

    // Fill codes horizontally starting from target cell
    for (let i = 0; i < codeKeys.length; i++) {
      const targetCol = colOrder[startIdx + i];
      if (!targetCol) break;
      setCellValue($tr, targetCol, it[codeKeys[i]] || '');
    }

    // If user invoked a specific level, put the CODE of that level into the target column
    // (user requested the returned value be the code, not the name)
    if (currentTarget && currentTarget.col){
      const codeKey = levelToCodeKey(currentLevel);
      if (codeKey){
        // primary behavior: fill horizontally based on level hierarchy when possible
        const codeKeys = levelToCodeKeys(currentLevel);
        const colOrder = getColOrder();
        const startIdx = colOrder.indexOf(currentTarget.col);
        if (startIdx !== -1 && codeKeys && codeKeys.length){
          for (let i=0;i<codeKeys.length;i++){
            const tgtCol = colOrder[startIdx + i];
            if (!tgtCol) break;
            setCellValue($tr, tgtCol, it[codeKeys[i]] || '');
          }
        } else {
          // fallback: write code into the clicked column
          setCellValue($tr, currentTarget.col, it[codeKey] || '');
        }
      }
    }

    overlay.hide();
  });

  function levelToCodeKeys(level){
    switch(level){
      case 'provinsi': return ['kode_provinsi'];
      case 'kabupaten': return ['kode_provinsi','kode_kabupaten_kota'];
      case 'kecamatan': return ['kode_provinsi','kode_kabupaten_kota','kode_kecamatan'];
      case 'desa': return ['kode_provinsi','kode_kabupaten_kota','kode_kecamatan','kode_desa_kelurahan'];
    }
    return [];
  }

  function setCellValue($tr, colName, value){
    const $td = $tr.find('td[data-col="'+colName+'"]');
    if ($td.length){
      let $inp = $td.find('textarea.cell-input');
      if ($inp.length === 0) {
        // If no textarea exists, create one (fallback for compatibility)
        $inp = $('<textarea class="cell-input form-control form-control-sm" />').attr('data-col', colName);
        $td.empty().append($inp);
      }
      $inp.val(value);
      // adjust height after programmatic change
      $inp.each(function(){ 
        this.style.height = 'auto'; 
        this.style.height = (this.scrollHeight) + 'px'; 
      });
      // Ensure input remains enabled and editable
      $inp.prop('disabled', false);
    }
  }

  function levelToNameKey(level){
    switch(level){
      case 'provinsi': return 'nama_provinsi';
      case 'kabupaten': return 'nama_kabupaten_kota';
      case 'kecamatan': return 'nama_kecamatan';
      case 'desa': return 'nama_desa_kelurahan';
    }
    return null;
  }

  function levelToCodeKey(level){
    switch(level){
      case 'provinsi': return 'kode_provinsi';
      case 'kabupaten': return 'kode_kabupaten_kota';
      case 'kecamatan': return 'kode_kecamatan';
      case 'desa': return 'kode_desa_kelurahan';
    }
    return null;
  }

  function makeLabel(level,item){
    // simple label similar to autocomplete
    switch(level){
      case 'provinsi': return `[${pad(item.kode_provinsi,2)}] ${item.nama_provinsi}`;
      case 'kabupaten': return `[${pad(item.kode_kabupaten_kota,2)}] ${item.nama_kabupaten_kota} — [${pad(item.kode_provinsi,2)}] ${item.nama_provinsi}`;
      case 'kecamatan': return `[${pad(item.kode_kecamatan,3)}] ${item.nama_kecamatan} — [${pad(item.kode_kabupaten_kota,2)}] ${item.nama_kabupaten_kota}, [${pad(item.kode_provinsi,2)}] ${item.nama_provinsi}`;
      case 'desa': return `[${pad(item.kode_desa_kelurahan,3)}] ${item.nama_desa_kelurahan} — [${pad(item.kode_kecamatan,3)}] ${item.nama_kecamatan}, [${pad(item.kode_kabupaten_kota,2)}] ${item.nama_kabupaten_kota}, [${pad(item.kode_provinsi,2)}] ${item.nama_provinsi}`;
    }
    return item.nama_provinsi || '';
  }

  function pad(v, len){ v = String(v||''); while(v.length < len) v = '0'+v; return v; }

  // Add column button
  $('#btn-add-column').on('click', function(){
    const name = prompt('Nama kolom baru (tanpa spasi, akan dipakai sebagai header):');
    if (!name) return;
    const col = name.trim().replace(/\s+/g,'_');
    // add header
    $('#editor-table thead tr').append(`<th data-col="${col}">${col}</th>`);
    // add cell to each row
    $('#editor-table tbody tr').each(function(){
      $(this).append(`<td data-col="${col}" class="editable-cell"></td>`);
    });
    // re-enable resizer and drag handlers
    makeColumnsResizable();
    enableColumnDrag();
    attachInputHandlers();
  });

  // Column resizer: append a small handle to each header that lets user drag to resize column width
  function makeColumnsResizable(){
    const table = $('#editor-table');
    table.find('th').each(function(){
      const th = $(this);
      // avoid adding multiple resizers
      if (th.find('.col-resizer').length) return;
      th.css({'position':'relative','overflow':'hidden'});
      const resizer = $('<div class="col-resizer" draggable="false"></div>').css({
        position: 'absolute', top: 0, right: 0, width: '8px', cursor: 'col-resize', userSelect: 'none', height: '100%', 'z-index':20, background: 'transparent'
      });
      th.append(resizer);

      // prevent resizer from being a drag source
      resizer.on('mousedown', function(e){
        e.preventDefault();
        const startX = e.pageX;
        const startWidth = th.outerWidth();
        const colIndex = th.index();

        $(document).on('mousemove.colResize', function(e2){
          const diff = e2.pageX - startX;
          const newWidth = Math.max(30, startWidth + diff);
          th.css('width', newWidth + 'px');
          // set width for each td in the column
          table.find('tbody tr').each(function(){
            $(this).find('td').eq(colIndex).css('width', newWidth + 'px');
          });
        });

        $(document).on('mouseup.colResize', function(){
          $(document).off('.colResize');
        });
      });
    });
  }

  // initial call
  makeColumnsResizable();
  enableColumnDrag();

  // Enable dragging headers to reorder columns
  function enableColumnDrag(){
    const table = $('#editor-table');
    table.find('th').attr('draggable', true);

    table.find('th').off('dragstart dragover dragenter dragleave drop');

    table.find('th').on('dragstart', function(e){
      const srcCol = $(this).data('col');
      // store source column key
      e.originalEvent.dataTransfer.setData('text/col', String(srcCol));
      $(this).addClass('dragging');
    });

    table.find('th').on('dragover', function(e){
      e.preventDefault();
      $(this).addClass('drag-over');
    });

    table.find('th').on('dragleave', function(){
      $(this).removeClass('drag-over');
    });

    table.find('th').on('drop', function(e){
      e.preventDefault();
      // get source and target column keys
      const srcCol = e.originalEvent.dataTransfer.getData('text/col');
      const tgtCol = $(this).data('col');
      if (!srcCol || !tgtCol) return;
      if (srcCol === tgtCol){ table.find('th').removeClass('drag-over dragging'); return; }

      const $ths = table.find('thead tr th');
      const $srcTh = $ths.filter(`[data-col="${srcCol}"]`);
      const $tgtTh = $ths.filter(`[data-col="${tgtCol}"]`);
      if ($srcTh.length === 0 || $tgtTh.length === 0) return;

      const srcIdx = $ths.index($srcTh);
      const tgtIdx = $ths.index($tgtTh);

      if (srcIdx < tgtIdx) {
        $tgtTh.after($srcTh);
      } else {
        $tgtTh.before($srcTh);
      }

      // reorder each row's cells by data-col attribute
      table.find('tbody tr').each(function(){
        const $row = $(this);
        const $srcTd = $row.find(`td[data-col="${srcCol}"]`);
        const $tgtTd = $row.find(`td[data-col="${tgtCol}"]`);
        if ($srcTd.length === 0 || $tgtTd.length === 0) return;
        if (srcIdx < tgtIdx) {
          $tgtTd.after($srcTd);
        } else {
          $tgtTd.before($srcTd);
        }
      });

      // cleanup classes and reattach resizers/drag handlers
      table.find('th').removeClass('drag-over dragging');
      makeColumnsResizable();
      enableColumnDrag();
      attachInputHandlers();
    });
  }

  // Save button posts table contents (reads all rows) to /save_excel
  $('#btn-save').on('click', function(){
    const token = window.UPLOAD_TOKEN || '';
    if (!token){ alert('No session token, cannot save'); return; }
    const rows = [];
    $('#editor-table tbody tr').each(function(){
      const row = {};
      $(this).find('td').each(function(){
        const col = $(this).data('col');
        const $td = $(this);
        const $inp = $td.find('textarea.cell-input');
        // Get value from textarea if it exists, otherwise from td text
        row[col] = ($inp.length ? $inp.val() : $td.text()).trim();
      });
      rows.push(row);
    });

    $.ajax({
      url: '/save_excel',
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({token: token, rows: rows}),
      success: function(resp){
        if (resp && resp.token){
          // trigger download
          window.location = '/download/' + resp.token;
        } else if (resp && resp.error){
          alert('Save failed: ' + resp.error);
        } else {
          alert('Save succeeded but no download available');
        }
      },
      error: function(xhr){ alert('Save error: ' + xhr.responseText); }
    });
  });

  // helpers for input behavior: Enter to move down, and paste to distribute across cells
  function getColOrder(){
    const cols = [];
    $('#editor-table thead tr th').each(function(){ cols.push($(this).data('col')); });
    return cols;
  }

  function attachInputHandlers(){
    // textarea auto-resize on input
    $('#editor-table').off('input', 'textarea.cell-input').on('input', 'textarea.cell-input', function(){
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });

    // when textarea receives focus, mark its td as selected
    $('#editor-table').off('focus', 'textarea.cell-input').on('focus', 'textarea.cell-input', function(){
      $('table#editor-table td').removeClass('selected');
      $(this).closest('td').addClass('selected');
    });

    // Paste: distribute tab/newline separated values across adjacent cells and rows
    $('#editor-table').off('paste', 'textarea.cell-input').on('paste', 'textarea.cell-input', function(e){
      const clipboardData = (e.originalEvent || e).clipboardData;
      const text = clipboardData.getData('text') || '';
      if (!text) return;
      // if no tabs/newlines, allow normal paste
      if (!/[\t\n\r]/.test(text)) return;
      e.preventDefault();
      const startCol = $(this).data('col');
      const startRow = $(this).closest('tr').data('row-index');
      const colOrder = getColOrder();
      const startIdx = colOrder.indexOf(startCol);
      const rows = text.split(/\r\n|\n/);
      let lastFocused = null;
      rows.forEach(function(r, rIdx){
        const cells = r.split('\t');
        cells.forEach(function(cellText, cIdx){
          const targetRowIdx = startRow + rIdx;
          const targetColIdx = startIdx + cIdx;
          const targetCol = colOrder[targetColIdx];
          if (!targetCol) return;
          const $tr = $('tr[data-row-index="'+targetRowIdx+'"]');
          if ($tr.length === 0) return;
          const $td = $tr.find('td[data-col="'+targetCol+'"]');
          const $inp = $td.find('textarea.cell-input');
          if ($inp.length) {
            $inp.val(cellText);
            $inp.each(function(){ this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; });
            lastFocused = $inp;
          } else {
            $td.text(cellText);
          }
        });
      });
      if (lastFocused) lastFocused.focus().select();
    });
    // initialize auto-size for existing textareas
    $('#editor-table textarea.cell-input').each(function(){ this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; });
  }

  // attach handlers initially (for inputs rendered on page load)
  attachInputHandlers();

});
