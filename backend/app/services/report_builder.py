from __future__ import annotations

from io import BytesIO

from app.models.schemas import CleanResponse


class PdfReportBuilder:
    def build_report(self, response: CleanResponse, dataset_name: str) -> bytes:
        lines = [
            "Smart Data Cleaner Report",
            f"Dataset: {dataset_name}",
            "",
            f"Rows before: {response.profile_before.summary.rows}",
            f"Rows after: {response.profile_after.summary.rows}",
            f"Columns before: {response.profile_before.summary.columns}",
            f"Columns after: {response.profile_after.summary.columns}",
            f"Missing cells before: {response.profile_before.summary.missing_cells}",
            f"Missing cells after: {response.profile_after.summary.missing_cells}",
            "",
            "Applied steps:",
        ]
        lines.extend(f"- {step.name}: {step.details}" for step in response.execution)
        lines.append("")
        lines.append("Smart suggestions after cleaning:")
        lines.extend(f"- {item}" for item in response.profile_after.summary.smart_suggestions[:8])

        return self._simple_pdf(lines)

    def _simple_pdf(self, lines: list[str]) -> bytes:
        def esc(text: str) -> str:
            return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

        y = 780
        stream_lines = ["BT", "/F1 11 Tf", "50 800 Td", "14 TL"]
        for line in lines:
            stream_lines.append(f"({esc(line[:110])}) Tj")
            stream_lines.append("T*")
            y -= 14
            if y < 70:
                break
        stream_lines.append("ET")
        stream = "\n".join(stream_lines).encode("latin-1", errors="replace")

        objects = [
            b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
            b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
            b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
            b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
            f"5 0 obj << /Length {len(stream)} >> stream\n".encode("latin-1") + stream + b"\nendstream endobj",
        ]

        buffer = BytesIO()
        buffer.write(b"%PDF-1.4\n")
        offsets = [0]
        for obj in objects:
            offsets.append(buffer.tell())
            buffer.write(obj)
            buffer.write(b"\n")
        xref_start = buffer.tell()
        buffer.write(f"xref\n0 {len(offsets)}\n".encode("latin-1"))
        buffer.write(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            buffer.write(f"{offset:010d} 00000 n \n".encode("latin-1"))
        buffer.write(
            f"trailer << /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF".encode("latin-1")
        )
        return buffer.getvalue()
