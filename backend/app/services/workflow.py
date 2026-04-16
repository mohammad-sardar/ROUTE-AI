from dataclasses import dataclass, field
from typing import Any


@dataclass
class WorkflowStep:
    action: str
    config: dict[str, Any]


@dataclass
class WorkflowDefinition:
    name: str
    steps: list[WorkflowStep] = field(default_factory=list)

    def add_step(self, action: str, config: dict[str, Any]) -> None:
        self.steps.append(WorkflowStep(action=action, config=config))
