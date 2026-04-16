from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

from app.models.schemas import CleanRequest, ExecutionStep, FilterRule
from app.services.profiler import DataProfiler


class DataCleaner:
    def __init__(self) -> None:
        self.profiler = DataProfiler()
        self.low_cardinality_limit = 20
        self.low_cardinality_ratio = 0.2
        self.missing_markers = {
            "",
            " ",
            "na",
            "n/a",
            "null",
            "none",
            "nan",
            "nat",
            "<na>",
            "missing",
        }

    def run(self, dataframe: pd.DataFrame, request: CleanRequest) -> tuple[pd.DataFrame, list[ExecutionStep]]:
        working = self._normalize_raw_values(dataframe.copy())
        steps: list[ExecutionStep] = []

        if request.mode == "auto":
            working, steps = self._auto_clean(working)
        else:
            working, steps = self._manual_clean(working, request)

        working, cleanup_steps = self._finalize_output(working)
        steps.extend(cleanup_steps)
        return working.replace({np.nan: None}), steps

    def _auto_clean(self, dataframe: pd.DataFrame) -> tuple[pd.DataFrame, list[ExecutionStep]]:
        steps: list[ExecutionStep] = []
        dataframe, coercion_steps = self._coerce_semantic_types(dataframe)
        steps.extend(coercion_steps)
        profile = self.profiler.profile_dataset(dataframe, "auto")
        drop_candidates = [column.name for column in profile.columns if column.possible_id or column.missing_ratio >= 0.85]
        if drop_candidates:
            dataframe = dataframe.drop(columns=drop_candidates, errors="ignore")
            steps.append(ExecutionStep(name="drop_columns", details=f"Dropped columns: {', '.join(drop_candidates)}"))

        duplicate_rows = int(dataframe.duplicated().sum())
        if duplicate_rows:
            dataframe = dataframe.drop_duplicates()
            steps.append(ExecutionStep(name="remove_duplicates", details=f"Removed {duplicate_rows} duplicate rows."))

        dataframe, fill_steps = self._apply_missing_cleanup(
            dataframe,
            numeric_strategy="median",
            text_strategy="mode",
            text_constant="unknown",
            step_prefix="auto",
        )
        steps.extend(fill_steps)

        dataframe, datetime_steps = self._convert_datetime_like_columns(dataframe)
        steps.extend(datetime_steps)
        dataframe, post_datetime_fill_steps = self._apply_missing_cleanup(
            dataframe,
            numeric_strategy="median",
            text_strategy="mode",
            text_constant="unknown",
            step_prefix="post_datetime_auto",
        )
        steps.extend(post_datetime_fill_steps)
        dataframe, duplicate_steps = self._deduplicate(dataframe, "remove_duplicates_final")
        steps.extend(duplicate_steps)
        return dataframe, steps

    def _manual_clean(self, dataframe: pd.DataFrame, request: CleanRequest) -> tuple[pd.DataFrame, list[ExecutionStep]]:
        manual = request.manual
        steps: list[ExecutionStep] = []
        encoded_output_columns: list[str] = []

        dataframe, coercion_steps = self._coerce_semantic_types(dataframe, target_column=manual.target_column)
        steps.extend(coercion_steps)

        if manual.drop_columns:
            dataframe = dataframe.drop(columns=manual.drop_columns, errors="ignore")
            steps.append(ExecutionStep(name="drop_columns", details=f"Dropped columns: {', '.join(manual.drop_columns)}"))

        if manual.remove_duplicates:
            dataframe, duplicate_steps = self._deduplicate(dataframe, "remove_duplicates")
            steps.extend(duplicate_steps)

        if manual.drop_missing_rows_threshold is not None:
            min_non_missing = int(np.ceil(dataframe.shape[1] * (1 - manual.drop_missing_rows_threshold)))
            before_rows = len(dataframe)
            dataframe = dataframe.dropna(thresh=min_non_missing)
            steps.append(ExecutionStep(name="drop_sparse_rows", details=f"Removed {before_rows - len(dataframe)} sparse rows."))

        numeric_columns = dataframe.select_dtypes(include=["number"]).columns.tolist()
        text_columns = dataframe.select_dtypes(include=["object", "string"]).columns.tolist()

        if manual.fill_numeric_strategy != "none":
            dataframe, fill_steps = self._apply_missing_cleanup(
                dataframe,
                numeric_strategy=manual.fill_numeric_strategy,
                text_strategy="none",
                text_constant=manual.text_constant,
                target_column=manual.target_column,
                step_prefix="manual_numeric",
            )
            steps.extend(fill_steps)

        if manual.fill_text_strategy != "none":
            dataframe, fill_steps = self._apply_missing_cleanup(
                dataframe,
                numeric_strategy="none",
                text_strategy=manual.fill_text_strategy,
                text_constant=manual.text_constant,
                target_column=manual.target_column,
                step_prefix="manual_text",
            )
            steps.extend(fill_steps)

        if manual.convert_datetimes:
            dataframe, datetime_steps = self._convert_datetime_like_columns(dataframe, target_column=manual.target_column)
            steps.extend(datetime_steps)
            dataframe, fill_steps = self._apply_missing_cleanup(
                dataframe,
                numeric_strategy=manual.fill_numeric_strategy,
                text_strategy=manual.fill_text_strategy,
                text_constant=manual.text_constant,
                target_column=manual.target_column,
                step_prefix="post_datetime_manual",
            )
            steps.extend(fill_steps)

        if manual.filter_rules:
            before_rows = len(dataframe)
            dataframe = self._apply_filters(dataframe, manual.filter_rules)
            steps.append(ExecutionStep(name="filter_rows", details=f"Filtered {before_rows - len(dataframe)} rows using manual rules."))

        if manual.remove_outliers and numeric_columns:
            before_rows = len(dataframe)
            dataframe = self._remove_outliers(dataframe, numeric_columns, manual.outlier_zscore_threshold)
            steps.append(ExecutionStep(name="remove_outliers", details=f"Removed {before_rows - len(dataframe)} rows outside z-score threshold."))

        if manual.encode_categoricals:
            target = manual.target_column
            encode_cols = [column for column in dataframe.select_dtypes(include=["object", "string"]).columns if column != target]
            dataframe, encoded_output_columns, encoding_details = self._encode_categoricals(dataframe, encode_cols)
            if encoding_details:
                steps.append(ExecutionStep(name="encode_categoricals", details=encoding_details))

        if manual.scale_numeric:
            scale_cols = [
                column
                for column in dataframe.select_dtypes(include=["number"]).columns
                if column != manual.target_column and column not in encoded_output_columns
            ]
            if scale_cols:
                scaler = StandardScaler()
                dataframe[scale_cols] = scaler.fit_transform(dataframe[scale_cols])
                steps.append(ExecutionStep(name="scale_numeric", details=f"Scaled columns: {', '.join(scale_cols)}"))

        if manual.remove_duplicates:
            dataframe, duplicate_steps = self._deduplicate(dataframe, "remove_duplicates_final")
            steps.extend(duplicate_steps)

        dataframe, residual_steps = self._apply_missing_cleanup(
            dataframe,
            numeric_strategy=manual.fill_numeric_strategy,
            text_strategy=manual.fill_text_strategy,
            text_constant=manual.text_constant,
            target_column=manual.target_column,
            step_prefix="residual_manual",
        )
        steps.extend(residual_steps)

        return dataframe, steps

    def _resolve_numeric_fill(self, series: pd.Series, strategy: str) -> float:
        numeric_series = pd.to_numeric(series, errors="coerce")
        if strategy == "mean":
            return float(numeric_series.mean() or 0.0)
        if strategy == "zero":
            return 0.0
        return float(numeric_series.median() or 0.0)

    def _normalize_raw_values(self, dataframe: pd.DataFrame) -> pd.DataFrame:
        normalized = dataframe.replace(r"^\s*$", np.nan, regex=True)
        normalized = normalized.replace([np.inf, -np.inf], np.nan)
        for column in normalized.select_dtypes(include=["object", "string"]).columns:
            normalized[column] = normalized[column].map(self._normalize_textual_missing_marker)
        return normalized

    def _normalize_textual_missing_marker(self, value):
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        if stripped.lower() in self.missing_markers:
            return np.nan
        return stripped

    def _finalize_output(self, dataframe: pd.DataFrame) -> tuple[pd.DataFrame, list[ExecutionStep]]:
        steps: list[ExecutionStep] = []

        before_rows = len(dataframe)
        dataframe = dataframe.dropna(how="all")
        if before_rows != len(dataframe):
            steps.append(ExecutionStep(name="drop_empty_rows", details=f"Removed {before_rows - len(dataframe)} fully empty rows."))

        empty_columns = [column for column in dataframe.columns if dataframe[column].isna().all()]
        if empty_columns:
            dataframe = dataframe.drop(columns=empty_columns, errors="ignore")
            steps.append(ExecutionStep(name="drop_empty_columns", details=f"Dropped empty columns: {', '.join(empty_columns)}"))

        bool_columns = dataframe.select_dtypes(include=["bool"]).columns.tolist()
        if bool_columns:
            dataframe[bool_columns] = dataframe[bool_columns].astype(int)
            steps.append(ExecutionStep(name="normalize_boolean_columns", details=f"Converted boolean columns to 0/1: {', '.join(bool_columns)}"))

        return dataframe, steps

    def _coerce_semantic_types(
        self,
        dataframe: pd.DataFrame,
        target_column: str | None = None,
    ) -> tuple[pd.DataFrame, list[ExecutionStep]]:
        converted_numeric: list[str] = []

        for column in dataframe.select_dtypes(include=["object", "string"]).columns:
            non_null = dataframe[column].dropna()
            if non_null.empty:
                continue
            numeric_candidate = pd.to_numeric(non_null, errors="coerce")
            if numeric_candidate.notna().mean() >= 0.9:
                dataframe[column] = pd.to_numeric(dataframe[column], errors="coerce")
                converted_numeric.append(column)

        if not converted_numeric:
            return dataframe, []

        return dataframe, [
            ExecutionStep(
                name="coerce_numeric_like_columns",
                details=f"Converted numeric-like text columns: {', '.join(converted_numeric)}",
            )
        ]

    def _convert_datetime_like_columns(
        self,
        dataframe: pd.DataFrame,
        target_column: str | None = None,
    ) -> tuple[pd.DataFrame, list[ExecutionStep]]:
        converted: list[str] = []

        for column in dataframe.select_dtypes(include=["object", "string"]).columns:
            non_null = dataframe[column].dropna()
            if non_null.empty:
                continue
            parsed_non_null = pd.to_datetime(non_null, errors="coerce", format="mixed")
            if parsed_non_null.notna().mean() > 0.8:
                dataframe[column] = pd.to_datetime(dataframe[column], errors="coerce", format="mixed")
                converted.append(column)

        if not converted:
            return dataframe, []

        return dataframe, [
            ExecutionStep(name="convert_datetimes", details=f"Converted to datetime: {', '.join(converted)}")
        ]

    def _apply_missing_cleanup(
        self,
        dataframe: pd.DataFrame,
        numeric_strategy: str,
        text_strategy: str,
        text_constant: str,
        target_column: str | None = None,
        step_prefix: str = "missing_cleanup",
    ) -> tuple[pd.DataFrame, list[ExecutionStep]]:
        steps: list[ExecutionStep] = []

        numeric_columns = dataframe.select_dtypes(include=["number"]).columns.tolist()
        if numeric_strategy != "none":
            filled_numeric: list[str] = []
            for column in numeric_columns:
                if dataframe[column].isna().any():
                    dataframe[column] = dataframe[column].fillna(
                        self._resolve_numeric_fill(dataframe[column], numeric_strategy)
                    )
                    filled_numeric.append(column)
            if filled_numeric:
                steps.append(
                    ExecutionStep(
                        name=f"{step_prefix}_numeric",
                        details=f"Applied {numeric_strategy} strategy to numeric columns: {', '.join(filled_numeric)}",
                    )
                )

        datetime_columns = dataframe.select_dtypes(include=["datetime", "datetimetz"]).columns.tolist()
        filled_datetime: list[str] = []
        for column in datetime_columns:
            if dataframe[column].isna().any():
                fill_value = self._resolve_datetime_fill(dataframe[column])
                if fill_value is not None:
                    dataframe[column] = dataframe[column].fillna(fill_value)
                    filled_datetime.append(column)
        if filled_datetime:
            steps.append(
                ExecutionStep(
                    name=f"{step_prefix}_datetime",
                    details=f"Filled datetime missing values in: {', '.join(filled_datetime)}",
                )
            )

        text_columns = dataframe.select_dtypes(include=["object", "string"]).columns.tolist()
        if text_strategy != "none":
            filled_text: list[str] = []
            for column in text_columns:
                if dataframe[column].isna().any():
                    fill_value = self._resolve_text_fill(dataframe[column], text_strategy, text_constant)
                    dataframe[column] = dataframe[column].fillna(fill_value)
                    filled_text.append(column)
            if filled_text:
                steps.append(
                    ExecutionStep(
                        name=f"{step_prefix}_text",
                        details=f"Applied {text_strategy} strategy to text columns: {', '.join(filled_text)}",
                    )
                )

        return dataframe, steps

    def _resolve_text_fill(self, series: pd.Series, strategy: str, text_constant: str) -> str:
        if strategy == "constant":
            return text_constant
        mode = series.mode(dropna=True)
        if not mode.empty:
            return str(mode.iloc[0])
        return text_constant

    def _resolve_datetime_fill(self, series: pd.Series):
        valid = series.dropna()
        if valid.empty:
            return None
        mode = valid.mode(dropna=True)
        if not mode.empty:
            return mode.iloc[0]
        numeric_view = valid.view("int64")
        return pd.to_datetime(int(np.median(numeric_view)))

    def _encode_categoricals(
        self,
        dataframe: pd.DataFrame,
        encode_cols: list[str],
    ) -> tuple[pd.DataFrame, list[str], str]:
        if not encode_cols:
            return dataframe, [], "No text columns available for encoding."

        encoded_output_columns: list[str] = []
        low_cardinality_cols: list[str] = []
        high_cardinality_cols: list[str] = []

        for column in encode_cols:
            unique_count = dataframe[column].nunique(dropna=True)
            unique_ratio = unique_count / max(len(dataframe), 1)
            if unique_count <= self.low_cardinality_limit and unique_ratio <= self.low_cardinality_ratio:
                low_cardinality_cols.append(column)
            else:
                high_cardinality_cols.append(column)

        if low_cardinality_cols:
            dataframe = pd.get_dummies(dataframe, columns=low_cardinality_cols, drop_first=False, dtype=int)
            generated_low_cardinality = [
                column_name
                for column_name in dataframe.columns
                if any(column_name.startswith(f"{source}_") for source in low_cardinality_cols)
            ]
            encoded_output_columns.extend(generated_low_cardinality)

        for column in high_cardinality_cols:
            codes, _ = pd.factorize(dataframe[column], sort=True)
            dataframe[column] = codes.astype(int)
            encoded_output_columns.append(column)

        detail_parts: list[str] = []
        if low_cardinality_cols:
            detail_parts.append(f"One-hot encoded: {', '.join(low_cardinality_cols)}")
        if high_cardinality_cols:
            detail_parts.append(f"Label encoded for speed: {', '.join(high_cardinality_cols)}")

        return dataframe, encoded_output_columns, ". ".join(detail_parts)

    def _deduplicate(self, dataframe: pd.DataFrame, step_name: str) -> tuple[pd.DataFrame, list[ExecutionStep]]:
        duplicate_rows = int(dataframe.duplicated().sum())
        if not duplicate_rows:
            return dataframe, []
        dataframe = dataframe.drop_duplicates()
        return dataframe, [ExecutionStep(name=step_name, details=f"Removed {duplicate_rows} duplicate rows.")]

    def _apply_filters(self, dataframe: pd.DataFrame, rules: list[FilterRule]) -> pd.DataFrame:
        filtered = dataframe
        for rule in rules:
            column = rule.column
            operator = rule.operator
            value = rule.value
            if column not in filtered.columns:
                continue
            series = filtered[column]
            if operator == "equals":
                if pd.api.types.is_numeric_dtype(series):
                    coerced_value = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
                    filtered = filtered[series == coerced_value]
                else:
                    filtered = filtered[series.astype(str) == str(value)]
            elif operator == "not_equals":
                if pd.api.types.is_numeric_dtype(series):
                    coerced_value = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
                    filtered = filtered[series != coerced_value]
                else:
                    filtered = filtered[series.astype(str) != str(value)]
            elif operator == "greater_than":
                numeric_series = pd.to_numeric(series, errors="coerce")
                filtered = filtered[numeric_series > float(value)]
            elif operator == "less_than":
                numeric_series = pd.to_numeric(series, errors="coerce")
                filtered = filtered[numeric_series < float(value)]
            elif operator == "contains":
                filtered = filtered[series.astype(str).str.contains(str(value), na=False)]
        return filtered.copy()

    def _remove_outliers(self, dataframe: pd.DataFrame, numeric_columns: list[str], threshold: float) -> pd.DataFrame:
        numeric_frame = dataframe[numeric_columns].apply(pd.to_numeric, errors="coerce")
        zscores = (numeric_frame - numeric_frame.mean()) / numeric_frame.std(ddof=0).replace(0, np.nan)
        mask = (zscores.abs() <= threshold) | zscores.isna()
        return dataframe[mask.all(axis=1)].copy()
