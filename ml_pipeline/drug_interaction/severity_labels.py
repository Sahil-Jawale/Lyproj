"""Severity labels for drug interactions."""
from enum import Enum

class Severity(str, Enum):
    NONE = "none"
    MINOR = "minor"
    MODERATE = "moderate"
    SEVERE = "severe"
    CONTRAINDICATED = "contraindicated"

    @property
    def color(self):
        return {"none":"#22c55e","minor":"#a3e635","moderate":"#f59e0b",
                "severe":"#ef4444","contraindicated":"#dc2626"}[self.value]

    @property
    def description(self):
        return {
            "none": "No known interaction",
            "minor": "Minor interaction — monitor patient",
            "moderate": "Moderate interaction — may need dose adjustment",
            "severe": "Severe interaction — avoid combination if possible",
            "contraindicated": "Contraindicated — do NOT use together",
        }[self.value]
