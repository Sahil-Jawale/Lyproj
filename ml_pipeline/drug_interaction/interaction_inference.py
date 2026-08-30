"""
Interaction Inference — Query knowledge graph for drug interactions.
Updated for the V2 pipeline: accepts ResolvedMedicine, returns InteractionResult.
"""
import os
from typing import List, Dict, Optional, Union
from .build_knowledge_graph import DrugInteractionGraph
from .severity_labels import Severity


# Resolve the default DDI dataset path relative to this file
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_DDI_DIR = os.path.join(_THIS_DIR, "..", "data", "ddi_dataset")


class InteractionChecker:
    def __init__(self, dataset_path: Optional[str] = None):
        path = dataset_path or _DEFAULT_DDI_DIR
        self.graph = DrugInteractionGraph(path)

    def check(self, medicines: Union[List[str], list]) -> dict:
        """Check drug interactions.

        Accepts either:
          - List[str]: legacy mode — plain medicine names (backward compatible)
          - List[ResolvedMedicine]: V2 mode — only CONFIRMED/PROBABLE are checked,
            AMBIGUOUS/ILLEGIBLE go into 'skipped'

        Returns a dict matching the InteractionResult schema.
        """
        # Import here to avoid circular imports at module load time
        try:
            from ml_pipeline.schemas import ResolvedMedicine, Outcome, Interaction, InteractionResult
        except ImportError:
            from schemas import ResolvedMedicine, Outcome, Interaction, InteractionResult

        # Determine mode
        names_to_check: List[str] = []
        skipped: List[str] = []
        is_v2 = False

        if medicines and hasattr(medicines[0], 'outcome'):
            is_v2 = True
            for med in medicines:
                # Only check medicines with a resolved generic name
                if med.outcome in (Outcome.CONFIRMED, Outcome.PROBABLE):
                    # Prefer generic name for DDI lookup, fall back to brand
                    name = med.generic or med.brand
                    if name:
                        names_to_check.append(name)
                else:
                    # AMBIGUOUS or ILLEGIBLE — never silently participate in safety check
                    label = med.raw_reading or med.brand or "unknown"
                    skipped.append(label)
        else:
            # Legacy mode: plain list of strings
            names_to_check = [str(m) for m in medicines]

        # Expand with synonyms for better DDI match rate
        get_synonyms = None
        try:
            from ml_pipeline.normalise.brand_generic import get_synonyms
        except ImportError:
            try:
                from normalise.brand_generic import get_synonyms
            except ImportError:
                pass

        if get_synonyms is not None:
            raw_interactions = []
            for i in range(len(names_to_check)):
                for j in range(i + 1, len(names_to_check)):
                    syn_i = get_synonyms(names_to_check[i])
                    syn_j = get_synonyms(names_to_check[j])

                    found = False
                    for si in syn_i:
                        for sj in syn_j:
                            result = self.graph.check_interaction(si, sj)
                            if result:
                                raw_interactions.append(result)
                                found = True
                                break
                        if found:
                            break
        else:
            # Fallback: no synonym expansion available
            raw_interactions = self.graph.check_all_interactions(names_to_check)

        # Determine overall risk
        has_severe = any(
            i['severity'] in ('severe', 'contraindicated') for i in raw_interactions
        )
        has_moderate = any(i['severity'] == 'moderate' for i in raw_interactions)

        if has_severe:
            overall = 'severe'
        elif has_moderate:
            overall = 'moderate'
        elif raw_interactions:
            overall = 'minor'
        else:
            overall = 'none'

        # Build result with full citation fields
        interactions = []
        for i in raw_interactions:
            interactions.append(Interaction(
                drug_a=i['drug_a'],
                drug_b=i['drug_b'],
                severity=i['severity'],
                severity_color=i['severity_color'],
                mechanism=i.get('mechanism', ''),
                effect=i.get('effect', ''),
                safer_alternative=i.get('safer_alternative', ''),
                reference=i.get('reference', ''),
            ))

        return InteractionResult(
            interactions=interactions,
            total_count=len(interactions),
            overall_risk=overall,
            medicines_checked=names_to_check,
            skipped=skipped,
        )
