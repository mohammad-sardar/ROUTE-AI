from __future__ import annotations

from app.models.schemas import AssistantResponse, CleanRequest, DatasetProfile, ManualOperations


class AssistantPlanner:
    def build_plan(self, prompt: str, profile: DatasetProfile) -> AssistantResponse:
        lowered = prompt.lower()
        manual = ManualOperations()
        reasons: list[str] = []

        possible_ids = [column.name for column in profile.columns if column.possible_id]
        high_missing = [column.name for column in profile.columns if column.missing_ratio >= 0.8]

        if "id" in lowered or "identifier" in lowered:
            manual.drop_columns.extend(possible_ids)
            if possible_ids:
                reasons.append(f"Flagged likely identifier columns: {', '.join(possible_ids)}.")

        if "missing" in lowered or "null" in lowered or "empty" in lowered:
            manual.fill_numeric_strategy = "median"
            manual.fill_text_strategy = "mode"
            reasons.append("Suggested filling missing values using median for numeric data and mode for text data.")

        if "duplicate" in lowered:
            manual.remove_duplicates = True
            reasons.append("Duplicate row removal is enabled.")

        if "outlier" in lowered:
            manual.remove_outliers = True
            reasons.append("Outlier removal was enabled using the default z-score threshold.")

        if "encode" in lowered or "categorical" in lowered:
            manual.encode_categoricals = True
            reasons.append("Categorical encoding is enabled for model-ready data.")

        if "scale" in lowered or "normalize" in lowered or "standardize" in lowered:
            manual.scale_numeric = True
            reasons.append("Numeric feature scaling is enabled.")

        if "date" in lowered or "datetime" in lowered:
            manual.convert_datetimes = True
            reasons.append("Datetime conversion remains enabled for date-like columns.")

        if not reasons:
            for column in possible_ids:
                if column not in manual.drop_columns:
                    manual.drop_columns.append(column)
            if high_missing:
                reasons.append(f"Columns with very high missing values were detected: {', '.join(high_missing)}.")
            reasons.append("Applied a safe default plan: remove duplicates, keep datetime detection, and prepare missing-value handling.")

        suggested_request = CleanRequest(mode="manual", manual=manual, ai_instructions=prompt)
        return AssistantResponse(
            summary="Generated a structured cleaning plan from the assistant prompt.",
            suggested_request=suggested_request,
            reasons=reasons,
        )
