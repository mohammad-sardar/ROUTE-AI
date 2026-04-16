from typing import Any, Literal

from pydantic import BaseModel, Field


class ColumnProfile(BaseModel):
    name: str
    inferred_type: Literal["numeric", "text", "datetime", "boolean", "mixed", "unknown"]
    missing_ratio: float
    duplicate_count: int
    unique_ratio: float
    possible_id: bool
    distribution_hint: str
    top_values: list[dict[str, Any]]
    numeric_summary: dict[str, float] | None = None
    smart_alerts: list[str] = Field(default_factory=list)


class DatasetSummary(BaseModel):
    file_name: str
    rows: int
    columns: int
    missing_cells: int
    duplicate_rows: int
    numeric_columns: int
    categorical_columns: int
    datetime_columns: int
    target_candidates: list[str]
    smart_suggestions: list[str]


class DatasetProfile(BaseModel):
    summary: DatasetSummary
    columns: list[ColumnProfile]


class FilterRule(BaseModel):
    column: str
    operator: Literal["equals", "not_equals", "greater_than", "less_than", "contains"] = "equals"
    value: Any


class ManualOperations(BaseModel):
    drop_columns: list[str] = Field(default_factory=list)
    target_column: str | None = None
    remove_duplicates: bool = True
    drop_missing_rows_threshold: float | None = None
    fill_numeric_strategy: Literal["mean", "median", "zero", "none"] = "median"
    fill_text_strategy: Literal["mode", "constant", "none"] = "mode"
    text_constant: str = "unknown"
    convert_datetimes: bool = True
    encode_categoricals: bool = False
    remove_outliers: bool = False
    outlier_zscore_threshold: float = 3.0
    scale_numeric: bool = False
    filter_rules: list[FilterRule] = Field(default_factory=list)


class CleanRequest(BaseModel):
    mode: Literal["auto", "manual"] = "auto"
    manual: ManualOperations = Field(default_factory=ManualOperations)
    ai_instructions: str | None = None


class ExecutionStep(BaseModel):
    name: str
    details: str


class DatasetResponse(BaseModel):
    profile: DatasetProfile
    preview_before: list[dict[str, Any]]


class CleanResponse(BaseModel):
    profile_before: DatasetProfile
    profile_after: DatasetProfile
    preview_before: list[dict[str, Any]]
    preview_after: list[dict[str, Any]]
    execution: list[ExecutionStep]


class WorkflowCreateRequest(BaseModel):
    name: str
    request: CleanRequest


class WorkflowSummary(BaseModel):
    workflow_id: str
    name: str
    created_at: str
    request: CleanRequest


class WorkflowListResponse(BaseModel):
    items: list[WorkflowSummary]
