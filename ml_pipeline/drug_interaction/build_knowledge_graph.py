"""
Drug Interaction Knowledge Graph — Built with NetworkX.
Loads data from the DDI Database JSON (180 rules), falling back to a hardcoded subset.
"""
import os
import json
import glob
import networkx as nx
import pandas as pd
from typing import List, Dict, Optional
from .severity_labels import Severity


# Pre-built fallback interaction data (6 rules — use only if JSON is missing)
INTERACTION_DATA = [
    ("Napa", "Ace", "minor", "Both contain paracetamol/acetaminophen — risk of overdose if combined"),
    ("Napa", "Aceta", "minor", "Duplicate paracetamol — do not combine"),
    ("Napa Extend", "Ace", "moderate", "Extended-release paracetamol with regular — overdose risk"),
    ("Rivotril", "Baclofen", "severe", "CNS depression — combined sedation risk"),
    ("Aspirin", "Ibuprofen", "moderate", "NSAIDs combined — increased GI bleeding risk"),
    ("Aspirin", "Diclofenac", "severe", "NSAIDs combined — high GI bleeding risk"),
]


class DrugInteractionGraph:
    def __init__(self, dataset_path: Optional[str] = None):
        self.graph = nx.Graph()
        loaded = False

        if dataset_path:
            # If a directory is given, look for JSON first, then CSV
            if os.path.isdir(dataset_path):
                json_files = glob.glob(os.path.join(dataset_path, "*.json"))
                if json_files:
                    loaded = self._load_from_json(json_files[0])
                if not loaded:
                    csv_files = glob.glob(os.path.join(dataset_path, "*.csv"))
                    if csv_files:
                        loaded = self._load_from_csv(csv_files[0])
            # If a specific file is given
            elif os.path.isfile(dataset_path):
                if dataset_path.endswith(".json"):
                    loaded = self._load_from_json(dataset_path)
                elif dataset_path.endswith(".csv"):
                    loaded = self._load_from_csv(dataset_path)

        if not loaded:
            self._build_fallback_graph()

    def _load_from_json(self, json_path: str) -> bool:
        """Load interactions from DDI Database.json.

        Expected structure:
        {
          "drug_interactions": {
            "major": [ { drug_a, drug_b, severity, mechanism, effect,
                         Safer_alternative, rationale, reference }, ... ],
            "moderate": [ ... ],
            "minor": [ ... ]
          }
        }
        """
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            drug_interactions = data.get("drug_interactions", {})

            # Map JSON severity categories to our Severity enum
            severity_map = {
                "major": Severity.SEVERE,
                "moderate": Severity.MODERATE,
                "minor": Severity.MINOR,
            }

            for category, severity_enum in severity_map.items():
                entries = drug_interactions.get(category, [])
                for entry in entries:
                    drug_a = str(entry.get("drug_a", "")).strip()
                    drug_b = str(entry.get("drug_b", "")).strip()

                    if not drug_a or not drug_b:
                        continue

                    self.graph.add_edge(
                        drug_a.lower(), drug_b.lower(),
                        severity=severity_enum,
                        description=entry.get("mechanism", f"Interaction between {drug_a} and {drug_b}"),
                        drug_a=drug_a,
                        drug_b=drug_b,
                        mechanism=entry.get("mechanism", ""),
                        effect=entry.get("effect", ""),
                        safer_alternative=entry.get("Safer_alternative", ""),
                        rationale=entry.get("rationale", ""),
                        reference=entry.get("reference", ""),
                    )

            count = self.graph.number_of_edges()
            print(f"[DDI] Loaded {count} interactions from {json_path}")
            return count > 0

        except Exception as e:
            print(f"[DDI] Failed to load JSON from {json_path}: {e}")
            return False

    def _load_from_csv(self, csv_path: str) -> bool:
        """Legacy CSV loader — kept for backward compatibility."""
        try:
            df = pd.read_csv(csv_path, encoding='utf-8')
            drug_a_col = next((c for c in df.columns if 'drug' in c.lower() and 'a' in c.lower()), 'Drug A')
            drug_b_col = next((c for c in df.columns if 'drug' in c.lower() and 'b' in c.lower()), 'Drug B')
            severity_col = next((c for c in df.columns if 'sever' in c.lower()), 'Severity')
            desc_col = next((c for c in df.columns if 'mech' in c.lower() or 'desc' in c.lower() or 'inter' in c.lower()), 'Mechanism')

            if drug_a_col not in df.columns or drug_b_col not in df.columns:
                drug_a_col = df.columns[0]
                drug_b_col = df.columns[1]
                severity_col = df.columns[2] if len(df.columns) > 2 else 'minor'
                desc_col = df.columns[3] if len(df.columns) > 3 else 'Interaction noted'

            for _, row in df.iterrows():
                a = str(row[drug_a_col]).strip()
                b = str(row[drug_b_col]).strip()
                sev = str(row[severity_col]).strip().lower() if severity_col in df.columns else 'minor'

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
                    drug_a=a, drug_b=b,
                    mechanism=desc, effect="", safer_alternative="",
                    rationale="", reference="",
                )

            count = self.graph.number_of_edges()
            print(f"[DDI] Loaded {count} interactions from {csv_path}")
            return count > 0
        except Exception as e:
            print(f"[DDI] Failed to load CSV from {csv_path}: {e}. Using fallback data.")
            return False

    def _build_fallback_graph(self):
        for a, b, sev, desc in INTERACTION_DATA:
            self.graph.add_edge(
                a.lower(), b.lower(),
                severity=Severity(sev), description=desc,
                drug_a=a, drug_b=b,
                mechanism=desc, effect="", safer_alternative="",
                rationale="", reference="",
            )
        print(f"[DDI] WARNING: Using fallback data ({self.graph.number_of_edges()} hardcoded rules). "
              f"Check that DDI Database.json exists in data/ddi_dataset/.")

    def check_interaction(self, drug_a: str, drug_b: str) -> Optional[Dict]:
        a, b = drug_a.lower(), drug_b.lower()
        if self.graph.has_edge(a, b):
            data = self.graph[a][b]
            return {
                'drug_a': data['drug_a'],
                'drug_b': data['drug_b'],
                'severity': data['severity'].value,
                'severity_color': data['severity'].color,
                'description': data['description'],
                'mechanism': data.get('mechanism', ''),
                'effect': data.get('effect', ''),
                'safer_alternative': data.get('safer_alternative', ''),
                'reference': data.get('reference', ''),
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
            ints.append({
                'drug': data['drug_b'] if data['drug_a'].lower() == d else data['drug_a'],
                'severity': data['severity'].value,
                'description': data['description'],
                'mechanism': data.get('mechanism', ''),
                'reference': data.get('reference', ''),
            })
        return {'drug': drug, 'interactions_count': len(ints), 'interactions': ints}
