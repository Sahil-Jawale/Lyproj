"""
MedScript — ML Service Client
HTTP client to call the ML serving endpoints.
Falls back to local import if the ML service is not available.
"""
import httpx
import io
from typing import Dict, List, Optional
from PIL import Image


class MLClient:
    """Client for the ML model serving microservice."""

    def __init__(self, base_url: str = "http://localhost:8001", timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._local_fallback = None

    async def health_check(self) -> Dict:
        """Check if ML service is healthy."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/health")
                resp.raise_for_status()
                return resp.json()
        except Exception:
            return {"status": "unavailable", "fallback": "local"}

    async def run_ocr(self, image_bytes: bytes, filename: str = "image.jpg") -> Dict:
        """
        Send an image to the ML service for OCR processing.
        Falls back to local inference if service is unavailable.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                files = {"image": (filename, image_bytes, "image/jpeg")}
                resp = await client.post(f"{self.base_url}/ocr", files=files)
                resp.raise_for_status()
                return resp.json()
        except Exception:
            return await self._fallback_ocr(image_bytes)

    async def check_interactions(self, medicines: List[str]) -> Dict:
        """
        Check drug interactions via ML service.
        Falls back to local knowledge graph if service is unavailable.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/check-interactions",
                    json={"medicines": medicines}
                )
                resp.raise_for_status()
                return resp.json()
        except Exception:
            return self._fallback_interactions(medicines)

    async def _fallback_ocr(self, image_bytes: bytes) -> Dict:
        """Use local TrOCR inference as fallback."""
        if self._local_fallback is None:
            self._init_local()
        img = Image.open(io.BytesIO(image_bytes))
        result = self._local_fallback["ocr"].predict_prescription(img)
        result["medicines"] = self._local_fallback["post"].process_ocr_output(
            result.get("medicines", [])
        )
        return result

    def _fallback_interactions(self, medicines: List[str]) -> Dict:
        """Use local interaction checker as fallback."""
        if self._local_fallback is None:
            self._init_local()
        return self._local_fallback["checker"].check(medicines)

    def _init_local(self):
        """Lazily initialize local ML modules."""
        import sys, os
        ml_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "ml_pipeline"
        )
        if ml_path not in sys.path:
            sys.path.insert(0, ml_path)

        from ocr.trocr_inference import TrOCRInference
        from ocr.postprocess_ocr import PostProcessor
        from drug_interaction.interaction_inference import InteractionChecker

        self._local_fallback = {
            "ocr": TrOCRInference(model_path=None),
            "post": PostProcessor(),
            "checker": InteractionChecker(),
        }


# Singleton instance
ml_client = MLClient()
