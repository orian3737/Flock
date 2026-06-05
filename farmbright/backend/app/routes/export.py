from datetime import date

from flask import Blueprint, Response, jsonify, request, send_file
from flask_cors import CORS

from app.services.export_service import generate_csv, generate_pdf, generate_xlsx, preview_rows
from app.utils.cors import allowed_origins


export_bp = Blueprint("export", __name__, url_prefix="/api/export")
CORS(export_bp, origins=allowed_origins())


@export_bp.post("/generate")
def generate_export():
    data = request.get_json(silent=True) or {}
    user_id = int(data["user_id"])
    file_format = data.get("format", "csv").lower()
    report_type = data.get("report_type", "feeding_log")
    flock_ids = data.get("flock_ids") or []
    start_date = _parse_date(data.get("start_date")) or date.today()
    end_date = _parse_date(data.get("end_date")) or date.today()

    if file_format == "csv":
        output = generate_csv(user_id, report_type, flock_ids, start_date, end_date)
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename={_filename(report_type, 'csv')}"},
        )
    if file_format == "pdf":
        output = generate_pdf(user_id, report_type, flock_ids, start_date, end_date)
        return send_file(
            output,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=_filename(report_type, "pdf"),
        )
    if file_format == "xlsx":
        output = generate_xlsx(user_id, flock_ids, start_date, end_date)
        return send_file(
            output,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=_filename("Flock_full", "xlsx"),
        )

    return jsonify({"message": "Unsupported export format."}), 400


@export_bp.get("/preview")
def preview_export():
    user_id = int(request.args["user_id"])
    report_type = request.args.get("report_type", "feeding_log")
    start_date = _parse_date(request.args.get("start_date")) or date.today()
    end_date = _parse_date(request.args.get("end_date")) or date.today()
    rows = preview_rows(user_id, report_type, [], start_date, end_date, limit=10)
    return jsonify({"headers": rows[0] if rows else [], "rows": rows[1:] if len(rows) > 1 else []})


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _filename(report_type, extension):
    return f"Flock_{report_type}_{date.today().isoformat()}.{extension}"
