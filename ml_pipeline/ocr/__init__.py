"""
MedScript OCR Module
Handles TrOCR fine-tuning, inference, post-processing and ensemble methods.
"""

from .trocr_inference import TrOCRInference
from .postprocess_ocr import PostProcessor

__all__ = ['TrOCRInference', 'PostProcessor']
