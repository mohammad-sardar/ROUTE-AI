from contextlib import contextmanager
from typing import Any

import numpy as np
import pandas as pd

from app.models.schemas import ColumnProfile, DatasetProfile, DatasetSummary


class DataProfiler:
    def profile_dataset(self, dataframe: pd.DataFrame, file_name: str) -> DatasetProfile:
        columns = [self._profile_column(dataframe, column) for column in dataframe.columns]
        summary = DatasetSummary(
            file_name=file_name,
            rows=int(dataframe.shape[0]),
            columns=int(dataframe.shape[1]),
            missing_cells=int(dataframe.isna().sum().sum()),
            duplicate_rows=int(dataframe.duplicated().sum()),
            numeric_columns=sum(1 for item in columns if item.inferred_type == "numeric"),
            categorical_columns=sum(1 for item in columns if item.inferred_type == "text"),
            datetime_columns=sum(1 for item in columns if item.inferred_type == "datetime"),
            target_candidates=self._target_candidates(columns),
            smart_suggestions=self._build_suggestions(columns),
        )
        return DatasetProfile(summary=summary, columns=columns)

    def preview_rows(self, dataframe: pd.DataFrame) -> list[dict[str, Any]]:
        records = dataframe.replace({np.nan: None}).to_dict(orient="records")
        return [{key: self._serialize_value(value) for key, value in row.items()} for row in records]

    @contextmanager
    def excel_writer(self, buffer):
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            yield writer

    def _profile_column(self, dataframe: pd.DataFrame, column_name: str) -> ColumnProfile:
        series = dataframe[column_name]
        missing_ratio = float(series.isna().mean()) if len(series) else 0.0
        duplicate_count = int(series.duplicated().sum())
        unique_ratio = float(series.nunique(dropna=True) / max(len(series), 1))
        inferred_type = self._infer_type(series)
        possible_id = unique_ratio > 0.95 and missing_ratio < 0.05 and inferred_type in {"numeric", "text"}
        top_values = [
            {"value": self._serialize_value(None if pd.isna(index) else index), "count": int(value)}
            for index, value in series.astype("object").value_counts(dropna=False).head(5).items()
        ]

        numeric_summary = None
        if inferred_type == "numeric":
            numeric_series = pd.to_numeric(series, errors="coerce")
            numeric_summary = {
                "mean": float(numeric_series.mean() or 0.0),
                "std": float(numeric_series.std() or 0.0),
                "min": float(numeric_series.min() or 0.0),
                "max": float(numeric_series.max() or 0.0),
            }

        alerts = []
        if missing_ratio >= 0.8:
            alerts.append("High missing ratio: more than 80% of values are empty.")
        if possible_id:
            alerts.append("This column looks like an identifier and may not help model training.")
        if unique_ratio <= 0.02 and inferred_type == "text":
            alerts.append("Low-cardinality text column: useful candidate for encoding.")

        return ColumnProfile(
            name=column_name,
            inferred_type=inferred_type,
            missing_ratio=round(missing_ratio, 4),
            duplicate_count=duplicate_count,
            unique_ratio=round(unique_ratio, 4),
            possible_id=possible_id,
            distribution_hint=self._distribution_hint(series, inferred_type),
            top_values=top_values,
            numeric_summary=numeric_summary,
            smart_alerts=alerts,
        )

    def _infer_type(self, series: pd.Series) -> str:
        non_null = series.dropna()
        if non_null.empty:
            return "unknown"
        if pd.api.types.is_bool_dtype(series):
            return "boolean"
        if pd.api.types.is_numeric_dtype(series):
            return "numeric"
        if pd.api.types.is_datetime64_any_dtype(series):
            return "datetime"

        datetime_candidate = pd.to_datetime(non_null, errors="coerce", format="mixed")
        if datetime_candidate.notna().mean() > 0.8:
            return "datetime"

        numeric_candidate = pd.to_numeric(non_null, errors="coerce")
        if numeric_candidate.notna().mean() > 0.9:
            return "numeric"

        if non_null.map(type).nunique() > 1:
            return "mixed"
        return "text"

    def _distribution_hint(self, series: pd.Series, inferred_type: str) -> str:
        if inferred_type == "numeric":
            numeric_series = pd.to_numeric(series, errors="coerce").dropna()
            if numeric_series.empty:
                return "No numeric distribution available."
            skew = float(numeric_series.skew() or 0.0)
            if skew > 1:
                return "Right-skewed distribution."
            if skew < -1:
                return "Left-skewed distribution."
            return "Fairly balanced numeric distribution."

        if inferred_type == "text":
            unique_values = series.nunique(dropna=True)
            if unique_values <= 10:
                return "Low-cardinality categorical distribution."
            return "High-cardinality text distribution."

        if inferred_type == "datetime":
            return "Temporal column detected."

        return "Distribution insight is limited for this column."

    def _target_candidates(self, columns: list[ColumnProfile]) -> list[str]:
        candidates = []
        for column in columns:
            if column.possible_id:
                continue
            if column.inferred_type in {"numeric", "text", "boolean"} and column.missing_ratio < 0.4:
                candidates.append(column.name)
        return candidates[:5]

    def _build_suggestions(self, columns: list[ColumnProfile]) -> list[str]:
        suggestions: list[str] = []
        for column in columns:
            if column.possible_id:
                suggestions.append(f"Consider dropping '{column.name}' because it behaves like an ID column.")
            if column.missing_ratio > 0.6:
                suggestions.append(f"'{column.name}' has a high missing ratio; dropping or imputing is recommended.")
            if column.inferred_type == "mixed":
                suggestions.append(f"'{column.name}' has mixed types and should be normalized before modeling.")
        return suggestions[:8]

    def _serialize_value(self, value: Any) -> Any:
        if isinstance(value, (pd.Timestamp, np.datetime64)):
            return str(value)
        return value
