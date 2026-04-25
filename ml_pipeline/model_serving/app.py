"""
ML Model Serving — FastAPI inference server for OCR and drug interaction checking.
"""
import sys, os, io, uuid
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
from typing import List, Optional

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ocr.trocr_inference import TrOCRInference
from ocr.postprocess_ocr import PostProcessor
from drug_interaction.interaction_inference import InteractionChecker

app = FastAPI(title="MedScript ML Server", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Initialize models
ocr_engine = TrOCRInference(model_path=None)  # Demo mode
post_processor = PostProcessor()
interaction_checker = InteractionChecker()

class InteractionRequest(BaseModel):
    medicines: List[str]

@app.get("/health")
async def health():
    return {"status": "healthy", "model": "demo_mode", "timestamp": datetime.utcnow().isoformat()}

@app.post("/ocr")
async def run_ocr(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith('image/'):
        raise HTTPException(400, "File must be an image")
    contents = await image.read()
    img = Image.open(io.BytesIO(contents))
    result = ocr_engine.predict_prescription(img)
    result['medicines'] = post_processor.process_ocr_output(result.get('medicines', []))
    result['prescription_id'] = str(uuid.uuid4())
    result['processed_at'] = datetime.utcnow().isoformat()
    return result

@app.post("/check-interactions")
async def check_interactions(req: InteractionRequest):
    if len(req.medicines) < 2:
        return {"interactions": [], "total_count": 0, "overall_risk": "none"}
    return interaction_checker.check(req.medicines)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
