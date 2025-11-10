from flask import Flask, render_template, request, jsonify, send_file
import pandas as pd
import os
import tempfile
import uuid
from werkzeug.utils import secure_filename

app = Flask(__name__)

# ----- sesuaikan nama file CSV jika perlu -----
CSV_PATH = "master_provinsi_kabkot_kecamatan_desa_untuk_magang.csv"

# Load CSV sekali saat startup
df = pd.read_csv(CSV_PATH, dtype=str).fillna('')

# Normalisasi nama kolom — sesuai file yang kamu upload
# Diharapkan kolom: kode_prov, nama_prov, kode_kab, kab_nama, kode_kec, kec_nama, kode_desa, desa_nama
df.columns = [c.strip().lower() for c in df.columns]

EXPECTED = ['kode_prov','nama_prov','kode_kab','kab_nama','kode_kec','kec_nama','kode_desa','desa_nama']
missing = [c for c in EXPECTED if c not in df.columns]
if missing:
    raise RuntimeError(f"Kolom CSV tidak lengkap, hilang: {missing}")

@app.route("/")
def index():
    return render_template("index.html")


@app.route('/upload', methods=['GET', 'POST'])
def upload():
    """Upload an Excel file and show editable table for ETL work.
    GET: render upload form
    POST: accept file, parse with pandas, add code columns if missing, render editor
    """
    if request.method == 'GET':
        return render_template('upload.html')

    f = request.files.get('file')
    if not f:
        return "No file uploaded", 400

    filename = secure_filename(f.filename)
    tmpdir = tempfile.gettempdir()
    uid = uuid.uuid4().hex
    save_path = os.path.join(tmpdir, f"upload_{uid}_{filename}")
    f.save(save_path)

    # read Excel into DataFrame
    try:
        df_uploaded = pd.read_excel(save_path, dtype=str).fillna('')
    except Exception as e:
        return f"Failed to read Excel: {e}", 400

    # ensure code columns exist (use the same keys as frontend expects)
    code_cols = {
        'kode_provinsi': 'kode_provinsi',
        'kode_kabupaten_kota': 'kode_kabupaten_kota',
        'kode_kecamatan': 'kode_kecamatan',
        'kode_desa_kelurahan': 'kode_desa_kelurahan'
    }
    for c in code_cols.values():
        if c not in df_uploaded.columns:
            df_uploaded[c] = ''

    # store temp path mapping so save can find it (simple approach)
    token = uid
    token_path = os.path.join(tmpdir, f"upload_meta_{token}.pkl")
    df_uploaded.to_pickle(token_path)

    # render editor with data and token
    records = df_uploaded.to_dict(orient='records')
    columns = list(df_uploaded.columns)
    return render_template('upload.html', records=records, columns=columns, token=token)


@app.route('/save_excel', methods=['POST'])
def save_excel():
    """Save edited table back to Excel file in temp and return download path/name."""
    data = request.get_json()
    token = data.get('token')
    rows = data.get('rows')
    if not token or rows is None:
        return jsonify({'error': 'missing token or rows'}), 400

    tmpdir = tempfile.gettempdir()
    token_path = os.path.join(tmpdir, f"upload_meta_{token}.pkl")
    if not os.path.exists(token_path):
        return jsonify({'error': 'session expired or invalid token'}), 400

    try:
        df = pd.DataFrame(rows)
        out_name = f"edited_{token}.xlsx"
        out_path = os.path.join(tmpdir, out_name)
        df.to_excel(out_path, index=False)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'token': token, 'filename': out_name})


@app.route('/download/<token>')
def download(token):
    tmpdir = tempfile.gettempdir()
    out_name = f"edited_{token}.xlsx"
    out_path = os.path.join(tmpdir, out_name)
    if not os.path.exists(out_path):
        return "File not found", 404
    # Flask >=2.2 uses download_name instead of attachment_filename
    try:
        return send_file(out_path, as_attachment=True, download_name=out_name)
    except TypeError:
        return send_file(out_path, as_attachment=True, attachment_filename=out_name)

@app.route("/search")
def search():
    """
    Params:
      - q: query text (required, >=1 char)
      - level: one of 'provinsi','kabupaten','kecamatan','desa' (required)
    Returns list of matches (max 50) with full hierarchy and codes.
    """
    q = request.args.get("q", "").strip().lower()
    level = (request.args.get("level") or "").strip().lower()
    if not q or level not in ("provinsi","kabupaten","kecamatan","desa"):
        return jsonify([])

    # choose column to search
    col_map = {
        "provinsi": "nama_prov",
        "kabupaten": "kab_nama",
        "kecamatan": "kec_nama",
        "desa": "desa_nama"
    }
    search_col = col_map[level]

    # Filter dan drop duplicates berdasarkan level
    if level == "provinsi":
        # Untuk provinsi, cukup cari di kolom provinsi dan hilangkan duplikat provinsi
        mask = df[search_col].str.lower().str.contains(q, na=False)
        results_df = df[mask].drop_duplicates(subset=['kode_prov'])[['kode_prov', 'nama_prov']].copy()
    
    elif level == "kabupaten":
        # Untuk kabupaten, cari di kolom kabupaten dan tampilkan dengan provinsinya
        mask = df[search_col].str.lower().str.contains(q, na=False)
        results_df = df[mask].drop_duplicates(subset=['kode_prov', 'kode_kab'])[
            ['kode_prov', 'nama_prov', 'kode_kab', 'kab_nama']
        ].copy()
    
    elif level == "kecamatan":
        # Untuk kecamatan, cari di kolom kecamatan dan tampilkan dengan kab & prov
        mask = df[search_col].str.lower().str.contains(q, na=False)
        results_df = df[mask].drop_duplicates(subset=['kode_prov', 'kode_kab', 'kode_kec'])[
            ['kode_prov', 'nama_prov', 'kode_kab', 'kab_nama', 'kode_kec', 'kec_nama']
        ].copy()
    
    else:  # desa
        # Untuk desa, tampilkan hierarki lengkap
        mask = df[search_col].str.lower().str.contains(q, na=False)
        results_df = df[mask].copy()

    # limit
    results_df = results_df.head(50)

    # prepare JSON sesuai level
    out = []
    for _, r in results_df.iterrows():
        item = {}
        
        # Provinsi selalu ada di semua level
        item["nama_provinsi"] = r["nama_prov"]
        item["kode_provinsi"] = r["kode_prov"]
        
        # Kabupaten hanya ada di level kab, kec, dan desa
        if level in ["kabupaten", "kecamatan", "desa"]:
            item["nama_kabupaten_kota"] = r["kab_nama"]
            item["kode_kabupaten_kota"] = r["kode_kab"]
        
        # Kecamatan hanya ada di level kec dan desa
        if level in ["kecamatan", "desa"]:
            item["nama_kecamatan"] = r["kec_nama"]
            item["kode_kecamatan"] = r["kode_kec"]
        
        # Desa hanya ada di level desa
        if level == "desa":
            item["nama_desa_kelurahan"] = r["desa_nama"]
            item["kode_desa_kelurahan"] = r["kode_desa"]
        
        out.append(item)
    return jsonify(out)

if __name__ == "__main__":
    app.run(debug=True)
