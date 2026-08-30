import sys
sys.path.insert(0, 'ml_pipeline')

from schemas import ResolvedMedicine, Outcome
from normalise.brand_generic import attach_generics, to_generic
from normalise.salt_normalise import normalise_generic
from drug_interaction import InteractionChecker

print("=== 1. Checking the DDI Graph Loader ===")
checker = InteractionChecker()
print(f"Total DDI rules loaded: {checker.graph.graph.number_of_edges()}")

print("\n=== 2. Testing Brand -> Generic Resolution ===")
# Napa is a known BD brand for Paracetamol
generic_name = to_generic("Napa")
print(f"'Napa' resolved to generic: '{generic_name}'")

# An unknown brand should safely return None
unknown_generic = to_generic("SomeFakeDrug")
print(f"'SomeFakeDrug' resolved to generic: '{unknown_generic}'")

print("\n=== 3. Testing Salt Normalisation ===")
salt_name = "Cetirizine Hydrochloride (Tablet)"
cleaned_name = normalise_generic(salt_name)
print(f"'{salt_name}' normalised to: '{cleaned_name}'")

print("\n=== 4. Testing End-to-End Pipeline Safety Check ===")
# Simulate the output from Track A (the VLM reader)
meds = [
    # Coumadin (brand) -> Warfarin (generic)
    ResolvedMedicine(brand='Coumadin', generic='Warfarin', outcome=Outcome.CONFIRMED, confidence=0.95, raw_reading='Coumadin'),
    # Advil (brand) -> Ibuprofen (generic)
    ResolvedMedicine(brand='Advil', generic='Ibuprofen', outcome=Outcome.CONFIRMED, confidence=0.90, raw_reading='Advil'),
]

# The pipeline processes the medicines
meds = attach_generics(meds)
result = checker.check(meds)

print(f"Total interactions found: {result.total_count}")
if result.total_count > 0:
    for interaction in result.interactions:
        print(f"\n⚠️  {interaction.severity.upper()} INTERACTION DETECTED:")
        print(f"Drugs: {interaction.drug_a} + {interaction.drug_b}")
        print(f"Mechanism: {interaction.mechanism}")
        print(f"Safer Alternative: {interaction.safer_alternative}")
        print(f"Reference: {interaction.reference}")
