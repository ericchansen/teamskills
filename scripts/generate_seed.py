"""Generate seed.sql from Inventory.csv with hierarchical categories and fake demo users."""
import argparse
import csv
import os
import random
from pathlib import Path

script_dir = Path(__file__).resolve().parent
default_inv = os.environ.get('INV_PATH') or str(script_dir.parent / 'Inventory.csv')
default_out = os.environ.get('OUT_PATH') or str(script_dir.parent / 'database' / 'seed.sql')

parser = argparse.ArgumentParser(
    description='Generate seed.sql from Inventory.csv with hierarchical categories and fake demo users.'
)
parser.add_argument('-i', '--inventory', default=default_inv, help='Path to Inventory CSV (default: %(default)s)')
parser.add_argument('-o', '--output', default=default_out, help='Output seed SQL path (default: %(default)s)')
args = parser.parse_args()

INV = args.inventory
OUT = args.output

# Duplicate placement overrides (skill -> preferred location)
DUPE_PLACEMENT = {
    'Azure Container Apps': ('Apps & AI', 'Containers', 'Solution'),
    'Azure Functions': ('Apps & AI', 'Application Development', 'Solution'),
    'Azure Firewall': ('Infra', 'Networking', 'Network Security'),
}

# Typo corrections from source CSV
TYPO_FIXES = {
    'Postgre': 'PostgreSQL',
    'Manged Redis': 'Managed Redis',
    'Dedicatd Hosts': 'Dedicated Hosts',
}

# Parse inventory
with open(INV, 'r', encoding='utf-8-sig') as f:
    inv_rows = list(csv.DictReader(f))

# Build ordered hierarchy
role_order = []
role_domains = {}
domain_subs = {}
cat_skills = {}
seen_skills = set()

for r in inv_rows:
    role = (r.get('Role') or '').strip()
    domain = (r.get('Domain ') or r.get('Domain') or '').strip()
    subdomain = (r.get('Subdomain') or '').strip()
    skill = (r.get('r') or '').strip()

    # Apply typo corrections
    subdomain = TYPO_FIXES.get(subdomain, subdomain)
    skill = TYPO_FIXES.get(skill, skill)

    if not skill or not domain:
        continue
    if not role and 'Fabric' in subdomain:
        role = 'Data'
    if not role:
        continue

    if skill in seen_skills:
        continue
    if skill in DUPE_PLACEMENT:
        pref = DUPE_PLACEMENT[skill]
        if (role, domain, subdomain) != pref:
            continue

    seen_skills.add(skill)

    if role not in role_order:
        role_order.append(role)
        role_domains[role] = []
    if domain not in role_domains[role]:
        role_domains[role].append(domain)

    dk = (role, domain)
    if dk not in domain_subs:
        domain_subs[dk] = []
    if subdomain and subdomain not in domain_subs[dk]:
        domain_subs[dk].append(subdomain)

    key = (role, domain, subdomain)
    if key not in cat_skills:
        cat_skills[key] = []
    cat_skills[key].append(skill)

# Assign category IDs
cat_id = 0
cat_ids = {}
cat_entries = []

for ri, role in enumerate(role_order):
    cat_id += 1
    role_cid = cat_id
    cat_ids[(role, '', '')] = role_cid
    cat_entries.append((role_cid, role, None, 1, ri + 1))

    for di, domain in enumerate(role_domains[role]):
        cat_id += 1
        domain_cid = cat_id
        cat_ids[(role, domain, '')] = domain_cid
        cat_entries.append((domain_cid, domain, role_cid, 2, di + 1))

        for si, subdomain in enumerate(domain_subs.get((role, domain), [])):
            cat_id += 1
            sub_cid = cat_id
            cat_ids[(role, domain, subdomain)] = sub_cid
            cat_entries.append((sub_cid, subdomain, domain_cid, 3, si + 1))

# Map skills to their most specific category
skill_entries = []
skill_id = 0

for key, skills in cat_skills.items():
    role, domain, subdomain = key
    if subdomain and (role, domain, subdomain) in cat_ids:
        cid = cat_ids[(role, domain, subdomain)]
    elif (role, domain, '') in cat_ids:
        cid = cat_ids[(role, domain, '')]
    else:
        cid = cat_ids[(role, '', '')]

    for si, skill in enumerate(skills):
        skill_id += 1
        skill_entries.append((skill_id, skill, cid, si + 1))

