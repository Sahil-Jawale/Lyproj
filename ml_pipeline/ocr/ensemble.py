"""Ensemble OCR — Multi-model voting for improved accuracy."""
from typing import List, Dict
from .trocr_inference import TrOCRInference, OCRResult
from PIL import Image

class EnsembleOCR:
    def __init__(self, models=None):
        self.models = models or [TrOCRInference()]  # Add more models here

    def predict(self, image: Image.Image) -> OCRResult:
        results = [m.predict(image) for m in self.models]
        if len(results) == 1:
            return results[0]
        # Majority voting by confidence-weighted selection
        best = max(results, key=lambda r: r.confidence)
        return best
