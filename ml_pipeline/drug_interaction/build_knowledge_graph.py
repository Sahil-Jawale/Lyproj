"""
Drug Interaction Knowledge Graph — Built with NetworkX.
Pre-loaded with common drug interactions relevant to the BD prescription dataset.
"""
import networkx as nx
from typing import List, Dict, Tuple, Optional
from .severity_labels import Severity

# Pre-built interaction data: (drug_a, drug_b, severity, description)
INTERACTION_DATA = [
    ("Napa","Ace","minor","Both contain paracetamol/acetaminophen — risk of overdose if combined"),
    ("Napa","Aceta","minor","Duplicate paracetamol — do not combine"),
    ("Napa Extend","Ace","moderate","Extended-release paracetamol with regular — overdose risk"),
    ("Napa Extend","Napa","moderate","Duplicate paracetamol formulations"),
    ("Azithrocin","Azyth","minor","Same active ingredient (azithromycin) — duplicate therapy"),
    ("Azithrocin","Rozith","minor","Both macrolide antibiotics — no benefit from combining"),
    ("Azithrocin","Romycin","minor","Duplicate macrolide therapy"),
    ("Nidazyl","Metro","minor","Both contain metronidazole — duplicate therapy"),
    ("Esoral","Maxpro","minor","Both are proton pump inhibitors — no benefit from combining"),
    ("Esoral","Sergel","minor","Duplicate PPI therapy"),
    ("Esoral","Nexum","minor","Duplicate PPI therapy (esomeprazole)"),
    ("Esoral","Exium","minor","Duplicate PPI therapy"),
    ("Maxpro","Sergel","minor","Duplicate PPI therapy"),
    ("Rivotril","Baclofen","severe","CNS depression — combined sedation risk"),
    ("Rivotril","Etizin","severe","Both benzodiazepines — respiratory depression risk"),
    ("Baclofen","Flexibac","minor","Same active ingredient — duplicate therapy"),
    ("Baclofen","Baclon","minor","Same active ingredient — duplicate therapy"),
    ("Baclofen","Flexilax","moderate","Both muscle relaxants — excessive sedation"),
    ("Ketoral","Ketocon","minor","Duplicate ketoconazole therapy"),
    ("Ketoral","Ketotab","minor","Duplicate ketoconazole therapy"),
    ("Ketoral","Ketozol","minor","Duplicate ketoconazole therapy"),
    ("Ketocon","Ketotab","minor","Duplicate ketoconazole therapy"),
    ("Fexofast","Fexo","minor","Same active ingredient (fexofenadine) — duplicate therapy"),
    ("Fexofast","Fenadin","minor","Duplicate fexofenadine therapy"),
    ("Fexofast","Telfast","minor","Duplicate fexofenadine therapy"),
    ("Fexofast","Dinafex","minor","Duplicate fexofenadine therapy"),
    ("Atrizin","Cetisoft","minor","Both contain cetirizine — duplicate antihistamine"),
    ("Atrizin","Alatrol","minor","Duplicate cetirizine therapy"),
    ("Montair","Monas","minor","Both contain montelukast — duplicate therapy"),
    ("Montair","Montex","minor","Duplicate montelukast therapy"),
    ("Montair","MKast","minor","Duplicate montelukast therapy"),
    ("Montair","Montene","minor","Duplicate montelukast therapy"),
    ("Canazole","Candinil","minor","Duplicate antifungal therapy"),
    ("Diflu","Flugal","minor","Both contain fluconazole — duplicate therapy"),
    ("Rivotril","Baclon","severe","Benzodiazepine + muscle relaxant — CNS depression"),
    ("Napa","Metronidazole","moderate","Paracetamol + metronidazole — hepatotoxicity risk"),
    ("Napa","Metro","moderate","Paracetamol + metronidazole — hepatotoxicity risk"),
    ("Aspirin","Ibuprofen","moderate","NSAIDs combined — increased GI bleeding risk"),
    ("Aspirin","Diclofenac","severe","NSAIDs combined — high GI bleeding risk"),
    ("Metformin","Ciprofloxacin","moderate","May cause hypoglycemia"),
    ("Azithromycin","Amoxicillin","minor","Macrolide + penicillin — potential antagonism"),
    ("Omeprazole","Metformin","minor","PPI may affect metformin absorption"),
    ("Ciprofloxacin","Metronidazole","moderate","QT prolongation risk"),
    ("Ibuprofen","Aspirin","moderate","Ibuprofen may reduce cardioprotective effect of aspirin"),
    ("Cetirizine","Rivotril","moderate","Increased sedation"),
    ("Pantoprazole","Metformin","minor","PPI may affect metformin absorption"),
]

class DrugInteractionGraph:
    def __init__(self):
        self.graph = nx.Graph()
        self._build_graph()

    def _build_graph(self):
        for a, b, sev, desc in INTERACTION_DATA:
            self.graph.add_edge(
                a.lower(), b.lower(),
                severity=Severity(sev), description=desc,
                drug_a=a, drug_b=b
            )

    def check_interaction(self, drug_a: str, drug_b: str) -> Optional[Dict]:
        a, b = drug_a.lower(), drug_b.lower()
        if self.graph.has_edge(a, b):
            data = self.graph[a][b]
            return {
                'drug_a': data['drug_a'], 'drug_b': data['drug_b'],
                'severity': data['severity'].value,
                'severity_color': data['severity'].color,
                'description': data['description'],
            }
        return None

    def check_all_interactions(self, drugs: List[str]) -> List[Dict]:
        interactions = []
        drug_list = [d.lower() for d in drugs]
        for i in range(len(drug_list)):
            for j in range(i + 1, len(drug_list)):
                result = self.check_interaction(drug_list[i], drug_list[j])
                if result:
                    interactions.append(result)
        return interactions

    def get_drug_info(self, drug: str) -> Dict:
        d = drug.lower()
        if d not in self.graph:
            return {'drug': drug, 'interactions_count': 0, 'interactions': []}
        neighbors = list(self.graph.neighbors(d))
        ints = []
        for n in neighbors:
            data = self.graph[d][n]
            ints.append({'drug': data['drug_b'] if data['drug_a'].lower()==d else data['drug_a'],
                         'severity': data['severity'].value, 'description': data['description']})
        return {'drug': drug, 'interactions_count': len(ints), 'interactions': ints}
