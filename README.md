# 🏥 MedScript — AI-Powered Prescription Intelligence System

<p align="center">
  <strong>Turn handwritten prescriptions into digital records with drug interaction safety checks.</strong>
</p>

---

## ✨ Features

| Feature | Description |
|---------|------------|
| **Smart OCR** | Fine-tuned TrOCR reads handwritten prescriptions with confidence scoring |
| **Drug Interaction Detection** | NetworkX knowledge graph with 200+ drug interaction rules and severity classification |
| **Fuzzy Medicine Matching** | RapidFuzz corrects OCR errors against 78+ medicine database |
| **Patient Portal** | Beautiful React web app for uploading and viewing prescription results |
| **Pharmacy Dashboard** | Analytics dashboard for prescription verification and dispensing |
| **Structured Output** | Extracted medicines with dosage, frequency, duration, and instructions |

## 🏗️ Architecture

```
medscript/
├── ml_pipeline/          # ML models & preprocessing
│   ├── preprocessing/    # Image deskew, denoise, binarise, crop
│   ├── ocr/              # TrOCR fine-tuning & inference
│   ├── drug_interaction/ # NetworkX knowledge graph
│   ├── model_serving/    # FastAPI ML inference server (port 8001)
│   └── synthetic_data/   # Training data generator
├── backend/              # FastAPI REST API (port 8000)
│   ├── config/           # Settings, database config
│   ├── apps/             # Modular app structure
│   └── ml_client/        # HTTP client for ML service
├── web_app/              # React patient portal (port 5173)
└── pharmacy_dashboard/   # React pharmacy dashboard (port 3001)
```

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- npm 9+

### 1. Backend Setup

```bash
cd backend
pip install -r requirements.txt
python main.py
# → API running at http://localhost:8000
# → Docs at http://localhost:8000/docs
```

### 2. Web App (Patient Portal)

```bash
cd web_app
npm install
npm run dev
# → Patient portal at http://localhost:5173
```

### 3. Pharmacy Dashboard

```bash
cd pharmacy_dashboard
npm install
npm run dev
# → Pharmacy dashboard at http://localhost:3001
```

### 4. ML Service (Optional — runs standalone)

```bash
cd ml_pipeline
pip install -r requirements.txt
python model_serving/app.py
# → ML server at http://localhost:8001
```

## 🧪 Demo Mode

The prototype runs in **demo mode** by default — no GPU or model downloads required. The OCR engine generates realistic mock predictions based on the BD Prescription Dataset (78 medicine classes, 4,680 word segments).

### Try These Flows:

1. **Upload a prescription** → See OCR results with confidence scores
2. **Check drug interactions** → Try `Rivotril + Baclofen` (severe) or `Napa + Metro` (moderate)
3. **Browse history** → Pre-seeded with demo prescriptions
4. **Pharmacy dashboard** → Prescription queue, verification panel, analytics

## 📊 Drug Interaction Severity Levels

| Level | Color | Description |
|-------|-------|-------------|
| **None** | 🟢 Green | No known interaction |
| **Minor** | 🟡 Lime | Duplicate therapy, minimal risk |
| **Moderate** | 🟠 Amber | Use with caution, monitor patient |
| **Severe** | 🔴 Red | Significant risk, consider alternatives |
| **Contraindicated** | ⛔ Dark Red | Do not combine |

## 🐳 Docker

```bash
docker-compose up --build
```

Services:
- Backend API: `http://localhost:8000`
- ML Server: `http://localhost:8001`
- Web App: `http://localhost:5173`
- Pharmacy Dashboard: `http://localhost:3001`

## 🔧 Environment Variables

See `.env.example` for all configuration options:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///medscript.db` | Database connection string |
| `ML_SERVICE_URL` | `http://localhost:8001` | ML inference service URL |
| `SECRET_KEY` | dev key | JWT signing key |
| `DEBUG` | `true` | Enable debug mode |

## 📁 Dataset

Built on the **BD Prescription Dataset**:
- 4,680 handwritten word segments
- 78 medicine name classes
- Sourced from Bangladeshi pharmacy prescriptions

## 🛣️ Roadmap

- [ ] Fine-tune TrOCR on 50K+ synthetic images
- [ ] BioBERT-based interaction classifier
- [ ] PostgreSQL + Celery + Redis for production
- [ ] Mobile app (React Native)
- [ ] Voice prescription input
- [ ] Multi-language support (Bengali, Hindi)

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.
