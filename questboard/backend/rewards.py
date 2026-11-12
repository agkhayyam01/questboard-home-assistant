"""Read-only reward source boundary. No Home Assistant client is configured."""

from dataclasses import dataclass
import re
from typing import Iterable, Protocol


@dataclass(frozen=True)
class RewardEvent:
    source: str
    event_id: str
    profile_id: str
    task_kind: str
    task_name: str = ""
    tags: tuple[str, ...] = ()


class RewardSource(Protocol):
    """A future adapter may read completed events, but never changes HA."""

    def read_events(self) -> Iterable[RewardEvent]: ...


_MEDICATION = re.compile(
    r"\b(?:meds?|medications?|medicines?|pills?|prescriptions?|dosage|doses?)\b",
    re.IGNORECASE,
)


def is_rewardable(event: RewardEvent) -> bool:
    # Check all available task metadata, not just a single source-specific flag.
    return not any(
        _MEDICATION.search(value.replace("_", " ").replace("-", " "))
        for value in (event.task_kind, event.task_name, *event.tags)
    )
