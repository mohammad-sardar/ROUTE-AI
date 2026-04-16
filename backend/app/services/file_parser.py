from io import BytesIO
from pathlib import Path

import pandas as pd
from fastapi import UploadFile


class DatasetFileParser:
    SUPPORTED_SUFFIXES = {".csv", ".xlsx", ".xls"}
    CSV_ENCODINGS = ("utf-8", "utf-8-sig", "cp1252", "latin1")

    async def parse_upload(self, file: UploadFile) -> pd.DataFrame:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in self.SUPPORTED_SUFFIXES:
            raise ValueError("Only CSV and Excel files are supported")

        content = await file.read()
        if not content:
            raise ValueError("Uploaded file is empty")

        buffer = BytesIO(content)
        if suffix == ".csv":
            dataframe = self._read_csv_with_fallbacks(content)
        else:
            dataframe = pd.read_excel(buffer)

        dataframe.columns = [str(column).strip() for column in dataframe.columns]
        return dataframe

    def _read_csv_with_fallbacks(self, content: bytes) -> pd.DataFrame:
        last_error: Exception | None = None
        for encoding in self.CSV_ENCODINGS:
            try:
                return pd.read_csv(BytesIO(content), encoding=encoding)
            except UnicodeDecodeError as exc:
                last_error = exc

        raise ValueError("Could not read CSV file encoding. Please save the file as UTF-8, CSV, or Excel.") from last_error
