"""
Interaction Inference — Query knowledge graph for drug interactions.
"""
from typing import List, Dict, Optional
from .build_knowledge_graph import DrugInteractionGraph
from .severity_labels import Severity

class InteractionChecker:
    def __init__(self, dataset_path: Optional[str] = None):
        self.graph = DrugInteractionGraph(dataset_path)

    def check(self, medicine_names: List[str]) -> Dict:
        interactions = self.graph.check_all_interactions(medicine_names)
        has_severe = any(i['severity'] in ('severe','contraindicated') for i in interactions)
        has_moderate = any(i['severity'] == 'moderate' for i in interactions)
        if has_severe:
            overall = 'severe'
        elif has_moderate:
            overall = 'moderate'
        elif interactions:
            overall = 'minor'
        else:
            overall = 'none'
        return {
            'interactions': interactions,
            'total_count': len(interactions),
            'overall_risk': overall,
            'has_severe': has_severe,
            'has_moderate': has_moderate,
            'medicines_checked': medicine_names,
        }
