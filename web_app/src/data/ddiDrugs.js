/**
 * The GENERIC names the interaction graph actually knows — every drug that
 * appears on at least one edge of `ml_pipeline/data/ddi_dataset/DDI Database.json`.
 *
 * Generated from that file, not typed by hand. The manual checker screens by
 * generic name, so suggesting anything outside this list would offer the user
 * searches that can only ever come back empty. (This replaced a hardcoded list
 * of Bangladeshi brand names left over from a dataset the project has dropped.)
 */
export const DDI_DRUGS = [
  "ACE Inhibitors (e.g., Lisinopril)", "Acetaminophen", "Alendronate", "Alfentanil",
  "Alfuzosin", "Aliskiren", "Allopurinol", "Alprazolam", "Amiloride", "Amiodarone",
  "Amitriptyline", "Amlodipine", "Amoxicillin", "Apixaban", "Apomorphine", "Aspirin",
  "Atenolol", "Atorvastatin", "Avocado", "Azathioprine", "Azithromycin", "Barbiturates",
  "Betamethasone", "Bisoprolol", "Bromocriptine", "Bumetanide", "Bupropion", "Buspirone",
  "Calcium Carbonate", "Carbamazepine", "Carbonic Anhydrase Inhibitors", "Cephalexin",
  "Cetirizine", "Chlorpromazine", "Chlorthalidone", "Cholestyramine", "Cimetidine",
  "Ciprofloxacin", "Cisapride", "Citalopram", "Clarithromycin", "Clonidine", "Clopidogrel",
  "Clotrimazole", "Clozapine", "Codeine", "Colchicine", "Colestipol", "Cyclosporine",
  "Dabigatran", "Dextromethorphan", "Diazepam", "Diazoxide", "Diclofenac", "Didanosine",
  "Digoxin", "Diltiazem", "Diphenhydramine", "Docusate", "Donepezil", "Doxycycline",
  "Dronedarone", "Duloxetine", "Electrolyte Supplements", "Enalapril", "Erythromycin",
  "Escitalopram", "Esomeprazole", "Ethinyl Estradiol", "Famotidine", "Felodipine",
  "Fenofibrate", "Fluconazole", "Fluoxetine", "Fluphenazine", "Folic Acid", "Furosemide",
  "Gabapentin", "Gemfibrozil", "Ginkgo Biloba", "Ginseng", "Glimepiride", "Glipizide",
  "Glyburide", "Glycopyrrolate", "Guaifenesin", "Haloperidol", "Hydralazine",
  "Hydrochlorothiazide", "Hydrocodone", "Hydrocortisone", "Hydroxychloroquine", "Ibuprofen",
  "Imatinib", "Indapamide", "Indomethacin", "Insulin", "Iodinated Contrast Dye",
  "Iron Sulfate", "Isoniazid", "Isosorbide Mononitrate", "Isotretinoin", "Itraconazole",
  "Ketoconazole", "Lactulose", "Lamotrigine", "Levodopa", "Levofloxacin", "Levothyroxine",
  "Linagliptin", "Linezolid", "Lisinopril", "Lithium", "Loratadine", "Losartan", "Lurasidone",
  "Magnesium Trisilicate", "Meloxicam", "Memantine", "Meperidine", "Meropenem", "Metformin",
  "Methadone", "Methotrexate", "Methyldopa", "Metoclopramide", "Metoprolol", "Metronidazole",
  "Midazolam", "Montelukast", "Mupirocin", "Nafcillin", "Naproxen", "Nicardipine",
  "Nifedipine", "Nitrofurantoin", "Nitroglycerin", "Nystatin", "Olanzapine", "Olopatadine",
  "Omeprazole", "Ondansetron", "Oxcarbazepine", "Pantoprazole", "Paroxetine", "Penicillin VK",
  "Perphenazine", "Phenelzine", "Phenylephrine", "Phenytoin", "Pimozide", "Pramlintide",
  "Procyclidine", "Propranolol", "Pseudoephedrine", "Pyridoxine", "Quetiapine", "Quinidine",
  "Quinine", "Ramipril", "Ranitidine", "Rifampin", "Riociguat", "Risperidone", "Ritonavir",
  "Rivaroxaban", "Rivastigmine", "Rosuvastatin", "Salmeterol", "Sennosides", "Sertraline",
  "Sildenafil", "Simvastatin", "Sitagliptin", "Sodium Valproate", "Spironolactone",
  "St. John's Wort", "Sucralfate", "Sulfamethoxazole/Trimethoprim", "Tacrolimus", "Tadalafil",
  "Tamoxifen", "Tamsulosin", "Telithromycin", "Telmisartan", "Tetracycline", "Theophylline",
  "Thioridazine", "Timolol", "Tizanidine", "Tolbutamide", "Tramadol", "Trazodone",
  "Triamterene", "Trimipramine", "Ursodiol", "Valaciclovir", "Valproic Acid", "Valsartan",
  "Vardenafil", "Venlafaxine", "Verapamil", "Vitamin C", "Voriconazole", "Warfarin",
  "Xylometazoline", "Zafirlukast", "Zinc", "Zinc Supplements", "Zolpidem"
]

/** Pairs that genuinely fire, for one-click demonstration. */
export const SAMPLE_COMBOS = [
  ['Warfarin', 'Ibuprofen'],
  ['Sildenafil', 'Nitroglycerin'],
  ['Simvastatin', 'Clarithromycin'],
  ['Digoxin', 'Verapamil'],
  ['Sertraline', 'Tramadol'],
]
