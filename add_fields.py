import json

DATA_PATH = r"C:\ระบบเตรียมการปรับย้ายกำลังพล\personnel-app\src\data.json"

RANK_PROMO_YEARS = {
    'จ.ส.ต.': 3,  'จ.ส.ท.': 7,  'จ.ส.อ.': 12,
    'ร.ต.': 2,    'ร.ท.': 8,    'ร.อ.': 14,
    'น.ต.': 2,    'น.ท.': 8,    'น.อ.': 14,
    'พ.ต.': 5,    'พ.ท.': 12,   'พ.อ.': 18,
    'พ.อ.(พ)': 23,
    'พล.ต.': 29,  'พล.ร.ต.': 29, 'พล.อ.ต.': 29,
    'พล.ท.': 33,  'พล.ร.ท.': 33, 'พล.อ.ท.': 33,
    'พล.อ.': 37,  'พล.ร.อ.': 37, 'พล.อ.อ.': 37,
}

# Load
with open(DATA_PATH, encoding='utf-8') as f:
    records = json.load(f)

added_counts = {'study_field': 0, 'birth_be': 0, 'years_in_rank': 0}

for rec in records:
    # 1. study_field — only add if not already present
    if 'study_field' not in rec:
        rec['study_field'] = ""
        added_counts['study_field'] += 1

    # 2. birth_be — estimate entry_be - 22
    if 'birth_be' not in rec:
        entry_be = rec.get('entry_be')
        rec['birth_be'] = (entry_be - 22) if entry_be is not None else None
        added_counts['birth_be'] += 1

    # 3. years_in_rank
    if 'years_in_rank' not in rec:
        years_service = rec.get('years_service')
        rank_req = rec.get('rank_req', '')
        if years_service is None:
            rec['years_in_rank'] = None
        else:
            promo_threshold = RANK_PROMO_YEARS.get(rank_req, 0)
            rec['years_in_rank'] = max(0, years_service - promo_threshold)
        added_counts['years_in_rank'] += 1

# Write back
with open(DATA_PATH, 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print(f"Done. Total records: {len(records)}")
print(f"Fields added — study_field: {added_counts['study_field']}, "
      f"birth_be: {added_counts['birth_be']}, "
      f"years_in_rank: {added_counts['years_in_rank']}")

print("\n--- First 3 records (selected fields) ---")
for rec in records[:3]:
    print(
        f"  id={rec.get('person_id')}  name={rec.get('name')}  "
        f"rank_req={rec.get('rank_req')}  years_service={rec.get('years_service')}  "
        f"entry_be={rec.get('entry_be')}"
    )
    print(
        f"    study_field={rec.get('study_field')!r}  "
        f"birth_be={rec.get('birth_be')}  "
        f"years_in_rank={rec.get('years_in_rank')}"
    )