# Track skill role for demo ratings
skill_role_map = {}
for (role, domain, subdomain), skills in cat_skills.items():
    for s in skills:
        skill_role_map[s] = role

def esc(s):
    return s.replace("'", "''")

lines = []
lines.append("-- Team Skills Database Seed Data")
lines.append("-- Auto-generated from Inventory.csv")
lines.append("-- Contains hierarchical skill categories and skills (public data)")
lines.append("-- User data is imported separately via /api/admin/sync-skills (private)")
lines.append("")

lines.append("-- Skill Categories (hierarchical: Role > Domain > Subdomain)")
lines.append("INSERT INTO skill_categories (id, name, parent_id, level, sort_order) VALUES")
cat_values = []
for cid, name, parent_id, level, sort_order in cat_entries:
    pid = str(parent_id) if parent_id else 'NULL'
    cat_values.append(f"  ({cid}, '{esc(name)}', {pid}, {level}, {sort_order})")
lines.append(",\n".join(cat_values) + "\nON CONFLICT DO NOTHING;")
lines.append("")

lines.append("-- Skills (linked to most specific category)")
lines.append("INSERT INTO skills (id, name, category_id, sort_order) VALUES")
skill_values = []
for sid, name, cid, sort_order in skill_entries:
    skill_values.append(f"  ({sid}, '{esc(name)}', {cid}, {sort_order})")
lines.append(",\n".join(skill_values) + "\nON CONFLICT DO NOTHING;")
lines.append("")

lines.append(f"SELECT setval('skill_categories_id_seq', {cat_id}, true);")
lines.append(f"SELECT setval('skills_id_seq', {skill_id}, true);")
lines.append("")

# Fake demo users
demo_users = [
    ("Alex Chen", "alexchen", "Apps & AI"),
    ("Sam Rivera", "samrivera", "Data"),
    ("Morgan Taylor", "morgantaylor", "Infra"),
    ("Jamie Park", "jamiepark", "Apps & AI"),
    ("Casey Brooks", "caseybrooks", "Data"),
    ("Riley Quinn", "rileyquinn", "Infra"),
]

lines.append("-- Demo users (fake data for development/testing)")
lines.append("INSERT INTO users (id, name, email, role, team) VALUES")
user_values = []
for i, (name, alias, qualifier) in enumerate(demo_users, 1):
    user_values.append(f"  ({i}, '{esc(name)}', '{alias}@example.com', '{esc(qualifier)}', '{esc(qualifier)}')")
lines.append(",\n".join(user_values) + "\nON CONFLICT DO NOTHING;")
lines.append(f"SELECT setval('users_id_seq', {len(demo_users)}, true);")
lines.append("")

# Generate demo ratings
random.seed(42)
lines.append("-- Demo user skills (fake proficiency data)")
lines.append("INSERT INTO user_skills (user_id, skill_id, proficiency_level) VALUES")
us_values = []
for ui, (uname, alias, qualifier) in enumerate(demo_users, 1):
    for sid, sname, cid, _ in skill_entries:
        skill_role = skill_role_map.get(sname, '')
        if skill_role == qualifier:
            level = random.choice([200, 200, 300, 300, 300, 400, 400])
        else:
            level = random.choice([100, 100, 100, 100, 200])
        us_values.append(f"  ({ui}, {sid}, 'L{level}')")

lines.append(",\n".join(us_values) + "\nON CONFLICT DO NOTHING;")
lines.append("")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write("\n".join(lines))

print(f"Generated {OUT}")
print(f"  Categories: {len(cat_entries)} ({sum(1 for e in cat_entries if e[3]==1)} roles, "
      f"{sum(1 for e in cat_entries if e[3]==2)} domains, "
      f"{sum(1 for e in cat_entries if e[3]==3)} subdomains)")
print(f"  Skills: {len(skill_entries)}")
print(f"  Demo users: {len(demo_users)}")
print(f"  User-skill entries: {len(us_values)}")
