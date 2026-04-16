from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.models.schemas import CleanRequest, WorkflowSummary


class WorkflowStore:
    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = base_dir or Path(__file__).resolve().parents[2] / "storage"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.base_dir / "workflows.json"

    def list_workflows(self) -> list[WorkflowSummary]:
        items = self._read_items()
        return [WorkflowSummary.model_validate(item) for item in items]

    def save_workflow(self, name: str, request: CleanRequest) -> WorkflowSummary:
        items = self._read_items()
        workflow = WorkflowSummary(
            workflow_id=str(uuid.uuid4()),
            name=name.strip(),
            created_at=datetime.now(timezone.utc).isoformat(),
            request=request,
        )
        items.insert(0, workflow.model_dump())
        self.path.write_text(json.dumps(items, indent=2), encoding="utf-8")
        return workflow

    def _read_items(self) -> list[dict]:
        if not self.path.exists():
            return []
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
