"""
OCR Post-Processing — Fuzzy matching and spell correction for medicine names.
"""
from typing import List, Dict, Optional, Tuple

try:
    from rapidfuzz import fuzz, process
    HAS_RAPIDFUZZ = True
except ImportError:
    HAS_RAPIDFUZZ = False

KNOWN_MEDICINES = [
    "Beklo","Maxima","Leptic","Esoral","Omastin","Esonix","Canazole","Fixal",
    "Progut","Diflu","Montair","Flexilax","Maxpro","Vifas","Conaz","Fexofast",
    "Fenadin","Telfast","Dinafex","Ritch","Renova","Flugal","Axodin","Sergel",
    "Nexum","Opton","Nexcap","Fexo","Montex","Exium","Lumona","Napa",
    "Azithrocin","Atrizin","Monas","Nidazyl","Metsina","Baclon","Rozith",
    "Bicozin","Ace","Amodis","Alatrol","Napa Extend","Rivotril","Montene",
    "Filmet","Aceta","Tamen","Bacmax","Disopan","Rhinil","Flamyd","Metro",
    "Zithrin","Candinil","Lucan-R","Backtone","Bacaid","Etizin","Az",
    "Romycin","Azyth","Cetisoft","Dancel","Tridosil","Nizoder","Ketoral",
    "Ketocon","Ketotab","Ketozol","Denixil","Provair","Odmon","Baclofen",
    "MKast","Trilock","Flexibac",
    # Common Indian medicines
    "Paracetamol","Ibuprofen","Amoxicillin","Cetirizine","Omeprazole",
    "Metformin","Aspirin","Azithromycin","Ciprofloxacin","Diclofenac",
    "Pantoprazole","Ranitidine","Doxycycline","Metronidazole","Levofloxacin",
]

ABBREVIATIONS = {
    'OD': 'Once daily', 'BD': 'Twice daily', 'TDS': 'Thrice daily',
    'QID': 'Four times daily', 'HS': 'At bedtime', 'SOS': 'As needed',
    'AC': 'Before meals', 'PC': 'After meals', 'STAT': 'Immediately',
    '1-0-1': 'Morning and night', '1-1-1': 'Three times daily',
    '0-0-1': 'At night', '1-0-0': 'Morning only',
}

class PostProcessor:
    def __init__(self, medicine_list: Optional[List[str]] = None, threshold: float = 80.0):
        self.medicines = medicine_list or KNOWN_MEDICINES
        self.threshold = threshold

    def correct_medicine_name(self, name: str) -> Tuple[str, float, bool]:
        if not HAS_RAPIDFUZZ:
            return name, 100.0, False
        result = process.extractOne(name, self.medicines, scorer=fuzz.ratio)
        if result is None:
            return name, 0.0, False
        match, score, _ = result
        if score >= self.threshold:
            return match, score, match.lower() != name.lower()
        return name, score, False

    def expand_abbreviation(self, abbr: str) -> str:
        return ABBREVIATIONS.get(abbr.upper(), abbr)

    def process_ocr_output(self, medicines: List[Dict]) -> List[Dict]:
        processed = []
        for med in medicines:
            corrected_name, score, was_corrected = self.correct_medicine_name(med.get('name',''))
            entry = {**med, 'name': corrected_name, 'match_score': round(score, 1),
                     'was_corrected': was_corrected,
                     'frequency_expanded': self.expand_abbreviation(med.get('frequency',''))}
            if was_corrected:
                entry['original_name'] = med.get('name','')
            processed.append(entry)
        return processed
