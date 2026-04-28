"""
Drug Interaction Knowledge Graph — Built with NetworkX.
Loads data dynamically from the Kaggle DDI dataset if available, falling back to a subset.
"""
import os
import networkx as nx
import pandas as pd
from typing import List, Dict, Tuple, Optional
from .severity_labels import Severity

# Pre-built fallback interaction data
INTERACTION_DATA = [
    ("Napa","Ace","minor","Both contain paracetamol/acetaminophen — risk of overdose if combined"),
    ("Napa","Aceta","minor","Duplicate paracetamol — do not combine"),
    ("Napa Extend","Ace","moderate","Extended-release paracetamol with regular — overdose risk"),
    ("Rivotril","Baclofen","severe","CNS depression — combined sedation risk"),
    ("Aspirin","Ibuprofen","moderate","NSAIDs combined — increased GI bleeding risk"),
    ("Aspirin","Diclofenac","severe","NSAIDs combined — high GI bleeding risk"),
]

class DrugInteractionGraph:
    def __init__(self, dataset_path: Optional[str] = None):
        self.graph = nx.Graph()
        if dataset_path and os.path.exists(dataset_path):
            self._load_from_csv(dataset_path)
        else:
            self._build_fallback_graph()

    def _load_from_csv(self, csv_path: str):
        try:
            # Handle potential encoding issues with pandas
            df = pd.read_csv(csv_path, encoding='utf-8')
            # Look for common column names in DDI datasets
            drug_a_col = next((c for c in df.columns if 'drug' in c.lower() and 'a' in c.lower()), 'Drug A')
            drug_b_col = next((c for c in df.columns if 'drug' in c.lower() and 'b' in c.lower()), 'Drug B')
            severity_col = next((c for c in df.columns if 'sever' in c.lower()), 'Severity')
            desc_col = next((c for c in df.columns if 'mech' in c.lower() or 'desc' in c.lower() or 'inter' in c.lower()), 'Mechanism')
            
            # If standard columns aren't found, try first few columns
            if drug_a_col not in df.columns or drug_b_col not in df.columns:
                drug_a_col = df.columns[0]
                drug_b_col = df.columns[1]
                severity_col = df.columns[2] if len(df.columns) > 2 else 'minor'
                desc_col = df.columns[3] if len(df.columns) > 3 else 'Interaction noted'
                
            for _, row in df.iterrows():
                a = str(row[drug_a_col]).strip()
                b = str(row[drug_b_col]).strip()
                sev = str(row[severity_col]).strip().lower() if severity_col in df.columns else 'minor'
                
                # Normalize severity
                if 'major' in sev or 'severe' in sev or 'high' in sev:
                    sev = 'severe'
                elif 'moderate' in sev or 'med' in sev:
                    sev = 'moderate'
                else:
                    sev = 'minor'
                    
                desc = str(row[desc_col]).strip() if desc_col in df.columns else f"Interaction between {a} and {b}"
                
                self.graph.add_edge(
                    a.lower(), b.lower(),
                    severity=Severity(sev), description=desc,
                    drug_a=a, drug_b=b
                )
            print(f"Loaded {self.graph.number_of_edges()} interactions from {csv_path}")
        except Exception as e:
            print(f"Failed to load DDI CSV from {csv_path}: {e}. Using fallback data.")
            self._build_fallback_graph()

    def _build_fallback_graph(self):
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

